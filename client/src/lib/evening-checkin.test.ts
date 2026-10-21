import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData, type Transaction } from "./finance-data";

// Alertele bugetului vechi (plicuri, mâncare, salariu, seara) mai există doar în arhivă: testele le pornesc explicit.
vi.mock("./app-mode", async (original) => ({ ...(await original<typeof import("./app-mode")>()), legacyBudgetOn: () => true }));

const tx = (patch: Partial<Transaction>): Transaction => ({
  id: "t",
  title: "Lidl",
  amount: 20,
  kind: "expense",
  category: "Alimente",
  source: "Card",
  person: "Eu",
  date: "2026-10-06",
  ...patch,
});

describe("amintirea de seară", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T07:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("îl întreabă pe cel care n-a notat, chiar dacă partenerul a notat", async () => {
    const { buildLocalAlerts } = await import("./local-notifications");
    const data = createEmptyAppData();
    data.settings.members = [
      { id: "member-me", name: "Andrei" },
      { id: "maria", name: "Maria" },
    ];
    data.settings.selfMemberId = "member-me";
    data.transactions = [tx({ memberId: "maria", person: "Maria" })];
    const checkin = buildLocalAlerts(data).find((item) => item.tag.startsWith("checkin-"));
    expect(checkin?.title).toBe("Tu n-ai notat azi");
    expect(checkin?.body).toContain("Maria");
    expect(checkin?.body).toContain("incompletă");
  });

  it("nu îl mai întreabă pe cel care a notat deja", async () => {
    const { buildLocalAlerts } = await import("./local-notifications");
    const data = createEmptyAppData();
    data.settings.members = [{ id: "member-me", name: "Andrei" }, { id: "maria", name: "Maria" }];
    data.settings.selfMemberId = "member-me";
    data.transactions = [tx({ memberId: "member-me", person: "Andrei" })];
    expect(buildLocalAlerts(data).some((item) => item.tag.startsWith("checkin"))).toBe(false);
  });

  it("rămâne în listă și în zilele cu multe alerte (cele mai apropiate întâi)", async () => {
    const { buildLocalAlerts } = await import("./local-notifications");
    const data = createEmptyAppData();
    data.settings.selfMemberId = data.settings.members[0]?.id;
    data.recurring = Array.from({ length: 15 }, (_, index) => ({ id: `r${index}`, name: `Factura ${index}`, amount: 50 + index, category: "Casă & facturi", sourceId: "", memberId: "", dueDay: 7 + (index % 7), active: true }));
    const alerts = buildLocalAlerts(data);
    expect(alerts.length).toBeLessThanOrEqual(12);
    expect(alerts.some((item) => item.tag === "checkin-2026-10-06")).toBe(true);
    expect(alerts.map((item) => item.at)).toEqual([...alerts.map((item) => item.at)].sort());
  });
});
