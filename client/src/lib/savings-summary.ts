/**
 * Rezumatul lunii pentru Acasă: economia reală (reducerile tipărite pe bonurile tale) și media pe
 * ultimele 3 luni încheiate. Doar din bonuri; nicio cifră estimată sau inventată.
 */
import type { AppData } from "./finance-data";

const round2 = (value: number) => Math.round(value * 100) / 100;
const monthOf = (iso: string) => iso.slice(0, 7);
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 15));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export type MonthSaved = { month: string; saved: number; receipts: number; lines: number };

/** Cât s-a scăzut de pe bonurile lunii (reduceri, promoții la casă). */
export function monthSaved(data: AppData, today: string): MonthSaved {
  const month = monthOf(today);
  let saved = 0, receipts = 0, lines = 0;
  for (const receipt of data.receipts) {
    if (monthOf(receipt.date) !== month || receipt.date > today) continue;
    let any = false;
    for (const line of receipt.lines || []) {
      if ((line.discount || 0) > 0) { saved += line.discount || 0; lines += 1; any = true; }
    }
    if (any) receipts += 1;
  }
  return { month, saved: round2(saved), receipts, lines };
}

/** Media lunară a bonurilor pe ultimele 3 luni încheiate care au bonuri; undefined dacă nu există niciuna. */
export function threeMonthAverage(data: AppData, today: string): { average: number; months: number } | undefined {
  const current = monthOf(today);
  const wanted = [1, 2, 3].map((n) => shiftMonth(current, -n));
  const totals = new Map<string, number>();
  for (const receipt of data.receipts) {
    const m = monthOf(receipt.date);
    if (wanted.includes(m) && receipt.amount > 0) totals.set(m, (totals.get(m) || 0) + receipt.amount);
  }
  if (!totals.size) return undefined;
  const sum = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  return { average: round2(sum / totals.size), months: totals.size };
}

export function savedShareText(saved: number, monthName: string, link: string): string {
  const amount = saved.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `În ${monthName} am economisit ${amount} lei din reducerile de pe bonuri, urmărite cu BonAI. ${link}`;
}
