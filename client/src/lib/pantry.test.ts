import { describe, expect, it } from "vitest";
import type { ProductObservation } from "./personal-inflation";
import { pantryFromReceipts } from "./pantry";

const o = (key: string, date: string): ProductObservation => ({ key, label: key, vendor: "Lidl", date, category: "Alimente", paid: 5, price: 5, per: "buc", piecePrice: 5 });

describe("cămara din bonuri", () => {
  it("ritmul e mediana intervalelor; starea după zilele trecute", () => {
    const rows = [o("lapte", "2026-10-01"), o("lapte", "2026-10-08"), o("lapte", "2026-10-15"), o("ulei", "2026-08-01"), o("ulei", "2026-08-31"), o("ulei", "2026-09-30"), o("paine", "2026-10-17"), o("paine", "2026-10-17")];
    const pantry = pantryFromReceipts(rows, "2026-10-21");
    expect(pantry.map((p) => [p.key, p.everyDays, p.state])).toEqual([["lapte", 7, "soon"], ["ulei", 30, "ok"]]);
    expect(pantryFromReceipts(rows, "2026-10-26")[0]).toMatchObject({ key: "lapte", state: "out", daysSince: 11 });
  });
});
