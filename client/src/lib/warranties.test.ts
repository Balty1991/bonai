import { describe, expect, it } from "vitest";
import { createEmptyAppData, normalizeAppData, type AppData } from "./finance-data";
import { mergeWarranties, normalizeWarranties } from "./warranty-data";
import { addMonths, dismissedCandidate, liveWarranties, removeWarranty, upsertWarranty, warrantyCandidates, warrantyFromCandidate, warrantyReminders, warrantyStatus } from "./warranties";

const base = (): AppData => {
  const data = createEmptyAppData();
  data.receipts = [
    { id: "r1", vendor: "eMAG", amount: 1450, category: "Altele", date: "2026-10-10", lines: [
      { id: "l1", category: "Altele", amount: 1299, label: "Aspirator vertical Philips" },
      { id: "l2", category: "Altele", amount: 151, label: "Husă telefon" },
    ] },
    { id: "r2", vendor: "Lidl", amount: 420, category: "Alimente", date: "2026-10-12", lines: [
      { id: "l1", category: "Alimente", amount: 380, label: "Cumpărături mari" },
      { id: "l2", category: "Altele", amount: 40, label: "Bec LED" },
    ] },
    { id: "r3", vendor: "Altex", amount: 3200, category: "Casă & facturi", date: "2023-01-10", lines: [{ id: "l1", category: "Casă & facturi", amount: 3200, label: "Frigider vechi" }] },
  ];
  data.transactions = [
    { id: "t1", title: "Căști Sony", amount: 249, kind: "expense", category: "Timp liber", date: "2026-09-01" } as AppData["transactions"][number],
    { id: "t2", title: "Pizza", amount: 90, kind: "expense", category: "Alimente", date: "2026-09-02" } as AppData["transactions"][number],
  ];
  return data;
};

describe("garanții", () => {
  it("propune electronicele și rândurile scumpe nealimentare, nu mâncarea sau bonurile mai vechi de doi ani", () => {
    const list = warrantyCandidates(base(), "2026-10-17");
    expect(list.map((item) => item.name)).toEqual(["Aspirator vertical Philips", "Căști Sony"]);
    expect(list[0]).toMatchObject({ store: "eMAG", returnDays: 14, receiptId: "r1", lineId: "l1" });
    expect(list[1]).toMatchObject({ transactionId: "t1", returnDays: 0 });
  });

  it("o propunere adăugată sau refuzată nu mai apare", () => {
    const data = base();
    const [first, second] = warrantyCandidates(data, "2026-10-17");
    const after = upsertWarranty(upsertWarranty(data, warrantyFromCandidate(first)), dismissedCandidate(second));
    expect(warrantyCandidates(after, "2026-10-17")).toEqual([]);
    expect(liveWarranties(after, "2026-10-17").map((item) => item.warranty.name)).toEqual(["Aspirator vertical Philips"]);
  });

  it("socotește returul, garanția și expirarea", () => {
    const warranty = { id: "w", name: "Aspirator", price: 1299, purchaseDate: "2026-10-10", months: 24, returnDays: 14, updatedAt: "2026-10-10T10:00:00.000Z" };
    expect(warrantyStatus(warranty, "2026-10-17")).toMatchObject({ state: "return", returnUntil: "2026-10-24", returnDaysLeft: 7, until: "2028-10-09" });
    expect(warrantyStatus(warranty, "2026-10-25").state).toBe("active");
    expect(warrantyStatus(warranty, "2028-09-20")).toMatchObject({ state: "expiring", daysLeft: 19 });
    expect(warrantyStatus(warranty, "2028-10-10").state).toBe("expired");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("amintește cu o zi înainte de ultima zi de retur și cu 30 de zile înainte de expirare", () => {
    let data = base();
    data = upsertWarranty(data, { id: "a", name: "Aspirator", price: 1299, purchaseDate: "2026-10-10", months: 24, returnDays: 14, updatedAt: "2026-10-10T10:00:00.000Z" });
    data = upsertWarranty(data, { id: "b", name: "Televizor", price: 2500, purchaseDate: "2024-11-20", months: 24, returnDays: 0, updatedAt: "2024-11-20T10:00:00.000Z" });
    expect(warrantyReminders(data, "2026-10-17")).toEqual([
      { id: "b", kind: "expiry", name: "Televizor", day: "2026-10-20", target: "2026-11-19" },
      { id: "a", kind: "return", name: "Aspirator", day: "2026-10-23", target: "2026-10-24" },
    ]);
    expect(warrantyReminders(removeWarranty(data, "a"), "2026-10-17").map((item) => item.id)).toEqual(["b"]);
  });

  it("se păstrează la încărcare și se unesc după modificarea mai nouă", () => {
    const data = upsertWarranty(base(), { id: "a", name: "Aspirator", price: 1299, purchaseDate: "2026-10-10", months: 24, returnDays: 14, receiptId: "r1", lineId: "l1", updatedAt: "2026-10-10T10:00:00.000Z" });
    expect(normalizeAppData(JSON.parse(JSON.stringify(data))).settings.warranties).toEqual(data.settings.warranties);
    expect(normalizeWarranties([{ id: "x", name: "Fără dată", updatedAt: "2026-10-10T10:00:00.000Z" }])).toEqual([]);
    const older = { id: "a", name: "Aspirator", price: 1299, purchaseDate: "2026-10-10", months: 24, returnDays: 14, updatedAt: "2026-10-10T10:00:00.000Z" };
    const deleted = { ...older, deleted: true, updatedAt: "2026-10-11T10:00:00.000Z" };
    expect(mergeWarranties([older], [deleted])).toEqual([deleted]);
    expect(mergeWarranties([deleted], [older])).toEqual([deleted]);
  });
});
