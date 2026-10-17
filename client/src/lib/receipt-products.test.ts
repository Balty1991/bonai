import { describe, expect, it } from "vitest";
import { createEmptyAppData, normalizeAppData, type Receipt } from "./finance-data";
import { scanToPrefill, type ScannedReceipt } from "./receipt-scan";
import { enrichReceipt, unitPriceOf } from "./receipt-products";

describe("bonul pe produs", () => {
  it("prețul pe kg, litru sau bucată, după ce s-a plătit efectiv", () => {
    expect(unitPriceOf({ amount: 6.49, size: 1, sizeUnit: "l" })).toEqual({ value: 6.49, per: "l" });
    expect(unitPriceOf({ amount: 12.98, qty: 2, size: 500, sizeUnit: "g" })).toEqual({ value: 12.98, per: "kg" });
    expect(unitPriceOf({ amount: 6.59, qty: 0.412, unit: "kg" })).toEqual({ value: 16, per: "kg" });
    expect(unitPriceOf({ amount: 9.1, qty: 2 })).toEqual({ value: 4.55, per: "buc" });
  });

  it("scanarea duce marca, gramajul și magazinul până în formular", () => {
    const scanned: ScannedReceipt = {
      store: "Lidl", date: null, total: 19.47, confidence: "high", payments: [{ method: "card", amount: 19.47 }],
      storeCui: "RO22891860", city: "Cluj-Napoca", time: "18:42",
      items: [
        { name: "Lapte Zuzu 1,5%, 1 l", rawName: "LAPTE ZUZU 1.5% 1L", quantity: 2, amount: 12.98, category: "Alimente", brand: "Zuzu", size: 1, sizeUnit: "l" },
        { name: "Roșii cherry", rawName: "ROSII CHERRY VRAC", quantity: 0.412, amount: 6.49, category: "Alimente", unit: "kg", unitPrice: 15.75 },
      ],
    };
    const prefill = scanToPrefill(scanned, createEmptyAppData(), undefined, "2026-10-17");
    expect(prefill.store).toEqual({ storeCui: "RO22891860", city: "Cluj-Napoca", time: "18:42" });
    expect(prefill.lines[0]).toMatchObject({ qty: 2, product: { brand: "Zuzu", size: 1, sizeUnit: "l" } });
    expect(prefill.lines[1]).toMatchObject({ qty: 0.412, product: { unit: "kg", unitPrice: 15.75 } });
  });

  it("faptele se lipesc pe rândurile rămase după verificare, după denumire, nu după poziție", () => {
    const receipt: Receipt = { id: "r", vendor: "Lidl", amount: 19.47, category: "Alimente", date: "2026-10-17", lines: [
      { id: "a", category: "Alimente", amount: 6.49, label: "Roșii cherry × 0,412 kg" },
      { id: "b", category: "Alimente", amount: 12.98, label: "Lapte Zuzu 1,5%, 1 l × 2" },
      { id: "c", category: "Altele", amount: 1, label: "Pungă (adăugată de mână)" },
    ] };
    const next = enrichReceipt(receipt, [
      { label: "Lapte Zuzu 1,5%, 1 l × 2", qty: 2, product: { brand: "Zuzu", size: 1, sizeUnit: "l" } },
      { label: "Roșii cherry × 0,412 kg", qty: 0.412, product: { unit: "kg" } },
    ], { storeCui: "RO22891860", city: "Cluj-Napoca" });
    expect(next).toMatchObject({ storeCui: "RO22891860", city: "Cluj-Napoca" });
    expect(next.lines?.[0]).toMatchObject({ unit: "kg", qty: 0.412 });
    expect(next.lines?.[1]).toMatchObject({ brand: "Zuzu", size: 1, qty: 2 });
    expect(next.lines?.[2]).toEqual(receipt.lines?.[2]);
    expect(unitPriceOf(next.lines![1])).toEqual({ value: 6.49, per: "l" });
  });

  it("marca și gramajul trec de încărcare (și de telefonul celălalt), valorile ciudate nu", () => {
    const data = createEmptyAppData();
    data.receipts = [{ id: "r", vendor: "Lidl", amount: 6.49, category: "Alimente", date: "2026-10-17", storeCui: "RO1", city: "Iași", lines: [
      { id: "a", category: "Alimente", amount: 6.49, label: "Lapte", brand: "Zuzu", size: 1, sizeUnit: "l", qty: 1, unit: "buc", vatRate: 11 },
      { id: "b", category: "Alimente", amount: 2, label: "X", size: 5, sizeUnit: "tone" as never, vatRate: 7 },
    ] }];
    const loaded = normalizeAppData(JSON.parse(JSON.stringify(data)));
    expect(loaded.receipts[0]).toMatchObject({ storeCui: "RO1", city: "Iași" });
    expect(loaded.receipts[0].lines?.[0]).toMatchObject({ brand: "Zuzu", size: 1, sizeUnit: "l", qty: 1, unit: "buc", vatRate: 11 });
    expect(loaded.receipts[0].lines?.[1].size).toBeUndefined();
    expect(loaded.receipts[0].lines?.[1].vatRate).toBeUndefined();
  });
});
