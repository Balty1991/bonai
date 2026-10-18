import { describe, expect, it } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { parseAmount, quickExpenseTransaction, quickSuggestions, spendEntries } from "./quick-expense";
import { periodStats } from "./shop-stats";

describe("cheltuiala fără bon", () => {
  it("citește suma cu virgulă și refuză textul", () => {
    expect(parseAmount("25,5")).toBe(25.5);
    expect(parseAmount("12.30 lei")).toBe(12.3);
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount("1,234")).toBe(0);
  });
  it("e o mișcare simplă, fără bon, care intră în statistici pe categoria ei și se poate repeta", () => {
    const base = createEmptyAppData();
    const taxi = quickExpenseTransaction(base, { amount: 25, category: "Taxi", place: "Bolt", date: "2026-10-18" });
    expect(taxi).toMatchObject({ kind: "expense", amount: 25, category: "Taxi", title: "Bolt", date: "2026-10-18" });
    const data = { ...base, transactions: [taxi, quickExpenseTransaction(base, { amount: 25, category: "Taxi", place: "Bolt", date: "2026-10-17" }), quickExpenseTransaction(base, { amount: 9, category: "Cafea", date: "2026-10-18" })] };
    expect(data.receipts).toEqual([]);
    const stats = periodStats(spendEntries(data), "month", "2026-10-18");
    expect(stats.total).toBe(59);
    const s = quickSuggestions(data);
    expect(s.repeats[0]).toMatchObject({ category: "Taxi", place: "Bolt", amount: 25, count: 2 });
    expect(s.categories[0]).toBe("Taxi");
  });
});
