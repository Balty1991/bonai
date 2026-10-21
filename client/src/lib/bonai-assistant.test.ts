import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type Receipt } from "./finance-data";
import { assistantUsage, parseQuery, recordAssistantUse, ROLES, runQuery } from "./bonai-assistant";

const r = (id: string, vendor: string, date: string, lines: Array<[string, number, string?]>): Receipt => ({ id, vendor, date, category: "Alimente", amount: Math.round(lines.reduce((s, l) => s + l[1], 0) * 100) / 100, lines: lines.map(([label, amount, category], i) => ({ id: `${id}-${i}`, label, amount, category: category || "Alimente" })) });
const data = (): AppData => ({ ...createEmptyAppData(), receipts: [
  r("a", "Lidl", "2026-10-03", [["Lapte Zuzu 1L", 7.49], ["Cafea Jacobs 250g", 21.9], ["Pâine", 4.5]]),
  r("b", "Kaufland", "2026-10-10", [["Lapte Zuzu 1L", 6.99], ["Iaurt grecesc", 7.78]]),
  r("c", "Mega Image", "2026-09-20", [["Cafea Jacobs 250g", 23.5]]),
] });
const TODAY = "2026-10-18";

describe("Asistent BonAI", () => {
  it("are cele șase roluri", () => {
    expect(ROLES.map((x) => x.title)).toEqual(["Detectiv de bonuri", "Analist de prețuri", "Planificator cumpărături", "Chef economic", "Consultant economii", "Ajutor aplicație"]);
  });
  it("„cât am dat pe cafea luna asta?” se calculează din bonuri", () => {
    const q = parseQuery("cât am dat pe cafea luna asta?");
    expect(q).toMatchObject({ type: "spend", period: "month" });
    const a = runQuery(q, data(), TODAY);
    expect(a.text).toContain("21,90\u00a0lei");
    expect(a.text).not.toContain("23,50");
  });
  it("„cât am cheltuit pe lactate luna asta?” adună laptele și iaurtul", () => {
    expect(runQuery(parseQuery("cât am cheltuit pe lactate luna asta?"), data(), TODAY).text).toContain("22,26\u00a0lei");
  });
  it("„unde am cumpărat lapte cel mai ieftin?”", () => {
    const a = runQuery(parseQuery("unde am cumpărat lapte cel mai ieftin?"), data(), TODAY);
    expect(a.text).toContain("Kaufland");
  });
  it("adaugă pe listă fără să inventeze nimic", () => {
    const a = runQuery(parseQuery("adaugă lapte, pâine și ouă"), data(), TODAY);
    expect(a.listAdd).toEqual(["Lapte", "Pâine", "Ouă"]);
    expect(a.actions[0].screen).toBe("list");
  });
  it("fără bonuri nu dă cifre, trimite la scanare", () => {
    const a = runQuery(parseQuery("cât am dat pe cafea?"), createEmptyAppData(), TODAY);
    expect(a.text).not.toMatch(/\d+,\d{2} lei/);
    expect(a.actions).toEqual([{ label: "Scanează", screen: "scan" }]);
  });
  it("nu mai propune mișcări, venituri sau plicuri", () => {
    for (const text of ["am dat 50 lei pe benzină", "am primit salariul", "mută 100 în plicul de mâncare"]) {
      const a = runQuery(parseQuery(text), data(), TODAY);
      expect(a.actions.every((x) => ["scan", "list", "prices", "pantry", "menu"].includes(x.screen))).toBe(true);
      expect(a.listAdd).toBeUndefined();
    }
  });
  it("rolul ales înclină întrebarea vagă", () => {
    expect(parseQuery("idei", "chef").type).toBe("menu");
    expect(parseQuery("cum scanez un bon lung?").type).toBe("howto");
  });
  it("numără mesajele pe lună", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
    expect(assistantUsage("2026-10", store)).toBe(0);
    recordAssistantUse("2026-10", store); recordAssistantUse("2026-10", store);
    expect(assistantUsage("2026-10", store)).toBe(2);
    expect(assistantUsage("2026-11", store)).toBe(0);
  });
});
