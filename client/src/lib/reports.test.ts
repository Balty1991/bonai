import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { buildReport, reportRange, reportTitle } from "./reports";

const data = (): AppData => {
  const d = createEmptyAppData();
  const tx = (id: string, category: string, amount: number, date: string, extra: Record<string, unknown> = {}) => ({ id, title: category, amount, kind: "expense" as const, category, source: "", person: "", date, ...extra });
  d.debts = [
    { id: "emag", name: "Emag telefon", remaining: 100, monthly: 50, due: "", tone: "coral", kind: "card" },
    { id: "bank", name: "Raiffeisen", remaining: 9000, monthly: 600, due: "", tone: "coral", kind: "credit" },
  ];
  d.receipts = [
    { id: "r1", vendor: "Lidl", amount: 30, category: "Alimente", date: "2026-10-05", lines: [{ id: "a", category: "Alimente", amount: 10, label: "Lapte Zuzu" }, { id: "b", category: "Dulciuri", amount: 20, label: "Ciocolată Milka" }] },
    { id: "r2", vendor: "Kaufland", amount: 12, category: "Alimente", date: "2026-09-20", lines: [{ id: "a", category: "Alimente", amount: 12, label: "Lapte Zuzu" }] },
  ];
  d.transactions = [
    tx("taxi", "Transport", 25, "2026-10-06"),
    tx("t1-out", "Transfer", 500, "2026-10-07", { transferId: "t1" }),
    tx("rata-emag", "Rate produse", 50, "2026-10-10", { debtId: "emag" }),
    tx("rata-bank", "Rate produse", 600, "2026-10-10", { debtId: "bank" }),
    tx("netflix", "Abonamente", 60, "2026-10-12"),
    tx("lumina", "Casă & facturi", 300, "2026-10-14"),
  ];
  return d;
};

describe("rapoarte", () => {
  it("produsul ambalat are prețul pe bucată, nu pe kg (Actimel 4 × 100 g)", () => {
    const d = createEmptyAppData();
    d.receipts = [{ id: "r", vendor: "Familiaro", amount: 16.98, category: "Alimente", date: "2026-10-05", lines: [{ id: "a", category: "Alimente", amount: 16.98, label: "Iaurt de băut Actimel 4 × 100 g", size: 400, sizeUnit: "g", qty: 1 }] }];
    const row = buildReport(d, "month", "2026-10-20").products[0];
    expect(row).toMatchObject({ avgPrice: 16.98, per: "buc" });
  });

  it("perioadele: săptămâna de luni, trimestrul, anul", () => {
    expect(reportRange("week", "2026-10-20")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(reportRange("quarter", "2026-10-20")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(reportRange("quarter", "2026-10-20", -1)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(reportRange("year", "2026-10-20")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(reportTitle("quarter", "2026-10-01", "2026-12-31")).toBe("T4 2026");
  });

  it("cumpărăturile pe categorii, produse și magazine, fără transferuri; plățile fixe separat", () => {
    const report = buildReport(data(), "month", "2026-10-20");
    expect(report.shopping).toMatchObject({ total: 55, previous: 12, receipts: 1, loose: 1 });
    expect(report.categories.map((row) => [row.label, row.amount])).toEqual([["Transport", 25], ["Dulciuri", 20], ["Alimente", 10]]);
    expect(report.products.find((row) => row.label === "Lapte Zuzu")).toMatchObject({ amount: 10, previous: 12 });
    expect(report.stores.map((row) => row.label)).toEqual(["Lidl", "Transport"]);
    expect(Object.fromEntries(report.fixed.groups.map((group) => [group.id, group.total]))).toEqual({ rates: 50, loans: 600, subscriptions: 60, bills: 300 });
    expect(report.total).toBe(1065);
  });
});
