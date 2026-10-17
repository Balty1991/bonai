/**
 * Bonul pe produs. Scanarea întoarce acum, pe lângă suma și categoria fiecărui rând, marca,
 * gramajul, unitatea și prețul pe bucată sau pe kg; iar din antet codul fiscal, orașul și ora.
 * Ele se lipesc de bonul salvat după ce omul a verificat rândurile, potrivite după denumire,
 * ca o corectură făcută în formular (un rând șters, o sumă schimbată) să nu mute datele pe alt rând.
 *
 * Totul e opțional: bonurile vechi și cele scrise de mână merg ca înainte.
 */
import { foldRomanian, type AppData, type Receipt, type ReceiptLine } from "./finance-data";

export type SizeUnit = "g" | "kg" | "ml" | "l" | "buc";
export type ProductFacts = { brand?: string; size?: number; sizeUnit?: SizeUnit; unit?: "buc" | "kg" | "l"; unitPrice?: number; vatRate?: number };
export type StoreFacts = { storeCui?: string; storeAddress?: string; city?: string; time?: string; vat?: number };

const PRODUCT_KEYS = ["brand", "size", "sizeUnit", "unit", "unitPrice", "vatRate"] as const;
const STORE_KEYS = ["storeCui", "storeAddress", "city", "time", "vat"] as const;

/** Doar câmpurile cu valoare; un obiect gol nu se scrie pe rând. */
export function productFactsOf(item: Record<string, unknown>): ProductFacts {
  const out: Record<string, unknown> = {};
  for (const key of PRODUCT_KEYS) if (item[key] !== undefined && item[key] !== "" && item[key] !== null) out[key] = item[key];
  return out as ProductFacts;
}

export function storeFactsOf(item: Record<string, unknown>): StoreFacts {
  const out: Record<string, unknown> = {};
  for (const key of STORE_KEYS) if (item[key] !== undefined && item[key] !== "" && item[key] !== null) out[key] = item[key];
  return out as StoreFacts;
}

/** „Lapte Zuzu 1,5% × 2” și „lapte zuzu 1,5%” sunt același rând: fără cantitate, fără diacritice. */
const lineKey = (label: string | undefined) => foldRomanian(String(label || "").replace(/\s×\s.*$/, "")).replace(/\s+/g, " ").trim();

/** Câte kilograme sau litri are o bucată; bucățile dintr-un pachet nu au masă. */
const sizeInBase = (size: number | undefined, unit: SizeUnit | undefined): { amount: number; per: "kg" | "l" | "buc" } | undefined => {
  if (!size || size <= 0 || !unit) return undefined;
  if (unit === "g") return { amount: size / 1000, per: "kg" };
  if (unit === "kg") return { amount: size, per: "kg" };
  if (unit === "ml") return { amount: size / 1000, per: "l" };
  if (unit === "l") return { amount: size, per: "l" };
  return { amount: size, per: "buc" };
};

/**
 * Prețul pe kilogram, litru sau bucată al unui rând, după ce s-a plătit efectiv (cu reducere).
 * La cântar („0,412 kg × 15,99”) e suma pe cantitate; la produsul ambalat e suma pe greutatea
 * tuturor bucăților; fără gramaj rămâne prețul pe bucată.
 */
export function unitPriceOf(line: Pick<ReceiptLine, "amount" | "qty" | "unit" | "size" | "sizeUnit">): { value: number; per: "kg" | "l" | "buc" } | undefined {
  if (!(line.amount > 0)) return undefined;
  const qty = line.qty && line.qty > 0 ? line.qty : 1;
  if (line.unit === "kg" || line.unit === "l") return { value: Math.round((line.amount / qty) * 100) / 100, per: line.unit };
  const base = sizeInBase(line.size, line.sizeUnit);
  if (base) return { value: Math.round((line.amount / (qty * base.amount)) * 100) / 100, per: base.per };
  return { value: Math.round((line.amount / qty) * 100) / 100, per: "buc" };
}

export type ScanLineFacts = { label: string; qty?: number; product?: ProductFacts };

/**
 * Lipește de bonul salvat ce a citit scanarea: antetul magazinului și, pe fiecare rând rămas după
 * verificare, faptele produsului cu aceeași denumire. Rândurile adăugate de mână rămân cum sunt.
 */
export function enrichReceipt(receipt: Receipt, scanLines: ScanLineFacts[], store: StoreFacts | undefined): Receipt {
  const byKey = new Map<string, ScanLineFacts[]>();
  for (const line of scanLines) {
    const key = lineKey(line.label);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) || []), line]);
  }
  let changed = false;
  const lines = (receipt.lines || []).map((line) => {
    const queue = byKey.get(lineKey(line.label));
    const facts = queue?.shift();
    if (!facts) return line;
    const product = facts.product ? productFactsOf(facts.product as Record<string, unknown>) : {};
    const qty = facts.qty && Math.abs(facts.qty - 1) > 0.0001 ? { qty: facts.qty } : {};
    if (!Object.keys(product).length && !Object.keys(qty).length) return line;
    changed = true;
    return { ...line, ...product, ...qty };
  });
  const header = store ? storeFactsOf(store as Record<string, unknown>) : {};
  if (!changed && !Object.keys(header).length) return receipt;
  return { ...receipt, ...header, lines };
}

/** Bonul legat de mișcarea abia salvată primește faptele scanării. */
export function enrichSavedReceipt(data: AppData, transactionId: string, scanLines: ScanLineFacts[], store: StoreFacts | undefined): AppData {
  const tx = data.transactions.find((item) => item.id === transactionId);
  const target = tx && data.receipts.find((receipt) => receipt.id === tx.receiptId || receipt.linkedTransactionId === tx.id || receipt.linkedTransactionIds?.includes(tx.id));
  if (!target) return data;
  const next = enrichReceipt(target, scanLines, store);
  return next === target ? data : { ...data, receipts: data.receipts.map((receipt) => receipt.id === target.id ? next : receipt) };
}

/**
 * La „Corectează”, rândurile se refac din formular: faptele produsului (marca, gramajul, unitatea)
 * trec de pe rândul vechi pe cel nou cu același id sau, dacă s-a refăcut, cu aceeași denumire.
 */
export function carryProductFacts(previous: ReceiptLine[] | undefined, next: ReceiptLine[]): ReceiptLine[] {
  if (!previous?.length) return next;
  const byId = new Map(previous.map((line) => [line.id, line]));
  const byKey = new Map<string, ReceiptLine[]>();
  for (const line of previous) byKey.set(lineKey(line.label), [...(byKey.get(lineKey(line.label)) || []), line]);
  return next.map((line) => {
    const old = byId.get(line.id) || byKey.get(lineKey(line.label))?.shift();
    if (!old) return line;
    const facts = productFactsOf(old as unknown as Record<string, unknown>);
    const qty = old.qty !== undefined && line.qty === undefined ? { qty: old.qty } : {};
    return Object.keys(facts).length || Object.keys(qty).length ? { ...facts, ...qty, ...line } : line;
  });
}

/** Ce se arată sub un rând: „Zuzu · 1 l · 6,49 lei/l”. */
export function productFactsText(line: ReceiptLine): string {
  const parts: string[] = [];
  if (line.brand) parts.push(line.brand);
  if (line.size && line.sizeUnit && line.sizeUnit !== "buc") parts.push(`${line.size.toLocaleString("ro-RO", { maximumFractionDigits: 3 })} ${line.sizeUnit}`);
  const unit = line.brand || line.size || line.unit ? unitPriceOf(line) : undefined;
  if (unit && unit.per !== "buc") parts.push(`${unit.value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei/${unit.per}`);
  return parts.join(" · ");
}
