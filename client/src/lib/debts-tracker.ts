/** Datorii în BonAI: doar urmărire (cât mai ai de dat, rata lunară, scadența). Fără conturi sau surse. */
import type { AppData, Debt, DebtType, Transaction } from "./finance-data";
import { quickExpenseTransaction } from "./quick-expense";
import { nextDue } from "./house-costs";

export const DEBT_TYPES: Array<[DebtType, string]> = [
  ["imprumut", "Împrumut"], ["rata-banca", "Rată bancară"], ["rata-card-magazin", "Rată card de cumpărături"], ["dobanda-card", "Dobândă card / overdraft"], ["comision-bancar", "Comision bancar (card, cont)"], ["plata-rate", "Plată în rate"], ["altele", "Altă datorie"],
];
export const debtTypeLabel = (type?: DebtType) => DEBT_TYPES.find(([id]) => id === type)?.[1] || "Datorie";
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Dobânda de card/overdraft și comisioanele: se plătesc lunar, fără final, iar plata nu scade restul. */
export const isOpenCost = (debt: Debt) => Boolean(debt.openEnded || debt.debtType === "dobanda-card" || debt.debtType === "comision-bancar");
const BANK_COST_NAME = /dob[aâ]nd|overdraft|comision|tax[aă] (card|cont)|administrare/i;
/** Costurile băncii: tipurile de mai sus sau, la datoriile vechi fără tip, după nume („Dobânda Overdraft Angi”). */
export const isBankCost = (debt: Debt) => isOpenCost(debt) || (!debt.debtType && BANK_COST_NAME.test(debt.name));

/** Dobânzi și comisioane bancare: lista, cât costă pe lună și pe un an. */
export function bankCosts(debts: ReadonlyArray<Debt>): { items: Debt[]; monthly: number; yearly: number } {
  const items = debts.filter((debt) => isBankCost(debt) && debt.monthly > 0 && (debt.remaining > 0 || isOpenCost(debt)));
  const monthly = r2(items.reduce((sum, debt) => sum + debt.monthly, 0));
  return { items, monthly, yearly: r2(monthly * 12) };
}

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
  const remaining = isOpenCost(debt) ? debt.remaining : r2(Math.max(0, debt.remaining - debt.monthly));
  return { ...debt, remaining, lastPaid: today, updatedAt: now };
}

/** Rata e bifată pentru scadența curentă (plătită în ultimele ~25 de zile). */
export function paidThisCycle(debt: Debt, today: string, data?: Pick<AppData, "transactions">): boolean {
  const last = lastPaidOn(debt, data);
  if (!last) return false;
  const diff = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${last}T12:00:00Z`)) / 86_400_000;
  return diff >= 0 && diff < 25;
}

/** Ultima plată: bifa din BonAI sau, la datoriile vechi, plata notată legată de datorie. */
export function lastPaidOn(debt: Debt, data?: Pick<AppData, "transactions">): string | undefined {
  let last = debt.lastPaid;
  for (const tx of data?.transactions || []) if (tx.debtId === debt.id && tx.kind === "expense" && (!last || tx.date > last)) last = tx.date;
  return last;
}

/**
 * Bifa „Rata plătită”: scade restul (nu la dobânda de card, care e lunară, fără final) și notează
 * plata ca cheltuială legată de datorie, ca să apară în Rapoarte la plățile fixe și în Toate
 * costurile, nu la cumpărături.
 */
export function payInstallment(data: AppData, debtId: string, today: string, now = new Date().toISOString()): AppData {
  const debt = data.debts.find((item) => item.id === debtId);
  if (!debt || !(debt.monthly > 0) || paidThisCycle(debt, today, data)) return data;
  const open = isOpenCost(debt);
  const amount = open ? debt.monthly : r2(Math.min(debt.monthly, debt.remaining));
  if (!(amount > 0)) return data;
  const name = debt.creditor || debt.name;
  const bank = isBankCost(debt);
  const label = debt.debtType === "comision-bancar" ? "Comision" : open || bank ? "Dobândă" : "Rată";
  const base = quickExpenseTransaction(data, { amount, category: bank ? "Comisioane bancare" : "Rate produse", place: `${label} — ${name}`, date: today, memberId: debt.memberId }, now);
  const tx: Transaction = { ...base, debtId: debt.id, debtRemainingAfter: open ? debt.remaining : r2(debt.remaining - amount) };
  return { ...data, transactions: [...data.transactions, tx], debts: data.debts.map((item) => (item.id === debt.id ? { ...markInstallmentPaid(item, today, now), remaining: open ? item.remaining : r2(Math.max(0, item.remaining - amount)) } : item)) };
}

/** Plata bifată în ciclul acesta (cea mai nouă), dacă a fost notată. */
export function installmentPayment(data: AppData, debt: Debt): Transaction | undefined {
  if (!debt.lastPaid) return undefined;
  return data.transactions.filter((tx) => tx.debtId === debt.id && tx.kind === "expense" && tx.date >= debt.lastPaid!).sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date))[0];
}

/** „Anulează bifa”: scoate plata notată și pune restul la loc. */
export function undoInstallment(data: AppData, debtId: string, now = new Date().toISOString()): AppData {
  const debt = data.debts.find((item) => item.id === debtId);
  if (!debt?.lastPaid) return data;
  const open = isOpenCost(debt);
  const tx = installmentPayment(data, debt);
  const back = open ? 0 : tx ? tx.amount : debt.monthly;
  const restored: Debt = { ...debt, remaining: r2(debt.remaining + back), lastPaid: undefined, updatedAt: now };
  return {
    ...data,
    transactions: tx ? data.transactions.filter((item) => item.id !== tx.id) : data.transactions,
    deleted: tx ? [...data.deleted, { entity: "transactions" as const, id: tx.id, deletedAt: now }] : data.deleted,
    debts: data.debts.map((item) => (item.id === debt.id ? restored : item)),
  };
}

/** Câte rate mai sunt și luna ultimei rate, la rata de acum (fără dobândă). */
export function debtOutlook(debt: Debt, today: string): { payments: number; lastMonth: string } | undefined {
  if (isOpenCost(debt) || !(debt.monthly > 0) || !(debt.remaining > 0.005)) return undefined;
  const payments = Math.ceil(debt.remaining / debt.monthly - 0.001);
  const first = nextDue({ dueDay: debtDueDay(debt) }, today);
  const d = new Date(`${first}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + payments - 1);
  return { payments, lastMonth: d.toISOString().slice(0, 7) };
}

/** Cât s-a plătit deja pe o datorie, din plățile notate. */
export const paidSoFar = (data: AppData, debtId: string) => r2(data.transactions.filter((tx) => tx.debtId === debtId && tx.kind === "expense").reduce((sum, tx) => sum + tx.amount, 0));
