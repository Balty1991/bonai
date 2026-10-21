import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";

// Alertele bugetului vechi (plicuri, mâncare, salariu, seara) mai există doar în arhivă: testele le pornesc explicit.
vi.mock("./app-mode", async (original) => ({ ...(await original<typeof import("./app-mode")>()), legacyBudgetOn: () => true }));

const withSpend = (date: string): AppData => {
  const data = createEmptyAppData();
  data.transactions = [{ id: "t1", title: "Lidl", amount: 80, kind: "expense", category: "Alimente", source: "Card", person: "Eu", date }];
  return data;
};

describe("notificarea imaginii lunii", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("în ultima săptămână a lunii programează 1 ale lunii următoare, la 10", async () => {
    vi.setSystemTime(new Date("2026-09-28T08:00:00"));
    const { buildLocalAlerts } = await import("./local-notifications");
    const hit = buildLocalAlerts(withSpend("2026-09-27")).find((item) => item.tag === "month-card-2026-09");
    expect(hit).toBeTruthy();
    expect(new Date(hit!.at).getDate()).toBe(1);
    expect(new Date(hit!.at).getHours()).toBe(10);
  });

  it("nu anunță o lună fără cheltuieli notate și nici mai devreme de o săptămână", async () => {
    vi.setSystemTime(new Date("2026-09-28T08:00:00"));
    const { buildLocalAlerts } = await import("./local-notifications");
    expect(buildLocalAlerts(withSpend("2026-08-20")).some((item) => item.tag.startsWith("month-card-"))).toBe(false);
    vi.setSystemTime(new Date("2026-09-10T08:00:00"));
    expect(buildLocalAlerts(withSpend("2026-09-09")).some((item) => item.tag.startsWith("month-card-"))).toBe(false);
  });
});
