/** Planul BonAI al telefonului. Cât timp plata e oprită (BILLING_LIVE=false), totul rămâne deschis. */
import type { AppData } from "./finance-data";
import { BILLING_LIVE } from "./entitlements";
import { hasActiveFamilie } from "./billing-store";
import { effectivePlan, type BonutPlan } from "./bonut-plans";

export function currentBonutPlan(data: AppData, today: string, billingLive = BILLING_LIVE, paid: BonutPlan | undefined = hasActiveFamilie() ? "familie" : undefined): BonutPlan {
  if (!billingLive) return "familie";
  return effectivePlan(paid, data.receipts.map((r) => r.date), today);
}
