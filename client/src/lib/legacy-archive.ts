/**
 * Arhiva veche (doar citire): tot ce ținea de buget — plicuri, conturi și solduri, venituri,
 * transferuri, datorii, obiective de economii, bani de buzunar — extras ca fișier, fără să atingă datele.
 * Retransformarea în BonAI nu șterge nimic; arhiva e copia pe care omul o poate păstra oricând.
 */
import type { AppData } from "./finance-data";

export type LegacyArchive = {
  kind: "bonut-legacy-archive";
  version: 1;
  exportedAt: string;
  transactionsIncome: AppData["transactions"];
  transactionsTransfer: AppData["transactions"];
  debts: AppData["debts"];
  savings: AppData["savings"];
  recurring: AppData["recurring"];
  settings: Partial<AppData["settings"]>;
};

const LEGACY_SETTING_KEYS = ["salaryPlan", "paymentSources", "pocketMoney", "budgets", "categoryBudgets"] as const;

export function buildLegacyArchive(data: AppData, now = new Date()): LegacyArchive {
  const settings: Record<string, unknown> = {};
  for (const key of LEGACY_SETTING_KEYS) {
    const value = (data.settings as unknown as Record<string, unknown>)[key];
    if (value !== undefined) settings[key] = structuredClone(value);
  }
  return {
    kind: "bonut-legacy-archive",
    version: 1,
    exportedAt: now.toISOString(),
    transactionsIncome: structuredClone(data.transactions.filter((tx) => tx.kind === "income")),
    transactionsTransfer: structuredClone(data.transactions.filter((tx) => Boolean((tx as { transferId?: string }).transferId))),
    debts: structuredClone(data.debts),
    savings: structuredClone(data.savings),
    recurring: structuredClone(data.recurring),
    settings: settings as Partial<AppData["settings"]>,
  };
}

export function hasLegacyData(data: AppData): boolean {
  const a = buildLegacyArchive(data);
  const plan = (data.settings as { salaryPlan?: { allocations?: unknown[] } }).salaryPlan;
  return a.transactionsIncome.length + a.transactionsTransfer.length + a.debts.length + a.savings.length > 0
    || (plan?.allocations?.length || 0) > 0
    || data.settings.paymentSources.some((s) => (s.openingBalance || 0) !== 0);
}
