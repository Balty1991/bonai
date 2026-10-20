/**
 * Rapoartele BonAI: o săptămână, o lună, un trimestru sau un an, față de perioada dinainte.
 * - Cumpărăturile (bonuri + cheltuieli fără bon): total, pe zile/săptămâni/luni, pe categorii,
 *   pe produse și pe magazine.
 * - Plățile fixe, separat: rate, împrumuturi și carduri de credit, abonamente, facturi și taxe.
 * Transferurile între cardurile familiei și corecțiile de sold nu intră nicăieri.
 */
import { foldRomanian, type AppData, type Receipt } from "./finance-data";
import { productObservations } from "./personal-inflation";
import { receiptVendorName } from "./price-history";
import { fixedCostEntries, spendEntries } from "./quick-expense";

export type ReportGrain = "week" | "month" | "quarter" | "year";
export type FixedGroupId = "rates" | "loans" | "subscriptions" | "bills";
export type ReportRow = { key: string; label: string; amount: number; previous: number; count: number };
export type FixedItem = { id: string; title: string; amount: number; date: string };
export type FixedGroup = { id: FixedGroupId; total: number; previous: number; items: FixedItem[] };
export type Report = {
  grain: ReportGrain; from: string; to: string; days: number;
  shopping: { total: number; previous: number; receipts: number; loose: number; perDay: number; perReceipt: number };
  buckets: Array<{ key: string; label: string; total: number }>;
  categories: ReportRow[];
  products: Array<ReportRow & { avgPrice: number; per: string }>;
  stores: ReportRow[];
  fixed: { total: number; previous: number; groups: FixedGroup[] };
  /** Cumpărături + plăți fixe. */
  total: number;
};

const r2 = (value: number) => Math.round(value * 100) / 100;
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => { const d = at(day); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const MONTHS = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

/** Perioada care conține `anchor`, mutată cu `offset` perioade (−1 = cea dinainte). */
export function reportRange(grain: ReportGrain, anchor: string, offset = 0): { from: string; to: string } {
  const d = at(anchor);
  if (grain === "week") { const monday = addDays(anchor, -((d.getUTCDay() + 6) % 7) + offset * 7); return { from: monday, to: addDays(monday, 6) }; }
  const span = grain === "month" ? 1 : grain === "quarter" ? 3 : 12;
  const firstMonth = grain === "month" ? d.getUTCMonth() : grain === "quarter" ? Math.floor(d.getUTCMonth() / 3) * 3 : 0;
  const start = new Date(Date.UTC(d.getUTCFullYear(), firstMonth + offset * span, 1, 12));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + span, 0, 12));
  return { from: iso(start), to: iso(end) };
}

/** „13–19 oct.”, „Octombrie 2026”, „T4 2026”, „2026”. */
export function reportTitle(grain: ReportGrain, from: string, to: string): string {
  const f = at(from); const tt = at(to);
  if (grain === "week") return `${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]} – ${tt.getUTCDate()} ${MONTHS[tt.getUTCMonth()]} ${tt.getUTCFullYear()}`;
  if (grain === "month") { const name = f.toLocaleDateString("ro-RO", { month: "long", timeZone: "UTC" }); return `${name[0].toLocaleUpperCase("ro-RO")}${name.slice(1)} ${f.getUTCFullYear()}`; }
  if (grain === "quarter") return `T${Math.floor(f.getUTCMonth() / 3) + 1} ${f.getUTCFullYear()}`;
  return String(f.getUTCFullYear());
}

const inRange = <T extends { date: string }>(list: T[], from: string, to: string) => list.filter((item) => item.date >= from && item.date <= to);

function rows(now: Map<string, { label: string; amount: number; count: number }>, before: Map<string, number>): ReportRow[] {
  return Array.from(now, ([key, row]) => ({ key, label: row.label, amount: r2(row.amount), previous: r2(before.get(key) || 0), count: row.count })).sort((a, b) => b.amount - a.amount);
}

function byCategory(list: Receipt[]) {
  const out = new Map<string, { label: string; amount: number; count: number }>();
  for (const entry of list) {
    const lines = entry.lines?.length ? entry.lines : [{ category: entry.category, amount: entry.amount }];
    for (const line of lines) {
      if (!(line.amount > 0)) continue;
      const key = line.category || "Altele";
      const row = out.get(key) || { label: key, amount: 0, count: 0 };
      row.amount += line.amount; row.count += 1;
      out.set(key, row);
    }
  }
  return out;
}

function byStore(list: Receipt[]) {
  const out = new Map<string, { label: string; amount: number; count: number }>();
  for (const entry of list) {
    if (!(entry.amount > 0)) continue;
    const label = receiptVendorName(entry.vendor);
    const key = foldRomanian(label);
    const row = out.get(key) || { label, amount: 0, count: 0 };
    row.amount += entry.amount; row.count += 1;
    out.set(key, row);
  }
  return out;
}

const flatten = (map: Map<string, { amount: number }>) => new Map(Array.from(map, ([key, row]) => [key, row.amount]));

/** Grupul unei plăți fixe: rata unui produs, împrumut sau card de credit, abonament, factură sau taxă. */
function groupOf(data: AppData, entry: Receipt): FixedGroupId {
  const tx = data.transactions.find((item) => item.id === entry.id);
  const debt = tx?.debtId ? data.debts.find((item) => item.id === tx.debtId) : undefined;
  // Tipul ales în BonAI decide primul: rata la un magazin sau plata în rate e „rate la produse”;
  // creditul bancar, împrumutul, dobânda de card și restul sunt împrumuturi.
  if (debt?.debtType) return debt.debtType === "rata-card-magazin" || debt.debtType === "plata-rate" ? "rates" : "loans";
  // Datoriile vechi: ratele la produse (eMAG, Altex) sunt de obicei pe card; creditul bancar, IFN-ul,
  // banii de la persoane și dobânda de overdraft sunt împrumuturi.
  if (debt?.kind === "card") return "rates";
  if (debt || entry.category === "Credite") return "loans";
  if (entry.category === "Rate produse") return "rates";
  if (entry.category === "Abonamente") return "subscriptions";
  return "bills";
}

function buckets(grain: ReportGrain, from: string, to: string, list: Receipt[]) {
  const sum = (a: string, b: string) => r2(list.filter((entry) => entry.date >= a && entry.date <= b).reduce((s, entry) => s + entry.amount, 0));
  const out: Report["buckets"] = [];
  if (grain === "week") for (let i = 0; i < 7; i++) { const day = addDays(from, i); out.push({ key: day, label: DAYS[i], total: sum(day, day) }); }
  else if (grain === "month") for (let day = from; day <= to; day = addDays(day, 1)) out.push({ key: day, label: String(at(day).getUTCDate()), total: sum(day, day) });
  else if (grain === "quarter") for (let start = from, i = 1; start <= to; start = addDays(start, 7), i++) { const end = addDays(start, 6) > to ? to : addDays(start, 6); out.push({ key: start, label: `S${i}`, total: sum(start, end) }); }
  else for (let m = 0; m < 12; m++) { const key = `${from.slice(0, 4)}-${String(m + 1).padStart(2, "0")}`; out.push({ key, label: MONTHS[m], total: sum(`${key}-01`, `${key}-31`) }); }
  return out;
}

export function buildReport(data: AppData, grain: ReportGrain, anchor: string, offset = 0): Report {
  const { from, to } = reportRange(grain, anchor, offset);
  const prev = reportRange(grain, anchor, offset - 1);
  const entries = spendEntries(data);
  const realIds = new Set(data.receipts.map((receipt) => receipt.id));
  const now = inRange(entries, from, to);
  const before = inRange(entries, prev.from, prev.to);
  const total = now.reduce((s, entry) => s + entry.amount, 0);
  const receipts = now.filter((entry) => realIds.has(entry.id)).length;
  // Zilele trecute din perioadă: media pe zi a perioadei curente nu împarte la zilele care n-au venit încă.
  const lastDay = to < anchor ? to : anchor;
  const days = Math.max(1, Math.round((at(lastDay).getTime() - at(from).getTime()) / 86_400_000) + 1);

  const observations = productObservations(data);
  const productsNow = new Map<string, { label: string; amount: number; count: number; price: number; per: string }>();
  for (const item of inRange(observations, from, to)) {
    const row = productsNow.get(item.key) || { label: item.label, amount: 0, count: 0, price: 0, per: item.per };
    row.amount += item.paid; row.count += 1; row.price += item.price; row.per = item.per; row.label = item.label;
    productsNow.set(item.key, row);
  }
  const productsBefore = new Map<string, number>();
  for (const item of inRange(observations, prev.from, prev.to)) productsBefore.set(item.key, (productsBefore.get(item.key) || 0) + item.paid);
  const products = Array.from(productsNow, ([key, row]) => ({ key, label: row.label, amount: r2(row.amount), previous: r2(productsBefore.get(key) || 0), count: row.count, avgPrice: r2(row.price / row.count), per: row.per })).sort((a, b) => b.amount - a.amount);

  const fixedAll = fixedCostEntries(data);
  const fixedNow = inRange(fixedAll, from, to);
  const fixedBefore = inRange(fixedAll, prev.from, prev.to);
  const groups: FixedGroup[] = (["rates", "loans", "subscriptions", "bills"] as FixedGroupId[]).map((id) => {
    const items = fixedNow.filter((entry) => groupOf(data, entry) === id).map((entry) => ({ id: entry.id, title: entry.vendor, amount: r2(entry.amount), date: entry.date })).sort((a, b) => b.amount - a.amount);
    return { id, items, total: r2(items.reduce((s, item) => s + item.amount, 0)), previous: r2(fixedBefore.filter((entry) => groupOf(data, entry) === id).reduce((s, entry) => s + entry.amount, 0)) };
  }).filter((group) => group.items.length || group.previous > 0);
  const fixedTotal = r2(groups.reduce((s, group) => s + group.total, 0));

  return {
    grain, from, to, days,
    shopping: { total: r2(total), previous: r2(before.reduce((s, entry) => s + entry.amount, 0)), receipts, loose: now.length - receipts, perDay: r2(total / days), perReceipt: receipts ? r2(now.filter((entry) => realIds.has(entry.id)).reduce((s, entry) => s + entry.amount, 0) / receipts) : 0 },
    buckets: buckets(grain, from, to, now),
    categories: rows(byCategory(now), flatten(byCategory(before))),
    products,
    stores: rows(byStore(now), flatten(byStore(before))),
    fixed: { total: fixedTotal, previous: r2(groups.reduce((s, group) => s + group.previous, 0)), groups },
    total: r2(total + fixedTotal),
  };
}

/** Variația față de perioada dinainte, în procente; nimic când perioada dinainte e goală. */
export const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : undefined);

/** Raportul ca text, de trimis pe WhatsApp sau de copiat. */
export function reportText(report: Report, title: string, labels: { shopping: string; fixed: string; total: string; categories: string; products: string; groups: Record<FixedGroupId, string> }, money: (value: number) => string): string {
  const lines = [`BonAI · ${title}`, `${labels.shopping}: ${money(report.shopping.total)}`];
  for (const row of report.categories.slice(0, 5)) lines.push(`  · ${row.label}: ${money(row.amount)}`);
  if (report.products.length) { lines.push(`${labels.products}:`); for (const row of report.products.slice(0, 5)) lines.push(`  · ${row.label}: ${money(row.amount)}`); }
  if (report.fixed.total > 0) { lines.push(`${labels.fixed}: ${money(report.fixed.total)}`); for (const group of report.fixed.groups) if (group.total > 0) lines.push(`  · ${labels.groups[group.id]}: ${money(group.total)}`); }
  lines.push(`${labels.total}: ${money(report.total)}`);
  return lines.join("\n");
}
