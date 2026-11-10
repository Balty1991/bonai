import { describe, expect, it } from "vitest";
import type { Receipt } from "./finance-data";
import { filterReceiptStatsData, periodRange, periodStats, receiptStoreKey, receiptsByMonth, storeInitials } from "./shop-stats";

const r = (id: string, vendor: string, date: string, amount: number, time?: string): Receipt => ({ id, vendor, date, amount, category: "Alimente", time });
const list = [r("a", "Lidl Discount", "2026-10-18", 50, "18:00"), r("b", "Mega Image", "2026-10-13", 30.5), r("c", "Kaufland", "2026-10-02", 20), r("d", "Lidl", "2026-09-28", 10), r("e", "Profi", "2025-12-31", 5)];

describe("statistici pe perioade", () => {
  it("săptămâna începe luni", () => { expect(periodRange("week", "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" }); });
  it("navighează înapoi", () => { expect(periodRange("month", "2026-10-18", -1)).toEqual({ from: "2026-09-01", to: "2026-09-30" }); expect(periodRange("year", "2026-03-01", -1).from).toBe("2025-01-01"); });
  it("compară totalurile a două luni selectate independent", () => {
    const september = periodStats(list, "month", "2026-09-15");
    const october = periodStats(list, "month", "2026-10-15");
    expect(september.total).toBe(10);
    expect(october.total).toBe(100.5);
    expect(september.title).not.toBe(october.title);
  });
  it("Zi / Săptămână / Lună / An adună doar bonurile din perioadă", () => {
    expect(periodStats(list, "day", "2026-10-18").total).toBe(50);
    const week = periodStats(list, "week", "2026-10-18");
    expect(week.total).toBe(80.5); expect(week.buckets).toHaveLength(7); expect(week.buckets[1]).toMatchObject({ label: "Ma", total: 30.5 });
    const month = periodStats(list, "month", "2026-10-18");
    expect(month.total).toBe(100.5); expect(month.previous).toBe(10); expect(month.buckets).toHaveLength(31); expect(month.title).toBe("Octombrie 2026");
    expect(periodStats(list, "year", "2026-10-18").buckets.map((b) => b.total).slice(8, 10)).toEqual([10, 100.5]);
  });
  it("bonurile pe luni, cea mai nouă prima", () => {
    const g = receiptsByMonth(list);
    expect(g.map((x) => x.month)).toEqual(["2026-10", "2026-09", "2025-12"]);
    expect(g[0].total).toBe(100.5); expect(g[0].receipts[0].id).toBe("a");
  });
  it("filtrează după magazin și categorie, folosind subtotalul din liniile bonului", () => {
    const split: Receipt = { ...r("f", "Lídl", "2026-10-18", 60), lines: [
      { id: "food", category: "Alimente", amount: 40 },
      { id: "care", category: "Îngrijire", amount: 20 },
    ] };
    const category = filterReceiptStatsData([split], { categories: ["Îngrijire"] });
    expect(category).toHaveLength(1);
    expect(category[0]).toMatchObject({ amount: 20, category: "Îngrijire" });
    expect(periodStats(category, "month", "2026-10-18").total).toBe(20);
    const both = filterReceiptStatsData([split, list[2]], { storeKey: receiptStoreKey("Lidl"), categories: ["Alimente"] });
    expect(both.map((receipt) => receipt.amount)).toEqual([40]);
    expect(receiptStoreKey("Lídl")).toBe(receiptStoreKey("Lidl"));
    expect(filterReceiptStatsData([list[0]], { categories: ["Alimente"] })[0].amount).toBe(50);
    expect(split.amount).toBe(60);
  });
  it("inițialele magazinului", () => {
    expect(storeInitials("Mega Image")).toBe("MI"); expect(storeInitials("Lidl Discount")).toBe("LI"); expect(storeInitials("Kaufland")).toBe("KA");
  });
});
