import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createEmptyAppData } from "./finance-data";
import { parseReceiptText } from "./receipt-text-parse";
import { joinPages } from "./receipt-offline";
import { scanToPrefill } from "./receipt-scan";

const ocr = (name: string) => readFileSync(new URL(`./receipt-corpus/ocr/${name}.txt`, import.meta.url), "utf8");

describe("citirea offline a bonului", () => {
  it("bon fiscal curat: magazin, dată, total, rânduri, reducere, SGR", () => {
    const r = parseReceiptText(["LIDL DISCOUNT SRL", "CIF: RO12345678", "IAURT GRECESC 400G", "2 BUC X 5,99 = 11,98 B", "REDUCERE LIDL PLUS -2,00", "APA MINERALA 2L 1 BUC X 2,49 = 2,49 B", "GARANTIE SGR 1 BUC X 0,50 = 0,50 C", "TOTAL LEI 12,97", "CARD 12,97", "14.10.2026 18:22"].join("\n"));
    expect(r.store).toBe("Lidl");
    expect(r.date).toBe("2026-10-14");
    expect(r.total).toBe(12.97);
    expect(r.items.map((i) => [i.name, i.amount, i.discount ?? 0, i.quantity])).toEqual([["IAURT GRECESC 400G", 9.98, 2, 2], ["APA MINERALA 2L", 2.49, 0, 1], ["GARANTIE SGR", 0.5, 0, 1]]);
    expect(r.items[2].category).toBe("SGR");
    expect(r.confidence).toBe("low");
  });
  it("cifre citite greșit: crede cantitatea × prețul", () => {
    const r = parseReceiptText("SALAM SUNCA 100G\n2 BUC X 3.20=96.40 B\nTOTAL LEI 6,40");
    expect(r.items[0].amount).toBe(6.4);
  });
  it("poză reală, text Tesseract: totalul nepotrivit nu trece fără avertizare", () => {
    const raw = parseReceiptText(ocr("crumpled-44.58"));
    expect(raw.total).toBe(44.58);
    const prefill = scanToPrefill(raw, createEmptyAppData(), undefined, "2026-10-18");
    expect(prefill.warning).toBeTruthy();
  });
  it("poză reală: rândurile se adună exact chiar dacă TOTAL e citit greșit", () => {
    const raw = parseReceiptText(ocr("vodka-39.76"));
    expect(Math.round(raw.items.reduce((s, i) => s + i.amount, 0) * 100) / 100).toBe(39.76);
    expect(scanToPrefill(raw, createEmptyAppData(), undefined, "2026-10-18").warning).toBeTruthy();
  });
  it("capturile suprapuse se lipesc fără dubluri", () => {
    expect(joinPages([["A", "B", "C"], ["B", "C", "D"]])).toEqual(["A", "B", "C", "D"]);
  });
});
