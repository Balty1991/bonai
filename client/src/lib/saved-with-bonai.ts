/**
 * „Economisit cu BonAI”: doar bani reali, din bonurile tale.
 *  - reducerile tipărite pe bon (rândul „Reducere”, Lidl Plus etc.);
 *  - alegerile mai ieftine: același produs (aceeași unitate și același ambalaj) plătit mai puțin decât
 *    ultima dată când l-ai luat, în ultimele 60 de zile — fie la alt magazin („magazin mai ieftin”),
 *    fie la același, după o scădere de preț („preț mai mic”).
 * Comparația folosește prețul de dinainte de reducere, ca reducerea să nu fie numărată de două ori.
 * Nimic estimat, nimic din afara bonurilor.
 */
import type { AppData } from "./finance-data";
import { productObservations, type ProductObservation } from "./personal-inflation";
import { nameTokens } from "./barcode-check";

const round2 = (value: number) => Math.round(value * 100) / 100;
const WINDOW_DAYS = 60;
const dayNum = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86_400_000;

export type SavedItem = { kind: "discount" | "store" | "drop"; label: string; vendor: string; date: string; amount: number; was?: { vendor: string; price: number; date: string }; per?: string };
export type SavedSummary = { month: string; total: number; discounts: number; store: number; drop: number; receipts: number; items: SavedItem[]; allTime: number };

const pack = (o: ProductObservation) => (o.per === "buc" ? nameTokens(o.label).sizes.join("+") : "");

/** Toate economiile reale, rând cu rând. */
export function savedItems(data: AppData): SavedItem[] {
  const obs = productObservations(data);
  const out: SavedItem[] = [];
  const byKey = new Map<string, ProductObservation[]>();
  for (const o of obs) byKey.set(`${o.key}|${o.per}|${pack(o)}`, [...(byKey.get(`${o.key}|${o.per}|${pack(o)}`) || []), o]);
  for (const receipt of data.receipts) for (const line of receipt.lines || []) {
    if ((line.discount || 0) > 0) out.push({ kind: "discount", label: line.label || line.category, vendor: receipt.vendor, date: receipt.date, amount: round2(line.discount!) });
  }
  for (const list of Array.from(byKey.values())) {
    // `productObservations` e sortat după dată; comparăm cu ultima cumpărare dinainte (altă zi).
    for (let i = 1; i < list.length; i++) {
      const now = list[i];
      const before = [...list.slice(0, i)].reverse().find((o) => o.date < now.date && dayNum(now.date) - dayNum(o.date) <= WINDOW_DAYS);
      if (!before || !(now.price > 0) || !(now.paid > 0)) continue;
      const units = now.paid / now.price;
      const gross = (now.paid + (now.discount || 0)) / units;
      const saved = round2((before.price - gross) * units);
      if (saved < 0.05) continue;
      out.push({ kind: before.vendor === now.vendor ? "drop" : "store", label: now.label, vendor: now.vendor, date: now.date, amount: saved, was: { vendor: before.vendor, price: before.price, date: before.date }, per: now.per });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

/** Luna curentă (până azi) și totalul de la început. */
export function savedWithBonAI(data: AppData, today: string): SavedSummary {
  const month = today.slice(0, 7);
  const all = savedItems(data).filter((item) => item.date <= today);
  const items = all.filter((item) => item.date.slice(0, 7) === month);
  const sum = (kind: SavedItem["kind"]) => round2(items.filter((item) => item.kind === kind).reduce((s, item) => s + item.amount, 0));
  const discounts = sum("discount"), store = sum("store"), drop = sum("drop");
  const receipts = new Set(data.receipts.filter((r) => r.date.slice(0, 7) === month && r.date <= today && items.some((item) => item.date === r.date && item.vendor === r.vendor)).map((r) => r.id)).size;
  return { month, total: round2(discounts + store + drop), discounts, store, drop, receipts, items, allTime: round2(all.reduce((s, item) => s + item.amount, 0)) };
}

export function savedShareTextV2(saved: number, monthName: string, link: string): string {
  const amount = saved.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `În ${monthName} am economisit ${amount} lei la cumpărături (reduceri de pe bon și magazine mai ieftine), urmărite cu BonAI. ${link}`;
}
