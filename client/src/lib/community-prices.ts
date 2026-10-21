/**
 * Prețurile comunității: „unde e mai ieftin azi în orașul tău”. Pornite doar cu acordul omului,
 * pe telefonul lui (nu pentru toată familia). Pleacă fapte anonime despre prețuri — produsul,
 * unitatea, prețul pe unitate, magazinul și luna — din bonurile de după ultima trimitere.
 * Nu pleacă bonul, ziua, totalul, cine a cumpărat sau ceva despre familie.
 * Înapoi vin prețurile medii pe magazin din același oraș, păstrate 24 de ore pe telefon.
 */
import { authHeader } from "@/lib/realtime-sync";
import { safeSetItem } from "@/lib/safe-storage";
import { addIsoDays, isoToday, type AppData } from "./finance-data";
import { productObservations, regularPrice, type ProductObservation } from "./personal-inflation";
import { receiptVendorName } from "./price-history";
import { FOOD_CATEGORIES } from "./product-catalog";
import type { OutsidePrice } from "./basket-compare";

const URL_COMMUNITY = "https://europe-central2-buget-familie-a6a0d.cloudfunctions.net/communityPrices";
const PREF_KEY = "bonai:community";
const CACHE_KEY = "bonai:community-cache";
const INVITE_KEY = "bonai:community-invite";
const SHARED_CATEGORIES = new Set([...Array.from(FOOD_CATEGORIES), "Casă & facturi", "Consumabile copil"]);

export type CommunityPref = { on: boolean; city: string; sentUntil?: string };
export type CommunityFact = { k: string; per: string; v: string; p: number; m: string };
type CachedPrices = { city: string; at: number; prices: Record<string, Record<string, { price: number; n: number }>> };

const store = () => (typeof window === "undefined" ? undefined : window.localStorage);

export function readCommunity(): CommunityPref {
  try {
    const raw = JSON.parse(store()?.getItem(PREF_KEY) || "null") as Partial<CommunityPref> | null;
    return { on: raw?.on === true, city: typeof raw?.city === "string" ? raw.city.slice(0, 40) : "", ...(typeof raw?.sentUntil === "string" ? { sentUntil: raw.sentUntil } : {}) };
  } catch {
    return { on: false, city: "" };
  }
}

export function writeCommunity(pref: CommunityPref) {
  try {
    const target = store();
    if (!target) return;
    safeSetItem(target, PREF_KEY, JSON.stringify(pref));
    // Altă localitate sau acord retras: prețurile ținute nu mai sunt ale omului.
    if (!pref.on) target.removeItem(CACHE_KEY);
  } catch { /* fără stocare: rămâne oprit */ }
}

/** Orașul cel mai des din antetul bonurilor, ca sugestie la pornire. */
export function suggestedCity(data: AppData): string {
  const counts = new Map<string, number>();
  for (const receipt of data.receipts) if (receipt.city?.trim()) counts.set(receipt.city.trim(), (counts.get(receipt.city.trim()) || 0) + 1);
  return Array.from(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

/**
 * Ce s-ar trimite (alimente, băuturi, produse pentru casă și pentru copil): ultimul preț pe (produs, unitate, magazin, lună) din bonurile de după `since`,
 * doar luna curentă și cea trecută. Taxa SGR și sacoșele nu spun nimic despre magazin.
 */
export function communityFacts(data: AppData, since: string | undefined, today = isoToday()): CommunityFact[] {
  const from = since && since > addIsoDays(today, -45) ? since : addIsoDays(today, -45);
  const months = new Set([today.slice(0, 7), addIsoDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)]);
  const out = new Map<string, CommunityFact>();
  for (const item of productObservations(data)) {
    if (item.date <= from || item.date > today || !months.has(item.date.slice(0, 7)) || !(item.price > 0)) continue;
    // Doar coșul de zi cu zi: haine, farmacie sau „Altele” ar spune prea mult despre om și puțin despre magazin.
    if (!sharedObservation(item)) continue;
    out.set(`${item.key}|${item.per}|${item.vendor}|${item.date.slice(0, 7)}`, { k: item.key, per: item.per, v: item.vendor, p: regularPrice(item), m: item.date.slice(0, 7) });
  }
  return Array.from(out.values()).slice(-80);
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  try {
    const identity = await authHeader();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (identity) headers.Authorization = identity;
    const response = await fetch(URL_COMMUNITY, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) return undefined;
    return await response.json() as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Trimite prețurile noi (o dată pe zi cel mult) și aduce prețurile orașului pentru produsele tale. */
export async function refreshCommunity(data: AppData, keys: Array<{ k: string; per: string }>, today = isoToday()): Promise<CachedPrices | undefined> {
  const pref = readCommunity();
  if (!pref.on || pref.city.trim().length < 2) return undefined;
  if (pref.sentUntil !== today) {
    const facts = communityFacts(data, pref.sentUntil, today);
    const sent = facts.length ? await post({ action: "contribute", city: pref.city, facts }) : { ok: true };
    if (sent?.ok) writeCommunity({ ...readCommunity(), sentUntil: today });
  }
  const cached = readCommunityCache();
  if (cached && cached.city === pref.city && Date.now() - cached.at < 86_400_000) return cached;
  const answer = await post({ action: "query", city: pref.city, keys: keys.slice(0, 40) });
  if (!answer || typeof answer.prices !== "object" || !answer.prices) return cached;
  const next: CachedPrices = { city: pref.city, at: Date.now(), prices: answer.prices as CachedPrices["prices"] };
  try { const target = store(); if (target) safeSetItem(target, CACHE_KEY, JSON.stringify(next)); } catch { /* doar fără cache */ }
  return next;
}

export function readCommunityCache(): CachedPrices | undefined {
  try {
    const raw = JSON.parse(store()?.getItem(CACHE_KEY) || "null") as CachedPrices | null;
    return raw && typeof raw.prices === "object" && raw.prices ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** Prețul unui magazin din comunitate, pentru coșul tău; plus magazinele pe care le știe comunitatea. */
export function communityOutside(cache: CachedPrices | undefined): { outside?: OutsidePrice; vendors: string[] } {
  if (!cache) return { vendors: [] };
  const vendors = new Set<string>();
  Object.values(cache.prices).forEach((byVendor) => Object.keys(byVendor).forEach((vendor) => vendors.add(vendor)));
  return { outside: (key, per, vendor) => cache.prices[`${key}|${per}`]?.[vendor]?.price, vendors: Array.from(vendors) };
}

/** Invitația de după bon: se arată până când omul răspunde o dată (participă sau „Nu acum”). */
export function communityInviteDue(): boolean {
  try { return !readCommunity().on && store()?.getItem(INVITE_KEY) !== "no"; } catch { return false; }
}

export function dismissCommunityInvite() {
  try { const target = store(); if (target) safeSetItem(target, INVITE_KEY, "no"); } catch { /* fără stocare */ }
}

/** Ce poate trimite comunitatea dintr-un bon: doar coșul de zi cu zi, de la un magazin cu nume. */
export const sharedObservation = (item: Pick<ProductObservation, "category" | "vendor" | "price">) => SHARED_CATEGORIES.has(item.category) && !!item.vendor && item.vendor !== "Magazin" && item.price > 0;

export type CityDeal = { label: string; per: string; mine: number; vendor: string; price: number; n: number };
const chainOf = (vendor: string) => receiptVendorName(vendor).trim().split(/\s+/)[0].toLocaleLowerCase("ro-RO");

/**
 * Produsele de pe bon pe care alții din oraș le-au plătit vizibil mai puțin în alt lanț de magazine:
 * cel puțin 5% și 30 de bani pe unitate, la prețul obișnuit (fără promoția de pe bonul tău). Cele mai mari diferențe întâi.
 */
export function cheaperInCity(items: ReadonlyArray<ProductObservation>, cache: CachedPrices | undefined, limit = 3): CityDeal[] {
  if (!cache) return [];
  const deals = new Map<string, CityDeal>();
  for (const item of items) {
    if (!sharedObservation(item)) continue;
    const mine = regularPrice(item);
    const own = chainOf(item.vendor);
    const offers = Object.entries(cache.prices[`${item.key}|${item.per}`] || {}).filter(([vendor, entry]) => chainOf(vendor) !== own && entry.price > 0);
    const best = offers.sort((a, b) => a[1].price - b[1].price)[0];
    if (!best || best[1].price > mine * 0.95 || mine - best[1].price < 0.3) continue;
    const deal = { label: item.label, per: item.per, mine, vendor: best[0], price: best[1].price, n: best[1].n };
    const id = `${item.key}|${item.per}`;
    if (!deals.has(id) || (deals.get(id)!.mine - deals.get(id)!.price) < mine - deal.price) deals.set(id, deal);
  }
  return Array.from(deals.values()).sort((a, b) => (b.mine - b.price) - (a.mine - a.price)).slice(0, limit);
}
