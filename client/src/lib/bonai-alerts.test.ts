import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { notifyKindOf } from "./notify-prefs";

describe("notificările BonAI", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T07:00:00")); });
  afterEach(() => vi.useRealTimers());

  it("fără plicuri: „Azi la mâncare” nu se mai programează; scadențele de abonamente da", async () => {
    const { buildLocalAlerts } = await import("./local-notifications");
    const data = createEmptyAppData();
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-10-01", nextPayday: "2026-11-01", paydayFlexDays: 0, allocations: [{ id: "m", label: "Alimente", amount: 1200, category: "Alimente", weeklyPace: true }] };
    data.recurring = [{ id: "net", name: "Netflix", amount: 60, category: "Abonamente", sourceId: "", memberId: "", dueDay: 10, active: true, remindDays: 2 }];
    const tags = buildLocalAlerts(data).map((alert) => alert.tag);
    expect(tags.some((tag) => tag.startsWith("food-day"))).toBe(false);
    expect(tags.some((tag) => tag.startsWith("cost-net"))).toBe(true);
    expect(tags.every((tag) => /^(cost|debt|backup|warranty|price)-/.test(tag))).toBe(true);
  });

  it("amintirile de abonamente și facturi țin de bifa „Abonamente, facturi și rate”", () => {
    expect(notifyKindOf("cost-net-2026-10-10")).toBe("bills");
  });
});
