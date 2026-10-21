import { describe, expect, it } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { weekTooFast } from "./household-insights";

const family = (spent: number, date: string) => {
  const data = createEmptyAppData();
  data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-10-05", nextPayday: "2026-11-01", paydayFlexDays: 0, allocations: [{ id: "m", label: "Mâncare", amount: 2400, category: "Alimente", weeklyPace: true, weeklyAmount: 600 }] };
  data.transactions = [{ id: "a", title: "Lidl", amount: spent, kind: "expense", category: "Alimente", source: "", person: "", date, allocationId: "m" }];
  return data;
};

describe("săptămâna merge prea repede", () => {
  it("450 din 600 în a patra zi: avertizează, cu cât mai e pe zi", () => {
    expect(weekTooFast(family(450, "2026-10-06"), "2026-10-08")[0]).toMatchObject({ weekIndex: 1, spent: 450, daysLeft: 4, perDay: 37.5, over: false });
  });
  it("o cumpărătură normală nu sună alarma", () => {
    expect(weekTooFast(family(250, "2026-10-06"), "2026-10-08")).toEqual([]);
    expect(weekTooFast(family(500, "2026-10-06"), "2026-10-10")).toEqual([]);
  });
  it("tranșa depășită apare mereu", () => {
    expect(weekTooFast(family(650, "2026-10-06"), "2026-10-11")[0]).toMatchObject({ over: true, remaining: -50 });
  });
});

describe("rândurile adăugate la bilanțul familiei", () => {
  it("zilele până la salariu și săptămâna care merge repede", async () => {
    const { familyWeekExtras } = await import("./household-insights");
    const lines = familyWeekExtras(family(450, "2026-10-06"), "2026-10-08");
    expect(lines[0]).toMatch(/Până la salariu: 24 de zile/);
    expect(lines[1]).toMatch(/Mâncare: 450\u00a0lei din 600\u00a0lei\. Azi cel mult 37,50\u00a0lei, apoi cam 37,50\u00a0lei pe zi/);
  });
});

describe("istoricul pe luni al plicului", () => {
  it("lunile cu cheltuieli, media doar pe lunile întregi", async () => {
    const { envelopeMonthlyHistory } = await import("./household-insights");
    const data = family(100, "2026-10-06");
    data.transactions.push(
      { id: "j", title: "Lidl", amount: 2700, kind: "expense", category: "Alimente", source: "", person: "", date: "2026-08-14", allocationId: "m" },
      { id: "s", title: "Lidl", amount: 2450, kind: "expense", category: "Alimente", source: "", person: "", date: "2026-09-14", allocationId: "m" },
      { id: "o", title: "Altceva", amount: 999, kind: "expense", category: "Transport", source: "", person: "", date: "2026-09-16" },
    );
    const history = envelopeMonthlyHistory(data, data.settings.salaryPlan.allocations[0], "2026-10-08");
    expect(history.months).toEqual([{ month: "2026-08", amount: 2700 }, { month: "2026-09", amount: 2450 }, { month: "2026-10", amount: 100 }]);
    expect(history).toMatchObject({ average: 2575, fullMonths: 2 });
  });
});
