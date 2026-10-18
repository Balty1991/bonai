import { describe, expect, it } from "vitest";
import type { RecurringPayment } from "./finance-data";
import { kindOf, monthlyTotal, nextDue } from "./house-costs";

const p = (o: Partial<RecurringPayment>): RecurringPayment => ({ id: "x", name: "N", amount: 0, category: "Abonamente", sourceId: "", memberId: "", dueDay: 1, active: true, ...o });

describe("abonamente și facturi", () => {
  it("următoarea scadență lunară", () => {
    expect(nextDue(p({ dueDay: 25 }), "2026-10-18")).toBe("2026-10-25");
    expect(nextDue(p({ dueDay: 5 }), "2026-10-18")).toBe("2026-11-05");
    expect(nextDue(p({ dueDay: 31 }), "2026-11-02")).toBe("2026-11-30");
  });
  it("trimestrial și anual", () => {
    expect(nextDue(p({ dueDay: 10, frequency: "yearly", month: 3 }), "2026-10-18")).toBe("2027-03-10");
    expect(nextDue(p({ dueDay: 10, frequency: "quarterly", month: 1 }), "2026-10-18")).toBe("2027-01-10");
  });
  it("totalul pe lună", () => {
    expect(monthlyTotal([p({ amount: 40 }), p({ amount: 120, frequency: "yearly" }), p({ amount: 99, active: false })])).toBe(50);
  });
  it("tipul după categorie", () => { expect(kindOf(p({}))).toBe("sub"); expect(kindOf(p({ category: "Casă & facturi" }))).toBe("bill"); });
});
