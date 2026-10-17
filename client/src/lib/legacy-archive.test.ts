import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { buildLegacyArchive, hasLegacyData } from "./legacy-archive";

describe("arhiva veche", () => {
  it("o gospodărie nouă nu are arhivă", () => {
    expect(hasLegacyData(createEmptyAppData())).toBe(false);
  });
  it("extrage veniturile și soldurile fără să modifice datele", () => {
    const data = createEmptyAppData();
    data.settings.paymentSources = [{ id: "cash", name: "Cash", kind: "cash", openingBalance: 500 }] as AppData["settings"]["paymentSources"];
    data.transactions.push({ id: "t1", kind: "income", title: "Salariu", amount: 4000, date: "2026-10-01", category: "Venit" } as AppData["transactions"][number]);
    data.transactions.push({ id: "t2", kind: "expense", title: "Lidl", amount: 80, date: "2026-10-02", category: "Alimente" } as AppData["transactions"][number]);
    const before = JSON.stringify(data);
    const archive = buildLegacyArchive(data, new Date("2026-10-18T00:00:00Z"));
    expect(JSON.stringify(data)).toBe(before);
    expect(hasLegacyData(data)).toBe(true);
    expect(archive.transactionsIncome.map((t) => t.id)).toEqual(["t1"]);
    expect(archive.settings.paymentSources?.[0].openingBalance).toBe(500);
    archive.settings.paymentSources![0].openingBalance = 0;
    expect(data.settings.paymentSources[0].openingBalance).toBe(500);
  });
});
