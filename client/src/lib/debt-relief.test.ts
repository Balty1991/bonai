import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { endingDebts, freedPerMonth, overdraftInUse } from "./debt-relief";

const family = (): AppData => {
  const data = createEmptyAppData();
  data.settings.members = [{ id: "m1", name: "Alin" }, { id: "m2", name: "Angi" }];
  data.settings.paymentSources = [
    { id: "alin", name: "Card Raiffeisen Alin", kind: "card", memberId: "m1", openingBalance: -252 },
    { id: "angi", name: "Raiffeisen Angi", kind: "card", memberId: "m2", openingBalance: 100 },
    { id: "bon", name: "Bonuri", kind: "meal", memberId: "m1", openingBalance: -5 },
  ];
  data.debts = [
    { id: "fier", name: "Emag (fier călcat)", remaining: 180.49, monthly: 90.25, due: "", tone: "coral" },
    { id: "lame", name: "Emag (lame aparat)", remaining: 65.64, monthly: 32.83, due: "", tone: "coral" },
    { id: "tel", name: "Emag(telefon)", remaining: 175.69, monthly: 179, due: "", tone: "coral" },
    { id: "bank", name: "Raiffeisen Alin", remaining: 27910.55, monthly: 672.96, due: "", tone: "coral", annualRate: 9 },
    { id: "od", name: "Dobânda Overdraft Alin", remaining: 252, monthly: 21, due: "", tone: "coral", memberId: "m1", openEnded: true },
  ];
  return data;
};

describe("ce se eliberează și overdraftul folosit", () => {
  it("ratele eMAG care se termină în 3 luni, fără creditul mare și fără overdraft", () => {
    const ending = endingDebts(family());
    expect(ending.map((item) => [item.debt.id, item.months])).toEqual([["tel", 1], ["fier", 2], ["lame", 2]]);
    expect(freedPerMonth(ending)).toBe(302.08);
  });

  it("overdraftul folosit e cardul pe minus al aceleiași persoane, nu bonurile", () => {
    const data = family();
    expect(overdraftInUse(data, data.debts[4])).toEqual([{ name: "Card Raiffeisen Alin", used: 252 }]);
  });
});
