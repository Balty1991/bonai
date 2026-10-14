/**
 * Analize de gospodărie calculate numai din registrul local.
 * Nu persistă nimic în AppData și nu ating pachetul Firebase.
 */
import { nextNeedDue } from "@/lib/cashflow-projection";
import { tickMemo } from "@/lib/tick-cache";
import {
  addIsoDays,
  allocationBudget,
  allocationStatus,
  planAllocationMath,
  exchangeRateFor,
  toBaseAmount,
  allocationWeekStatus,
  allocationWeeksStatus,
  envelopeDecisionStatus,
  financialBalance,
  formatDate,
  isoToday,
  isWeeklyPaced,
  newId,
  inPlanPeriod,
  pendingRecurringInPlan,
  scheduledInPlan,
  planEndDate,
  planExpired,
  planCoverEndDate,
  paydayWindow,
  planForecast,
  weeklySummary,
  transactionShareScope,
  type AppData,
  type BudgetAllocation,
  type RecurringPayment,
  type SavingsGoal,
  type SalaryPlan,
  type Transaction,
  isoDate,
  foldRomanian,
  isFixedEnvelope,
  expenseBelongsTo,
  isBalanceAdjustment,
  sourceBalance,
  untrackedSourceIds,
  envelopeDayAmount,
  spreadPart,
  nextDebtDue,
} from "./finance-data";
import { statementMerchant } from "./statement-merchant";
import { floorCents, lei as leiExact, perDay } from "./money-format";
import { daysLabel, getLocale, t } from "./i18n";
import { safeSetItem } from "@/lib/safe-storage";
import { selfMemberIdOf } from "./member-identity";
import { pendingTransfers } from "./monthly-needs";
import { upcomingPlannedEvents } from "./planned-events";

const fold = foldRomanian;
const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).valueOf() - new Date(`${from}T12:00:00`).valueOf()) / 86_400_000);
const monthRange = (month: string) => {
  const [year, index] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${String(new Date(year, index, 0).getDate()).padStart(2, "0")}` };
};
const previousMonth = (month: string) => {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
export const currentMonthKey = (asOf = isoToday()) => asOf.slice(0, 7);
export const monthTitle = (month: string) => new Intl.DateTimeFormat(getLocale(), { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export type AgeOfMoney = {
  days: number;
  sampleAmount: number;
  unfundedAmount: number;
  incomeCount: number;
  expenseCount: number;
};

/** FIFO simplu: câți zile stă un leu între încasare și cheltuială. Soldul inițial contează ca bani „deja prezenți”. */
export const ageOfMoney = (data: AppData, asOf = isoToday()): AgeOfMoney | undefined => {
  // Soldurile inițiale valutare se convertesc, ca totalul să rămână în lei ca restul registrului.
  const opening = data.settings.paymentSources.reduce((sum, source) => sum + Math.max(0, source.currency ? toBaseAmount(source.openingBalance, exchangeRateFor(data, source.currency)) ?? 0 : source.openingBalance), 0);
  const incomes = data.transactions.filter((item) => item.kind === "income" && item.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || ""));
  const expenses = data.transactions.filter((item) => item.kind === "expense" && item.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || ""));
  if (!expenses.length || (!incomes.length && opening <= 0)) return undefined;
  const pools = [
    ...(opening > 0 ? [{ date: data.settings.salaryPlan.periodStart || asOf, remaining: opening }] : []),
    ...incomes.map((item) => ({ date: item.date, remaining: item.amount })),
  ];
  let sampleAmount = 0;
  let weightedDays = 0;
  let unfundedAmount = 0;
  for (const expense of expenses) {
    let need = expense.amount;
    for (const pool of pools) {
      if (need <= 0) break;
      if (pool.remaining <= 0) continue;
      const take = Math.min(need, pool.remaining);
      weightedDays += take * Math.max(0, daysBetween(pool.date, expense.date));
      sampleAmount += take;
      pool.remaining -= take;
      need -= take;
    }
    unfundedAmount += need;
  }
  if (sampleAmount <= 0) return undefined;
  return {
    days: Math.round((weightedDays / sampleAmount) * 10) / 10,
    sampleAmount: Math.round(sampleAmount * 100) / 100,
    unfundedAmount: Math.round(unfundedAmount * 100) / 100,
    incomeCount: incomes.length,
    expenseCount: expenses.length,
  };
};

/**
 * O propoziție pentru Astăzi, nu o a doua cifră. Cu prea puține cheltuieli, sau când o
 * parte din bani n-are încasare în urmă, vârsta ar minți — atunci tace.
 */
export const ageOfMoneyLine = (age: AgeOfMoney | undefined): string | undefined => {
  if (!age || age.expenseCount < 4 || age.sampleAmount < 100) return undefined;
  if (age.unfundedAmount > age.sampleAmount * 0.2) return undefined;
  const days = Math.round(age.days);
  if (days < 1) return undefined;
  if (days < 7) return t("Cheltuiți din banii care tocmai au intrat.");
  return t("Un leu stă la voi cam {days} înainte să plece.", { days: daysLabel(days) });
};

export type MealRunway = {
  balance: number;
  /** Câte zile mai țin bonurile la ritmul ultimelor 4 săptămâni. */
  days: number;
  daysToPayday: number;
};

/**
 * Bonurile de masă, pe ciclul de salariu: doar când ritmul real (cel puțin 3 plăți
 * în 28 de zile) le termină înainte de salariu. Altfel soldul stă la surse, fără alarmă.
 */
export const mealRunway = (data: AppData, asOf = isoToday()): MealRunway | undefined => {
  const meals = data.settings.paymentSources.filter((item) => item.kind === "meal");
  if (!meals.length) return undefined;
  const balance = Math.round(meals.reduce((sum, source) => sum + Math.max(0, sourceBalance(data, source.id)), 0) * 100) / 100;
  if (balance < 1) return undefined;
  const payday = planEndDate(data.settings.salaryPlan);
  if (!payday || payday <= asOf) return undefined;
  const daysToPayday = daysBetween(asOf, payday);
  if (daysToPayday < 1) return undefined;
  const since = addIsoDays(asOf, -27);
  const mealIds = new Set(meals.map((item) => item.id));
  const spent = data.transactions.filter((item) => item.kind === "expense" && !isBalanceAdjustment(item) && item.date >= since && item.date <= asOf && mealIds.has(item.sourceId || ""));
  if (spent.length < 3) return undefined;
  const daily = spent.reduce((sum, item) => sum + item.amount, 0) / 28;
  if (daily < 1) return undefined;
  const days = Math.max(0, Math.floor(balance / daily));
  if (days >= daysToPayday) return undefined;
  return { balance, days, daysToPayday };
};

export const mealRunwayLine = (run: MealRunway | undefined): string | undefined =>
  run ? t("Bonurile ({amount}) se termină cam în {days}, înainte de salariu.", { amount: lei(run.balance), days: daysLabel(run.days) }) : undefined;

export type MonthlyRecap = {
  month: string;
  title: string;
  income: number;
  expense: number;
  cashflow: number;
  priorIncome: number;
  priorExpense: number;
  priorCashflow: number;
  transactionCount: number;
  topCategory?: { name: string; amount: number };
  envelopesOver: number;
  envelopesWatch: number;
  nextStep: string;
  tone: "good" | "watch" | "risk" | "empty";
};

export const monthlyRecap = (data: AppData, month = currentMonthKey()): MonthlyRecap => {
  const range = monthRange(month);
  const prior = monthRange(previousMonth(month));
  const inRange = (start: string, end: string) => data.transactions.filter((item) => item.date >= start && item.date <= end);
  const selected = inRange(range.start, range.end);
  const previous = inRange(prior.start, prior.end);
  const sum = (entries: Transaction[], kind: Transaction["kind"]) => entries.filter((item) => item.kind === kind).reduce((total, item) => total + item.amount, 0);
  const income = sum(selected, "income");
  const expense = sum(selected, "expense");
  const cashflow = income - expense;
  const priorIncome = sum(previous, "income");
  const priorExpense = sum(previous, "expense");
  const priorCashflow = priorIncome - priorExpense;
  const categories = Object.entries(selected.filter((item) => item.kind === "expense").reduce<Record<string, number>>((all, item) => ({ ...all, [item.category]: (all[item.category] || 0) + item.amount }), {})).sort((a, b) => b[1] - a[1]);
  const alerts = data.settings.salaryPlan.allocations.map((item) => allocationStatus(data, item));
  const envelopesOver = alerts.filter((item) => item.state === "over").length;
  const envelopesWatch = alerts.filter((item) => item.state === "watch").length;
  const topCategory = categories[0] ? { name: categories[0][0], amount: categories[0][1] } : undefined;
  const tone = !selected.length ? "empty" as const : envelopesOver || cashflow < 0 ? "risk" as const : envelopesWatch ? "watch" as const : "good" as const;
  const nextStep = !selected.length
    ? t("Înregistrează prima mișcare ca să ai un recapitulativ de închis.")
    : envelopesOver
      ? t("Ajustează plicurile depășite înainte să începi luna următoare.")
      : cashflow < 0
        ? t("Cheltuielile au trecut peste venit. Mută o limită sau amână o plată neesențială.")
        : topCategory
          ? t("Categoria {name} a condus luna. Verifică dacă plicul ei rămâne realist.", { name: t(topCategory.name) })
          : t("Luna e în echilibru. Poți închide ritualul și descărca PDF-ul.");
  return { month, title: monthTitle(month), income, expense, cashflow, priorIncome, priorExpense, priorCashflow, transactionCount: selected.length, topCategory, envelopesOver, envelopesWatch, nextStep, tone };
};

export type HouseholdMemberShare = {
  memberId: string;
  name: string;
  income: number;
  expense: number;
  count: number;
  share: number;
};

export type HouseholdActivity = {
  month: string;
  members: HouseholdMemberShare[];
  familyExpense: number;
  recent: Array<{ id: string; date: string; title: string; amount: number; kind: Transaction["kind"]; person: string; category: string }>;
};

export const householdActivity = (data: AppData, month = currentMonthKey()): HouseholdActivity => {
  const range = monthRange(month);
  const monthTx = data.transactions.filter((item) => !isBalanceAdjustment(item) && item.date >= range.start && item.date <= range.end);
  const familyExpense = monthTx.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
  const members = data.settings.members.map((member) => {
    const entries = monthTx.filter((item) => item.memberId === member.id);
    const income = entries.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = entries.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    return { memberId: member.id, name: member.name, income, expense, count: entries.length, share: familyExpense > 0 ? expense / familyExpense : 0 };
  }).sort((a, b) => b.expense - a.expense);
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 8).map((item) => ({ id: item.id, date: item.date, title: item.title, amount: item.amount, kind: item.kind, person: item.person, category: item.category }));
  return { month, members, familyExpense, recent };
};

/** Activitate pe ciclul salarial (periodStart → ultima zi acoperită, inclusiv flexul venitului), nu pe luna calendar. */
export const householdActivityInCycle = (data: AppData, asOf = isoToday()): HouseholdActivity => {
  const plan = data.settings.salaryPlan;
  const start = plan.periodStart || `${asOf.slice(0, 7)}-01`;
  const cover = planCoverEndDate(plan);
  const end = cover && cover >= start ? cover : asOf;
  const cycleTx = data.transactions.filter((item) => !isBalanceAdjustment(item) && item.date >= start && item.date <= end && transactionShareScope(item) !== "personal");
  const familyExpense = cycleTx.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
  const members = data.settings.members.map((member) => {
    const entries = cycleTx.filter((item) => item.memberId === member.id);
    const income = entries.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = entries.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    return { memberId: member.id, name: member.name, income, expense, count: entries.length, share: familyExpense > 0 ? expense / familyExpense : 0 };
  }).sort((a, b) => b.expense - a.expense);
  const recent = [...cycleTx].sort((a, b) => {
    const right = b.updatedAt || b.createdAt || `${b.date}T00:00:00.000Z`;
    const left = a.updatedAt || a.createdAt || `${a.date}T00:00:00.000Z`;
    return right.localeCompare(left) || b.date.localeCompare(a.date);
  }).slice(0, 8).map((item) => ({ id: item.id, date: item.date, title: item.title, amount: item.amount, kind: item.kind, person: item.person, category: item.category }));
  return { month: `${start}…${end}`, members, familyExpense, recent };
};

const merchantKey = (title: string) => fold(title).replace(/[^a-z0-9\s]/g, " ").replace(/\d+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
/**
 * Mișcările importate înainte de curățarea numelor au titlul băncii („Plata la POS non-BT cu card
 * VISA; NETFLIX.COM …”): fără curățare, toate plățile cu cardul ar avea aceeași cheie.
 */
const subscriptionName = (title: string) => statementMerchant(title).replace(/\s+\d+[.,]?\d*\s*(lei|ron)?$/i, "").trim() || title;
const subscriptionKey = (title: string) => merchantKey(subscriptionName(title));
/** Scadența „Netflix” și plata „NETFLIX.COM LU” sunt același lucru: se potrivesc după primul cuvânt. */
const brandOf = (key: string) => { const word = key.split(" ")[0] || ""; return word.length >= 3 ? word : key; };

export type SubscriptionDetection = {
  key: string;
  name: string;
  amount: number;
  count: number;
  intervalDays: number;
  category: string;
  sourceId?: string;
  memberId?: string;
  lastDate: string;
  confidence: "high" | "medium";
  reason: string;
  /** Ultima plată a sărit peste prețul obișnuit (abonament scumpit). */
  priceChange?: { from: number; to: number };
};

/** Un preț nou, nu o variație de curs: cel puțin 4% și 2 lei în plus. */
const isPriceRise = (from: number, to: number) => to - from >= Math.max(2, from * 0.04);

const groceryCategories = new Set(["Alimente", "Consumabile copil", "Dulciuri", "Băuturi", "Apă"]);
const billCategories = new Set(["Casă & facturi", "Rate produse", "Credite", "Educație"]);
const FUEL = /\b(omv|mol|petrom|rompetrol|lukoil|socar|gazprom|benzina|motorina|carburant|combustibil|shell)\b/;

/** Detectează comercianți care se repetă lunar, fără a crea scadențe până la confirmare. */
export const detectSubscriptions = (data: AppData, asOf = isoToday()): SubscriptionDetection[] => {
  const from = new Date(`${asOf}T12:00:00`);
  from.setDate(from.getDate() - 180);
  const start = isoDate(from);
  const tracked = new Set(data.recurring.map((item) => brandOf(subscriptionKey(item.name))).filter(Boolean));
  const groups = new Map<string, Transaction[]>();
  data.transactions.filter((item) => item.kind === "expense" && item.date >= start && item.date <= asOf).forEach((item) => {
    const key = subscriptionKey(item.title);
    if (!key || key.length < 3) return;
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  });
  const detections: SubscriptionDetection[] = [];
  groups.forEach((entries, key) => {
    if (tracked.has(brandOf(key)) || entries.length < 2) return;
    const dates = Array.from(new Set(entries.map((item) => item.date))).sort();
    if (dates.length < 2) return;
    const intervals = dates.slice(1).map((date, index) => daysBetween(dates[index], date)).filter((value) => value > 0);
    const intervalDays = Math.round(median(intervals));
    const byDate = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const latest = byDate[byDate.length - 1].amount;
    // Cu trei plăți sau mai multe, ultima poate fi un preț nou: comparăm istoricul fără ea.
    const history = byDate.length >= 3 ? byDate.slice(0, -1).map((item) => item.amount) : byDate.map((item) => item.amount);
    const typical = median(history);
    const similar = history.every((value) => Math.abs(value - typical) <= Math.max(4, typical * 0.22));
    const priceChange = byDate.length >= 3 && isPriceRise(typical, latest) ? { from: Math.round(typical * 100) / 100, to: latest } : undefined;
    if (byDate.length >= 3 && !priceChange && Math.abs(latest - typical) > Math.max(4, typical * 0.22)) return;
    const monthly = intervalDays >= 25 && intervalDays <= 40;
    const weekly = intervalDays >= 6 && intervalDays <= 9;
    const category = entries[0].category;
    const isGrocery = groceryCategories.has(category);
    const labeled = category === "Abonamente";
    if (isGrocery && !labeled) return;
    // Plinul la benzinărie se repetă lunar cu sume apropiate, dar nu e o scadență.
    if (!labeled && FUEL.test(key)) return;
    if (!similar) return;
    // În afara facturilor și ratelor, o sumă „apropiată” nu ajunge: un abonament costă la fel.
    const billLike = billCategories.has(category);
    if (!labeled && !billLike && (dates.length < 3 || history.some((value) => Math.abs(value - typical) > Math.max(2, typical * 0.08)))) return;
    if (!labeled && !monthly && !(weekly && entries.length >= 4)) return;
    if (!labeled && dates.length < 3 && !monthly) return;
    const last = entries.sort((a, b) => b.date.localeCompare(a.date))[0];
    detections.push({
      key,
      name: subscriptionName(last.title),
      amount: priceChange ? priceChange.to : Math.round(typical * 100) / 100,
      count: dates.length,
      intervalDays: intervalDays || 30,
      category: labeled ? "Abonamente" : category,
      sourceId: last.sourceId,
      memberId: last.memberId,
      lastDate: last.date,
      confidence: labeled || (monthly && dates.length >= 3) ? "high" : "medium",
      reason: priceChange
        ? t("S-a scumpit: {from} → {to}.", { from: leiExact(priceChange.from), to: leiExact(priceChange.to) })
        : labeled
        ? t("Categoria Abonamente, cu sumă stabilă.")
        : monthly
          ? t("Apare cam la {days} zile, cu sumă aproape identică.", { days: intervalDays })
          : t("Se repetă săptămânal de {count} ori.", { count: dates.length }),
      priceChange,
    });
  });
  return detections.sort((a, b) => b.amount - a.amount).slice(0, 8);
};

export type RecurringPriceChange = { recurringId: string; name: string; from: number; to: number; date: string };

/**
 * Scadențele urmărite care s-au scumpit: ultima plată la același comerciant (din ultimele 45 de
 * zile) e peste suma salvată. Plățile variabile (curent, gaz) nu intră: acolo suma chiar variază.
 */
export const recurringPriceChanges = (data: AppData, asOf = isoToday()): RecurringPriceChange[] => {
  const since = addIsoDays(asOf, -45);
  const changes: RecurringPriceChange[] = [];
  for (const item of data.recurring) {
    if (!item.active || item.variable || item.amount <= 0) continue;
    const brand = brandOf(subscriptionKey(item.name));
    if (!brand || brand.length < 3) continue;
    const latest = data.transactions
      .filter((entry) => entry.kind === "expense" && entry.date >= since && entry.date <= asOf && brandOf(subscriptionKey(entry.title)) === brand)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    // O plată de peste două ori suma nu e un preț nou, e altceva la același comerciant.
    if (latest && isPriceRise(item.amount, latest.amount) && latest.amount <= item.amount * 2) {
      changes.push({ recurringId: item.id, name: item.name, from: item.amount, to: latest.amount, date: latest.date });
    }
  }
  return changes.sort((a, b) => (b.to - b.from) - (a.to - a.from));
};

/** Scrie prețul nou pe scadența urmărită. Nu atinge registrul: următoarea plată pleacă de la suma reală. */
export const acceptRecurringPrice = (data: AppData, recurringId: string, asOf = isoToday()): AppData | undefined => {
  const change = recurringPriceChanges(data, asOf).find((item) => item.recurringId === recurringId);
  if (!change) return undefined;
  const now = new Date().toISOString();
  return { ...data, recurring: data.recurring.map((item) => item.id === recurringId ? { ...item, amount: change.to, updatedAt: now } : item) };
};

export type PocketKind = "cash" | "card" | "meal" | "voucher" | "transfer";
export type PocketSlice = { kind: PocketKind; amount: number };

/** Unde stau banii lichizi, pe felul sursei. Un singur fel nu merită un rând: cifra mare spune deja totalul. */
export const pocketSlices = (data: AppData): PocketSlice[] => {
  const totals: Record<PocketKind, number> = { cash: 0, card: 0, meal: 0, voucher: 0, transfer: 0 };
  for (const source of data.settings.paymentSources) {
    const balance = sourceBalance(data, source.id);
    if (balance < 1 || !(source.kind in totals)) continue;
    totals[source.kind] += balance;
  }
  return (["cash", "card", "meal", "voucher", "transfer"] as const)
    .filter((kind) => totals[kind] >= 1)
    .map((kind) => ({ kind, amount: Math.round(totals[kind] * 100) / 100 }));
};

export type TrueExpenseNudge = { id: string; name: string; date: string; left: number; saved: number; estimate: number; monthly: number };

/** Următorul cost care nu încape în plicul lunii (Crăciun, RCA, școală), doar dacă mai e aproape și încă nu e strâns. */
export const nextTrueExpense = (data: AppData, asOf = isoToday()): TrueExpenseNudge | undefined => {
  const next = upcomingPlannedEvents(data.settings.plannedEvents || [], asOf, 90)
    .find((item) => !item.passed && item.remaining >= 50 && item.daysLeft >= 1 && item.estimate > 0);
  if (!next || next.perMonth < 1) return undefined;
  return { id: next.event.id, name: next.event.name, date: next.date, left: next.remaining, saved: next.saved, estimate: next.estimate, monthly: Math.max(1, Math.round(next.perMonth)) };
};

/** Cât costă abonamentele urmărite, adus la o lună și la un an (trimestrialele și anualele împărțite). */
export const subscriptionSpend = (data: AppData) => {
  const active = data.recurring.filter((item) => item.active && item.category === "Abonamente");
  const monthly = active.reduce((sum, item) => sum + (item.frequency === "yearly" ? item.amount / 12 : item.frequency === "quarterly" ? item.amount / 3 : item.amount), 0);
  return { count: active.length, monthly: Math.round(monthly * 100) / 100, yearly: Math.round(monthly * 12 * 100) / 100 };
};

export type MonthlyFamilyReport = {
  month: string;
  title: string;
  priorTitle: string;
  familyName: string;
  income: number;
  expense: number;
  cashflow: number;
  priorExpense: number;
  /** Cât din venit a rămas în casă (0–1); lipsește fără venit. */
  keptShare?: number;
  categories: Array<{ name: string; amount: number; prior: number; delta: number }>;
  /** Categoria care a crescut cel mai mult față de luna trecută (măcar 50 de lei). */
  biggestRise?: { name: string; delta: number };
  members: Array<{ name: string; expense: number }>;
  subscriptions: { monthly: number; yearly: number; count: number; rises: RecurringPriceChange[] };
  nextStep: string;
  empty: boolean;
};

/** Raportul lunii pentru toată familia: ce a intrat, unde s-a dus, ce s-a schimbat față de luna trecută. */
export const monthlyFamilyReport = (data: AppData, month = currentMonthKey()): MonthlyFamilyReport => {
  const recap = monthlyRecap(data, month);
  const range = monthRange(month);
  const prior = monthRange(previousMonth(month));
  const spendBy = (start: string, end: string) => data.transactions
    .filter((item) => item.kind === "expense" && item.date >= start && item.date <= end)
    .reduce<Record<string, number>>((all, item) => ({ ...all, [item.category]: (all[item.category] || 0) + item.amount }), {});
  const now = spendBy(range.start, range.end);
  const before = spendBy(prior.start, prior.end);
  const round = (value: number) => Math.round(value * 100) / 100;
  const categories = Object.keys(now)
    .map((name) => ({ name, amount: round(now[name]), prior: round(before[name] || 0), delta: round(now[name] - (before[name] || 0)) }))
    .sort((a, b) => b.amount - a.amount);
  const rise = recap.priorExpense > 0 ? [...categories].sort((a, b) => b.delta - a.delta)[0] : undefined;
  const members = data.settings.members.length > 1
    ? data.settings.members
      .map((member) => ({ name: member.name, expense: round(data.transactions.filter((item) => item.kind === "expense" && item.memberId === member.id && item.date >= range.start && item.date <= range.end).reduce((sum, item) => sum + item.amount, 0)) }))
      .filter((item) => item.expense > 0)
      .sort((a, b) => b.expense - a.expense)
    : [];
  const spend = subscriptionSpend(data);
  return {
    month,
    title: recap.title,
    priorTitle: monthTitle(previousMonth(month)),
    familyName: data.settings.familyName || t("Familie"),
    income: round(recap.income),
    expense: round(recap.expense),
    cashflow: round(recap.cashflow),
    priorExpense: round(recap.priorExpense),
    keptShare: recap.income > 0 ? Math.max(0, recap.cashflow) / recap.income : undefined,
    categories: categories.slice(0, 5),
    biggestRise: rise && rise.delta >= 50 ? { name: rise.name, delta: rise.delta } : undefined,
    members,
    subscriptions: { ...spend, rises: recurringPriceChanges(data, range.end < isoToday() ? range.end : isoToday()) },
    nextStep: recap.nextStep,
    empty: recap.tone === "empty",
  };
};

const signed = (value: number) => `${value >= 0 ? "+" : "−"}${leiExact(Math.abs(value))}`;

/** Textul de trimis pe WhatsApp sau oriunde: scurt, fără tabele, cu cifrele care contează. */
export const formatMonthlyReportShare = (report: MonthlyFamilyReport) => {
  const lines = [
    t("{family} · raportul lunii {month}", { family: report.familyName, month: report.title }),
    t("Venituri {income} · Cheltuieli {expense}", { income: leiExact(report.income), expense: leiExact(report.expense) }),
    report.cashflow >= 0
      ? report.keptShare !== undefined
        ? t("Au rămas {amount} ({share}% din venit)", { amount: leiExact(report.cashflow), share: Math.round(report.keptShare * 100) })
        : t("Au rămas {amount}", { amount: leiExact(report.cashflow) })
      : t("S-a cheltuit cu {amount} peste venit", { amount: leiExact(-report.cashflow) }),
  ];
  if (report.priorExpense > 0) lines.push(t("Față de {month}: cheltuieli {delta}", { month: report.priorTitle, delta: signed(report.expense - report.priorExpense) }));
  if (report.categories.length) {
    lines.push("", t("Unde s-au dus banii"));
    report.categories.forEach((item) => lines.push(`• ${t(item.name)} ${leiExact(item.amount)}${report.priorExpense > 0 && Math.abs(item.delta) >= 1 ? ` (${signed(item.delta)})` : ""}`));
  }
  if (report.biggestRise) lines.push(t("A crescut cel mai mult: {name}, {delta}", { name: t(report.biggestRise.name), delta: signed(report.biggestRise.delta) }));
  if (report.members.length > 1) lines.push("", t("Cine a cheltuit: {list}", { list: report.members.map((item) => `${item.name} ${leiExact(item.expense)}`).join(" · ") }));
  if (report.subscriptions.count) lines.push("", t("Abonamente: {monthly} pe lună · {yearly} pe an.", { monthly: leiExact(report.subscriptions.monthly), yearly: leiExact(report.subscriptions.yearly) }));
  report.subscriptions.rises.forEach((item) => lines.push(t("S-a scumpit {name}: {from} → {to}", { name: item.name, from: leiExact(item.from), to: leiExact(item.to) })));
  lines.push("", t("Următorul pas: {step}", { step: report.nextStep }));
  return lines.join("\n");
};

export const recurringFromDetection = (data: AppData, detection: SubscriptionDetection): RecurringPayment | undefined => {
  const sourceId = detection.sourceId || data.settings.paymentSources[0]?.id;
  const memberId = detection.memberId || selfMemberIdOf(data);
  if (!sourceId || !memberId || detection.amount <= 0) return undefined;
  const dueDay = Math.min(28, Math.max(1, Number(detection.lastDate.slice(8, 10)) || 1));
  return { id: newId("recurring"), name: detection.name, amount: detection.amount, category: detection.category, sourceId, memberId, dueDay, active: true, autoPost: false, note: t("Adăugat din detectarea abonamentelor"), updatedAt: new Date().toISOString() };
};

const MONTH_CLOSE_KEY = "buget-familie:month-close-v1";

export type MonthCloseRecord = { month: string; closedAt: string; income: number; expense: number; cashflow: number; note?: string };

export const readClosedMonths = (): Record<string, MonthCloseRecord> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MONTH_CLOSE_KEY);
    return raw ? JSON.parse(raw) as Record<string, MonthCloseRecord> : {};
  } catch {
    return {};
  }
};

export const closeMonthLocally = (recap: MonthlyRecap, note?: string): MonthCloseRecord => {
  const record: MonthCloseRecord = { month: recap.month, closedAt: new Date().toISOString(), income: recap.income, expense: recap.expense, cashflow: recap.cashflow, note };
  if (typeof window !== "undefined") {
    const all = { ...readClosedMonths(), [recap.month]: record };
    safeSetItem(window.localStorage, MONTH_CLOSE_KEY, JSON.stringify(all));
  }
  return record;
};

export const liquidSafeToSpend = (data: AppData, asOf = isoToday()) => {
  const balance = financialBalance(data);
  const pending = scheduledInPlan(data);
  const envelopeLeft = data.settings.salaryPlan.allocations.reduce((sum, item) => sum + Math.max(0, allocationStatus(data, item).remaining), 0);
  // Sursele unui membru fără bani notați au doar rate plătite (minus): nu scad banii celorlalți.
  const untracked = untrackedSourceIds(data);
  const liquidFunds = balance.liquidFunds - data.settings.paymentSources.filter((source) => untracked.has(source.id)).reduce((sum, source) => sum + sourceBalance(data, source.id), 0);
  const available = Math.max(0, liquidFunds - pending);
  return { liquidFunds, reservedRecurring: pending, envelopeLeft, available, asOf };
};

export const lastDaysPulse = (data: AppData, days = 7, asOf = isoToday()) => {
  const basis = new Date(`${asOf}T12:00:00`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(basis);
    date.setDate(basis.getDate() - (days - 1 - index));
    const iso = isoDate(date);
    const entries = data.transactions.filter((item) => item.date === iso && !isBalanceAdjustment(item));
    const expense = entries.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const income = entries.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    return {
      date: iso,
      weekday: new Intl.DateTimeFormat(getLocale(), { weekday: "short" }).format(date).replace(".", ""),
      expense,
      income,
      isToday: iso === asOf,
    };
  });
};

export const paydayTrack = (data: AppData, asOf = isoToday()) => {
  const plan = data.settings.salaryPlan;
  const end = plan.nextPayday || plan.earliestPayday;
  if (!plan.periodStart || !end) return undefined;
  const total = Math.max(1, daysBetween(plan.periodStart, end) + 1);
  const elapsed = Math.max(0, Math.min(total, daysBetween(plan.periodStart, asOf) + 1));
  return { start: plan.periodStart, end, total, elapsed, remaining: Math.max(0, total - elapsed), ratio: elapsed / total };
};

/**
 * Cât mai e până la salariu: zilele până la data obișnuită și până la cea mai târzie din
 * fereastra de ± zile. Banii trebuie să ajungă până în ziua dinaintea salariului.
 */
export const untilPayday = (plan: SalaryPlan, asOf = isoToday()) => {
  if (!plan.nextPayday || plan.nextPayday < asOf || plan.horizonDays) return undefined;
  const range = paydayWindow(plan);
  return { typical: range.typical, earliest: range.earliest, latest: range.latest, flex: range.flex, days: daysBetween(asOf, range.typical), latestDays: daysBetween(asOf, range.latest) };
};

/** Pentru un plic: câte zile mai are de acoperit și cât iese pe zi / pe săptămână, prudent. */
export const envelopeUntilPayday = (data: AppData, allocation: BudgetAllocation, asOf = isoToday()) => {
  const until = untilPayday(data.settings.salaryPlan, asOf);
  if (!until) return undefined;
  // O factură nu se împarte pe zile: „cel mult 0,25 lei pe zi la Lumină” nu înseamnă nimic.
  if (isFixedEnvelope(data.settings.salaryPlan, allocation)) return undefined;
  const remaining = Math.max(0, allocationStatus(data, allocation).remaining);
  const days = Math.max(1, until.latestDays);
  return { ...until, remaining, perDay: perDay(remaining, days), perWeek: floorCents(remaining * 7 / days) };
};

/**
 * Cât se poate da azi dintr-un plic pe săptămâni, ca tranșa să ajungă până la capătul ei:
 * ce a rămas în săptămână, împărțit la zilele rămase (cu tot cu azi). Aceeași cifră pe
 * plic, în avertizare și în ghid.
 */
export const weekDayCap = (data: AppData, allocation: BudgetAllocation, asOf = isoToday()) => {
  if (!isWeeklyPaced(allocation, data.settings.salaryPlan)) return undefined;
  const week = allocationWeekStatus(data, allocation, asOf);
  if (!week) return undefined;
  const daysLeft = Math.max(1, daysBetween(asOf, week.end) + 1);
  // La bani, ca cifra de pe Astăzi (37,50), rotunjit în jos ca să nu promită mai mult.
  // Aceeași socoteală ca ritmul de pe Astăzi: partea zilei din banii de la începutul zilei,
  // minus ce s-a dus azi; zilele următoare împart restul.
  const spentToday = data.transactions.filter((item) => item.kind === "expense" && item.date === asOf && expenseBelongsTo(data.settings.salaryPlan, item, allocation)).reduce((sum, item) => sum + envelopeDayAmount(data, item, allocation), 0);
  const remaining = Math.max(0, week.remaining);
  const todayLeft = Math.max(0, (remaining + spentToday) / daysLeft - spentToday);
  const futureDays = daysLeft - 1;
  return {
    week,
    daysLeft,
    perDay: floorCents(remaining / daysLeft),
    spentToday,
    todayLeft: floorCents(todayLeft),
    futureShare: futureDays > 0 ? floorCents((remaining - todayLeft) / futureDays) : 0,
  };
};

export type WeekTooFast = { allocationId: string; label: string; weekIndex: number; spent: number; budget: number; remaining: number; daysLeft: number; perDay: number; /** Aceeași cifră ca „Poți folosi azi” și zilele de după. */ todayLeft: number; futureShare: number; over: boolean };

/**
 * Plicurile pe săptămâni în care tranșa curentă se duce mai repede decât zilele: „450 din 600,
 * mai sunt 3 zile”. Cel puțin 60% folosit și cu 15 puncte peste partea de zile scursă,
 * ca o singură cumpărătură mare de luni să nu sune alarma pentru orice.
 */
export const weekTooFast = (data: AppData, asOf = isoToday()): WeekTooFast[] => {
  const plan = data.settings.salaryPlan;
  const out: WeekTooFast[] = [];
  for (const item of plan.allocations) {
    if (!isWeeklyPaced(item, plan)) continue;
    const cap = weekDayCap(data, item, asOf);
    if (!cap) continue;
    const { week, daysLeft } = cap;
    if (week.budget <= 0 || week.spent <= 0) continue;
    const elapsed = Math.max(1, daysBetween(week.start, asOf) + 1);
    const usage = week.spent / week.budget;
    const over = week.remaining < 0;
    if (!over && (daysLeft < 2 || usage < 0.6 || usage < elapsed / week.days + 0.15)) continue;
    out.push({ allocationId: item.id, label: item.label, weekIndex: week.index, spent: week.spent, budget: week.budget, remaining: week.remaining, daysLeft, perDay: cap.perDay, todayLeft: cap.todayLeft, futureShare: cap.futureShare, over });
  }
  return out.sort((a, b) => Number(b.over) - Number(a.over) || b.spent / b.budget - a.spent / a.budget);
};

export type CycleEndReport = {
  payday: string;
  daysLeft: number;
  /** Salariul a intrat deja (e al ciclului următor). */
  incomeArrived: boolean;
  made: Array<{ id: string; label: string; left: number }>;
  over: Array<{ id: string; label: string; over: number }>;
  leftTotal: number;
  /** Cât se poate muta fără grijă: plicuri de facturi deja plătite, surplusul mâncării peste zilele rămase. */
  spare: number;
  goal?: { id: string; name: string; left: number };
};

/**
 * Raportul de la capătul ciclului, cu câteva zile înainte de salariu: ce plicuri au ajuns,
 * care nu, cât a rămas și cât se poate pune deoparte fără să lipsească în zilele rămase.
 * O factură încă neplătită își ține banii; mâncarea își ține partea pentru zilele rămase.
 */
/**
 * Venitul intrat deja în fereastra zilei de salariu: e al ciclului următor. Pe el se sprijină
 * cifra zilei (nu intră în ea) și textele de final de ciclu („Salariul a intrat”, nu „e așteptat azi”).
 */
export const nextCycleIncomeArrived = (data: AppData, asOf = isoToday()) => {
  const plan = data.settings.salaryPlan;
  const range = paydayWindow(plan);
  if (!range.earliest || asOf < range.earliest || planExpired(plan, asOf)) return 0;
  const meal = new Set(data.settings.paymentSources.filter((item) => item.kind === "meal").map((item) => item.id));
  return data.transactions.filter((item) => item.kind === "income" && !isBalanceAdjustment(item) && item.date >= range.earliest! && item.date <= asOf && item.amount >= 200 && !meal.has(item.sourceId || "")).reduce((sum, item) => sum + item.amount, 0);
};

export const cycleEndReport = (data: AppData, asOf = isoToday()): CycleEndReport | undefined => {
  const plan = data.settings.salaryPlan;
  const until = untilPayday(plan, asOf);
  if (!until || until.days > 3 || !plan.allocations.length || plan.cycleReportDone === plan.nextPayday) return undefined;
  const made: CycleEndReport["made"] = [];
  const over: CycleEndReport["over"] = [];
  let spare = 0;
  const daysLeft = Math.max(0, until.latestDays);
  for (const item of plan.allocations) {
    const status = allocationStatus(data, item);
    if (status.budget <= 0) continue;
    if (status.remaining < 0) { over.push({ id: item.id, label: item.label, over: Math.round(-status.remaining * 100) / 100 }); continue; }
    made.push({ id: item.id, label: item.label, left: Math.round(status.remaining * 100) / 100 });
    if (isWeeklyPaced(item, plan)) {
      const perDay = (item.weeklyAmount || status.budget / Math.max(1, daysBetween(plan.periodStart, until.typical) + 1) * 7) / 7;
      spare += Math.max(0, status.remaining - perDay * daysLeft);
    } else if (status.spent > 0) {
      spare += status.remaining;
    }
  }
  const leftTotal = made.reduce((sum, item) => sum + item.left, 0);
  const goal = data.savings.filter((item) => item.target > item.current).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))[0];
  return {
    payday: until.typical,
    daysLeft: until.days,
    incomeArrived: nextCycleIncomeArrived(data, asOf) > 0,
    made: made.sort((a, b) => b.left - a.left),
    over: over.sort((a, b) => b.over - a.over),
    leftTotal: Math.round(leftTotal * 100) / 100,
    // Ce s-a depășit într-un plic a fost luat din altă parte: se scade din surplus.
    spare: Math.max(0, Math.floor((spare - over.reduce((sum, item) => sum + item.over, 0)) / 10) * 10),
    goal: goal ? { id: goal.id, name: goal.name, left: Math.round((goal.target - goal.current) * 100) / 100 } : undefined,
  };
};

export const envelopeLane = (data: AppData, asOf = isoToday()) => data.settings.salaryPlan.allocations
  .map((item) => ({ item, ...envelopeDecisionStatus(data, item, asOf) }))
  .sort((left, right) => (right.state === "over" ? 2 : right.state === "watch" ? 1 : 0) - (left.state === "over" ? 2 : left.state === "watch" ? 1 : 0) || right.usage - left.usage)
  .slice(0, 8);

export type EnvelopeBurnPace = {
  allocationId: string;
  label: string;
  budget: number;
  spent: number;
  remaining: number;
  usage: number;
  expectedUsage: number;
  delta: number;
  pace: "ahead" | "on_track" | "behind" | "over";
  reason: string;
  elapsedDays: number;
  totalDays: number;
};

/**
 * Compară consumul plicului cu ritmul calendaristic al ciclului.
 * „în avans” = ai cheltuit mai puțin decât proporția zilelor scurse; „în urmă” = mai mult.
 * Toleranță ±8pp ca să nu alarmeze pe zgomot zilnic.
 */
export const envelopeBurnPace = (data: AppData, asOf = isoToday()): EnvelopeBurnPace[] => {
  const track = paydayTrack(data, asOf);
  const expectedUsage = track ? Math.min(1, track.elapsed / track.total) : 0;
  const totalDays = track?.total ?? 0;
  const elapsedDays = track?.elapsed ?? 0;
  return data.settings.salaryPlan.allocations.map((item) => {
    const status = allocationStatus(data, item);
    const usage = status.usage;
    let pace: EnvelopeBurnPace["pace"] = "on_track";
    if (status.fixed) pace = status.remaining < 0 ? "over" : "on_track";
    else if (status.remaining < 0 || usage >= 1) pace = "over";
    else if (!track) pace = usage >= (item.alertThreshold ?? 80) / 100 ? "behind" : "on_track";
    else if (usage > expectedUsage + 0.08) pace = "behind";
    else if (usage < expectedUsage - 0.08) pace = "ahead";
    const delta = Math.round((expectedUsage - usage) * 100);
    const reason = status.fixed && pace !== "over"
      ? status.paid ? t("Plătit.") : t("Plată fixă: se plătește o dată, nu pe zile.")
      : !track
      ? t("Setează perioada până la venit ca să comparăm ritmul cu calendarul.")
      : pace === "over"
        ? t("Plicul e depășit — mută lei din alt plic sau reduce cheltuielile.")
        : pace === "behind"
          ? t("Ai consumat {usage}% din plic, dar ciclul e doar la {expected}%.", { usage: Math.round(usage * 100), expected: Math.round(expectedUsage * 100) })
          : pace === "ahead"
            ? t("Ești cu ~{delta}pp sub ritmul zilelor scurse — poți folosi cu calm.", { delta: Math.abs(delta) })
            : t("Consumul ({usage}%) e aliniat cu zilele scurse ({expected}%).", { usage: Math.round(usage * 100), expected: Math.round(expectedUsage * 100) });
    return {
      allocationId: item.id,
      label: item.label,
      budget: status.budget,
      spent: status.spent,
      remaining: status.remaining,
      usage,
      expectedUsage,
      delta,
      pace,
      reason,
      elapsedDays,
      totalDays,
    };
  }).sort((a, b) => {
    const rank = (p: EnvelopeBurnPace["pace"]) => (p === "over" ? 3 : p === "behind" ? 2 : p === "on_track" ? 1 : 0);
    return rank(b.pace) - rank(a.pace) || b.usage - a.usage;
  });
};


export type EnvelopeRunOut = {
  allocationId: string;
  label: string;
  remaining: number;
  /** Media pe zi de la începutul ciclului. */
  dailyRate: number;
  /** Ziua în care, la ritmul ăsta, plicul ajunge la zero. */
  runOutDate: string;
  /** Câte zile rămân fără bani în plic până la salariu. */
  daysShort: number;
  /** Cât se poate cheltui pe zi, de azi până la salariu, ca plicul să ajungă. */
  safeDaily: number;
  payday: string;
};

/**
 * Plicurile care, la ritmul de până acum, se golesc înainte de salariu. Alerta de prag spune
 * „ai folosit 80%”; asta spune „pe 3 octombrie rămâi fără, cu 7 zile înainte de venit” — cu
 * măcar 3 zile de ciclu scurse, ca un singur plin de cumpărături să nu sune alarma.
 */
const envelopeRunOutUncached = (data: AppData, asOf: string): EnvelopeRunOut[] => {
  const track = paydayTrack(data, asOf);
  if (!track || track.elapsed < 3 || track.remaining < 2) return [];
  const out: EnvelopeRunOut[] = [];
  // Când săptămâna plicului merge deja prea repede, avertizarea ei spune cifra de azi; a doua
  // cifră, pe tot ciclul, ar contrazice-o pe același ecran.
  const fast = new Set(weekTooFast(data, asOf).map((item) => item.allocationId));
  for (const item of data.settings.salaryPlan.allocations) {
    if (fast.has(item.id)) continue;
    const status = allocationStatus(data, item);
    if (status.fixed || status.spent <= 0 || status.remaining <= 0) continue;
    const dailyRate = status.spent / track.elapsed;
    const daysLeft = status.remaining / dailyRate;
    const daysShort = Math.floor(track.remaining - daysLeft);
    if (daysShort < 2) continue;
    out.push({
      allocationId: item.id,
      label: item.label,
      remaining: status.remaining,
      dailyRate: Math.round(dailyRate * 100) / 100,
      runOutDate: addIsoDays(asOf, Math.max(0, Math.floor(daysLeft))),
      daysShort,
      safeDaily: perDay(status.remaining, track.remaining + 1),
      payday: track.end,
    });
  }
  return out.sort((a, b) => b.daysShort - a.daysShort);
};

export type SavingsSuggestion = {
  goalId: string;
  left: number;
  /** Suma propusă pe lună, rotunjită la leu (cu termen) sau la 10 lei (fără termen). */
  monthly: number;
  months: number;
  /** Luna în care se atinge ținta la ritmul propus. */
  eta: string;
  /** Media lunară „venit − cheltuieli” din ultimele 3 luni întregi; lipsește fără date. */
  surplus?: number;
  /** Suma pe lună trece de ce rămâne de obicei în casă. */
  stretch: boolean;
  basis: "deadline" | "surplus";
};

/** Ce rămâne în medie pe lună (venit − cheltuieli) în ultimele 3 luni întregi cu mișcări. */
export const monthlySurplus = (data: AppData, asOf = isoToday()): number | undefined => {
  const months: number[] = [];
  let month = previousMonth(asOf.slice(0, 7));
  for (let step = 0; step < 3; step += 1) {
    const range = monthRange(month);
    const entries = data.transactions.filter((item) => item.date >= range.start && item.date <= range.end && !isBalanceAdjustment(item));
    if (entries.length) months.push(entries.reduce((sum, item) => sum + (item.kind === "income" ? item.amount : item.kind === "expense" ? -item.amount : 0), 0));
    month = previousMonth(month);
  }
  return months.length ? months.reduce((sum, value) => sum + value, 0) / months.length : undefined;
};

/**
 * Cât să pui deoparte pe lună pentru un obiectiv. Cu termen: ce lipsește împărțit la lunile
 * rămase. Fără termen: o sumă confortabilă — cam 30% din ce rămâne de obicei la final de lună —
 * și luna în care ajungi. În ambele cazuri spune dacă suma trece de ce rămâne de obicei.
 */
export const savingsSuggestion = (data: AppData, goal: SavingsGoal, asOf = isoToday()): SavingsSuggestion | undefined => {
  const left = Math.round((goal.target - goal.current) * 100) / 100;
  if (left <= 0) return undefined;
  const surplus = monthlySurplus(data, asOf);
  const etaFor = (months: number) => {
    const date = new Date(`${asOf}T12:00:00`);
    date.setMonth(date.getMonth() + months);
    return isoDate(date).slice(0, 7);
  };
  if (goal.dueDate && goal.dueDate > asOf) {
    // Luni calendaristice întregi: 25 sept. → 25 ian. înseamnă 4, nu 122 / 30,44 zile.
    const [y1, m1, d1] = asOf.split("-").map(Number);
    const [y2, m2, d2] = goal.dueDate.split("-").map(Number);
    const months = Math.max(1, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
    const monthly = Math.ceil(left / months);
    return { goalId: goal.id, left, monthly, months, eta: goal.dueDate.slice(0, 7), surplus, stretch: surplus !== undefined && monthly > Math.max(0, surplus), basis: "deadline" };
  }
  if (!surplus || surplus <= 0) return undefined;
  const monthly = Math.min(Math.ceil(left), Math.max(50, Math.round((surplus * 0.3) / 10) * 10));
  const months = Math.max(1, Math.ceil(left / monthly));
  return { goalId: goal.id, left, monthly, months, eta: etaFor(months), surplus, stretch: false, basis: "surplus" };
};

export type TodayDue = {
  id: string;
  kind: "recurring" | "debt";
  name: string;
  amount: number;
  dueDate: string;
  daysLeft: number;
  confirmable: boolean;
};

export type TodayBrief = {
  spendable: number;
  remainingDays: number;
  hasPayday: boolean;
  /** Ciclul s-a încheiat și nu a fost reînnoit: cifra zilei nu mai are pe ce sta. */
  expired: boolean;
  reason: string;
  dues: TodayDue[];
  hunts: SubscriptionDetection[];
  closeSoon: boolean;
};

/**
 * Cât poți cheltui azi. O singură regulă, cu plicuri sau fără: partea zilei = banii de la
 * începutul zilei împărțiți pe zilele rămase, iar ce cheltui azi scade din partea de azi.
 * Mâine, ce a rămas se reîmparte. Când există plicuri cu ritm, banii sunt cei din plicul
 * săptămânii; fără plicuri, lichidul prudent până la venit (după scadențe și rate).
 */
const todayBriefUncached = (data: AppData, asOf: string): TodayBrief => {
  const hasPayday = Boolean(data.settings.salaryPlan.nextPayday || data.settings.salaryPlan.earliestPayday);
  /** Un plan expirat nu mai are ce ritm să dea: cifra corectă e zero, iar motivul e altul. */
  const expired = planExpired(data.settings.salaryPlan, asOf);
  const forecast = planForecast(data, asOf);
  const plan = data.settings.salaryPlan;
  /**
   * Salariul intrat în fereastra zilei de salariu e al ciclului următor. Fără scăderea asta,
   * în ziua salariului Astăzi arăta „Poți folosi azi 5.200” — tot venitul, pe o zi.
   */
  const nextCycleIncome = hasPayday ? nextCycleIncomeArrived(data, asOf) : 0;
  const liquid = liquidSafeToSpend(data, asOf);
  /**
   * Fără plicuri încă (prima zi, soldul de pornire), cifra zilei scade întâi obligațiile
   * declarate care cad până la salariu: chiria de pe 1 și rata de pe 5 nu sunt bani de cheltuit.
   * Cu plicuri, banii lor sunt deja în plicurile fixe.
   */
  const paydayEnd = plan.nextPayday || plan.earliestPayday || "";
  const obligations = !plan.allocations.length && paydayEnd
    ? (plan.needs || []).filter((need) => !need.archived && need.priority === "fixed")
      .map((need) => ({ need, due: nextNeedDue(data, need, asOf) }))
      .filter((item): item is { need: typeof item.need; due: { date: string; amount: number } } => Boolean(item.due && item.due.date < paydayEnd))
    : [];
  const obligationsDue = obligations.reduce((sum, item) => sum + item.due.amount, 0);
  const safe = { ...liquid, available: Math.max(0, liquid.available - nextCycleIncome - obligationsDue) };
  const remainingDays = Math.max(1, forecast.remainingDays);
  /**
   * Doar cheltuiala care vine din banii zilei: o factură plătită din plicul ei (Enel din Lumină,
   * grădinița din Grădiniță) era deja pusă deoparte, deci nu micșorează partea de azi. Altfel
   * „Poți folosi azi” cădea 365 → 0 după două facturi, cu 1.831 lei în plicul săptămânii.
   */
  const fixedIds = new Set(plan.allocations.filter((item) => isFixedEnvelope(plan, item)).map((item) => item.id));
  const spentToday = data.transactions.filter((item) => item.kind === "expense" && item.date === asOf && inPlanPeriod(item.date, plan) && !isBalanceAdjustment(item) && !(item.allocationId && fixedIds.has(item.allocationId))).reduce((sum, item) => sum + item.amount, 0);
  /** Partea de azi, socotită din banii de la începutul zilei; cheltuiala de azi o micșorează leu cu leu. */
  const dayShareLeft = (moneyNowAfterToday: number) => Math.max(0, (moneyNowAfterToday + spentToday) / remainingDays - spentToday);
  const fromPace = dayShareLeft(Math.max(0, forecast.safeDaily) * remainingDays);
  /**
   * Plafonul din cont nu socotește ca liberi banii puși deja deoparte pentru facturi și rate
   * (plicurile fixe): altfel plata Enel din plicul ei scădea plafonul, și cifra zilei cu el.
   */
  const fixedLeft = plan.allocations.filter((item) => fixedIds.has(item.id)).reduce((sum, item) => sum + Math.max(0, allocationStatus(data, item).remaining), 0);
  const fromLiquid = dayShareLeft(Math.max(0, safe.available - fixedLeft));
  const rhythm = weeklyEnvelopeDailyRhythm(data, asOf);
  const fromWeek = rhythm.hasWeekly ? Math.max(0, rhythm.todayLeft) : undefined;
  /**
   * Cu plicuri, dar fără plic săptămânal plin: banii zilei sunt cei din plicurile de cheltuieli
   * curente (nu facturi sau rate) plus ce n-a fost repartizat. Altfel, după ce tot salariul
   * mergea în facturi, cifra zilei cădea pe soldul cardului („358 lei/zi” cu Mâncare 0).
   */
  const flexibleLeft = plan.allocations.length && fromWeek == null
    ? plan.allocations.filter((item) => !isFixedEnvelope(plan, item)).reduce((sum, item) => sum + Math.max(0, allocationStatus(data, item).remaining), 0) + Math.max(0, planAllocationMath(data).unrepartized)
    : undefined;
  const fromEnvelopes = flexibleLeft == null ? undefined : dayShareLeft(flexibleLeft);
  /**
   * Cu plic săptămânal, partea zilei vine din plic; banii din cont sunt doar plafonul total, nu
   * „partea unei zile din cont”. Altfel cumpărăturile mari de azi (165 + 106 lei) depășeau a 31-a parte
   * din cont și Astăzi arăta 0,00, deși plicul săptămânii mai avea 32,40 pentru azi.
   */
  const liquidCap = fromWeek != null ? Math.max(0, safe.available - fixedLeft) : fromLiquid;
  const spendable = hasPayday && !expired ? Math.max(0, Math.min(fromWeek ?? fromEnvelopes ?? fromPace, liquidCap, safe.available)) : 0;
  const fixedNames = plan.allocations.filter((item) => fixedIds.has(item.id) && allocationStatus(data, item).remaining > 1).map((item) => item.label);
  const fixedAside = fixedLeft > 1 && fixedNames.length
    ? t("Am lăsat deoparte {amount} pentru {labels}.", { amount: stripLei(fixedLeft, getLocale()), labels: fixedNames.slice(0, 3).join(", ") })
    : "";
  const reason = nextCycleIncome > 0 && !expired && hasPayday
    ? t("Venitul de azi e pentru ciclul următor: repartizează-l în plicuri. Cifra zilei vine din banii ciclului care se încheie.")
    : !hasPayday
    ? t("Setează următorul venit sau, la venituri neregulate, câte zile să-ți ajungă banii (Plan), ca să calculăm cât poți cheltui azi.")
    : expired
      ? t("Ciclul s-a încheiat pe {date} — pornește ciclul nou ca să-ți spun din nou ritmul zilei.", { date: formatDate(planEndDate(data.settings.salaryPlan)) })
      : spendable <= 0 && fixedAside && spentToday < 0.5
      ? t("Azi nu mai sunt bani liberi: {amount} stau deoparte pentru {labels}.", { amount: stripLei(fixedLeft, getLocale()), labels: fixedNames.slice(0, 3).join(", ") })
      : spendable <= 0 && remainingDays > 1 && (fromWeek != null ? rhythm.remaining : safe.available) > 0
      ? t("Azi ai folosit partea zilei; banii nu s-au terminat, doar partea de azi. De mâine: {daily} lei/zi ({available} pe {days}).", fromWeek != null
        ? { daily: stripLei(rhythm.futureShare, getLocale()), available: stripLei(rhythm.remaining, getLocale()), days: daysLabel(Math.max(1, rhythm.remainingDays - 1)) }
        : { daily: stripLei(safe.available / (remainingDays - 1), getLocale()), available: stripLei(safe.available, getLocale()), days: daysLabel(remainingDays - 1) })
      : spendable <= 0
      ? t("Azi nu mai sunt bani liberi: verifică plicurile sau plățile rezervate.")
      : fromWeek != null
        ? t("Azi poți {pace} lei. În plicul săptămânii mai sunt {available} pentru {days}.", { pace: stripLei(spendable, getLocale()), available: stripLei(rhythm.remaining, getLocale()), days: daysLabel(rhythm.remainingDays) })
          + (rhythm.days[0] && rhythm.days[0].day < asOf && rhythm.days[0].day === plan.periodStart && weekdayIndex(rhythm.days[0].day) !== 0 ? ` ${t("Săptămâna plicului a început {day}, în ziua salariului.", { day: new Date(`${rhythm.days[0].day}T12:00:00`).toLocaleDateString(getLocale(), { weekday: "long" }) })}` : "")
          + (fixedAside ? ` ${fixedAside}` : "")
        : flexibleLeft != null
          ? t("Azi poți {pace} lei. În plicurile de cheltuieli curente mai sunt {available} lei pentru {days}.", { pace: stripLei(spendable, getLocale()), available: stripLei(flexibleLeft, getLocale()), days: daysLabel(remainingDays) })
            + (fixedAside ? ` ${fixedAside}` : "")
          : t("Azi poți {pace} lei. Mai sunt {available} lei liberi pentru {days}.", { pace: stripLei(fromPace, getLocale()), available: stripLei(safe.available, getLocale()), days: daysLabel(remainingDays) })
            + (obligationsDue > 0 ? ` ${t("Am scăzut deja {amount} lei pentru {labels}, până la salariu.", { amount: stripLei(obligationsDue, getLocale()), labels: obligations.slice(0, 3).map((item) => item.need.label).join(", ") })}` : "");

  const horizonDate = new Date(`${asOf}T12:00:00`);
  horizonDate.setDate(horizonDate.getDate() + 7);
  const horizon = isoDate(horizonDate);
  const dues: TodayDue[] = [
    ...pendingRecurringInPlan(data)
      .filter((item) => item.dueDate <= horizon)
      .map((item) => ({
        id: item.id,
        kind: "recurring" as const,
        name: item.name,
        amount: item.amount,
        dueDate: item.dueDate,
        daysLeft: daysBetween(asOf, item.dueDate),
        confirmable: true,
      })),
    // Scadența de după plăți: rata confirmată trece pe luna următoare, nu rămâne „Întârziată”.
    ...data.debts
      .filter((item) => item.remaining > 0)
      .map((item) => ({ item, due: nextDebtDue(data, item, asOf) }))
      .filter(({ due }) => due && due <= horizon)
      .map(({ item, due }) => ({
        id: item.id,
        kind: "debt" as const,
        name: item.name,
        amount: item.monthly || item.remaining,
        dueDate: due,
        daysLeft: daysBetween(asOf, due),
        confirmable: false,
      })),
  ].sort((left, right) => left.dueDate.localeCompare(right.dueDate) || right.amount - left.amount).slice(0, 4);

  return {
    spendable,
    remainingDays,
    hasPayday,
    expired,
    reason,
    dues,
    hunts: detectSubscriptions(data, asOf).slice(0, 2),
    closeSoon: hasPayday && remainingDays <= 2,
  };
};

/** Hero pe drumul „doar urmăresc”: fără payday, fără plicuri.
 * Venitul brut rămâne doar cât nu s-a cheltuit din el. După o cheltuială, cifra mare
 * e ce a mai rămas în surse, ca să nu pară că ieșirea nu s-a scăzut. */
export function trackModeHero(input: { periodIncome: number; liquidNow: number; spentToday: number }): {
  kind: "income" | "liquid" | "spent" | "empty";
  value: number;
} {
  const spentAgainstIncome = input.periodIncome > 0.009 && input.liquidNow < input.periodIncome - 0.009;
  if (spentAgainstIncome) return { kind: "liquid", value: Math.max(0, input.liquidNow) };
  if (input.periodIncome > 0) return { kind: "income", value: input.periodIncome };
  if (input.liquidNow > 0) return { kind: "liquid", value: input.liquidNow };
  if (input.spentToday > 0) return { kind: "spent", value: input.spentToday };
  return { kind: "empty", value: 0 };
}

export type SafeSpendBreakdown = {
  spendable: number;
  hasPayday: boolean;
  remainingDays: number;
  paydayDate: string;
  liquidFunds: number;
  reservedRecurring: number;
  availableAfterReserved: number;
  envelopeLeft: number;
  safeDaily: number;
  fromLiquidDaily: number;
  steps: Array<{ label: string; amount: number; note?: string }>;
  /** Cascada „cum se calculează cifra zilei”: fiecare pas, cu totalul după el. Gol fără dată de salariu. */
  waterfall: Array<{ label: string; total: number; kind: "start" | "minus" | "divide" | "result" }>;
  summary: string;
};

/** Formula explicabilă pentru „Poți folosi azi” — fără a scrie în AppData. */
export const safeSpendBreakdown = (data: AppData, asOf = isoToday()): SafeSpendBreakdown => {
  const brief = todayBrief(data, asOf);
  const safe = liquidSafeToSpend(data, asOf);
  const forecast = planForecast(data, asOf);
  const paydayDate = data.settings.salaryPlan.nextPayday || data.settings.salaryPlan.earliestPayday || "";
  const remainingDays = Math.max(1, forecast.remainingDays);
  const fromLiquidDaily = Math.max(0, safe.available / remainingDays);
  const rhythm = weeklyEnvelopeDailyRhythm(data, asOf);
  const steps = rhythm.hasWeekly
    ? [
      { label: t("Rămas în plicul săptămânii"), amount: rhythm.remaining, note: t("Doar tranșa activă, nu tot cash-ul până la salariu") },
      { label: t("Limita de azi"), amount: rhythm.todayLeft, note: t("{days} rămase din săptămână", { days: daysLabel(rhythm.remainingDays) }) },
      { label: t("Lichid în surse"), amount: safe.liquidFunds },
      { label: t("Minus scadențe active"), amount: -safe.reservedRecurring },
    ]
    : [
      { label: t("Lichid în surse"), amount: safe.liquidFunds, note: t("Card, cash, bonuri — sold calculat local") },
      { label: t("Minus scadențe active"), amount: -safe.reservedRecurring, note: t("Chirie, abonamente și rate rezervate, încă neconfirmate") },
      { label: t("Disponibil prudent"), amount: safe.available },
      { label: t("Ritm sigur din plan"), amount: forecast.safeDaily, note: t("Ce rămâne după plicuri și cheltuieli, pe zi") },
      { label: t("Lichid ÷ zile rămase"), amount: fromLiquidDaily, note: t("{days} până la venit", { days: daysLabel(remainingDays) }) },
    ];
  // Cascada folosește aceleași numere ca cifra zilei (todayBrief / ritmul săptămânii).
  const waterfall: SafeSpendBreakdown["waterfall"] = [];
  if (brief.hasPayday && !brief.expired) {
    if (rhythm.hasWeekly) {
      const start = roundMoney(rhythm.remaining + rhythm.todayOut);
      waterfall.push({ label: t("În plicurile săptămânii, la începutul zilei"), total: start, kind: "start" });
      waterfall.push({ label: t("Împărțit la {days}", { days: daysLabel(rhythm.remainingDays) }), total: Math.max(0, rhythm.todayShare), kind: "divide" });
      if (rhythm.todayOut > 0.009) waterfall.push({ label: t("Cheltuit azi din plicuri"), total: Math.max(0, rhythm.todayLeft), kind: "minus" });
    } else {
      const spentToday = data.transactions.filter((item) => item.kind === "expense" && item.date === asOf && inPlanPeriod(item.date, data.settings.salaryPlan)).reduce((sum, item) => sum + item.amount, 0);
      const start = roundMoney(safe.liquidFunds + spentToday);
      waterfall.push({ label: t("Bani în surse, la începutul zilei"), total: start, kind: "start" });
      if (safe.reservedRecurring > 0.009) waterfall.push({ label: t("Scadențe și rate rezervate"), total: roundMoney(Math.max(0, start - safe.reservedRecurring)), kind: "minus" });
      const share = roundMoney(Math.max(0, start - safe.reservedRecurring) / remainingDays);
      waterfall.push({ label: t("Împărțit la {days}", { days: daysLabel(remainingDays) }), total: share, kind: "divide" });
      if (spentToday > 0.009) waterfall.push({ label: t("Cheltuit azi"), total: roundMoney(Math.max(0, share - spentToday)), kind: "minus" });
    }
    const last = waterfall[waterfall.length - 1]?.total ?? 0;
    // Plafonul: nu mai mult decât banii liberi din surse (sau venitul ciclului următor scos).
    if (brief.spendable < last - 0.009) waterfall.push({ label: t("Plafonat la banii liberi din surse"), total: brief.spendable, kind: "minus" });
    waterfall.push({ label: t("Poți folosi azi"), total: brief.spendable, kind: "result" });
  }
  const summary = !brief.hasPayday
    ? t("Fără data salariului nu putem calcula cifra zilei. Setează salariul în Plicuri.")
    : rhythm.hasWeekly
      ? t("Cifra zilei ({amount}) e cât poți cheltui azi din plicurile săptămânii. Banii fără plic nu o măresc.", { amount: lei(brief.spendable) })
      : t("Cifra zilei ({amount}): banii de la începutul zilei, după scadențe și rate, împărțiți pe zilele până la venit. Ce cheltui azi scade din ea; mâine restul se reîmparte. Nu e un sold bancar.", { amount: lei(brief.spendable) });
  return {
    spendable: brief.spendable,
    hasPayday: brief.hasPayday,
    remainingDays,
    paydayDate,
    liquidFunds: safe.liquidFunds,
    reservedRecurring: safe.reservedRecurring,
    availableAfterReserved: safe.available,
    envelopeLeft: safe.envelopeLeft,
    safeDaily: forecast.safeDaily,
    fromLiquidDaily,
    steps,
    waterfall,
    summary,
  };
};


const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type WeekDayVersus = {
  /** 0 = luni, aceeași ordine ca banda de zile. */
  weekday: number;
  thisSpent: number;
  lastSpent: number;
};

export type WeekVersusLast = {
  /** Zile scurse din săptămâna asta, inclusiv azi. Săptămâna trecută se taie la același număr. */
  days: number;
  thisSpent: number;
  lastSpent: number;
  /** Cheltuit acum minus aceleași zile din săptămâna trecută. Negativ = mai puțin. */
  delta: number;
  /** Aceeași fereastră, zi cu zi. Duminica dinaintea săptămânii nu intră. */
  byDay: WeekDayVersus[];
};

/**
 * Săptămâna asta față de aceleași zile din săptămâna trecută.
 * Miercuri nu se compară cu toată săptămâna de dinainte: ar părea că ați cheltuit „puțin”
 * doar pentru că săptămâna nu s-a terminat. Fără cheltuieli în fereastra trecută, tace.
 */
export const weekVersusLast = (data: AppData, asOf = isoToday()): WeekVersusLast | undefined => {
  const week = weeklySummary(data, asOf);
  const days = daysBetween(week.start, asOf) + 1;
  if (days < 1 || days > 7) return undefined;
  const lastStart = addIsoDays(week.start, -7);
  const lastEnd = addIsoDays(asOf, -7);
  const byDate = new Map<string, number>();
  for (const item of data.transactions) {
    if (item.kind !== "expense" || isBalanceAdjustment(item)) continue;
    if (item.date < lastStart || item.date > asOf) continue;
    byDate.set(item.date, (byDate.get(item.date) || 0) + item.amount);
  }
  const sum = (from: string, to: string) => {
    let total = 0;
    byDate.forEach((amount, date) => {
      if (date >= from && date <= to) total += amount;
    });
    return roundMoney(total);
  };
  const thisSpent = sum(week.start, asOf);
  const lastSpent = sum(lastStart, lastEnd);
  if (lastSpent < 1) return undefined;
  const byDay: WeekDayVersus[] = [];
  for (let index = 0; index < days; index += 1) {
    byDay.push({
      weekday: index,
      thisSpent: roundMoney(byDate.get(addIsoDays(week.start, index)) || 0),
      lastSpent: roundMoney(byDate.get(addIsoDays(lastStart, index)) || 0),
    });
  }
  return { days, thisSpent, lastSpent, delta: roundMoney(thisSpent - lastSpent), byDay };
};

export const weekVersusLastLine = (row: WeekVersusLast | undefined): string | undefined => {
  if (!row) return undefined;
  const amount = lei(Math.abs(row.delta));
  if (row.days === 1) {
    if (row.delta <= -20) return t("Cu {amount} mai puțin decât aceeași zi de săptămâna trecută.", { amount });
    if (row.delta >= 20) return t("Cu {amount} mai mult decât aceeași zi de săptămâna trecută.", { amount });
    return t("Cam la fel ca aceeași zi de săptămâna trecută.");
  }
  const days = String(row.days);
  if (row.delta <= -20) return t("Cu {amount} mai puțin decât aceleași {days} zile de săptămâna trecută.", { amount, days });
  if (row.delta >= 20) return t("Cu {amount} mai mult decât aceleași {days} zile de săptămâna trecută.", { amount, days });
  return t("Cam la fel ca aceleași {days} zile de săptămâna trecută.", { days });
};

/** Plicul care a luat din bani mai repede decât au trecut zilele ciclului. Facturile fixe nu intră. */
export const calendarPace = (data: AppData, asOf = isoToday()): EnvelopeBurnPace | undefined => {
  const behind = envelopeBurnPace(data, asOf).find((item) => item.pace === "behind" && item.budget >= 20 && item.spent >= 10 && item.totalDays >= 7);
  return behind;
};

export const calendarPaceLine = (pace: EnvelopeBurnPace | undefined): string | undefined =>
  pace ? t("{label} a luat {usage}% din plic, iar ciclul e la {expected}%.", { label: pace.label, usage: Math.round(pace.usage * 100), expected: Math.round(pace.expectedUsage * 100) }) : undefined;

/** Același plic s-a depășit și în ciclul închis înainte. Altfel nu e un obicei, e o întâmplare. */
export const repeatedOverLine = (data: AppData): string | undefined => {
  const names = data.settings.salaryPlan.cycleMemory?.[0]?.over || [];
  if (!names.length) return undefined;
  const again = data.settings.salaryPlan.allocations
    .filter((item) => names.includes(item.label) && allocationStatus(data, item).remaining < -1)
    .map((item) => item.label);
  if (!again.length) return undefined;
  return again.length === 1
    ? t("Și ciclul trecut s-a depășit {name}.", { name: again[0] })
    : t("Și ciclul trecut s-au depășit {names}.", { names: again.slice(0, 2).join(", ") });
};

export type EnvelopeMonth = { month: string; amount: number };

/**
 * Cât s-a cheltuit din plic în fiecare lună calendaristică, ultimele `count` luni (cea în curs
 * inclusă, ultima în listă). Media se face doar pe lunile întregi cu cheltuieli, ca o lună
 * abia începută sau una fără date să n-o strice.
 */
/**
 * Sumele pe lună ale tuturor plicurilor, într-o singură trecere prin registru (cu cache pe
 * registru): înainte, fiecare plic trecea de 6 ori prin tot registrul la fiecare randare a
 * Plicurilor, inclusiv la deschiderea foii „+ Plic”.
 */
const envelopeMonthTotals = (data: AppData, asOf: string, count: number) => tickMemo([data.transactions, data.settings.salaryPlan], `envMonths:${asOf}:${count}`, () => {
  const base = new Date(`${asOf}T12:00:00`);
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const date = new Date(base.getFullYear(), base.getMonth() - back, 1, 12);
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  const index = new Map(keys.map((key, position) => [key, position]));
  const plan = data.settings.salaryPlan;
  const totals = new Map<string, number[]>();
  for (const item of data.transactions) {
    if (item.kind !== "expense") continue;
    const position = index.get(item.date.slice(0, 7));
    if (position === undefined) continue;
    for (const allocation of plan.allocations) {
      if (!expenseBelongsTo(plan, item, allocation)) continue;
      const row = totals.get(allocation.id) || new Array(count).fill(0);
      row[position] += item.amount;
      totals.set(allocation.id, row);
    }
  }
  return { keys, totals };
});

export const envelopeMonthlyHistory = (data: AppData, allocation: BudgetAllocation, asOf = isoToday(), count = 6) => {
  const { keys, totals } = envelopeMonthTotals(data, asOf, count);
  const row = totals.get(allocation.id);
  const months: EnvelopeMonth[] = keys.map((key, position) => ({ month: key, amount: roundMoney(row ? row[position] : 0) }));
  const full = months.slice(0, -1).filter((item) => item.amount > 0);
  const average = full.length ? roundMoney(full.reduce((sum, item) => sum + item.amount, 0) / full.length) : undefined;
  // Fără nicio cheltuială în afară de luna în curs, istoricul n-are ce arăta.
  return { months: months.filter((item, index) => item.amount > 0 || index === months.length - 1 || months.slice(0, index).some((prev) => prev.amount > 0)), average, fullMonths: full.length };
};

export type WeeklyEnvelopeDayRhythm = {
  day: string;
  weekday: number;
  out: number;
  left: number;
  share: number;
  isToday: boolean;
  isFuture: boolean;
  over: boolean;
  fill: number;
};

export type WeeklyEnvelopeRhythm = {
  days: WeeklyEnvelopeDayRhythm[];
  remaining: number;
  remainingDays: number;
  todayLeft: number;
  todayShare: number;
  futureShare: number;
  hasWeekly: boolean;
  todayOut: number;
};

const weekdayIndex = (day: string) => (new Date(`${day}T12:00:00`).getDay() + 6) % 7;

const mondayOf = (asOf: string) => addIsoDays(asOf, -weekdayIndex(asOf));

export type DayStripRow = { isToday: boolean; isFuture: boolean; left: number; out: number };

/**
 * Aceeași cifră pe banda de zile și pe cardul mare.
 * Azi arată ce mai poți folosi; viitorul, reperul; trecutul, cheltuiala reală.
 */
export function dayStripFigure(row: DayStripRow, todaySpendable: number, heroTracksWeek: boolean): number {
  if (row.isToday) return heroTracksWeek ? todaySpendable : row.left;
  if (row.isFuture) return row.left;
  return row.out;
}

/** Fără rotunjire la leu: 250,50 rămâne 250,50, nu 251. */
export function stripLei(value: number, locale: string): string {
  const n = Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
  const whole = Math.abs(n - Math.round(n)) < 0.001;
  return n.toLocaleString(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/**
 * Cât mai ține fiecare zi din tranșa activă.
 *
 * Banda urmează exact cele șapte zile ale tranșei (de exemplu miercuri–marți),
 * nu săptămâna calendaristică luni–duminică. Restul se împarte pe zilele rămase
 * din aceeași tranșă, ca suma căsuțelor de azi și de mâine să fie plicul rămas.
 */
const weeklyEnvelopeDailyRhythmUncached = (data: AppData, asOf: string): WeeklyEnvelopeRhythm => {
  const plan = data.settings.salaryPlan;
  const weekly = plan.allocations.filter((item) => isWeeklyPaced(item, plan));
  const packs = weekly.map((allocation) => {
    const weeks = allocationWeeksStatus(data, allocation);
    const current = weeks.find((week) => asOf >= week.start && asOf <= week.end);
    return { weeks, current };
  });
  const active = packs.flatMap((pack) => pack.current ? [pack.current] : []);
  const remainingRaw = active.reduce((sum, week) => sum + week.remaining, 0);
  const trancheStart = active.length ? active.reduce((min, week) => week.start < min ? week.start : min, active[0].start) : "";
  const trancheEnd = active.length ? active.reduce((max, week) => week.end > max ? week.end : max, active[0].end) : "";
  const hasTranche = Boolean(trancheStart && trancheEnd);
  const gridStart = mondayOf(asOf);
  const windowStart = hasTranche ? trancheStart : gridStart;
  const windowEnd = hasTranche ? trancheEnd : addIsoDays(gridStart, 6);
  const inside = (day: string) => day >= windowStart && day <= windowEnd;
  const listed: string[] = [];
  // Toată săptămâna plicului, cu zilele trecute: o săptămână are 7 zile, chiar dacă a început ieri
  // (în ziua salariului). Înainte, banda arăta doar zilele rămase și săptămâna părea de 6 zile.
  const cursor = windowStart;
  const cursorEnd = hasTranche ? windowEnd : windowEnd;
  for (let day = cursor; day && day <= cursorEnd && listed.length < 14; day = addIsoDays(day, 1)) listed.push(day);
  const spentByDay = listed.map((day) => {
    const out = data.transactions.filter((item) => item.date === day && weekly.some((allocation) => expenseBelongsTo(data.settings.salaryPlan, item, allocation))).reduce((sum, item) => { const allocation = weekly.find((entry) => expenseBelongsTo(data.settings.salaryPlan, item, entry)); return sum + (allocation ? envelopeDayAmount(data, item, allocation) : item.amount); }, 0);
    return { day, out };
  });
  const todayIndex = Math.max(0, spentByDay.findIndex((item) => item.day === asOf));
  const calendarRemainingDays = 7 - todayIndex;
  const todayIsInside = inside(asOf);
  const remainingDays = todayIsInside ? daysBetween(asOf, windowEnd) + 1 : calendarRemainingDays;
  const todayOut = spentByDay[todayIndex]?.out ?? 0;
  const countedToday = todayIsInside ? todayOut : 0;
  const startOfToday = remainingRaw + countedToday;
  const todayShareRaw = remainingDays > 0 ? startOfToday / remainingDays : 0;
  const todayLeftRaw = Math.max(0, todayShareRaw - countedToday);
  const futureDays = Math.max(0, remainingDays - 1);
  const futureShareRaw = futureDays > 0 ? Math.max(0, remainingRaw - todayLeftRaw) / futureDays : 0;
  const trancheSpent = active.reduce((sum, week) => sum + week.spent, 0);
  const trancheDays = Math.max(1, daysBetween(windowStart, windowEnd) + 1);
  const pastShareRaw = hasTranche
    ? (remainingRaw + trancheSpent) / trancheDays
    : (remainingRaw + spentByDay.reduce((sum, item) => sum + item.out, 0)) / 7;
  const otherWeek = (day: string) => {
    let budget = 0;
    let remaining = 0;
    let days = 0;
    for (const pack of packs) {
      const week = pack.weeks.find((item) => day >= item.start && day <= item.end);
      if (!week) continue;
      budget += week.budget;
      remaining += week.remaining;
      days = week.days;
    }
    return { budget, remaining, days };
  };
  const days = spentByDay.map((row) => {
    const weekday = weekdayIndex(row.day);
    const isToday = row.day === asOf;
    const isFuture = row.day > asOf;
    let shareRaw: number;
    let leftRaw: number;
    if (hasTranche && !inside(row.day)) {
      const other = otherWeek(row.day);
      shareRaw = other.days > 0 ? (isFuture ? other.remaining : other.budget) / other.days : 0;
      leftRaw = isFuture ? shareRaw : Math.max(0, shareRaw - row.out);
    } else {
      shareRaw = isFuture ? futureShareRaw : isToday ? todayShareRaw : pastShareRaw;
      leftRaw = isFuture ? futureShareRaw : isToday ? todayLeftRaw : Math.max(0, pastShareRaw - row.out);
    }
    const over = !isFuture && shareRaw > 0 && row.out > shareRaw + 0.009;
    const fill = shareRaw <= 0
      ? (row.out > 0 ? 100 : 0)
      : isFuture
        ? (shareRaw > 0 ? 36 : 0)
        : Math.max(0, Math.min(100, (row.out / shareRaw) * 100));
    return { day: row.day, weekday, out: roundMoney(row.out), left: roundMoney(leftRaw), share: roundMoney(shareRaw), isToday, isFuture, over, fill };
  });
  return {
    days,
    remaining: roundMoney(Math.max(0, remainingRaw)),
    remainingDays,
    todayLeft: roundMoney(todayLeftRaw),
    todayShare: roundMoney(todayShareRaw),
    futureShare: roundMoney(futureShareRaw),
    hasWeekly: weekly.length > 0 && hasTranche,
    todayOut: roundMoney(todayOut),
  };
};

export type WeeklyCheckInEnvelope = {
  id: string;
  label: string;
  planned: number;
  spent: number;
  remaining: number;
  usage: number;
  state: "healthy" | "watch" | "over";
};

export type WeeklyCheckInMember = {
  memberId: string;
  name: string;
  expense: number;
  income: number;
  share: number;
};

export type WeeklyCheckIn = {
  start: string;
  end: string;
  income: number;
  expense: number;
  cashflow: number;
  transactionCount: number;
  categories: Array<[string, number]>;
  envelopes: WeeklyCheckInEnvelope[];
  members: WeeklyCheckInMember[];
  nextStep: string;
  tone: "good" | "watch" | "risk" | "empty";
  shouldPrompt: boolean;
  familyName: string;
};

const lei = (value: number) => `${Math.round(value).toLocaleString("ro-RO")} lei`;
/** Ca `lei`, dar cu bani când există: cifra pe zi trebuie să fie aceeași ca pe Astăzi (37,50). */
const leiCents = (value: number) => `${value.toLocaleString("ro-RO", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })} lei`;

/**
 * Bilanțul săptămânii de familie: luni–duminică, planificat vs realizat pe plic, fără scriere în AppData.
 */
export const weeklyCheckIn = (data: AppData, asOf = isoToday(), memberId?: string): WeeklyCheckIn => {
  const summary = weeklySummary(data, asOf, memberId);
  const plan = data.settings.salaryPlan;
  const end = planEndDate(plan);
  const planDays = end ? Math.max(1, daysBetween(plan.periodStart, end) + 1) : 7;
  const weekTx = data.transactions.filter((item) => !isBalanceAdjustment(item) && item.date >= summary.start && item.date <= summary.end && (!memberId || item.memberId === memberId));
  // Aceeași regulă ca avertizarea de pe Astăzi: o săptămână care merge prea repede e „atenție”, nu „în ritm”.
  const fastIds = new Set(weekTooFast(data, asOf).map((item) => item.allocationId));
  const envelopes = plan.allocations.map((allocation) => {
    const cycleBudget = allocationBudget(data, allocation);
    const weekStatus = isWeeklyPaced(allocation, plan) ? allocationWeekStatus(data, allocation, asOf) : undefined;
    const calendarSpent = roundMoney(weekTx.filter((item) => expenseBelongsTo(data.settings.salaryPlan, item, allocation)).reduce((sum, item) => sum + item.amount, 0));
    const planned = roundMoney(weekStatus ? weekStatus.budget : cycleBudget * Math.min(7, planDays) / planDays);
    // La plicurile cu ritm, cheltuiala din tranșă contează și dacă a căzut în săptămâna
    // calendaristică anterioară. Altfel restul arătat luni uită ce s-a cheltuit marțea trecută.
    const spent = roundMoney(weekStatus ? weekStatus.spent : calendarSpent);
    const remaining = roundMoney(weekStatus ? weekStatus.remaining : planned - spent);
    const usage = planned > 0 ? spent / planned : spent > 0 ? 1 : 0;
    const alertThreshold = Math.min(95, Math.max(50, allocation.alertThreshold ?? 80));
    if (!weekStatus) {
      // Plicul lunar (factură, rată sau „Distracție” fără ritm): se compară cu toată suma pe ciclu,
      // nu cu o „săptămână” din ea. Cinema de 90 dintr-un plic lunar de 300 nu e „peste plan”,
      // iar rata plătită luni nu e „1.094 lei peste plan”.
      const cycle = allocationStatus(data, allocation);
      return { id: allocation.id, label: allocation.label, planned: cycle.budget, spent: calendarSpent, remaining: cycle.remaining, usage: cycle.usage, state: cycle.remaining < 0 ? "over" as const : "healthy" as const };
    }
    const state = remaining < 0 || (planned <= 0 && spent > 0) ? "over" as const : usage >= alertThreshold / 100 || fastIds.has(allocation.id) ? "watch" as const : "healthy" as const;
    return { id: allocation.id, label: allocation.label, planned, spent, remaining, usage, state };
  }).sort((left, right) => (right.state === "over" ? 2 : right.state === "watch" ? 1 : 0) - (left.state === "over" ? 2 : left.state === "watch" ? 1 : 0) || right.spent - left.spent);

  const familyExpense = weekTx.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
  const members = data.settings.members.map((member) => {
    const entries = weekTx.filter((item) => item.memberId === member.id);
    const expense = entries.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
    const income = entries.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
    return { memberId: member.id, name: member.name, expense, income, share: familyExpense > 0 ? expense / familyExpense : 0 };
  }).sort((left, right) => right.expense - left.expense);

  const over = envelopes.filter((item) => item.state === "over");
  const watch = envelopes.filter((item) => item.state === "watch");
  const weekday = new Date(`${asOf}T12:00:00`).getDay();
  const weekend = weekday === 0 || weekday >= 5;
  const empty = summary.transactionCount === 0;
  /**
   * Cu plicuri, săptămâna se judecă după plicuri: salariul vine o dată pe lună, deci în trei
   * săptămâni din patru „cheltuieli peste venituri” e normal și nu spune nimic.
   */
  const byEnvelopes = data.settings.salaryPlan.allocations.length > 0;
  const cashflowRisk = !byEnvelopes && summary.cashflow < 0;
  const tone = empty ? "empty" as const : over.length || cashflowRisk ? "risk" as const : watch.length ? "watch" as const : "good" as const;
  const nextStep = empty
    ? t("Înregistrează mișcări ca să ai un bilanț de trimis familiei.")
    : over[0]
      ? t("Mută lei în {label} sau încetinește cheltuielile din acest plic ({amount} peste plan).", { label: over[0].label, amount: lei(Math.abs(over[0].remaining)) })
      : cashflowRisk && summary.income > 0
        ? t("Cheltuielile au trecut peste veniturile săptămânii. Amână o plată neesențială.")
        : watch[0]
          ? t("Urmărește {label}: s-a dus {percent}% din banii săptămânii.", { label: watch[0].label, percent: Math.round(watch[0].usage * 100) })
          : t("Săptămâna merge bine. Poți trimite bilanțul familiei.");

  return {
    start: summary.start,
    end: summary.end,
    income: summary.income,
    expense: summary.expense,
    cashflow: summary.cashflow,
    transactionCount: summary.transactionCount,
    categories: summary.categories,
    envelopes,
    members,
    nextStep,
    tone,
    shouldPrompt: weekend && !empty,
    familyName: data.settings.familyName || t("Familie"),
  };
};

/** Text de trimis pe WhatsApp sau copiat — fără poze, fără date de sync. */

/**
 * Propunerea concretă de reechilibrare a check-in-ului: din ce plic, în ce plic și cât.
 * „Mută lei în Alimente” este un sfat; „mută 120 lei din Timp liber în Alimente” este o
 * acțiune. Suma este limitată de ce a rămas efectiv în plicul donator, ca transferul să
 * fie acceptat de `transferBetweenEnvelopes` și să nu creeze un al doilea deficit.
 */
export type CheckInRebalance = {
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  amount: number;
  deficit: number;
  covers: boolean;
};

export const checkInRebalance = (data: AppData): CheckInRebalance | undefined => {
  const allocations = data.settings.salaryPlan.allocations || [];
  if (allocations.length < 2) return undefined;
  const status = allocations.map((allocation) => ({ allocation, ...allocationStatus(data, allocation) }));
  // Deficitul și donatorul se măsoară pe ciclu, nu pe săptămână: limitele plicurilor sunt ale ciclului.
  const short = status.filter((item) => item.remaining < -0.005).sort((left, right) => left.remaining - right.remaining)[0];
  if (!short) return undefined;
  // Chiria și ratele nu se golesc ca să acopere mâncarea. Dacă doar ele au rest, tăcem.
  const donor = status
    .filter((item) => item.allocation.id !== short.allocation.id && item.remaining > 0.005 && !isFixedEnvelope(data.settings.salaryPlan, item.allocation))
    .sort((left, right) => right.remaining - left.remaining)[0];
  if (!donor) return undefined;
  const deficit = roundMoney(Math.abs(short.remaining));
  const amount = roundMoney(Math.min(deficit, donor.remaining));
  if (amount <= 0) return undefined;
  return {
    fromId: donor.allocation.id,
    fromLabel: donor.allocation.label,
    toId: short.allocation.id,
    toLabel: short.allocation.label,
    amount,
    deficit,
    covers: amount >= deficit - 0.005,
  };
};


export type AnalysisCompareWindow = {
  mode: "calendar" | "cycle";
  start: string;
  end: string;
  priorStart: string;
  priorEnd: string;
  title: string;
};

/**
 * Fereastra de comparație pentru Analiză.
 * Calendar = luna civilă (implicit). Ciclu = periodStart → nextPayday,
 * comparat cu intervalul anterior de aceeași lungime — evită alarma falsă
 * „cheltuieli fără venit” între 1 și ziua de salariu.
 */
export function analysisCompareWindow(
  plan: Pick<SalaryPlan, "periodStart" | "nextPayday" | "earliestPayday" | "paydayFlexDays">,
  focusMonth: string,
  mode: "calendar" | "cycle",
): AnalysisCompareWindow {
  const cycleEnd = planEndDate(plan as SalaryPlan);
  if (mode === "cycle" && plan.periodStart && cycleEnd) {
    const start = plan.periodStart;
    const end = cycleEnd < start ? start : cycleEnd;
    const length = Math.max(1, Math.round((new Date(`${end}T12:00:00`).valueOf() - new Date(`${start}T12:00:00`).valueOf()) / 86_400_000) + 1);
    const priorEnd = addIsoDays(start, -1);
    const priorStart = addIsoDays(priorEnd, -(length - 1));
    return {
      mode: "cycle",
      start,
      end,
      priorStart,
      priorEnd,
      title: `${formatDate(start, { day: "2-digit", month: "short" })} – ${formatDate(end, { day: "2-digit", month: "short" })}`,
    };
  }
  const range = monthRange(focusMonth);
  const prior = monthRange(previousMonth(focusMonth));
  return {
    mode: "calendar",
    start: range.start,
    end: range.end,
    priorStart: prior.start,
    priorEnd: prior.end,
    title: monthTitle(focusMonth),
  };
}

export const weeklyDigestHeadline = (data: AppData, asOf = isoToday()) => {
  const check = weeklyCheckIn(data, asOf);
  const over = check.envelopes.filter((item) => item.state === "over");
  if (!check.transactionCount) {
    return { tone: "watch" as const, title: t("Săptămâna e încă goală în registru"), detail: check.nextStep };
  }
  if (over.length) {
    return {
      tone: "risk" as const,
      title: t("{count} plicuri peste plan săptămâna asta", { count: over.length }),
      detail: t("{label} cere atenție · {step}", { label: over[0].label, step: check.nextStep }),
    };
  }
  // Salariul vine o dată pe lună. În săptămânile fără el, „cheltuieli peste venit” nu spune nimic
  // dacă plicurile sunt în ritm.
  if (check.cashflow < 0 && data.settings.salaryPlan.allocations.length === 0) {
    return {
      tone: "watch" as const,
      title: t("Cheltuielile depășesc veniturile cu {amount}", { amount: lei(Math.abs(check.cashflow)) }),
      detail: check.nextStep,
    };
  }
  const top = check.categories[0];
  return {
    tone: "good" as const,
    title: top ? t("Cel mai mult: {category} ({amount})", { category: top[0], amount: lei(Number(top[1])) }) : t("Săptămâna merge bine"),
    detail: check.nextStep,
  };
};

/**
 * Rândurile de adăugat la bilanțul trimis familiei: câte zile mai sunt până la salariu,
 * ce plicuri merg prea repede săptămâna asta și ce transferuri mai sunt de făcut.
 */
export const familyWeekExtras = (data: AppData, asOf = isoToday()): string[] => {
  const lines: string[] = [];
  const until = untilPayday(data.settings.salaryPlan, asOf);
  if (until && until.days > 0) lines.push(t("Până la salariu: {days} (~{date}).", { days: daysLabel(until.days), date: formatDate(until.typical, { day: "numeric", month: "long" }) }));
  for (const item of weekTooFast(data, asOf).slice(0, 3)) {
    lines.push(item.over
      ? t("{label}: săptămâna e depășită cu {amount}.", { label: item.label, amount: lei(-item.remaining) })
      : item.daysLeft > 1
        ? t("{label}: {spent} din {budget}. Azi cel mult {today}, apoi cam {future} pe zi până la capătul săptămânii.", { label: item.label, spent: lei(item.spent), budget: lei(item.budget), today: leiCents(item.todayLeft), future: leiCents(item.futureShare) })
        : t("{label}: {spent} din {budget}; azi mai sunt {today}.", { label: item.label, spent: lei(item.spent), budget: lei(item.budget), today: leiCents(item.todayLeft) }));
  }
  const members = data.settings.members;
  for (const entry of members.length > 1 ? pendingTransfers(data, asOf) : []) {
    lines.push(t("De trimis: {amount} către {name} ({labels}).", { amount: lei(entry.amount), name: members.find((item) => item.id === entry.toMemberId)?.name || "", labels: entry.labels.join(", ") }));
  }
  return lines;
};

export const formatWeeklyCheckInShare = (check: WeeklyCheckIn, rebalance?: CheckInRebalance) => {
  const range = `${formatDate(check.start, { day: "2-digit", month: "short" })} – ${formatDate(check.end, { day: "2-digit", month: "short" })}`;
  const lines = [
    t("{family} · bilanț {range}", { family: check.familyName, range }),
    t("Venituri {amount}", { amount: lei(check.income) }),
    t("Cheltuieli {amount}", { amount: lei(check.expense) }),
    t("Diferență {sign}{amount}", { sign: check.cashflow >= 0 ? "+" : "−", amount: lei(Math.abs(check.cashflow)) }),
  ];
  if (check.members.length > 1 && check.expense > 0) {
    lines.push(check.members.filter((item) => item.expense > 0).map((item) => `${item.name} ${lei(item.expense)}`).join(" · "));
  }
  if (check.envelopes.some((item) => item.spent > 0 || item.planned > 0)) {
    lines.push("", t("Plicuri (planificat → cheltuit)"));
    check.envelopes.slice(0, 8).forEach((item) => {
      const mark = item.state === "over" ? t("peste") : item.state === "watch" ? t("atenție") : t("ok");
      lines.push(`${item.label}  ${lei(item.planned)} → ${lei(item.spent)}  (${mark})`);
    });
  }
  lines.push("", t("Următorul pas: {step}", { step: check.nextStep }));
  if (rebalance) {
    lines.push(t("Propunere: mută {amount} din {from} în {to}{partial}.", { amount: lei(rebalance.amount), from: rebalance.fromLabel, to: rebalance.toLabel, partial: rebalance.covers ? "" : t(" (acoperă parțial {deficit})", { deficit: lei(rebalance.deficit) }) }));
  }
  return lines.join("\n");
};



export type EnvelopeBurndown = {
  start: string;
  end: string;
  days: number;
  budget: number;
  /** Cât a rămas la sfârșitul fiecărei zile, de la început până azi. */
  actual: number[];
  /** Ziua (index) în care, la ritmul de până acum, plicul ajunge la zero; lipsă dacă ajunge. */
  runOutIndex?: number;
  todayIndex: number;
};

/**
 * Cum se golește plicul pe ciclu: linia ideală (de la limită la zero până la salariu), linia reală
 * (rămasul la finalul fiecărei zile) și unde duce ritmul de până acum. Aceleași mișcări ca plicul.
 */
export const envelopeBurndown = (data: AppData, allocation: BudgetAllocation, asOf = isoToday()): EnvelopeBurndown | undefined => {
  const plan = data.settings.salaryPlan;
  const start = plan.periodStart;
  const end = planCoverEndDate(plan);
  if (!start || !end || end < start) return undefined;
  const days = daysBetween(start, end) + 1;
  const budget = allocationBudget(data, allocation);
  if (budget <= 0 || days < 2) return undefined;
  const todayIndex = Math.max(0, Math.min(days - 1, daysBetween(start, asOf)));
  const spentByDay = new Array(days).fill(0) as number[];
  for (const item of data.transactions) {
    if (item.date < start || item.date > end || !expenseBelongsTo(plan, item, allocation)) continue;
    // Partea pentru toată luna se întinde pe zilele rămase: nu e ritmul de cheltuială, ca să nu prezică „se golește pe 24”.
    const spread = spreadPart(item);
    const from = daysBetween(start, item.date);
    spentByDay[from] += item.amount - spread;
    if (spread > 0) for (let index = from; index < days; index += 1) spentByDay[index] += spread / (days - from);
  }
  const actual: number[] = [];
  let left = budget;
  for (let index = 0; index <= todayIndex; index += 1) {
    left -= spentByDay[index];
    actual.push(roundMoney(left));
  }
  const spent = budget - left;
  const pace = spent / (todayIndex + 1);
  const runOutIndex = pace > 0 && left > 0 && todayIndex + left / pace < days - 1 ? Math.floor(todayIndex + left / pace) : left <= 0 ? todayIndex : undefined;
  return { start, end, days, budget: roundMoney(budget), actual, runOutIndex, todayIndex };
};

export type MonthVsAverageRow = { category: string; thisMonth: number; average: number; delta: number };

/**
 * Luna aceasta față de media ultimelor 3 luni întregi cu mișcări, pe categorii (cel mult 6).
 * Luna în curs se compară cu media scalată la zilele scurse, ca pe 10 ale lunii să nu pară „sub medie”.
 */
export const monthVsAverage = (data: AppData, asOf = isoToday()): { rows: MonthVsAverageRow[]; months: number; share: number } => {
  const month = asOf.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const share = Math.min(1, Number(asOf.slice(8, 10)) / daysInMonth);
  const previous = [1, 2, 3].map((back) => { const d = new Date(y, m - 1 - back, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const expenses = data.transactions.filter((item) => item.kind === "expense");
  const used = previous.filter((key) => expenses.some((item) => item.date.startsWith(key)));
  const byCategory = new Map<string, { now: number; past: number }>();
  for (const item of expenses) {
    const key = item.date.slice(0, 7);
    const isNow = key === month && item.date <= asOf;
    if (!isNow && !used.includes(key)) continue;
    const row = byCategory.get(item.category) || { now: 0, past: 0 };
    if (isNow) row.now += item.amount; else row.past += item.amount;
    byCategory.set(item.category, row);
  }
  if (!used.length) return { rows: [], months: 0, share };
  const rows = Array.from(byCategory.entries()).map(([category, value]) => {
    const average = roundMoney(value.past / used.length * share);
    return { category, thisMonth: roundMoney(value.now), average, delta: roundMoney(value.now - average) };
  }).filter((row) => row.thisMonth > 0 || row.average > 0)
    .sort((a, b) => Math.max(b.thisMonth, b.average) - Math.max(a.thisMonth, a.average))
    .slice(0, 6);
  return { rows, months: used.length, share };
};

/** Aceeași socoteală chemată de mai multe componente în aceeași randare se face o singură dată. */
export const envelopeRunOut = (data: AppData, asOf = isoToday()): EnvelopeRunOut[] => tickMemo([data], `envelopeRunOut:${asOf}`, () => envelopeRunOutUncached(data, asOf));

/**
 * Cât de mutat dintr-un plic liber ca cel care se golește înainte de salariu să ajungă.
 * Nu ia din chirie sau rate. Lasă 10 lei în plicul din care se mută, ca să nu apară o gaură nouă.
 */
export const extendRunOutMove = (data: AppData, allocationId: string, asOf = isoToday()): CheckInRebalance | undefined => {
  const run = envelopeRunOut(data, asOf).find((item) => item.allocationId === allocationId);
  const track = paydayTrack(data, asOf);
  if (!run || !track || track.remaining < 2) return undefined;
  const need = Math.round((run.dailyRate * track.remaining - run.remaining) * 100) / 100;
  if (need < 10) return undefined;
  const donor = data.settings.salaryPlan.allocations
    .map((allocation) => ({ allocation, ...allocationStatus(data, allocation) }))
    .filter((item) => item.allocation.id !== allocationId && item.remaining > 20 && !isFixedEnvelope(data.settings.salaryPlan, item.allocation))
    .sort((left, right) => right.remaining - left.remaining)[0];
  if (!donor) return undefined;
  const amount = Math.round(Math.min(need, donor.remaining - 10) * 100) / 100;
  if (amount < 10) return undefined;
  return {
    fromId: donor.allocation.id,
    fromLabel: donor.allocation.label,
    toId: allocationId,
    toLabel: run.label,
    amount,
    deficit: need,
    covers: amount >= need - 0.5,
  };
};

/** Aceeași socoteală chemată de mai multe componente în aceeași randare se face o singură dată. */
export const todayBrief = (data: AppData, asOf = isoToday()): TodayBrief => tickMemo([data], `todayBrief:${asOf}`, () => todayBriefUncached(data, asOf));

/** Aceeași socoteală chemată de mai multe componente în aceeași randare se face o singură dată. */
export const weeklyEnvelopeDailyRhythm = (data: AppData, asOf = isoToday()): WeeklyEnvelopeRhythm => tickMemo([data], `weeklyEnvelopeDailyRhythm:${asOf}`, () => weeklyEnvelopeDailyRhythmUncached(data, asOf));
