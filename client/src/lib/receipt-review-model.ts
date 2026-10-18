import type { ScanPrefill } from "@/lib/receipt-scan";
import type { ProductFacts } from "@/lib/receipt-products";

export type ReviewRow = { key: string; label: string; raw: string; qty: number; amount: number; discount: number; category: string; product?: ProductFacts; manual?: boolean };

const UNIT = /^(\d+(?:[.,]\d+)?)(g|gr|kg|ml|l|buc|cl)$/i;
/** „KINDER DELICE T1 39G” → „Kinder Delice T1 39 g”. Textul original rămâne în `raw`. */
export function titleCaseProduct(raw: string): string {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().split(" ").map((word) => {
    const unit = word.match(UNIT);
    if (unit) return `${unit[1].replace(".", ",")} ${unit[2].toLowerCase() === "gr" ? "g" : unit[2].toLowerCase() === "l" ? "L" : unit[2].toLowerCase()}`;
    if (/^\d/.test(word) || /^[a-z]\d+$/i.test(word)) return word.toUpperCase();
    if (word.length <= 2 && /^(de|cu|si|și|la|in|în|pt)$/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ");
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function rowsFromPrefill(prefill: ScanPrefill): ReviewRow[] {
  return prefill.lines.map((line, index) => ({ key: `l${index}`, label: titleCaseProduct(line.label), raw: line.label, qty: line.qty && line.qty > 0 ? line.qty : 1, amount: round2(line.amount), discount: round2(line.discount || 0), category: line.category, product: line.product }));
}

export function rowsTotal(rows: ReviewRow[]): number { return round2(rows.reduce((sum, row) => sum + row.amount, 0)); }

export type CategoryGroup = { category: string; rows: ReviewRow[]; total: number; share: number };
export function groupRows(rows: ReviewRow[]): CategoryGroup[] {
  const total = rowsTotal(rows) || 1;
  const map = new Map<string, ReviewRow[]>();
  for (const row of rows) map.set(row.category, [...(map.get(row.category) || []), row]);
  return Array.from(map.entries()).map(([category, list]) => ({ category, rows: list, total: rowsTotal(list), share: rowsTotal(list) / total })).sort((a, b) => b.total - a.total);
}

/** Totalul tipărit față de suma rândurilor: 0 = se potrivește (sub 1 ban). Pozitiv = lipsesc bani din rânduri. */
export function totalGap(printed: number, rows: ReviewRow[]): number {
  if (!(printed > 0)) return 0;
  const gap = round2(printed - rowsTotal(rows));
  return Math.abs(gap) < 0.01 ? 0 : gap;
}

const ICONS: Record<string, string> = { Alimente: "🥖", "Consumabile copil": "🍼", Abonamente: "📱", Băuturi: "🥤", Apă: "💧", Dulciuri: "🍫", Transport: "⛽", "Casă & facturi": "🏠", Sănătate: "💊", Educație: "📚", "Timp liber": "🎟️", Haine: "👕", SGR: "♻️", Sacoșe: "🛍️", Altele: "🧾" };
export const categoryIcon = (category: string) => ICONS[category] || "🧾";
export const CATEGORY_COLORS = ["#8b5cf6", "#22d3ee", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#a3e635"];
