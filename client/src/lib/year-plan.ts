/**
 * Planul pe 12 luni: lună cu lună, ce intră (veniturile din plan), ce iese (traiul obișnuit,
 * facturile care se repetă — lunar, trimestrial, anual —, ratele cu dobânda lor, până la ultima,
 * obiectivele și evenimentele din calendar) și unde ajung banii. Peste el, scenarii: „pierd un
 * venit 3 luni”, „chiria crește cu 300”, „o cheltuială mare în martie”, „un credit nou”.
 * Pornește de la banii de azi din surse și începe cu luna viitoare. E o previziune, nu un extras.
 */
import { addIsoDays, isBalanceAdjustment, sourceBalance, type AppData, type RecurringPayment } from "./finance-data";
import { amortize } from "./debt-plan";
import { occurrenceInMonth } from "./planned-events";
import { savingsSuggestion } from "./household-insights";

export type Scenario =
  | { id: string; kind: "income-loss"; incomeId: string; share: number; from: number; months: number }
  | { id: string; kind: "expense"; label: string; amount: number; from: number }
  | { id: string; kind: "one-off"; label: string; amount: number; at: number }
  | { id: string; kind: "loan"; label: string; principal: number; monthly: number; months: number; at: number };

export type PlanMonth = {
  key: string;
  income: number;
  living: number;
  bills: number;
  debts: number;
  goals: number;
  events: number;
  scenario: number;
  net: number;
  balance: number;
  notes: string[];
};

export type YearPlan = { start: number; living: number; livingBasis: "spending" | "plan"; months: PlanMonth[]; lowest: { index: number; balance: number }; firstShort?: number };

const round = (value: number) => Math.round(value * 100) / 100;
const monthKey = (base: string, offset: number) => { const date = new Date(`${base.slice(0, 7)}-15T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset); return date.toISOString().slice(0, 7); };

/** Factura cade în luna aceasta? Trimestrialul și anualul au luna de referință (1–12). */
export function billInMonth(item: Pick<RecurringPayment, "frequency" | "month">, key: string): boolean {
  const month = Number(key.slice(5, 7));
  if (!item.frequency || item.frequency === "monthly") return true;
  const anchor = item.month && item.month >= 1 && item.month <= 12 ? item.month : month;
  if (item.frequency === "yearly") return month === anchor;
  return ((month - anchor) % 3 + 3) % 3 === 0;
}

/** Traiul obișnuit pe lună: media ultimelor 3 luni întregi, fără facturi, rate, mutări și vacanță. */
export function monthlyLiving(data: AppData, today: string): { amount: number; basis: "spending" | "plan" } {
  const thisMonth = today.slice(0, 7);
  const sums = new Map<string, number>();
  for (const item of data.transactions) {
    if (item.kind !== "expense" || item.recurringId || item.debtId || item.transferId || item.tripId || isBalanceAdjustment(item)) continue;
    const key = item.date.slice(0, 7);
    if (key >= thisMonth || key < monthKey(today, -3)) continue;
    sums.set(key, (sums.get(key) || 0) + item.amount);
  }
  if (sums.size >= 2) return { amount: round(Array.from(sums.values()).reduce((a, b) => a + b, 0) / sums.size), basis: "spending" };
  const plan = data.settings.salaryPlan.allocations.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  const recurring = data.recurring.filter((item) => item.active).reduce((sum, item) => sum + (item.frequency === "yearly" ? item.amount / 12 : item.frequency === "quarterly" ? item.amount / 3 : item.amount), 0);
  const debts = data.debts.reduce((sum, item) => sum + (item.remaining > 0 ? item.monthly : 0), 0);
  return { amount: round(Math.max(0, plan - recurring - debts)), basis: "plan" };
}

export function yearPlan(data: AppData, today: string, scenarios: ReadonlyArray<Scenario> = [], horizon = 12): YearPlan {
  const start = round(data.settings.paymentSources.filter((source) => source.kind !== "meal").reduce((sum, source) => sum + sourceBalance(data, source.id), 0));
  const incomes = (data.settings.salaryPlan.incomes || []).filter((item) => !item.archived && item.amount > 0);
  const fallbackIncome = (() => {
    const since = addIsoDays(today, -90);
    const total = data.transactions.filter((item) => item.kind === "income" && !isBalanceAdjustment(item) && !item.transferId && item.date >= since && item.date <= today).reduce((sum, item) => sum + item.amount, 0);
    return round(total / 3);
  })();
  const living = monthlyLiving(data, today);
  const debtRows = data.debts.filter((debt) => debt.remaining > 0 && debt.monthly > 0 && !debt.openEnded).map((debt) => ({ debt, rows: amortize(debt.remaining, debt.annualRate, debt.monthly).rows }));
  const goals = data.savings.filter((goal) => goal.current < goal.target).map((goal) => ({ goal, monthly: savingsSuggestion(data, goal, today)?.monthly || 0, left: goal.target - goal.current }));
  const months: PlanMonth[] = [];
  let balance = start;
  for (let index = 0; index < horizon; index += 1) {
    const key = monthKey(today, index + 1);
    const notes: string[] = [];
    let income = incomes.length ? incomes.reduce((sum, item) => sum + item.amount, 0) : fallbackIncome;
    let scenario = 0;
    for (const change of scenarios) {
      if (change.kind === "income-loss" && index >= change.from && index < change.from + change.months) {
        const lost = change.incomeId === "all" ? income : incomes.filter((item) => item.id === change.incomeId).reduce((sum, item) => sum + item.amount, 0);
        income -= lost * Math.min(1, Math.max(0, change.share));
      }
      if (change.kind === "expense" && index >= change.from) scenario -= change.amount;
      if (change.kind === "one-off" && index === change.at) { scenario -= change.amount; notes.push(change.label); }
      if (change.kind === "loan") {
        if (index === change.at) { scenario += change.principal; notes.push(change.label); }
        if (index > change.at && index <= change.at + change.months) scenario -= change.monthly;
      }
    }
    const bills = data.recurring.filter((item) => item.active && billInMonth(item, key)).reduce((sum, item) => sum + item.amount, 0);
    let debts = 0;
    for (const { debt, rows } of debtRows) {
      const row = rows[index];
      if (!row) continue;
      debts += row.payment;
      if (index === rows.length - 1) notes.push(`✓ ${debt.name}`);
    }
    let goalsOut = 0;
    for (const entry of goals) {
      const put = Math.min(entry.monthly, Math.max(0, entry.left));
      if (put <= 0) continue;
      entry.left -= put;
      goalsOut += put;
      if (entry.left <= 0.005) notes.push(`★ ${entry.goal.name}`);
    }
    let events = 0;
    for (const event of data.settings.plannedEvents || []) {
      const when = occurrenceInMonth(event, Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1);
      if (when && event.estimate > 0) { events += event.estimate; notes.push(event.name); }
    }
    const net = round(income - living.amount - bills - debts - goalsOut - events + scenario);
    balance = round(balance + net);
    months.push({ key, income: round(income), living: living.amount, bills: round(bills), debts: round(debts), goals: round(goalsOut), events: round(events), scenario: round(scenario), net, balance, notes });
  }
  const lowestIndex = months.reduce((best, month, index) => month.balance < months[best].balance ? index : best, 0);
  const firstShort = months.findIndex((month) => month.balance < 0);
  return { start, living: living.amount, livingBasis: living.basis, months, lowest: { index: lowestIndex, balance: months[lowestIndex]?.balance ?? start }, ...(firstShort >= 0 ? { firstShort } : {}) };
}
