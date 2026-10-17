import { describe, expect, it } from "vitest";
import type { ProductObservation } from "./personal-inflation";
import { isValidEan, openFoodFactsName, suggestProducts, verdictFor } from "./barcode-check";

const obs = (key: string, label: string, vendor: string, date: string, price: number, brand?: string): ProductObservation => ({ key, label, brand, vendor, date, category: "Alimente", paid: price, price, per: "l", piecePrice: price });

describe("codul de bare în magazin", () => {
  it("verifică cifra de control EAN", () => {
    expect(isValidEan("5941021001421")).toBe(true);
    expect(isValidEan("5941021001422")).toBe(false);
    expect(isValidEan("96385074")).toBe(true);
    expect(isValidEan("abc")).toBe(false);
  });
  const rows = [
    obs("lapte-zuzu", "Lapte Zuzu 1,5% 1L", "Lidl", "2026-10-12", 6.99, "Zuzu"),
    obs("lapte-zuzu", "Lapte Zuzu 1,5% 1L", "Kaufland", "2026-10-15", 7.49, "Zuzu"),
    obs("ulei", "Ulei Spornic 1L", "Profi", "2026-10-01", 8.19),
  ];
  it("sugerează produsul tău după numele din Open Food Facts", () => {
    expect(suggestProducts("Zuzu Lapte de vacă 1.5% 1 l", rows)[0].key).toBe("lapte-zuzu");
    expect(suggestProducts("Cafea", rows)).toEqual([]);
  });
  it("ultimul preț și cel mai mic din bonurile tale", () => {
    expect(verdictFor("lapte-zuzu", rows, "2026-10-18")).toEqual({ label: "Lapte Zuzu 1,5% 1L", last: { price: 7.49, per: "l", vendor: "Kaufland", date: "2026-10-15" }, cheapest: { price: 6.99, per: "l", vendor: "Lidl", date: "2026-10-12" }, count: 2 });
    expect(verdictFor("nimic", rows, "2026-10-18")).toBeUndefined();
  });
  it("Open Food Facts: nume compus, iar la eroare nimic", async () => {
    const ok = (async () => new Response(JSON.stringify({ product: { brands: "Zuzu,Albalact", product_name: "Lapte", quantity: "1 l" } }))) as unknown as typeof fetch;
    expect(await openFoodFactsName("5941021001421", ok)).toBe("Zuzu Lapte 1 l");
    const bad = (async () => { throw new Error("x"); }) as unknown as typeof fetch;
    expect(await openFoodFactsName("5941021001421", bad)).toBeUndefined();
  });
});
