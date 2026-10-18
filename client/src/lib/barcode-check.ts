/**
 * Verificarea în magazin cu codul de bare: EAN → produsul tău din bonuri → ultimul preț plătit,
 * unde, și cel mai mic preț din magazinele tale. Bonurile nu au EAN tipărit, așa că legătura
 * cod → produs se învață o dată (sugerată din numele Open Food Facts, confirmată de om) și se
 * sincronizează în familie (barcode-links.ts); legăturile vechi, doar locale, se citesc în continuare. Prețurile vin doar din bonurile tale; nimic estimat.
 */
import type { ProductObservation } from "./personal-inflation";

export const BARCODE_LINKS_KEY = "bonut:barcode-links-v1";

export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function readBarcodeLinks(storage: Pick<Storage, "getItem"> = window.localStorage): Record<string, string> {
  try { const v = JSON.parse(storage.getItem(BARCODE_LINKS_KEY) || "{}"); return v && typeof v === "object" ? v as Record<string, string> : {}; } catch { return {}; }
}

const fold = (text: string) => text.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Cuvintele unui nume, cu gramajul lipit („2 L” → „2l”, „1,5 l” → „1.5l”, „500 ML” → „0.5l”). */
export function nameTokens(text: string): { words: string[]; sizes: string[] } {
  const sizes: string[] = [];
  const rest = fold(text).replace(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l|cl)\b/g, (_m, n: string, u: string) => {
    let v = Number(n.replace(",", ".")); let unit = u === "gr" ? "g" : u;
    if (unit === "g") { v /= 1000; unit = "kg"; } else if (unit === "ml") { v /= 1000; unit = "l"; } else if (unit === "cl") { v /= 100; unit = "l"; }
    sizes.push(`${Math.round(v * 1000) / 1000}${unit}`); return " ";
  });
  const words = rest.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !/^\d+$/.test(w));
  return { words, sizes };
}
const near = (a: string, b: string): number => {
  if (a === b) return 1;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 3 && l.startsWith(s)) return 0.85;
  if (s.length >= 4 && l.length - s.length <= 1) { let diff = 0; for (let i = 0, j = 0; i < l.length && diff < 2; i++, j++) if (s[j] !== l[i]) { diff++; if (s.length < l.length) j--; } if (diff <= 1) return 0.7; }
  return 0;
};
/** Cât de apropiate sunt două nume de produs (0..1): cuvinte, abrevieri de bon și gramaj. */
export function nameScore(a: string, b: string): number {
  const x = nameTokens(a), y = nameTokens(b);
  if (!x.words.length || !y.words.length) return 0;
  const best = (from: string[], to: string[]) => from.reduce((sum, w) => sum + Math.max(0, ...to.map((v) => near(w, v))), 0);
  const score = (best(x.words, y.words) + best(y.words, x.words)) / (x.words.length + y.words.length);
  if (x.sizes.length && y.sizes.length) return x.sizes.some((v) => y.sizes.includes(v)) ? Math.min(1, score + 0.15) : score * 0.5;
  return score;
}

/** Produsele tale cele mai apropiate de un nume (ex. cel din Open Food Facts), după cuvinte, abrevieri și gramaj. */
export function suggestProducts(name: string, observations: ReadonlyArray<ProductObservation>, limit = 5): Array<{ key: string; label: string; score: number }> {
  const best = new Map<string, { key: string; label: string; score: number }>();
  for (const obs of observations) {
    const score = Math.max(nameScore(name, obs.label), nameScore(name, `${obs.brand || ""} ${obs.label}`));
    if (score < 0.3) continue;
    const id = `${obs.key}\u0000${obs.label}`;
    if (!best.has(id) || best.get(id)!.score < score) best.set(id, { key: obs.key, label: obs.label, score: Math.round(score * 100) / 100 });
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Potrivirea sigură: scor mare și clar peste a doua variantă. */
export const confidentMatch = <T extends { key: string; score: number }>(list: ReadonlyArray<T>): T | undefined => (list[0] && list[0].score >= 0.6 && (!list[1] || list[0].score - list[1].score >= 0.15) ? list[0] : undefined);

/** Prețul de pe raft față de ultimul plătit: procentul (pozitiv = mai scump acum). */
export function shelfDiff(shelf: number, last: number): number | undefined {
  if (!(shelf > 0) || !(last > 0)) return undefined;
  return Math.round(((shelf - last) / last) * 1000) / 10;
}

export type BarcodeVerdict = {
  label: string;
  last: { price: number; per: string; vendor: string; date: string };
  cheapest?: { price: number; per: string; vendor: string; date: string };
  count: number;
  /** Plătit înainte de ultima dată (aceeași unitate), pentru săgeata de trend. */
  previous?: { price: number; per: string; vendor: string; date: string };
  /** Diferența procentuală ultima vs. anterioara. */
  trend?: number;
};

/** Ce știi despre produs din bonurile tale: ultimul preț și cel mai mic din ultimele 90 de zile. */
export function verdictFor(productKey: string, observations: ReadonlyArray<ProductObservation>, today: string, preferLabel?: string): BarcodeVerdict | undefined {
  const sorted = observations.filter((o) => o.key === productKey).sort((a, b) => b.date.localeCompare(a.date));
  const want = preferLabel ? nameTokens(preferLabel).sizes.join("+") : "";
  const lead = want ? sorted.find((o) => nameTokens(o.label).sizes.join("+") === want) : undefined;
  const all = lead ? [lead, ...sorted.filter((o) => o !== lead)] : sorted;
  if (!all.length) return undefined;
  // Pe bucată, doar același ambalaj: „TUSNAD 2L” nu se compară cu „TUSNAD 0.5L”.
  const sizeOf = (o: ProductObservation) => nameTokens(o.label).sizes.join("+");
  const rows = all[0].per === "buc" ? all.filter((o) => o.per !== "buc" || sizeOf(o) === sizeOf(all[0])) : all;
  const pick = (o: ProductObservation) => ({ price: o.price, per: o.per, vendor: o.vendor, date: o.date });
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const recent = rows.filter((o) => o.date >= since && o.per === rows[0].per);
  const low = recent.reduce<ProductObservation | undefined>((m, o) => (!m || o.price < m.price ? o : m), undefined);
  const prev = rows.slice(1).find((o) => o.per === rows[0].per);
  const trend = prev ? shelfDiff(rows[0].price, prev.price) : undefined;
  return { label: rows[0].label, last: pick(rows[0]), ...(low && low.price < rows[0].price - 0.004 ? { cheapest: pick(low) } : {}), count: rows.length, ...(prev ? { previous: pick(prev), trend } : {}) };
}

/** Numele produsului din Open Food Facts (date deschise ODbL), doar ca sugestie. */
export async function openFoodFactsName(ean: string, fetcher: typeof fetch = fetch): Promise<string | undefined> {
  try {
    const response = await fetcher(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,brands,quantity`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return undefined;
    const body = await response.json() as { product?: { product_name?: string; brands?: string; quantity?: string } };
    const p = body.product;
    const name = [p?.brands?.split(",")[0], p?.product_name, p?.quantity].filter(Boolean).join(" ").trim();
    return name || undefined;
  } catch { return undefined; }
}
