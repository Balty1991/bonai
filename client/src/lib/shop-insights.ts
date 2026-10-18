/**
 * Aplicația de cumpărături: ce arată Acasă și Magazine, calculat din bonurile scanate.
 * - luna în cumpărături: cât s-a dat pe bonuri, față de aceeași zi a lunii trecute;
 * - produsele pe care se duc banii;
 * - „ai fi economisit”: aceleași produse, la prețul cel mai mic văzut la alt magazin;
 * - magazinele: cât dai la fiecare, de câte ori mergi, cât de scump e față de cel mai ieftin.
 * Prețurile se compară doar în aceeași unitate (lei/kg cu lei/kg), ca în „Produsele tale”.
 */
import { addIsoDays, isoToday, type AppData } from "./finance-data";
import { productObservations, type ProductObservation } from "./personal-inflation";
import { receiptVendorName } from "./price-history";
import { spendEntries } from "./quick-expense";

const round2 = (value: number) => Math.round(value * 100) / 100;
const monthOf = (iso: string) => iso.slice(0, 7);
const prevMonthDay = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 2, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
};

export type MonthShopping = { month: string; spent: number; receipts: number; /** Cheltuieli notate fără bon (taxi, cafea), incluse în `spent`. */ loose: number; lastMonthSoFar: number; lastMonthTotal: number; categories: Array<{ category: string; amount: number }> };

/** Bonurile și cheltuielile fără bon ale lunii: total, câte, pe categorii, și luna trecută până în aceeași zi. */
export function monthShopping(data: AppData, today = isoToday()): MonthShopping {
  const month = monthOf(today);
  const prevDay = prevMonthDay(today);
  const prevMonth = monthOf(prevDay);
  const real = new Set(data.receipts.map((receipt) => receipt.id));
  let spent = 0, receipts = 0, loose = 0, lastMonthSoFar = 0, lastMonthTotal = 0;
  const byCategory = new Map<string, number>();
  for (const receipt of spendEntries(data)) {
    if (!(receipt.amount > 0)) continue;
    if (monthOf(receipt.date) === month && receipt.date <= today) {
      spent += receipt.amount;
      if (real.has(receipt.id)) receipts += 1; else loose += 1;
      const lines = receipt.lines?.length ? receipt.lines : [{ category: receipt.category, amount: receipt.amount }];
      for (const line of lines) byCategory.set(line.category, (byCategory.get(line.category) || 0) + line.amount);
    } else if (monthOf(receipt.date) === prevMonth) {
      lastMonthTotal += receipt.amount;
      if (receipt.date <= prevDay) lastMonthSoFar += receipt.amount;
    }
  }
  const categories = Array.from(byCategory, ([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
  return { month, spent: round2(spent), receipts, loose, lastMonthSoFar: round2(lastMonthSoFar), lastMonthTotal: round2(lastMonthTotal), categories };
}

/** Produsele pe care s-au dus cei mai mulți bani în ultimele `days` zile. */
export function topProducts(data: AppData, today = isoToday(), days = 30, limit = 5): Array<{ key: string; label: string; spent: number; count: number }> {
  const since = addIsoDays(today, -days);
  const byKey = new Map<string, { key: string; label: string; spent: number; count: number }>();
  for (const item of productObservations(data)) {
    if (item.date < since || item.date > today) continue;
    const entry = byKey.get(item.key) || { key: item.key, label: item.label, spent: 0, count: 0 };
    entry.spent += item.paid; entry.count += 1; entry.label = item.label;
    byKey.set(item.key, entry);
  }
  return Array.from(byKey.values()).map((item) => ({ ...item, spent: round2(item.spent) })).sort((a, b) => b.spent - a.spent).slice(0, limit);
}

export type Saving = { key: string; label: string; vendor: string; cheaperVendor: string; paid: number; saved: number };

/**
 * Cât ai fi dat mai puțin în ultimele `days` zile dacă fiecare produs ar fi fost luat la prețul cel
 * mai mic pe care l-ai plătit la alt magazin în ultimele 180 de zile. Doar diferențe de peste 3%.
 */
export function savingsOpportunity(data: AppData, today = isoToday(), days = 30): { total: number; items: Saving[] } {
  const since = addIsoDays(today, -days);
  const window = addIsoDays(today, -180);
  const all = productObservations(data).filter((item) => item.date >= window && item.date <= today);
  const cheapest = new Map<string, Map<string, number>>();
  for (const item of all) {
    const id = `${item.key}|${item.per}`;
    const vendors = cheapest.get(id) || new Map<string, number>();
    vendors.set(item.vendor, Math.min(vendors.get(item.vendor) ?? Infinity, item.price));
    cheapest.set(id, vendors);
  }
  const byKey = new Map<string, Saving>();
  for (const item of all) {
    if (item.date < since || !(item.price > 0)) continue;
    const vendors = cheapest.get(`${item.key}|${item.per}`);
    if (!vendors || vendors.size < 2) continue;
    let best: { vendor: string; price: number } | undefined;
    vendors.forEach((price, vendor) => { if (vendor !== item.vendor && (!best || price < best.price)) best = { vendor, price }; });
    if (!best || best.price >= item.price * 0.97) continue;
    const saved = (item.paid / item.price) * (item.price - best.price);
    const entry = byKey.get(item.key) || { key: item.key, label: item.label, vendor: item.vendor, cheaperVendor: best.vendor, paid: 0, saved: 0 };
    entry.paid += item.paid; entry.saved += saved; entry.cheaperVendor = best.vendor; entry.vendor = item.vendor;
    byKey.set(item.key, entry);
  }
  const items = Array.from(byKey.values()).map((item) => ({ ...item, paid: round2(item.paid), saved: round2(item.saved) })).filter((item) => item.saved >= 0.5).sort((a, b) => b.saved - a.saved);
  return { total: round2(items.reduce((sum, item) => sum + item.saved, 0)), items };
}

export type StoreStat = {
  vendor: string; spent: number; visits: number; average: number; last: string;
  /** Cât de scump e magazinul la produsele luate și în altă parte: +8 = cu 8% peste cel mai ieftin. */
  priceIndex?: number; compared: number;
};

/** Magazinele din ultimele `days` zile, după cât s-a dat la fiecare. */
export function storeStats(data: AppData, today = isoToday(), days = 90): StoreStat[] {
  const since = addIsoDays(today, -days);
  const stats = new Map<string, StoreStat>();
  for (const receipt of data.receipts) {
    if (receipt.date < since || receipt.date > today || !(receipt.amount > 0)) continue;
    const vendor = receiptVendorName(receipt.vendor);
    const entry = stats.get(vendor) || { vendor, spent: 0, visits: 0, average: 0, last: receipt.date, compared: 0 };
    entry.spent += receipt.amount; entry.visits += 1;
    if (receipt.date > entry.last) entry.last = receipt.date;
    stats.set(vendor, entry);
  }
  // Indicele de preț: pentru fiecare produs luat și la alt magazin, prețul de aici față de minimul văzut.
  const all = productObservations(data).filter((item) => item.date >= addIsoDays(today, -180) && item.date <= today);
  const byProduct = new Map<string, ProductObservation[]>();
  for (const item of all) byProduct.set(`${item.key}|${item.per}`, [...(byProduct.get(`${item.key}|${item.per}`) || []), item]);
  const ratios = new Map<string, number[]>();
  byProduct.forEach((list) => {
    const vendorMin = new Map<string, number>();
    for (const item of list) if (item.price > 0) vendorMin.set(item.vendor, Math.min(vendorMin.get(item.vendor) ?? Infinity, item.price));
    if (vendorMin.size < 2) return;
    const min = Math.min(...Array.from(vendorMin.values()));
    vendorMin.forEach((price, vendor) => ratios.set(vendor, [...(ratios.get(vendor) || []), price / min]));
  });
  return Array.from(stats.values()).map((item) => {
    const list = ratios.get(item.vendor) || [];
    const index = list.length >= 2 ? Math.round((list.reduce((sum, value) => sum + value, 0) / list.length - 1) * 1000) / 10 : undefined;
    return { ...item, spent: round2(item.spent), average: round2(item.spent / item.visits), compared: list.length, ...(index !== undefined ? { priceIndex: index } : {}) };
  }).sort((a, b) => b.spent - a.spent);
}
