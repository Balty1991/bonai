import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData } from "./finance-data";

// Alertele bugetului vechi (plicuri, mâncare, salariu, seara) mai există doar în arhivă: testele le pornesc explicit.
vi.mock("./app-mode", async (original) => ({ ...(await original<typeof import("./app-mode")>()), legacyBudgetOn: () => true }));

describe("notificarea de mâncare", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T07:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("stă prima în listă, ca limita de 7 să nu o taie", async () => {
    const { buildLocalAlerts } = await import("./local-notifications");
    const data = createEmptyAppData();
    data.settings.salaryPlan = {
      ...data.settings.salaryPlan,
      periodStart: "2026-10-01",
      nextPayday: "2026-11-01",
      paydayFlexDays: 0,
      allocations: [{ id: "m", label: "Alimente", amount: 1200, category: "Alimente", weeklyPace: true }],
    };
    const alerts = buildLocalAlerts(data);
    expect(alerts[0]?.tag).toMatch(/^food-day-2026-10-06/);
    expect(alerts[0]?.body).toContain("mâncare");
    const at = new Date(alerts[0]!.at);
    expect(at.getHours()).toBe(8);
    expect(at.getMinutes()).toBe(30);
  });
});
