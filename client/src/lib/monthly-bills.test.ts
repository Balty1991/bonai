import { describe, expect, it } from "vitest";
import { createEmptyAppData, pendingRecurringInPlan, recordDebtPayment, type AppData, type Transaction } from "./finance-data";
import { addExtraBill, applyBills, billCandidates, markOpenEnded, overdraftDebts, setRecurringAmount } from "./monthly-bills";

const bill = (id: string, title: string, amount: number, category: string, date = "2026-10-14"): Transaction => ({ id, title, amount, kind: "expense", category, source: "Card", sourceId: "card", memberId: "m1", person: "Alin", date });
const family = (): AppData => {
  const data = createEmptyAppData();
  data.settings.members = [{ id: "m1", name: "Alin" }];
  data.settings.paymentSources = [{ id: "card", name: "Card", kind: "card", memberId: "m1", openingBalance: 3000 }];
  data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-10-09", nextPayday: "2026-11-09" };
  data.transactions = [
    bill("t1", "Factura lumină", 300, "Casă & facturi"), bill("t2", "Factura telefon", 105.34, "Casă & facturi"),
    bill("t3", "Taxa grădiniță", 200, "Educație"), bill("t4", "Taxa întreținere card · Taxa întreținere card", 60, "Casă & facturi"),
    bill("t5", "Cumpărături Mega Image", 80.41, "Casă & facturi"), bill("t6", "Lidl", 50, "Alimente"),
  ];
  data.debts = [{ id: "od", name: "Dobânda Overdraft Angi", remaining: 312, monthly: 26, due: "", tone: "coral", dueDate: "2026-10-31" }];
  return data;
};

describe("facturile notate devin plăți lunare", () => {
  it("propune facturile (nu cumpărăturile), cu utilitățile pe sumă aproximativă", () => {
    const found = billCandidates(family(), "2026-10-14");
    expect(found.map((item) => item.name)).toEqual(["Factura lumină", "Factura telefon", "Taxa grădiniță", "Taxa întreținere card"]);
    expect(found.find((item) => item.name === "Factura lumină")?.variable).toBe(true);
    expect(found.find((item) => item.name === "Taxa întreținere card")?.variable).toBe(false);
  });

  it("după „Fă-le lunare”: luna asta e deja plătită, nu mai apare de plătit, și nu se mai propun", () => {
    const data = family();
    const next = applyBills(data, billCandidates(data, "2026-10-14").map((item) => ({ ...item, keep: true })));
    expect(next.recurring).toHaveLength(4);
    expect(next.transactions.find((item) => item.id === "t1")?.recurringId).toBe(next.recurring[0].id);
    expect(pendingRecurringInPlan(next)).toHaveLength(0);
    expect(billCandidates(next, "2026-10-14")).toHaveLength(0);
  });

  it("factura a venit: suma estimată devine cea reală", () => {
    const next = applyBills(family(), billCandidates(family(), "2026-10-14").map((item) => ({ ...item, keep: true })));
    expect(setRecurringAmount(next, next.recurring[0].id, 287.4).recurring[0].amount).toBe(287.4);
  });

  it("dobânda de overdraft rămâne datorie urmărită, lunară, fără dată de final", () => {
    const data = family();
    expect(overdraftDebts(data).map((debt) => debt.id)).toEqual(["od"]);
    const next = markOpenEnded(data, "od");
    expect(next.debts[0]).toMatchObject({ id: "od", openEnded: true, remaining: 312, monthly: 26 });
    expect(overdraftDebts(next)).toHaveLength(0);
    const paid = recordDebtPayment(next, { debtId: "od", amount: 28.4, sourceId: "card", memberId: "m1", date: "2026-10-31" })!;
    expect(paid.debts[0].remaining).toBe(312);
    expect(paid.transactions.find((item) => item.debtId === "od")).toMatchObject({ debtId: "od", amount: 28.4, debtRemainingAfter: 312 });
    // Plata poate fi și peste sold: dobânda nu are legătură cu cât mai e de dat.
    expect(recordDebtPayment({ ...next, debts: [{ ...next.debts[0], remaining: 10 }] }, { debtId: "od", amount: 26, sourceId: "card", memberId: "m1" })).toBeDefined();
  });

  it("a doua factură de lumină în aceeași lună se notează pe aceeași plată lunară", () => {
    const made = applyBills(family(), billCandidates(family(), "2026-10-14").map((item) => ({ ...item, keep: true })));
    const light = made.recurring.find((item) => item.name === "Factura lumină")!;
    const next = addExtraBill(made, light.id, 142.5, "2026-10-28")!;
    const bills = next.transactions.filter((item) => item.recurringId === light.id);
    expect(bills.map((item) => item.amount).sort((a, b) => a - b)).toEqual([142.5, 300]);
    expect(pendingRecurringInPlan(next)).toHaveLength(0);
  });
});
