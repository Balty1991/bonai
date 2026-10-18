import { describe, expect, it } from "vitest";
import { lei } from "./money-format";

const norm = (text: string) => text.replace(/\s/g, " ");

describe("sume în lei, aceeași formă peste tot", () => {
  it("fără zecimale la sume rotunde, cu două când sunt bani mărunți", () => {
    expect(norm(lei(6606))).toBe("6.606 lei");
    expect(norm(lei(184.5))).toBe("184,50 lei");
    expect(norm(lei(6605.7))).toBe("6.605,70 lei");
    expect(norm(lei(0.004))).toBe("0 lei");
    expect(norm(lei(-0.001))).toBe("0 lei");
    expect(norm(lei(Number.NaN))).toBe("0 lei");
    expect(norm(lei(-212.3))).toBe("-212,30 lei");
  });
});
