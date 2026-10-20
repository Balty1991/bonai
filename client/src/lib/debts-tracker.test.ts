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

describe("bifa ratei: plată notată, anulare, ce a mai rămas", () => {
  it("bifa scade restul, notează plata la plăți fixe, iar Anulează pune totul la loc", async () => {
    const { createEmptyAppData } = await import("./finance-data");
    const { payInstallment, undoInstallment, debtOutlook, paidSoFar } = await import("./debts-tracker");
    const { spendEntries } = await import("./quick-expense");
    const { buildReport } = await import("./reports");
    const data = createEmptyAppData();
    data.debts = [
      { id: "bank", name: "Raiffeisen", creditor: "Raiffeisen Alin", remaining: 2000, monthly: 672.96, due: "", tone: "forest", dueDay: 30, debtType: "rata-banca", kind: "credit" } as Debt,
      { id: "emag", name: "eMAG", creditor: "eMAG telefon", remaining: 175.69, monthly: 179, due: "", tone: "forest", dueDay: 25, debtType: "rata-card-magazin", kind: "credit" } as Debt,
    ];
    expect(debtOutlook(data.debts[0], "2026-10-20")).toEqual({ payments: 3, lastMonth: "2026-12" });
    let next = payInstallment(data, "bank", "2026-10-20");
    next = payInstallment(next, "emag", "2026-10-20");
    expect(next.debts.map((debt) => debt.remaining)).toEqual([1327.04, 0]);
    expect(next.transactions.map((tx) => [tx.title, tx.amount, tx.debtId])).toEqual([["Rată — Raiffeisen Alin", 672.96, "bank"], ["Rată — eMAG telefon", 175.69, "emag"]]);
    expect(payInstallment(next, "bank", "2026-10-21")).toBe(next);
    expect(spendEntries(next)).toEqual([]);
    const groups = Object.fromEntries(buildReport(next, "month", "2026-10-20").fixed.groups.map((group) => [group.id, group.total]));
    expect(groups).toEqual({ rates: 175.69, loans: 672.96 });
    expect(paidSoFar(next, "bank")).toBe(672.96);
    const undone = undoInstallment(next, "bank");
    expect(undone.debts[0]).toMatchObject({ remaining: 2000, lastPaid: undefined });
    expect(undone.transactions.map((tx) => tx.debtId)).toEqual(["emag"]);
    expect(undone.deleted.at(-1)).toMatchObject({ entity: "transactions" });
  });
});
