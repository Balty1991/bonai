import { describe, expect, it } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { mergeBarcodeLinks, normalizeBarcodeLinks, withBarcodeLink } from "./barcode-links";

describe("legăturile cod de bare, în familie", () => {
  it("curăță ce nu e cod sau dată", () => {
    expect(normalizeBarcodeLinks({ "5941021001421": { key: "lapte", at: "2026-10-18T00:00:00Z" }, abc: { key: "x", at: "2026-10-18T00:00:00Z" }, "12345678": { key: "", at: "x" } })).toEqual({ "5941021001421": { key: "lapte", at: "2026-10-18T00:00:00Z" } });
    expect(normalizeBarcodeLinks(null)).toBeUndefined();
  });
  it("la unire câștigă alegerea mai nouă", () => {
    const merged = mergeBarcodeLinks({ "11111111": { key: "a", at: "2026-10-01T00:00:00Z" } }, { "11111111": { key: "b", at: "2026-10-02T00:00:00Z" }, "22222222": { key: "c", at: "2026-10-01T00:00:00Z" } });
    expect(merged).toEqual({ "11111111": { key: "b", at: "2026-10-02T00:00:00Z" }, "22222222": { key: "c", at: "2026-10-01T00:00:00Z" } });
  });
  it("supraviețuiește normalizării datelor la încărcare", async () => {
    const { normalizeAppData } = await import("./finance-data");
    const data = withBarcodeLink(createEmptyAppData(), "5941021001421", "lapte", "2026-10-18T00:00:00Z");
    expect(normalizeAppData(JSON.parse(JSON.stringify(data))).settings.barcodeLinks).toEqual({ "5941021001421": { key: "lapte", at: "2026-10-18T00:00:00Z" } });
  });
});
