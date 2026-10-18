import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type Transaction } from "./finance-data";
import { attachReceiptDetail } from "./receipt-review";
import { applyReceiptEdit, prefillFromReceipt, removeReceipt } from "./receipt-edit";
import { rowsFromPrefill } from "./receipt-review-model";
import { monthShopping } from "./shop-insights";
import { productObservations } from "./personal-inflation";
import { buildUndo } from "./undo-delete";

const today = "2026-10-18";
function withReceipt(): AppData {
  const base = createEmptyAppData();
  const tx: Transaction = { id: "tx1", title: "Bon — Lidl", amount: 20.48, kind: "expense", category: "Alimente", source: "", person: "", date: "2026-10-15", createdAt: "2026-10-15T10:00:00.000Z", updatedAt: "2026-10-15T10:00:00.000Z" };
  const data = { ...base, transactions: [tx] };
  const attached = attachReceiptDetail(data, "tx1", [
    { id: "a", label: "Lapte Zuzu 1L × 2", amount: 13.98, category: "Alimente", qty: 2, brand: "Zuzu", size: 1, sizeUnit: "l" },
    { id: "b", label: "Pâine", amount: 6.5, category: "Alimente", discount: 1 },
  ], 20.48, "Lidl");
  return { ...attached, receipts: attached.receipts.map((r) => ({ ...r, imageKeys: ["photo-1"] })) };
}

describe("bonul salvat: editare și ștergere", () => {
  it("deschide editorul cu aceleași rânduri și același total", () => {
    const receipt = withReceipt().receipts[0];
    const prefill = prefillFromReceipt(receipt);
    expect(prefill).toMatchObject({ title: "Lidl", amount: 20.48, date: "2026-10-15" });
    const rows = rowsFromPrefill(prefill);
    expect(rows.map((r) => [r.label, r.qty, r.amount, r.discount])).toEqual([["Lapte Zuzu 1L", 2, 13.98, 0], ["Pâine", 1, 6.5, 1]]);
  });

  it("editarea se vede în statistici și în istoricul de preț; poza și faptele rămân", () => {
    const data = withReceipt();
    const id = data.receipts[0].id;
    const rows = rowsFromPrefill(prefillFromReceipt(data.receipts[0]));
    rows[0] = { ...rows[0], amount: 15.98 };
    const next = applyReceiptEdit(data, id, { rows, total: 22.48, store: "Lidl Cluj", date: "2026-10-16" }, "2026-10-18T09:00:00.000Z");
    const receipt = next.receipts[0];
    expect(receipt).toMatchObject({ vendor: "Lidl Cluj", date: "2026-10-16", amount: 22.48, imageKeys: ["photo-1"], updatedAt: "2026-10-18T09:00:00.000Z" });
    expect(receipt.lines?.[0]).toMatchObject({ id: "a", brand: "Zuzu", amount: 15.98, qty: 2 });
    expect(receipt.lines?.[1]).toMatchObject({ id: "b", discount: 1 });
    expect(next.transactions[0]).toMatchObject({ amount: 22.48, date: "2026-10-16", title: "Bon — Lidl Cluj" });
    expect(monthShopping(next, today).spent).toBe(22.48);
    const milk = productObservations(next).find((o) => /lapte/i.test(o.label));
    expect(milk).toMatchObject({ vendor: expect.stringMatching(/Lidl/), date: "2026-10-16", paid: 15.98 });
  });

  it("ștergerea scoate bonul și mișcarea, lasă pietre de mormânt, iar Anulează le readuce", () => {
    const data = withReceipt();
    const id = data.receipts[0].id;
    expect(monthShopping(data, today).spent).toBe(20.48);
    const { next, removed } = removeReceipt(data, id, "2026-10-18T09:00:00.000Z");
    expect(next.receipts).toEqual([]);
    expect(next.transactions).toEqual([]);
    expect(next.deleted.map((d) => `${d.entity}:${d.id}`)).toEqual(expect.arrayContaining([`receipts:${id}`, "transactions:tx1"]));
    expect(monthShopping(next, today).spent).toBe(0);
    expect(productObservations(next)).toEqual([]);
    const back = buildUndo("x", removed)!.apply(next);
    expect(back.receipts.map((r) => r.id)).toEqual([id]);
    expect(back.transactions.map((t) => t.id)).toEqual(["tx1"]);
    expect(back.deleted).toEqual([]);
    expect(monthShopping(back, today).spent).toBe(20.48);
  });
});
