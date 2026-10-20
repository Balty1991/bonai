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

describe("ce intră la cumpărături", () => {
  it("transferurile între carduri și corecțiile de sold ies; ratele și facturile stau separat", async () => {
    const { fixedCostEntries } = await import("./quick-expense");
    const { monthShopping } = await import("./shop-insights");
    const data = createEmptyAppData();
    const tx = (id: string, category: string, amount: number, extra: Record<string, unknown> = {}) => ({ id, title: category, amount, kind: "expense" as const, category, source: "", person: "", date: "2026-10-14", ...extra });
    data.transactions = [
      tx("t-taxi", "Transport", 25),
      tx("transfer-1-out", "Transfer", 624.28, { transferId: "transfer-1" }),
      tx("balance-check-1", "Altele", 232.99, { adjustment: true }),
      tx("t-rata", "Rate produse", 175, { debtId: "d1" }),
      tx("t-lumina", "Casă & facturi", 300),
      tx("t-abonament", "Abonamente", 55),
    ];
    data.receipts = [{ id: "r1", vendor: "Lidl", amount: 100, category: "Alimente", date: "2026-10-12" }];
    expect(spendEntries(data).map((entry) => entry.id)).toEqual(["r1", "t-taxi"]);
    expect(fixedCostEntries(data).map((entry) => entry.id)).toEqual(["t-rata", "t-lumina", "t-abonament"]);
    expect(monthShopping(data, "2026-10-20")).toMatchObject({ spent: 125, receipts: 1, loose: 1, fixed: 530 });
  });
});
