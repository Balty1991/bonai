import { describe, expect, it } from "vitest";
import { createEmptyAppData, allocationStatus } from "./finance-data";
import { acceptRecurringPrice, ageOfMoney, ageOfMoneyLine, analysisCompareWindow, calendarPace, calendarPaceLine, detectSubscriptions, envelopeBurnPace, extendRunOutMove, formatWeeklyCheckInShare, householdActivity, householdActivityInCycle, lastDaysPulse, mealRunway, mealRunwayLine, monthlyRecap, nextTrueExpense, paydayTrack, pocketSlices, recurringFromDetection, recurringPriceChanges, repeatedOverLine, savingsSuggestion, monthlySurplus, envelopeRunOut, monthlyFamilyReport, formatMonthlyReportShare, subscriptionSpend, safeSpendBreakdown, todayBrief, trackModeHero, weeklyCheckIn, weeklyDigestHeadline, weeklyEnvelopeDailyRhythm, dayStripFigure, stripLei, envelopeUntilPayday, weekVersusLast, weekVersusLastLine } from "./household-insights";
import { buildTodaySummary } from "./today-summary";

const base = () => {
  const data = createEmptyAppData();
  const source = data.settings.paymentSources[0];
  source.openingBalance = 0;
  data.settings.members = [
    { id: "member-me", name: "Eu" },
    { id: "member-partner", name: "Soția" },
  ];
  return { data, source };
};

describe("analize de gospodărie", () => {
  it("calculează vârsta banilor ca medie ponderată FIFO între încasare și cheltuială", () => {
    const { data, source } = base();
    data.transactions = [
      { id: "in-1", title: "Salariu", amount: 2000, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-01" },
      { id: "out-1", title: "Chirie", amount: 1000, kind: "expense", category: "Casă & facturi", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-11" },
      { id: "out-2", title: "Alimente", amount: 1000, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-21" },
    ];
    expect(ageOfMoney(data, "2026-07-31")).toMatchObject({ days: 15, sampleAmount: 2000, unfundedAmount: 0 });
    expect(ageOfMoneyLine(ageOfMoney(data, "2026-07-31"))).toBeUndefined();
  });

  it("spune vârsta banilor doar când sunt destule cheltuieli ca să nu fie zgomot", () => {
    const { data, source } = base();
    const spend = (id: string, day: string) => ({ id, title: "Piață", amount: 100, kind: "expense" as const, category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: day });
    data.transactions = [
      { id: "in-1", title: "Salariu", amount: 2000, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-01" },
      spend("a", "2026-07-10"),
      spend("b", "2026-07-16"),
      spend("c", "2026-07-20"),
      spend("d", "2026-07-24"),
    ];
    const line = ageOfMoneyLine(ageOfMoney(data, "2026-07-31"));
    expect(line).toMatch(/înainte să plece/);
    expect(line).not.toMatch(/undefined/);
  });

  it("avertizează că bonurile se termină înainte de salariu, și tace când ajung", () => {
    const { data } = base();
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-01", nextPayday: "2026-09-30" };
    data.settings.paymentSources.push({ id: "meal", name: "Bonuri", kind: "meal", openingBalance: 150 });
    const lunch = (id: string, date: string) => ({ id, title: "Prânz", amount: 40, kind: "expense" as const, category: "Alimente", sourceId: "meal", source: "Bonuri", memberId: "member-me", person: "Eu", date });
    data.transactions = [lunch("m1", "2026-09-02"), lunch("m2", "2026-09-08"), lunch("m3", "2026-09-12")];
    const short = mealRunway(data, "2026-09-14");
    expect(short).toBeDefined();
    expect(short!.days).toBeLessThan(short!.daysToPayday);
    expect(mealRunwayLine(short)).toMatch(/înainte de salariu/);
    data.settings.paymentSources.find((item) => item.id === "meal")!.openingBalance = 4000;
    expect(mealRunway(data, "2026-09-14")).toBeUndefined();
    data.transactions = [];
    data.settings.paymentSources.find((item) => item.id === "meal")!.openingBalance = 150;
    expect(mealRunway(data, "2026-09-14")).toBeUndefined();
  });

  it("grupează banii pe felul sursei și tace la un singur fel", () => {
    const { data, source } = base();
    source.openingBalance = 1200;
    expect(pocketSlices(data).map((item) => item.kind)).toEqual(["card"]);
    data.settings.paymentSources.push({ id: "cash", name: "Cash", kind: "cash", openingBalance: 80 });
    const slices = pocketSlices(data);
    expect(slices.find((item) => item.kind === "card")?.amount).toBe(1200);
    expect(slices.find((item) => item.kind === "cash")?.amount).toBe(80);
  });

  it("arată costul care vine în 90 de zile și încă nu e strâns", () => {
    const { data } = base();
    data.settings.plannedEvents = [{ id: "cr", name: "Crăciun", date: "2026-12-20", estimate: 800, kind: "holiday", repeat: "yearly", contributions: [{ id: "c1", amount: 200, date: "2026-10-01" }] }];
    const near = nextTrueExpense(data, "2026-11-10");
    expect(near).toMatchObject({ name: "Crăciun", left: 600 });
    expect(near!.monthly).toBeGreaterThan(50);
    data.settings.plannedEvents[0].date = "2027-08-01";
    expect(nextTrueExpense(data, "2026-11-10")).toBeUndefined();
  });

  it("compară aceleași zile cu săptămâna trecută, nu toată săptămâna", () => {
    const { data, source } = base();
    const expense = (id: string, date: string, amount: number) => ({ id, title: "Lidl", amount, kind: "expense" as const, category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date });
    data.transactions = [
      expense("a", "2026-09-07", 100),
      expense("b", "2026-09-08", 50),
      expense("c", "2026-09-01", 40),
      expense("d", "2026-09-06", 500),
    ];
    const row = weekVersusLast(data, "2026-09-09");
    expect(row).toMatchObject({ days: 3, thisSpent: 150, lastSpent: 40, delta: 110 });
    expect(row?.byDay.map((day) => [day.weekday, day.thisSpent, day.lastSpent])).toEqual([
      [0, 100, 0],
      [1, 50, 40],
      [2, 0, 0],
    ]);
    expect(weekVersusLastLine(row)).toMatch(/mai mult/);
    expect(weekVersusLastLine(row)).toMatch(/3 zile/);
    data.transactions = [expense("only", "2026-09-08", 80)];
    expect(weekVersusLast(data, "2026-09-09")).toBeUndefined();
    data.transactions = [expense("now", "2026-09-07", 100), expense("then", "2026-08-31", 90)];
    expect(weekVersusLastLine(weekVersusLast(data, "2026-09-07"))).toMatch(/Cam la fel/);
  });

  it("spune când un plic a luat-o înaintea zilelor ciclului", () => {
    const { data, source } = base();
    data.settings.salaryPlan.periodStart = "2026-09-01";
    data.settings.salaryPlan.nextPayday = "2026-09-30";
    data.settings.salaryPlan.allocations = [
      { id: "alloc-food", label: "Alimente", amount: 1000, category: "Alimente", sourceId: source.id, memberId: "member-me" },
    ];
    data.transactions = [
      { id: "e1", title: "Lidl", amount: 800, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-09-02", allocationId: "alloc-food" },
    ];
    const pace = calendarPace(data, "2026-09-05");
    expect(pace?.pace).toBe("behind");
    expect(calendarPaceLine(pace)).toMatch(/Alimente/);
    expect(calendarPaceLine(pace)).toMatch(/80%/);
  });

  it("amintește plicul depășit și în ciclul trecut", () => {
    const { data, source } = base();
    data.settings.salaryPlan.periodStart = "2026-09-01";
    data.settings.salaryPlan.nextPayday = "2026-09-30";
    data.settings.salaryPlan.cycleMemory = [{ periodStart: "2026-08-01", periodEnd: "2026-08-31", spent: 900, leftInEnvelopes: 0, over: ["Alimente"] }];
    data.settings.salaryPlan.allocations = [
      { id: "alloc-food", label: "Alimente", amount: 100, category: "Alimente", sourceId: source.id, memberId: "member-me" },
    ];
    data.transactions = [
      { id: "e1", title: "Lidl", amount: 180, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-09-04", allocationId: "alloc-food" },
    ];
    expect(repeatedOverLine(data)).toMatch(/Alimente/);
    data.transactions = [];
    expect(repeatedOverLine(data)).toBeUndefined();
  });

  it("construiește recapitularea lunii cu categoria dominantă și comparația anterioară", () => {
    const { data, source } = base();
    data.transactions = [
      { id: "in-aug", title: "Salariu", amount: 4000, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-01" },
      { id: "out-aug-1", title: "Netflix", amount: 70, kind: "expense", category: "Abonamente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-05" },
      { id: "out-aug-2", title: "Taxi", amount: 130, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-12" },
      { id: "in-jul", title: "Salariu", amount: 4000, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-01" },
      { id: "out-jul", title: "Taxi", amount: 80, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-10" },
    ];
    const recap = monthlyRecap(data, "2026-08");
    expect(recap).toMatchObject({ income: 4000, expense: 200, cashflow: 3800, priorExpense: 80, tone: "good" });
    expect(recap.topCategory).toEqual({ name: "Transport", amount: 130 });
  });

  it("împarte cheltuielile lunii pe membri, fără a crea colecții noi", () => {
    const { data, source } = base();
    data.transactions = [
      { id: "a", title: "Piață", amount: 300, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-04" },
      { id: "b", title: "Farmacie", amount: 100, kind: "expense", category: "Sănătate", sourceId: source.id, source: source.name, memberId: "member-partner", person: "Soția", date: "2026-08-06" },
    ];
    const activity = householdActivity(data, "2026-08");
    expect(activity.familyExpense).toBe(400);
    expect(activity.members.find((item) => item.memberId === "member-me")).toMatchObject({ expense: 300, share: 0.75 });
    expect(activity.members.find((item) => item.memberId === "member-partner")).toMatchObject({ expense: 100, share: 0.25 });
  });

  it("detectează un abonament lunar cu sumă stabilă și îl poate transforma în scadență", () => {
    const { data, source } = base();
    data.transactions = [
      { id: "n1", title: "Netflix", amount: 55, kind: "expense", category: "Abonamente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-06-08" },
      { id: "n2", title: "Netflix", amount: 55, kind: "expense", category: "Abonamente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-08" },
      { id: "n3", title: "Netflix", amount: 55, kind: "expense", category: "Abonamente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-08" },
      { id: "food", title: "Kaufland", amount: 180, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-02" },
      { id: "food2", title: "Kaufland", amount: 210, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-09" },
    ];
    const hits = detectSubscriptions(data, "2026-08-20");
    expect(hits.map((item) => item.name)).toEqual(["Netflix"]);
    expect(hits[0]).toMatchObject({ amount: 55, confidence: "high", category: "Abonamente" });
    const draft = recurringFromDetection(data, hits[0]);
    expect(draft).toMatchObject({ name: "Netflix", amount: 55, dueDay: 8, autoPost: false, sourceId: source.id });
  });

  it("nu propune din nou un abonament deja urmărit ca scadență", () => {
    const { data, source } = base();
    data.recurring = [{ id: "rec-1", name: "Netflix", amount: 55, category: "Abonamente", sourceId: source.id, memberId: "member-me", dueDay: 8, active: true }];
    data.transactions = [
      { id: "n1", title: "Netflix", amount: 55, kind: "expense", category: "Abonamente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-06-08" },
      { id: "n2", title: "Netflix", amount: 55, kind: "expense", category: "Abonamente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-07-08" },
      { id: "n3", title: "Netflix", amount: 55, kind: "expense", category: "Abonamente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-08" },
    ];
    expect(detectSubscriptions(data, "2026-08-20")).toEqual([]);
  });

  it("desenează pulsul pe 7 zile și pune astăzi la capăt", () => {
    const { data, source } = base();
    data.transactions = [
      { id: "e1", title: "Pâine", amount: 20, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-31" },
      { id: "e0", title: "Taxi", amount: 40, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-25" },
    ];
    const pulse = lastDaysPulse(data, 7, "2026-08-31");
    expect(pulse).toHaveLength(7);
    expect(pulse[0].date).toBe("2026-08-25");
    expect(pulse[0].expense).toBe(40);
    expect(pulse[6]).toMatchObject({ date: "2026-08-31", expense: 20, isToday: true });
  });

  it("desenează pista până la venit între începutul ciclului și nextPayday", () => {
    const { data } = base();
    data.settings.salaryPlan.periodStart = "2026-08-01";
    data.settings.salaryPlan.nextPayday = "2026-08-31";
    expect(paydayTrack(data, "2026-08-16")).toMatchObject({ total: 31, elapsed: 16, remaining: 15 });
  });

  it("calculează cât poți cheltui azi ca minimul dintre ritmul sigur și lichidul pe zilele rămase", () => {
    const { data, source } = base();
    source.openingBalance = 3100;
    data.settings.salaryPlan.periodStart = "2026-08-01";
    data.settings.salaryPlan.nextPayday = "2026-08-31";
    const brief = todayBrief(data, "2026-08-16");
    expect(brief.hasPayday).toBe(true);
    expect(brief.spendable).toBeGreaterThan(100);
    expect(brief.spendable).toBeLessThanOrEqual(3100 / 16);
    expect(brief.dues).toEqual([]);
  });

  it("pe drumul fără payday, hero-ul arată lichidul sau cheltuiala de azi, nu 0", () => {
    expect(trackModeHero({ periodIncome: 0, liquidNow: 1155, spentToday: 45 })).toEqual({ kind: "liquid", value: 1155 });
    expect(trackModeHero({ periodIncome: 0, liquidNow: 0, spentToday: 45 })).toEqual({ kind: "spent", value: 45 });
    expect(trackModeHero({ periodIncome: 0, liquidNow: 0, spentToday: 0 })).toEqual({ kind: "empty", value: 0 });
    expect(trackModeHero({ periodIncome: 3000, liquidNow: 3000, spentToday: 0 })).toEqual({ kind: "income", value: 3000 });
    expect(trackModeHero({ periodIncome: 3000, liquidNow: 1200, spentToday: 45 })).toEqual({ kind: "liquid", value: 1200 });
    expect(trackModeHero({ periodIncome: 280, liquidNow: 0, spentToday: 280 })).toEqual({ kind: "liquid", value: 0 });
  });

  it("pune scadențele din următoarele 7 zile în briefingul de azi", () => {
    const { data, source } = base();
    data.settings.salaryPlan.periodStart = "2026-08-01";
    data.settings.salaryPlan.nextPayday = "2026-08-31";
    data.recurring = [{ id: "rec-chirie", name: "Chirie", amount: 1200, category: "Casă & facturi", sourceId: source.id, memberId: "member-me", dueDay: 20, active: true }];
    const brief = todayBrief(data, "2026-08-16");
    expect(brief.dues).toEqual([expect.objectContaining({ name: "Chirie", amount: 1200, dueDate: "2026-08-20", confirmable: true })]);
  });

  it("construiește bilanțul săptămânii luni–duminică, cu plicuri planificat vs realizat", () => {
    const { data, source } = base();
    data.settings.familyName = "Casa Vanzo";
    data.settings.salaryPlan.periodStart = "2026-08-03";
    data.settings.salaryPlan.nextPayday = "2026-08-30";
    data.settings.salaryPlan.allocations = [
      { id: "al-food", label: "Alimente", amount: 400, category: "Alimente", weeklyPace: false, alertThreshold: 80 },
      { id: "al-taxi", label: "Taxi", amount: 200, category: "Transport", weeklyPace: false, alertThreshold: 80 },
    ];
    data.transactions = [
      { id: "in", title: "Avans", amount: 500, kind: "income", category: "Venit", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-24" },
      { id: "food", title: "Lidl", amount: 180, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-25", allocationId: "al-food" },
      { id: "taxi", title: "Bolt", amount: 30, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-partner", person: "Soția", date: "2026-08-26", allocationId: "al-taxi" },
      { id: "old", title: "În afara săptămânii", amount: 900, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-08-10", allocationId: "al-food" },
    ];
    const check = weeklyCheckIn(data, "2026-08-28");
    expect(check.start).toBe("2026-08-24");
    expect(check.end).toBe("2026-08-30");
    expect(check.income).toBe(500);
    expect(check.expense).toBe(210);
    expect(check.shouldPrompt).toBe(true);
    const food = check.envelopes.find((item) => item.id === "al-food");
    const taxi = check.envelopes.find((item) => item.id === "al-taxi");
    // Plicurile lunare se judecă pe tot ciclul: Alimente e depășit (1.080 din 400), taxiul nu.
    expect(food).toMatchObject({ spent: 180, planned: 400, state: "over" });
    expect(taxi).toMatchObject({ spent: 30, planned: 200, state: "healthy" });
    expect(check.members.find((item) => item.memberId === "member-me")?.expense).toBe(180);
    expect(check.members.find((item) => item.memberId === "member-partner")?.expense).toBe(30);
    expect(check.nextStep).toMatch(/Alimente/);
    const share = formatWeeklyCheckInShare(check);
    expect(share).toContain("Casa Vanzo");
    expect(share).toContain("Alimente");
    expect(share).toContain("Următorul pas");
  });

  it("nu cere bilanțul în mijlocul săptămânii și rămâne gol fără mișcări", () => {
    const { data } = base();
    expect(weeklyCheckIn(data, "2026-08-31")).toMatchObject({ shouldPrompt: false, tone: "empty", transactionCount: 0 });
  });

  it("împarte restul plicului săptămânal egal pe zilele rămase, nu reperul până la salariu", () => {
    const { data, source } = base();
    data.settings.salaryPlan = {
      ...data.settings.salaryPlan,
      periodStart: "2026-09-07",
      nextPayday: "2026-10-04",
      allocations: [{ id: "food", label: "Alimente", amount: 2400, category: "Alimente" }],
      transfers: [],
    };
    data.transactions = [
      { id: "lidl", title: "Lidl", amount: 225, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-09-07", allocationId: "food" },
      { id: "rent", title: "Chirie", amount: 1200, kind: "expense", category: "Casă & facturi", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-09-07", allocationId: "outside" },
    ];
    const monday = weeklyEnvelopeDailyRhythm(data, "2026-09-07");
    expect(monday.remaining).toBe(375);
    expect(monday.remainingDays).toBe(7);
    expect(monday.todayShare).toBe(85.71);
    expect(monday.todayLeft).toBe(0);
    expect(monday.futureShare).toBe(62.5);
    expect(monday.days[0]).toMatchObject({ day: "2026-09-07", left: 0, over: true, isToday: true });
    expect(monday.days.slice(1).map((item) => item.left)).toEqual([62.5, 62.5, 62.5, 62.5, 62.5, 62.5]);
    expect(monday.days.every((item) => item.out === 0 || item.day === "2026-09-07")).toBe(true);

    const wednesday = weeklyEnvelopeDailyRhythm(data, "2026-09-09");
    expect(wednesday.remainingDays).toBe(5);
    expect(wednesday.todayOut).toBe(0);
    expect(wednesday.todayShare).toBe(75);
    expect(wednesday.todayLeft).toBe(75);
    expect(wednesday.futureShare).toBe(75);
    // Banda arată toată săptămâna plicului (7 zile), cu luni și marți în urmă.
    expect(wednesday.days).toHaveLength(7);
    expect(wednesday.days[0].day).toBe("2026-09-07");
    expect(wednesday.days.find((item) => item.isToday)).toMatchObject({ day: "2026-09-09", left: 75, isToday: true, over: false });
  });

  it("nu desenează bare false când nu există plic săptămânal", () => {
    const { data } = base();
    data.settings.salaryPlan.allocations = [];
    const rhythm = weeklyEnvelopeDailyRhythm(data, "2026-09-09");
    expect(rhythm.hasWeekly).toBe(false);
    expect(rhythm.days.every((item) => item.fill === 0)).toBe(true);
    expect(dayStripFigure({ isToday: false, isFuture: false, left: 36, out: 0 }, 0, false)).toBe(0);
    expect(dayStripFigure({ isToday: true, isFuture: false, left: 0, out: 250.5 }, 77.4, true)).toBe(77.4);
    expect(stripLei(250.5, "ro-RO")).toBe("250,50");
    expect(stripLei(251, "ro-RO")).toBe("251");
  });

  it("fără data venitului nu inventează un ritm săptămânal", () => {
    const { data } = base();
    data.settings.salaryPlan.nextPayday = "";
    data.settings.salaryPlan.allocations = [
      { id: "food", label: "Alimente", amount: 1500, category: "Alimente" },
    ];
    const rhythm = weeklyEnvelopeDailyRhythm(data, "2026-09-09");
    expect(rhythm.hasWeekly).toBe(false);
    expect(rhythm.days.every((item) => item.left === 0 && item.fill === 0)).toBe(true);
  });

  it("nu consumă ritmul zilnic din plicuri lunare sau din plăți în afara plicurilor", () => {
    const { data, source } = base();
    data.settings.salaryPlan = {
      ...data.settings.salaryPlan,
      periodStart: "2026-09-07",
      nextPayday: "2026-10-04",
      allocations: [
        { id: "food", label: "Alimente", amount: 2400, category: "Alimente" },
        { id: "bills", label: "Facturi", amount: 800, category: "Casă & facturi", weeklyPace: false },
      ],
      transfers: [],
    };
    data.transactions = [
      { id: "bill", title: "ENEL", amount: 400, kind: "expense", category: "Casă & facturi", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-09-07", allocationId: "bills" },
    ];
    const rhythm = weeklyEnvelopeDailyRhythm(data, "2026-09-07");
    expect(rhythm.remaining).toBe(600);
    expect(rhythm.todayOut).toBe(0);
    expect(rhythm.todayShare).toBeCloseTo(85.71, 1);
    expect(rhythm.todayLeft).toBeCloseTo(85.71, 1);
    expect(rhythm.days.every((item) => item.left === rhythm.todayShare)).toBe(true);
  });


  it("perioada începută miercuri: prima săptămână e miercuri–duminică, apoi luni–duminică", () => {
    const { data, source } = base();
    source.openingBalance = 5000;
    data.settings.salaryPlan.periodStart = "2026-09-23";
    data.settings.salaryPlan.nextPayday = "2026-10-15";
    data.settings.salaryPlan.sourceIds = [source.id];
    data.settings.salaryPlan.allocations = [
      { id: "food", label: "Alimente", category: "Alimente", amount: 1500, sourceId: source.id, weeklyPace: true },
    ];
    const asOf = "2026-09-23";
    const rhythm = weeklyEnvelopeDailyRhythm(data, asOf);
    expect(rhythm.days.map((row) => row.day)).toEqual([
      "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
    ]);
    expect(rhythm.remainingDays).toBe(5);
    const summary = buildTodaySummary(data, asOf);
    expect(summary.rhythmNote).toMatch(/duminică/i);

    data.transactions.push({
      id: "lidl", title: "Lidl", amount: 250.5, kind: "expense", category: "Alimente",
      sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: asOf, allocationId: "food",
    });
    const after = weeklyEnvelopeDailyRhythm(data, asOf);
    const afterSummary = buildTodaySummary(data, asOf);
    const boxes = after.days.reduce((sum, row) => sum + (row.isToday || row.isFuture ? row.left : 0), 0);
    expect(boxes).toBeCloseTo(after.remaining, 1);
    expect(after.days.filter((row) => row.day > asOf)).toHaveLength(4);
    expect(after.days.some((row) => row.day === "2026-09-28")).toBe(false);
    expect(afterSummary.heroValue).toBeCloseTo(afterSummary.brief.spendable, 2);
    expect(afterSummary.heroHint).toContain(stripLei(after.remaining, "ro-RO"));
    expect(afterSummary.rhythmNote).toMatch(/duminică/i);
  });
});

describe("fereastra de comparație Analiză", () => {
  it("luna calendaristică compară cu luna anterioară", () => {
    const { data } = base();
    const window = analysisCompareWindow(data.settings.salaryPlan, "2026-09", "calendar");
    expect(window).toMatchObject({
      mode: "calendar",
      start: "2026-09-01",
      end: "2026-09-30",
      priorStart: "2026-08-01",
      priorEnd: "2026-08-31",
    });
  });

  it("ciclul de salariu compară intervalul anterior de aceeași lungime", () => {
    const { data } = base();
    data.settings.salaryPlan.periodStart = "2026-08-26";
    data.settings.salaryPlan.nextPayday = "2026-09-25";
    const window = analysisCompareWindow(data.settings.salaryPlan, "2026-09", "cycle");
    expect(window.mode).toBe("cycle");
    expect(window.start).toBe("2026-08-26");
    expect(window.end).toBe("2026-09-25");
    expect(window.priorEnd).toBe("2026-08-25");
    expect(window.priorStart).toBe("2026-07-26");
  });

  it("fără dată de salariu, ciclul cade pe luna calendaristică", () => {
    const { data } = base();
    data.settings.salaryPlan.periodStart = "2026-09-01";
    data.settings.salaryPlan.nextPayday = "";
    const window = analysisCompareWindow(data.settings.salaryPlan, "2026-09", "cycle");
    expect(window.mode).toBe("calendar");
    expect(window.start).toBe("2026-09-01");
  });

  it("compară burn-ul plicului cu zilele scurse din ciclu", () => {
    const { data, source } = base();
    data.settings.salaryPlan.periodStart = "2026-09-01";
    data.settings.salaryPlan.nextPayday = "2026-09-30";
    data.settings.salaryPlan.allocations = [
      { id: "alloc-food", label: "Alimente", amount: 1000, category: "Alimente", sourceId: source.id, memberId: "member-me" },
    ];
    data.transactions = [
      { id: "e1", title: "Lidl", amount: 200, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-09-05", allocationId: "alloc-food" },
    ];
    const paces = envelopeBurnPace(data, "2026-09-15");
    expect(paces[0]).toMatchObject({ label: "Alimente", usage: 0.2, pace: "ahead" });
    expect(paces[0].expectedUsage).toBeCloseTo(15 / 30, 5);
  });

  it("explică formula Poți folosi azi pe pași", () => {
    const { data, source } = base();
    source.openingBalance = 3000;
    data.settings.salaryPlan.periodStart = "2026-09-01";
    data.settings.salaryPlan.nextPayday = "2026-09-30";
    data.settings.salaryPlan.allocations = [
      { id: "alloc-food", label: "Alimente", amount: 900, category: "Alimente", sourceId: source.id, memberId: "member-me" },
    ];
    const sheet = safeSpendBreakdown(data, "2026-09-10");
    expect(sheet.hasPayday).toBe(true);
    expect(sheet.steps.length).toBeGreaterThanOrEqual(4);
    expect(sheet.spendable).toBeGreaterThanOrEqual(0);
    expect(sheet.summary).toMatch(/Cifra zilei|minim/i);
  });

  it("compune un headline pentru digestul săptămânii", () => {
    const { data, source } = base();
    data.transactions = [
      { id: "e1", title: "Taxi", amount: 80, kind: "expense", category: "Transport", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-09-10" },
    ];
    const digest = weeklyDigestHeadline(data, "2026-09-10");
    expect(digest.title).toMatch(/Transport|ritm|goală|Cheltuielile|depășesc/i);
    expect(digest.detail.length).toBeGreaterThan(0);
    // Sumele din titlu poartă moneda: „cu 80 lei”, nu „cu 80”.
    expect(digest.title).toMatch(/\d\s?lei/);
  });

  it("cu plicuri în ritm, o săptămână fără salariu nu spune că veniturile au fost depășite", () => {
    const { data, source } = base();
    source.openingBalance = 4000;
    data.settings.salaryPlan.periodStart = "2026-09-07";
    data.settings.salaryPlan.nextPayday = "2026-10-07";
    data.settings.salaryPlan.allocations = [{ id: "food", label: "Alimente", amount: 2000, category: "Alimente", sourceId: source.id, weeklyPace: true }];
    data.transactions = [
      { id: "e1", title: "Lidl", amount: 80, kind: "expense", category: "Alimente", sourceId: source.id, source: source.name, memberId: "member-me", person: "Eu", date: "2026-09-10", allocationId: "food" },
    ];
    const digest = weeklyDigestHeadline(data, "2026-09-10");
    expect(digest.title).not.toMatch(/depășesc veniturile/);
    expect(digest.tone).not.toBe("risk");
  });

});


describe("householdActivityInCycle", () => {
  it("folosește periodStart → nextPayday, nu luna calendar", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan.periodStart = "2026-08-20";
    data.settings.salaryPlan.nextPayday = "2026-09-20";
    data.settings.members = [{ id: "me", name: "Eu", color: "#256B5B" }, { id: "partner", name: "Ea", color: "#966E4A" }];
    data.transactions = [
      { id: "t1", title: "Lidl", amount: 100, kind: "expense", category: "Alimente", source: "Card", sourceId: "s", person: "Eu", memberId: "me", date: "2026-08-25", createdAt: "2026-08-25T10:00:00.000Z" },
      { id: "t2", title: "Taxi", amount: 50, kind: "expense", category: "Transport", source: "Card", sourceId: "s", person: "Ea", memberId: "partner", date: "2026-09-05", createdAt: "2026-09-05T10:00:00.000Z" },
      { id: "t3", title: "Vechi", amount: 999, kind: "expense", category: "Altele", source: "Card", sourceId: "s", person: "Eu", memberId: "me", date: "2026-07-01", createdAt: "2026-07-01T10:00:00.000Z" },
    ];
    const cycle = householdActivityInCycle(data, "2026-09-10");
    expect(cycle.familyExpense).toBe(150);
    expect(cycle.members.find((m) => m.memberId === "me")?.expense).toBe(100);
  });

  it("pune mișcarea partenerului de la capătul registrului în feed, nu cele 5 locale vechi", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan.periodStart = "2026-09-01";
    data.settings.salaryPlan.nextPayday = "2026-09-28";
    data.settings.members = [{ id: "me", name: "Eu" }, { id: "partner", name: "Partener" }];
    data.transactions = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `local-${n}`,
      title: `Local ${n}`,
      amount: 10,
      kind: "expense" as const,
      category: "Alimente",
      source: "Card",
      sourceId: "s",
      person: "Eu",
      memberId: "me",
      date: "2026-09-10",
      createdAt: `2026-09-10T0${n}:00:00.000Z`,
    }));
    data.transactions.push({
      id: "partner-taxi",
      title: "Taxi partener",
      amount: 20,
      kind: "expense",
      category: "Transport",
      source: "Card",
      sourceId: "s",
      person: "Partener",
      memberId: "partner",
      date: "2026-09-13",
      createdAt: "2026-09-13T18:00:00.000Z",
    });
    const cycle = householdActivityInCycle(data, "2026-09-13");
    expect(cycle.recent[0].id).toBe("partner-taxi");
    expect(cycle.members.find((item) => item.memberId === "partner")?.expense).toBe(20);
  });

  it("nu pune cheltuielile personale în cota familiei", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan.periodStart = "2026-09-01";
    data.settings.salaryPlan.nextPayday = "2026-09-28";
    data.settings.members = [{ id: "me", name: "Eu" }, { id: "partner", name: "Partener" }];
    data.transactions = [
      { id: "shared", title: "Lidl", amount: 80, kind: "expense", category: "Alimente", source: "Card", sourceId: "s", person: "Eu", memberId: "me", date: "2026-09-10", shareScope: "shared" },
      { id: "mine", title: "Cafea", amount: 20, kind: "expense", category: "Timp liber", source: "Card", sourceId: "s", person: "Eu", memberId: "me", date: "2026-09-10", shareScope: "personal" },
    ];
    const cycle = householdActivityInCycle(data, "2026-09-10");
    expect(cycle.familyExpense).toBe(80);
    expect(cycle.recent.map((item) => item.id)).toEqual(["shared"]);
  });

  it("include cheltuiala din zilele de flex după data obișnuită a venitului", () => {
    const data = createEmptyAppData();
    data.settings.salaryPlan.periodStart = "2026-09-01";
    data.settings.salaryPlan.nextPayday = "2026-09-20";
    data.settings.salaryPlan.paydayFlexDays = 3;
    data.settings.members = [{ id: "me", name: "Eu" }, { id: "partner", name: "Partener" }];
    data.transactions = [
      { id: "before", title: "Lidl", amount: 80, kind: "expense", category: "Alimente", source: "Card", sourceId: "s", person: "Eu", memberId: "me", date: "2026-09-10" },
      { id: "flex", title: "Taxi după salariu", amount: 40, kind: "expense", category: "Transport", source: "Card", sourceId: "s", person: "Partener", memberId: "partner", date: "2026-09-22" },
    ];
    const cycle = householdActivityInCycle(data, "2026-09-22");
    expect(cycle.familyExpense).toBe(120);
    expect(cycle.recent.map((item) => item.id)).toContain("flex");
  });
});

describe("abonamente: scumpiri și cost", () => {
  const tx = (id: string, title: string, amount: number, date: string, category = "Abonamente") => ({ id, title, amount, kind: "expense" as const, category, sourceId: "source-debit", source: "Card", memberId: "member-me", person: "Eu", date });

  it("recunoaște abonamentul în titlurile brute ale băncii și vede scumpirea", () => {
    const { data } = base();
    data.transactions = [
      tx("n1", "Plata la POS non-BT cu card VISA; NETFLIX.COM 4029357733 LU; RRN:111", 49.99, "2026-06-08", "Altele"),
      tx("n2", "Plata la POS non-BT cu card VISA; NETFLIX.COM 4029357733 LU; RRN:222", 49.99, "2026-07-08", "Altele"),
      tx("n3", "Plata la POS non-BT cu card VISA; NETFLIX.COM 4029357733 LU; RRN:333", 59.99, "2026-08-08", "Altele"),
      tx("k1", "Plata la POS non-BT cu card VISA; KAUFLAND 5920 CLUJ NAPOCA RO; RRN:444", 50, "2026-07-10", "Altele"),
    ];
    const hits = detectSubscriptions(data, "2026-08-20");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ name: "Netflix.com", amount: 59.99, priceChange: { from: 49.99, to: 59.99 } });
    expect(hits[0].reason).toContain("S-a scumpit");
  });

  it("nu ia o plată de alt fel drept scumpire", () => {
    const { data } = base();
    data.transactions = [tx("a", "Spotify", 25, "2026-06-01"), tx("b", "Spotify", 25, "2026-07-01"), tx("c", "Spotify", 25.5, "2026-08-01")];
    expect(detectSubscriptions(data, "2026-08-20")[0].priceChange).toBeUndefined();
  });

  it("semnalează scadențele urmărite care s-au scumpit, nu și pe cele variabile", () => {
    const { data } = base();
    data.recurring = [
      { id: "r1", name: "Netflix", amount: 49.99, category: "Abonamente", sourceId: "source-debit", memberId: "member-me", dueDay: 8, active: true },
      { id: "r2", name: "Enel", amount: 200, category: "Casă & facturi", sourceId: "source-debit", memberId: "member-me", dueDay: 12, active: true, variable: true },
      { id: "r3", name: "Digi", amount: 60, category: "Casă & facturi", sourceId: "source-debit", memberId: "member-me", dueDay: 15, active: true },
    ];
    data.transactions = [tx("n", "NETFLIX.COM LU", 59.99, "2026-08-08"), tx("e", "Enel", 260, "2026-08-12"), tx("d", "Digi", 600, "2026-08-15")];
    expect(recurringPriceChanges(data, "2026-08-20")).toEqual([{ recurringId: "r1", name: "Netflix", from: 49.99, to: 59.99, date: "2026-08-08" }]);
    const next = acceptRecurringPrice(data, "r1", "2026-08-20");
    expect(next?.recurring.find((item) => item.id === "r1")?.amount).toBe(59.99);
    expect(recurringPriceChanges(next!, "2026-08-20")).toEqual([]);
  });

  it("adună abonamentele pe lună și pe an", () => {
    const { data } = base();
    data.recurring = [
      { id: "r1", name: "Netflix", amount: 60, category: "Abonamente", sourceId: "source-debit", memberId: "member-me", dueDay: 8, active: true },
      { id: "r2", name: "iCloud anual", amount: 120, category: "Abonamente", sourceId: "source-debit", memberId: "member-me", dueDay: 1, active: true, frequency: "yearly", month: 3 },
      { id: "r3", name: "Sală", amount: 150, category: "Abonamente", sourceId: "source-debit", memberId: "member-me", dueDay: 1, active: false },
      { id: "r4", name: "Chirie", amount: 2000, category: "Casă & facturi", sourceId: "source-debit", memberId: "member-me", dueDay: 1, active: true },
    ];
    expect(subscriptionSpend(data)).toEqual({ count: 2, monthly: 70, yearly: 840 });
  });
});

describe("raportul lunii pentru familie", () => {
  const tx = (id: string, title: string, amount: number, kind: "income" | "expense", category: string, date: string, memberId = "member-me") => ({ id, title, amount, kind, category, sourceId: "source-debit", source: "Card", memberId, person: "", date });
  const family = () => {
    const { data } = base();
    data.settings.familyName = "Familia Pop";
    data.transactions = [
      tx("i1", "Salariu", 9000, "income", "Venit", "2026-08-10"), tx("i2", "Salariu", 9000, "income", "Venit", "2026-09-10"),
      tx("a1", "Lidl", 1600, "expense", "Alimente", "2026-08-12"), tx("a2", "Kaufland", 1900.5, "expense", "Alimente", "2026-09-12", "member-partner"),
      tx("c1", "Enel", 250, "expense", "Casă & facturi", "2026-08-14"), tx("c2", "Enel", 210, "expense", "Casă & facturi", "2026-09-14"),
    ];
    return data;
  };

  it("compară categoriile cu luna trecută și găsește ce a crescut", () => {
    const report = monthlyFamilyReport(family(), "2026-09");
    expect(report).toMatchObject({ income: 9000, expense: 2110.5, cashflow: 6889.5, priorExpense: 1850 });
    expect(report.categories).toEqual([
      { name: "Alimente", amount: 1900.5, prior: 1600, delta: 300.5 },
      { name: "Casă & facturi", amount: 210, prior: 250, delta: -40 },
    ]);
    expect(report.biggestRise).toEqual({ name: "Alimente", delta: 300.5 });
    expect(report.members).toEqual([{ name: "Soția", expense: 1900.5 }, { name: "Eu", expense: 210 }]);
    expect(report.keptShare).toBeCloseTo(0.7655, 3);
  });

  it("scrie un text scurt, de trimis familiei", () => {
    const text = formatMonthlyReportShare(monthlyFamilyReport(family(), "2026-09")).replace(/[^\S\n]/g, " ");
    expect(text).toContain("Familia Pop · raportul lunii septembrie 2026");
    expect(text).toContain("Au rămas 6.889,50 RON (77% din venit)");
    expect(text).toContain("• Alimente 1.900,50 RON (+300,50 RON)");
    expect(text).toContain("Cine a cheltuit: Soția 1.900,50 RON · Eu 210 RON");
    expect(text).not.toContain("undefined");
  });

  it("prima lună nu inventează comparații", () => {
    const report = monthlyFamilyReport(family(), "2026-08");
    expect(report.biggestRise).toBeUndefined();
    const text = formatMonthlyReportShare(report).replace(/[^\S\n]/g, " ");
    expect(text).not.toContain("Față de");
    expect(text).toContain("• Alimente 1.600 RON\n");
  });
});

describe("vânătorul de abonamente nu ia orice repetiție drept abonament", () => {
  const tx = (id: string, title: string, amount: number, category: string, date: string) => ({ id, title, amount, kind: "expense" as const, category, sourceId: "source-debit", source: "Card", memberId: "member-me", person: "Eu", date });

  it("sare peste plinurile de benzină", () => {
    const { data } = base();
    data.transactions = [tx("o1", "OMV 2143", 400, "Transport", "2026-06-15"), tx("o2", "OMV", 420, "Transport", "2026-07-15"), tx("o3", "OMV", 410, "Transport", "2026-08-15")];
    expect(detectSubscriptions(data, "2026-08-20")).toEqual([]);
  });

  it("în afara facturilor cere trei plăți cu aceeași sumă", () => {
    const { data } = base();
    data.transactions = [tx("g1", "World Class", 250, "Timp liber", "2026-07-02"), tx("g2", "World Class", 250, "Timp liber", "2026-08-02")];
    expect(detectSubscriptions(data, "2026-08-20")).toEqual([]);
    data.transactions.push(tx("g0", "World Class", 250, "Timp liber", "2026-06-02"));
    expect(detectSubscriptions(data, "2026-08-20").map((item) => item.name)).toEqual(["World Class"]);
  });

  it("facturile rămân detectate după două luni", () => {
    const { data } = base();
    data.transactions = [tx("d1", "Digi", 60, "Casă & facturi", "2026-07-15"), tx("d2", "Digi", 62, "Casă & facturi", "2026-08-15")];
    expect(detectSubscriptions(data, "2026-08-20").map((item) => item.name)).toEqual(["Digi"]);
  });
});

describe("plicul care se termină înainte de salariu", () => {
  const setup = (spent: number) => {
    const { data } = base();
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-10", nextPayday: "2026-10-09", allocations: [{ id: "a1", label: "Alimente", amount: 1500, category: "Alimente", weeklyPace: false }] };
    data.transactions = [{ id: "x", title: "Kaufland", amount: spent, kind: "expense", category: "Alimente", sourceId: "source-debit", source: "Card", memberId: "member-me", person: "Eu", date: "2026-09-15", allocationId: "a1" }];
    return data;
  };

  it("spune ziua, câte zile lipsesc și cât se poate cheltui pe zi", () => {
    // 10 zile scurse (10–19 sept.), 1.000 lei cheltuiți → 100 lei/zi; 500 rămași ajung 5 zile.
    const [hit] = envelopeRunOut(setup(1000), "2026-09-19");
    expect(hit).toMatchObject({ label: "Alimente", remaining: 500, dailyRate: 100, runOutDate: "2026-09-24", payday: "2026-10-09" });
    expect(hit.daysShort).toBe(15);
    expect(hit.safeDaily).toBe(23.8); // 500 / 21 zile, rotunjit în jos la bani
  });

  it("propune mutarea dintr-un plic liber ca să ajungă până la salariu, nu din chirie", () => {
    const data = setup(1000);
    data.settings.salaryPlan.allocations.push(
      { id: "liber", label: "Timp liber", amount: 2000, category: "Timp liber", weeklyPace: false },
      { id: "chirie", label: "Chirie", amount: 1800, category: "Casă & facturi", weeklyPace: false },
    );
    const move = extendRunOutMove(data, "a1", "2026-09-19");
    expect(move).toMatchObject({ fromId: "liber", toId: "a1", covers: true });
    expect(move!.amount).toBeGreaterThan(100);
    const onlyRent = setup(1000);
    onlyRent.settings.salaryPlan.allocations.push({ id: "chirie", label: "Chirie", amount: 1800, category: "Casă & facturi", weeklyPace: false });
    expect(extendRunOutMove(onlyRent, "a1", "2026-09-19")).toBeUndefined();
  });

  it("tace când plicul ajunge, la începutul ciclului și când e deja depășit", () => {
    expect(envelopeRunOut(setup(300), "2026-09-19")).toEqual([]);
    expect(envelopeRunOut(setup(1000), "2026-09-11")).toEqual([]);
    expect(envelopeRunOut(setup(1600), "2026-09-19")).toEqual([]);
  });
});

describe("cât să pui deoparte pentru un obiectiv", () => {
  const tx = (id: string, amount: number, kind: "income" | "expense", date: string) => ({ id, title: kind === "income" ? "Salariu" : "Cumpărături", amount, kind, category: kind === "income" ? "Venit" : "Alimente", sourceId: "source-debit", source: "Card", memberId: "member-me", person: "Eu", date });
  const withHistory = () => {
    const { data } = base();
    // Iulie și august: rămân 2.000 lei pe lună.
    data.transactions = [tx("i7", 8000, "income", "2026-07-10"), tx("e7", 6000, "expense", "2026-07-20"), tx("i8", 8000, "income", "2026-08-10"), tx("e8", 6000, "expense", "2026-08-20")];
    return data;
  };
  const goal = (extra: Partial<{ dueDate: string; current: number; target: number }> = {}) => ({ id: "g1", name: "Vacanță", current: 1000, target: 5000, due: "", tone: "forest" as const, ...extra });

  it("media lunară a ce rămâne, din lunile întregi cu mișcări", () => {
    expect(monthlySurplus(withHistory(), "2026-09-25")).toBe(2000);
    expect(monthlySurplus(base().data, "2026-09-25")).toBeUndefined();
  });

  it("cu termen: ce lipsește împărțit la lunile rămase", () => {
    const plan = savingsSuggestion(withHistory(), goal({ dueDate: "2027-01-25" }), "2026-09-25");
    expect(plan).toMatchObject({ basis: "deadline", left: 4000, months: 4, monthly: 1000, eta: "2027-01", stretch: false });
  });

  it("spune când suma trece de ce rămâne de obicei", () => {
    const plan = savingsSuggestion(withHistory(), goal({ dueDate: "2026-11-25" }), "2026-09-25");
    expect(plan).toMatchObject({ months: 2, monthly: 2000, stretch: false });
    expect(savingsSuggestion(withHistory(), goal({ dueDate: "2026-10-25" }), "2026-09-25")).toMatchObject({ monthly: 4000, stretch: true });
  });

  it("fără termen: 30% din ce rămâne de obicei și luna în care ajungi", () => {
    expect(savingsSuggestion(withHistory(), goal(), "2026-09-25")).toMatchObject({ basis: "surplus", monthly: 600, months: 7, eta: "2027-04" });
  });

  it("tace când obiectivul e atins sau nu există istoric pentru o propunere", () => {
    expect(savingsSuggestion(withHistory(), goal({ current: 5000 }), "2026-09-25")).toBeUndefined();
    expect(savingsSuggestion(base().data, goal(), "2026-09-25")).toBeUndefined();
  });
});

describe("plata fixă (rată, factură)", () => {
  it("rata plătită exact: „Plătit”, fără alarmă de ritm, fără „peste plan” în bilanț", () => {
    const data = createEmptyAppData();
    const card = data.settings.paymentSources[0];
    data.settings.paymentSources = data.settings.paymentSources.map((item) => item.id === card.id ? { ...item, openingBalance: 5000 } : item);
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-01", nextPayday: "2026-10-01", sourceIds: [card.id], allocations: [{ id: "rata", label: "Rata", amount: 1400, category: "Rate produse", weeklyPace: false }] };
    data.transactions = [{ id: "r1", title: "Rata", amount: 1400, kind: "expense", category: "Rate produse", sourceId: card.id, source: card.name, person: "Eu", date: "2026-09-05", allocationId: "rata" }];
    const status = allocationStatus(data, data.settings.salaryPlan.allocations[0]);
    expect(status).toMatchObject({ fixed: true, paid: true, state: "healthy" });
    expect(envelopeBurnPace(data, "2026-09-07")[0].pace).toBe("on_track");
    expect(envelopeRunOut(data, "2026-09-07")).toEqual([]);
    const check = weeklyCheckIn(data, "2026-09-06");
    expect(check.envelopes[0].state).toBe("healthy");
    expect(envelopeUntilPayday(data, data.settings.salaryPlan.allocations[0], "2026-09-07")).toBeUndefined();
  });
});

describe("ziua salariului (BF-04)", () => {
  it("salariul intrat azi nu devine „poți folosi azi” în ciclul care se încheie", () => {
    const data = createEmptyAppData();
    const card = data.settings.paymentSources[0];
    data.settings.paymentSources = data.settings.paymentSources.map((item) => item.id === card.id ? { ...item, openingBalance: 500 } : item);
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-10", nextPayday: "2026-10-10", paydayFlexDays: 0, sourceIds: [card.id], allocations: [] };
    const before = todayBrief(data, "2026-10-10").spendable;
    data.transactions = [{ id: "sal", title: "Salariu", amount: 4700, kind: "income", category: "Venit", sourceId: card.id, source: card.name, person: "Eu", date: "2026-10-10" }];
    const brief = todayBrief(data, "2026-10-10");
    expect(brief.spendable).toBe(before);
    expect(brief.spendable).toBeLessThanOrEqual(500);
  });
});

describe("cheltuiala fără plic, pe o categorie comună (BF-12)", () => {
  it("nu scade din două plicuri deodată", () => {
    const data = createEmptyAppData();
    const card = data.settings.paymentSources[0];
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-01", nextPayday: "2026-10-01", sourceIds: [card.id], allocations: [
      { id: "lumina", label: "Lumină", amount: 400, category: "Casă & facturi", weeklyPace: false },
      { id: "apa", label: "Apă", amount: 100, category: "Casă & facturi", weeklyPace: false },
    ] };
    data.transactions = [{ id: "f", title: "Factură", amount: 380, kind: "expense", category: "Casă & facturi", sourceId: card.id, source: card.name, person: "Eu", date: "2026-09-05" }];
    const [lumina, apa] = data.settings.salaryPlan.allocations;
    expect(allocationStatus(data, lumina).spent + allocationStatus(data, apa).spent).toBeLessThanOrEqual(380);
    expect(allocationStatus(data, apa).state).not.toBe("over");
  });
});

describe("graficul plicului pe ciclu", () => {
  it("linia reală scade cu cheltuielile, iar ritmul prea mare arată ziua în care se golește", async () => {
    const { envelopeBurndown } = await import("./household-insights");
    const data = createEmptyAppData();
    const card = data.settings.paymentSources[0];
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-01", nextPayday: "2026-09-30", paydayFlexDays: 0, allocations: [{ id: "f", label: "Mâncare", amount: 900, category: "Alimente", weeklyPace: false }] };
    data.transactions = [{ id: "a", title: "Lidl", amount: 300, kind: "expense", category: "Alimente", sourceId: card.id, source: card.name, person: "Eu", date: "2026-09-03", allocationId: "f" }];
    const chart = envelopeBurndown(data, data.settings.salaryPlan.allocations[0], "2026-09-05")!;
    expect(chart.days).toBe(30);
    expect(chart.actual).toEqual([900, 900, 600, 600, 600]);
    // 300 în 5 zile = 60/zi; 600 rămași ajung 10 zile → se golește pe la ziua 14, înainte de salariu.
    expect(chart.runOutIndex).toBe(14);
  });
});

describe("luna aceasta față de medie", () => {
  it("compară cu media lunilor trecute, scalată la zilele scurse", async () => {
    const { monthVsAverage } = await import("./household-insights");
    const data = createEmptyAppData();
    const tx = (id: string, amount: number, date: string, category = "Alimente") => ({ id, title: id, amount, kind: "expense" as const, category, source: "Card", person: "Eu", date });
    data.transactions = [tx("a", 1500, "2026-06-10"), tx("b", 1500, "2026-07-10"), tx("c", 1500, "2026-08-10"), tx("d", 900, "2026-09-10")];
    const result = monthVsAverage(data, "2026-09-15");
    expect(result.months).toBe(3);
    expect(result.rows[0]).toMatchObject({ category: "Alimente", thisMonth: 900, average: 750, delta: 150 });
  });
});
