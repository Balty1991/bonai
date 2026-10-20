/**
 * „Coșul tău lunar la fiecare magazin.” Produsele pe care le cumperi des (de cel puțin două ori în
 * 90 de zile), cu cantitatea obișnuită pe lună, puse la prețul obișnuit din fiecare magazin: fără
 * reducerile de pe bon și mijlocul ultimelor 3 cumpărări de acolo, ca o promoție sau o zi
 * neobișnuită să nu mute clasamentul. Unde un magazin n-are un produs în bonurile tale, se pune
 * prețul tău obișnuit și se spune câte produse sunt estimate. Prețurile se compară în aceeași unitate.
 */
import { addIsoDays, isoToday, type AppData } from "./finance-data";
import { productObservations, regularPrice, type ProductObservation } from "./personal-inflation";

export type BasketItem = { key: string; label: string; per: string; perMonth: number; avgPrice: number };
export type StoreBasket = { vendor: string; total: number; known: number; estimated: number; diff: number };
export type BasketCompare = { items: BasketItem[]; now: number; stores: StoreBasket[]; cheapest?: StoreBasket; saving: number };

const r2 = (value: number) => Math.round(value * 100) / 100;

/** Prețul unui produs la un magazin din alte surse (prețurile comunității), când lipsește din bonurile tale. */
export type OutsidePrice = (key: string, per: string, vendor: string) => number | undefined;
const SKIP = new Set(["SGR", "Sacoșe"]);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function collect(data: AppData, today: string) {
  const since90 = addIsoDays(today, -90);
  const since180 = addIsoDays(today, -180);
  const all = productObservations(data).filter((item) => item.date >= since180 && item.date <= today && item.price > 0 && !SKIP.has(item.category));
  const byKey = new Map<string, ProductObservation[]>();
  for (const item of all) byKey.set(`${item.key}|${item.per}`, [...(byKey.get(`${item.key}|${item.per}`) || []), item]);

  const items: BasketItem[] = [];
  let now = 0;
  byKey.forEach((list, id) => {
    const recent = list.filter((item) => item.date >= since90);
    if (recent.length < 2) return;
    // Cantitatea pe lună: unitățile cumpărate în 90 de zile (kg, l sau bucăți), împărțite la 3.
    const units = recent.reduce((sum, item) => sum + item.paid / item.price, 0);
    const spent = recent.reduce((sum, item) => sum + item.paid, 0);
    const regular = recent.reduce((sum, item) => sum + (item.paid / item.price) * regularPrice(item), 0);
    const last = list[list.length - 1];
    items.push({ key: id, label: last.label, per: last.per, perMonth: units / 3, avgPrice: regular / units });
    now += spent / 3;
  });
  return { all, byKey, items, now };
}

/** Produsele coșului tău (cheie și unitate), ca să ceri prețurile comunității doar pentru ele. */
export function basketKeys(data: AppData, today = isoToday()): Array<{ k: string; per: string }> {
  return collect(data, today).items.sort((a, b) => b.perMonth * b.avgPrice - a.perMonth * a.avgPrice).map((item) => ({ k: item.key.split("|")[0], per: item.per }));
}

/**
 * `outside` dă prețul unui magazin din prețurile comunității; `extraVendors` sunt magazinele din oraș
 * unde tu n-ai bonuri, dar comunitatea are prețuri.
 */
export function basketCompare(data: AppData, today = isoToday(), outside?: OutsidePrice, extraVendors: string[] = []): BasketCompare | undefined {
  const { all, byKey, items, now } = collect(data, today);
  if (items.length < 3) return undefined;

  const vendors = new Set([...all.map((item) => item.vendor), ...extraVendors]);
  const stores: StoreBasket[] = [];
  vendors.forEach((vendor) => {
    let total = 0, known = 0;
    for (const item of items) {
      const seen = (byKey.get(item.key) || []).filter((obs) => obs.vendor === vendor);
      const [productKey, per] = item.key.split("|");
      const raw = seen.length ? undefined : outside?.(productKey, per, vendor);
      // De peste 3 ori mai mult sau mai puțin decât plătești tu: altă gramatură sau o greșeală.
      const fromOthers = raw && raw > 0 && raw <= item.avgPrice * 3 && raw >= item.avgPrice / 3 ? raw : undefined;
      const price = seen.length ? median(seen.slice(-3).map(regularPrice)) : fromOthers ?? item.avgPrice;
      if (seen.length || fromOthers !== undefined) known += 1;
      total += price * item.perMonth;
    }
    // Un magazin cu mai puțin de 40% din coș cunoscut (bonuri sau comunitate) ar fi doar ghicit.
    if (known >= Math.max(2, Math.ceil(items.length * 0.4))) stores.push({ vendor, total: r2(total), known, estimated: items.length - known, diff: 0 });
  });
  // Din bonurile tale trebuie două magazine; cu prețurile comunității ajunge unul, comparat cu ce dai acum.
  if (stores.length < (outside ? 1 : 2)) return undefined;
  stores.sort((a, b) => a.total - b.total);
  const cheapest = stores[0];
  for (const store of stores) store.diff = r2(store.total - cheapest.total);
  return { items, now: r2(now), stores, cheapest, saving: r2(Math.max(0, now - cheapest.total)) };
}
