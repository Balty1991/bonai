import { describe, expect, it } from "vitest";
import { consistentName, consistentStore, knownNames, nameKey } from "./name-consistency";
import type { AppData } from "./finance-data";

const data = { receipts: [
  { id: "a", vendor: "Lidl", date: "2026-10-01", amount: 20, category: "Alimente", lines: [{ label: "Lapte Zuzu 1,5% 1L × 2", amount: 14, category: "Alimente" }, { label: "Pâine albă 500g", amount: 6, category: "Alimente" }] },
] } as unknown as AppData;

describe("nume la fel între scanări", () => {
  it("aceleași cuvinte și cifre, altă scriere → numele salvat", () => {
    const known = knownNames(data);
    expect(consistentName("LAPTE ZUZU 1.5 % 1 L", known)).toBe("Lapte Zuzu 1,5% 1L");
    expect(consistentName("paine alba 500 g", known)).toBe("Pâine albă 500g");
  });
  it("altă cifră sau alt cuvânt → rămâne cum l-a citit modelul", () => {
    const known = knownNames(data);
    expect(consistentName("Lapte Zuzu 3,5% 1L", known)).toBe("Lapte Zuzu 3,5% 1L");
    expect(consistentName("Pâine neagră 500g", known)).toBe("Pâine neagră 500g");
  });
  it("magazinul ca la bonurile de dinainte", () => {
    expect(consistentStore("LIDL", data)).toBe("Lidl");
    expect(consistentStore("Kaufland", data)).toBe("Kaufland");
    expect(nameKey("1 L")).toBe(nameKey("1l"));
  });
});
