/**
 * Datoriile BonAI pentru planul de ieșire: dobânda scrisă de om sau, dacă lipsește, dedusă din rest,
 * rată și ultima rată (la creditele bancare restul e principalul, ratele îl acoperă cu dobânda).
 * Dobânda de card, overdraftul și comisioanele nu intră: se plătesc lunar, nu se sting cu rate.
 * Ratele de la magazine (eMAG, Altex) sunt de obicei fără dobândă: acolo nu se deduce nimic.
 */
import type { Debt } from "./finance-data";
import { amortize, payoffPlan, recommendedStrategy, type PayoffStrategy } from "./debt-plan";
import { isBankCost } from "./debts-tracker";

const r2 = (value: number) => Math.round(value * 100) / 100;

/** Rate rămase până la `endDate` (inclusiv luna ei). */
export function paymentsUntil(today: string, endDate: string): number {
  const [fy, fm, fd] = today.split("-").map(Number);
  const [ty, tm, td] = endDate.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm) + (td >= fd ? 1 : 0));
}

/** Dobânda anuală (%) pentru care `payments` rate de `monthly` sting `balance`; 0 dacă ratele nu au dobândă. */
export function impliedAnnualRate(balance: number, monthly: number, payments: number): number {
  if (!(balance > 0 && monthly > 0 && payments > 0) || monthly * payments <= balance * 1.02) return 0;
  let low = 0, high = 0.2;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const value = (monthly * (1 - Math.pow(1 + mid, -payments))) / mid;
    if (value > balance) low = mid; else high = mid;
  }
  return Math.round(((low + high) / 2) * 1200 * 100) / 100;
}

/** Doar creditele bancare și împrumuturile lungi au dobândă de dedus; ratele la produse, nu. */
const mayHaveInterest = (debt: Debt) => debt.debtType ? debt.debtType === "rata-banca" || debt.debtType === "imprumut" : debt.kind === "credit" || debt.kind === "ifn";

/** Dobânda estimată (%/an) din rest, rată și ultima rată; 0 când nu se poate spune cu încredere. */
export function estimatedRate(debt: Pick<Debt, "remaining" | "monthly" | "endDate" | "debtType" | "kind">, today: string): number {
  if (!mayHaveInterest(debt as Debt) || !debt.endDate || debt.endDate <= today) return 0;
  const left = paymentsUntil(today, debt.endDate);
  if (left < 12) return 0;
  const rate = impliedAnnualRate(debt.remaining, debt.monthly, left);
  return rate > 0 && rate <= 40 ? rate : 0;
}

export type PlannedDebt = Debt & { rateGuessed: boolean; payments: number | null; totalToPay: number; interest: number };

export function plannedDebts(debts: ReadonlyArray<Debt>, today: string): PlannedDebt[] {
  return debts.filter((debt) => debt.remaining > 0 && debt.monthly > 0 && !isBankCost(debt)).map((debt) => {
    const guessed = debt.annualRate && debt.annualRate > 0 ? 0 : estimatedRate(debt, today);
    const annualRate = debt.annualRate && debt.annualRate > 0 ? debt.annualRate : guessed || undefined;
    const plan = amortize(debt.remaining, annualRate, debt.monthly);
    const totalToPay = r2(debt.remaining + plan.totalInterest);
    return { ...debt, annualRate, rateGuessed: guessed > 0, payments: plan.months, totalToPay, interest: r2(plan.totalInterest) };
  });
}

export type DebtFreePlan = {
  debts: PlannedDebt[];
  remaining: number; monthly: number; totalToPay: number; interest: number;
  strategy: PayoffStrategy;
  /** Fără nicio schimbare: fiecare datorie cu rata ei, până la capăt. */
  asIs: { months: number | null; totals: number[] };
  /** Rata unei datorii stinse trece la următoarea (aceiași bani pe lună). */
  months: number | null; totals: number[]; closedAt: Record<string, number>; totalInterest: number;
  /** Cu `extra` lei în plus pe lună. */
  faster?: { extra: number; months: number | null; totals: number[]; totalInterest: number; monthsSaved: number; interestSaved: number };
};

export function debtFreePlan(debts: ReadonlyArray<Debt>, today: string, extra = 0, strategy?: PayoffStrategy): DebtFreePlan | undefined {
  const list = plannedDebts(debts, today);
  if (!list.length) return undefined;
  const chosen = strategy || recommendedStrategy(list);
  const base = payoffPlan(list, 0, chosen);
  const own = list.map((debt) => amortize(debt.remaining, debt.annualRate, debt.monthly));
  const ownMonths = own.some((item) => item.months === null) ? null : Math.max(0, ...own.map((item) => item.months || 0));
  const ownTotals = Array.from({ length: (ownMonths ?? 0) + 1 }, (_, month) => r2(list.reduce((sum, debt, index) => sum + (month === 0 ? debt.remaining : own[index].rows[month - 1]?.balanceAfter ?? 0), 0)));
  const plan: DebtFreePlan = {
    debts: list,
    remaining: r2(list.reduce((sum, debt) => sum + debt.remaining, 0)),
    monthly: r2(list.reduce((sum, debt) => sum + debt.monthly, 0)),
    totalToPay: r2(list.reduce((sum, debt) => sum + debt.totalToPay, 0)),
    interest: r2(list.reduce((sum, debt) => sum + debt.interest, 0)),
    strategy: chosen, asIs: { months: ownMonths, totals: ownTotals }, months: base.months, totals: base.totals, closedAt: base.closedAt, totalInterest: base.totalInterest,
  };
  if (extra > 0) {
    const faster = payoffPlan(list, extra, chosen);
    plan.faster = {
      extra, months: faster.months, totals: faster.totals, totalInterest: faster.totalInterest,
      monthsSaved: base.months !== null && faster.months !== null ? Math.max(0, base.months - faster.months) : 0,
      interestSaved: r2(Math.max(0, base.totalInterest - faster.totalInterest)),
    };
  }
  return plan;
}
