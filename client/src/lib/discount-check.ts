/**
 * Verifică reducerile: ce scrie pe bon față de ce te așteptai.
 *  - prețul văzut la raft (notat din „Verifică în magazin”, eventual promoție) în ultimele 3 zile;
 *  - ultimul preț plătit la același magazin în ultimele 30 de zile, când bonul e cu mult mai scump
 *    și rândul nu are nicio reducere (o promoție care n-a trecut la casă).
 * Doar semnalează, cu cifrele tale; nu schimbă nimic pe bon.
 */
import { normalizeProductKey, receiptLineUnit, receiptVendorName } from "./price-history";
import type { ProductObservation } from "./personal-inflation";

export type ShelfSeen = { key: string; label: string; price: number; date: string; promo?: boolean };
export type DiscountFlag = { label: string; kind: "shelf" | "jump"; charged: number; expected: number; diff: number; pct: number; promo?: boolean; vendor?: string; date?: string };

const round2 = (value: number) => Math.round(value * 100) / 100;
/** Lanțul magazinului: „LIDL DISCOUNT SCS” și „Lidl Cluj” sunt același. */
const chain = (vendor: string) => receiptVendorName(vendor).trim().split(/\s+/)[0].toLocaleLowerCase("ro-RO");
const dayNum = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86_400_000;
export const SHELF_KEY = "bonai:shelf-seen-v1";

export function readShelfSeen(storage: Pick<Storage, "getItem"> = window.localStorage): ShelfSeen[] {
  try { const v = JSON.parse(storage.getItem(SHELF_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => x && typeof x.key === "string" && x.price > 0) : []; } catch { return []; }
}
/** Ține ultimele 200 de prețuri de raft, din ultimele 14 zile; unul nou pentru același produs îl înlocuiește. */
export function rememberShelf(seen: ShelfSeen, today: string, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): ShelfSeen[] {
  const list = [seen, ...readShelfSeen(storage).filter((x) => x.key !== seen.key && dayNum(today) - dayNum(x.date) <= 14)].slice(0, 200);
  try { storage.setItem(SHELF_KEY, JSON.stringify(list)); } catch { /* fără stocare */ }
  return list;
}

type Line = { label: string; amount: number; qty?: number; discount?: number };

/** Semnalele pentru rândurile unui bon; `history` fără bonul verificat. */
export function checkReceiptLines(lines: ReadonlyArray<Line>, vendor: string, date: string, history: ReadonlyArray<ProductObservation>, shelf: ReadonlyArray<ShelfSeen>): DiscountFlag[] {
  const store = chain(vendor);
  const flags: DiscountFlag[] = [];
  for (const line of lines) {
    if (!line.label || !(line.amount > 0)) continue;
    const qty = line.qty && line.qty > 0 ? line.qty : 1;
    const unit = qty !== 1 ? { label: line.label.replace(/\s×\s[\d.,]+(\s?kg)?$/, ""), amount: line.amount / qty } : receiptLineUnit(line.label, line.amount);
    const key = normalizeProductKey(unit.label);
    if (!key) continue;
    const charged = round2(unit.amount);
    const seen = shelf.filter((s) => s.key === key && dayNum(date) - dayNum(s.date) <= 3 && dayNum(date) >= dayNum(s.date)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (seen && charged > seen.price + 0.01) {
      flags.push({ label: unit.label, kind: "shelf", charged, expected: seen.price, diff: round2((charged - seen.price) * qty), pct: Math.round(((charged - seen.price) / seen.price) * 100), promo: seen.promo, date: seen.date });
      continue;
    }
    if ((line.discount || 0) > 0) continue;
    const last = history.filter((o) => o.key === key && chain(o.vendor) === store && o.date <= date && dayNum(date) - dayNum(o.date) <= 30).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last) continue;
    const before = last.piecePrice;
    if (charged >= before * 1.15 && charged - before >= 0.5) flags.push({ label: unit.label, kind: "jump", charged, expected: before, diff: round2((charged - before) * qty), pct: Math.round(((charged - before) / before) * 100), vendor: last.vendor, date: last.date });
  }
  return flags;
}
