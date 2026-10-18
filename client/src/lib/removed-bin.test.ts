import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type Transaction } from "./finance-data";
import { readRemovedBin, recordRemovals, removedBetween, restoreRemoved } from "./removed-bin";

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } } });
});

const tx = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, title: "Exflor", amount, kind: "expense", category: "Dulciuri", source: "Card", sourceId: "source-debit", person: "Eu", date: "2026-10-08", ...extra });
const withTx = (transactions: Transaction[], receipts: AppData["receipts"] = []): AppData => ({ ...createEmptyAppData(), transactions, receipts });

describe("„Șterse recent”", () => {
  it("ține minte mișcările și bonurile dispărute, nu și pe cele corectate", () => {
    const before = withTx([tx("a", 12), tx("b", 8.36)], [{ id: "r", vendor: "Exflor", amount: 20.36, category: "Dulciuri", date: "2026-10-08", linkedTransactionId: "a" }]);
    const after = withTx([{ ...tx("b", 8.36), amount: 9 }]);
    recordRemovals(before, after);
    expect(readRemovedBin().map((entry) => `${entry.entity}:${entry.row.id}`)).toEqual(["transactions:a", "receipts:r"]);
  });

  it("o operație în masă (închiderea anului) nu umple coșul", () => {
    const many = Array.from({ length: 60 }, (_, index) => tx(`t${index}`, 1));
    expect(removedBetween(withTx(many), withTx([]))).toEqual([]);
  });

  it("pune înapoi și ridică piatra de mormânt", () => {
    recordRemovals(withTx([tx("a", 12)]), withTx([]));
    const [entry] = readRemovedBin();
    const restored = restoreRemoved({ ...withTx([]), deleted: [{ entity: "transactions", id: "a", deletedAt: "2026-10-08T10:00:00.000Z" }] }, [entry.key]);
    expect(restored.transactions.map((item) => item.id)).toEqual(["a"]);
    expect(restored.deleted).toEqual([]);
    expect(readRemovedBin()).toEqual([]);
  });
});

