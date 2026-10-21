/**
 * Bon scanat de două ori? Întâi după codul QR (OUG 69/2024) sau numărul bonului, dacă le avem;
 * altfel după magazin + zi + total (+ ora, dacă ambele bonuri o au), apoi după produse. Doar
 * avertizează: nu șterge nimic, omul decide („E alt bon” sau „Nu-l salva”).
 */
import type { AppData, Receipt } from "./finance-data";
import { receiptVendorName } from "./price-history";

export type ReceiptKey = { vendor: string; date?: string; amount: number; time?: string; storeCui?: string; qr?: string; number?: string; /** Produsele de pe bon: prind dublura și când totalul a fost citit greșit o dată. */ labels?: ReadonlyArray<string> };

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
  const sameStore = (x: Receipt & { storeCui?: string }) => chain(x.vendor) === vendor || (!!key.storeCui && !!x.storeCui && norm(x.storeCui) === norm(key.storeCui));
  const sameTime = (x: Receipt & { time?: string }) => !(time && hhmm(x.time) && hhmm(x.time) !== time);
  const exact = r.find((x) => x.date === key.date && Math.abs(x.amount - key.amount) < 0.005 && sameStore(x) && sameTime(x));
  if (exact) return exact;
  // Același magazin și zi, cu aproape aceleași produse (cel puțin 3, peste 80% comune): e tot bonul, citit puțin altfel.
  const mine = new Set((key.labels || []).map(norm).filter(Boolean));
  if (mine.size < 3) return undefined;
  return r.find((x) => {
    if (x.date !== key.date || !sameStore(x) || !sameTime(x)) return false;
    const theirs = new Set((x.lines || []).map((line) => norm(line.label)).filter(Boolean));
    if (theirs.size < 3) return false;
    let common = 0;
    mine.forEach((label) => { if (theirs.has(label)) common += 1; });
    return common / Math.max(mine.size, theirs.size) >= 0.8;
  });
}

export function duplicateFor(data: AppData, key: ReceiptKey) {
  return findDuplicateReceipt(data.receipts, key);
}
