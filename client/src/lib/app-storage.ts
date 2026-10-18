import type { AppData } from "./finance-data";
import { freeHeavyLocalCache, isQuotaExceededError, safeSetItem } from "./safe-storage";
import { t } from "./i18n";

const DB_NAME = "buget-familie";
const DB_VERSION = 1;
const STORE_NAME = "app";
const DATA_KEY = "data";
const BACKUP_VERSION = 1;
export const SYNC_JOURNAL_KEY = "buget-familie:sync-journal-v1";
export const APP_STORAGE_KEY = "buget-familie:app-data-v6";
export const LEGACY_STORAGE_KEY = "buget-familie:app-data-v3";

export type AppBackup = {
  kind: "buget-familie-backup";
  version: number;
  exportedAt: string;
  data: AppData;
};

export type SyncJournalEntry = {
  id: string;
  conflictId?: string;
  createdAt: string;
  status: "detected" | "resolved" | "failed";
  message: string;
  action: string;
};

export function readSyncJournal(): SyncJournalEntry[] {
  try {
    const raw = window.localStorage.getItem(SYNC_JOURNAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is SyncJournalEntry => Boolean(item && typeof item === "object" && "id" in item && "createdAt" in item && "status" in item && "message" in item && "action" in item)).slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function writeSyncJournal(entries: SyncJournalEntry[]): void {
  // Jurnal diagnostic — pe quota plină nu blocăm datele financiare.
  safeSetItem(window.localStorage, SYNC_JOURNAL_KEY, JSON.stringify(entries.slice(0, 40)));
}

export const APP_STORAGE_META_KEY = "buget-familie:app-data-meta-v1";

export type AppStorageMeta = { savedAt: string; hash: string };

type StoredEnvelope = { __bf: 1; savedAt: string; hash: string; data: AppData };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB nu este disponibil pe acest dispozitiv."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error(t("Nu am putut deschide stocarea locală.")));
    };
  });
  return dbPromise;
}

/** Hash scurt, stabil, pentru a compara LS și IDB fără a ține tot JSON-ul. */
export function hashAppPayload(serialized: string): string {
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isEnvelope(value: unknown): value is StoredEnvelope {
  return Boolean(value && typeof value === "object" && (value as StoredEnvelope).__bf === 1 && (value as StoredEnvelope).data);
}

function unwrapStored(raw: unknown): { data: AppData | null; savedAt: string | null; hash: string | null } {
  if (!raw) return { data: null, savedAt: null, hash: null };
  if (isEnvelope(raw)) return { data: raw.data, savedAt: raw.savedAt || null, hash: raw.hash || null };
  if (typeof raw === "object" && raw !== null && "version" in (raw as object)) {
    return { data: raw as AppData, savedAt: null, hash: null };
  }
  return { data: null, savedAt: null, hash: null };
}

export function readLocalStorageSnapshot(): { data: AppData | null; savedAt: string | null; hash: string | null; raw: string | null } {
  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { data: null, savedAt: null, hash: null, raw: null };
    let meta: AppStorageMeta | null = null;
    try {
      meta = JSON.parse(window.localStorage.getItem(APP_STORAGE_META_KEY) || "null") as AppStorageMeta | null;
    } catch {
      meta = null;
    }
    const parsed = JSON.parse(raw) as unknown;
    const data = parsed && typeof parsed === "object" ? (parsed as AppData) : null;
    return {
      data,
      savedAt: meta?.savedAt || null,
      hash: meta?.hash || (raw ? hashAppPayload(raw) : null),
      raw,
    };
  } catch {
    return { data: null, savedAt: null, hash: null, raw: null };
  }
}

export type WriteLocalSnapshotResult = {
  meta: AppStorageMeta;
  /** true dacă payload-ul complet a încăput în localStorage */
  wroteFull: boolean;
  quotaExceeded: boolean;
};

/**
 * Cache/meta în LS (hydrate rapid). IDB rămâne sursa primară.
 * La QuotaExceeded nu aruncă: eliberează snapshot-ul greu și păstrează doar meta.
 */
export function writeLocalStorageSnapshot(serialized: string, savedAt = new Date().toISOString(), hash = hashAppPayload(serialized)): WriteLocalSnapshotResult {
  const meta: AppStorageMeta = { savedAt, hash };
  try {
    window.localStorage.setItem(APP_STORAGE_KEY, serialized);
    safeSetItem(window.localStorage, APP_STORAGE_META_KEY, JSON.stringify(meta));
    return { meta, wroteFull: true, quotaExceeded: false };
  } catch (error) {
    const quotaExceeded = isQuotaExceededError(error);
    if (quotaExceeded) {
      // Nu dual-write pe quota plină — IDB ține datele; LS doar meta mică.
      freeHeavyLocalCache(window.localStorage);
      safeSetItem(window.localStorage, APP_STORAGE_META_KEY, JSON.stringify(meta));
    }
    return { meta, wroteFull: false, quotaExceeded };
  }
}

/** Normalizează stampile ISO; valori invalide / goale → null. */
export function normalizeSavedAt(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Alege copia mai nouă între LS (sau memorie) și IndexedDB.
 * Reguli, în ordine:
 * 1. o singură parte are date → aceea;
 * 2. hash egal → IDB (sursă primară stabilă);
 * 3. stampă mai nouă câștigă;
 * 4. stampă egală dar hash diferit → LS (taste recente înainte de debounce IDB ~280ms);
 * 5. fără stampă → LS (migrare / debounce).
 */
export function chooseFresherAppData(
  local: { data: AppData | null; savedAt: string | null; hash: string | null },
  indexed: { data: AppData | null; savedAt: string | null; hash: string | null },
): AppData | null {
  if (!local.data && !indexed.data) return null;
  if (!local.data) return indexed.data;
  if (!indexed.data) return local.data;
  if (local.hash && indexed.hash && local.hash === indexed.hash) return indexed.data;
  const localAt = normalizeSavedAt(local.savedAt);
  const indexedAt = normalizeSavedAt(indexed.savedAt);
  if (localAt && indexedAt) {
    if (localAt > indexedAt) return local.data;
    if (indexedAt > localAt) return indexed.data;
    // Același milisecund: preferăm LS — poate conține taste după ultimul put IDB.
    return local.data;
  }
  if (localAt && !indexedAt) return local.data;
  if (indexedAt && !localAt) return indexed.data;
  // Migrare: fără meta, LS e mai aproape de ultimele taste (IDB e întârziat ~280ms).
  return local.data;
}

/**
 * Rezolvă hydrate-ul de start: dacă utilizatorul a editat înainte ca IDB să răspundă,
 * memoria/LS cu stampă „acum” câștigă; altfel comparăm LS ↔ IDB clasic.
 */
export function resolveHydrateMerge(options: {
  local: { data: AppData | null; savedAt: string | null; hash: string | null };
  indexed: { data: AppData | null; savedAt: string | null; hash: string | null };
  memory: AppData;
  editedBeforeHydrate: boolean;
}): AppData | null {
  const memoryHash = hashAppPayload(localSnapshotText(options.memory));
  if (options.editedBeforeHydrate && !options.local.data && options.indexed.data) {
    /*
     * Copia din localStorage lipsea (golită de plafon), deci memoria pornise goală: ce s-a notat
     * până a răspuns IndexedDB se adaugă peste registrul întreg, nu îl înlocuiește.
     */
    const indexed = options.indexed.data;
    const fresh = options.memory.transactions.filter((item) => !indexed.transactions.some((known) => known.id === item.id));
    const updated = new Map(options.memory.transactions.map((item) => [item.id, item]));
    return {
      ...indexed,
      transactions: [...fresh, ...indexed.transactions.map((item) => {
        const mine = updated.get(item.id);
        return mine && (mine.updatedAt || mine.createdAt || "") > (item.updatedAt || item.createdAt || "") ? mine : item;
      })],
    };
  }
  if (options.editedBeforeHydrate) {
    const stamped = {
      data: options.memory,
      savedAt: new Date().toISOString(),
      hash: memoryHash,
    };
    return chooseFresherAppData(stamped, options.indexed) || options.memory;
  }
  const localSide = options.local.data
    ? options.local
    : { data: options.memory, savedAt: options.local.savedAt, hash: options.local.hash || memoryHash };
  return chooseFresherAppData(localSide, options.indexed);
}

export async function readAppData(): Promise<AppData | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(DATA_KEY);
    request.onsuccess = () => resolve(unwrapStored(request.result).data);
    request.onerror = () => reject(request.error || new Error("Nu am putut citi datele locale."));
  });
}

export async function readAppDataRecord(): Promise<{ data: AppData | null; savedAt: string | null; hash: string | null }> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(DATA_KEY);
    request.onsuccess = () => resolve(unwrapStored(request.result));
    request.onerror = () => reject(request.error || new Error("Nu am putut citi datele locale."));
  });
}

/**
 * Textul copiei din localStorage: fără pozele propriu-zise (stau în stocarea lor), dar cu
 * `imageKeys`, care le leagă de bon. Hash-ul IndexedDB se face pe același text, ca la
 * ștampile egale cele două copii să fie recunoscute ca identice.
 */
export const localSnapshotText = (data: AppData) =>
  JSON.stringify({
    ...data,
    receipts: data.receipts.map(({ imageData: _one, imageData2: _two, ...rest }) => rest),
  });

export async function writeAppData(data: AppData, savedAt = new Date().toISOString(), knownHash?: string): Promise<AppStorageMeta> {
  const db = await openDatabase();
  const hash = knownHash || hashAppPayload(localSnapshotText(data));
  const envelope: StoredEnvelope = { __bf: 1, savedAt, hash, data };
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(envelope, DATA_KEY);
    request.onsuccess = () => resolve({ savedAt, hash });
    request.onerror = () => reject(request.error || new Error("Nu am putut salva datele locale."));
  });
}

export function makeBackup(data: AppData): AppBackup {
  return { kind: "buget-familie-backup", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export function parseBackup(raw: string): AppBackup {
  const parsed = JSON.parse(raw) as Partial<AppBackup>;
  if ((parsed as { kind?: string }).kind === "buget-familie-arhiva-an") {
    throw new Error(t("Fișierul e arhiva unui an închis, nu un backup. Îl deschizi din Setări → Copii de siguranță → Închide anul → „Vezi o arhivă”."));
  }
  if (parsed.kind !== "buget-familie-backup" || parsed.version !== BACKUP_VERSION || !parsed.data) {
    throw new Error(t("Fișierul nu este un backup BonAI valid."));
  }
  return parsed as AppBackup;
}

export type BackupOutcome =
  /** `fallback` = s-a cerut salvare, dar scrierea publică (Descărcări) a eșuat. */
  | { how: "shared"; fallback?: true }
  | { how: "saved"; path: string }
  | { how: "downloaded" }
  | { how: "cancelled" }
  | { how: "failed"; reason?: string };

const backupFileName = (stamp = new Date()) =>
  `buget-familie-backup-${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}.json`;

/**
 * Doar APK/Capacitor nativ. Pe PWA (GitHub Pages în Chrome) rămâne fals —
 * altfel am pretinde Documents/Descărcări fără plugin nativ.
 */
export const isNativeApp = () => {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
};

const isAbort = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || /abort|cancel|dismiss/i.test(error.message));

/**
 * Ce vrea omul de la buton: să-l aibă pe telefon, sau să-l trimită mai departe.
 */
export type BackupIntent = "save" | "share";

type NativeBackupPlugin = {
  saveBackupToDownloads: (options: { name: string; data: string }) => Promise<{ path: string }>;
  writeLiveBackup?: (options: { name: string; base?: string; data: string }) => Promise<{ path: string }>;
};

let nativeBackupPlugin: { api: NativeBackupPlugin } | null | undefined;

/**
 * Pluginul Capacitor e un Proxy care răspunde la orice nume, și la „then”: întors direct dintr-o funcție
 * async, `await` îl lua drept promisiune și chema metoda nativă „then”, care nu răspunde niciodată.
 * Așa rămânea „Se salvează…” pe ecran și salvarea automată nu scria nimic. Îl întoarcem într-o cutie.
 */
async function getNativeBackupPlugin(): Promise<{ api: NativeBackupPlugin } | null> {
  if (nativeBackupPlugin === undefined) {
    try {
      const { registerPlugin } = await import("@capacitor/core");
      nativeBackupPlugin = { api: registerPlugin<NativeBackupPlugin>("BugetFamilieNative") };
    } catch {
      nativeBackupPlugin = null;
    }
  }
  return nativeBackupPlugin;
}

/**
 * Scriere publică reală prin MediaStore → Descărcări.
 * Capacitor Directory.Documents poate „reuși” pe o cale pe care aplicația Fișiere
 * nu o arată (scoped storage / indexare JSON), iar mesajul de succes mințea.
 */
async function saveToPublicDownloads(text: string, name: string): Promise<string> {
  const plugin = (await getNativeBackupPlugin())?.api;
  if (!plugin?.saveBackupToDownloads) {
    throw new Error("Pluginul nativ de salvare nu este disponibil.");
  }
  const result = await plugin.saveBackupToDownloads({ name, data: text });
  if (!result?.path || !result.path.includes(name)) {
    throw new Error(t("Scrierea în Descărcări a eșuat."));
  }
  return result.path;
}

/**
 * Salvare nativă:
 * - „save”: MediaStore Descărcări (vizibil în Fișiere). Dacă eșuează → foaie de partajare
 *   cu fallback sincer, fără a pretinde Documents.
 * - „share”: scrie în cache (FileProvider) și deschide lista de aplicații.
 *
 * Nu mai folosim Directory.Documents pentru succesul „salvat”: pe Android 10+ fișierul
 * poate exista pentru app, dar omul nu-l găsește în Fișiere.
 */
async function saveNatively(text: string, name: string, intent: BackupIntent): Promise<BackupOutcome> {
  if (intent === "save") {
    try {
      const path = await saveToPublicDownloads(text, name);
      return { how: "saved", path };
    } catch {
      // Continuăm cu partajarea — singura cale onestă rămasă.
    }
  }

  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);

  const written = await Filesystem.writeFile({
    path: name,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  const info = await Filesystem.stat({ path: name, directory: Directory.Cache });
  if (!info.size) {
    return { how: "failed", reason: t("Fișierul a rămas gol.") };
  }
  const uri = written.uri || info.uri;

  try {
    await Share.share({
      title: name,
      text: name,
      url: uri,
      dialogTitle: intent === "save" ? t("Salvează backupul pe telefon") : "Trimite backupul",
    });
    return intent === "save" ? { how: "shared", fallback: true } : { how: "shared" };
  } catch (error) {
    // Cache-ul nu e vizibil în Fișiere — la anulare nu pretindem „salvat".
    if (isAbort(error)) return { how: "cancelled" };
    return { how: "failed", reason: error instanceof Error ? error.message : undefined };
  }
}

/**
 * Copia automată, pe Android: scrie direct în Descărcări, fără nicio fereastră. Dacă nu se
 * poate, aruncă — nu deschide foaia de partajare peste ce face omul în aplicație.
 */
/**
 * Copia la fiecare modificare: același fișier, rescris, în Documente/Buget Familie. Numele poartă data
 * și ora ultimei salvări (buget-familie-automat-2026-10-09-0101.json): Android îl redenumește la fiecare
 * scriere, ca omul să vadă din numele lui cât de nou e.
 */
export const LIVE_BACKUP_NAME = "buget-familie-automat.json";
export const LIVE_BACKUP_BASE = "buget-familie-automat";
export const liveBackupName = (stamp = new Date()) => `${LIVE_BACKUP_BASE}-${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}.json`;
export async function saveLiveBackup(data: AppData): Promise<string> {
  if (!isNativeApp()) throw new Error(t("Doar pe telefon, în aplicație."));
  const plugin = (await getNativeBackupPlugin())?.api;
  if (!plugin?.writeLiveBackup) throw new Error(t("Actualizează aplicația ca să folosești salvarea automată."));
  const result = await plugin.writeLiveBackup({ name: liveBackupName(), base: LIVE_BACKUP_BASE, data: JSON.stringify(makeBackup(data), null, 2) });
  return result.path;
}

export async function saveBackupSilently(data: AppData, name = backupFileName()): Promise<string> {
  if (!isNativeApp()) throw new Error(t("Doar pe telefon, în aplicație."));
  return saveToPublicDownloads(JSON.stringify(makeBackup(data), null, 2), name);
}

export async function downloadBackup(data: AppData, intent: BackupIntent = "save"): Promise<BackupOutcome> {
  const name = backupFileName();
  const text = JSON.stringify(makeBackup(data), null, 2);

  if (isNativeApp()) {
    try {
      return await saveNatively(text, name, intent);
    } catch (error) {
      return { how: "failed", reason: error instanceof Error ? error.message : undefined };
    }
  }

  const blob = new Blob([text], { type: "application/json" });

  // Pe web/PWA: „trimite” = share, „salvează” = descărcare reală prin <a download>.
  if (intent === "share") {
    try {
      const file = new File([blob], name, { type: "application/json" });
      const shareApi = navigator as Navigator & { canShare?: (value: { files: File[] }) => boolean };
      if (typeof navigator.share === "function" && shareApi.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return { how: "shared" };
      }
    } catch (error) {
      if (isAbort(error)) return { how: "cancelled" };
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { how: "downloaded" };
  } catch (error) {
    return { how: "failed", reason: error instanceof Error ? error.message : undefined };
  }
}


export async function clearAppStorage(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error(t("Nu am putut goli stocarea locală.")));
  });
}
