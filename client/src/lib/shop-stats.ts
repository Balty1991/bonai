/** Statisticile cumpărăturilor pe Zi / Săptămână / Lună / An, din bonuri. Doar sume tipărite pe bon. */
import type { Receipt } from "./finance-data";

export type Grain = "day" | "week" | "month" | "year";
export type Bucket = { key: string; label: string; total: number };
export type PeriodStats = { from: string; to: string; title: string; total: number; previous: number; count: number; buckets: Bucket[]; categories: Array<{ category: string; amount: number }> };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (s: string) => new Date(`${s}T12:00:00Z`);
const addDays = (s: string, n: number) => { const d = at(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const MONTHS = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_LONG = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
const DAYS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Intervalul perioadei care conține `anchor`, mutat cu `offset` perioade. */
export function periodRange(grain: Grain, anchor: string, offset = 0): { from: string; to: string } {
  const d = at(anchor);
  if (grain === "day") { const day = addDays(anchor, offset); return { from: day, to: day }; }
  if (grain === "week") { const monday = addDays(anchor, -((d.getUTCDay() + 6) % 7) + offset * 7); return { from: monday, to: addDays(monday, 6) }; }
  if (grain === "month") { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1, 12)); const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0, 12)); return { from: iso(m), to: iso(end) }; }
  const y = d.getUTCFullYear() + offset; return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function title(grain: Grain, from: string, to: string): string {
  const f = at(from); const tt = at(to);
  if (grain === "day") return `${f.getUTCDate()} ${MONTHS_LONG[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
  if (grain === "week") return `${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]} – ${tt.getUTCDate()} ${MONTHS[tt.getUTCMonth()]}`;
  if (grain === "month") return `${MONTHS_LONG[f.getUTCMonth()][0].toUpperCase()}${MONTHS_LONG[f.getUTCMonth()].slice(1)} ${f.getUTCFullYear()}`;
  return String(f.getUTCFullYear());
}

const sumIn = (receipts: Receipt[], from: string, to: string) => receipts.filter((r) => r.date >= from && r.date <= to);

export function periodStats(receipts: Receipt[], grain: Grain, anchor: string, offset = 0): PeriodStats {
  const { from, to } = periodRange(grain, anchor, offset);
  const prev = periodRange(grain, anchor, offset - 1);
  const scoped = sumIn(receipts, from, to);
  const buckets: Bucket[] = [];
  if (grain === "day") {
    // O zi: câte un stâlp pe bon (magazin), în ordinea orei.
    for (const r of [...scoped].sort((a, b) => (a.time || "").localeCompare(b.time || ""))) buckets.push({ key: r.id, label: r.time || r.vendor.slice(0, 3), total: r2(r.amount) });
  } else if (grain === "week" || grain === "month") {
    for (let day = from, i = 0; day <= to; day = addDays(day, 1), i++) buckets.push({ key: day, label: grain === "week" ? DAYS[i] : String(at(day).getUTCDate()), total: r2(scoped.filter((r) => r.date === day).reduce((s, r) => s + r.amount, 0)) });
  } else {
    for (let m = 0; m < 12; m++) { const key = `${from.slice(0, 4)}-${String(m + 1).padStart(2, "0")}`; buckets.push({ key, label: MONTHS[m], total: r2(scoped.filter((r) => r.date.startsWith(key)).reduce((s, r) => s + r.amount, 0)) }); }
  }
  const cats = new Map<string, number>();
  for (const r of scoped) { const lines = r.lines?.length ? r.lines : [{ category: r.category, amount: r.amount }]; for (const l of lines) if (l.amount > 0) cats.set(l.category || "Altele", (cats.get(l.category || "Altele") || 0) + l.amount); }
  return { from, to, title: title(grain, from, to), total: r2(scoped.reduce((s, r) => s + r.amount, 0)), previous: r2(sumIn(receipts, prev.from, prev.to).reduce((s, r) => s + r.amount, 0)), count: scoped.length, buckets, categories: Array.from(cats.entries()).map(([category, amount]) => ({ category, amount: r2(amount) })).sort((a, b) => b.amount - a.amount) };
}

/** Bonurile pe luni (cea mai nouă prima), cu totalul lunii. */
export function receiptsByMonth(receipts: Receipt[]): Array<{ month: string; title: string; total: number; receipts: Receipt[] }> {
  const groups = new Map<string, Receipt[]>();
  for (const r of receipts) groups.set(r.date.slice(0, 7), [...(groups.get(r.date.slice(0, 7)) || []), r]);
  return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([month, list]) => {
    const m = Number(month.slice(5, 7)) - 1;
    return { month, title: `${MONTHS_LONG[m][0].toUpperCase()}${MONTHS_LONG[m].slice(1)} ${month.slice(0, 4)}`, total: r2(list.reduce((s, r) => s + r.amount, 0)), receipts: [...list].sort((a, b) => `${b.date}${b.time || ""}`.localeCompare(`${a.date}${a.time || ""}`)) };
  });
}

/** Inițialele magazinului: „Mega Image” → „MI”, „Lidl Discount” → „LI”, „Kaufland” → „KA”. */
export function storeInitials(vendor: string): string {
  const words = vendor.replace(/\b(s\.?r\.?l\.?|s\.?a\.?|discount|romania|hypermarket|market)\b/gi, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toLocaleUpperCase("ro-RO");
}

/** Culoarea fixă a unui magazin (aceeași la fiecare deschidere). */
export function storeHue(vendor: string): number {
  let h = 0; for (const ch of vendor.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360; return h;
}
