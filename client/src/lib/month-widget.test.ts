import { describe, expect, it } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { monthWidgetData } from "./month-widget";

describe("widgetul „BonAI · luna asta”", () => {
  it("suma lunii, câte bonuri și următoarea plată", () => {
    const d = createEmptyAppData();
    d.receipts = [
      { id: "r1", vendor: "Lidl", amount: 120.5, category: "Alimente", date: "2026-10-05" },
      { id: "r2", vendor: "Mega Image", amount: 30, category: "Alimente", date: "2026-10-18" },
    ];
    d.debts = [{ id: "d1", name: "Rată mașină", remaining: 9000, monthly: 640, due: "", tone: "coral", kind: "credit", dueDay: 24 }];
    const w = monthWidgetData(d, "2026-10-21");
    expect(w.title).toBe("BonAI · octombrie");
    expect(w.amount).toBe("150,50 lei");
    expect(w.caption).toBe("din 2 bonuri");
    expect(w.next).toBe("Rată mașină: 640 lei, în 3 zile");
    expect(w.date).toBe("2026-10-21");
  });
  it("fără bonuri și fără plăți: suma zero, fără rândul plății", () => {
    const w = monthWidgetData(createEmptyAppData(), "2026-10-21");
    expect(w.caption).toBe("niciun bon încă");
    expect(w.next).toBe("");
  });
});
