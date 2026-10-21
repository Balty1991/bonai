import { describe, expect, it } from "vitest";
import type { Receipt } from "./finance-data";
import { findDuplicateReceipt } from "./receipt-duplicates";

const r = (id: string, vendor: string, date: string, amount: number, extra: Record<string, string> = {}) => ({ id, vendor, date, amount, category: "Alimente", ...extra }) as unknown as Receipt;

describe("bonul scanat de două ori", () => {
  const saved = [r("a", "LIDL ROMANIA SCS", "2026-10-14", 26.44, { time: "18:05" }), r("b", "Kaufland", "2026-10-14", 89.3, { qr: "QR123" }), r("c", "Profi", "2026-10-12", 9.9, { number: "0042", storeCui: "RO1234" })];
  it("același magazin, zi și total", () => {
    expect(findDuplicateReceipt(saved, { vendor: "Lidl", date: "2026-10-14", amount: 26.44 })?.id).toBe("a");
  });
  it("ora diferită înseamnă alt bon", () => {
    expect(findDuplicateReceipt(saved, { vendor: "Lidl", date: "2026-10-14", amount: 26.44, time: "19:40" })).toBeUndefined();
  });
  it("QR-ul câștigă, chiar dacă restul diferă", () => {
    expect(findDuplicateReceipt(saved, { vendor: "Altceva", date: "2026-10-01", amount: 1, qr: "QR123" })?.id).toBe("b");
  });
  it("numărul bonului + CUI + zi", () => {
    expect(findDuplicateReceipt(saved, { vendor: "Profi Rom Food", date: "2026-10-12", amount: 9.9, number: "0042", storeCui: "RO 1234" })?.id).toBe("c");
  });
  it("total diferit sau fără dată: nu e dublură", () => {
    expect(findDuplicateReceipt(saved, { vendor: "Lidl", date: "2026-10-14", amount: 26.45 })).toBeUndefined();
    expect(findDuplicateReceipt(saved, { vendor: "Lidl", amount: 26.44 })).toBeUndefined();
  });
  it("același bon cu totalul citit altfel: aceleași produse, aceeași zi și magazin", () => {
    const lines = ["Lapte Zuzu 1,5%", "Paine feliata", "Oua M 10 buc", "Banane"].map((label, index) => ({ id: String(index), category: "Alimente", amount: 5, label }));
    const old = [{ ...r("d", "Mega Image", "2026-10-18", 16.98), lines } as Receipt];
    expect(findDuplicateReceipt(old, { vendor: "Mega Image", date: "2026-10-18", amount: 61.98, labels: lines.map((line) => line.label) })?.id).toBe("d");
    expect(findDuplicateReceipt(old, { vendor: "Mega Image", date: "2026-10-19", amount: 61.98, labels: lines.map((line) => line.label) })).toBeUndefined();
    expect(findDuplicateReceipt(old, { vendor: "Mega Image", date: "2026-10-18", amount: 61.98, labels: ["Lapte Zuzu 1,5%", "Cafea", "Zahar", "Ulei"] })).toBeUndefined();
  });
});
