import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { buildLegacyArchive } from "./legacy-archive";
import { deepCopy } from "./deep-copy";

describe("copie fără structuredClone (WebView vechi)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("arhiva veche se face și când structuredClone lipsește", () => {
    vi.stubGlobal("structuredClone", undefined);
    const data = createEmptyAppData();
    data.debts = [{ id: "d", name: "Rată", remaining: 100, monthly: 50, due: "", tone: "coral" }];
    const archive = buildLegacyArchive(data);
    expect(archive.debts).toEqual(data.debts);
    expect(archive.debts).not.toBe(data.debts);
    expect(deepCopy(undefined)).toBeUndefined();
  });
});
