import { describe, expect, it } from "vitest";
import type { Receipt } from "./finance-data";
import { periodRange, periodStats, receiptsByMonth, storeInitials } from "./shop-stats";

const r = (id: string, vendor: string, date: string, amount: number, time?: string): Receipt => ({ id, vendor, date, amount, category: "Alimente", time });
const list = [r("a", "Lidl Discount", "2026-10-18", 50, "18:00"), r("b", "Mega Image", "2026-10-13", 30.5), r("c", "Kaufland", "2026-10-02", 20), r("d", "Lidl", "2026-09-28", 10), r("e", "Profi", "2025-12-31", 5)];

describe("statistici pe perioade", () => {
  it("săptămâna începe luni", () => { expect(periodRange("week", "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" }); });
  it("navighează înapoi", () => { expect(periodRange("month", "2026-10-18", -1)).toEqual({ from: "2026-09-01", to: "2026-09-30" }); expect(periodRange("year", "2026-03-01", -1).from).toBe("2025-01-01"); });
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
  it("inițialele magazinului", () => {
    expect(storeInitials("Mega Image")).toBe("MI"); expect(storeInitials("Lidl Discount")).toBe("LI"); expect(storeInitials("Kaufland")).toBe("KA");
  });
});
