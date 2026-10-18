/**
 * Cheltuiala fără bon (taxi, patiserie, cafea, parcare): o mișcare simplă, cu categorie, fără bon fals.
 * Apare în Toate costurile, Istoric și Statistici alături de bonuri.
 */
import { newId, type AppData, type Receipt, type Transaction } from "./finance-data";

export const QUICK_CATEGORIES: Array<{ id: string; icon: string }> = [
  { id: "Taxi", icon: "🚕" }, { id: "Transport", icon: "🚌" }, { id: "Patiserie", icon: "🥐" }, { id: "Cafea", icon: "☕" },
  { id: "Restaurant", icon: "🍽️" }, { id: "Fast-food", icon: "🍔" }, { id: "Parcare", icon: "🅿️" }, { id: "Combustibil", icon: "⛽" },
  { id: "Farmacie", icon: "💊" }, { id: "Piață", icon: "🥕" }, { id: "Bacșiș", icon: "🤝" }, { id: "Altele", icon: "🧾" },
];
export const quickIcon = (category: string) => QUICK_CATEGORIES.find((item) => item.id === category)?.icon || "🏷️";

export type QuickExpense = { amount: number; category: string; place?: string; note?: string; memberId?: string; date: string };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Suma scrisă cu virgulă sau punct: „25,5” → 25.5; nimic valid → 0. */
export function parseAmount(text: string): number {
  const clean = text.replace(/\s/g, "").replace(/lei|ron/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return 0;
  return round2(Number(clean));
}

export function quickExpenseTransaction(data: AppData, input: QuickExpense, now = new Date().toISOString()): Transaction {
  const member = data.settings.members.find((item) => item.id === input.memberId) || data.settings.members.find((item) => item.id === data.settings.selfMemberId) || data.settings.members[0];
  const source = data.settings.paymentSources.find((item) => item.memberId === member?.id) || data.settings.paymentSources[0];
  const place = input.place?.trim();
  return {
    id: newId("tx"), title: place || input.category, amount: round2(input.amount), kind: "expense", category: input.category,
    sourceId: source?.id, source: source?.name || "", memberId: member?.id, person: member?.name || "", date: input.date,
    allocationId: "outside", ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: now, updatedAt: now,
  };
}

/** Ce s-a notat recent fără bon: categoriile și „Taxi 25 lei” pentru repetare dintr-o atingere. */
export function quickSuggestions(data: AppData, limit = 4): { repeats: Array<{ category: string; place?: string; amount: number; count: number }>; categories: string[] } {
  const linked = new Set(data.receipts.flatMap((r) => [r.linkedTransactionId, ...(r.linkedTransactionIds || [])]).filter(Boolean) as string[]);
  const loose = data.transactions.filter((tx) => tx.kind === "expense" && !tx.receiptId && !linked.has(tx.id)).sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date)).slice(0, 80);
  const groups = new Map<string, { category: string; place?: string; amount: number; count: number; last: string }>();
  for (const tx of loose) {
    const place = tx.title && tx.title !== tx.category ? tx.title : undefined;
    const key = `${tx.category}|${place || ""}|${tx.amount}`;
    const g = groups.get(key);
    if (g) g.count += 1; else groups.set(key, { category: tx.category, place, amount: tx.amount, count: 1, last: tx.createdAt || tx.date });
  }
  const repeats = Array.from(groups.values()).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, limit).map(({ last: _l, ...rest }) => rest);
  const freq = new Map<string, number>();
  for (const tx of loose) freq.set(tx.category, (freq.get(tx.category) || 0) + 1);
  const categories = Array.from(freq).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return { repeats, categories };
}

/** Bonurile plus cheltuielile fără bon, în aceeași formă (pentru Istoric și Statistici). */
export function spendEntries(data: AppData): Receipt[] {
  const linked = new Set(data.receipts.flatMap((r) => [r.linkedTransactionId, ...(r.linkedTransactionIds || [])]).filter(Boolean) as string[]);
  const loose = data.transactions.filter((tx) => tx.kind === "expense" && !linked.has(tx.id) && !(tx.receiptId && data.receipts.some((r) => r.id === tx.receiptId)))
    .map((tx) => ({ id: tx.id, vendor: tx.title || tx.category, amount: tx.amount, category: tx.category, date: tx.date }) as Receipt);
  return [...data.receipts, ...loose];
}
