import { describe, expect, it } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { currentBonutPlan } from "./bonut-plan-current";

describe("planul curent", () => {
  it("cu plata oprită, totul e deschis (nimeni nu pierde ce avea)", () => {
    expect(currentBonutPlan(createEmptyAppData(), "2026-10-18", false, undefined)).toBe("familie");
  });
  it("cu plata pornită și fără bonuri, e gratuit", () => {
    expect(currentBonutPlan(createEmptyAppData(), "2026-10-18", true, undefined)).toBe("free");
  });
});
