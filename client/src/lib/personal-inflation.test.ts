import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type ReceiptLine } from "./finance-data";
import { monthInflation, productCards, shrinkflationAlerts } from "./personal-inflation";

const bon = (id: string, vendor: string, date: string, lines: Array<Partial<ReceiptLine> & { label: string; amount: number }>) => ({ id, vendor, date, amount: lines.reduce((s, l) => s + l.amount, 0), category: "Alimente", lines: lines.map((line, i) => ({ id: `${id}-${i}`, category: "Alimente", ...line })) });

const family = (): AppData => {
  const data = createEmptyAppData();
  data.receipts = [
    bon("a", "Lidl", "2026-06-10", [{ label: "Lapte Zuzu 1,5%", amount: 5.99, brand: "Zuzu", size: 1, sizeUnit: "l" }, { label: "Pâine feliată", amount: 4 }]),
    bon("b", "Kaufland", "2026-08-12", [{ label: "Lapte Zuzu 1,5%", amount: 5.79, brand: "Zuzu", size: 1, sizeUnit: "l" }, { label: "Pâine feliată", amount: 4.2 }]),
    bon("c", "Lidl", "2026-09-15", [{ label: "Lapte Zuzu 1,5%", amount: 6.29, brand: "Zuzu", size: 1, sizeUnit: "l" }, { label: "Pâine feliată", amount: 4.4 }]),
    bon("d", "Lidl", "2026-10-14", [{ label: "Lapte Zuzu 1,5%", amount: 6.49, brand: "Zuzu", size: 0.9, sizeUnit: "l" }, { label: "Pâine feliată", amount: 4.4 }, { label: "Pâine feliată", amount: 4.6 }]),
  ];
  return data;
};

describe("produsele tale și inflația ta", () => {
  it("cardul produsului: preț pe litru, variații pe 1/3/6 luni, cel mai ieftin magazin", () => {
    const milk = productCards(family(), "2026-10-17").find((card) => card.key.startsWith("lapte zuzu"))!;
    expect(milk.per).toBe("l");
    expect(milk.latest.price).toBeCloseTo(7.21, 2);
    expect(milk.change.m1).toBeCloseTo(14.6, 1);
    expect(milk.change.m3).toBeCloseTo(20.4, 1);
    expect(milk.change.m6).toBeUndefined();
    expect(milk.cheapest).toEqual({ vendor: "Kaufland", price: 5.79 });
  });

  it("inflația lunii, ponderată după cât ai dat pe fiecare produs", () => {
    const month = monthInflation(family(), "2026-10")!;
    expect(month.products).toBe(2);
    // Laptele: 7,21/l față de media 6,04/l (+19,4%), 6,49 lei; pâinea: 4,50 față de 4,30 (+4,7%), 9 lei.
    expect(month.percent).toBeCloseTo(10.8, 0);
    expect(month.risers[0].label).toMatch(/Lapte/);
  });

  it("shrinkflation: 1 l → 0,9 l la preț mai mare înseamnă +14% pe litru", () => {
    const [alert] = shrinkflationAlerts(family(), "2026-10-17");
    expect(alert).toMatchObject({ fromSize: 1, toSize: 0.9, fromPiece: 6.29, toPiece: 6.49 });
    expect(alert.perUnitPercent).toBeCloseTo(14.6, 1);
  });

  it("fără bonuri luna asta nu există inflație de arătat", () => {
    expect(monthInflation(createEmptyAppData(), "2026-10")).toBeUndefined();
  });
});
