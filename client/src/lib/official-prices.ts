/**
 * Monitorul Prețurilor (Consiliul Concurenței): căutare punctuală, la cererea omului, pentru UN produs
 * în orașul lui, cu cache de 24 h și atribuire vizibilă. Fără preluare în masă, fără republicare.
 * OPRIT implicit (OFFICIAL_PRICES_ENABLED=false) până la acordul scris (docs/ARHITECTURA.md §2, §13).
 *
 * Platforma răspunde doar din România și fără CORS, așa că cererea pleacă de pe telefon prin
 * CapacitorHttp (nativ); pe web nu se face. Etichetele XML urmează parserul public gov2-ro/monitorulpreturilor
 * (CatalogProduct, UAT, RetailStore, Product/Price/Pricedate) și trebuie verificate pe un răspuns real
 * înainte de pornire.
 */
export const OFFICIAL_PRICES_ENABLED = false;
export const OFFICIAL_ATTRIBUTION = "Sursa: Monitorul Prețurilor, Consiliul Concurenței. Preț informativ, la data raportării; prețul valabil e cel din magazin.";
const BASE = "https://monitorulpreturilor.info/pmonsvc/Retail";
const CACHE_KEY = "bonut:official-prices-v1";
const TTL = 24 * 3600 * 1000;

export type OfficialOffer = { store: string; network?: string; address?: string; price: number; date?: string };
export type OfficialResult = { product: string; city: string; offers: OfficialOffer[]; fetchedAt: string };
export type TextFetcher = (url: string) => Promise<string | undefined>;

// Parser mic, fără DOM (merge la fel pe telefon și în teste); ignoră prefixele de namespace.
const blocks = (xml: string, tag: string) => Array.from(xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g")), (m) => m[1]);
const strip = (xml: string, tags: string[]) => tags.reduce((acc, tag) => acc.replace(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?</(?:\\w+:)?${tag}>`, "g"), ""), xml);
const decode = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const field = (xml: string, tag: string) => decode((blocks(xml, tag)[0] || "").trim());

export function parseCatalogProducts(xml: string): Array<{ id: string; name: string }> {
  return blocks(xml, "CatalogProduct").map((b) => { const own = strip(b, ["Prodcateg", "Logo"]); return { id: field(own, "Id"), name: field(own, "Name") }; }).filter((p) => p.id && p.name);
}

export function parseUats(xml: string): Array<{ id: string; name: string }> {
  return blocks(xml, "UAT").map((b) => ({ id: field(b, "Id"), name: field(b, "Name") })).filter((u) => u.id);
}

export function parseStoreOffers(xml: string, productId: string): OfficialOffer[] {
  const out: OfficialOffer[] = [];
  for (const store of blocks(xml, "RetailStore")) {
    const own = strip(store, ["Retailnetwork", "Addr", "Products", "Product", "Type", "Logo"]);
    const network = field(blocks(store, "Retailnetwork")[0] || "", "Name");
    const address = field(blocks(store, "Addr")[0] || "", "Addrstring");
    for (const prod of blocks(store, "Product")) {
      const catId = field(blocks(prod, "Catprod")[0] || "", "Id");
      if (catId && catId !== productId) continue;
      const price = Number(field(strip(prod, ["Catprod"]), "Price").replace(",", "."));
      if (!(price > 0)) continue;
      const date = field(prod, "Pricedate");
      out.push({ store: field(own, "Name"), ...(network ? { network } : {}), ...(address ? { address } : {}), price, ...(date ? { date: date.slice(0, 10) } : {}) });
    }
  }
  return out.sort((a, b) => a.price - b.price).slice(0, 10);
}

type Cache = Record<string, OfficialResult>;
const readCache = (storage: Pick<Storage, "getItem">): Cache => { try { return JSON.parse(storage.getItem(CACHE_KEY) || "{}") as Cache; } catch { return {}; } };

export async function nativeFetchText(url: string): Promise<string | undefined> {
  const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return undefined;
  const response = await CapacitorHttp.get({ url, responseType: "text", connectTimeout: 8000, readTimeout: 8000 });
  return response.status === 200 && typeof response.data === "string" ? response.data : undefined;
}

/** O căutare: produsul (după nume) în orașul dat. Cache 24 h pe telefon. Oprită cât flagul e false. */
export async function lookupOfficialPrice(productName: string, city: string, options: { enabled?: boolean; fetcher?: TextFetcher; storage?: Pick<Storage, "getItem" | "setItem">; now?: number } = {}): Promise<OfficialResult | undefined> {
  const enabled = options.enabled ?? OFFICIAL_PRICES_ENABLED;
  if (!enabled || !productName.trim() || !city.trim()) return undefined;
  const storage = options.storage ?? window.localStorage;
  const now = options.now ?? Date.now();
  const key = `${productName.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
  const cache = readCache(storage);
  const hit = cache[key];
  if (hit && now - Date.parse(hit.fetchedAt) < TTL) return hit;
  const fetcher = options.fetcher ?? nativeFetchText;
  try {
    const products = parseCatalogProducts((await fetcher(`${BASE}/GetCatalogProductsByNameNetwork?prodname=${encodeURIComponent(productName.trim())}`)) || "");
    const uats = parseUats((await fetcher(`${BASE}/GetUATByName?uatname=${encodeURIComponent(city.trim())}`)) || "");
    if (!products.length || !uats.length) return undefined;
    const offers = parseStoreOffers((await fetcher(`${BASE}/GetStoresForProductsByUat?uatId=${uats[0].id}&csvprodids=${products[0].id}&csvnetworkids=&OrderBy=price`)) || "", products[0].id);
    const result: OfficialResult = { product: products[0].name, city: uats[0].name || city, offers, fetchedAt: new Date(now).toISOString() };
    const fresh = Object.fromEntries(Object.entries(cache).filter(([, value]) => now - Date.parse(value.fetchedAt) < TTL).slice(-50));
    storage.setItem(CACHE_KEY, JSON.stringify({ ...fresh, [key]: result }));
    return result;
  } catch {
    return undefined;
  }
}
