import { describe, expect, it } from "vitest";
import { priceSummary } from "./discount-check";
import type { ProductObservation } from "./personal-inflation";

const seen = (label: string, piecePrice: number, date: string, vendor = "Lidl"): ProductObservation => ({ key: label.toLowerCase(), label, vendor, date, category: "Alimente", paid: piecePrice, price: piecePrice, per: "buc", piecePrice });

describe("rezumatul prețurilor la verificarea bonului", () => {
  const history = [seen("lapte zuzu", 7.49, "2026-10-01"), seen("lapte zuzu", 7.99, "2026-10-10", "Kaufland"), seen("paine feliata", 5.2, "2026-10-05"), seen("unt president", 12.9, "2026-10-05")];
  it("mai scump, mai ieftin, la fel și produse noi, față de ultima cumpărare din orice magazin", () => {
    const s = priceSummary([{ label: "Lapte Zuzu", amount: 8.49 }, { label: "Paine feliata", amount: 4.6 }, { label: "Unt President", amount: 12.9 }, { label: "Cafea Jacobs", amount: 25 }], "2026-10-21", history);
    expect(s.up.map((c) => [c.label, c.before, c.diff, c.vendor])).toEqual([["Lapte Zuzu", 7.99, 0.5, "Kaufland"]]);
    expect(s.down.map((c) => [c.label, c.diff])).toEqual([["Paine feliata", -0.6]]);
    expect(s.same).toBe(1);
    expect(s.fresh).toBe(1);
  });
  it("cantitatea: 2 × lapte se compară pe bucată", () => {
    const s = priceSummary([{ label: "Lapte Zuzu", amount: 15.98, qty: 2 }], "2026-10-21", history);
    expect(s.same).toBe(1);
  });
  it("nu se compară cu cumpărături de după ziua bonului", () => {
    const s = priceSummary([{ label: "Lapte Zuzu", amount: 7.49 }], "2026-10-05", history);
    expect(s.same).toBe(1);
  });
});
