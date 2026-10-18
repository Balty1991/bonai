/**
 * Numele unui cod de bare din surse gratuite, cu licență care permite folosirea într-o aplicație comercială:
 *   1–4. Open Food Facts / Open Pet Food Facts / Open Products Facts / Open Beauty Facts — ODbL (atribuire, share-alike pe date)
 *   5.   Wikidata (proprietatea P3962 GTIN) — CC0
 * Respinse (vezi docs/ARHITECTURA.md): UPCitemdb trial (termenii nu acordă uz comercial gratuit), opengtindb (cheie
 * cerută pe e-mail, date GFDL), GS1 GEPIR/Verified by GS1 (interzice reutilizarea), Barcode Lookup și EAN-Search (chei plătite).
 * Toate se cer direct de pe telefon (au CORS), fără chei. Răspunsurile se țin local; fără internet se folosește ce e în cache.
 */
export type BarcodeSource = "off" | "opff" | "opf" | "obf" | "wikidata";
export type BarcodeProduct = { name: string; brand?: string; quantity?: string; image?: string; source: BarcodeSource; category?: string; tags?: string[] };
export type BarcodeLookup = { product?: BarcodeProduct; offline?: boolean };

export const BARCODE_SOURCES: Record<BarcodeSource, { label: string; url: string; license: string }> = {
  off: { label: "Open Food Facts", url: "https://world.openfoodfacts.org", license: "ODbL 1.0" },
  opff: { label: "Open Pet Food Facts", url: "https://world.openpetfoodfacts.org", license: "ODbL 1.0" },
  opf: { label: "Open Products Facts", url: "https://world.openproductsfacts.org", license: "ODbL 1.0" },
  obf: { label: "Open Beauty Facts", url: "https://world.openbeautyfacts.org", license: "ODbL 1.0" },
  wikidata: { label: "Wikidata", url: "https://www.wikidata.org", license: "CC0 1.0" },
};

const CACHE_KEY = "bonai:barcode-cache-v1";
const HIT_DAYS = 30, MISS_DAYS = 3, COOLDOWN_MS = 10 * 60_000;
type Cached = { at: number; product?: BarcodeProduct };
const cooldown = new Map<BarcodeSource, number>();
const APP = "app_name=BonAI&app_version=1";

/** Categoriile Open Facts (en:…) → categoriile BonAI. Ordinea contează: „apă” înaintea „băuturi”. */
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/en:(baby|infant)/, "Consumabile copil"],
  [/en:(waters|mineral-waters|spring-waters)/, "Apă"],
  [/en:(sweets|confectioneries|chocolates|candies|biscuits|cakes|desserts|ice-creams|sweet-snacks)/, "Dulciuri"],
  [/en:(beverages|alcoholic-beverages|beers|wines|spirits|juices|sodas|coffees|teas)/, "Băuturi"],
  [/en:(cat-food|dog-food|pet-food|pet)/, "Animale"],
  [/en:(medicines|dietary-supplements|vitamins|pharmacy|cosmetics|hygiene|shampoos|toothpastes|deodorants|skin-care|soaps)/, "Sănătate"],
  [/en:(cleaning|household|detergents|dishwashing|laundry|paper-towels|toilet-paper)/, "Casă & facturi"],
  [/en:(electronics|batteries|light-bulbs|tools)/, "Casă & facturi"],
  [/en:(plant-based-foods|dairies|meats|fishes|cereals|breads|fruits|vegetables|groceries|snacks|foods|cheeses|eggs|condiments|frozen-foods)/, "Alimente"],
];
const DOMAIN_CATEGORY: Partial<Record<BarcodeSource, string>> = { opff: "Animale", obf: "Sănătate", opf: "Casă & facturi" };

/** Categoria BonAI a produsului; „Animale” cade pe „Altele” dacă familia n-are categoria asta. */
export function bonaiCategory(tags: ReadonlyArray<string>, source: BarcodeSource, categories: ReadonlyArray<string>): string | undefined {
  const found = CATEGORY_RULES.find(([re]) => tags.some((tag) => re.test(tag)))?.[1] || DOMAIN_CATEGORY[source];
  if (!found) return undefined;
  if (categories.includes(found)) return found;
  const custom = found === "Animale" ? categories.find((c) => /anima|pet/i.test(c)) : undefined;
  return custom || (found === "Animale" ? "Altele" : found);
}

function readCache(storage?: Pick<Storage, "getItem">): Record<string, Cached> {
  try { return JSON.parse((storage ?? window.localStorage).getItem(CACHE_KEY) || "{}") as Record<string, Cached>; } catch { return {}; }
}
function writeCache(ean: string, entry: Cached, storage?: Pick<Storage, "getItem" | "setItem">) {
  try {
    const all = readCache(storage); all[ean] = entry;
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at).slice(0, 500);
    (storage ?? window.localStorage).setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, all[k]]))));
  } catch { /* fără stocare */ }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function openFacts(source: Exclude<BarcodeSource, "wikidata">, ean: string, fetcher: Fetcher): Promise<BarcodeProduct | undefined> {
  const host = BARCODE_SOURCES[source].url;
  const response = await fetcher(`${host}/api/v2/product/${ean}.json?fields=product_name,product_name_ro,generic_name,brands,quantity,image_front_small_url,categories_tags&${APP}`, { signal: AbortSignal.timeout(5000) });
  if (response.status === 429) { cooldown.set(source, Date.now() + COOLDOWN_MS); return undefined; }
  if (!response.ok) return undefined;
  const body = await response.json() as { status?: number; product?: { product_name?: string; product_name_ro?: string; generic_name?: string; brands?: string; quantity?: string; image_front_small_url?: string; categories_tags?: string[] } };
  const p = body.product;
  const name = (p?.product_name_ro || p?.product_name || p?.generic_name || "").trim();
  if (!body.status || !p || !name) return undefined;
  return { name, brand: p.brands?.split(",")[0]?.trim() || undefined, quantity: p.quantity?.trim() || undefined, image: p.image_front_small_url?.startsWith("https://") ? p.image_front_small_url : undefined, source, tags: p.categories_tags || [] };
}

async function wikidata(ean: string, fetcher: Fetcher): Promise<BarcodeProduct | undefined> {
  const query = `SELECT ?itemLabel WHERE { ?item wdt:P3962 "${ean}". SERVICE wikibase:label { bd:serviceParam wikibase:language "ro,en". } } LIMIT 1`;
  const response = await fetcher(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(5000) });
  if (response.status === 429) { cooldown.set("wikidata", Date.now() + COOLDOWN_MS); return undefined; }
  if (!response.ok) return undefined;
  const body = await response.json() as { results?: { bindings?: Array<{ itemLabel?: { value?: string } }> } };
  const name = body.results?.bindings?.[0]?.itemLabel?.value;
  return name && !/^Q\d+$/.test(name) ? { name, source: "wikidata" } : undefined;
}

/**
 * Caută codul: cache → Open Food Facts → celelalte trei Open Facts (în paralel) → Wikidata.
 * Fiecare sursă are 5 s; una care răspunde 429 se sare 10 minute. Fără internet: doar cache-ul.
 */
export async function lookupBarcode(ean: string, categories: ReadonlyArray<string> = [], options: { fetcher?: Fetcher; storage?: Pick<Storage, "getItem" | "setItem">; online?: boolean; now?: number } = {}): Promise<BarcodeLookup> {
  const now = options.now ?? Date.now();
  const cached = readCache(options.storage)[ean];
  const fresh = cached && now - cached.at < (cached.product ? HIT_DAYS : MISS_DAYS) * 86_400_000;
  const withCategory = (p?: BarcodeProduct) => (p ? { ...p, category: bonaiCategory(p.tags || [], p.source, categories) } : undefined);
  if (fresh) return { product: withCategory(cached.product) };
  const online = options.online ?? (typeof navigator === "undefined" || navigator.onLine !== false);
  if (!online) return { product: withCategory(cached?.product), offline: true };
  const fetcher: Fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  const safe = async (source: BarcodeSource, work: () => Promise<BarcodeProduct | undefined>) => {
    if ((cooldown.get(source) || 0) > now) return undefined;
    try { return await work(); } catch { return undefined; }
  };
  let product = await safe("off", () => openFacts("off", ean, fetcher));
  if (!product) {
    const others = await Promise.all((["opff", "opf", "obf"] as const).map((s) => safe(s, () => openFacts(s, ean, fetcher))));
    product = others.find(Boolean);
  }
  product ??= await safe("wikidata", () => wikidata(ean, fetcher));
  writeCache(ean, { at: now, product }, options.storage);
  return { product: withCategory(product) };
}

/** „Tușnad Apă minerală 2 L”: marca, numele și cantitatea, fără repetiții. */
export function productTitle(p: Pick<BarcodeProduct, "name" | "brand" | "quantity">): string {
  const brand = p.brand && !p.name.toLocaleLowerCase("ro-RO").includes(p.brand.toLocaleLowerCase("ro-RO")) ? p.brand : "";
  return [brand, p.name, p.quantity].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
