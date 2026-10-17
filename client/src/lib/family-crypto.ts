/**
 * Atelierul Financiar — criptare locală a registrului de familie și unirea a două copii.
 * Parola nu se persistă; doar un pachet AES-GCM deja criptat părăsește telefonul.
 * Pe telefon poate rămâne cheia PBKDF2 neexportabilă (vezi family-session.ts).
 */
import { mergeShoppingLists } from "@/lib/shopping-list";
import { mergeTrip } from "@/lib/trip-data";
import { mergeAssets } from "@/lib/asset-data";
import { mergeWarranties } from "@/lib/warranty-data";
import { mergePlanScalars } from "@/lib/plan-scalars";
import {
  buildPendingReviewMeta,
  normalizeAppData,
  pruneTombstones,
  isArchivedTransaction,
  type AllocationAmountConflict,
  type AllocationHistoryEntry,
  type AppData,
  type BudgetAllocation,
  type DeletedRecord,
  type PendingReviewMeta,
  type PaymentSource,
  type SalaryAllocationApplication,
  type SyncDevice,
  type Receipt,
  type Transaction,
  type TransactionConflict,
} from "@/lib/finance-data";
import { type PlannedEvent } from "@/lib/planned-events";
import { t } from "@/lib/i18n";

export type EncryptedEnvelope = {
  version: 1;
  createdAt: string;
  salt: string;
  iv: string;
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 250_000;

/** Pe bucăți de 32 KB: caracter cu caracter, un pachet de 119 KB costa zeci de ms pe fir (P2-9). */
const toBase64 = (bytes: Uint8Array) => {
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += 0x8000) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(start, start + 0x8000))));
  }
  return btoa(parts.join(""));
};

const fromBase64 = (value: string) => {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
};

/**
 * Parola familiei sau cheia PBKDF2 făcută din ea. Cheia e neexportabilă: poate sta pe
 * telefon ca sesiunea să se reia singură, fără ca parola să poată fi citită înapoi.
 */
export type FamilySecret = string | CryptoKey;

export const importFamilyKeyMaterial = (password: string) =>
  crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);

async function deriveKey(secret: FamilySecret, salt: Uint8Array) {
  const material = typeof secret === "string" ? await importFamilyKeyMaterial(secret) : secret;
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/**
 * Lanțul de scriere al camerei: fiecare scriere dezvăluie `t_i = HMAC(k, cameră:i)` și lasă
 * angajamentul SHA-256 al lui `t_{i+1}`. Regulile Firestore (etapa 3) verifică hash-ul, deci
 * scrie doar cine are cheia familiei; cine vede doar ID-ul camerei vede tokenuri deja folosite.
 * Cheia HMAC vine din aceeași cheie a familiei, cu altă sare, deci toate telefoanele o obțin la fel.
 */
const chainKeys = new WeakMap<object, Promise<CryptoKey>>();
const chainKeysByPassword = new Map<string, Promise<CryptoKey>>();
const chainKeyFor = (secret: FamilySecret) => {
  const make = async () => crypto.subtle.deriveKey({ name: "PBKDF2", salt: encoder.encode("buget-familie:write-chain:v1"), iterations, hash: "SHA-256" }, typeof secret === "string" ? await importFamilyKeyMaterial(secret) : secret, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
  if (typeof secret === "string") { if (!chainKeysByPassword.has(secret)) chainKeysByPassword.set(secret, make()); return chainKeysByPassword.get(secret)!; }
  if (!chainKeys.has(secret)) chainKeys.set(secret, make());
  return chainKeys.get(secret)!;
};
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
export async function writeChainToken(secret: FamilySecret, roomId: string, seq: number): Promise<string> {
  return hex(await crypto.subtle.sign("HMAC", await chainKeyFor(secret), encoder.encode(`buget-familie:write:${roomId}:${seq}`)));
}
export const sha256Hex = async (text: string) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));

export async function encryptFamilyData(data: AppData, secret: FamilySecret): Promise<EncryptedEnvelope> {
  const salt = keyCacheFor(secret).sessionSalt;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await cachedFamilyKey(secret, salt);
  // Preferințele de viteză și de lectură rămân pe telefon; registrul financiar rămâne partea sincronizată.
  // Propunerile de verificat rămân pe telefonul care le-a creat: fără ele, o propunere
  // ignorată pe un telefon ar fi readusă de celălalt la următoarea unire.
  // Ciornele complete rămân pe telefon; partajăm doar un rezumat fără imagini.
  // Conflictele de mișcare/plic se trimit ca meta, ca partenerul să le vadă.
  const shareable = {
    ...data,
    pendingReview: [],
    pendingReviewMeta: buildPendingReviewMeta(data),
    receipts: data.receipts.map(({ imageData: _one, imageData2: _two, imageKeys: _keys, ...receipt }) => receipt),
    settings: {
      ...data.settings,
      quickTemplates: [],
      archivedQuickTemplates: [],
      savedJournalFilters: [],
      salaryCycleTemplates: [],
      seenWeeklyPlanTranches: [],
      basketProducts: [],
      merchantRules: [],
      selfMemberId: undefined,
    },
  };
  // Comprimat înainte de criptare (registrul scade de 5–8 ori): un document Firestore are cel mult 1 MiB.
  const plain = await gzip(encoder.encode(JSON.stringify(shareable)));
  const ciphertext = toBase64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain)));
  if (ciphertext.length > SYNC_ENVELOPE_LIMIT) throw new Error(t("Registrul familiei a devenit prea mare pentru sincronizare ({size} KB). Șterge bonurile vechi sau folosește „Închide anul” din Setări.", { size: Math.round(ciphertext.length / 1024) }));
  return { version: 1, createdAt: new Date().toISOString(), salt: toBase64(salt), iv: toBase64(iv), ciphertext };
}

/** Sub limita de 1 MiB a unui document, cu loc pentru restul câmpurilor. */
export const SYNC_ENVELOPE_LIMIT = 900_000;

const GZIP_MAGIC = [0x1f, 0x8b];
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  // JSON-ul necomprimat (pachetele vechi) începe cu „{”, niciodată cu semnătura gzip.
  if (bytes[0] !== GZIP_MAGIC[0] || bytes[1] !== GZIP_MAGIC[1]) return bytes;
  if (typeof DecompressionStream === "undefined") throw new Error("gzip indisponibil");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decryptFamilyData(envelope: EncryptedEnvelope, secret: FamilySecret): Promise<AppData> {
  if (envelope.version !== 1) throw new Error("Format de pachet necunoscut.");
  try {
    const key = await cachedFamilyKey(secret, fromBase64(envelope.salt));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ciphertext));
    return JSON.parse(decoder.decode(await gunzipIfNeeded(new Uint8Array(plain)))) as AppData;
  } catch {
    throw new Error("Parola familiei este greșită sau pachetul nu poate fi decriptat.");
  }
}

/**
 * PBKDF2 cu 250.000 de iterații costă ~1 s pe un telefon mediu. Cheia pachetului depinde doar
 * de secret și de sare, deci o ținem minte: scriem cu aceeași sare toată sesiunea (IV-ul rămâne
 * nou la fiecare scriere, deci AES-GCM rămâne sigur) și derivăm o singură dată pentru fiecare
 * sare primită de la partener.
 */
type KeyCache = { sessionSalt: Uint8Array; keys: Map<string, Promise<CryptoKey>> };
const keyCacheByObject = new WeakMap<object, KeyCache>();
const keyCacheByPassword = new Map<string, KeyCache>();
const keyCacheFor = (secret: FamilySecret): KeyCache => {
  const fresh = () => ({ sessionSalt: crypto.getRandomValues(new Uint8Array(16)), keys: new Map<string, Promise<CryptoKey>>() });
  if (typeof secret === "string") {
    if (!keyCacheByPassword.has(secret)) keyCacheByPassword.set(secret, fresh());
    return keyCacheByPassword.get(secret)!;
  }
  if (!keyCacheByObject.has(secret)) keyCacheByObject.set(secret, fresh());
  return keyCacheByObject.get(secret)!;
};
function cachedFamilyKey(secret: FamilySecret, salt: Uint8Array): Promise<CryptoKey> {
  const cache = keyCacheFor(secret);
  const id = toBase64(salt);
  const known = cache.keys.get(id);
  if (known) return known;
  const pending = deriveKey(secret, salt);
  pending.catch(() => cache.keys.delete(id));
  cache.keys.set(id, pending);
  // Câteva telefoane înseamnă câteva sări; păstrăm doar ultimele.
  if (cache.keys.size > 8) cache.keys.delete(cache.keys.keys().next().value!);
  return pending;
}

/** Text scurt (parolă de familie) încuiat cu un alt secret — folosit de codul de recuperare. */
export async function encryptText(plain: string, secret: string): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plain));
  return { version: 1, createdAt: new Date().toISOString(), salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptText(envelope: EncryptedEnvelope, secret: string): Promise<string> {
  if (envelope.version !== 1) throw new Error("Format de pachet necunoscut.");
  try {
    const key = await deriveKey(secret, fromBase64(envelope.salt));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ciphertext));
    return decoder.decode(plain);
  } catch {
    throw new Error("Codul de recuperare e greșit sau pachetul nu poate fi decriptat.");
  }
}

const timestamp = (item: { updatedAt?: string; createdAt?: string }) => Date.parse(item.updatedAt || item.createdAt || "") || 0;
const deletionKey = (item: DeletedRecord) => `${item.entity}:${item.id}`;

function mergeCollection<T extends { id: string; updatedAt?: string; createdAt?: string }>(entity: DeletedRecord["entity"], local: T[], remote: T[], deleted: DeletedRecord[]) {
  const tombstones = new Map(deleted.filter((item) => item.entity === entity).map((item) => [item.id, item]));
  const all = new Map<string, T>();
  [...remote, ...local].forEach((item) => {
    const existing = all.get(item.id);
    if (!existing || timestamp(item) >= timestamp(existing)) all.set(item.id, item);
  });
  return Array.from(all.values()).filter((item) => {
    const tombstone = tombstones.get(item.id);
    // Fără ștergere înregistrată păstrăm elementul chiar dacă nu are marcaj de timp:
    // datoriile și obiectivele salvate din dialog nu poartă `updatedAt`, iar o comparație
    // strictă le-ar fi scos definitiv din registru la prima unire a două telefoane.
    if (!tombstone) return true;
    return (Date.parse(tombstone.deletedAt) || 0) < timestamp(item);
  });
}

function mergeSyncDevices(local: SyncDevice[], remote: SyncDevice[]): SyncDevice[] {
  const all = new Map<string, SyncDevice>();
  [...remote, ...local].forEach((item) => {
    const existing = all.get(item.id);
    if (!existing) {
      all.set(item.id, item);
      return;
    }
    // Ultima scriere pe lastSeenAt câștigă tot rândul, inclusiv revokedAt.
    // Revocarea și reactivarea ridică amândouă lastSeenAt, deci un telefon
    // revocat nu-și poate șterge semnul printr-un heartbeat mai vechi.
    const newer = Date.parse(item.lastSeenAt) >= Date.parse(existing.lastSeenAt) ? item : existing;
    all.set(item.id, newer);
  });
  return Array.from(all.values()).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 20);
}

const sourceEditedAt = (item: PaymentSource) => Date.parse(item.updatedAt || "") || 0;

/**
 * Sursele implicite au aceleași id-uri pe fiecare telefon nou (`source-debit` etc.).
 * Un Map care lasă localul să scrie peste remote punea soldul 0 al telefonului
 * al doilea în locul soldului real, apoi îl împingea înapoi în familie.
 * Un 0 cu `updatedAt` mai nou rămâne: e o ștergere explicită, nu un default.
 */
function mergePaymentSource(local: PaymentSource, remote: PaymentSource): PaymentSource {
  const localAt = sourceEditedAt(local);
  const remoteAt = sourceEditedAt(remote);
  if (localAt !== remoteAt) {
    const newer = localAt > remoteAt ? local : remote;
    const older = newer === local ? remote : local;
    return { ...older, ...newer, currency: newer.currency ?? older.currency };
  }
  if (local.openingBalance === 0 && remote.openingBalance > 0) {
    return { ...local, openingBalance: remote.openingBalance, currency: remote.currency || local.currency };
  }
  if (remote.openingBalance === 0 && local.openingBalance > 0) {
    return { ...remote, ...local, currency: local.currency || remote.currency };
  }
  return { ...remote, ...local, currency: local.currency || remote.currency };
}

function mergePaymentSources(local: PaymentSource[], remote: PaymentSource[]): PaymentSource[] {
  const localById = new Map(local.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const merged: PaymentSource[] = [];
  for (const item of remote) {
    seen.add(item.id);
    const mine = localById.get(item.id);
    merged.push(mine ? mergePaymentSource(mine, item) : item);
  }
  for (const item of local) {
    if (!seen.has(item.id)) merged.push(item);
  }
  return merged;
}

/**
 * Ce era în cameră la ultima sincronizare: suma fiecărui plic și „semnătura” fiecărei mișcări.
 * Cu ea, o schimbare făcută doar pe un telefon trece la celălalt fără „conflict”; conflict
 * rămâne doar când amândouă telefoanele au schimbat același lucru.
 */
export type SyncBase = { allocations: Record<string, number>; transactions: Record<string, string> };
const txSignature = (item: Transaction) => [item.amount, item.kind, item.date, item.allocationId || "", item.sourceId || "", item.memberId || ""].join("|");
export const syncBaseOf = (data: AppData): SyncBase => ({
  allocations: Object.fromEntries(data.settings.salaryPlan.allocations.map((item) => [item.id, item.amount])),
  transactions: Object.fromEntries(data.transactions.map((item) => [item.id, txSignature(item)])),
});

type AnyConflict = { detectedAt: string; resolvedChoice?: "local" | "remote"; resolvedAt?: string };
const conflictTime = (item: AnyConflict) => Date.parse(item.resolvedChoice ? item.resolvedAt || item.detectedAt : item.detectedAt) || 0;
/** Rezolvările se țin 30 de zile, cât să ajungă și la un telefon rămas fără internet. */
const staleResolution = (item: AnyConflict) => Boolean(item.resolvedChoice) && Date.now() - conflictTime(item) > 30 * 86_400_000;
/** Același conflict pe două telefoane: câștigă ultimul pas (detectare, rezolvare sau redeschidere). */
function latestConflict<T extends AnyConflict>(left?: T, right?: T): T | undefined {
  if (!left) return right;
  if (!right) return left;
  return conflictTime(left) >= conflictTime(right) ? left : right;
}
function conflictsBy<T extends AnyConflict>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  items.forEach((item) => map.set(key(item), latestConflict(map.get(key(item)), item)!));
  return map;
}
/**
 * Ce face un conflict deschis sau rezolvat pe un id prezent pe ambele telefoane:
 * - „remote”/„local”: o rezolvare de pe un telefon închide conflictul încă deschis pe celălalt, cu suma aleasă;
 * - „open”: cât timp e deschis, nu se aplică nicio regulă automată; fiecare telefon își ține suma;
 * - undefined: nu e conflict deschis; se unește normal.
 */
function conflictOutcome<T extends AnyConflict>(localConflict?: T, remoteConflict?: T): { chosen?: T; take?: "local" | "remote" | "open" } {
  const chosen = latestConflict(localConflict, remoteConflict);
  if (!chosen) return {};
  if (!chosen.resolvedChoice) return { chosen, take: "open" };
  if (chosen === remoteConflict && localConflict && !localConflict.resolvedChoice) return { chosen, take: "remote" };
  if (chosen === localConflict && remoteConflict && !remoteConflict.resolvedChoice) return { chosen, take: "local" };
  return { chosen };
}

/**
 * Unește plicurile pe id. Dacă același id are sume diferite pe cele două telefoane,
 * păstrăm suma locală pentru continuitate pe telefonul curent și înregistrăm un conflict
 * — niciodată LWW tăcut pe bani. Conflictul are sumele văzute de telefonul curent
 * („la mine”/„la partener”), iar cât e deschis blochează unirea automată a plicului.
 */
/**
 * Același salariu repartizat pe ambele telefoane înainte de sync: suma plicului iese la fel
 * (e aceeași schimbare), dar rămâneau două aplicări active și două anulări scădeau plicul la 0.
 * Păstrăm activă doar cea mai veche; cealaltă e marcată anulată, fără efect pe sume.
 */
const singleActivePerIncome = (list: SalaryAllocationApplication[]) => {
  const first = new Map<string, SalaryAllocationApplication>();
  [...list].filter((item) => !item.revertedAt).sort((left, right) => left.appliedAt.localeCompare(right.appliedAt) || left.id.localeCompare(right.id)).forEach((item) => { if (!first.has(item.incomeId)) first.set(item.incomeId, item); });
  return list.map((item) => !item.revertedAt && first.get(item.incomeId) !== item ? { ...item, revertedAt: item.appliedAt } : item);
};

function mergeAllocationsWithConflicts(
  localAllocations: BudgetAllocation[],
  remoteAllocations: BudgetAllocation[],
  localConflicts: AllocationAmountConflict[],
  remoteConflicts: AllocationAmountConflict[],
  base?: SyncBase,
  applied?: { local: SalaryAllocationApplication[]; remote: SalaryAllocationApplication[] },
): { allocations: BudgetAllocation[]; conflicts: AllocationAmountConflict[] } {
  /**
   * Cât a pus în plic fiecare telefon prin repartizări pe care celălalt nu le are încă.
   * Două salarii repartizate în același plic, pe telefoane diferite, se adună (600 + 2.000
   * + 1.500 = 4.100), nu ajung un conflict {2.600, 2.100} fără nicio variantă corectă.
   */
  const onlyHere = (mine: SalaryAllocationApplication[] = [], theirs: SalaryAllocationApplication[] = [], allocationId: string) => {
    const known = new Set(theirs.map((item) => item.id));
    const incomes = new Set(theirs.filter((item) => !item.revertedAt).map((item) => item.incomeId));
    return mine.filter((item) => !known.has(item.id) && !item.revertedAt && !incomes.has(item.incomeId))
      .reduce((sum, item) => sum + item.allocations.filter((line) => line.allocationId === allocationId).reduce((total, line) => total + line.amount, 0), 0);
  };
  const remoteById = new Map(remoteAllocations.map((item) => [item.id, item]));
  const localById = new Map(localAllocations.map((item) => [item.id, item]));
  const localConflictById = conflictsBy(localConflicts, (item) => item.allocationId);
  const remoteConflictById = conflictsBy(remoteConflicts, (item) => item.allocationId);
  const ids = new Set([...Array.from(localById.keys()), ...Array.from(remoteById.keys())]);
  const allocations: BudgetAllocation[] = [];
  const conflicts: AllocationAmountConflict[] = [];
  const now = new Date().toISOString();

  ids.forEach((id) => {
    const localItem = localById.get(id);
    const remoteItem = remoteById.get(id);
    if (localItem && remoteItem) {
      const localConflict = localConflictById.get(id);
      const { chosen, take } = conflictOutcome(localConflict, remoteConflictById.get(id));
      if (chosen && take === "remote") {
        // Partenerul a ales: suma lui închide conflictul și aici. Anularea rămâne pe telefonul lui.
        allocations.push(remoteItem);
        conflicts.push({ ...chosen, previousAmount: undefined });
        return;
      }
      if (chosen && take === "local") { allocations.push(localItem); conflicts.push(chosen); return; }
      if (chosen && take === "open") {
        allocations.push(localItem);
        if (localItem.amount !== remoteItem.amount) {
          conflicts.push({ ...chosen, localAmount: localItem.amount, remoteAmount: remoteItem.amount, localUpdatedAt: localItem.updatedAt, remoteUpdatedAt: remoteItem.updatedAt });
        }
        return;
      }
      // Stub-ul „Anulează” rămâne doar pe telefonul care a ales.
      if (chosen && chosen === localConflict) conflicts.push(chosen);
      const before = base?.allocations[id];
      // Doar un telefon a schimbat suma de la ultima sincronizare: schimbarea lui câștigă.
      if (localItem.amount !== remoteItem.amount && before !== undefined && before === localItem.amount) { allocations.push(remoteItem); return; }
      if (localItem.amount !== remoteItem.amount && before !== undefined && before === remoteItem.amount) { allocations.push(localItem); return; }
      if (localItem.amount !== remoteItem.amount && before !== undefined && applied) {
        const localAdded = onlyHere(applied.local, applied.remote, id);
        const remoteAdded = onlyHere(applied.remote, applied.local, id);
        const near = (left: number, right: number) => Math.abs(left - right) < 0.005;
        if (localAdded > 0 && remoteAdded > 0 && near(localItem.amount - before, localAdded) && near(remoteItem.amount - before, remoteAdded)) {
          allocations.push({ ...localItem, amount: Math.round((localItem.amount + remoteItem.amount - before) * 100) / 100, updatedAt: now });
          return;
        }
      }
      if (localItem.amount !== remoteItem.amount) {
        allocations.push(localItem);
        conflicts.push({
          id: `conflict-${id}`,
          allocationId: id,
          label: localItem.label || remoteItem.label || "Plic",
          localAmount: localItem.amount,
          remoteAmount: remoteItem.amount,
          localUpdatedAt: localItem.updatedAt,
          remoteUpdatedAt: remoteItem.updatedAt,
          detectedAt: now,
        });
        return;
      }
      const winner = timestamp(localItem) >= timestamp(remoteItem) ? localItem : remoteItem;
      allocations.push(winner);
      return;
    }
    allocations.push((localItem || remoteItem)!);
  });

  const byAllocation = new Map<string, AllocationAmountConflict>();
  conflicts.filter((item) => !staleResolution(item)).forEach((item) => byAllocation.set(item.allocationId, item));
  return { allocations, conflicts: Array.from(byAllocation.values()).slice(0, 40) };
}


/** Câmpuri care, dacă diferă pe același id, ar corupe ledgerul la LWW tăcut. */
function transactionMateriallyDiffers(localItem: Transaction, remoteItem: Transaction): boolean {
  return (
    localItem.amount !== remoteItem.amount
    || localItem.kind !== remoteItem.kind
    || localItem.date !== remoteItem.date
    || (localItem.allocationId || "") !== (remoteItem.allocationId || "")
    || (localItem.sourceId || "") !== (remoteItem.sourceId || "")
    || (localItem.memberId || "") !== (remoteItem.memberId || "")
  );
}

/**
 * Unește mișcările pe id. La același id cu editări materiale diferite păstrăm local
 * și înregistrăm conflict — niciodată LWW tăcut pe sumă/dată/plic/sursă.
 */
function mergeTransactionsWithConflicts(
  localTx: Transaction[],
  remoteTx: Transaction[],
  deleted: DeletedRecord[],
  localConflicts: TransactionConflict[],
  remoteConflicts: TransactionConflict[],
  base?: SyncBase,
): { transactions: Transaction[]; conflicts: TransactionConflict[] } {
  const tombstones = new Map(deleted.filter((item) => item.entity === "transactions").map((item) => [item.id, item]));
  const remoteById = new Map(remoteTx.map((item) => [item.id, item]));
  const localById = new Map(localTx.map((item) => [item.id, item]));
  const ids = new Set([...Array.from(localById.keys()), ...Array.from(remoteById.keys())]);
  const localConflictById = conflictsBy(localConflicts, (item) => item.transactionId);
  const remoteConflictById = conflictsBy(remoteConflicts, (item) => item.transactionId);
  const transactions: Transaction[] = [];
  const freshConflicts: TransactionConflict[] = [];
  const now = new Date().toISOString();
  const conflictOf = (localItem: Transaction, remoteItem: Transaction, id: string, detectedAt: string): TransactionConflict => ({
    id,
    transactionId: localItem.id,
    label: localItem.title || remoteItem.title || "Mișcare",
    localAmount: localItem.amount,
    remoteAmount: remoteItem.amount,
    localKind: localItem.kind,
    remoteKind: remoteItem.kind,
    localDate: localItem.date,
    remoteDate: remoteItem.date,
    localTitle: localItem.title,
    remoteTitle: remoteItem.title,
    localUpdatedAt: localItem.updatedAt || localItem.createdAt,
    remoteUpdatedAt: remoteItem.updatedAt || remoteItem.createdAt,
    remoteSnapshot: remoteItem,
    detectedAt,
  });

  ids.forEach((id) => {
    const localItem = localById.get(id);
    const remoteItem = remoteById.get(id);
    const tombstone = tombstones.get(id);
    const alive = (item: Transaction) => {
      if (!tombstone) return true;
      return (Date.parse(tombstone.deletedAt) || 0) < timestamp(item);
    };
    if (localItem && remoteItem) {
      if (!alive(localItem) && !alive(remoteItem)) return;
      const localConflict = localConflictById.get(id);
      const { chosen, take } = alive(localItem) && alive(remoteItem) ? conflictOutcome(localConflict, remoteConflictById.get(id)) : {};
      if (chosen && take === "remote") { transactions.push(remoteItem); freshConflicts.push({ ...chosen, previousSnapshot: undefined }); return; }
      if (chosen && take === "local") { transactions.push(localItem); freshConflicts.push(chosen); return; }
      if (chosen && take === "open") {
        transactions.push(localItem);
        if (transactionMateriallyDiffers(localItem, remoteItem)) freshConflicts.push({ ...conflictOf(localItem, remoteItem, chosen.id, chosen.detectedAt), label: chosen.label });
        return;
      }
      if (chosen && chosen === localConflict) freshConflicts.push(chosen);
      const before = base?.transactions[id];
      if (before !== undefined && transactionMateriallyDiffers(localItem, remoteItem)) {
        // O singură parte s-a schimbat de la ultima sincronizare: ea câștigă, fără conflict.
        if (before === txSignature(localItem)) { if (alive(remoteItem)) transactions.push(remoteItem); return; }
        if (before === txSignature(remoteItem)) { if (alive(localItem)) transactions.push(localItem); return; }
      }
      if (transactionMateriallyDiffers(localItem, remoteItem) && alive(localItem)) {
        transactions.push(localItem);
        freshConflicts.push(conflictOf(localItem, remoteItem, `tx-conflict-${id}`, now));
        return;
      }
      const winner = timestamp(localItem) >= timestamp(remoteItem) ? localItem : remoteItem;
      if (alive(winner)) transactions.push(winner);
      return;
    }
    const only = (localItem || remoteItem)!;
    if (alive(only)) transactions.push(only);
  });

  const byTx = new Map<string, TransactionConflict>();
  freshConflicts.filter((item) => !staleResolution(item)).forEach((item) => byTx.set(item.transactionId, item));
  return { transactions, conflicts: Array.from(byTx.values()).slice(0, 40) };
}

function mergePendingReviewMeta(localMeta: PendingReviewMeta[], remoteMeta: PendingReviewMeta[], _localDraftIds: Set<string>): PendingReviewMeta[] {
  const all = new Map<string, PendingReviewMeta>();
  [...remoteMeta, ...localMeta].forEach((item) => {
    const existing = all.get(item.id);
    if (!existing || Date.parse(item.createdAt) >= Date.parse(existing.createdAt)) all.set(item.id, item);
  });
  // Meta pentru ciorne confirmate/respinse local dispara la următorul push; aici păstrăm
  // și meta remote ca partenerul să vadă coada celuilalt telefon.
  return Array.from(all.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 120);
}

/** Unește două copii de familie fără a expedia imagini de bon și fără a reintroduce elemente șterse. */
/**
 * Soldul datoriei e o valoare stocată, iar unirea alege un telefon. Plățile făcute pe celălalt
 * telefon, pe care telefonul câștigător nu le avea, se scad și ele: 10.000 − 500 − 300 = 9.200,
 * nu 9.700 (ultima scriere).
 */
function withConcurrentDebtPayments(debts: AppData["debts"], local: AppData, remote: AppData, gone: Set<string>): AppData["debts"] {
  const paymentsOf = (data: AppData) => new Map(data.transactions.filter((item) => item.debtId && item.kind === "expense" && !gone.has(item.id)).map((item) => [item.id, item]));
  const localPaid = paymentsOf(local);
  const remotePaid = paymentsOf(remote);
  if (!localPaid.size && !remotePaid.size) return debts;
  const localDebts = new Map(local.debts.map((item) => [item.id, item]));
  return debts.map((debt) => {
    const winnerIsLocal = localDebts.get(debt.id) === debt;
    const [winner, other] = winnerIsLocal ? [localPaid, remotePaid] : [remotePaid, localPaid];
    const missed = Array.from(other.values()).filter((item) => item.debtId === debt.id && !winner.has(item.id)).reduce((sum, item) => sum + item.amount, 0);
    return missed >= 0.005 ? { ...debt, remaining: Math.max(0, Math.round((debt.remaining - missed) * 100) / 100) } : debt;
  });
}

/**
 * O versiune veche a aplicației (dinainte de 1.1.175) „strângea” la pornire bonurile și ștergea partea
 * de pe voucher a bonului plătit din două surse, ca pe un duplicat; ștergerea ajungea prin sincronizare
 * pe toate telefoanele (8 octombrie: 28,50 și 12 lei din Voucher SGR, cu articolele lor). Aplicația de azi
 * șterge mereu bonul întreg, deci o ștergere care lasă cealaltă parte vie, sau bonul cu articole fără
 * mișcarea lui, e o greșeală: păstrăm rândul local și ridicăm piatra lui de mormânt.
 */
export function keepHalfDeletedReceipts(localTx: Transaction[], merged: Transaction[], receipts: Receipt[], deleted: DeletedRecord[]): { transactions: Transaction[]; deleted: DeletedRecord[] } {
  const present = new Set(merged.map((item) => item.id));
  const tombstoned = new Set(deleted.filter((item) => item.entity === "transactions").map((item) => item.id));
  const keep = localTx.filter((item) => (item.kind === "expense" || Boolean(item.transferId)) && !present.has(item.id) && tombstoned.has(item.id) && (
    (item.splitId && merged.some((other) => other.splitId === item.splitId && other.kind === "expense"))
    || (item.transferId && merged.some((other) => other.transferId === item.transferId && other.id !== item.id))
    || (item.receiptId && receipts.some((receipt) => receipt.id === item.receiptId && receipt.linkedTransactionId === item.id))
  ));
  if (!keep.length) return { transactions: merged, deleted };
  const ids = new Set(keep.map((item) => item.id));
  return { transactions: [...keep, ...merged], deleted: deleted.filter((item) => !(item.entity === "transactions" && ids.has(item.id))) };
}

export function mergeFamilyData(localRaw: AppData, remoteRaw: AppData, base?: SyncBase): AppData {
  const local = normalizeAppData(localRaw); const remote = normalizeAppData(remoteRaw);
  // O singură trecere (înainte era O(n²): 350 ms la 1.500 de ștergeri).
  const newest = new Map<string, DeletedRecord>();
  for (const item of [...remote.deleted, ...local.deleted]) {
    const key = deletionKey(item);
    const existing = newest.get(key);
    if (!existing || Date.parse(item.deletedAt) > Date.parse(existing.deletedAt)) newest.set(key, item);
  }
  const deletedAll = Array.from(newest.values()).sort((a, b) => a.deletedAt.localeCompare(b.deletedAt));
  // Aceeași regulă ca la normalizare: vârsta ține locul numărului, ca o curățenie mare să
  // nu șteargă urmele ștergerilor dinainte și să le învie de pe celălalt telefon.
  const deleted = pruneTombstones(deletedAll);
  const tombstoneOf = new Map(deleted.map((item) => [deletionKey(item), item]));
  /** Rămâne dacă nu e șters, sau dacă a fost modificat (readus) după ștergere. */
  const alive = (entity: DeletedRecord["entity"], id: string, stamp?: string) => {
    const tombstone = tombstoneOf.get(`${entity}:${id}`);
    return !tombstone || (Date.parse(stamp || "") || 0) > (Date.parse(tombstone.deletedAt) || 0);
  };
  // Același membru pe ambele telefoane: câștigă ultima redenumire; fără marcaj rămâne varianta locală.
  const memberMap = new Map(remote.settings.members.map((item) => [item.id, item]));
  local.settings.members.forEach((item) => {
    const theirs = memberMap.get(item.id);
    if (!theirs || (Date.parse(item.updatedAt || "") || 0) >= (Date.parse(theirs.updatedAt || "") || 0)) memberMap.set(item.id, item);
  });
  const members = Array.from(memberMap.values()).filter((item) => alive("members", item.id, item.updatedAt));
  const paymentSources = mergePaymentSources(local.settings.paymentSources, remote.settings.paymentSources).filter((item) => alive("paymentSources", item.id, (item as { updatedAt?: string }).updatedAt));
  const categoryRevivedAt = { ...(remote.settings.categoryRevivedAt || {}) };
  Object.entries(local.settings.categoryRevivedAt || {}).forEach(([name, at]) => { if (!categoryRevivedAt[name] || at > categoryRevivedAt[name]) categoryRevivedAt[name] = at; });
  const categorySet = new Set([...remote.settings.customCategories, ...local.settings.customCategories].filter((name) => alive("categories", name, categoryRevivedAt[name])));
  // Plan scalars follow LWW on the plan stamp, but plicuri / transferuri / reguli
  // se unesc pe id — altfel o modificare pe un telefon șterge plicul creat pe celălalt.
  const localPlan = local.settings.salaryPlan;
  const remotePlan = remote.settings.salaryPlan;
  const salaryPlanBase = timestamp(localPlan) >= timestamp(remotePlan) ? localPlan : remotePlan;
  const itemTime = (item: { updatedAt?: string; createdAt?: string; appliedAt?: string }) =>
    Date.parse(item.updatedAt || item.createdAt || item.appliedAt || "") || 0;
  const mergeById = <T extends { id: string }>(left: T[], right: T[], time: (item: T) => number = (item) => itemTime(item as { updatedAt?: string; createdAt?: string; appliedAt?: string })) => {
    const all = new Map<string, T>();
    [...right, ...left].forEach((item) => {
      const existing = all.get(item.id);
      if (!existing || time(item) >= time(existing)) all.set(item.id, item);
    });
    return Array.from(all.values());
  };
  const allocationHistory: AllocationHistoryEntry[] = [...(remotePlan.allocationHistory || []), ...(localPlan.allocationHistory || [])].reduce<AllocationHistoryEntry[]>((all, item) => all.some((entry) => entry.id === item.id) ? all : [...all, item], []).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 400);
  const merged = mergeAllocationsWithConflicts(
    localPlan.allocations || [],
    remotePlan.allocations || [],
    local.allocationConflicts || [],
    remote.allocationConflicts || [],
    base,
    { local: localPlan.salaryAllocationApplications || [], remote: remotePlan.salaryAllocationApplications || [] },
  );
  const allocations = merged.allocations.filter((item) => alive("allocations", item.id, item.updatedAt));
  const conflicts = merged.conflicts.filter((item) => allocations.some((allocation) => allocation.id === item.allocationId));
  const salaryPlan = {
    ...salaryPlanBase,
    ...mergePlanScalars(localPlan, remotePlan),
    allocations,
    transfers: mergeById(localPlan.transfers || [], remotePlan.transfers || []).filter((item) => alive("transfers", item.id, item.createdAt)),
    weekTransfers: mergeById(localPlan.weekTransfers || [], remotePlan.weekTransfers || []).filter((item) => alive("weekTransfers", item.id, item.createdAt)),
    salaryAllocationRules: mergeById(localPlan.salaryAllocationRules || [], remotePlan.salaryAllocationRules || []).filter((item) => alive("salaryRules", item.id, item.updatedAt)),
    salaryAllocationApplications: singleActivePerIncome(mergeById(localPlan.salaryAllocationApplications || [], remotePlan.salaryAllocationApplications || [])),
    needs: mergeById(localPlan.needs || [], remotePlan.needs || []),
    incomes: mergeById(localPlan.incomes || [], remotePlan.incomes || []),
    allocationHistory,
  };
  /**
   * Evenimentele viitoare se unesc pe id, dar jurnalul „pus deoparte” se adună din
   * ambele telefoane: dacă 200 puși de acasă și 150 puși de la serviciu ar intra în
   * LWW, o sumă reală ar dispărea din fondul de Crăciun fără ca cineva să vadă.
   */
  const mergePlannedEvents = (left: PlannedEvent[], right: PlannedEvent[]): PlannedEvent[] => {
    const ids = Array.from(new Set([...right, ...left].map((item) => item.id)));
    return ids.map((id) => {
      const mine = left.find((item) => item.id === id);
      const theirs = right.find((item) => item.id === id);
      const base = !theirs ? mine! : !mine ? theirs : itemTime(mine) >= itemTime(theirs) ? mine : theirs;
      const contributions = mergeById([...(mine?.contributions || [])], [...(theirs?.contributions || [])], (item) => Date.parse(item.date) || 0)
        .filter((item) => alive("eventContributions", `${id}:${item.id}`))
        .sort((first, second) => first.date.localeCompare(second.date));
      return { ...base, contributions: contributions.length ? contributions : undefined };
    }).slice(0, 80);
  };
  const plannedEvents = mergePlannedEvents(local.settings.plannedEvents || [], remote.settings.plannedEvents || []).filter((item) => alive("plannedEvents", item.id, item.updatedAt));
  const syncDevices = mergeSyncDevices(local.settings.syncDevices || [], remote.settings.syncDevices || []);
  const { transactions, conflicts: txConflicts } = mergeTransactionsWithConflicts(
    local.transactions,
    remote.transactions,
    deleted,
    local.transactionConflicts || [],
    remote.transactionConflicts || [],
    base,
  );
  const mergedReceipts = mergeCollection("receipts", local.receipts.map(({ imageData: _one, imageData2: _two, imageKeys: _keys, ...item }) => item), remote.receipts, deleted);
  const guarded = keepHalfDeletedReceipts(local.transactions, transactions, mergedReceipts, deleted);
  const localDraftIds = new Set(local.pendingReview.map((item) => item.id));
  const pendingReviewMeta = mergePendingReviewMeta(
    buildPendingReviewMeta(local),
    [...(local.pendingReviewMeta || []), ...(remote.pendingReviewMeta || [])],
    localDraftIds,
  );
  return normalizeAppData({
    version: 9,
    pendingReview: local.pendingReview,
    pendingReviewMeta,
    allocationConflicts: conflicts,
    transactionConflicts: txConflicts,
    // „Închide anul”: mișcările de dinainte de data arhivată nu revin din copia celuilalt telefon.
    transactions: (() => {
      const localCut = local.settings.archivedThrough || "";
      const remoteCut = remote.settings.archivedThrough || "";
      const winner = remoteCut > localCut ? remote.settings : localCut ? local.settings : undefined;
      return winner ? guarded.transactions.filter((item) => !isArchivedTransaction(winner, item)) : guarded.transactions;
    })(),
    debts: withConcurrentDebtPayments(mergeCollection("debts", local.debts, remote.debts, deleted), local, remote, new Set(deleted.filter((item) => item.entity === "transactions").map((item) => item.id))),
    savings: mergeCollection("savings", local.savings, remote.savings, deleted),
    receipts: mergedReceipts,
    recurring: mergeCollection("recurring", local.recurring, remote.recurring, deleted),
    deleted: guarded.deleted,
    settings: {
      ...remote.settings,
      ...local.settings,
      // Redenumirea familiei ajunge la toți: câștigă numele ales mai recent.
      ...((Date.parse(remote.settings.familyNameSetAt || "") || 0) > (Date.parse(local.settings.familyNameSetAt || "") || 0) && remote.settings.familyName
        ? { familyName: remote.settings.familyName, familyNameSetAt: remote.settings.familyNameSetAt }
        : { familyName: local.settings.familyName || remote.settings.familyName, familyNameSetAt: local.settings.familyNameSetAt || remote.settings.familyNameSetAt }),
      // „Închide anul”: câștigă arhiva mai nouă (dată-limită mai mare), cu soldurile și rezumatele ei.
      ...(() => {
        const localCut = local.settings.archivedThrough || "";
        const remoteCut = remote.settings.archivedThrough || "";
        const winner = remoteCut > localCut ? remote.settings : localCut ? local.settings : undefined;
        return winner?.archivedThrough ? { archivedThrough: winner.archivedThrough, archivedNet: winner.archivedNet || {}, yearSummaries: winner.yearSummaries || [], archivedIds: winner.archivedIds, archivedNetCurrency: winner.archivedNetCurrency } : {};
      })(),
      memberName: local.settings.memberName,
      familyCode: local.settings.familyCode || remote.settings.familyCode,
      members,
      paymentSources,
      customCategories: Array.from(categorySet),
      categoryRevivedAt: Object.keys(categoryRevivedAt).length ? categoryRevivedAt : undefined,
      quickTemplates: local.settings.quickTemplates,
      archivedQuickTemplates: local.settings.archivedQuickTemplates,
      savedJournalFilters: local.settings.savedJournalFilters,
      salaryCycleTemplates: local.settings.salaryCycleTemplates,
      // Cursurile se împart cu familia: soldul unei surse în euro trebuie să fie același pe ambele telefoane.
      exchangeRates: Array.from([...remote.settings.exchangeRates, ...local.settings.exchangeRates].reduce((all, item) => {
        const existing = all.get(item.currency);
        if (!existing || (Date.parse(item.updatedAt) || 0) >= (Date.parse(existing.updatedAt) || 0)) all.set(item.currency, item);
        return all;
      }, new Map<string, (typeof local.settings.exchangeRates)[number]>()).values()).filter((item) => alive("exchangeRates", item.currency, item.updatedAt)).slice(0, 12),
      seenWeeklyPlanTranches: local.settings.seenWeeklyPlanTranches,
      basketProducts: local.settings.basketProducts,
      merchantRules: local.settings.merchantRules || [],
      shoppingList: mergeShoppingLists(local.settings.shoppingList || [], remote.settings.shoppingList || []),
      trip: mergeTrip(local.settings.trip, remote.settings.trip),
      assets: mergeAssets(local.settings.assets, remote.settings.assets),
      warranties: mergeWarranties(local.settings.warranties, remote.settings.warranties),
      plannedEvents,
      syncDevices,
      salaryPlan,
      syncRecoveryIssuedAt: local.settings.syncRecoveryIssuedAt || remote.settings.syncRecoveryIssuedAt,
      // Cine folosește telefonul e o alegere locală; pachetul altui telefon nu o schimbă.
      selfMemberId: local.settings.selfMemberId,
      syncRoomMovedAt: undefined,
      // Administratorul: câștigă alegerea mai nouă.
      ...(() => {
        const pick = (Date.parse(local.settings.syncAdminSetAt || "") || 0) >= (Date.parse(remote.settings.syncAdminSetAt || "") || 0) ? local.settings : remote.settings;
        return pick.syncAdminDeviceId ? { syncAdminDeviceId: pick.syncAdminDeviceId, syncAdminSetAt: pick.syncAdminSetAt } : {};
      })(),
      // Fusul familiei: câștigă alegerea făcută mai recent de mână; altfel cel al camerei,
      // ca un telefon nou să preia ziua familiei, nu pe a lui.
      ...(() => {
        const localAt = Date.parse(local.settings.familyTimeZoneSetAt || "") || 0;
        const remoteAt = Date.parse(remote.settings.familyTimeZoneSetAt || "") || 0;
        const pick = localAt > remoteAt || !remote.settings.familyTimeZone ? local.settings : remote.settings;
        return { familyTimeZone: pick.familyTimeZone, familyTimeZoneSetAt: pick.familyTimeZoneSetAt };
      })(),
    },
  });
}

/** Transformă parola de familie într-un identificator de cameră, fără a expune parola. */
export async function deriveFamilyRoomId(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`buget-familie-room:${secret}`));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Alegerile din conflicte stau în sync-conflicts.ts: bannerul de pe Astăzi le folosește fără să tragă criptarea în pachetul de pornire (P3-12).
export { applyAllocationConflictChoice, undoAllocationConflictChoice, activeAllocationConflicts, applyTransactionConflictChoice, undoTransactionConflictChoice, activeTransactionConflicts } from "@/lib/sync-conflicts";

/** Meta remote pe care acest telefon nu le are ca ciornă locală (coada partenerului). */
export function partnerPendingReviewMeta(data: AppData): PendingReviewMeta[] {
  const localIds = new Set(data.pendingReview.map((item) => item.id));
  return (data.pendingReviewMeta || []).filter((item) => !localIds.has(item.id));
}
