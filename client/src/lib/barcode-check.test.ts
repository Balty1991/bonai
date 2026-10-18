import { describe, expect, it } from "vitest";
import type { ProductObservation } from "./personal-inflation";
import { confidentMatch, isValidEan, nameScore, openFoodFactsName, shelfDiff, suggestProducts, verdictFor } from "./barcode-check";
import { firstValidCode, mediaFailure } from "./barcode-scanner";

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
    expect(verdictFor("lapte-zuzu", rows, "2026-10-18")).toEqual({ label: "Lapte Zuzu 1,5% 1L", last: { price: 7.49, per: "l", vendor: "Kaufland", date: "2026-10-15" }, cheapest: { price: 6.99, per: "l", vendor: "Lidl", date: "2026-10-12" }, count: 2, previous: { price: 6.99, per: "l", vendor: "Lidl", date: "2026-10-12" }, trend: 7.2 });
    expect(verdictFor("nimic", rows, "2026-10-18")).toBeUndefined();
  });
  it("Open Food Facts: nume compus, iar la eroare nimic", async () => {
    const ok = (async () => new Response(JSON.stringify({ product: { brands: "Zuzu,Albalact", product_name: "Lapte", quantity: "1 l" } }))) as unknown as typeof fetch;
    expect(await openFoodFactsName("5941021001421", ok)).toBe("Zuzu Lapte 1 l");
    const bad = (async () => { throw new Error("x"); }) as unknown as typeof fetch;
    expect(await openFoodFactsName("5941021001421", bad)).toBeUndefined();
  });
  it("leagă numele Open Food Facts de abrevierea de pe bon, cu gramajul", () => {
    const bon = [obs("apa-tusnad-2l", "APA MIN TUSNAD 2L", "Kaufland", "2026-10-10", 3.2), obs("apa-borsec-2l", "APA MIN BORSEC 2L", "Lidl", "2026-10-11", 3.4), obs("apa-tusnad-05", "APA MIN TUSNAD 0.5L", "Profi", "2026-10-09", 2.1)];
    const list = suggestProducts("Tușnad Apă minerală carbogazoasă 2 L", bon);
    expect(list[0].key).toBe("apa-tusnad-2l");
    expect(confidentMatch(list)?.label).toBe("APA MIN TUSNAD 2L");
    expect(nameScore("Apă 2 L", "APA 500ML")).toBeLessThan(nameScore("Apă 2 L", "APA 2L"));
    expect(confidentMatch(suggestProducts("Apă minerală 2 L", bon))).toBeUndefined();
  });
  it("compară prețul de pe raft cu ultimul plătit", () => {
    expect(shelfDiff(8.24, 7.49)).toBe(10);
    expect(shelfDiff(6.74, 7.49)).toBe(-10);
    expect(shelfDiff(0, 7.49)).toBeUndefined();
  });
  it("scanerul spune de ce nu pornește camera", () => {
    expect(mediaFailure({ name: "NotAllowedError" })).toBe("denied");
    expect(mediaFailure({ name: "NotFoundError" })).toBe("nocamera");
    expect(mediaFailure(new Error("x"))).toBe("failed");
    expect(firstValidCode(["abc", "5942247100868"])).toBe("5942247100868");
  });
  it("pe bucată nu amestecă ambalajele diferite", () => {
    const buc = (label: string, vendor: string, date: string, price: number): ProductObservation => ({ ...obs("tusnad", label, vendor, date, price), per: "buc" });
    const v = verdictFor("tusnad", [buc("APA MIN TUSNAD 2L", "Kaufland", "2026-09-28", 3), buc("APA MIN TUSNAD 0.5L", "Lidl", "2026-10-14", 2.1), buc("APA MIN TUSNAD 2L", "Lidl", "2026-10-14", 3.2)], "2026-10-18", "Tușnad 2 L");
    expect(v?.last.price).toBe(3.2);
    expect(v?.previous?.price).toBe(3);
    expect(v?.cheapest?.price).toBe(3);
  });
});
