import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type Debt } from "./finance-data";
import { bankCosts, isBankCost, payInstallment } from "./debts-tracker";
import { debtFreePlan, estimatedRate, plannedDebts } from "./debt-insights";
import { paymentCalendar } from "./payment-calendar";
import { habitInsights } from "./habit-insights";
import { applyReceiptEdit } from "./receipt-edit";

const debt = (patch: Partial<Debt>): Debt => ({ id: "d", name: "Datorie", remaining: 0, monthly: 0, due: "", tone: "coral", ...patch });
const data = (): AppData => {
  const d = createEmptyAppData();
  d.debts = [
    debt({ id: "bank", name: "Raiffeisen Alin", kind: "credit", remaining: 27910.55, monthly: 672.96, endDate: "2034-03-30", dueDate: "2026-10-30" }),
    debt({ id: "emag", name: "Emag telefon", kind: "card", remaining: 175.69, monthly: 179, endDate: "2026-11-24", dueDate: "2026-10-25" }),
    debt({ id: "od", name: "Dobânda Overdraft Alin", remaining: 252, monthly: 21, dueDate: "2026-10-31" }),
    debt({ id: "fee", name: "Comision card", debtType: "comision-bancar", openEnded: true, remaining: 0, monthly: 8, dueDay: 5 }),
  ];
  return d;
};

describe("dobânzi și comisioane bancare", () => {
  it("overdraftul vechi (după nume) și comisionul sunt costuri bancare, cu total pe an", () => {
    const d = data();
    expect(d.debts.filter(isBankCost).map((x) => x.id)).toEqual(["od", "fee"]);
    expect(bankCosts(d.debts)).toMatchObject({ monthly: 29, yearly: 348 });
  });
  it("bifa la un comision îl notează la „Comisioane bancare” și nu scade restul", () => {
    const next = payInstallment(data(), "fee", "2026-10-05");
    const tx = next.transactions.at(-1)!;
    expect(tx).toMatchObject({ category: "Comisioane bancare", amount: 8, title: "Comision — Comision card" });
    expect(next.debts.find((x) => x.id === "fee")?.remaining).toBe(0);
  });
});

describe("planul de ieșire din datorii", () => {
  it("dobânda se estimează doar la creditul bancar lung, nu la rata eMAG fără dobândă", () => {
    const list = plannedDebts(data().debts, "2026-10-21");
    expect(list.map((x) => x.id)).toEqual(["bank", "emag"]);
    expect(list.find((x) => x.id === "bank")).toMatchObject({ rateGuessed: true });
    expect(list.find((x) => x.id === "bank")!.annualRate!).toBeGreaterThan(15);
    expect(list.find((x) => x.id === "emag")).toMatchObject({ rateGuessed: false, interest: 0 });
    expect(estimatedRate({ remaining: 175.69, monthly: 179, endDate: "2026-11-24", kind: "card" }, "2026-10-21")).toBe(0);
  });
  it("mutând rata stinsă la următoarea și cu bani în plus termini mai devreme", () => {
    const plan = debtFreePlan(data().debts, "2026-10-21", 200)!;
    expect(plan.asIs.months).toBeGreaterThanOrEqual(plan.months!);
    expect(plan.faster!.months!).toBeLessThan(plan.months!);
    expect(plan.faster!.interestSaved).toBeGreaterThan(0);
  });
});

describe("scadențarul", () => {
  it("pune fiecare plată în ziua ei și știe ce e plătit", () => {
    let d = data();
    d.recurring = [{ id: "net", name: "Netflix", amount: 60, category: "Abonamente", sourceId: "", memberId: "", dueDay: 12, active: true }];
    d = payInstallment(d, "emag", "2026-10-21");
    const cal = paymentCalendar(d, "2026-10");
    expect(cal.days).toHaveLength(31);
    expect(cal.days[0].weekday).toBe(3); // 1 octombrie 2026 e joi
    expect(cal.payments.find((x) => x.id === "r:net")).toMatchObject({ date: "2026-10-12", kind: "sub", paid: false });
    expect(cal.payments.find((x) => x.id === "d:emag")).toMatchObject({ date: "2026-10-25", kind: "debt", paid: true });
    expect(cal.payments.find((x) => x.id === "d:od")).toMatchObject({ kind: "bank" });
    expect(cal.total).toBe(cal.paid + cal.left);
  });
});

describe("asistentul", () => {
  it("spune cât costă banca și cum ieși mai repede din datorii", () => {
    const ids = habitInsights(data(), "2026-10-21").map((x) => x.id);
    expect(ids).toContain("bank");
    expect(ids.some((id) => id === "rollover" || id === "extra")).toBe(true);
  });
});

describe("corecturi pe bon", () => {
  it("data, ora și orașul corectate se salvează pe bon", () => {
    const d = createEmptyAppData();
    d.receipts = [{ id: "r", vendor: "Lidl", amount: 10, category: "Alimente", date: "2026-10-19", time: "14:22", city: "Rosiori", lines: [{ id: "a", category: "Alimente", amount: 10, label: "Pâine" }] }];
    const next = applyReceiptEdit(d, "r", { rows: [{ key: "a", label: "Pâine", raw: "", qty: 1, amount: 10, discount: 0, category: "Alimente" }], total: 10, store: "Lidl", date: "2026-10-18", time: "09:05", city: "Roșiori de Vede" });
    expect(next.receipts[0]).toMatchObject({ date: "2026-10-18", time: "09:05", city: "Roșiori de Vede" });
  });
});
