/**
 * Sincronizare familie: conectare, push debounce, unire remote, jurnal, dispozitive.
 * Pozele bonurilor rămân pe telefon; pachetul trimis e fără imageData.
 * Sesiunea se reia singură la pornire din cheia păstrată în family-session (nu din parolă).
 */
import { decryptInWorker, encryptInWorker } from "@/lib/sync-worker-client";
import { keepConcurrentEdits, pushWithRetry, retryDelay } from "@/lib/sync-engine";
import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createEmptyAppData, isoToday, newId, type AppData } from "@/lib/finance-data";
import { checkFamilyPassword, legacyPasswordClosed } from "@/lib/family-password";
import { touchSyncDevice, revokeSyncDevice, restoreSyncDevice, isThisDeviceRevoked, listSyncDevices, getOrCreateDeviceId, claimSyncAdmin, isSyncAdmin } from "@/lib/sync-devices";
import { readSyncJournal, writeSyncJournal, type SyncJournalEntry } from "@/lib/app-storage";
import type { EncryptedEnvelope, FamilySecret, SyncBase } from "@/lib/family-crypto";
import { clearFamilySession, loadFamilySession, saveFamilySession } from "@/lib/family-session";
import { refreshRoomEntitlement, setActiveFamilyRoom } from "@/lib/billing";
import { createFamilyInvite, formatInvite, parseInvite, type FamilyInvite } from "@/lib/family-invite";
import { addSelfMember, chooseSelfMember, claimOwnMember, needsSelfChoice, selfMemberIdOf } from "@/lib/member-identity";
import { safeSetItem } from "@/lib/safe-storage";
import { t } from "@/lib/i18n";
import { isOfflineOnly } from "@/lib/ui-prefs";
import type { SyncPanelProps } from "@/pages/home-kit";
import { askConfirm } from "@/lib/confirm-dialog";

const loadFamilySync = () => import("@/lib/realtime-sync");
/** Ce era în cameră la ultima sincronizare (vezi `SyncBase`): ține conflictele doar pentru schimbări pe ambele telefoane. */
const SYNC_BASE_KEY = "buget-familie:sync-base-v1";
type StoredBase = { roomId: string; base: SyncBase };
const readSyncBase = (roomId: string): SyncBase | undefined => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SYNC_BASE_KEY) || "null") as StoredBase | null;
    return stored && stored.roomId === roomId ? stored.base : undefined;
  } catch { return undefined; }
};
const writeSyncBase = (roomId: string, base: SyncBase) => {
  try { window.localStorage.setItem(SYNC_BASE_KEY, JSON.stringify({ roomId, base })); } catch { /* fără loc: rămâne comportamentul vechi, cu conflicte */ }
};
const loadFamilyCrypto = () => import("@/lib/family-crypto");
const loadFamilyRecovery = () => import("@/lib/family-recovery");

/** Omul a închis singur sesiunea: nu o reluăm și nu-l certăm cu bannerul „sync oprit”. */
const CLOSED_KEY = "buget-familie:sync-closed";
const readClosed = () => { try { return window.localStorage.getItem(CLOSED_KEY) === "1"; } catch { return false; } };
const writeClosed = (closed: boolean) => {
  try {
    if (closed) safeSetItem(window.localStorage, CLOSED_KEY, "1");
    else window.localStorage.removeItem(CLOSED_KEY);
  } catch { /* stocare blocată: bannerul poate apărea, nimic mai grav */ }
};

/** Serializare fără poze — același format pentru localStorage și push familie. */

/** Pe Android aplicația are stocarea ei; pe web originea e comună, deci codul invitației nu se păstrează (S5). */
const keepInviteOnDevice = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

export const syncPortable = (value: AppData) =>
  JSON.stringify({
    ...value,
    receipts: value.receipts.map(({ imageData: _one, imageData2: _two, imageKeys: _keys, ...rest }) => rest),
  });

export function useFamilySync(
  data: AppData,
  setData: Dispatch<SetStateAction<AppData>>,
  /** Registrul s-a încărcat din stocare; până atunci reluarea ar uni camera cu un registru gol. */
  storageReady = true,
) {
  const [syncPassword, setSyncPassword] = useState("");
  const [syncPasswordReveal, setSyncPasswordReveal] = useState("");
  const [syncRecoveryReveal, setSyncRecoveryReveal] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncConnected, setSyncConnected] = useState(false);
  const [syncLastSync, setSyncLastSync] = useState("");
  /** Încercarea de reluare automată s-a terminat (reușită sau nu); până atunci nu arătăm „oprit”. */
  const [syncResumeSettled, setSyncResumeSettled] = useState(false);
  const [syncHasSession, setSyncHasSession] = useState(false);
  /** Codul invitației camerei curente; lipsește la camerele vechi, cu parolă. */
  const [syncInvite, setSyncInvite] = useState("");
  const [syncInviteRoom, setSyncInviteRoom] = useState(false);
  /** Invitație primită prin link, pusă deja în câmp ca omul doar să confirme. */
  const [syncInviteDraft, setSyncInviteDraft] = useState("");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  const [syncJournal, setSyncJournal] = useState<SyncJournalEntry[]>(readSyncJournal);

  const syncDataRef = useRef(data);
  /** Intrarea cu codul de recuperare face telefonul administrator (cel vechi s-a pierdut). */
  const syncClaimAdminRef = useRef(false);
  syncDataRef.current = data;
  const syncPasswordRef = useRef(syncPassword);
  syncPasswordRef.current = syncPassword;
  /** Cu ce se criptează: cheia PBKDF2 neexportabilă (sau parola, dacă stocarea cheii lipsește). */
  const syncSecretRef = useRef<FamilySecret>("");
  const syncResumeTriedRef = useRef(false);
  /** Reluarea eșuată din lipsă de rețea se reîncearcă singură, nu rămâne oprită până la repornire. */
  const syncResumeFailuresRef = useRef(0);
  const [syncResumeTick, setSyncResumeTick] = useState(0);
  const syncRoomIdRef = useRef<string | undefined>(undefined);
  const syncUnsubscribeRef = useRef<(() => void) | undefined>(undefined);
  /** Ultima stare trimisă în cameră (sau identică cu ea): până la ea nu e nimic de trimis. */
  const syncLastPortableRef = useRef("");
  const syncPushTimerRef = useRef<number | undefined>(undefined);
  /** Pachetele primite și trimiterile rulează pe rând: altfel un pachet vechi terminat ultimul întoarce starea. */
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const syncEnqueue = (job: () => Promise<void>) => {
    const next = syncQueueRef.current.then(job, job);
    syncQueueRef.current = next.catch(() => undefined);
    return next;
  };
  /** IV-ul ultimului pachet văzut (trimis de noi sau deja unit): ecoul propriei scrieri nu se mai decriptează. */
  const syncLastIvRef = useRef("");
  /** După o trimitere eșuată reîncercăm singuri: 5 s, 30 s, apoi la 2 minute. */
  const [syncRetryTick, setSyncRetryTick] = useState(0);
  const syncFailuresRef = useRef(0);
  const syncRetryTimerRef = useRef<number | undefined>(undefined);

  const syncAppendJournal = (entry: Omit<SyncJournalEntry, "id">) =>
    setSyncJournal((current) => {
      const next = [{ ...entry, id: newId("sync-log") }, ...current].slice(0, 40);
      writeSyncJournal(next);
      return next;
    });

  const syncRetainLocalReceiptImages = (value: AppData): AppData => ({
    ...value,
    receipts: value.receipts.map((receipt) => {
      const local = syncDataRef.current.receipts.find((item) => item.id === receipt.id);
      return { ...receipt, imageData: local?.imageData, imageData2: local?.imageData2, imageKeys: local?.imageKeys };
    }),
  });

  const markRecoveryIssued = (value: AppData): AppData => ({
    ...value,
    settings: { ...value.settings, syncRecoveryIssuedAt: value.settings.syncRecoveryIssuedAt || new Date().toISOString() },
  });

  const issueRecoveryIfNeeded = async (current: AppData, password: string, force: boolean) => {
    if (!force && current.settings.syncRecoveryIssuedAt) return { data: current };
    const recovery = await loadFamilyRecovery();
    const code = recovery.generateRecoveryCode();
    const wrap = await recovery.wrapFamilyPassword(password, code);
    const lookupId = await recovery.deriveRecoveryLookupId(code);
    try {
      const syncApi = await loadFamilySync();
      await syncApi.pushRecoveryWrap(lookupId, wrap);
    } catch {
      return {
        data: current,
        warning: t("Codul de recuperare nu a putut fi salvat. Lipește regulile noi în Firebase Console (familyRecovery), apoi apasă din nou „Creează cod de recuperare”."),
      };
    }
    return { code, data: markRecoveryIssued(current) };
  };

  const recoverWithCode = async (code: string) => {
    if (isOfflineOnly()) {
      setSyncNotice(t("Modul „doar offline” este activ. Dezactivează-l din Setări ca să folosești Sync."));
      return;
    }
    setSyncBusy(true);
    try {
      const recovery = await loadFamilyRecovery();
      const lookupId = await recovery.deriveRecoveryLookupId(code);
      const syncApi = await loadFamilySync();
      const wrap = await syncApi.fetchRecoveryWrap(lookupId);
      if (!wrap) {
        setSyncNotice(t("Nu am găsit acest cod de recuperare. Verifică-l sau folosește un backup din Setări."));
        return;
      }
      const password = await recovery.unwrapFamilyPassword(wrap, code);
      if (parseInvite(password)) {
        // Camerele cu invitație păstrează codul invitației în spatele codului de recuperare.
        setSyncInviteDraft(password);
        syncClaimAdminRef.current = true;
        setSyncNotice(t("Am găsit invitația familiei. Apasă „Intră în familie”."));
        return;
      }
      setSyncPassword(password);
      setSyncPasswordReveal(password);
      setSyncNotice(t("Am găsit parola. Noteaz-o, apoi conectează acest telefon."));
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : t("Codul de recuperare e greșit sau pachetul nu poate fi decriptat."));
    } finally {
      setSyncBusy(false);
    }
  };

  const syncDisconnect = () => {
    setActiveFamilyRoom(undefined);
    syncUnsubscribeRef.current?.();
    syncUnsubscribeRef.current = undefined;
    syncRoomIdRef.current = undefined;
    syncSecretRef.current = "";
    window.clearTimeout(syncPushTimerRef.current);
    window.clearTimeout(syncRetryTimerRef.current);
    syncLastIvRef.current = "";
    setSyncConnected(false);
    setSyncPassword("");
    setSyncInvite("");
    setSyncHasSession(false);
    writeClosed(true);
    void clearFamilySession();
    setSyncNotice(t("Sesiunea a fost închisă pe acest telefon."));
  };

  /** Camera veche, cu parolă, a fost golită după mutarea familiei pe invitație. */
  const syncStopMovedRoom = () => {
    setActiveFamilyRoom(undefined);
    syncUnsubscribeRef.current?.();
    syncUnsubscribeRef.current = undefined;
    syncRoomIdRef.current = undefined;
    syncSecretRef.current = "";
    window.clearTimeout(syncPushTimerRef.current);
    window.clearTimeout(syncRetryTimerRef.current);
    syncLastIvRef.current = "";
    setSyncConnected(false);
    // S4: sesiunea nu se mai șterge singură. Un pachet „mutat” poate veni și de la un telefon
    // revocat, care încă are cheia; ștergerea lăsa toată familia fără cameră. Invitația nouă
    // o înlocuiește oricum, iar până atunci telefonul doar stă oprit.
    setSyncNotice(t("Familia s-a mutat într-o cameră nouă, cu invitație. Cere invitația de pe telefonul care a mutat-o și lipește-o la „Am primit o invitație”. Datele de pe acest telefon rămân și se unesc la intrare."));
  };

  const syncHandleRemoteEnvelope = (envelope: EncryptedEnvelope) => syncEnqueue(async () => {
    if (!syncSecretRef.current || envelope.iv === syncLastIvRef.current) return;
    try {
      const crypto = await loadFamilyCrypto();
      const remoteData = await decryptInWorker(envelope, syncSecretRef.current);
      if (remoteData.settings.syncRoomMovedAt) {
        syncStopMovedRoom();
        return;
      }
      syncLastIvRef.current = envelope.iv;
      const roomForBase = syncRoomIdRef.current || "";
      const local = syncDataRef.current;
      /** Schimbări de aici încă netrimise: după unire trebuie să plece, deci nu marcăm rezultatul ca trimis. */
      const localPending = syncPortable(local) !== syncLastPortableRef.current;
      const base = readSyncBase(roomForBase);
      const merged = syncRetainLocalReceiptImages(crypto.mergeFamilyData(local, remoteData, base));
      writeSyncBase(roomForBase, crypto.syncBaseOf(remoteData));
      const mergedPortable = syncPortable(merged);
      if (mergedPortable === syncPortable(local)) {
        setSyncLastSync(new Date().toISOString());
        return;
      }
      const previous = local;
      if (isThisDeviceRevoked(merged)) {
        setData(merged);
        syncDisconnect();
        setSyncNotice(t("Acest telefon a fost revocat din cameră. Pe un telefon rămas în familie, apasă Reactivează, sau intră din nou cu invitația la „Am primit o invitație”."));
        return;
      }
      if (!localPending) syncLastPortableRef.current = mergedPortable;
      // O schimbare făcută aici chiar acum (încă neajunsă în ref) se unește și ea, nu se pierde.
      setData((current) => current === local ? merged : syncRetainLocalReceiptImages(crypto.mergeFamilyData(current, remoteData, base)));
      setSyncLastSync(new Date().toISOString());
      void import("@/lib/local-notifications").then(({ notifyFamilyExpenses }) => notifyFamilyExpenses(previous, merged)).catch(() => undefined);
      syncAppendJournal({
        createdAt: new Date().toISOString(),
        status: "resolved",
        message: t("Actualizare primită de la un alt telefon conectat."),
        action: t("Datele au fost reunite automat prin ID și marcaj de actualizare."),
      });
    } catch (error) {
      syncAppendJournal({
        createdAt: new Date().toISOString(),
        status: "failed",
        message: error instanceof Error ? error.message : "Pachetul primit nu a putut fi decriptat.",
        action: t("Verifică să fie exact aceeași parolă pe toate telefoanele."),
      });
      setSyncNotice(error instanceof Error ? error.message : "Un pachet primit nu a putut fi decriptat.");
    }
  });

  /**
   * Intră în cameră: unește pachetul existent, își ia membrul propriu la prima intrare,
   * trimite și ascultă. `password` lipsește la reluarea automată (parola nu e păstrată).
   */
  const syncOpenRoom = async (roomId: string, secret: FamilySecret, options: { password?: string; invite?: string; inviteRoom?: boolean; mode: "create" | "join" | "resume" }) => {
    const crypto = await loadFamilyCrypto();
    const syncApi = await loadFamilySync();
    let prepared: AppData | undefined;
    let recovery: Awaited<ReturnType<typeof issueRecoveryIfNeeded>> | { data: AppData } = { data: syncDataRef.current };
    // Scrierea cere ca documentul să fie tot cel citit: dacă partenerul a scris între timp, citim și unim din nou.
    for (let attempt = 1; ; attempt += 1) {
      const remoteEnvelope = await syncApi.fetchFamilyEnvelope(roomId);
      let merged = prepared || syncDataRef.current;
      if (!remoteEnvelope && options.mode === "join") {
        // Nu facem camere noi din parolă sau dintr-o invitație greșită: ar fi o cameră goală, separată de familie.
        setSyncNotice(options.invite
          ? t("Nu am găsit camera din această invitație. Verifică să fi copiat tot codul sau cere o invitație nouă.")
          : t("Nu există nicio cameră cu această parolă. Camerele noi se fac cu „Creează camera”, iar partenerul intră cu invitația."));
        return false;
      }
      const mergedFrom = merged;
      let openBase: ReturnType<typeof readSyncBase> = undefined;
      if (remoteEnvelope) {
        const remoteData = await decryptInWorker(remoteEnvelope, secret);
        openBase = readSyncBase(roomId);
        if (remoteData.settings.syncRoomMovedAt) {
          syncStopMovedRoom();
          // Invitația veche, după „Mută familia”: spunem limpede ce se poate face.
          if (options.mode === "join") setSyncNotice(t("Invitația aceasta e veche: camera ei a fost închisă când familia s-a mutat. Cere invitația nouă de pe telefonul încă conectat. Dacă niciun telefon nu mai e conectat, apasă „Creează camera” aici: datele de pe acest telefon rămân, iar celălalt telefon intră cu invitația nouă și își unește datele."));
          return false;
        }
        const own = claimOwnMember(merged, remoteData, getOrCreateDeviceId());
        merged = syncRetainLocalReceiptImages(crypto.mergeFamilyData(own, remoteData, openBase));
        // Ce am unit conține deja camera: la o nouă încercare, strămoșul comun e pachetul acesta.
        writeSyncBase(roomId, crypto.syncBaseOf(remoteData));
      }
      if (!prepared) {
        // Cine intră cu invitația are oricum cheia: un telefon revocat se poate întoarce așa.
        if (options.mode !== "resume" && isThisDeviceRevoked(merged)) merged = restoreSyncDevice(merged, getOrCreateDeviceId());
        if (isThisDeviceRevoked(merged)) {
          setData(merged);
          await clearFamilySession();
          setSyncHasSession(false);
          setSyncNotice(t("Acest telefon a fost revocat din cameră. Pe un telefon rămas în familie, apasă Reactivează, sau intră din nou cu invitația la „Am primit o invitație”."));
          return false;
        }
        // O cameră nouă pornește cu lista goală: telefoanele vechi nu au cheia ei.
        if (options.mode === "create") merged = { ...merged, settings: { ...merged.settings, syncDevices: [] } };
        merged = touchSyncDevice(merged);
        // Cine creează camera e administratorul; camerele de dinainte îl primesc pe primul conectat.
        if (options.mode === "create" || !merged.settings.syncAdminDeviceId || (options.mode === "join" && syncClaimAdminRef.current)) {
          merged = claimSyncAdmin(merged);
          syncClaimAdminRef.current = false;
        }
        // Codul de recuperare încuie parola (camere vechi) sau codul invitației (camere noi).
        const recoverable = options.invite || options.password;
        recovery = recoverable ? await issueRecoveryIfNeeded(merged, recoverable, options.mode === "create") : { data: merged };
        merged = recovery.data;
      }
      prepared = merged;
      syncLastPortableRef.current = syncPortable(merged);
      // Ce s-a notat cât am decriptat nu se pierde: se unește peste rezultat.
      { const result = merged;
        setData((current) => keepConcurrentEdits(current, mergedFrom, result, (now, unit, snapshot) => syncRetainLocalReceiptImages(crypto.mergeFamilyData(now, unit, crypto.syncBaseOf(snapshot))))); }
      const envelope = await encryptInWorker(merged, secret);
      try {
        await syncApi.pushFamilyEnvelope(roomId, envelope, remoteEnvelope?.iv ?? null, (seq) => crypto.writeChainToken(secret, roomId, seq));
        syncLastIvRef.current = envelope.iv;
        break;
      } catch (error) {
        if (attempt >= 3 || !(error instanceof syncApi.RealtimeSyncError) || error.kind !== "conflict") throw error;
      }
    }
    writeSyncBase(roomId, crypto.syncBaseOf(prepared));
    syncRoomIdRef.current = roomId;
    syncSecretRef.current = secret;
    syncUnsubscribeRef.current?.();
    syncUnsubscribeRef.current = syncApi.subscribeFamilyRoom(
      roomId,
      (incoming) => { void syncHandleRemoteEnvelope(incoming); },
      (error) => setSyncNotice(error.message),
    );
    setSyncConnected(true);
    setActiveFamilyRoom(roomId);
    void refreshRoomEntitlement(roomId);
    setSyncInvite(options.invite || "");
    setSyncInviteRoom(Boolean(options.invite || options.inviteRoom));
    setSyncLastSync(new Date().toISOString());
    writeClosed(false);
    if ("code" in recovery && recovery.code) setSyncRecoveryReveal(recovery.code);
    setSyncNotice(
      // Camerele vechi, cu parolă, se pot ataca offline: la fiecare intrare cerem mutarea pe invitație.
      !options.invite && !options.inviteRoom && !("code" in recovery && recovery.code)
        ? t("Familia e încă într-o cameră cu parolă, mai ușor de ghicit. Apasă „Mută familia” ca să treceți pe invitație; datele rămân.")
        : ("warning" in recovery && recovery.warning)
        || ("code" in recovery && recovery.code
          ? t("Sesiunea e activă. Notează codul de recuperare pe hârtie — nu îl mai arătăm.")
          : t("Sesiunea familiei este activă. Actualizările apar automat pe toate telefoanele conectate, fără reîmprospătare manuală.")),
    );
    return true;
  };

  const syncConnect = async () => {
    if (isOfflineOnly()) {
      setSyncNotice(t("Modul „doar offline” este activ. Dezactivează-l din Setări ca să folosești Sync."));
      return;
    }
    if (legacyPasswordClosed(isoToday())) {
      setSyncNotice(t("Intrarea cu parolă s-a închis: parolele vechi se pot ghici. Cere unui telefon din familie să apese în Sync „Mută familia” și să-ți trimită invitația."));
      return;
    }
    const strength = checkFamilyPassword(syncPassword);
    if (!strength.ok) {
      setSyncNotice(`${strength.label}. ${strength.advice.join(" ")}`);
      return;
    }
    setSyncBusy(true);
    try {
      const crypto = await loadFamilyCrypto();
      const roomId = await crypto.deriveFamilyRoomId(syncPassword);
      const material = await crypto.importFamilyKeyMaterial(syncPassword);
      if (await syncOpenRoom(roomId, material, { password: syncPassword, mode: "join" })) {
        const saved = await saveFamilySession(roomId, material);
        setSyncHasSession(saved);
      }
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : t("Familia nu a putut fi conectată."));
    } finally {
      setSyncBusy(false);
    }
  };

  /** Intră într-o cameră cu invitație (nouă sau existentă) și ține minte sesiunea. */
  const syncEnterInvite = async (invite: FamilyInvite, mode: "create" | "join") => {
    const crypto = await loadFamilyCrypto();
    const code = formatInvite(invite);
    const material = await crypto.importFamilyKeyMaterial(invite.key);
    if (!(await syncOpenRoom(invite.roomId, material, { invite: code, mode }))) return false;
    setSyncHasSession(await saveFamilySession(invite.roomId, material, code, { keepInvite: keepInviteOnDevice() }));
    return true;
  };

  const syncGuarded = async (work: () => Promise<unknown>, failure: string) => {
    if (isOfflineOnly()) {
      setSyncNotice(t("Modul „doar offline” este activ. Dezactivează-l din Setări ca să folosești Sync."));
      return;
    }
    // Fără rețea spunem pe loc, nu după 40 de secunde de „Se conectează…”.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSyncNotice(t("Telefonul nu are internet acum. Încearcă din nou când are semnal; ce notezi rămâne pe telefon."));
      return;
    }
    setSyncBusy(true);
    try {
      await work();
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : failure);
    } finally {
      setSyncBusy(false);
    }
  };

  const syncCreateRoom = () => syncGuarded(async () => {
    if (await syncEnterInvite(createFamilyInvite(), "create")) {
      setSyncNotice(t("Camera familiei e gata. Trimite invitația partenerului și notează codul de recuperare."));
    }
  }, t("Camera familiei nu a putut fi creată."));

  const syncJoinInvite = (raw: string) => syncGuarded(async () => {
    const invite = parseInvite(raw);
    if (!invite) {
      setSyncNotice(t("Codul nu arată ca o invitație. Lipește tot mesajul primit sau tot linkul."));
      return;
    }
    /**
     * Invitația poate veni de la oricine: un link, un mesaj sau altă aplicație de pe telefon.
     * La intrare, tot registrul de pe telefon pleacă în camera aceea; întrebăm limpede înainte.
     */
    const current = syncDataRef.current;
    // Orice în afară de un registru literalmente gol pleacă în camera invitației: întrebăm mereu.
    const hasLocalData = current.transactions.length > 0 || current.debts.length > 0 || current.savings.length > 0 || current.recurring.length > 0 || current.receipts.length > 0
      || current.settings.salaryPlan.allocations.length > 0 || (current.settings.salaryPlan.incomes || []).length > 0 || current.settings.plannedEvents.length > 0
      || current.settings.members.length > 1 || current.settings.paymentSources.some((source) => source.openingBalance > 0);
    if (hasLocalData && !(await askConfirm(
      t("Tot ce e pe acest telefon (mișcări, plicuri, datorii) va fi trimis și văzut în camera din invitație. Intră doar dacă invitația e de la cineva din casa ta."),
      { title: t("Intri în această familie?"), confirmLabel: t("Da, intru") },
    ))) return;
    if (await syncEnterInvite(invite, "join")) setSyncInviteDraft("");
  }, t("Nu am putut intra în familie."));

  /**
   * Mută o familie dintr-o cameră cu parolă într-una cu invitație. Camera veche e
   * suprascrisă cu un pachet gol care spune doar „s-a mutat”, fără cheia nouă: cine
   * ghicește parola nu mai găsește nimic, iar celelalte telefoane se opresc și cer invitația.
   */
  const syncMoveToInvite = () => syncGuarded(async () => {
    const oldRoomId = syncRoomIdRef.current;
    const oldSecret = syncSecretRef.current;
    // Merge și de pe o cameră cu invitație: așa se schimbă o invitație ajunsă unde nu trebuia.
    if (!syncConnected || !oldRoomId || !oldSecret) return;
    if (!(await syncEnterInvite(createFamilyInvite(), "create"))) return;
    const crypto = await loadFamilyCrypto();
    const syncApi = await loadFamilySync();
    const movedAt = new Date().toISOString();
    const stub = { ...createEmptyAppData(), settings: { ...createEmptyAppData().settings, members: [], paymentSources: [], syncRoomMovedAt: movedAt } };
    await syncApi.pushFamilyEnvelope(oldRoomId, await crypto.encryptFamilyData(stub, oldSecret), undefined, (seq) => crypto.writeChainToken(oldSecret, oldRoomId, seq), { seal: true });
    setSyncNotice(t("Familia s-a mutat în camera nouă, iar camera veche a fost golită. Trimite invitația celorlalte telefoane: ele se opresc până o primesc."));
  }, t("Mutarea nu a reușit. Camera veche a rămas neatinsă."));

  /** Invitație venită prin link: o punem în câmp și deschidem Sync, fără să intrăm singuri. */
  const offerInvite = (raw: string) => {
    if (!parseInvite(raw)) return;
    setSyncInviteDraft(raw);
    setSyncNotice(t("Ai primit o invitație în familie. Verifică și apasă „Intră în familie”."));
  };

  /** Reluare la pornire: Android închide des aplicația, iar parola nu e păstrată. */
  useEffect(() => {
    if (syncResumeTriedRef.current || !online || !storageReady) return;
    syncResumeTriedRef.current = true;
    if (isOfflineOnly() || readClosed()) {
      setSyncResumeSettled(true);
      return;
    }
    void (async () => {
      const session = await loadFamilySession();
      if (!session) {
        setSyncResumeSettled(true);
        return;
      }
      setSyncHasSession(true);
      setSyncBusy(true);
      try {
        // Sesiunile web salvate înainte de S5 aveau codul invitației: îl scoatem din IndexedDB.
        if (session.invite && !keepInviteOnDevice()) await saveFamilySession(session.roomId, session.material, session.invite, { keepInvite: false });
        await syncOpenRoom(session.roomId, session.material, { invite: keepInviteOnDevice() ? session.invite : undefined, inviteRoom: Boolean(session.invite || session.inviteRoom), mode: "resume" });
      } catch (error) {
        const transient = (typeof navigator !== "undefined" && navigator.onLine === false)
          || (error instanceof Error && ((error as { kind?: string }).kind === "unavailable" || /network|fetch|timeout|unavailable|failed-precondition|deadline/i.test(error.message)));
        if (transient && syncResumeFailuresRef.current < 6) {
          syncResumeFailuresRef.current += 1;
          syncResumeTriedRef.current = false;
          setSyncNotice(t("Nu am putut ajunge la camera familiei. Încerc din nou singur."));
          window.setTimeout(() => setSyncResumeTick((value) => value + 1), retryDelay(syncResumeFailuresRef.current));
        } else {
          setSyncNotice(error instanceof Error ? error.message : t("Sincronizarea nu a putut fi reluată."));
        }
      } finally {
        setSyncBusy(false);
        setSyncResumeSettled(true);
      }
    })();
    // syncOpenRoom citește starea curentă prin ref-uri; reluarea rulează o dată, iar după o
    // cădere de rețea încă o dată, la revenirea rețelei sau după pauza de reîncercare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, storageReady, syncResumeTick]);

  useEffect(() => {
    if (!syncConnected || !syncRoomIdRef.current) return;
    if (!online) {
      setSyncNotice(t("Fără conexiune — modificările rămân pe telefon și se trimit la reconectare."));
      return;
    }
    const currentPortable = syncPortable(data);
    if (currentPortable === syncLastPortableRef.current) return;
    window.clearTimeout(syncPushTimerRef.current);
    syncPushTimerRef.current = window.setTimeout(() => {
      void syncEnqueue(async () => {
        if (!syncRoomIdRef.current || syncPortable(syncDataRef.current) === syncLastPortableRef.current) return;
        const pushedBefore = syncLastPortableRef.current;
        let mergedFrom: AppData | undefined;
        try {
          const crypto = await loadFamilyCrypto();
          const syncApi = await loadFamilySync();
          const roomId = syncRoomIdRef.current!;
          // Fetch+merge înainte de push; scrierea cere ca documentul să fie tot cel citit.
          // Dacă partenerul a scris între timp, citim din nou și unim (de cel mult 3 ori).
          const result = await pushWithRetry({
            current: () => syncDataRef.current,
            fetch: () => syncApi.fetchFamilyEnvelope(roomId),
            decrypt: (envelope) => decryptInWorker(envelope, syncSecretRef.current),
            merge: (local, remote) => { mergedFrom = local; return syncRetainLocalReceiptImages(crypto.mergeFamilyData(local, remote, readSyncBase(roomId))); },
            onRemoteMerged: (remote, merged, remoteIv) => {
              // Camera e acum în pachetul unit: la o nouă încercare, strămoșul comun e acesta.
              writeSyncBase(roomId, crypto.syncBaseOf(remote));
              syncLastIvRef.current = remoteIv;
              const mergedPortable = syncPortable(merged);
              if (mergedPortable !== syncPortable(syncDataRef.current)) {
                syncLastPortableRef.current = mergedPortable;
                // O cheltuială notată cât se decripta pachetul partenerului se unește și ea, nu se pierde.
                const from = mergedFrom;
                // Unire în 3 căi: ce s-a schimbat de la instantaneul unit (aici) + ce aduce pachetul unit.
                setData((current) => keepConcurrentEdits(current, from, merged, (now, unit, snapshot) => syncRetainLocalReceiptImages(crypto.mergeFamilyData(now, unit, crypto.syncBaseOf(snapshot)))));
              }
            },
            encrypt: (value) => encryptInWorker(value, syncSecretRef.current),
            write: (envelope, expectedIv) => syncApi.pushFamilyEnvelope(roomId, envelope, expectedIv, (seq) => crypto.writeChainToken(syncSecretRef.current!, roomId, seq)),
            isConflict: (error) => error instanceof syncApi.RealtimeSyncError && error.kind === "conflict",
          });
          if (result.status === "moved") {
            syncStopMovedRoom();
            return;
          }
          const toPush = result.data;
          const lastEnvelopeSize = result.size;
          syncLastIvRef.current = result.iv;
          writeSyncBase(roomId, crypto.syncBaseOf(toPush));
          syncLastPortableRef.current = syncPortable(toPush);
          syncFailuresRef.current = 0;
          setSyncLastSync(new Date().toISOString());
          const skew = Number(window.localStorage.getItem(syncApi.CLOCK_SKEW_KEY) || 0);
          // Un pachet ține cam 27.000 de mișcări (măsurat); avertizăm cu mult înainte de limită.
          const usage = lastEnvelopeSize / crypto.SYNC_ENVELOPE_LIMIT;
          setSyncNotice(usage > 0.7
            ? t("Registrul familiei ocupă {percent}% din spațiul de sincronizare. În Setări → Copii de siguranță, „Închide anul” mută anii încheiați într-o arhivă, fără să pierzi istoricul.", { percent: Math.round(usage * 100) })
            : Math.abs(skew) > 120_000
            ? t("Ceasul telefonului e cu aproximativ {minutes} minute {direction}. Pune ora automată din setările telefonului; altfel, la unire, schimbările de aici pot câștiga sau pierde pe nedrept.", { minutes: Math.round(Math.abs(skew) / 60_000), direction: skew > 0 ? t("înainte") : t("în urmă") })
            : t("Sesiunea familiei este activă. Actualizările apar automat pe toate telefoanele conectate, fără reîmprospătare manuală."));
        } catch (error) {
          // Nimic nu a plecat: starea rămâne „de trimis” și reîncercăm singuri, fără să aștepte o nouă editare.
          syncLastPortableRef.current = pushedBefore;
          const delay = retryDelay(syncFailuresRef.current);
          syncFailuresRef.current += 1;
          window.clearTimeout(syncRetryTimerRef.current);
          syncRetryTimerRef.current = window.setTimeout(() => setSyncRetryTick((tick) => tick + 1), delay);
          setSyncNotice(error instanceof Error ? error.message : t("Actualizarea nu a putut fi trimisă."));
        }
      });
    }, 800);
    return () => window.clearTimeout(syncPushTimerRef.current);
  }, [data, setData, syncConnected, online, syncRetryTick]);

  useEffect(() => () => syncUnsubscribeRef.current?.(), []);

  const thisDevice = (data.settings.syncDevices || []).find((device) => device.id === getOrCreateDeviceId());
  /** Telefonul a fost în cameră și nu a ieșit singur, dar acum nu primește nimic. */
  const syncStopped = online && syncResumeSettled && !syncConnected && !syncBusy && !isOfflineOnly()
    && !readClosed() && (syncHasSession || Boolean(thisDevice && !thisDevice.revokedAt));

  const syncPanelProps: SyncPanelProps = {
    connected: syncConnected,
    stopped: syncStopped,
    sessionRemembered: syncHasSession,
    invite: syncInvite,
    inviteRoom: syncInviteRoom,
    inviteDraft: syncInviteDraft,
    setInviteDraft: setSyncInviteDraft,
    onCreateRoom: () => void syncCreateRoom(),
    onJoinInvite: (raw: string) => void syncJoinInvite(raw),
    onMoveToInvite: () => { if (isSyncAdmin(data)) void syncMoveToInvite(); },
    isAdmin: isSyncAdmin(data),
    adminDeviceId: data.settings.syncAdminDeviceId,
    onMakeAdmin: async (deviceId: string) => {
      if (!isSyncAdmin(data)) return;
      if (!(await askConfirm(t("Celălalt telefon devine administrator: doar el va trimite invitații și va scoate telefoane. Tu nu mai poți face asta până nu îți dă rolul înapoi."), { title: t("Schimbi administratorul?"), confirmLabel: t("Da, schimbă") }))) return;
      setData((current) => claimSyncAdmin(current, deviceId));
      setSyncNotice(t("Administratorul s-a schimbat. Se propagă la următoarea sincronizare."));
    },
    members: data.settings.members,
    selfMemberId: selfMemberIdOf(data),
    needsSelfChoice: needsSelfChoice(data),
    onChooseSelf: (memberId: string) => setData((current) => chooseSelfMember(current, memberId)),
    onAddSelf: (name: string) => setData((current) => addSelfMember(current, name)),
    busy: syncBusy,
    online,
    password: syncPassword,
    setPassword: setSyncPassword,
    passwordRevealOnce: syncPasswordReveal || undefined,
    clearPasswordReveal: () => setSyncPasswordReveal(""),
    recoveryRevealOnce: syncRecoveryReveal || undefined,
    clearRecoveryReveal: () => setSyncRecoveryReveal(""),
    recoveryIssued: Boolean(data.settings.syncRecoveryIssuedAt),
    onRecoverPassword: (code: string) => void recoverWithCode(code),
    onIssueRecovery: () => {
      void (async () => {
        if (!syncConnected) {
          setSyncNotice(t("Conectează mai întâi acest telefon, apoi creează codul de recuperare."));
          return;
        }
        if (!syncPasswordRef.current) {
          setSyncNotice(t("Sesiunea s-a reluat fără parolă, care nu se păstrează pe telefon. Pentru un cod nou, închide sesiunea și conectează-te din nou cu parola."));
          return;
        }
        if (data.settings.syncRecoveryIssuedAt) {
          const confirmed = await askConfirm(
            t("Codul vechi rămâne valabil. Notează-l pe cel nou imediat — nu îl mai arătăm."),
          );
          if (!confirmed) return;
        }
        setSyncBusy(true);
        try {
          const result = await issueRecoveryIfNeeded(syncDataRef.current, syncPasswordRef.current, true);
          setData(result.data);
          if (result.code) {
            setSyncRecoveryReveal(result.code);
            setSyncNotice(t("Sesiunea e activă. Notează codul de recuperare pe hârtie — nu îl mai arătăm."));
          } else if (result.warning) {
            setSyncNotice(result.warning);
          }
        } finally {
          setSyncBusy(false);
        }
      })();
    },
    notice: syncNotice,
    lastSync: syncLastSync,
    journal: syncJournal,
    devices: listSyncDevices(data),
    thisDeviceId: getOrCreateDeviceId(),
    onConnect: () => void syncConnect(),
    onDisconnect: syncDisconnect,
    onClearJournal: () => {
      setSyncJournal([]);
      writeSyncJournal([]);
    },
    onRevokeDevice: async (deviceId: string) => {
      if (!isSyncAdmin(data)) return;
      if (deviceId === getOrCreateDeviceId()) {
        const confirmed = await askConfirm(
          t("Ieși din cameră pe acest telefon. Ca să revii, un alt telefon trebuie să te reactiveze sau să-ți trimită o invitație nouă."),
        );
        if (!confirmed) return;
      }
      const next = revokeSyncDevice(data, deviceId);
      setData(next);
      if (deviceId === getOrCreateDeviceId()) {
        syncDisconnect();
        setSyncNotice(t("Ai revocat acest telefon. Sesiunea s-a închis."));
      } else {
        setSyncNotice(t("Dispozitivul a fost marcat ca revocat. Se propagă la următoarea sincronizare."));
        // S4: semnul de revocare nu ia cheia de pe telefonul acela. Doar o invitație nouă îl scoate de tot.
        if (await askConfirm(t("Telefonul revocat are încă cheia familiei. Mut familia acum pe o invitație nouă? Celelalte telefoane intră din nou cu ea; datele nu se pierd."))) void syncMoveToInvite();
      }
    },
    onRestoreDevice: (deviceId: string) => {
      if (!isSyncAdmin(data)) return;
      const next = restoreSyncDevice(data, deviceId);
      setData(next);
      setSyncNotice(t("Dispozitivul poate intra din nou. Se propagă la următoarea sincronizare."));
    },
  };

  return {
    syncPanelProps,
    offerInvite,
    setSyncPassword,
    setSyncPasswordReveal,
    syncPortable,
  };
}
