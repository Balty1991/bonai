import { describe, expect, it } from "vitest";
import { createEmptyAppData, type Debt } from "./finance-data";
import { paymentCalendar } from "./payment-calendar";

describe("calendarul ratelor", () => {
  it("arată rata ca plătită dacă plata recentă o acoperă în ciclul curent", () => {
    const data = createEmptyAppData();
    data.debts = [{
      id: "credit", name: "Credit", remaining: 750, monthly: 250, due: "", tone: "forest",
      dueDay: 10, lastPaid: "2026-10-17",
    } as Debt];

    const calendar = paymentCalendar(data, "2026-11", "2026-11-10");

    expect(calendar.payments).toHaveLength(1);
    expect(calendar.payments[0]).toMatchObject({ date: "2026-11-10", paid: true, amount: 250 });
    expect(calendar.paid).toBe(250);
    expect(calendar.left).toBe(0);
  });
});
