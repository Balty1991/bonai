/** Abonamente și facturi: doar le urmărim (cât, când), nu mutăm bani și nu scriem în vreun registru. */
import type { RecurringPayment } from "./finance-data";

export type CostKind = "sub" | "bill";
export const SUB_CATEGORY = "Abonamente";
export const BILL_CATEGORY = "Casă & facturi";

export const kindOf = (item: Pick<RecurringPayment, "category" | "variable">): CostKind => (item.category === SUB_CATEGORY ? "sub" : "bill");

const at = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const clampDay = (y: number, m: number, day: number) => Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());

/** Următoarea scadență de azi încolo (lunar, trimestrial după luna dată, anual în luna dată). */
export function nextDue(item: Pick<RecurringPayment, "dueDay" | "frequency" | "month">, today: string): string {
  const t = at(today);
  const step = item.frequency === "yearly" ? 12 : item.frequency === "quarterly" ? 3 : 1;
  const anchor = (item.month || t.getUTCMonth() + 1) - 1;
  for (let k = -12; k < 24; k++) {
    const total = t.getUTCFullYear() * 12 + t.getUTCMonth() + k;
    const m = ((total % 12) + 12) % 12;
    if (step > 1 && ((m - anchor) % step + step) % step !== 0) continue;
    const y = Math.floor(total / 12);
    const d = iso(new Date(Date.UTC(y, m, clampDay(y, m, item.dueDay), 12)));
    if (d >= today) return d;
  }
  return today;
}

/** Cât vine pe lună, în medie (anual / 12, trimestrial / 3). Facturile care variază intră cu estimarea, dacă există. */
export function monthlyTotal(items: ReadonlyArray<RecurringPayment>): number {
  const sum = items.filter((i) => i.active !== false).reduce((s, i) => s + i.amount / (i.frequency === "yearly" ? 12 : i.frequency === "quarterly" ? 3 : 1), 0);
  return Math.round(sum * 100) / 100;
}

export const daysUntil = (date: string, today: string) => Math.round((at(date).getTime() - at(today).getTime()) / 86_400_000);

/**
 * Migrarea în BonAI: plățile recurente care se adăugau singure în registru devin doar urmărite.
 * Nimic nu se șterge (suma, sursa veche, membrul, nota rămân), doar „adaugă automat” se oprește,
 * iar în loc primești o amintire cu 2 zile înainte, dacă nu aveai deja una.
 */
export function migrateRecurringToTracking<T extends { recurring: RecurringPayment[] }>(data: T, now = new Date().toISOString()): T {
  if (!data.recurring.some((item) => item.autoPost)) return data;
  return { ...data, recurring: data.recurring.map((item) => (item.autoPost ? { ...item, autoPost: false, remindDays: item.remindDays || 2, updatedAt: now } : item)) };
}
