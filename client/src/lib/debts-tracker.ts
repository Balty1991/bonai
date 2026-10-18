/** Datorii în BonAI: doar urmărire (cât mai ai de dat, rata lunară, scadența). Fără conturi sau surse. */
import type { Debt, DebtType } from "./finance-data";
import { nextDue } from "./house-costs";

export const DEBT_TYPES: Array<[DebtType, string]> = [
  ["imprumut", "Împrumut"], ["rata-banca", "Rată bancară"], ["rata-card-magazin", "Rată card de cumpărături"], ["dobanda-card", "Dobândă card de credit"], ["plata-rate", "Plată în rate"], ["altele", "Altă datorie"],
];
export const debtTypeLabel = (type?: DebtType) => DEBT_TYPES.find(([id]) => id === type)?.[1] || "Datorie";
const r2 = (v: number) => Math.round(v * 100) / 100;

export const debtDueDay = (debt: Debt) => debt.dueDay || Number((debt.dueDate || "").slice(8, 10)) || 1;
export const debtNextDue = (debt: Debt, today: string) => nextDue({ dueDay: debtDueDay(debt) }, today);

/** Cât s-a plătit din suma inițială (0–1). Fără sumă inițială nu se poate spune: undefined. */
export function debtProgress(debt: Debt): number | undefined {
  if (!(debt.initial && debt.initial > 0)) return undefined;
  return Math.min(1, Math.max(0, (debt.initial - debt.remaining) / debt.initial));
}

export function debtSummary(debts: ReadonlyArray<Debt>): { remaining: number; monthly: number; count: number } {
  const open = debts.filter((d) => d.remaining > 0 || d.openEnded);
  return { remaining: r2(open.reduce((s, d) => s + d.remaining, 0)), monthly: r2(open.reduce((s, d) => s + d.monthly, 0)), count: open.length };
}

/** „Marchează rata plătită”: scade rata din rest (nu sub zero). Dobânda de card fără final nu scade restul. */
export function markInstallmentPaid(debt: Debt, today: string, now = new Date().toISOString()): Debt {
  const remaining = debt.openEnded || debt.debtType === "dobanda-card" ? debt.remaining : r2(Math.max(0, debt.remaining - debt.monthly));
  return { ...debt, remaining, lastPaid: today, updatedAt: now };
}

/** Rata e bifată pentru scadența curentă (plătită în ultimele ~25 de zile). */
export function paidThisCycle(debt: Debt, today: string): boolean {
  if (!debt.lastPaid) return false;
  const diff = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${debt.lastPaid}T12:00:00Z`)) / 86_400_000;
  return diff >= 0 && diff < 25;
}
