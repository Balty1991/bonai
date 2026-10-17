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

const words = (text: string) => text.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 1);

/** Produsele tale cele mai apropiate de un nume (ex. cel din Open Food Facts), după cuvintele comune. */
export function suggestProducts(name: string, observations: ReadonlyArray<ProductObservation>, limit = 5): Array<{ key: string; label: string; score: number }> {
  const want = new Set(words(name));
  if (!want.size) return [];
  const best = new Map<string, { key: string; label: string; score: number }>();
  for (const obs of observations) {
    const have = words(`${obs.brand || ""} ${obs.label}`);
    const common = have.filter((w) => want.has(w)).length;
    if (!common) continue;
    const score = common / Math.max(want.size, new Set(have).size);
    if (!best.has(obs.key) || best.get(obs.key)!.score < score) best.set(obs.key, { key: obs.key, label: obs.label, score });
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, limit);
}

export type BarcodeVerdict = {
  label: string;
  last: { price: number; per: string; vendor: string; date: string };
  cheapest?: { price: number; per: string; vendor: string; date: string };
  count: number;
};

/** Ce știi despre produs din bonurile tale: ultimul preț și cel mai mic din ultimele 90 de zile. */
export function verdictFor(productKey: string, observations: ReadonlyArray<ProductObservation>, today: string): BarcodeVerdict | undefined {
  const rows = observations.filter((o) => o.key === productKey).sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) return undefined;
  const pick = (o: ProductObservation) => ({ price: o.price, per: o.per, vendor: o.vendor, date: o.date });
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const recent = rows.filter((o) => o.date >= since && o.per === rows[0].per);
  const low = recent.reduce<ProductObservation | undefined>((m, o) => (!m || o.price < m.price ? o : m), undefined);
  return { label: rows[0].label, last: pick(rows[0]), ...(low && low.price < rows[0].price - 0.004 ? { cheapest: pick(low) } : {}), count: rows.length };
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

/** Scanerul nativ (ML Kit) pe Android; pe web întoarce undefined și omul scrie codul. */
export async function scanBarcodeNative(): Promise<string | undefined> {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return undefined;
  const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
  const perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== "granted" && perm.camera !== "limited") return undefined;
  const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE] });
  return barcodes[0]?.rawValue || undefined;
}
