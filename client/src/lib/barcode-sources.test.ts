import { describe, expect, it } from "vitest";
import { bonaiCategory, lookupBarcode, productTitle } from "./barcode-sources";
import { expenseCategories } from "./finance-data";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("căutarea codurilor de bare", () => {
  it("Open Food Facts: nume, marcă, cantitate, poză, categoria BonAI; apoi din cache", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => { calls.push(url); return json({ status: 1, product: { product_name: "Apă minerală naturală carbogazificată", brands: "Tușnad", quantity: "2 L", image_front_small_url: "https://images.openfoodfacts.org/x.jpg", categories_tags: ["en:beverages", "en:waters"] } }); };
    const storage = mem();
    const first = await lookupBarcode("5942247100868", expenseCategories, { fetcher, storage, online: true, now: 1 });
    expect(first.product).toMatchObject({ source: "off", brand: "Tușnad", quantity: "2 L", category: "Apă" });
    expect(productTitle(first.product!)).toBe("Tușnad Apă minerală naturală carbogazificată 2 L");
    await lookupBarcode("5942247100868", expenseCategories, { fetcher, storage, online: true, now: 2 });
    expect(calls).toHaveLength(1);
  });
  it("hrană pentru pisici: lipsește în OFF, găsită în Open Pet Food Facts", async () => {
    const fetcher = async (url: string) => (url.includes("openpetfoodfacts") ? json({ status: 1, product: { product_name: "Hrană uscată pisici", brands: "Ultima", categories_tags: ["en:cat-food"] } }) : json({ status: 0 }));
    const r = await lookupBarcode("8445292288705", [...expenseCategories, "Animale"], { fetcher, storage: mem(), online: true });
    expect(r.product).toMatchObject({ source: "opff", category: "Animale" });
  });
  it("necunoscut peste tot: Wikidata ultima, apoi „nu știu” ținut minte 3 zile", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => { calls.push(url); return url.includes("wikidata") ? json({ results: { bindings: [] } }) : json({ status: 0 }); };
    const storage = mem();
    expect((await lookupBarcode("8445292288705", [], { fetcher, storage, online: true, now: 0 })).product).toBeUndefined();
    expect(calls.filter((u) => u.includes("wikidata"))).toHaveLength(1);
    await lookupBarcode("8445292288705", [], { fetcher, storage, online: true, now: 86_400_000 });
    expect(calls).toHaveLength(5);
  });
  it("fără internet: nu cere nimic, spune că e offline", async () => {
    const r = await lookupBarcode("5942247100868", [], { fetcher: async () => { throw new Error("nu"); }, storage: mem(), online: false });
    expect(r).toEqual({ product: undefined, offline: true });
  });
  it("categorii: dulciuri, alcool, curățenie, cosmetice; Animale → Altele când lipsește", () => {
    expect(bonaiCategory(["en:chocolates"], "off", expenseCategories)).toBe("Dulciuri");
    expect(bonaiCategory(["en:beers"], "off", expenseCategories)).toBe("Băuturi");
    expect(bonaiCategory([], "opf", expenseCategories)).toBe("Casă & facturi");
    expect(bonaiCategory(["en:shampoos"], "obf", expenseCategories)).toBe("Sănătate");
    expect(bonaiCategory(["en:cat-food"], "opff", expenseCategories)).toBe("Altele");
  });
});
