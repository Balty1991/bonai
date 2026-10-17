import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { monthSaved, savedShareText, threeMonthAverage } from "./savings-summary";

const receipt = (id: string, date: string, amount: number, discounts: number[] = []) => ({ id, date, amount, category: "Alimente", lines: discounts.map((d, i) => ({ id: `${id}-${i}`, category: "Alimente", amount: 10, discount: d })) }) as unknown as AppData["receipts"][number];

describe("rezumatul lunii", () => {
  it("economia = doar reducerile tipărite pe bonurile lunii", () => {
    const data = createEmptyAppData();
    data.receipts.push(receipt("a", "2026-10-02", 50, [1.5, 0]), receipt("b", "2026-10-10", 30, [2.25]), receipt("c", "2026-09-30", 20, [9]), receipt("d", "2026-10-20", 20, [5]));
    expect(monthSaved(data, "2026-10-18")).toEqual({ month: "2026-10", saved: 3.75, receipts: 2, lines: 2 });
  });
  it("media pe 3 luni încheiate, doar lunile cu bonuri", () => {
    const data = createEmptyAppData();
    expect(threeMonthAverage(data, "2026-10-18")).toBeUndefined();
    data.receipts.push(receipt("a", "2026-09-05", 300), receipt("b", "2026-08-05", 100), receipt("c", "2026-06-05", 999), receipt("d", "2026-10-01", 50));
    expect(threeMonthAverage(data, "2026-10-18")).toEqual({ average: 200, months: 2 });
  });
  it("textul de distribuit", () => {
    expect(savedShareText(12.5, "octombrie", "https://x")).toBe("În octombrie am economisit 12,50 lei din reducerile de pe bonuri, urmărite cu Bonuț. https://x");
  });
});
