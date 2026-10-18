import { describe, expect, it } from "vitest";
import { suggestWeeklyAllocationsFromCashflow, allocationBudget, allocationSpent, allocationStatus, allocationWeekStatus, allocationWeeksStatus, adoptOutsideExpenses, answerBudgetQuestion, applySalaryAllocationRules, autoPostDueRecurring, closeReceiptGap, commitLedgerEntry, confirmReviewDraft, createEmptyAppData, debtPaymentHistory, debtSnowball, financialBalance, inPlanPeriod, isoToday, matchingAllocationsForExpense, pickerAllocationsForExpense, newId, normalizeAppData, parseNaturalSpendScenario, parseRomanianAmount, paydayWindow, pendingRecurringInPlan, planEndDate, planForecast, recordDebtPayment, resolveReceiptLines, revertSalaryAllocationApplication, savingSuggestions, sourceBalance, transferBetweenEnvelopes, transferBetweenWeeks, unappliedSalaryIncomes, weeklySummary, transactionShareScope } from "./finance-data";
import { deriveFamilyRoomId, mergeFamilyData } from "./family-crypto";
import { calendarBudget } from "./calendar-budget";

describe("registrul financiar Buget Familie", () => {
  it("interpretează sumele românești cu punct pentru mii și virgulă zecimală", () => {
    expect(parseRomanianAmount("1.234,50")).toBe(1234.5);
    expect(parseRomanianAmount("7 400,00")).toBe(7400);
    expect(parseRomanianAmount("abc")).toBe(0);
  });

  it("citește sumele din testarea cu utilizatori și refuză formatele neclare", () => {
    expect(parseRomanianAmount("1.500")).toBe(1500);
    expect(parseRomanianAmount("1 500")).toBe(1500);
    expect(parseRomanianAmount("1500,5")).toBe(1500.5);
    expect(parseRomanianAmount("2.350,75")).toBe(2350.75);
    expect(parseRomanianAmount("12.99 lei")).toBe(12.99);
    expect(parseRomanianAmount("RON 50")).toBe(50);
    expect(parseRomanianAmount("1,500.50")).toBe(1500.5);
    expect(parseRomanianAmount("2.350.000")).toBe(2350000);
    expect(parseRomanianAmount("1,500,000")).toBe(1500000);
    // „1e5” se salva ca 15 RON.
    expect(parseRomanianAmount("1e5")).toBe(0);
    expect(parseRomanianAmount("12a")).toBe(0);
    expect(parseRomanianAmount("-50")).toBe(-50);
  });

  it("generează ID-uri criptografice unice, fără coliziuni pe volume mari", () => {
    const ids = Array.from({ length: 5000 }, () => newId("tx"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^tx-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
  });

  it("derivă soldul sursei din soldul inițial și mișcări", () => {
    const data = createEmptyAppData();
    const source = data.settings.paymentSources[0];
    source.openingBalance = 1000;
    data.transactions = [
      { id: "income", title: "Venit", amount: 500, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-02" },
      { id: "expense", title: "Taxă", amount: 200, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-03" },
    ];
    expect(sourceBalance(data, source.id)).toBe(1300);
  });

  it("separă fluxul perioadei de ratele declarate și datoria rămasă în bilanț", () => {
    const data = createEmptyAppData(); const source = data.settings.paymentSources[0]; source.openingBalance = 1000;
    data.transactions = [{ id: "income", title: "Salariu", amount: 3000, kind: "income", category: "Venit", source: source.name, sourceId: source.id, person: "Eu", memberId: "member-me", date: "2026-08-01" }, { id: "expense", title: "Alimente", amount: 900, kind: "expense", category: "Alimente", source: source.name, sourceId: source.id, person: "Eu", memberId: "member-me", date: "2026-08-02" }];
    data.debts = [{ id: "loan", name: "Credit", remaining: 38000, monthly: 650, due: "29 august", tone: "forest" }]; data.savings = [{ id: "fund", name: "Fond", current: 2000, target: 5000, due: "Decembrie", tone: "honey" }];
    expect(financialBalance(data, "2026-08-01", "2026-08-31")).toMatchObject({ income: 3000, expense: 900, cashflow: 2100, monthlyRates: 650, debtRemaining: 38000, savingsCurrent: 2000, liquidFunds: 3100, netLiquidPosition: -34900 });
  });

  it("înregistrează plata unei rate și reduce exact datoria aleasă, fără a depăși soldul rămas", () => {
    const data = createEmptyAppData(); const source = data.settings.paymentSources[0]; source.openingBalance = 1200;
    data.debts = [{ id: "credit", name: "Credit auto", remaining: 1000, monthly: 400, due: "28 august", tone: "coral" }];
    const paid = recordDebtPayment(data, { debtId: "credit", amount: 400, sourceId: source.id, memberId: "member-me", date: "2026-08-27" });
    expect(paid?.debts[0].remaining).toBe(600);
    expect(paid?.transactions[0]).toMatchObject({ kind: "expense", category: "Rate produse", amount: 400, sourceId: source.id, memberId: "member-me" });
    expect(sourceBalance(paid!, source.id)).toBe(800);
    expect(recordDebtPayment(paid!, { debtId: "credit", amount: 601, sourceId: source.id, memberId: "member-me" })).toBeUndefined();
    paid!.settings.members.push({ id: "member-wife", name: "Soție" });
    expect(recordDebtPayment(paid!, { debtId: "credit", amount: 100, sourceId: source.id, memberId: "member-wife" })).toBeUndefined();
    const finalPayment = recordDebtPayment(paid!, { debtId: "credit", amount: 600, sourceId: source.id, memberId: "member-me" });
    expect(finalPayment?.debts[0].remaining).toBe(0);
    expect(finalPayment?.transactions[0].title).toContain("achitată integral");
    expect(debtPaymentHistory(finalPayment!, "credit")).toHaveLength(2);
    expect(debtPaymentHistory(finalPayment!, "credit")[0].debtId).toBe("credit");
    expect(debtPaymentHistory(finalPayment!, "credit")[0].debtRemainingAfter).toBe(0);
  });

  it("plata ratei consumă plicul Rate produse când există, nu inventează nealocat", () => {
    const data = createEmptyAppData();
    const source = data.settings.paymentSources[0];
    source.openingBalance = 1200;
    data.settings.salaryPlan.allocations = [
      { id: "env-rate", label: "Rate produse", category: "Rate produse", amount: 400, sourceId: source.id, memberId: "member-me" },
    ];
    data.debts = [{ id: "credit", name: "Credit auto", remaining: 1000, monthly: 400, due: "28 august", tone: "coral" }];
    const paid = recordDebtPayment(data, { debtId: "credit", amount: 400, sourceId: source.id, memberId: "member-me", date: "2026-08-27" });
    expect(paid?.transactions[0].allocationId).toBe("env-rate");
  });

  it("confirmarea din De verificat mută o cheltuială outside pe plicul potrivit", () => {
    const data = createEmptyAppData();
    const source = data.settings.paymentSources[0];
    data.settings.salaryPlan.allocations = [
      { id: "env-food", label: "Alimente", category: "Alimente", amount: 800, sourceId: source.id, memberId: "member-me" },
    ];
    data.pendingReview = [{
      id: "rev-1",
      origin: "bon",
      reason: "test",
      createdAt: "2026-09-13T10:00:00.000Z",
      transaction: {
        id: "tx-outside",
        title: "Lidl",
        amount: 45,
        kind: "expense",
        category: "Alimente",
        sourceId: source.id,
        source: source.name,
        memberId: "member-me",
        person: "Eu",
        date: "2026-09-13",
        allocationId: "outside",
      },
    }];
    const confirmed = confirmReviewDraft(data, "rev-1");
    expect(confirmed?.transactions[0].allocationId).toBe("env-food");
    expect(confirmed?.pendingReview).toHaveLength(0);
  });

  it("filtrează bilanțul pe membru, incluzând doar sursele și obligațiile personale sau comune", () => {
    const data = createEmptyAppData(); data.settings.members.push({ id: "member-partner", name: "Soție" });
    data.settings.paymentSources.push({ id: "source-partner", name: "Card soție", kind: "card", memberId: "member-partner", openingBalance: 500 });
    data.transactions = [{ id: "me-expense", title: "Taxi", amount: 100, kind: "expense", category: "Transport", sourceId: "source-debit", source: "Card debit", memberId: "member-me", person: "Eu", date: "2026-08-10" }, { id: "partner-income", title: "Venit", amount: 700, kind: "income", category: "Venit", sourceId: "source-partner", source: "Card soție", memberId: "member-partner", person: "Soție", date: "2026-08-10" }];
    data.debts = [{ id: "me-debt", name: "Rată eu", remaining: 200, monthly: 50, due: "28 august", memberId: "member-me", tone: "coral" }, { id: "shared", name: "Chirie", remaining: 400, monthly: 100, due: "1 septembrie", tone: "coral" }];
    const mine = financialBalance(data, undefined, undefined, "member-me");
    expect(mine).toMatchObject({ income: 0, expense: 100, debtRemaining: 600, monthlyRates: 150, liquidFunds: -100 });
  });

  it("calculează cheltuiala pentru alocarea de categorie doar în perioada activă", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-10", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [], transfers: [] };
    const source = data.settings.paymentSources[0];
    data.transactions = [
      { id: "1", title: "Taxi", amount: 100, kind: "expense", category: "Taxi", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-04" },
      { id: "2", title: "Taxi vechi", amount: 75, kind: "expense", category: "Taxi", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-28" },
    ];
    expect(allocationSpent(data, { id: "a", label: "Taxi", amount: 200, category: "Taxi" })).toBe(100);
  });

  it("consumă plicul de transport numai din sursa aleasă", () => {
    const data = createEmptyAppData(); const [card, cash] = data.settings.paymentSources;
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-10", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [], transfers: [] };
    data.transactions = [
      { id: "card-taxi", title: "Taxi card", amount: 120, kind: "expense", category: "Transport", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-08-04" },
      { id: "cash-taxi", title: "Taxi cash", amount: 80, kind: "expense", category: "Transport", sourceId: cash.id, source: cash.name, memberId: "member-me", person: "Eu", date: "2026-08-05" },
    ];
    expect(allocationSpent(data, { id: "transport-card", label: "Transport", amount: 500, category: "Transport", sourceId: card.id, note: "Taxi până la venit" })).toBe(120);
  });

  it("separă plicurile de transport pe membri", () => {
    const data = createEmptyAppData(); const [card] = data.settings.paymentSources;
    const wife = { id: "member-wife", name: "Soție" }; data.settings.members.push(wife);
    const mine = { id: "transport-me", label: "Transport · Eu", amount: 70, category: "Transport", memberId: "member-me", sourceId: card.id };
    const hers = { id: "transport-wife", label: "Transport · Soție", amount: 430, category: "Transport", memberId: wife.id, sourceId: card.id };
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-31", sourceIds: [], totalLimit: 500, weeklyLimit: 0, allocations: [mine, hers], transfers: [] };
    data.transactions = [{ id: "wife-taxi", title: "Taxi soție", amount: 60, kind: "expense", category: "Transport", sourceId: card.id, source: card.name, memberId: wife.id, person: wife.name, date: "2026-08-04" }, { id: "my-taxi", title: "Taxi eu", amount: 15, kind: "expense", category: "Transport", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-08-05" }];
    expect(allocationSpent(data, hers)).toBe(60);
    expect(allocationSpent(data, mine)).toBe(15);
  });

  it("realocă limita între plicuri fără a schimba nicio tranzacție sau sursă", () => {
    const data = createEmptyAppData(); const [card] = data.settings.paymentSources;
    const transport = { id: "transport", label: "Transport", amount: 500, category: "Transport", sourceId: card.id };
    const food = { id: "food", label: "Alimente", amount: 300, category: "Alimente", sourceId: card.id };
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-10", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [transport, food], transfers: [{ id: "move", fromAllocationId: "transport", toAllocationId: "food", amount: 120, note: "Taxi mai puțin", createdAt: "2026-08-02T12:00:00.000Z" }] };
    expect(allocationBudget(data, transport)).toBe(380);
    expect(allocationBudget(data, food)).toBe(420);
    expect(data.transactions).toHaveLength(0);
  });

  it("semnalizează plicul la 80% și la depășirea limitei", () => {
    const data = createEmptyAppData(); const [card] = data.settings.paymentSources; const transport = { id: "transport", label: "Transport", amount: 100, category: "Transport", sourceId: card.id };
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-31", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [transport], transfers: [] };
    data.transactions = [{ id: "near", title: "Taxi", amount: 80, kind: "expense", category: "Transport", source: card.name, sourceId: card.id, person: "Eu", memberId: "member-me", date: "2026-08-12" }];
    expect(allocationStatus(data, transport).state).toBe("watch");
    data.transactions.push({ id: "over", title: "Taxi", amount: 25, kind: "expense", category: "Transport", source: card.name, sourceId: card.id, person: "Eu", memberId: "member-me", date: "2026-08-13" });
    expect(allocationStatus(data, transport).state).toBe("over");
  });

  it("respectă pragul configurabil al plicului și îl limitează defensiv", () => {
    const data = createEmptyAppData(); const [card] = data.settings.paymentSources;
    const transport = { id: "transport", label: "Transport", amount: 100, category: "Transport", sourceId: card.id, alertThreshold: 70 };
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-31", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [transport], transfers: [] };
    data.transactions = [{ id: "near", title: "Taxi", amount: 70, kind: "expense", category: "Transport", source: card.name, sourceId: card.id, person: "Eu", memberId: "member-me", date: "2026-08-12" }];
    expect(allocationStatus(data, transport)).toMatchObject({ state: "watch", alertThreshold: 70 });
    const migrated = normalizeAppData({ settings: { salaryPlan: { periodStart: "2026-08-01", nextPayday: "2026-08-31", sourceIds: [], totalLimit: 0, weeklyLimit: 0, allocations: [{ id: "low", label: "Mic", amount: 20, alertThreshold: 20 }, { id: "high", label: "Mare", amount: 20, alertThreshold: 99 }, { id: "default", label: "Implicit", amount: 20 }] } } });
    expect(migrated.settings.salaryPlan.allocations.map((item) => item.alertThreshold)).toEqual([50, 95, 80]);
    expect(migrated.settings.salaryPlan.allocations.every((item) => item.weeklyPace === true)).toBe(true);
    const withoutPayday = normalizeAppData({ settings: { salaryPlan: { periodStart: "2026-09-01", nextPayday: "", allocations: [{ id: "month", label: "Casă", amount: 20, weeklyPace: false }, { id: "open", label: "Alimente", amount: 20 }] } } });
    expect(withoutPayday.settings.salaryPlan.allocations.map((item) => item.weeklyPace)).toEqual([false, undefined]);
  });

  it("consumă numai plicul selectat expres și lasă plata din afara plicurilor în soldul sursei", () => {
    const data = createEmptyAppData(); const [card, cash] = data.settings.paymentSources;
    const cashTaxi = { id: "taxi-cash", label: "Taxi cash", amount: 400, category: "Transport", sourceId: cash.id, memberId: "member-me" };
    const cardTaxi = { id: "taxi-card", label: "Taxi card", amount: 300, category: "Transport", sourceId: card.id, memberId: "member-me" };
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-31", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [cashTaxi, cardTaxi], transfers: [] };
    data.transactions = [{ id: "cash-budget", title: "Taxi cash", amount: 50, kind: "expense", category: "Transport", sourceId: cash.id, source: cash.name, memberId: "member-me", person: "Eu", date: "2026-08-10", allocationId: "taxi-cash" }, { id: "cash-outside", title: "Taxi nebugetat", amount: 30, kind: "expense", category: "Transport", sourceId: cash.id, source: cash.name, memberId: "member-me", person: "Eu", date: "2026-08-11", allocationId: "outside" }];
    expect(allocationSpent(data, cashTaxi)).toBe(50);
    expect(allocationSpent(data, cardTaxi)).toBe(0);
    expect(sourceBalance(data, cash.id)).toBe(-80);
  });

  it("împarte alimentele pe surse familiale și consumă numai tranșa activă potrivită", () => {
    const data = createEmptyAppData(); const [, cash] = data.settings.paymentSources;
    const wife = { id: "member-wife", name: "Soție" }; const wifeCard = { id: "source-wife-card", name: "Card soție", kind: "card" as const, memberId: wife.id, openingBalance: 0 };
    data.settings.members.push(wife); data.settings.paymentSources.push(wifeCard);
    const foodCash = { id: "food-cash", label: "Alimente · cash Eu", amount: 1200, category: "Alimente", memberId: "member-me", sourceId: cash.id };
    const foodWife = { id: "food-wife", label: "Alimente · card Soție", amount: 1200, category: "Alimente", memberId: wife.id, sourceId: wifeCard.id };
    data.settings.salaryPlan = { periodStart: "2026-09-01", nextPayday: "2026-09-28", sourceIds: [], totalLimit: 2400, weeklyLimit: 600, allocations: [foodCash, foodWife], transfers: [] };
    data.transactions = [{ id: "wife-food", title: "Alimente", amount: 100, kind: "expense", category: "Alimente", sourceId: wifeCard.id, source: wifeCard.name, memberId: wife.id, person: wife.name, date: "2026-09-10", allocationId: foodWife.id }];
    expect(matchingAllocationsForExpense(data, { category: "Alimente", memberId: wife.id, sourceId: wifeCard.id }).map((item) => item.id)).toEqual([foodWife.id]);
    expect(matchingAllocationsForExpense(data, { category: "Alimente", memberId: "member-me", sourceId: cash.id }).map((item) => item.id)).toEqual([foodCash.id]);
    expect(matchingAllocationsForExpense(data, { category: "Alimente", memberId: "member-me", sourceId: wifeCard.id }).map((item) => item.id)).toEqual([foodWife.id]);
    expect(allocationWeekStatus(data, foodWife, "2026-09-10")).toMatchObject({ index: 2, budget: 300, spent: 100, remaining: 200 });
    expect(allocationWeekStatus(data, foodCash, "2026-09-10")).toMatchObject({ index: 2, budget: 300, spent: 0, remaining: 300 });
  });

  it("pune o cheltuială din afara plicurilor în singurul plic, ca să nu arate depășire falsă", () => {
    const data = createEmptyAppData();
    const [card] = data.settings.paymentSources;
    data.settings.salaryPlan = { periodStart: "2026-09-12", nextPayday: "2026-09-25", sourceIds: [card.id], totalLimit: 500, weeklyLimit: 250, allocations: [{ id: "food", label: "Alimente", amount: 500, category: "Alimente", sourceId: card.id, weeklyPace: true }], transfers: [] };
    data.transactions = [
      { id: "in", title: "Venit", amount: 500, kind: "income", category: "Venit", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-09-13" },
      { id: "taxi", title: "Taxi", amount: 20, kind: "expense", category: "Transport", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-09-13", allocationId: "outside" },
    ];
    const next = adoptOutsideExpenses(data);
    expect(next.transactions.find((item) => item.id === "taxi")?.allocationId).toBe("food");
    expect(allocationStatus(next, next.settings.salaryPlan.allocations[0]).remaining).toBe(480);
  });

  it("nu mută o cheltuială în afara plicurilor dacă sunt mai multe plicuri și categoria nu se potrivește", () => {
    const data = createEmptyAppData();
    const [card] = data.settings.paymentSources;
    data.settings.salaryPlan = { periodStart: "2026-09-12", nextPayday: "2026-09-25", sourceIds: [card.id], totalLimit: 800, weeklyLimit: 0, allocations: [
      { id: "food", label: "Alimente", amount: 500, category: "Alimente", sourceId: card.id },
      { id: "house", label: "Casă", amount: 300, category: "Casă & facturi", sourceId: card.id },
    ], transfers: [] };
    data.transactions = [{ id: "taxi", title: "Taxi", amount: 20, kind: "expense", category: "Transport", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-09-13", allocationId: "outside" }];
    expect(adoptOutsideExpenses(data).transactions[0].allocationId).toBe("outside");
  });

  it("oferă singurul plic pentru un taxi când tot planul e Alimente, nu nealocat", () => {
    const data = createEmptyAppData();
    const [card] = data.settings.paymentSources;
    const food = { id: "food", label: "Alimente", amount: 500, category: "Alimente", sourceId: card.id, memberId: "member-me", weeklyPace: true as const };
    data.settings.salaryPlan = { periodStart: "2026-09-12", nextPayday: "2026-09-25", sourceIds: [card.id], totalLimit: 500, weeklyLimit: 250, allocations: [food], transfers: [] };
    expect(matchingAllocationsForExpense(data, { category: "Transport", memberId: "member-me", sourceId: card.id }).map((item) => item.id)).toEqual(["food"]);
    expect(pickerAllocationsForExpense(data, { category: "Transport", memberId: "member-me", sourceId: card.id }).map((item) => item.id)).toEqual(["food"]);
  });

  it("la captură listează și plicurile înrudite, nu doar categoria exactă", () => {
    const data = createEmptyAppData();
    const [card] = data.settings.paymentSources;
    const food = { id: "food", label: "Alimente", amount: 500, category: "Alimente", sourceId: card.id, memberId: "member-me" };
    const house = { id: "house", label: "Casă", amount: 300, category: "Casă & facturi", sourceId: card.id, memberId: "member-me" };
    data.settings.salaryPlan = { periodStart: "2026-09-12", nextPayday: "2026-09-25", sourceIds: [card.id], totalLimit: 800, weeklyLimit: 0, allocations: [food, house], transfers: [] };
    expect(matchingAllocationsForExpense(data, { category: "Transport", memberId: "member-me", sourceId: card.id })).toEqual([]);
    expect(pickerAllocationsForExpense(data, { category: "Transport", memberId: "member-me", sourceId: card.id }).map((item) => item.id)).toEqual(["food", "house"]);
  });

  it("la înregistrare mută întâi din săptămâna aleasă, apoi scrie cheltuiala", () => {
    const data = createEmptyAppData();
    const [card] = data.settings.paymentSources;
    const food = { id: "food", label: "Alimente", amount: 1200, category: "Alimente", sourceId: card.id, weeklyPace: true as const };
    data.settings.salaryPlan = { periodStart: "2026-08-31", nextPayday: "2026-09-27", sourceIds: [card.id], totalLimit: 1200, weeklyLimit: 0, allocations: [food], transfers: [] };
    const before = allocationWeeksStatus(data, food);
    expect(before[0]).toMatchObject({ index: 1, remaining: 300 });
    expect(before[1]).toMatchObject({ index: 2, remaining: 300 });
    const next = commitLedgerEntry(data, {
      id: "taxi",
      title: "Taxi",
      amount: 20,
      kind: "expense",
      category: "Transport",
      sourceId: card.id,
      source: card.name,
      memberId: "member-me",
      person: "Eu",
      date: "2026-09-12",
      allocationId: food.id,
    }, 1);
    expect(next.transactions[0]).toMatchObject({ id: "taxi", amount: 20, allocationId: food.id });
    const weeks = allocationWeeksStatus(next, food);
    expect(weeks[0]).toMatchObject({ index: 1, budget: 280, remaining: 280 });
    expect(weeks[1]).toMatchObject({ index: 2, budget: 320, spent: 20, remaining: 300 });
    expect(next.settings.salaryPlan.allocationHistory?.[0]).toMatchObject({ kind: "week-transfer", fromWeekIndex: 1, toWeekIndex: 2, amount: 20 });
  });

  it("nu scrie cheltuiala dacă săptămâna aleasă nu acoperă suma", () => {
    const data = createEmptyAppData();
    const [card] = data.settings.paymentSources;
    const food = { id: "food", label: "Alimente", amount: 1200, category: "Alimente", sourceId: card.id, weeklyPace: true as const };
    data.settings.salaryPlan = { periodStart: "2026-08-31", nextPayday: "2026-09-27", sourceIds: [card.id], totalLimit: 1200, weeklyLimit: 0, allocations: [food], transfers: [] };
    const spend = {
      id: "taxi-over",
      title: "Taxi",
      amount: 400,
      kind: "expense" as const,
      category: "Transport",
      sourceId: card.id,
      source: card.name,
      memberId: "member-me",
      person: "Eu",
      date: "2026-09-12",
      allocationId: food.id,
    };
    expect(() => commitLedgerEntry(data, spend, 1)).toThrow(/destui bani rămași/i);
    expect(data.transactions).toHaveLength(0);
    expect(allocationWeeksStatus(data, food)[0]).toMatchObject({ index: 1, remaining: 300 });
    expect(allocationWeeksStatus(data, food)[1]).toMatchObject({ index: 2, remaining: 300 });
  });

  it("confirmarea unui taxi fără plic de Transport rămâne în afara, dacă există și alte plicuri", () => {
    const data = createEmptyAppData();
    const source = data.settings.paymentSources[0];
    data.settings.salaryPlan.allocations = [
      { id: "env-food", label: "Alimente", category: "Alimente", amount: 500, sourceId: source.id, memberId: "member-me" },
      { id: "env-house", label: "Casă", category: "Casă & facturi", amount: 300, sourceId: source.id, memberId: "member-me" },
    ];
    data.pendingReview = [{
      id: "rev-taxi",
      origin: "bon",
      reason: "test",
      createdAt: "2026-09-13T10:00:00.000Z",
      transaction: {
        id: "tx-taxi",
        title: "Taxi",
        amount: 20,
        kind: "expense",
        category: "Transport",
        sourceId: source.id,
        source: source.name,
        memberId: "member-me",
        person: "Eu",
        date: "2026-09-13",
        allocationId: "outside",
      },
    }];
    const confirmed = confirmReviewDraft(data, "rev-taxi");
    expect(confirmed?.transactions[0].allocationId).toBe("outside");
    expect(allocationSpent(confirmed!, confirmed!.settings.salaryPlan.allocations[0])).toBe(0);
    expect(allocationSpent(confirmed!, confirmed!.settings.salaryPlan.allocations[1])).toBe(0);
  });

  it("mută bani dintr-o tranșă săptămânală în alta a aceluiași plic, fără să depășească ce a mai rămas", () => {
    const data = createEmptyAppData(); const [card] = data.settings.paymentSources;
    const food = { id: "food", label: "Alimente", amount: 1200, category: "Alimente", sourceId: card.id };
    data.settings.salaryPlan = { periodStart: "2026-08-31", nextPayday: "2026-09-27", sourceIds: [], totalLimit: 1200, weeklyLimit: 0, allocations: [food], transfers: [] };
    data.transactions = [{ id: "week1-spend", title: "Alimente", amount: 350, kind: "expense", category: "Alimente", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-09-01", allocationId: food.id }];
    const weeksBefore = allocationWeeksStatus(data, food);
    expect(weeksBefore).toHaveLength(4);
    expect(weeksBefore[0]).toMatchObject({ index: 1, budget: 300, spent: 350, remaining: -50, state: "over" });
    expect(weeksBefore[1]).toMatchObject({ index: 2, budget: 300, spent: 0, remaining: 300, state: "healthy" });

    expect(transferBetweenWeeks(data, { allocationId: food.id, fromWeekIndex: 2, toWeekIndex: 1, amount: 1000 })).toBeUndefined();

    const moved = transferBetweenWeeks(data, { allocationId: food.id, fromWeekIndex: 2, toWeekIndex: 1, amount: 100 });
    expect(moved).toBeDefined();
    const weeksAfter = allocationWeeksStatus(moved!, food);
    expect(weeksAfter[0]).toMatchObject({ index: 1, budget: 400, spent: 350, remaining: 50, state: "healthy" });
    expect(weeksAfter[1]).toMatchObject({ index: 2, budget: 200, spent: 0, remaining: 200, state: "healthy" });
  });

  it("mută o limită între două plicuri fără să schimbe tranzacțiile sau soldurile surselor", () => {
    const data = createEmptyAppData(); const [card] = data.settings.paymentSources;
    const transport = { id: "transport", label: "Transport", amount: 500, category: "Transport", sourceId: card.id };
    const food = { id: "food", label: "Alimente", amount: 300, category: "Alimente", sourceId: card.id };
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-31", sourceIds: [], totalLimit: 800, weeklyLimit: 0, allocations: [transport, food], transfers: [] };
    data.transactions = [{ id: "taxi", title: "Taxi", amount: 80, kind: "expense", category: "Transport", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-08-04", allocationId: "transport" }];
    card.openingBalance = 2000;
    expect(transferBetweenEnvelopes(data, { fromAllocationId: "transport", toAllocationId: "food", amount: 500 })).toBeUndefined();
    expect(transferBetweenEnvelopes(data, { fromAllocationId: "transport", toAllocationId: "transport", amount: 50 })).toBeUndefined();
    const moved = transferBetweenEnvelopes(data, { fromAllocationId: "transport", toAllocationId: "food", amount: 120, note: "Taxi mai puțin" });
    expect(moved).toBeDefined();
    expect(allocationBudget(moved!, transport)).toBe(380);
    expect(allocationBudget(moved!, food)).toBe(420);
    expect(allocationStatus(moved!, transport).remaining).toBe(300);
    expect(moved!.transactions).toEqual(data.transactions);
    expect(sourceBalance(moved!, card.id)).toBe(sourceBalance(data, card.id));
    expect(moved!.settings.salaryPlan.transfers[0]).toMatchObject({ fromAllocationId: "transport", toAllocationId: "food", amount: 120, note: "Taxi mai puțin" });
  });

  it("ordonează datoriile ca minge de zăpadă, de la cea mai mică rămasă", () => {
    const data = createEmptyAppData();
    data.debts = [
      { id: "car", name: "Credit auto", remaining: 18000, monthly: 900, due: "lună", tone: "coral" },
      { id: "phone", name: "Telefon", remaining: 1200, monthly: 200, due: "lună", tone: "honey" },
      { id: "done", name: "Achitat", remaining: 0, monthly: 0, due: "—", tone: "forest" },
      { id: "store", name: "Rate magazin", remaining: 450, monthly: 150, due: "lună", tone: "honey" },
    ];
    const ball = debtSnowball(data);
    expect(ball.count).toBe(3);
    expect(ball.order.map((item) => item.debt.id)).toEqual(["store", "phone", "car"]);
    expect(ball.next).toMatchObject({ debt: expect.objectContaining({ id: "store" }), recommended: 150, monthsAtMinimum: 3, isNext: true });
    expect(ball.totalRemaining).toBe(19650);
  });

  it("listează veniturile încă nerepartizate prin ritualul de salariu", () => {
    const data = createEmptyAppData(); const [card] = data.settings.paymentSources;
    data.transactions = [
      { id: "salary-old", title: "Salariu iulie", amount: 4000, kind: "income", category: "Venit", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-07-01" },
      { id: "salary-new", title: "Salariu august", amount: 4200, kind: "income", category: "Venit", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-08-01" },
    ];
    data.settings.salaryPlan.salaryAllocationApplications = [{ id: "app-1", incomeId: "salary-old", incomeTitle: "Salariu iulie", incomeAmount: 4000, appliedAt: "2026-07-01T12:00:00.000Z", allocations: [{ ruleId: "r1", allocationId: "food", amount: 400 }] }];
    expect(unappliedSalaryIncomes(data).map((item) => item.id)).toEqual(["salary-new"]);
  });

  it("migrează o dată veche ne-normalizată într-un format ISO", () => {
    const migrated = normalizeAppData({ version: 5, transactions: [{ id: "legacy", title: "Bon", amount: 20, kind: "expense", category: "Alimente", source: "Bon", person: "Eu", date: "26 aug." }], settings: {} });
    expect(migrated.version).toBe(9);
    expect(migrated.transactions[0].date).toBe(isoToday());
    expect(migrated.transactions[0].sourceId).toBe(migrated.settings.paymentSources.find((source) => source.kind === "meal")?.id);
    expect(migrated.deleted).toEqual([]);
  });

  it("păstrează defensiv șabloanele locale fără a le confunda cu tranzacțiile", () => {
    const migrated = normalizeAppData({ settings: { quickTemplates: [{ id: "taxi", label: "Taxi serviciu", kind: "expense", category: "Transport", amount: "45,50", memberId: "member-me", sourceId: "source-cash" }] } });
    expect(migrated.settings.quickTemplates).toEqual([expect.objectContaining({ id: "taxi", label: "Taxi serviciu", amount: 45.5, category: "Transport" })]);
    expect(migrated.transactions).toEqual([]);
  });

  it("aplică o singură dată reguli compatibile unui venit și poate anula exact limitele adăugate", () => {
    const data = createEmptyAppData(); const [card, cash] = data.settings.paymentSources;
    const transport = { id: "transport", label: "Transport", amount: 100, category: "Transport", sourceId: card.id, memberId: "member-me" };
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-31", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [transport], transfers: [], salaryAllocationRules: [{ id: "fixed", label: "200 transport", allocationId: "transport", mode: "fixed", value: 200, active: true }, { id: "percent", label: "10% transport", allocationId: "transport", mode: "percent", value: 10, active: true }, { id: "cash-only", label: "cash", allocationId: "transport", mode: "fixed", value: 100, active: false }] };
    data.transactions = [{ id: "salary", title: "Salariu august", amount: 1000, kind: "income", category: "Venit", sourceId: card.id, source: card.name, memberId: "member-me", person: "Eu", date: "2026-08-01" }];
    const result = applySalaryAllocationRules(data, "salary");
    expect(result).toMatchObject({ total: 300, remaining: 700, applied: [{ allocationId: "transport", amount: 200 }, { allocationId: "transport", amount: 100 }] });
    expect(result.data.settings.salaryPlan.allocations[0].amount).toBe(400);
    expect(result.data.transactions).toEqual(data.transactions);
    expect(applySalaryAllocationRules(result.data, "salary").error).toContain("deja repartizat");
    const reverted = revertSalaryAllocationApplication(result.data, result.data.settings.salaryPlan.salaryAllocationApplications![0].id);
    expect(reverted.settings.salaryPlan.allocations[0].amount).toBe(100);
    expect(reverted.transactions).toEqual(data.transactions);
    expect(cash.id).toBeTruthy();
  });


  it("normalizează arhiva locală de șabloane și filtrele salvate valide", () => {
    const migrated = normalizeAppData({ settings: { archivedQuickTemplates: [{ id: "taxi-aug", label: "Taxi august", kind: "expense", category: "Transport", amount: "45,50", archivedAt: "2026-08-27T10:00:00.000Z" }], savedJournalFilters: [{ id: "august", label: "Ieșiri august", kind: "expense", query: "taxi", fromDate: "2026-08-01", toDate: "2026-08-31", updatedAt: "2026-08-27T10:00:00.000Z" }, { id: "bad-range", label: "Interval greșit", kind: "all", fromDate: "2026-08-31", toDate: "2026-08-01" }, { id: "august-duplicate", label: "ieșiri august", kind: "all" }] } });
    expect(migrated.settings.archivedQuickTemplates).toEqual([expect.objectContaining({ id: "taxi-aug", amount: 45.5, archivedAt: "2026-08-27T10:00:00.000Z" })]);
    expect(migrated.settings.savedJournalFilters).toEqual([expect.objectContaining({ id: "august", label: "Ieșiri august", kind: "expense", query: "taxi" })]);
  });

  it("calculează săptămâna luni–duminică și poate filtra numai mișcările unui membru", () => {
    const data = createEmptyAppData(); const source = data.settings.paymentSources[0]; data.settings.members.push({ id: "member-partner", name: "Soție" });
    data.transactions = [{ id: "income", title: "Salariu", amount: 1000, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-24" }, { id: "taxi", title: "Taxi", amount: 75, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-25" }, { id: "food", title: "Alimente", amount: 120, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-partner", person: "Soție", date: "2026-08-30" }, { id: "old", title: "Vechi", amount: 999, kind: "expense", category: "Altele", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-23" }];
    expect(weeklySummary(data, "2026-08-27")).toMatchObject({ start: "2026-08-24", end: "2026-08-30", income: 1000, expense: 195, cashflow: 805, transactionCount: 3, categories: [["Alimente", 120], ["Transport", 75]] });
    expect(weeklySummary(data, "2026-08-27", "member-me")).toMatchObject({ income: 1000, expense: 75, cashflow: 925, transactionCount: 2, categories: [["Transport", 75]] });
  });

  it("elimină defensiv prima dată de venit dacă ar începe înaintea planului", () => {
    const migrated = normalizeAppData({ settings: { salaryPlan: { periodStart: "2026-08-05", nextPayday: "2026-08-10", earliestPayday: "2026-08-02", sourceIds: [], totalLimit: 0, weeklyLimit: 0, allocations: [] } } });
    expect(migrated.settings.salaryPlan.earliestPayday).toBeUndefined();
  });

  it("rezervă o scadență activă și o scoate din plan după confirmarea plății", () => {
    const data = createEmptyAppData();
    const source = data.settings.paymentSources[0];
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-20", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [], transfers: [] };
    data.recurring = [{ id: "internet", name: "Internet", amount: 60, category: "Casă & facturi", sourceId: source.id, memberId: "member-me", dueDay: 15, active: true }];
    expect(pendingRecurringInPlan(data)).toHaveLength(1);
    data.transactions = [{ id: "paid", recurringId: "internet", title: "Internet", amount: 60, kind: "expense", category: "Casă & facturi", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-15" }];
    expect(pendingRecurringInPlan(data)).toHaveLength(0);
  });

  it("adaugă automat o scadență o singură dată și adaptează ziua 31 la februarie", () => {
    const data = createEmptyAppData(); const source = data.settings.paymentSources[0];
    data.recurring = [{ id: "rent", name: "Chirie", amount: 1800, category: "Casă & facturi", sourceId: source.id, memberId: "member-me", dueDay: 31, active: true, autoPost: true }];
    const posted = autoPostDueRecurring(data, "2026-02-28");
    expect(posted.transactions).toHaveLength(1); expect(posted.transactions[0]).toMatchObject({ id: "recurring-auto-rent-2026-02-28", recurringId: "rent", date: "2026-02-28", amount: 1800 });
    expect(autoPostDueRecurring(posted, "2026-02-28").transactions).toHaveLength(1);
  });

  it("proiectează explicit ritmul actual până la următorul venit", () => {
    const data = createEmptyAppData();
    const source = data.settings.paymentSources[0];
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-10", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [], transfers: [] };
    data.transactions = [
      { id: "pace-income", title: "Salariu", amount: 1000, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-01" },
      { id: "pace-1", title: "Alimente", amount: 100, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-01" },
      { id: "pace-2", title: "Transport", amount: 100, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-02" },
    ];
    const forecast = planForecast(data, "2026-08-02");
    expect(forecast.paceDaily).toBe(100);
    expect(forecast.projectedExpenses).toBe(1000);
    expect(forecast.projectedRemaining).toBe(0);
    expect(forecast.safeDaily).toBeCloseTo(88.8889, 3);
  });

  it("folosește prima dată posibilă din fereastra de venit pentru un plan prudent", () => {
    const data = createEmptyAppData();
    const source = data.settings.paymentSources[0];
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-10", earliestPayday: "2026-08-07", paydayFlexDays: 3, sourceIds: [], totalLimit: 700, weeklyLimit: 0, allocations: [], transfers: [] };
    data.transactions = [{ id: "pace", title: "Cheltuială", amount: 100, kind: "expense", category: "Altele", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-02" }];
    expect(inPlanPeriod("2026-08-08", data.settings.salaryPlan)).toBe(true);
    expect(inPlanPeriod("2026-08-14", data.settings.salaryPlan)).toBe(false);
    expect(planForecast(data, "2026-08-02").remainingDays).toBe(6);
  });

  it("ține plicurile active dacă salariul întârzie cu fereastra aleasă", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-10", paydayFlexDays: 3, sourceIds: [], totalLimit: 700, weeklyLimit: 0, allocations: [], transfers: [] };
    expect(paydayWindow(data.settings.salaryPlan)).toMatchObject({ typical: "2026-08-10", earliest: "2026-08-07", latest: "2026-08-13", flex: 3 });
    expect(planEndDate(data.settings.salaryPlan)).toBe("2026-08-10");
    expect(inPlanPeriod("2026-08-12", data.settings.salaryPlan)).toBe(true);
  });

  it("interpretează local o cheltuială descrisă în limbaj natural", () => {
    expect(parseNaturalSpendScenario("Dacă plătesc 120 lei pe taxi mâine")).toMatchObject({ amount: 120, category: "Transport", timing: "mâine", understood: true });
    expect(parseNaturalSpendScenario("o cafea mâine")).toMatchObject({ amount: 0, category: "Băuturi", understood: false });
  });

  it("calculează media zilnică pentru un buget săptămânal fără a interpreta întrebarea ca o cheltuială", () => {
    const answer = answerBudgetQuestion("La un buget alimente cu de 600 pe săptămână, cât e media de cheltuit pe zi?", createEmptyAppData());
    expect(answer).toMatchObject({ kind: "daily-average", amount: 600, days: 7, result: 600 / 7, category: "Alimente", source: "declared" });
  });

  it("propune economisire doar din plan și mișcările reale", () => {
    const data = createEmptyAppData(); const source = data.settings.paymentSources[0];
    data.settings.salaryPlan = { periodStart: "2026-08-01", nextPayday: "2026-08-10", sourceIds: [], totalLimit: 1000, weeklyLimit: 0, allocations: [], transfers: [] };
    data.transactions = [{ id: "food", title: "Alimente", amount: 400, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-02" }];
    const suggestions = savingSuggestions(data, "2026-08-02");
    expect(suggestions.some((item) => item.id === "category" && item.potential === 40)).toBe(true);
    expect(suggestions.some((item) => item.id === "pace")).toBe(true);
  });

  it("explică presiunea bilanțului și a ratelor din istoricul personal", () => {
    const data = createEmptyAppData(); const source = data.settings.paymentSources[0]; source.openingBalance = 300;
    data.debts = [{ id: "credit", name: "Credit", remaining: 2600, monthly: 500, due: "28 august", tone: "forest" }];
    data.transactions = [{ id: "salary", title: "Salariu", amount: 1200, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-10" }];
    const suggestions = savingSuggestions(data, "2026-08-20");
    expect(suggestions.find((item) => item.id === "net-position")).toMatchObject({ tone: "risk", potential: 1100, nextStep: "Revizuiește ratele și planul" });
    expect(suggestions.find((item) => item.id === "rate-pressure")).toMatchObject({ tone: "watch", potential: 500 });
  });

  it("semnalează o categorie care a crescut între două săptămâni din istoric", () => {
    const data = createEmptyAppData(); const source = data.settings.paymentSources[0];
    data.transactions = [{ id: "old-transport", title: "Taxi", amount: 60, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-02" }, { id: "new-transport", title: "Taxi", amount: 170, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-12" }];
    const trend = savingSuggestions(data, "2026-08-14").find((item) => item.id === "history-trend");
    expect(trend).toMatchObject({ tone: "watch", potential: 110, nextStep: "Vezi mișcările categoriei" });
  });

  it("unește modificările a două telefoane și păstrează ștergerile recente", () => {
    const local = createEmptyAppData(); const remote = createEmptyAppData(); const source = local.settings.paymentSources[0];
    local.transactions = [{ id: "local", title: "Taxi", amount: 25, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-10", updatedAt: "2026-08-10T09:00:00.000Z" }];
    remote.savings = [{ id: "goal", name: "Vacanță", current: 100, target: 1000, due: "Decembrie", tone: "honey", updatedAt: "2026-08-10T10:00:00.000Z" }];
    remote.transactions = [{ id: "deleted", title: "Dublură", amount: 10, kind: "expense", category: "Altele", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-10", updatedAt: "2026-08-10T09:00:00.000Z" }];
    local.deleted = [{ entity: "transactions", id: "deleted", deletedAt: "2026-08-10T11:00:00.000Z" }];
    const merged = mergeFamilyData(local, remote);
    expect(merged.transactions.map((item) => item.id)).toEqual(["local"]);
    expect(merged.savings.map((item) => item.id)).toEqual(["goal"]);
    expect(merged.deleted).toHaveLength(1);
  });

  it("păstrează toate mișcările create simultan pe două telefoane, fără coliziuni de ID", () => {
    const local = createEmptyAppData(); const remote = createEmptyAppData(); const source = local.settings.paymentSources[0];
    const now = "2026-08-27T09:00:00.000Z";
    const onDevice = (person: string) => Array.from({ length: 200 }, (_, index) => ({ id: newId("tx"), title: `Cheltuială ${index}`, amount: 10, kind: "expense" as const, category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person, date: "2026-08-27", createdAt: now, updatedAt: now }));
    local.transactions = onDevice("Telefon local");
    remote.transactions = onDevice("Telefon la distanță");
    const merged = mergeFamilyData(local, remote);
    expect(merged.transactions).toHaveLength(local.transactions.length + remote.transactions.length);
    expect(new Set(merged.transactions.map((item) => item.id)).size).toBe(merged.transactions.length);
  });

  it("nu reintroduce o scadență recurentă ștearsă pe un alt telefon", () => {
    const local = createEmptyAppData(); const remote = createEmptyAppData(); const source = local.settings.paymentSources[0];
    remote.recurring = [{ id: "subscription", name: "Abonament", amount: 50, category: "Casă & facturi", sourceId: source.id, memberId: "member-me", dueDay: 8, active: true, updatedAt: "2026-08-08T08:00:00.000Z" }];
    local.deleted = [{ entity: "recurring", id: "subscription", deletedAt: "2026-08-08T09:00:00.000Z" }];
    expect(mergeFamilyData(local, remote).recurring).toEqual([]);
  });

  it("salvează un bon din magazin și total, fără poze și fără linii de produs complete", () => {
    expect(resolveReceiptLines([{ id: "a", category: "Alimente", amount: "", label: "" }], 42.5)).toEqual([
      { id: "a", category: "Alimente", amount: 42.5, label: undefined },
    ]);
    expect(resolveReceiptLines([], 18)).toEqual([{ id: "whole", category: "Alimente", amount: 18, label: undefined }]);
  });
  it("păstrează liniile de produs când au sume, fără să le înlocuiască cu totalul", () => {
    expect(resolveReceiptLines([
      { id: "a", category: "Alimente", amount: "10", label: "lapte" },
      { id: "b", category: "Băuturi", amount: "5,50", label: "apă" },
    ], 15.5)).toEqual([
      { id: "a", category: "Alimente", amount: 10, label: "lapte" },
      { id: "b", category: "Băuturi", amount: 5.5, label: "apă" },
    ]);
  });
  it("pune restul de pe bon într-o linie, fără să ceară totalul la ban", () => {
    const closed = closeReceiptGap([
      { id: "a", category: "Alimente", amount: 62.95, label: "Lapte" },
    ], 64.94);
    expect(closed.over).toBe(false);
    expect(closed.remainder).toBeCloseTo(1.99, 2);
    expect(closed.lines).toHaveLength(2);
    expect(closed.lines[1]).toMatchObject({ category: "Altele", amount: 1.99, label: "Rest bon" });
    expect(closed.lines.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(64.94, 2);
    expect(closeReceiptGap([{ id: "a", category: "Alimente", amount: 70 }], 64.94).over).toBe(true);
  });
  it("împarte un venit în patru săptămâni calendaristice egale", () => {
    const plan = calendarBudget(2400, "2026-08-31", "2026-09-27");
    expect(plan).toMatchObject({ total: 2400, days: 28, exactWeeks: 4, weeklyAmount: 600 });
    expect(plan?.weeks).toHaveLength(4);
    expect(plan?.weeks.map((week) => week.amount)).toEqual([600, 600, 600, 600]);
  });
  it("împarte transparent patru săptămâni și jumătate, păstrând totalul exact", () => {
    const plan = calendarBudget(2400, "2026-08-31", "2026-10-01");
    expect(plan).toMatchObject({ days: 32, exactWeeks: 32 / 7, weeklyAmount: 525 });
    expect(plan?.weeks).toHaveLength(5);
    expect(plan?.weeks.at(-1)).toMatchObject({ days: 4, amount: 300 });
    expect(plan?.weeks.reduce((sum, week) => sum + week.amount, 0)).toBe(2400);
    expect(calendarBudget(2400, "2026-10-01", "2026-08-31")).toBeUndefined();
  });
  it("normalizează șabloanele locale de ciclu și marcajele alertei fără a le confunda cu date financiare", () => {
    const data = normalizeAppData({ version: 8, settings: { memberName: "Eu", salaryCycleTemplates: [{ id: "valid", label: " Salariu lunar ", amount: "2400", durationDays: 30 }, { id: "invalid", label: "", amount: 0, durationDays: 2 }], seenWeeklyPlanTranches: ["2026-09-01:2026-09-07:1", "nevalid"] } });
    expect(data.settings.salaryCycleTemplates).toEqual([expect.objectContaining({ id: "valid", label: "Salariu lunar", amount: 2400, durationDays: 30 })]);
    expect(data.settings.seenWeeklyPlanTranches).toEqual(["2026-09-01:2026-09-07:1"]);
  });
  it("păstrează doar cheile valide IndexedDB pentru bonuri la normalizare", () => {
    const data = normalizeAppData({ receipts: [{ id: "bon", vendor: "Magazin", amount: 18, category: "Alimente", date: "2026-08-27", imageKeys: ["bon:image:0", "bon:image:1", 42] }] });
    expect(data.receipts[0]).toMatchObject({ id: "bon", imageKeys: ["bon:image:0", "bon:image:1"] });
  });
  it("deduce aceeași cameră de sincronizare din aceeași parolă, dar niciodată parola însăși", async () => {
    const roomId = await deriveFamilyRoomId("parola-familiei-12");
    expect(roomId).toBe(await deriveFamilyRoomId("parola-familiei-12"));
    expect(roomId).not.toBe(await deriveFamilyRoomId("altă-parolă-1234"));
    expect(roomId).toMatch(/^[0-9a-f]{64}$/);
  });

});

describe("sugestia săptămânală din fluxul real", () => {
  it("propune sume pe plicuri din ultimele 7 zile fără a modifica planul", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan.allocations = [
      { id: "a1", label: "Alimente", amount: 800, category: "Alimente" },
      { id: "a2", label: "Transport", amount: 200, category: "Transport" },
    ];
    data.transactions = [
      { id: "t1", title: "Lidl", amount: 120, kind: "expense", category: "Alimente", source: "Card", person: "Eu", date: "2026-09-10", sourceId: "source-debit", memberId: "member-me" },
      { id: "t2", title: "Uber", amount: 45, kind: "expense", category: "Transport", source: "Card", person: "Eu", date: "2026-09-11", sourceId: "source-debit", memberId: "member-me" },
      { id: "t3", title: "Lidl", amount: 80, kind: "expense", category: "Alimente", source: "Card", person: "Eu", date: "2026-09-12", sourceId: "source-debit", memberId: "member-me" },
    ];
    const before = structuredClone(data.settings.salaryPlan.allocations);
    const hint = suggestWeeklyAllocationsFromCashflow(data, "2026-09-12");
    expect(hint.suggestions.find((item) => item.allocationId === "a1")?.suggestedAmount).toBe(200);
    expect(hint.suggestions.find((item) => item.allocationId === "a2")?.suggestedAmount).toBe(45);
    expect(data.settings.salaryPlan.allocations).toEqual(before);
  });
});


describe("perspectivă personală vs comună", () => {
  it("tratează mișcările fără câmp ca shared și păstrează personal la normalizare", () => {
    const data = createEmptyAppData();
    data.transactions = [
      { id: "t1", title: "Lidl", amount: 40, kind: "expense", category: "Alimente", source: "Card", person: "Eu", date: "2026-09-10", shareScope: "personal" },
      { id: "t2", title: "Chirie", amount: 2000, kind: "expense", category: "Casă & facturi", source: "Card", person: "Eu", date: "2026-09-10" },
    ];
    const normalized = normalizeAppData(data);
    expect(transactionShareScope(normalized.transactions.find((item) => item.id === "t1"))).toBe("personal");
    expect(transactionShareScope(normalized.transactions.find((item) => item.id === "t2"))).toBe("shared");
    expect(normalized.transactions.find((item) => item.id === "t2")?.shareScope).toBeUndefined();
  });
});

describe("plan săptămânal din scadențe și obiective", () => {
  it("adaugă scadențe și obiective peste cheltuielile din ultimele 7 zile", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan = {
      ...data.settings.salaryPlan,
      periodStart: "2026-09-01",
      nextPayday: "2026-09-30",
      allocations: [
        { id: "a1", label: "Alimente", category: "Alimente", amount: 100 },
        { id: "a2", label: "Economii", category: "Economii", amount: 50 },
        { id: "a3", label: "Casă", category: "Casă & facturi", amount: 0 },
      ],
    };
    data.transactions = [
      { id: "t1", title: "Lidl", amount: 80, kind: "expense", category: "Alimente", source: "Card", person: "Eu", date: "2026-09-10", sourceId: "source-debit", memberId: "member-me" },
    ];
    data.recurring = [{
      id: "r1", name: "Internet", amount: 60, category: "Casă & facturi", sourceId: "source-debit",
      memberId: "member-me", dueDay: 14, active: true,
    }];
    data.savings = [{
      id: "g1", name: "Vacanță", current: 0, target: 700, due: "octombrie", dueDate: "2026-09-26", tone: "honey",
    }];
    const hint = suggestWeeklyAllocationsFromCashflow(data, "2026-09-12");
    expect(hint.suggestions.find((item) => item.allocationId === "a1")?.suggestedAmount).toBe(80);
    expect(hint.suggestions.find((item) => item.allocationId === "a3")?.fromDues).toBeGreaterThan(0);
    expect(hint.suggestions.find((item) => item.allocationId === "a2")?.fromGoals).toBeGreaterThan(0);
  });
});

describe("money2 + invarianti pe mutatori", () => {
  it("money2 rotunjește la 2 zecimale semnat", async () => {
    const { money2 } = await import("./finance-data");
    expect(money2(1.005)).toBe(1.01);
    expect(money2(10.999)).toBe(11);
    expect(money2(0.1 + 0.2)).toBe(0.3);
    expect(money2(12.345)).toBe(12.35);
    expect(money2(-2.5)).toBe(-2.5);
  });

  it("transfer plic păstrează suma totală a limitelor", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan.allocations = [
      { id: "a", label: "Alimente", category: "Alimente", amount: 100.555 },
      { id: "b", label: "Transport", category: "Transport", amount: 50.445 },
    ];
    const before = data.settings.salaryPlan.allocations.reduce((s, a) => s + a.amount, 0);
    const next = transferBetweenEnvelopes(data, { fromAllocationId: "a", toAllocationId: "b", amount: 10.333 });
    expect(next).toBeTruthy();
    const budgets = next!.settings.salaryPlan.allocations.map((a) => allocationBudget(next!, a));
    expect(budgets.reduce((s, n) => s + n, 0)).toBeCloseTo(before, 1);
    expect(sourceBalance(next!, data.settings.paymentSources[0].id)).toBe(sourceBalance(data, data.settings.paymentSources[0].id));
  });

  it("confirmReview + debt payment rămân deterministe pe sold", () => {
    const data = createEmptyAppData();
    const source = data.settings.paymentSources[0];
    source.openingBalance = 500;
    data.debts = [{ id: "d1", name: "Credit", remaining: 100, monthly: 20, due: "1", tone: "forest" }];
    const paid = recordDebtPayment(data, { debtId: "d1", amount: 30.555, sourceId: source.id, memberId: data.settings.members[0].id, date: isoToday() });
    expect(paid).toBeTruthy();
    expect(paid!.debts[0].remaining).toBe(69.44);
    expect(sourceBalance(paid!, source.id)).toBe(469.44);
  });
});

describe("categoriile ghicite din text (utilizator #18)", () => {
  it("grădinița e Educație, rata la bancă e Credite, farmacia e Sănătate", async () => {
    const { guessCategoryFromText, expenseCategories } = await import("./finance-data");
    expect(guessCategoryFromText("Grădiniță Albinuța", expenseCategories)).toBe("Educație");
    expect(guessCategoryFromText("Rata BCR", expenseCategories)).toBe("Credite");
    expect(guessCategoryFromText("Farmacia Catena", expenseCategories)).toBe("Sănătate");
    expect(guessCategoryFromText("rata telefon eMAG", expenseCategories)).toBe("Rate produse");
  });
});
