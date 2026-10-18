/**
 * Marca magazinului în locul firmei care îl operează: „Sales Consulting” → „Familiaro”,
 * „Lidl Discount SRL” → „Lidl”, „Rewe Romania” → „Penny”. Ordinea: marca tipărită pe bon
 * (rândul cu marca, produsele proprii „FAMILIARO SACOSA”), apoi firma sau CUI-ul cunoscut.
 * Nu ghicește: un nume necunoscut rămâne cum era.
 */

/** Mărcile pe care le recunoaștem în textul bonului (produse proprii, antet). */
const BRANDS = ["Mega Image", "Lidl", "Kaufland", "Carrefour", "Profi", "Penny", "Auchan", "Dedeman", "eMAG", "Familiaro", "Cora", "Selgros", "Metro", "Leroy Merlin", "Brico Dépôt", "Hornbach", "Altex", "Flanco", "Catena", "Dr. Max", "Help Net", "Sensiblu", "Farmacia Tei", "Benu", "Ropharma", "Petrom", "OMV", "MOL", "Rompetrol", "Lukoil", "Socar", "Annabella", "Diana", "La Doi Pași", "Shop&Go", "Pepco", "Sinsay", "dm", "Douglas", "Jysk", "IKEA", "Decathlon"] as const;

/** Firma (fără S.C./S.R.L./S.A.) → marca. Doar operatori cunoscuți public. */
const COMPANIES: Array<[RegExp, string]> = [
  [/^mega image\b/i, "Mega Image"],
  [/^lidl( discount| romania)?\b/i, "Lidl"],
  [/^kaufland( romania)?\b/i, "Kaufland"],
  [/^(carrefour( romania)?|artima)\b/i, "Carrefour"],
  [/^profi( rom food)?\b/i, "Profi"],
  [/^(penny( market)?|rewe( romania)?)\b/i, "Penny"],
  [/^auchan( romania)?\b/i, "Auchan"],
  [/^dedeman\b/i, "Dedeman"],
  [/^(emag|dante international)\b/i, "eMAG"],
  [/^sales consulting\b/i, "Familiaro"],
  [/^(cora|romania hypermarche)\b/i, "Cora"],
  [/^selgros( cash & carry)?\b/i, "Selgros"],
  [/^metro cash/i, "Metro"],
  [/^(fildas|catena)\b/i, "Catena"],
  [/^(dr\.? ?max|mediplus|sibapharm)\b/i, "Dr. Max"],
  [/^help ?net\b/i, "Help Net"],
  [/^(sensiblu|a&d pharma)\b/i, "Sensiblu"],
  [/^(farmacia tei|tei pharm|ropharma)\b/i, "Farmacia Tei"],
  [/^benu\b/i, "Benu"],
  [/^(omv petrom marketing|petrom)\b/i, "Petrom"],
  [/^omv\b/i, "OMV"],
  [/^mol romania\b/i, "MOL"],
  [/^rompetrol( downstream)?\b/i, "Rompetrol"],
  [/^lukoil\b/i, "Lukoil"],
  [/^socar\b/i, "Socar"],
  [/^altex( romania)?\b/i, "Altex"],
  [/^leroy merlin\b/i, "Leroy Merlin"],
  [/^(hornbach)\b/i, "Hornbach"],
];

/** CUI-uri citite de pe bonuri reale (antetul arată marca lângă firmă). */
const CUIS: Record<string, string> = { "16329188": "Familiaro" };

const clean = (name: string) => name.replace(/\b(s\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|i\.?\s?i\.?|p\.?\s?f\.?\s?a\.?)(?=\s|$)/gi, " ").replace(/[.,]+$/g, "").replace(/\s+/g, " ").trim();
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Marca găsită în textul produselor: „FAMILIARO SACOSA…”, „KAUFLAND PUNGA”, „K-CLASSIC” nu. */
function brandInItems(items: ReadonlyArray<string>): string | undefined {
  for (const raw of items) {
    const text = norm(raw);
    if (!/\b(sacos|pung|bag)/.test(text)) continue;
    const hit = BRANDS.find((brand) => text.startsWith(norm(brand) + " ") || text.includes(` ${norm(brand)} `));
    if (hit) return hit;
  }
  return undefined;
}

/** Marca sigură sau nimic. */
export function knownBrand(store: string, extra: { cui?: string; items?: ReadonlyArray<string> } = {}): string | undefined {
  const name = clean(String(store || ""));
  const known = BRANDS.find((brand) => norm(name) === norm(brand));
  if (known) return known;
  const cui = String(extra.cui || "").replace(/\D/g, "");
  if (cui && CUIS[cui]) return CUIS[cui];
  for (const [pattern, brand] of COMPANIES) if (pattern.test(name)) return brand;
  return extra.items ? brandInItems(extra.items) : undefined;
}

export function storeBrand(store: string, extra: { cui?: string; items?: ReadonlyArray<string> } = {}): string {
  return knownBrand(store, extra) || clean(String(store || "")) || String(store || "").trim();
}

/** Titlul bonului salvat: „Cumpărături Sales Consulting” → „Cumpărături Familiaro”; restul nu se atinge. */
export function rebrandVendor(vendor: string, extra: { cui?: string; items?: ReadonlyArray<string> } = {}): string {
  const match = /^(Cumpărături|Shopping)\s+(.+)$/.exec(String(vendor || "").trim());
  const core = match ? match[2] : String(vendor || "").trim();
  if (!core) return vendor;
  const brand = knownBrand(core, extra);
  if (!brand || brand === core) return vendor;
  return match ? `${match[1]} ${brand}` : brand;
}
