/**
 * „Săptămâna asta mai am 400, apoi 600 pe săptămână.” Alin a vrut asta pe plicul de alimente și
 * aplicația nu avea cum: suma plicului se împarte singură pe zile, iar mutarea între săptămâni
 * cere socoteli de mână.
 *
 * Aici omul spune cele două cifre, iar plicul se reface: săptămânile încheiate rămân cu cât s-a
 * cheltuit în ele, săptămâna curentă primește cât s-a cheltuit plus cât vrea să mai aibă, iar
 * cele următoare suma pe săptămână (cea scurtă, de dinaintea salariului, pe zile). Totalul plicului
 * devine suma lor; diferența se ia din nerepartizat (sau se eliberează). Împărțirea pe săptămâni
 * se face prin aceleași transferuri dintre săptămâni ca la „Mută între săptămâni”, deci se vede
 * și se poate desface.
 */
import { calendarBudget } from "./calendar-budget";
import { allocationBudget, allocationWeeksStatus, isoToday, money2, newId, planEndDate, type AppData, type BudgetAllocation, type WeekTransfer } from "./finance-data";

export type WeekRetune = { data: AppData; total: number; before: number; fromFree: number; targets: number[] };

/**
 * Partea care primește diferența: cea mai mare care nu e card de bonuri (bonurile au suma lor
 * fixă). Fără una, restul plicului vine deja din sursa lui principală și părțile rămân cum sunt.
 */
const flexibleFunding = (data: AppData, allocation: BudgetAllocation) => {
  const kindOf = (id: string) => data.settings.paymentSources.find((source) => source.id === id)?.kind;
  return [...(allocation.funding || [])].filter((part) => kindOf(part.sourceId) !== "meal" && kindOf(part.sourceId) !== "voucher").sort((a, b) => b.amount - a.amount)[0];
};

export function retuneWeeks(data: AppData, allocationId: string, thisWeekLeft: number, perWeek: number, today = isoToday()): WeekRetune | undefined {
  const plan = data.settings.salaryPlan;
  const allocation = plan.allocations.find((item) => item.id === allocationId);
  const end = planEndDate(plan);
  if (!allocation || !end || !(perWeek > 0) || !(thisWeekLeft >= 0)) return undefined;
  const weeks = allocationWeeksStatus(data, allocation);
  const current = weeks.findIndex((week) => today >= week.start && today <= week.end);
  if (weeks.length < 2 || current < 0) return undefined;
  const targets = weeks.map((week, index) => money2(index < current ? week.spent : index === current ? week.spent + thisWeekLeft : Math.round(perWeek * week.plannedDays / 7)));
  const total = money2(targets.reduce((sum, value) => sum + value, 0));
  const before = allocationBudget(data, allocation);
  const diff = money2(total - before);
  const amount = money2(allocation.amount + diff);
  if (amount < 0) return undefined;
  let funding = allocation.funding;
  if (funding?.length) {
    const part = flexibleFunding(data, allocation);
    if (part) {
      if (part.amount + diff < 0) return undefined;
      funding = funding.map((item) => item === part ? { ...item, amount: money2(item.amount + diff) } : item);
    } else if (funding.reduce((sum, item) => sum + item.amount, 0) > amount + 0.004) return undefined;
  }
  const now = new Date().toISOString();
  const next: BudgetAllocation = { ...allocation, amount, weeklyAmount: perWeek, weeklyPace: true, ...(funding ? { funding } : {}), updatedAt: now };
  // Aceeași împărțire pe care o face plicul singur; transferurile duc fiecare săptămână la ținta ei.
  const base = calendarBudget(total, plan.periodStart, end, perWeek)?.weeks || [];
  if (base.length !== weeks.length) return undefined;
  const gaps = targets.map((target, index) => money2(target - base[index].amount));
  const givers = gaps.map((gap, index) => ({ index, left: -gap })).filter((item) => item.left > 0.004);
  const transfers: WeekTransfer[] = [];
  gaps.forEach((gap, index) => {
    let need = gap;
    for (const giver of givers) {
      if (need <= 0.004) break;
      const take = money2(Math.min(need, giver.left));
      if (take <= 0) continue;
      transfers.push({ id: newId("week-transfer"), allocationId, fromWeekIndex: weeks[giver.index].index, toWeekIndex: weeks[index].index, amount: take, note: "Reglat: săptămâna asta și suma pe săptămână", createdAt: now });
      giver.left = money2(giver.left - take);
      need = money2(need - take);
    }
  });
  return {
    total, before, fromFree: diff, targets,
    data: {
      ...data,
      settings: {
        ...data.settings,
        salaryPlan: {
          ...plan,
          allocations: plan.allocations.map((item) => item.id === allocationId ? next : item),
          weekTransfers: [...(plan.weekTransfers || []).filter((item) => item.allocationId !== allocationId), ...transfers],
          updatedAt: now,
        },
      },
    },
  };
}
