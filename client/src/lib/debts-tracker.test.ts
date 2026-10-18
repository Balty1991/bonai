import { describe, expect, it } from "vitest";
import type { Debt } from "./finance-data";
import { debtNextDue, debtProgress, debtSummary, markInstallmentPaid, paidThisCycle } from "./debts-tracker";

const d = (o: Partial<Debt>): Debt => ({ id: "d", name: "Credit", remaining: 1000, monthly: 250, due: "", tone: "forest", ...o });

describe("datorii (doar urmărire)", () => {
  it("total rămas și rate pe lună", () => {
    expect(debtSummary([d({}), d({ remaining: 500, monthly: 100 }), d({ remaining: 0, monthly: 50 })])).toEqual({ remaining: 1500, monthly: 350, count: 2 });
  });
  it("progresul față de suma inițială", () => { expect(debtProgress(d({ initial: 4000 }))).toBe(0.75); expect(debtProgress(d({}))).toBeUndefined(); });
  it("rata plătită scade restul, nu sub zero", () => {
    expect(markInstallmentPaid(d({}), "2026-10-18").remaining).toBe(750);
    expect(markInstallmentPaid(d({ remaining: 100 }), "2026-10-18").remaining).toBe(0);
    expect(markInstallmentPaid(d({ debtType: "dobanda-card" }), "2026-10-18").remaining).toBe(1000);
  });
  it("scadența următoare și bifa pe ciclu", () => {
    expect(debtNextDue(d({ dueDay: 25 }), "2026-10-18")).toBe("2026-10-25");
    expect(paidThisCycle(d({ lastPaid: "2026-10-10" }), "2026-10-18")).toBe(true);
    expect(paidThisCycle(d({ lastPaid: "2026-09-01" }), "2026-10-18")).toBe(false);
  });
});
