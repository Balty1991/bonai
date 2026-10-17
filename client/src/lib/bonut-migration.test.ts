import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { costsOf, needsMigration, rollbackSchema, runBonutMigration, storedSchema } from "./bonut-migration";

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe("migrarea la Bonuț", () => {
  it("costurile sunt doar cheltuielile, cu bonul legat", () => {
    const data = createEmptyAppData();
    data.transactions.push(
      { id: "a", kind: "expense", title: "Lidl", amount: 50, date: "2026-10-01", category: "Alimente" } as AppData["transactions"][number],
      { id: "b", kind: "income", title: "Salariu", amount: 4000, date: "2026-10-01", category: "Venit" } as AppData["transactions"][number],
      { id: "c", kind: "expense", title: "Mutat", amount: 100, date: "2026-10-02", category: "Altele", transferId: "x" } as AppData["transactions"][number],
    );
    data.receipts.push({ id: "r1", linkedTransactionId: "a" } as AppData["receipts"][number]);
    expect(costsOf(data)).toEqual([{ id: "a", title: "Lidl", amount: 50, date: "2026-10-01", category: "Alimente", receiptId: "r1" }]);
  });
  it("fără IndexedDB copia nu se poate face, deci migrarea se amână și datele rămân neatinse", async () => {
    const storage = memory();
    const data = createEmptyAppData();
    const before = JSON.stringify(data);
    expect(needsMigration(storage)).toBe(true);
    expect(await runBonutMigration(data, storage)).toBe("deferred");
    expect(storedSchema(storage)).toBe(1);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("schema marcată nu se mai migrează; revenirea o pune la 1", async () => {
    const storage = memory();
    storage.setItem("bonut:schema", "2");
    expect(await runBonutMigration(createEmptyAppData(), storage)).toBe("skipped");
    rollbackSchema(storage);
    expect(storedSchema(storage)).toBe(1);
  });
});
