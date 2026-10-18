import { t } from "./i18n";
/**
 * Sincronizare în timp real a familiei, fără token generat de fiecare utilizator.
 * Toate telefoanele care instalează aplicația împart același proiect Firebase
 * (configurat o singură dată de administrator în firebase-config.ts); fiecare
 * familie primește propria "cameră" izolată: cu ID aleator și invitație (family-invite.ts),
 * sau, la camerele vechi, dedusă din parola ei de familie.
 * Firestore nu vede niciodată datele în clar — doar pachetul AES-GCM criptat local.
 *
 * Mod „doar offline” (ui-prefs): nu inițializează Firebase — sync rămâne local.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, signInAnonymously, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, onSnapshot, runTransaction, serverTimestamp, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import { appCheckDebug, firebaseConfig, isFirebaseConfigured, recaptchaSiteKey } from "@/lib/firebase-config";
import type { EncryptedEnvelope } from "@/lib/family-crypto";
import { deriveFamilyRoomId, sha256Hex } from "@/lib/family-crypto";
import { isOfflineOnly } from "@/lib/ui-prefs";

export { deriveFamilyRoomId };

export class RealtimeSyncError extends Error {
  constructor(public readonly kind: "not-configured" | "unavailable" | "offline-only" | "conflict", message: string) { super(message); }
}

let app: FirebaseApp | undefined;
let firestore: Firestore | undefined;
let appCheck: AppCheck | undefined;
let auth: Auth | undefined;
let signingIn: Promise<string | null> | undefined;
let signInFailedAt = 0;

const firebaseApp = () => (app = app || initializeApp(firebaseConfig));

function ensureAppCheck(firebaseApp: FirebaseApp) {
  if (appCheck) return;
  if (!recaptchaSiteKey) return; // fără cheie: sync merge; Enforce NU trebuie activat în Console
  if (appCheckDebug && typeof self !== "undefined") {
    const existing = (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN;
    if (existing === undefined) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
  }
  appCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

/**
 * Doar pentru testul cap-coadă al sincronizării (e2e/sync.e2e.mjs): `VITE_FIRESTORE_EMULATOR=127.0.0.1:8080`
 * leagă aplicația de emulatorul local. În build-urile publicate variabila lipsește.
 */
const emulatorHost = typeof import.meta !== "undefined" ? String(import.meta.env?.VITE_FIRESTORE_EMULATOR || "").trim() : "";
const authEmulatorHost = typeof import.meta !== "undefined" ? String(import.meta.env?.VITE_AUTH_EMULATOR || "").trim() : "";

const SIGN_IN_RETRY_MS = 60_000;
const SIGN_IN_WAIT_MS = 6_000;

/**
 * Identitate anonimă a telefonului (Firebase Auth, fără cont, fără date personale).
 * Regulile Firestore o pot cere pe camerele familiei (firestore.auth.rules), iar funcțiile
 * numără cererile pe telefon, nu pe IP-ul rețelei mobile. Dacă nu merge — furnizorul
 * anonim oprit în consolă, fără rețea la prima pornire — sincronizarea continuă ca înainte
 * și reîncercăm peste un minut.
 */
export function ensureSignedIn(): Promise<string | null> {
  if (isOfflineOnly() || !isFirebaseConfigured) return Promise.resolve(null);
  if (signingIn) return signingIn;
  if (signInFailedAt && Date.now() - signInFailedAt < SIGN_IN_RETRY_MS) return Promise.resolve(null);
  signingIn = (async () => {
    try {
      if (!auth) {
        auth = initializeAuth(firebaseApp(), { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
        if (authEmulatorHost) connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
      }
      await auth.authStateReady();
      const uid = auth.currentUser?.uid || (await signInAnonymously(auth)).user.uid;
      signInFailedAt = 0;
      return uid;
    } catch {
      signingIn = undefined;
      signInFailedAt = Date.now();
      return null;
    }
  })();
  return signingIn;
}

/** Așteaptă identitatea cel mult câteva secunde; fără ea, cererea pleacă oricum. */
const signedInOrTimeout = () => Promise.race([
  ensureSignedIn(),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), SIGN_IN_WAIT_MS)),
]);

/** Antet `Authorization` pentru funcții (ghidul online, feedback), dacă telefonul are identitate. */
export async function authHeader(): Promise<string | undefined> {
  if (!(await signedInOrTimeout()) || !auth?.currentUser) return undefined;
  try {
    return `Bearer ${await auth.currentUser.getIdToken()}`;
  } catch {
    return undefined;
  }
}

/**
 * Pentru scanare: identitatea e obligatorie. Uită o încercare eșuată recent, așteaptă
 * autentificarea anonimă cel mult `waitMs` și cere un token proaspăt (forțat la nevoie).
 */
export async function freshAuthHeader(force = false, waitMs = 12_000): Promise<string | undefined> {
  signInFailedAt = 0;
  const uid = await Promise.race([ensureSignedIn(), new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs))]);
  if (!uid || !auth?.currentUser) return undefined;
  try {
    return `Bearer ${await auth.currentUser.getIdToken(force)}`;
  } catch {
    return undefined;
  }
}

function db(): Firestore {
  if (isOfflineOnly()) {
    throw new RealtimeSyncError("offline-only", "Modul „doar offline” este activ — sincronizarea cloud este oprită pe acest telefon.");
  }
  if (!isFirebaseConfigured) throw new RealtimeSyncError("not-configured", t("Sincronizarea nu a fost încă configurată de administratorul aplicației."));
  if (!firestore) {
    const firebase = firebaseApp();
    void ensureSignedIn();
    if (emulatorHost) {
      firestore = getFirestore(firebase);
      const [host, port] = emulatorHost.split(":");
      connectFirestoreEmulator(firestore, host, Number(port) || 8080);
      return firestore;
    }
    ensureAppCheck(firebase);
    firestore = getFirestore(firebase);
  }
  return firestore;
}

export async function appCheckHeader(): Promise<string | undefined> {
  if (isOfflineOnly() || !isFirebaseConfigured || !recaptchaSiteKey) return undefined;
  try {
    ensureAppCheck(firebaseApp());
    if (!appCheck) return undefined;
    const { getToken } = await import("firebase/app-check");
    const result = await getToken(appCheck, false);
    return result.token || undefined;
  } catch {
    return undefined;
  }
}
const roomRef = (roomId: string) => doc(db(), "familySync", roomId);
const recoveryRef = (recoveryId: string) => doc(db(), "familyRecovery", recoveryId);

export async function fetchFamilyEnvelope(roomId: string): Promise<EncryptedEnvelope | null> {
  try {
    await signedInOrTimeout();
    const snapshot = await getDoc(roomRef(roomId));
    return snapshot.exists() ? (snapshot.data().envelope as EncryptedEnvelope) : null;
  } catch (error) {
    if (error instanceof RealtimeSyncError) throw error;
    throw new RealtimeSyncError("unavailable", "Serviciul de sincronizare este temporar indisponibil.");
  }
}

/**
 * Cu `expectedIv`, scrierea trece doar dacă documentul e tot cel citit înainte de unire (iv-ul
 * pachetului e unic la fiecare scriere). Altfel partenerul a scris între timp: `conflict`, iar
 * apelantul citește din nou, unește și reîncearcă, în loc să-i suprascrie scrierea.
 *
 * Cu `token`, scrierea poartă și lanțul camerei (vezi `writeChainToken`): dezvăluie tokenul
 * angajat de scrierea precedentă și angajează următorul. Cât timp regulile publicate sunt cele
 * vechi (care refuză câmpuri noi), un document fără lanț se scrie ca înainte.
 *
 * Cu `seal`, camera se sigilează (pachetul „s-a mutat”): regulile nu mai primesc nicio scriere în ea.
 */
export async function pushFamilyEnvelope(roomId: string, envelope: EncryptedEnvelope, expectedIv?: string | null, token?: (seq: number) => Promise<string>, options: { seal?: boolean } = {}): Promise<void> {
  try {
    await signedInOrTimeout();
    const ref = roomRef(roomId);
    let hadChain = false;
    const write = (withChain: boolean) => runTransaction(db(), async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists() ? snapshot.data() : undefined;
      const currentIv = (current?.envelope as EncryptedEnvelope | undefined)?.iv ?? null;
      if (expectedIv !== undefined && currentIv !== expectedIv) throw new RealtimeSyncError("conflict", t("Familia a trimis între timp o schimbare; o unim și reîncercăm."));
      hadChain = typeof current?.commit === "string";
      let chain: Record<string, unknown> = {};
      if (withChain && token) {
        const seq = hadChain ? Number(current!.seq) + 1 : 1;
        const reveal = hadChain ? await token(Number(current!.seq)) : undefined;
        if (reveal && (await sha256Hex(reveal)) !== current!.commit) throw new RealtimeSyncError("unavailable", t("Camera familiei a fost scrisă de un telefon fără cheia familiei. Mută familia pe o invitație nouă din Sync."));
        // Sigiliul merge doar cu lanțul: regulile vechi, fără lanț, nu-l cunosc.
        chain = { seq, commit: await sha256Hex(await token(seq)), ...(reveal ? { reveal } : {}), ...(options.seal ? { sealedAt: serverTimestamp() } : {}) };
      }
      transaction.set(ref, { envelope, updatedAt: serverTimestamp(), ...chain });
    });
    try {
      await write(true);
    } catch (error) {
      const denied = (error as { code?: string } | undefined)?.code === "permission-denied";
      // Reguli vechi: câmpurile lanțului nu sunt încă permise; scriem ca înainte.
      if (token && denied && !hadChain) await write(false);
      // Reguli noi, lanț existent: alt telefon a scris între timp; se citește din nou.
      else if (token && denied && hadChain) throw new RealtimeSyncError("conflict", t("Familia a trimis între timp o schimbare; o unim și reîncercăm."));
      else throw error;
    }
    void measureClockSkew(ref);
  } catch (error) {
    if (error instanceof RealtimeSyncError) throw error;
    throw new RealtimeSyncError("unavailable", t("Actualizarea nu a putut fi trimisă către serviciul de sincronizare."));
  }
}

export const CLOCK_SKEW_KEY = "buget-familie:clock-skew-ms";
let skewMeasured = false;
/**
 * O dată pe sesiune: ora serverului din ultima noastră scriere față de ceasul telefonului.
 * Unirea compară marcaje scrise cu ceasul telefonului, deci un ceas dat înainte sau înapoi
 * câștigă sau pierde mereu; aplicația spune asta în Sync, ca omul să pună ora automată.
 */
async function measureClockSkew(ref: ReturnType<typeof roomRef>) {
  if (skewMeasured) return;
  skewMeasured = true;
  try {
    const localNow = Date.now();
    const snapshot = await getDoc(ref);
    const server = (snapshot.data()?.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.();
    if (typeof server === "number") window.localStorage.setItem(CLOCK_SKEW_KEY, String(Math.round(localNow - server)));
  } catch { /* măsurarea e doar un semnal */ }
}

export async function fetchRecoveryWrap(recoveryId: string): Promise<EncryptedEnvelope | null> {
  try {
    await signedInOrTimeout();
    const snapshot = await getDoc(recoveryRef(recoveryId));
    return snapshot.exists() ? (snapshot.data().envelope as EncryptedEnvelope) : null;
  } catch (error) {
    if (error instanceof RealtimeSyncError) throw error;
    throw new RealtimeSyncError("unavailable", "Serviciul de recuperare este temporar indisponibil.");
  }
}

export async function pushRecoveryWrap(recoveryId: string, envelope: EncryptedEnvelope): Promise<void> {
  try {
    await signedInOrTimeout();
    await setDoc(recoveryRef(recoveryId), { envelope, updatedAt: serverTimestamp() });
  } catch (error) {
    if (error instanceof RealtimeSyncError) throw error;
    throw new RealtimeSyncError("unavailable", "Codul de recuperare nu a putut fi salvat.");
  }
}

/** Ascultă actualizări live ale familiei; ignoră ecoul propriei scrieri via `hasPendingWrites`. */
export function subscribeFamilyRoom(roomId: string, onEnvelope: (envelope: EncryptedEnvelope) => void, onError: (error: Error) => void): Unsubscribe {
  const ref = roomRef(roomId); // aruncă imediat dacă sync e oprit sau neconfigurat, ca înainte
  let stop: Unsubscribe | undefined;
  let cancelled = false;
  void signedInOrTimeout().then(() => {
    if (cancelled) return;
    stop = onSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.hasPendingWrites || !snapshot.exists()) return;
      const envelope = snapshot.data().envelope as EncryptedEnvelope | undefined;
      if (envelope) onEnvelope(envelope);
    }, (error) => onError(error instanceof RealtimeSyncError ? error : new RealtimeSyncError("unavailable", t("Conexiunea live cu serviciul de sincronizare a fost întreruptă."))));
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

/**
 * Abonamentul Familia legat de cameră, scris doar de server (funcția verifyPlayPurchase),
 * ca partenerul să primească beneficiul fără să cumpere separat.
 */
export async function fetchFamilyEntitlement(roomId: string): Promise<{ expiresAt: string } | null> {
  try {
    await signedInOrTimeout();
    const snapshot = await getDoc(doc(db(), "familyEntitlements", roomId));
    const expiresAt = snapshot.exists() ? snapshot.data().expiresAt : undefined;
    return typeof expiresAt === "string" ? { expiresAt } : null;
  } catch (error) {
    if (error instanceof RealtimeSyncError) throw error;
    return null;
  }
}
