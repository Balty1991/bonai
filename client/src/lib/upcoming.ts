/** „Ce urmează”: facturi, abonamente, rate și termene de retur/garanție, într-o singură listă cronologică. */
import type { AppData } from "./finance-data";
import { daysUntil, kindOf, nextDue } from "./house-costs";
import { debtNextDue, paidThisCycle } from "./debts-tracker";
import { liveWarranties } from "./warranties";

export type UpcomingKind = "bill" | "sub" | "debt" | "return" | "warranty";
export type UpcomingItem = { id: string; kind: UpcomingKind; name: string; date: string; days: number; amount?: number; estimate?: boolean };

/** Tot ce vine în următoarele `horizon` zile, cel mai apropiat primul. Ratele bifate deja în ciclul ăsta sar la luna următoare. */
export function upcoming(data: AppData, today: string, horizon = 30): UpcomingItem[] {
  const out: UpcomingItem[] = [];
  for (const item of data.recurring || []) {
    if (!item.active) continue;
    const date = nextDue(item, today);
    out.push({ id: `r:${item.id}`, kind: kindOf(item), name: item.name, date, days: daysUntil(date, today), amount: item.amount > 0 ? item.amount : undefined, estimate: item.variable || undefined });
  }
  for (const debt of data.debts || []) {
    if (!(debt.remaining > 0 || debt.openEnded) || !(debt.monthly > 0)) continue;
    let date = debtNextDue(debt, today);
    if (paidThisCycle(debt, today) && daysUntil(date, today) < 25) date = debtNextDue(debt, addDays(date, 1));
    out.push({ id: `d:${debt.id}`, kind: "debt", name: debt.name, date, days: daysUntil(date, today), amount: Math.min(debt.monthly, debt.openEnded ? debt.monthly : debt.remaining) });
  }
  for (const { warranty, status } of liveWarranties(data, today)) {
    if (status.returnUntil && (status.returnDaysLeft ?? -1) >= 0) out.push({ id: `w:${warranty.id}:r`, kind: "return", name: warranty.name, date: status.returnUntil, days: status.returnDaysLeft ?? 0 });
    if (status.until && (status.daysLeft ?? -1) >= 0) out.push({ id: `w:${warranty.id}:g`, kind: "warranty", name: warranty.name, date: status.until, days: status.daysLeft ?? 0 });
  }
  return out.filter((item) => item.days >= 0 && item.days <= horizon).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ro-RO"));
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}

/** Suma de plătit în orizont (fără termene de garanție, care nu costă nimic). */
export const upcomingTotal = (items: ReadonlyArray<UpcomingItem>) => Math.round(items.reduce((sum, item) => sum + (item.amount || 0), 0) * 100) / 100;
