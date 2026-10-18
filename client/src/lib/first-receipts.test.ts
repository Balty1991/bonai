import { describe, expect, it } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { firstReceiptsInsight } from "./first-receipts";

const L = (label: string, amount: number, category = "Alimente", discount?: number) => ({ id: label, label, amount, category, ...(discount ? { discount } : {}) });
describe("prima sesiune", () => {
  it("fără bonuri sau de la al 3-lea nu arată nimic", () => {
    const d = createEmptyAppData();
    expect(firstReceiptsInsight(d)).toBeUndefined();
    d.receipts = [1, 2, 3].map((i) => ({ id: `r${i}`, vendor: "Lidl", amount: 10, category: "Cumpărături", date: `2026-10-0${i}` }));
    expect(firstReceiptsInsight(d)).toBeUndefined();
  });
  it("primul bon: produse, cele mai scumpe, reduceri, categorii, fără SGR", () => {
    const d = createEmptyAppData();
    d.receipts = [{ id: "r1", vendor: "Lidl", amount: 60.5, category: "Cumpărături", date: "2026-10-18", lines: [L("Lapte", 6.99), L("Detergent", 39.9, "Casă", 5), L("Pâine", 5.2, "Alimente", 0.6), L("Garanție SGR", 0.5, "SGR"), L("Ouă", 7.91)] }];
    const i = firstReceiptsInsight(d)!;
    expect(i).toMatchObject({ products: 4, total: 60.5, discounts: 5.6, toTrial: 2, repeated: 0 });
    expect(i.priciest[0]).toEqual({ label: "Detergent", amount: 39.9 });
    expect(i.categories[0]).toMatchObject({ category: "Casă", percent: 66 });
  });
  it("al doilea bon: numără produsele care se repetă", () => {
    const d = createEmptyAppData();
    d.receipts = [
      { id: "r1", vendor: "Lidl", amount: 12, category: "Cumpărături", date: "2026-10-10", lines: [L("Lapte Zuzu 1L", 7), L("Pâine", 5)] },
      { id: "r2", vendor: "Kaufland", amount: 14, category: "Cumpărături", date: "2026-10-18", lines: [L("Lapte  Zuzu 1L", 7.5), L("Ouă", 6.5)] },
    ];
    expect(firstReceiptsInsight(d)).toMatchObject({ receipts: 2, vendor: "Kaufland", repeated: 1, toTrial: 1 });
  });
});
