import { describe, expect, it } from "vitest";
import { rebrandVendor, storeBrand } from "./store-brand";
import { createEmptyAppData, rebrandReceipts } from "./finance-data";

describe("marca magazinului", () => {
  it("firmele operatoare devin mărci", () => {
    expect(storeBrand("S.C. SALES CONSULTING S.R.L.")).toBe("Familiaro");
    expect(storeBrand("Lidl Discount SRL")).toBe("Lidl");
    expect(storeBrand("KAUFLAND ROMANIA SCS")).toBe("Kaufland");
    expect(storeBrand("Artima SA")).toBe("Carrefour");
    expect(storeBrand("Profi Rom Food")).toBe("Profi");
    expect(storeBrand("Rewe Romania SRL")).toBe("Penny");
    expect(storeBrand("Dante International SA")).toBe("eMAG");
    expect(storeBrand("OMV Petrom Marketing SRL")).toBe("Petrom");
    expect(storeBrand("Fildas Trading")).toBe("Catena");
    expect(storeBrand("mega image")).toBe("Mega Image");
  });
  it("CUI-ul și produsele proprii (sacoșa) dau marca", () => {
    expect(storeBrand("Firma X", { cui: "RO16329188" })).toBe("Familiaro");
    expect(storeBrand("Alt Nume", { items: ["PAINE", "FAMILIARO SACOSA MAIEU BIO 35X60CM"] })).toBe("Familiaro");
  });
  it("nu inventează: necunoscutul rămâne", () => {
    expect(storeBrand("Popescu Ion I.I.")).toBe("Popescu Ion");
    expect(storeBrand("Alimentara Ana")).toBe("Alimentara Ana");
    expect(storeBrand("Kinder Store", { items: ["KINDER DELICE"] })).toBe("Kinder Store");
  });
  it("titlul salvat se rescrie doar când știm marca", () => {
    expect(rebrandVendor("Cumpărături Sales Consulting")).toBe("Cumpărături Familiaro");
    expect(rebrandVendor("Cumpărături Profi")).toBe("Cumpărături Profi");
    expect(rebrandVendor("Taxi")).toBe("Taxi");
    expect(rebrandVendor("Lidl Discount")).toBe("Lidl");
  });
});

describe("migrarea bonurilor salvate", () => {
  it("redenumește bonul și cheltuiala legată, fără updatedAt nou; restul neatins", () => {
    const d = createEmptyAppData();
    d.receipts = [
      { id: "r1", vendor: "Cumpărături Sales Consulting", amount: 57.3, category: "Cumpărături", date: "2026-10-18", linkedTransactionId: "t1", updatedAt: "2026-10-18T10:00:00.000Z" },
      { id: "r2", vendor: "Alimentara Ana", amount: 5, category: "Cumpărături", date: "2026-10-18" },
    ];
    d.transactions = [{ id: "t1", title: "Cumpărături Sales Consulting", amount: 57.3, category: "Cumpărături", date: "2026-10-18", kind: "expense" } as never];
    const out = rebrandReceipts(d);
    expect(out.receipts[0]).toMatchObject({ vendor: "Cumpărături Familiaro", updatedAt: "2026-10-18T10:00:00.000Z" });
    expect(out.receipts[1]).toBe(d.receipts[1]);
    expect((out.transactions[0] as { title: string }).title).toBe("Cumpărături Familiaro");
    expect(rebrandReceipts(out)).toBe(out);
  });
});
