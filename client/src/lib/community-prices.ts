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
import { productObservations } from "./personal-inflation";
import { FOOD_CATEGORIES } from "./product-catalog";
import type { OutsidePrice } from "./basket-compare";

const URL_COMMUNITY = "https://europe-central2-buget-familie-a6a0d.cloudfunctions.net/communityPrices";
const PREF_KEY = "bonai:community";
const CACHE_KEY = "bonai:community-cache";
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
    if (!SHARED_CATEGORIES.has(item.category) || !item.vendor || item.vendor === "Magazin") continue;
    out.set(`${item.key}|${item.per}|${item.vendor}|${item.date.slice(0, 7)}`, { k: item.key, per: item.per, v: item.vendor, p: Math.round(item.price * 100) / 100, m: item.date.slice(0, 7) });
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
