/**
 * Întrebarea „cât ai de fapt?” trebuie pusă rar, la momentul potrivit, și niciodată unei
 * case care abia a început. Iar răspunsul nu are voie să rescrie soldul pe ascuns.
 */
import { describe, expect, it } from "vitest";
import { createEmptyAppData, financialBalance, sourceBalance, unappliedSalaryIncomes, type AppData } from "./finance-data";
import { applyDeclaredBalance, balanceCheckDue, balanceCheckRows, daysWithoutEntries } from "./balance-check";

const casa = (miscari = 6): AppData => {
  const data = createEmptyAppData();
  const me = data.settings.members[0];
  data.settings.paymentSources = [
    { id: "card", name: "Card", kind: "card", memberId: me.id, openingBalance: 2000 },
    { id: "cash", name: "Cash", kind: "cash", memberId: me.id, openingBalance: 200 },
    { id: "tichete", name: "Bonuri", kind: "meal", memberId: me.id, openingBalance: 300 },
  ];
  data.settings.salaryPlan.periodStart = "2026-09-14";
  data.settings.salaryPlan.nextPayday = "2026-10-09";
  data.settings.salaryPlan.sourceIds = ["card"];
  data.transactions = Array.from({ length: miscari }, (_, index) => ({
    id: `tx-${index}`, title: "Lidl", amount: 50, kind: "expense" as const, category: "Alimente",
    source: "Card", sourceId: "card", person: me.name, memberId: me.id, date: "2026-09-18",
  }));
  return data;
};

describe("verificarea soldului", () => {
  it("nu întreabă o casă abia pornită", () => {
    expect(balanceCheckDue(casa(1), null, "2026-09-21").due).toBe(false);
    expect(balanceCheckDue(createEmptyAppData(), null, "2026-09-21").due).toBe(false);
  });

  it("întreabă prima dată când registrul are deja ce pierde", () => {
    const prompt = balanceCheckDue(casa(), null, "2026-09-21");
    expect(prompt.due).toBe(true);
    expect(prompt.rows.map((item) => item.id)).toEqual(["card", "cash"]);
  });

  it("nu întreabă de două ori în aceeași săptămână", () => {
    expect(balanceCheckDue(casa(), "2026-09-20", "2026-09-21").due).toBe(false);
    expect(balanceCheckDue(casa(), "2026-09-14", "2026-09-21").due).toBe(true);
  });

  it("întreabă la început de ciclu, chiar dacă verificarea e proaspătă", () => {
    const data = casa();
    data.settings.salaryPlan.periodStart = "2026-09-20";
    expect(balanceCheckDue(data, "2026-09-19", "2026-09-21").due).toBe(true);
  });

  it("nu cere verificarea bonurilor de masă", () => {
    expect(balanceCheckRows(casa()).some((item) => item.kind === "meal")).toBe(false);
  });

  it("soldul spus ajunge exact acolo, iar diferența se vede în registru", () => {
    const data = casa();
    expect(sourceBalance(data, "card")).toBe(1700);
    const next = applyDeclaredBalance(data, "card", 1500, "2026-09-21");
    expect(sourceBalance(next, "card")).toBe(1500);
    const corectie = next.transactions[0];
    expect(corectie.kind).toBe("expense");
    expect(corectie.amount).toBe(200);
    expect(corectie.date).toBe("2026-09-21");
  });

  it("mai mulți bani decât știe aplicația intră ca intrare", () => {
    const next = applyDeclaredBalance(casa(), "card", 1900, "2026-09-21");
    expect(next.transactions[0]).toMatchObject({ kind: "income", amount: 200, adjustment: true });
  });

  it("corecția mută soldul, dar nu e venit în bilanț și nu cere repartizare", () => {
    const data = casa();
    const before = financialBalance(data, "2026-09-01", "2026-09-30");
    const next = applyDeclaredBalance(data, "card", 2600, "2026-09-21");
    expect(sourceBalance(next, "card")).toBe(2600);
    expect(financialBalance(next, "2026-09-01", "2026-09-30").income).toBe(before.income);
    expect(unappliedSalaryIncomes(next).some((item) => item.id === next.transactions[0].id)).toBe(false);
  });

  it("același sold spus a doua oară nu mai scrie nimic", () => {
    const data = casa();
    const next = applyDeclaredBalance(data, "card", 1700, "2026-09-21");
    expect(next.transactions).toHaveLength(data.transactions.length);
  });

  it("o sursă care nu există nu schimbă registrul", () => {
    const data = casa();
    expect(applyDeclaredBalance(data, "inexistent", 100, "2026-09-21")).toBe(data);
  });
});

describe("tichete și cash pe minus (utilizator #10)", () => {
  it("tichetele pe minus cer verificarea imediat, iar plata cu tichete nu consumă Mâncarea din salariu", async () => {
    const { createEmptyAppData, matchingAllocationsForExpense } = await import("./finance-data");
    const data = createEmptyAppData();
    data.settings.paymentSources = [
      { id: "card", name: "Card", kind: "card", openingBalance: 3000 },
      { id: "tichete", name: "Bonuri de masă", kind: "meal", openingBalance: 0 },
    ];
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-01", nextPayday: "2026-10-01", allocations: [{ id: "food", label: "Mâncare", amount: 1200, category: "Alimente" }] };
    data.transactions = [{ id: "t", title: "Lidl", amount: 150, kind: "expense", category: "Alimente", sourceId: "tichete", source: "Bonuri de masă", person: "Eu", date: "2026-09-05" }];
    const prompt = balanceCheckDue(data, null, "2026-09-05");
    expect(prompt.due).toBe(true);
    expect(prompt.rows[0].id).toBe("tichete");
    expect(matchingAllocationsForExpense(data, { category: "Alimente", sourceId: "tichete" })).toEqual([]);
    expect(matchingAllocationsForExpense(data, { category: "Alimente", sourceId: "card" }).map((item) => item.id)).toEqual(["food"]);
  });

  it("după 3 zile fără notări întreabă singur, o singură dată pe 3 zile", () => {
    const data = casa();
    data.transactions = data.transactions.map((item) => ({ ...item, createdAt: "2026-09-18T10:00:00.000Z" }));
    expect(daysWithoutEntries(data, "2026-09-21")).toBe(3);
    const prompt = balanceCheckDue(data, "2026-09-18", "2026-09-21");
    expect(prompt.due).toBe(true);
    expect(prompt.gap).toBe(3);
    expect(balanceCheckDue(data, "2026-09-21", "2026-09-22").due).toBe(false);
  });

  it("„am cheltuit fără să notez”: diferența devine cheltuială la Alimente, nu corecție", () => {
    const data = casa();
    const next = applyDeclaredBalance(data, "card", 1500, "2026-09-21", "unlogged");
    const added = next.transactions[0];
    expect(added).toMatchObject({ kind: "expense", category: "Alimente", amount: 200 });
    expect(added.adjustment).toBeUndefined();
    expect(sourceBalance(next, "card")).toBeCloseTo(1500, 2);
  });

  it("„soldul de pornire era greșit”: se îndreaptă soldul, fără nicio mișcare", () => {
    const data = casa();
    const next = applyDeclaredBalance(data, "card", 2500, "2026-09-21", "opening");
    expect(next.transactions).toHaveLength(data.transactions.length);
    expect(sourceBalance(next, "card")).toBeCloseTo(2500, 2);
    expect(next.settings.paymentSources.find((item) => item.id === "card")?.openingBalance).toBe(2800);
  });
});
