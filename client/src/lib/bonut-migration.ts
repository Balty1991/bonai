/**
 * Migrarea versionată la Bonuț (schema 2): cheltuielile devin „costuri”, bugetul vechi devine arhivă.
 * Nu modifică AppData: costurile sunt aceleași înregistrări (eticheta se schimbă în interfață), iar
 * câmpurile vechi rămân în pachet (sync și export merg ca înainte). Înainte de a marca schema 2,
 * salvează o copie completă în IndexedDB („bonut-backups”), de unde se poate reveni oricând.
 */
import type { AppData } from "./finance-data";

export const BONUT_SCHEMA = 2;
export const SCHEMA_KEY = "bonut:schema";
const DB = "bonut-backups";
const STORE = "snapshots";
export const PRE_MIGRATION_ID = "pre-schema-2";

export type CostView = { id: string; title: string; amount: number; date: string; category: string; receiptId?: string };

/** Ce vede Bonuț ca „costuri”: doar cheltuielile reale (fără venituri și fără transferuri între conturi). */
export function costsOf(data: AppData): CostView[] {
  const receiptByTx = new Map(data.receipts.map((r) => [r.linkedTransactionId, r.id]));
  return data.transactions
    .filter((tx) => tx.kind === "expense" && !(tx as { transferId?: string }).transferId)
    .map((tx) => ({ id: tx.id, title: tx.title, amount: tx.amount, date: tx.date, category: tx.category, ...(receiptByTx.get(tx.id) ? { receiptId: receiptByTx.get(tx.id) } : {}) }));
}

export function storedSchema(storage: Pick<Storage, "getItem"> = window.localStorage): number {
  const value = Number(storage.getItem(SCHEMA_KEY));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function needsMigration(storage?: Pick<Storage, "getItem">): boolean {
  return storedSchema(storage) < BONUT_SCHEMA;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no-idb")); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(id: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readPreMigrationBackup(): Promise<{ savedAt: string; data: AppData } | undefined> {
  const db = await openDb();
  const value = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(PRE_MIGRATION_ID);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value as { savedAt: string; data: AppData } | undefined;
}

/**
 * Rulează o singură dată pe telefon. Dacă copia nu se poate scrie, migrarea NU se marchează
 * (reîncearcă la următoarea pornire) — nimic nu se pierde, pentru că datele nu se modifică.
 */
export async function runBonutMigration(data: AppData, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): Promise<"done" | "skipped" | "deferred"> {
  if (!needsMigration(storage)) return "skipped";
  try {
    await put(PRE_MIGRATION_ID, { savedAt: new Date().toISOString(), data: structuredClone(data) });
  } catch {
    return "deferred";
  }
  storage.setItem(SCHEMA_KEY, String(BONUT_SCHEMA));
  return "done";
}

/** Revenire: schema înapoi la 1 (bugetul vechi), datele din copie, dacă omul o cere. */
export function rollbackSchema(storage: Pick<Storage, "setItem"> = window.localStorage) {
  storage.setItem(SCHEMA_KEY, "1");
}
