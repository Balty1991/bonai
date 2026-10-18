import { describe, expect, it } from "vitest";
import { effectivePlan, hasFeature, scansLeft, trialDaysLeft, trialStart, yearlySavingPercent } from "./bonut-plans";

describe("planurile BonAI", () => {
  it("lista, partajarea și codul de bare sunt gratuite; inflația și meniul sunt PRO; garanțiile sunt FAMILIE", () => {
    expect(hasFeature("free", "listShare")).toBe(true);
    expect(hasFeature("free", "barcode")).toBe(true);
    expect(hasFeature("free", "myInflation")).toBe(false);
    expect(hasFeature("pro", "weeklyMenu")).toBe(true);
    expect(hasFeature("pro", "warranties")).toBe(false);
    expect(hasFeature("familie", "warranties")).toBe(true);
  });
  it("proba pornește la al 3-lea bon și ține 14 zile", () => {
    const dates = ["2026-10-01", "2026-10-05", "2026-10-03"];
    expect(trialStart(dates.slice(0, 2))).toBeUndefined();
    expect(trialStart(dates)).toBe("2026-10-05");
    expect(trialDaysLeft(dates, "2026-10-05")).toBe(14);
    expect(trialDaysLeft(dates, "2026-10-18")).toBe(1);
    expect(trialDaysLeft(dates, "2026-10-19")).toBe(0);
    expect(effectivePlan(undefined, dates, "2026-10-10")).toBe("pro");
    expect(effectivePlan(undefined, dates, "2026-11-10")).toBe("free");
    expect(effectivePlan("familie", [], "2026-11-10")).toBe("familie");
  });
  it("gratuit: 15 scanări pe lună, numărate doar în luna curentă", () => {
    const scans = [...Array(14).fill("2026-10-02"), "2026-09-30"];
    expect(scansLeft("free", scans, "2026-10-18")).toBe(1);
    expect(scansLeft("free", scans, "2026-11-01")).toBe(15);
    expect(scansLeft("pro", scans, "2026-10-18")).toBe(Number.POSITIVE_INFINITY);
  });
  it("anualul e mai ieftin cu o treime", () => {
    expect(yearlySavingPercent("pro")).toBe(33);
    expect(yearlySavingPercent("familie")).toBe(33);
  });
});
