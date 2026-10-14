import { afterEach, describe, expect, it, vi } from "vitest";
import { allocationWeeksStatus, createEmptyAppData, type AppData, type Transaction } from "./finance-data";
import { retuneWeeks } from "./week-retune";

const spend = (id: string, amount: number, date: string, sourceId = "card"): Transaction => ({ id, title: "Lidl", amount, kind: "expense", category: "Alimente", source: "Card", sourceId, memberId: "m1", person: "Alin", date, allocationId: "food" });
const family = (): AppData => {
  const data = createEmptyAppData();
  data.settings.members = [{ id: "m1", name: "Alin" }];
  data.settings.paymentSources = [{ id: "card", name: "Card", kind: "card", memberId: "m1", openingBalance: 9000 }, { id: "bonuri", name: "Card bonuri", kind: "meal", memberId: "m1", openingBalance: 600 }];
  data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-10-09", nextPayday: "2026-11-09", paydayFlexDays: 0, sourceIds: ["card", "bonuri"], allocations: [{ id: "food", label: "Alimente", category: "Alimente", amount: 2744, weeklyPace: true, funding: [{ sourceId: "card", amount: 2144 }, { sourceId: "bonuri", amount: 600 }] }] };
  data.transactions = [spend("a", 47, "2026-10-10"), spend("b", 412.56, "2026-10-13")];
  return data;
};

describe("reglează săptămânile unui plic", () => {
  afterEach(() => vi.useRealTimers());

  it("săptămâna asta mai rămân 400, apoi 600 pe săptămână; diferența vine din card, nu din bonuri", () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T12:00:00"), toFake: ["Date"] });
    const done = retuneWeeks(family(), "food", 400, 600, "2026-10-14")!;
    const food = done.data.settings.salaryPlan.allocations[0];
    const weeks = allocationWeeksStatus(done.data, food);
    const now = weeks.findIndex((week) => week.start <= "2026-10-14" && week.end >= "2026-10-14");
    expect(weeks[now].remaining).toBeCloseTo(400, 2);
    weeks.slice(now + 1).filter((week) => week.plannedDays === 7).forEach((week) => expect(week.budget).toBeCloseTo(600, 2));
    weeks.slice(0, now).forEach((week) => expect(week.remaining).toBeCloseTo(0, 2));
    expect(food.amount).toBeCloseTo(done.total, 2);
    expect(food.funding?.find((part) => part.sourceId === "bonuri")?.amount).toBe(600);
    expect(food.funding?.reduce((sum, part) => sum + part.amount, 0)).toBeCloseTo(food.amount, 2);
    expect(food.weeklyAmount).toBe(600);
  });

  it("bonurile rămân 600 și când plicul are în surse doar partea de bonuri", () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T12:00:00"), toFake: ["Date"] });
    const data = family();
    data.settings.salaryPlan.allocations[0] = { ...data.settings.salaryPlan.allocations[0], sourceId: "card", funding: [{ sourceId: "bonuri", amount: 600 }] };
    const food = retuneWeeks(data, "food", 400, 600, "2026-10-14")!.data.settings.salaryPlan.allocations[0];
    expect(food.funding).toEqual([{ sourceId: "bonuri", amount: 600 }]);
    expect(food.amount).toBeGreaterThan(2744);
  });

  it("a doua reglare înlocuiește transferurile vechi, nu se adună peste ele", () => {
    vi.useFakeTimers({ now: new Date("2026-10-14T12:00:00"), toFake: ["Date"] });
    const once = retuneWeeks(family(), "food", 400, 600, "2026-10-14")!;
    const twice = retuneWeeks(once.data, "food", 250, 500, "2026-10-14")!;
    const weeks = allocationWeeksStatus(twice.data, twice.data.settings.salaryPlan.allocations[0]);
    const now = weeks.findIndex((week) => week.start <= "2026-10-14" && week.end >= "2026-10-14");
    expect(weeks[now].remaining).toBeCloseTo(250, 2);
    weeks.slice(now + 1).filter((week) => week.plannedDays === 7).forEach((week) => expect(week.budget).toBeCloseTo(500, 2));
  });
});
