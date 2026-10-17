/**
 * Bon scanat de două ori? Întâi după codul QR (OUG 69/2024) sau numărul bonului, dacă le avem;
 * altfel după magazin + zi + total (+ ora, dacă ambele bonuri o au). Doar avertizează: nu șterge
 * și nu blochează nimic, omul decide.
 */
import type { AppData, Receipt } from "./finance-data";
import { receiptVendorName } from "./price-history";

export type ReceiptKey = { vendor: string; date?: string; amount: number; time?: string; storeCui?: string; qr?: string; number?: string };

const norm = (value: string | undefined) => (value || "").toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
/** Lanțul, nu firma: „LIDL ROMANIA SCS”, „Cumpărături Lidl” și „Lidl” sunt același magazin. */
const chain = (vendor: string | undefined) => norm(receiptVendorName(vendor).split(/\s+/)[0]);
const hhmm = (value: string | undefined) => (value && /^\d{1,2}:\d{2}/.test(value) ? value.padStart(5, "0").slice(0, 5) : undefined);

export function findDuplicateReceipt(receipts: ReadonlyArray<Receipt>, key: ReceiptKey): Receipt | undefined {
  const r = receipts as ReadonlyArray<Receipt & { qr?: string; number?: string; time?: string; storeCui?: string }>;
  if (key.qr) { const hit = r.find((x) => x.qr && x.qr === key.qr); if (hit) return hit; }
  if (key.number && key.date) {
    const hit = r.find((x) => x.number && norm(x.number) === norm(key.number) && x.date === key.date && (key.storeCui && x.storeCui ? norm(x.storeCui) === norm(key.storeCui) : chain(x.vendor) === chain(key.vendor)));
    if (hit) return hit;
  }
  if (!key.date || !(key.amount > 0) || !norm(key.vendor)) return undefined;
  const vendor = chain(key.vendor);
  const time = hhmm(key.time);
  return r.find((x) => x.date === key.date
    && Math.abs(x.amount - key.amount) < 0.005
    && (chain(x.vendor) === vendor || (!!key.storeCui && !!x.storeCui && norm(x.storeCui) === norm(key.storeCui)))
    && !(time && hhmm(x.time) && hhmm(x.time) !== time));
}

export function duplicateFor(data: AppData, key: ReceiptKey) {
  return findDuplicateReceipt(data.receipts, key);
}
