import { describe, expect, it } from "vitest";
import { createEmptyAppData, nextDebtDue, type AppData } from "./finance-data";

const withPayments = (dates: string[]): AppData => {
  const data = createEmptyAppData();
  data.transactions = dates.map((date, index) => ({ id: `p${index}`, title: "Rată", amount: 90.25, kind: "expense", category: "Rate produse", source: "Card", person: "Alin", date, debtId: "emag" }));
  return data;
};
const debt = { id: "emag", dueDate: "2026-09-05" };

describe("scadența unei rate după plăți", () => {
  it("neplătită: rămâne pe ziua din luna asta, deci întârziată", () => {
    expect(nextDebtDue(withPayments([]), debt, "2026-10-14")).toBe("2026-10-05");
  });

  it("plătită azi (raportul din 14 oct): trece pe luna viitoare", () => {
    expect(nextDebtDue(withPayments(["2026-10-14"]), debt, "2026-10-14")).toBe("2026-11-05");
  });

  it("plata de luna trecută nu acoperă scadența de luna asta", () => {
    expect(nextDebtDue(withPayments(["2026-09-04"]), debt, "2026-10-14")).toBe("2026-10-05");
  });

  it("plătită din timp, înainte de scadență: urmează luna după", () => {
    expect(nextDebtDue(withPayments(["2026-10-01"]), { id: "emag", dueDate: "2026-10-05" }, "2026-10-02")).toBe("2026-11-05");
  });

  it("ziua 31 cade pe ultima zi a unei luni scurte", () => {
    expect(nextDebtDue(withPayments(["2026-10-31"]), { id: "emag", dueDate: "2026-10-31" }, "2026-10-31")).toBe("2026-11-30");
  });
});
