import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { monthShopping, savingsOpportunity, storeStats, topProducts } from "./shop-insights";

const data = (): AppData => {
  const d = createEmptyAppData();
  d.receipts = [
    { id: "a", vendor: "Lidl", amount: 30, category: "Alimente", date: "2026-10-05", lines: [{ id: "1", category: "Alimente", amount: 10, label: "Lapte Zuzu" }, { id: "2", category: "Alimente", amount: 20, label: "Cafea Jacobs" }] },
    { id: "b", vendor: "Kaufland", amount: 34, category: "Alimente", date: "2026-10-12", lines: [{ id: "1", category: "Alimente", amount: 12, label: "Lapte Zuzu" }, { id: "2", category: "Alimente", amount: 22, label: "Cafea Jacobs" }] },
    { id: "c", vendor: "Lidl", amount: 50, category: "Alimente", date: "2026-09-10", lines: [{ id: "1", category: "Alimente", amount: 50, label: "Cumpărături" }] },
  ];
  return d;
};

describe("aplicația de cumpărături", () => {
  it("luna în bonuri, față de luna trecută până în aceeași zi", () => {
    expect(monthShopping(data(), "2026-10-17")).toMatchObject({ spent: 64, receipts: 2, lastMonthSoFar: 50, lastMonthTotal: 50 });
  });
  it("produsele pe care se duc banii", () => {
    expect(topProducts(data(), "2026-10-17").map((item) => [item.label, item.spent])).toEqual([["Cafea Jacobs", 42], ["Lapte Zuzu", 22]]);
  });
  it("ai fi economisit luând fiecare produs unde l-ai plătit mai puțin", () => {
    const result = savingsOpportunity(data(), "2026-10-17");
    expect(result.total).toBe(4);
    expect(result.items[0]).toMatchObject({ vendor: "Kaufland", cheaperVendor: "Lidl" });
  });
  it("magazinele, cu cât de scumpe sunt față de cel mai ieftin", () => {
    const stats = storeStats(data(), "2026-10-17");
    expect(stats.map((item) => item.vendor)).toEqual(["Lidl", "Kaufland"]);
    expect(stats.find((item) => item.vendor === "Kaufland")?.priceIndex).toBe(15);
    expect(stats.find((item) => item.vendor === "Lidl")?.priceIndex).toBe(0);
  });
});
