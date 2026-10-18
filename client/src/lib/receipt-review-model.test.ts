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
    // Mega Image: produse cântărite rotunjite de casă, 89,94 față de 89,91 tipărit: se potrivește.
    expect(totalGap(17.97, rows)).toBe(0);
    expect(totalGap(17.9, rows)).toBe(-0.1);
    expect(totalGap(0, rows)).toBe(0);
  });
});

describe("cantitatea din nume", () => {
  it("o scoate la afișare și o pune la loc la salvare", async () => {
    const { stripQtySuffix, labelWithQty } = await import("./receipt-review-model");
    expect(stripQtySuffix("Lapte × 2")).toBe("Lapte");
    expect(stripQtySuffix("Prune × 0,65 kg")).toBe("Prune");
    expect(labelWithQty("Prune", 0.65)).toBe("Prune × 0,65 kg");
    expect(labelWithQty("Pâine", 1)).toBe("Pâine");
  });
});
