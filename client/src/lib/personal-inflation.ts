/**
 * „Vezi exact cât te costă viața, la nivel de produs.” Din bonurile salvate:
 * - produsele casei, fiecare cu istoricul de preț, variația pe 1, 3 și 6 luni și magazinul cel mai ieftin;
 * - inflația ta pe o lună: cât s-au scumpit produsele pe care chiar le cumperi, ponderat după cât dai pe ele;
 * - shrinkflation: același produs, gramaj mai mic, preț pe bucată la fel sau mai mare.
 *
 * Prețul comparat e pe kg sau litru când bonul scanat are gramajul (1.1.219), altfel pe bucată.
 * Două observații se compară doar în aceeași unitate: un preț pe kg nu se pune lângă unul pe bucată.
 * Totul se calculează pe telefon; bonurile nu pleacă nicăieri.
 */
import { addIsoDays, isoToday, type AppData, type ReceiptLine } from "./finance-data";
import { normalizeProductKey, receiptLineUnit, receiptVendorName } from "./price-history";
import { unitPriceOf } from "./receipt-products";

export type Per = "kg" | "l" | "buc";
export type ProductObservation = {
  key: string; label: string; brand?: string; vendor: string; date: string; category: string;
  /** Cât s-a plătit pe rând. */
  paid: number;
  /** Prețul comparabil: pe kg/l când se știe gramajul, altfel pe bucată. */
  price: number; per: Per;
  /** Prețul unei bucăți (ambalaj), pentru shrinkflation. */
  piecePrice: number;
  /** Gramajul unei bucăți în kg sau l, când se știe. */
  size?: number;
  /** De unde vine: bonul, rândul și reducerea tipărită pe rând (deja scăzută din `paid`). */
  receiptId?: string; lineId?: string; discount?: number;
};

const SKIP = new Set(["Rest bon", "Diferență neînregistrată", "Diferență față de bon"]);
const round2 = (value: number) => Math.round(value * 100) / 100;
const round1 = (value: number) => Math.round(value * 10) / 10;

const baseSize = (line: ReceiptLine): number | undefined => {
  if (!line.size || !line.sizeUnit) return undefined;
  if (line.sizeUnit === "g" || line.sizeUnit === "ml") return line.size / 1000;
  if (line.sizeUnit === "kg" || line.sizeUnit === "l") return line.size;
  return undefined;
};

/** Toate rândurile de bon, ca observații de preț comparabile. */
export function productObservations(data: AppData): ProductObservation[] {
  const out: ProductObservation[] = [];
  for (const receipt of data.receipts) {
    const vendor = receiptVendorName(receipt.vendor);
    for (const line of receipt.lines || []) {
      if (!line.label || !(line.amount > 0) || SKIP.has(line.label)) continue;
      const unit = receiptLineUnit(line.label, line.amount);
      const key = normalizeProductKey(unit.label);
      if (!key) continue;
      const known = line.brand || line.size || line.unit ? unitPriceOf(line) : undefined;
      const qty = line.qty && line.qty > 0 ? line.qty : 1;
      const piecePrice = line.unit === "kg" || line.unit === "l" ? line.amount : round2(line.amount / qty);
      out.push({
        key, label: unit.label, brand: line.brand, vendor, date: receipt.date, category: line.category,
        paid: line.amount,
        price: known ? known.value : unit.amount,
        per: known ? known.per : "buc",
        piecePrice: line.qty ? piecePrice : unit.amount,
        size: baseSize(line),
        receiptId: receipt.id, lineId: line.id, ...(line.discount ? { discount: line.discount } : {}),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type ProductCard = {
  key: string; label: string; brand?: string; category: string; per: Per;
  latest: ProductObservation; count: number; spent90: number;
  /** Variația prețului comparabil față de ce plăteai acum 1, 3 și 6 luni (procente). */
  change: { m1?: number; m3?: number; m6?: number };
  cheapest?: { vendor: string; price: number };
  points: Array<{ date: string; price: number; vendor: string }>;
};

/** Ultimul preț plătit până la o zi, în aceeași unitate. */
const priceAt = (points: ProductObservation[], day: string) => [...points].reverse().find((item) => item.date <= day);

/** Produsele casei: cele cumpărate de mai multe ori, apoi după cât s-a dat pe ele în ultimele 90 de zile. */
export function productCards(data: AppData, today = isoToday()): ProductCard[] {
  const groups = new Map<string, ProductObservation[]>();
  for (const item of productObservations(data)) groups.set(item.key, [...(groups.get(item.key) || []), item]);
  const since90 = addIsoDays(today, -90);
  const cards: ProductCard[] = [];
  groups.forEach((all, key) => {
    const latest = all[all.length - 1];
    // Comparăm doar în unitatea ultimei cumpărături (pe kg cu pe kg).
    const same = all.filter((item) => item.per === latest.per);
    const change: ProductCard["change"] = {};
    for (const [field, days] of [["m1", 30], ["m3", 90], ["m6", 180]] as const) {
      const then = priceAt(same, addIsoDays(today, -days));
      if (then && then.price > 0 && then.date < latest.date) change[field] = round1((latest.price / then.price - 1) * 100);
    }
    const byVendor = new Map<string, number>();
    for (const item of same) byVendor.set(item.vendor, Math.min(byVendor.get(item.vendor) ?? Infinity, item.price));
    const vendors = Array.from(byVendor, ([vendor, price]) => ({ vendor, price: round2(price) })).sort((a, b) => a.price - b.price);
    cards.push({
      key, label: latest.label, brand: latest.brand, category: latest.category, per: latest.per, latest, count: all.length,
      spent90: round2(all.filter((item) => item.date >= since90).reduce((sum, item) => sum + item.paid, 0)),
      change,
      cheapest: vendors.length > 1 ? vendors[0] : undefined,
      points: same.map((item) => ({ date: item.date, price: item.price, vendor: item.vendor })),
    });
  });
  // Întâi produsele cumpărate de mai multe ori: doar la ele prețul în timp spune ceva.
  return cards.sort((a, b) => Number(b.count > 1) - Number(a.count > 1) || b.spent90 - a.spent90 || b.count - a.count);
}

export type MonthInflation = {
  month: string;
  /** Inflația ta în procente, ponderată după cât ai dat luna asta pe fiecare produs. */
  percent: number;
  /** Câte produse au intrat în calcul (cumpărate și luna asta, și în cele trei dinainte). */
  products: number;
  /** Cât ai dat luna asta pe produsele din calcul. */
  basket: number;
  risers: Array<{ label: string; percent: number; spent: number }>;
  fallers: Array<{ label: string; percent: number; spent: number }>;
  categories: Array<{ category: string; spent: number; before: number; percent: number }>;
};

const monthOf = (date: string) => date.slice(0, 7);
const monthsBack = (month: string, count: number) => {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 - count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Inflația ta pe o lună: pentru fiecare produs cumpărat și luna asta, și în cele trei luni dinainte,
 * raportul dintre prețul mediu de acum și cel de atunci (în aceeași unitate), ponderat după cât ai
 * dat pe el luna asta. Plus categoriile în care cheltuiești mai mult decât media celor trei luni.
 */
export function monthInflation(data: AppData, month = monthOf(isoToday())): MonthInflation | undefined {
  const start = monthsBack(month, 3);
  const all = productObservations(data).filter((item) => monthOf(item.date) >= start && monthOf(item.date) <= month);
  const now = all.filter((item) => monthOf(item.date) === month);
  if (!now.length) return undefined;
  const before = all.filter((item) => monthOf(item.date) < month);
  const avg = (list: ProductObservation[]) => list.reduce((sum, item) => sum + item.price, 0) / list.length;
  const rows: Array<{ label: string; ratio: number; spent: number }> = [];
  const keys = new Set(now.map((item) => item.key));
  keys.forEach((key) => {
    const current = now.filter((item) => item.key === key);
    const per = current[current.length - 1].per;
    const mine = current.filter((item) => item.per === per);
    const then = before.filter((item) => item.key === key && item.per === per);
    if (!then.length) return;
    const ratio = avg(mine) / avg(then);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 5) return;
    rows.push({ label: mine[mine.length - 1].label, ratio, spent: mine.reduce((sum, item) => sum + item.paid, 0) });
  });
  const weight = rows.reduce((sum, row) => sum + row.spent, 0);
  const percent = weight > 0 ? round1((rows.reduce((sum, row) => sum + row.spent * row.ratio, 0) / weight - 1) * 100) : 0;
  const ranked = rows.map((row) => ({ label: row.label, percent: round1((row.ratio - 1) * 100), spent: round2(row.spent) }));
  const byCategory = new Map<string, { spent: number; before: number }>();
  for (const item of all) {
    const entry = byCategory.get(item.category) || { spent: 0, before: 0 };
    if (monthOf(item.date) === month) entry.spent += item.paid; else entry.before += item.paid / 3;
    byCategory.set(item.category, entry);
  }
  const categories = Array.from(byCategory, ([category, entry]) => ({ category, spent: round2(entry.spent), before: round2(entry.before), percent: entry.before > 0 ? round1((entry.spent / entry.before - 1) * 100) : 0 }))
    .filter((row) => row.before > 0 && row.spent > row.before)
    .sort((a, b) => (b.spent - b.before) - (a.spent - a.before))
    .slice(0, 3);
  return {
    month, percent, products: rows.length, basket: round2(weight),
    risers: ranked.filter((row) => row.percent > 0.5).sort((a, b) => b.percent - a.percent).slice(0, 5),
    fallers: ranked.filter((row) => row.percent < -0.5).sort((a, b) => a.percent - b.percent).slice(0, 3),
    categories,
  };
}

export type Shrinkflation = { key: string; label: string; brand?: string; date: string; vendor: string; fromSize: number; toSize: number; per: Per; fromPiece: number; toPiece: number; perUnitPercent: number };

/**
 * Același produs (aceeași cheie și, când se știe, aceeași marcă), gramaj mai mic cu cel puțin 3%,
 * iar ambalajul costă la fel sau mai mult: prețul pe kg/l a crescut pe ascuns.
 */
export function shrinkflationAlerts(data: AppData, today = isoToday(), days = 365): Shrinkflation[] {
  const since = addIsoDays(today, -days);
  const groups = new Map<string, ProductObservation[]>();
  for (const item of productObservations(data)) {
    if (!item.size || item.per === "buc") continue;
    const id = `${item.key}|${(item.brand || "").toLowerCase()}`;
    groups.set(id, [...(groups.get(id) || []), item]);
  }
  const alerts: Shrinkflation[] = [];
  groups.forEach((list) => {
    for (let index = 1; index < list.length; index += 1) {
      const before = list[index - 1];
      const after = list[index];
      if (after.date < since || !before.size || !after.size) continue;
      if (after.size >= before.size * 0.97 || after.piecePrice < before.piecePrice * 0.98) continue;
      const perBefore = before.piecePrice / before.size;
      const perAfter = after.piecePrice / after.size;
      alerts.push({ key: after.key, label: after.label, brand: after.brand, date: after.date, vendor: after.vendor, fromSize: before.size, toSize: after.size, per: after.per, fromPiece: before.piecePrice, toPiece: after.piecePrice, perUnitPercent: round1((perAfter / perBefore - 1) * 100) });
    }
  });
  return alerts.sort((a, b) => b.date.localeCompare(a.date));
}
