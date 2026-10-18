/**
 * Regulile care trebuie să fie adevărate în orice zi, pentru orice familie.
 * Fiecare greșeală din octombrie (0,00 pe Astăzi, săptămâni care nu se adunau, rate scăzute
 * de două ori, sume fără explicație) încălca una dintre ele. Le folosesc luna simulată
 * (ledger-invariants.test.ts) și verificarea pe backup-uri reale (real-backups.test.ts).
 */
import { expect, vi } from "vitest";
import { allocationBudget, allocationSpent, allocationStatus, allocationWeeksStatus, debtsOutsideTrackedMoney, pendingDebtsInPlan, planAllocationMath, planPeriodTransactions, reservedDebtsInPlan, sourceBalance, type AppData } from "../finance-data";
import { liquidSafeToSpend, todayBrief, weeklyEnvelopeDailyRhythm } from "../household-insights";

/** Ziua verificată, la prânz: plicurile pe săptămâni citesc și ceasul, nu doar data primită. */
export const atNoon = (day: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${day}T12:00:00`));
};

export const CENT = 0.011;
export const money = (value: number) => Math.round(value * 100) / 100;

const finite = (label: string, value: unknown) => {
  expect(Number.isFinite(value), `${label} = ${String(value)}`).toBe(true);
};

/** Toate regulile pentru o zi; mesajul spune ziua și regula, ca să se vadă unde s-a rupt. */
export const checkInvariants = (data: AppData, day: string) => {
  const where = (rule: string) => `${day}: ${rule}`;
  const plan = data.settings.salaryPlan;
  const brief = todayBrief(data, day);
  const safe = liquidSafeToSpend(data, day);
  const rhythm = weeklyEnvelopeDailyRhythm(data, day);
  const math = planAllocationMath(data);

  // 1. Nicio cifră NaN sau infinită pe ecran.
  for (const [label, value] of Object.entries({ spendable: brief.spendable, liquidFunds: safe.liquidFunds, available: safe.available, remaining: rhythm.remaining, todayLeft: rhythm.todayLeft, unrepartized: math.unrepartized, scheduled: math.scheduled }))
    finite(where(label), value);

  // 2. „Poți folosi azi” nu e negativ și nu depășește banii liberi din surse.
  expect(brief.spendable, where("cifra zilei negativă")).toBeGreaterThanOrEqual(0);
  expect(brief.spendable, where("cifra zilei peste banii liberi")).toBeLessThanOrEqual(safe.available + CENT);

  // 3. Cu plic pe săptămâni, cifra zilei nu trece de ce mai are plicul pentru azi.
  if (rhythm.hasWeekly) expect(brief.spendable, where("cifra zilei peste partea de azi a plicului")).toBeLessThanOrEqual(Math.max(0, rhythm.todayLeft) + CENT);

  // 3b. …și nici sub ea, cât timp banii chiar sunt în surse: Astăzi și plicul spun același lucru.
  // (Greșeala „0,00 după cumpărăturile mari”: plicul mai avea 32 de lei pentru azi, Astăzi arăta 0.)
  if (rhythm.hasWeekly && safe.available >= Math.max(0, rhythm.todayLeft) && day < (plan.earliestPayday || plan.nextPayday))
    expect(brief.spendable, where("Astăzi mai mic decât partea de azi a plicului, deși banii sunt în surse")).toBeGreaterThanOrEqual(Math.max(0, rhythm.todayLeft) - CENT);

  for (const allocation of plan.allocations) {
    const status = allocationStatus(data, allocation);
    finite(where(`${allocation.label}.remaining`), status.remaining);
    // 4. Rămas = buget − cheltuit, la ban.
    expect(Math.abs(status.remaining - (allocationBudget(data, allocation) - allocationSpent(data, allocation))), where(`${allocation.label}: rămas ≠ buget − cheltuit`)).toBeLessThan(CENT);
    const weeks = allocationWeeksStatus(data, allocation);
    if (!weeks.length) continue;
    // 5. Săptămânile adunate dau tot plicul (fără report între săptămâni).
    if (!plan.weekCarryOver) expect(Math.abs(weeks.reduce((sum, week) => sum + week.budget, 0) - allocationBudget(data, allocation)), where(`${allocation.label}: săptămânile nu dau plicul`)).toBeLessThan(0.05);
    // 6. Cheltuit pe săptămâni = cheltuit pe plic: bonul întins pe lună nu se pierde și nu se numără de două ori.
    expect(Math.abs(weeks.reduce((sum, week) => sum + week.spent, 0) - allocationSpent(data, allocation)), where(`${allocation.label}: săptămânile nu dau cheltuiala`)).toBeLessThan(0.05);
    for (const week of weeks) {
      finite(where(`${allocation.label} S${week.index}.remaining`), week.remaining);
      expect(week.spent, where(`${allocation.label} S${week.index}: cheltuială negativă`)).toBeGreaterThanOrEqual(-CENT);
    }
  }

  // 7. Partea întinsă pe lună nu trece de bon.
  for (const item of data.transactions) if (item.spreadAmount) expect(item.spreadAmount, where(`${item.title}: întins mai mult decât bonul`)).toBeLessThanOrEqual(item.amount + CENT);

  // 8. Soldurile surselor = sold inițial + venituri − cheltuieli; mutările între surse nu fac bani din nimic.
  const sources = data.settings.paymentSources;
  const fromBalances = sources.reduce((sum, source) => sum + sourceBalance(data, source.id), 0);
  const fromLedger = sources.reduce((sum, source) => sum + (source.openingBalance || 0), 0)
    + data.transactions.filter((item) => sources.some((source) => source.id === item.sourceId)).reduce((sum, item) => sum + (item.kind === "income" ? item.amount : -item.amount), 0);
  expect(Math.abs(fromBalances - fromLedger), where("soldurile surselor nu se potrivesc cu mișcările")).toBeLessThan(0.05);

  // 9. O rată e ori de plătit, ori plătită: niciodată amândouă. Și e ținută deoparte o singură dată.
  const paidDebts = new Set(planPeriodTransactions(data).map((item) => item.debtId).filter(Boolean));
  for (const debt of pendingDebtsInPlan(data)) expect(paidDebts.has(debt.id), where(`${debt.name}: plătită, dar încă rezervată`)).toBe(false);
  const reserved = reservedDebtsInPlan(data).map((debt) => debt.id);
  const outside = debtsOutsideTrackedMoney(data).map((debt) => debt.id);
  expect(reserved.filter((id) => outside.includes(id)), where("rată și rezervată, și în afara banilor notați")).toEqual([]);
  expect(reserved.length + outside.length, where("rate pierdute între rezervate și cele din afară")).toBe(pendingDebtsInPlan(data).length);

  return { brief, rhythm };
};
