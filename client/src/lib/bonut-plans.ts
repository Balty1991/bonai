/**
 * Planurile BonAI (docs/ARHITECTURA.md §9). Logică pură, fără Play: cine e GRATUIT, PRO sau FAMILIE,
 * câte scanări mai are luna asta și când pornește proba de 14 zile (după al 3-lea bon).
 * Plata reală rămâne în billing.ts, oprită cât BILLING_LIVE e false (produsele se creează în Play Console).
 */
export type BonutPlan = "free" | "pro" | "familie";
export type BonutFeature = "list" | "listShare" | "widget" | "barcode" | "monthSummary" | "scan" | "myInflation" | "savedWithApp" | "priceAlerts" | "optimizedCart" | "weeklyMenu" | "members" | "warranties" | "bills" | "subscriptions";

export const FREE_SCANS_PER_MONTH = 15;
export const TRIAL_DAYS = 14;
export const TRIAL_AFTER_RECEIPTS = 3;

export const BONUT_PRICES = {
  pro: { month: 9.99, year: 79.99 },
  familie: { month: 14.99, year: 119.99 },
} as const;

/** ID-urile de creat în Play Console (abonament + plan de bază lunar/anual). */
export const BONUT_SKUS = {
  pro: { productId: "bonut_pro", basePlans: { month: "lunar", year: "anual" } },
  familie: { productId: "bonut_familie", basePlans: { month: "lunar", year: "anual" } },
} as const;

const FREE_LIST: BonutFeature[] = ["list", "listShare", "widget", "barcode", "monthSummary", "scan"];
const FREE: ReadonlySet<BonutFeature> = new Set(FREE_LIST);
const PRO: ReadonlySet<BonutFeature> = new Set<BonutFeature>(FREE_LIST.concat(["myInflation", "savedWithApp", "priceAlerts", "optimizedCart", "weeklyMenu"]));

export function hasFeature(plan: BonutPlan, feature: BonutFeature): boolean {
  if (plan === "familie") return true;
  return (plan === "pro" ? PRO : FREE).has(feature);
}

const DAY = 86_400_000;

/** Ziua (ISO) în care a pornit proba: data celui de-al 3-lea bon, în ordine cronologică. */
export function trialStart(receiptDates: ReadonlyArray<string>): string | undefined {
  const sorted = receiptDates.filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10)).sort();
  return sorted.length >= TRIAL_AFTER_RECEIPTS ? sorted[TRIAL_AFTER_RECEIPTS - 1] : undefined;
}

export function trialDaysLeft(receiptDates: ReadonlyArray<string>, today: string): number {
  const start = trialStart(receiptDates);
  if (!start) return 0;
  const elapsed = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY);
  return Math.max(0, TRIAL_DAYS - elapsed);
}

/** Planul efectiv: abonamentul plătit câștigă; altfel proba dă PRO; altfel GRATUIT. */
export function effectivePlan(paid: BonutPlan | undefined, receiptDates: ReadonlyArray<string>, today: string): BonutPlan {
  if (paid && paid !== "free") return paid;
  return trialDaysLeft(receiptDates, today) > 0 ? "pro" : "free";
}

/** Câte scanări mai are planul gratuit în luna lui `today`. Infinity pentru PRO/FAMILIE. */
export function scansLeft(plan: BonutPlan, scanDates: ReadonlyArray<string>, today: string): number {
  if (plan !== "free") return Number.POSITIVE_INFINITY;
  const month = today.slice(0, 7);
  const used = scanDates.filter((d) => d.slice(0, 7) === month).length;
  return Math.max(0, FREE_SCANS_PER_MONTH - used);
}

/** Cât economisește anualul față de 12 luni, în procente întregi. */
export function yearlySavingPercent(plan: Exclude<BonutPlan, "free">): number {
  const { month, year } = BONUT_PRICES[plan];
  return Math.round((1 - year / (month * 12)) * 100);
}

/** Scanările AI făcute pe acest telefon (date AAAA-LL-ZZ). Cele offline nu se numără. */
export const AI_SCANS_KEY = "bonai:ai-scans-v1";
export function readAiScans(storage: Pick<Storage, "getItem"> = window.localStorage): string[] {
  try { const list = JSON.parse(storage.getItem(AI_SCANS_KEY) || "[]"); return Array.isArray(list) ? list.filter((d): d is string => typeof d === "string") : []; } catch { return []; }
}
export function recordAiScan(today: string, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage) {
  const list = [...readAiScans(storage).filter((d) => d.slice(0, 7) >= today.slice(0, 7)), today];
  try { storage.setItem(AI_SCANS_KEY, JSON.stringify(list)); } catch { /* fără stocare */ }
}

/** Ce a răspuns serverul despre cota de scanări AI (sursa de adevăr; telefonul doar o arată). */
export type ServerAiQuota = { plan: "free" | "trial" | "paid"; used: number; limit: number; remaining: number | null; month: string; trialEndsAt?: string; enforced: boolean };
export const AI_QUOTA_KEY = "bonai:ai-quota-v1";

/** Aliniază numărătoarea locală la cea de pe server: luna serverului câștigă, ca să nu se poată ocoli ștergând datele. */
export function syncAiQuota(quota: ServerAiQuota, storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage) {
  try {
    storage.setItem(AI_QUOTA_KEY, JSON.stringify({ ...quota, at: Date.now() }));
    const other = readAiScans(storage).filter((d) => !d.startsWith(quota.month));
    const used = Math.max(0, Math.min(1000, quota.used));
    storage.setItem(AI_SCANS_KEY, JSON.stringify([...other, ...Array.from({ length: used }, () => `${quota.month}-01`)]));
  } catch { /* fără stocare: rămâne ce știe serverul */ }
}

export function readAiQuota(storage: Pick<Storage, "getItem"> = window.localStorage): (ServerAiQuota & { at: number }) | undefined {
  try { const v = JSON.parse(storage.getItem(AI_QUOTA_KEY) || "null"); return v && typeof v.used === "number" ? v : undefined; } catch { return undefined; }
}
