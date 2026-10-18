/**
 * Prima sesiune: după primul bon (și până la al 3-lea) Acasă arată ce s-a aflat deja din el
 * și ce deblochează bonurile următoare. Doar cifre de pe bon, nimic estimat.
 */
import type { AppData } from "./finance-data";
import { TRIAL_AFTER_RECEIPTS } from "./bonut-plans";

export type FirstReceiptsInsight = {
  receipts: number;
  vendor: string;
  products: number;
  total: number;
  discounts: number;
  priciest: Array<{ label: string; amount: number }>;
  categories: Array<{ category: string; amount: number; percent: number }>;
  /** Produse cumpărate în cel puțin două bonuri: deja se poate compara prețul. */
  repeated: number;
  toTrial: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function firstReceiptsInsight(data: AppData): FirstReceiptsInsight | undefined {
  const receipts = [...data.receipts].filter((r) => r.amount > 0).sort((a, b) => (b.date + (b.updatedAt || "")).localeCompare(a.date + (a.updatedAt || "")));
  if (!receipts.length || receipts.length >= TRIAL_AFTER_RECEIPTS) return undefined;
  const last = receipts[0];
  const lines = (last.lines || []).filter((line) => line.amount > 0 && line.category !== "SGR");
  const byCategory = new Map<string, number>();
  for (const line of lines) byCategory.set(line.category, (byCategory.get(line.category) || 0) + line.amount);
  if (!lines.length) byCategory.set(last.category, last.amount);
  const sum = Array.from(byCategory.values()).reduce((a, b) => a + b, 0) || 1;
  const names = receipts.map((r) => new Set((r.lines || []).map((l) => (l.label || "").toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean)));
  const repeated = names.length > 1 ? Array.from(names[0]).filter((n) => names.slice(1).some((s) => s.has(n))).length : 0;
  return {
    receipts: receipts.length,
    vendor: last.vendor || "",
    products: lines.length,
    total: round(last.amount),
    discounts: round(lines.reduce((s, l) => s + (l.discount || 0), 0)),
    priciest: [...lines].sort((a, b) => b.amount - a.amount).slice(0, 3).map((l) => ({ label: l.label || l.category, amount: round(l.amount) })),
    categories: Array.from(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category, amount]) => ({ category, amount: round(amount), percent: Math.round((amount / sum) * 100) })),
    repeated,
    toTrial: TRIAL_AFTER_RECEIPTS - receipts.length,
  };
}
