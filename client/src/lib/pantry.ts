/**
 * Stocul casei, din bonuri: ce cumperi des, la câte zile o dată, și ce probabil se termină.
 * Nu cere nimic de introdus: ritmul vine din datele în care ai cumpărat același produs.
 */
import type { ProductObservation } from "./personal-inflation";

export type PantryItem = { key: string; label: string; lastDate: string; everyDays: number; daysSince: number; state: "ok" | "soon" | "out"; purchases: number };

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

/** Produsele cumpărate în cel puțin 3 zile diferite; ritmul = mediana intervalelor. */
const NOT_STOCK_CATEGORIES = new Set(["SGR", "Sacoșe"]);
const NOT_STOCK = /\b(sgr|garan[tț]ie amb|ambalaj|saco[sș][aă]|pung[aă]|diferen[tț][aă])\b/i;

export function pantryFromReceipts(observations: ReadonlyArray<ProductObservation>, today: string): PantryItem[] {
  const byKey = new Map<string, { label: string; dates: Set<string> }>();
  for (const o of observations) {
    // Garanția SGR, sacoșa și diferențele de bon nu sunt produse care „se termină” în casă.
    if (o.date > today || NOT_STOCK_CATEGORIES.has(o.category) || NOT_STOCK.test(o.label)) continue;
    const row = byKey.get(o.key) || { label: o.label, dates: new Set<string>() };
    row.dates.add(o.date);
    byKey.set(o.key, row);
  }
  const out: PantryItem[] = [];
  for (const [key, row] of Array.from(byKey.entries())) {
    const dates = Array.from(row.dates).sort();
    if (dates.length < 3) continue;
    const gaps = dates.slice(1).map((d, i) => days(dates[i], d)).filter((g) => g > 0).sort((a, b) => a - b);
    if (!gaps.length) continue;
    const everyDays = gaps[Math.floor(gaps.length / 2)];
    const lastDate = dates[dates.length - 1];
    const daysSince = days(lastDate, today);
    const state = daysSince >= everyDays * 1.5 ? "out" : daysSince >= everyDays * 0.8 ? "soon" : "ok";
    out.push({ key, label: row.label, lastDate, everyDays, daysSince, state, purchases: dates.length });
  }
  const rank = { out: 0, soon: 1, ok: 2 } as const;
  return out.sort((a, b) => rank[a.state] - rank[b.state] || b.purchases - a.purchases);
}
