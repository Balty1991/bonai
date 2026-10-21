/** Planul BonAI al telefonului. Cât timp plata e oprită (BILLING_LIVE=false), totul rămâne deschis. */
import type { AppData } from "./finance-data";
import { BILLING_LIVE } from "./entitlements";
import { activePaidPlan } from "./billing-store";
import { effectivePlan, readAiQuota, readAiScans, scansLeft, type BonutPlan } from "./bonut-plans";

export function currentBonutPlan(data: AppData, today: string, billingLive = BILLING_LIVE, paid: BonutPlan | undefined = activePaidPlan()): BonutPlan {
  if (!billingLive) return "familie";
  return effectivePlan(paid, data.receipts.map((r) => r.date), today);
}

/**
 * Câte scanări AI mai are telefonul luna asta (Infinity cu PRO/FAMILIE sau cu plata oprită).
 * Serverul ține cota; telefonul o arată pe cea primită luna asta, altfel o estimează.
 */
export function aiScansLeft(data: AppData, today: string): number {
  const server = readAiQuota();
  return server?.enforced && server.month === today.slice(0, 7)
    ? server.remaining ?? Number.POSITIVE_INFINITY
    : scansLeft(currentBonutPlan(data, today), readAiScans(), today);
}
