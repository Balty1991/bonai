import { describe, expect, it } from "vitest";
import { createEmptyAppData, matchingAllocationsForExpense, type AppData } from "./finance-data";
import { applySimpleEnvelopes, isSimplified, proposeSimpleEnvelopes } from "./simple-envelopes";

const family = (): AppData => {
  const data = createEmptyAppData();
  data.settings.members = [{ id: "m1", name: "Alin" }, { id: "m2", name: "Angi" }];
  data.settings.paymentSources = [
    { id: "alin", name: "Card Raiffeisen Alin", kind: "card", memberId: "m1", openingBalance: 3000 },
    { id: "angi", name: "Raiffeisen Angi", kind: "card", memberId: "m2", openingBalance: 2000 },
    { id: "bonuri", name: "Card bonuri Alin", kind: "meal", memberId: "m1", openingBalance: 990 },
    { id: "bunuri", name: "Card de bunuri Angi", kind: "card", memberId: "m2", openingBalance: 800 },
    { id: "sgr", name: "Voucher SGR", kind: "card", memberId: "m1", openingBalance: 40 },
  ];
  data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-10-09", nextPayday: "2026-11-09", sourceIds: ["alin"], allocations: [
    { id: "food", label: "Alimente", category: "Alimente", amount: 2400, sourceId: "alin", memberId: "m1", weeklyPace: true, funding: [{ sourceId: "bonuri", amount: 600 }] },
    { id: "taxi", label: "Taxi", category: "Transport", amount: 500, sourceId: "alin", memberId: "m1", weeklyPace: false },
  ] };
  return data;
};

describe("plicuri mai simple", () => {
  it("Alimente devine Cumpărături, apar Copil 500 și Altele 150, bonurile își iau tipul", () => {
    const data = family();
    const next = applySimpleEnvelopes(data, proposeSimpleEnvelopes(data), { child: 500, other: 150 });
    const plan = next.settings.salaryPlan.allocations;
    expect(plan.map((item) => [item.label, item.amount])).toEqual([["Cumpărături", 2400], ["Taxi", 500], ["Copil", 500], ["Altele", 150]]);
    expect(plan.every((item) => item.anySource)).toBe(true);
    expect(next.settings.paymentSources.find((item) => item.id === "bunuri")?.kind).toBe("meal");
    expect(next.settings.paymentSources.find((item) => item.id === "sgr")?.kind).toBe("voucher");
    expect(isSimplified(next)).toBe(true);
  });

  it("cheltuiala intră în plicul ei din orice card, al oricui; facturile rămân fără plic", () => {
    const data = family();
    const next = applySimpleEnvelopes(data, proposeSimpleEnvelopes(data), { child: 500, other: 150 });
    const where = (category: string, sourceId: string, memberId = "m2") => matchingAllocationsForExpense(next, { category, memberId, sourceId }).map((item) => item.label);
    expect(where("Dulciuri", "angi")).toEqual(["Cumpărături"]);
    expect(where("Alimente", "bunuri")).toEqual(["Cumpărături"]);
    expect(where("Consumabile copil", "angi")).toEqual(["Copil"]);
    expect(where("Haine", "alin", "m1")).toEqual(["Altele"]);
    expect(where("Casă & facturi", "alin", "m1")).toEqual([]);
  });

  it("un plic Copil existent primește suma nouă, nu se dublează", () => {
    const data = family();
    data.settings.salaryPlan.allocations.push({ id: "kid", label: "Bebe", category: "Consumabile copil", amount: 300, sourceId: "alin", weeklyPace: true });
    const next = applySimpleEnvelopes(data, proposeSimpleEnvelopes(data), { child: 500, other: 0 });
    const kids = next.settings.salaryPlan.allocations.filter((item) => item.category === "Consumabile copil");
    expect(kids).toHaveLength(1);
    expect(kids[0]).toMatchObject({ label: "Bebe", amount: 500, weeklyPace: false });
    expect(next.settings.salaryPlan.allocations.some((item) => item.label === "Altele")).toBe(false);
  });
});
