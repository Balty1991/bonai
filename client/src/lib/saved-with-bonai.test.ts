import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type Receipt } from "./finance-data";
import { savedItems, savedWithBonAI } from "./saved-with-bonai";

const r = (id: string, vendor: string, date: string, lines: Receipt["lines"]): Receipt => ({ id, vendor, date, amount: (lines || []).reduce((s, l) => s + l.amount, 0), category: "Alimente", lines });
const data = (receipts: Receipt[]): AppData => ({ ...createEmptyAppData(), receipts });

describe("Economisit cu BonAI", () => {
  it("numără reducerile de pe bon și alegerile mai ieftine, fără dublură", () => {
    const d = data([
      r("1", "Kaufland", "2026-09-20", [{ id: "a", label: "Ulei Spornic 1L", amount: 9.5, category: "Alimente" }]),
      r("2", "Lidl", "2026-10-05", [{ id: "b", label: "Ulei Spornic 1L", amount: 8.0, category: "Alimente" }]),
      // același magazin, preț scăzut, cu reducere de 0,50 pe rând: alegerea se numără doar până la prețul brut
      r("3", "Lidl", "2026-10-12", [{ id: "c", label: "Ulei Spornic 1L", amount: 7.0, category: "Alimente", discount: 0.5 }]),
    ]);
    const s = savedWithBonAI(d, "2026-10-18");
    expect(s.discounts).toBe(0.5);
    expect(s.store).toBe(1.5);
    expect(s.drop).toBe(0.5);
    expect(s.total).toBe(2.5);
    expect(s.items.find((i) => i.kind === "store")).toMatchObject({ vendor: "Lidl", was: { vendor: "Kaufland", price: 9.5 } });
  });
  it("nu inventează: fără istoric sau cu preț mai mare, zero", () => {
    expect(savedWithBonAI(data([r("1", "Lidl", "2026-10-05", [{ id: "a", label: "Pâine", amount: 5, category: "Alimente" }])]), "2026-10-18").total).toBe(0);
    expect(savedItems(data([
      r("1", "Lidl", "2026-10-01", [{ id: "a", label: "Pâine", amount: 5, category: "Alimente" }]),
      r("2", "Profi", "2026-10-03", [{ id: "b", label: "Pâine", amount: 6, category: "Alimente" }]),
    ]))).toEqual([]);
  });
  it("nu compară ambalaje diferite și nici cumpărături mai vechi de 60 de zile", () => {
    expect(savedItems(data([
      r("1", "Lidl", "2026-10-01", [{ id: "a", label: "Apa Tusnad 2L", amount: 3.2, category: "Băuturi" }]),
      r("2", "Lidl", "2026-10-03", [{ id: "b", label: "Apa Tusnad 0.5L", amount: 2.1, category: "Băuturi" }]),
    ]))).toEqual([]);
    expect(savedItems(data([
      r("1", "Lidl", "2026-06-01", [{ id: "a", label: "Cafea Jacobs 250g", amount: 25, category: "Alimente" }]),
      r("2", "Lidl", "2026-10-03", [{ id: "b", label: "Cafea Jacobs 250g", amount: 20, category: "Alimente" }]),
    ]))).toEqual([]);
  });
});
