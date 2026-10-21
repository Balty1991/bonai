/**
 * Scadențarul: luna cu toate plățile ei — rate, credite, dobânzi și comisioane bancare, abonamente,
 * facturi — fiecare în ziua ei, cu ce e deja plătit și cât mai e. Totul din ce a notat omul.
 */
import { foldRomanian, type AppData } from "./finance-data";
import { kindOf, nextDue } from "./house-costs";
import { debtDueDay, isBankCost, isOpenCost } from "./debts-tracker";

export type CalendarKind = "debt" | "bank" | "sub" | "bill";
export type CalendarPayment = { id: string; kind: CalendarKind; name: string; date: string; amount: number; estimate?: boolean; paid: boolean; sourceId: string };
export type CalendarDay = { date: string; day: number; weekday: number; payments: CalendarPayment[]; total: number };
export type CalendarMonth = { month: string; days: CalendarDay[]; payments: CalendarPayment[]; total: number; paid: number; left: number; weeks: Array<{ from: string; to: string; total: number }>; busiest?: CalendarDay };

const r2 = (value: number) => Math.round(value * 100) / 100;
const pad = (value: number) => String(value).padStart(2, "0");
const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

export function shiftMonth(month: string, by: number): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function paymentCalendar(data: AppData, month: string): CalendarMonth {
  const first = `${month}-01`;
  const end = `${month}-${pad(lastDay(month))}`;
  const payments: CalendarPayment[] = [];
  const expenses = data.transactions.filter((tx) => tx.kind === "expense" && tx.date >= first && tx.date <= end);

  for (const item of data.recurring || []) {
    if (item.active === false) continue;
    const date = nextDue(item, first);
    if (date > end) continue;
    const name = foldRomanian(item.name);
    // Plătit: o cheltuială din luna aceea, din aceeași categorie, care poartă numele abonamentului sau al facturii.
    const paid = expenses.some((tx) => tx.category === item.category && name.length > 1 && foldRomanian(tx.title).includes(name));
    payments.push({ id: `r:${item.id}`, kind: kindOf(item), name: item.name, date, amount: r2(item.amount), estimate: item.variable || undefined, paid, sourceId: item.id });
  }

  for (const debt of data.debts || []) {
    if (!(debt.monthly > 0) || !(debt.remaining > 0 || isOpenCost(debt) || debt.lastPaid?.slice(0, 7) === month)) continue;
    if (debt.endDate && debt.endDate < first) continue;
    const date = `${month}-${pad(Math.min(debtDueDay(debt), lastDay(month)))}`;
    const paid = debt.lastPaid?.slice(0, 7) === month || expenses.some((tx) => tx.debtId === debt.id);
    const amount = isOpenCost(debt) ? debt.monthly : Math.min(debt.monthly, Math.max(debt.remaining, paid ? debt.monthly : 0));
    if (!(amount > 0)) continue;
    payments.push({ id: `d:${debt.id}`, kind: isBankCost(debt) ? "bank" : "debt", name: debt.creditor || debt.name, date, amount: r2(amount), paid, sourceId: debt.id });
  }

  payments.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  const days: CalendarDay[] = Array.from({ length: lastDay(month) }, (_, index) => {
    const date = `${month}-${pad(index + 1)}`;
    const list = payments.filter((item) => item.date === date);
    // 0 = luni … 6 = duminică, ca în calendarele românești.
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    return { date, day: index + 1, weekday, payments: list, total: r2(list.reduce((sum, item) => sum + item.amount, 0)) };
  });
  const weeks: CalendarMonth["weeks"] = [];
  for (const day of days) {
    if (!weeks.length || day.weekday === 0) weeks.push({ from: day.date, to: day.date, total: 0 });
    const week = weeks[weeks.length - 1];
    week.to = day.date; week.total = r2(week.total + day.total);
  }
  const total = r2(payments.reduce((sum, item) => sum + item.amount, 0));
  const paid = r2(payments.filter((item) => item.paid).reduce((sum, item) => sum + item.amount, 0));
  const busiest = [...days].sort((a, b) => b.total - a.total)[0];
  return { month, days, payments, total, paid, left: r2(total - paid), weeks, busiest: busiest && busiest.total > 0 ? busiest : undefined };
}
