import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type Debt, type RecurringPayment } from "./finance-data";
import { upcoming, upcomingTotal } from "./upcoming";

const rec = (o: Partial<RecurringPayment>): RecurringPayment => ({ id: "r", name: "Netflix", amount: 50, category: "Abonamente", sourceId: "", memberId: "", dueDay: 20, active: true, ...o });
const debt = (o: Partial<Debt>): Debt => ({ id: "d", name: "Credit", remaining: 1000, monthly: 300, due: "", tone: "forest", dueDay: 25, ...o });

describe("upcoming", () => {
  it("pune facturi, abonamente, rate și retururi pe o singură axă", () => {
    const data: AppData = createEmptyAppData();
    data.recurring = [rec({}), rec({ id: "e", name: "Curent", category: "Casă & facturi", dueDay: 5, amount: 180, variable: true }), rec({ id: "x", name: "Oprit", active: false })];
    data.debts = [debt({}), debt({ id: "z", name: "Achitat", remaining: 0 })];
    data.settings.warranties = [{ id: "w", name: "Mixer", price: 300, purchaseDate: "2026-10-10", months: 24, returnDays: 14 } as never];
    const items = upcoming(data, "2026-10-18");
    expect(items.map((i) => `${i.kind}:${i.name}:${i.date}`)).toEqual(["sub:Netflix:2026-10-20", "return:Mixer:2026-10-24", "debt:Credit:2026-10-25", "bill:Curent:2026-11-05"]);
    expect(items[3].estimate).toBe(true);
    expect(upcomingTotal(items)).toBe(530);
  });
  it("o rată bifată acum trece la luna următoare", () => {
    const data = createEmptyAppData();
    data.debts = [debt({ lastPaid: "2026-10-17" })];
    expect(upcoming(data, "2026-10-18", 60)[0].date).toBe("2026-11-25");
  });
});
