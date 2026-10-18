import { describe, expect, it } from "vitest";
import { groupRows, rowsFromPrefill, titleCaseProduct, totalGap } from "./receipt-review-model";

describe("ecranul de verificare a bonului", () => {
  it("scrie denumirile frumos, fără să piardă textul original", () => {
    expect(titleCaseProduct("KINDER DELICE T1 39G")).toBe("Kinder Delice T1 39 g");
    expect(titleCaseProduct("AYA VODCA 40 ST.0.5L SGR")).toBe("Aya Vodca 40 St.0.5l Sgr");
    expect(titleCaseProduct("Lapte 1,5%")).toBe("Lapte 1,5%");
  });
  it("grupează pe categorii și verifică totalul", () => {
    const rows = rowsFromPrefill({ title: "Bon", amount: 20, category: "Alimente", discount: 0, count: 3, lines: [{ label: "PAINE", amount: 5, category: "Alimente" }, { label: "LAPTE", amount: 7, category: "Alimente" }, { label: "SAPUN", amount: 6, category: "Casă & facturi" }] });
    expect(rows[0].raw).toBe("PAINE");
    const groups = groupRows(rows);
    expect(groups[0]).toMatchObject({ category: "Alimente", total: 12 });
    expect(totalGap(20, rows)).toBe(2);
    expect(totalGap(18, rows)).toBe(0);
    expect(totalGap(0, rows)).toBe(0);
  });
});
