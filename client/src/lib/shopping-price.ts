/**
 * Coșul estimat: cât va costa lista de cumpărături, după prețurile de pe bonurile salvate.
 * „Lapte” se potrivește cu „LAPTE ZUZU 1,5% 1L” dacă toate cuvintele de pe listă apar la
 * începutul unor cuvinte de pe bon. Luăm cel mai recent preț din fiecare magazin, din ultimele
 * 120 de zile; un preț mai vechi nu mai spune mare lucru. E o estimare, nu o promisiune.
 */
import { addIsoDays, foldRomanian, type Receipt } from "./finance-data";
import { normalizeProductKey, receiptLineUnit, receiptVendorName } from "./price-history";

export type ShopPrice = { price: number; vendor: string; date: string; cheapest?: { vendor: string; price: number } };
export type ShopEstimate = { prices: Record<string, ShopPrice>; total: number; known: number; bestVendor?: { vendor: string; total: number; saves: number } };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** „2 x ouă” → { qty: 2, words: ["oua"] }; cuvintele sub 3 litere nu ajută la potrivire. */
export function shoppingQuery(text: string): { qty: number; words: string[] } {
  const folded = foldRomanian(text);
  const match = folded.match(/^\s*(\d{1,2})\s*(?:x|buc\.?|bucati)?\s+(.*)$/);
  const qty = match ? Math.max(1, Number(match[1])) : 1;
  const words = (match ? match[2] : folded).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length >= 3);
  return { qty, words };
}

export function estimateShopping(items: ReadonlyArray<{ id: string; text: string }>, receipts: ReadonlyArray<Receipt>, today: string): ShopEstimate {
  const since = addIsoDays(today, -120);
  const lines: Array<{ words: string[]; vendor: string; date: string; amount: number }> = [];
  for (const receipt of receipts) {
    if (!receipt.date || receipt.date < since || receipt.date > today) continue;
    // „Lidl Cluj” și „LIDL ROMANIA” sunt același magazin.
    const vendor = receiptVendorName(receipt.vendor).trim();
    if (!vendor) continue;
    for (const line of receipt.lines || []) {
      if (!line.label || !(line.amount > 0)) continue;
      // Prețul unei bucăți: „Lapte × 2” la 13,98 înseamnă 6,99 bucata.
      const unit = line.qty && line.qty > 0 && line.unit !== "kg" && line.unit !== "l" ? { label: line.label.replace(/\s×\s[\d.,]+(\s?kg)?$/, ""), amount: line.amount / line.qty } : receiptLineUnit(line.label, line.amount);
      const key = normalizeProductKey(unit.label);
      if (key) lines.push({ words: key.split(" "), vendor, date: receipt.date, amount: unit.amount });
    }
  }
  const prices: Record<string, ShopPrice> = {};
  // Cât ar costa fiecare produs în fiecare magazin; pentru „unde iese mai ieftin”.
  const perVendor = new Map<string, Map<string, number>>();
  let total = 0;
  for (const item of items) {
    const { qty, words } = shoppingQuery(item.text);
    if (!words.length) continue;
    const latest = new Map<string, { amount: number; date: string }>();
    for (const line of lines) {
      if (!words.every((word) => line.words.some((have) => have.startsWith(word)))) continue;
      const known = latest.get(line.vendor);
      if (!known || line.date > known.date) latest.set(line.vendor, { amount: line.amount, date: line.date });
    }
    if (!latest.size) continue;
    const offers = Array.from(latest.entries()).map(([vendor, offer]) => ({ vendor, ...offer }));
    const newest = offers.reduce((best, offer) => offer.date > best.date ? offer : best);
    const cheapest = offers.reduce((best, offer) => offer.amount < best.amount ? offer : best);
    prices[item.id] = { price: round2(newest.amount * qty), vendor: newest.vendor, date: newest.date, ...(cheapest.vendor !== newest.vendor && cheapest.amount < newest.amount ? { cheapest: { vendor: cheapest.vendor, price: round2(cheapest.amount * qty) } } : {}) };
    total += newest.amount * qty;
    for (const offer of offers) {
      const map = perVendor.get(offer.vendor) || new Map<string, number>();
      map.set(item.id, offer.amount * qty);
      perVendor.set(offer.vendor, map);
    }
  }
  const known = Object.keys(prices).length;
  // Magazinul recomandat trebuie să aibă toate produsele cu preț cunoscut, altfel comparația minte.
  let bestVendor: ShopEstimate["bestVendor"];
  if (known >= 2) {
    for (const [vendor, map] of Array.from(perVendor.entries())) {
      if (map.size < known) continue;
      const sum = Array.from(map.values()).reduce((acc, value) => acc + value, 0);
      if (!bestVendor || sum < bestVendor.total) bestVendor = { vendor, total: round2(sum), saves: 0 };
    }
    if (bestVendor) bestVendor.saves = round2(total - bestVendor.total);
    if (bestVendor && bestVendor.saves < 1) bestVendor = undefined;
  }
  return { prices, total: round2(total), known, ...(bestVendor ? { bestVendor } : {}) };
}
