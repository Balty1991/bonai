import { describe, expect, it } from "vitest";
import { chainOf } from "./ReceiptReview";

describe("lanțul magazinului pentru „Ultima dată la”", () => {
  it("ignoră prefixul „Cumpărături” din titlul bonului scanat", () => {
    expect(chainOf("Cumpărături Profi")).toBe("profi");
    expect(chainOf("Cumpărături Lidl Romania")).toBe(chainOf("LIDL"));
    expect(chainOf("Cumpărături Profi")).not.toBe(chainOf("Cumpărături Kaufland"));
  });
});
