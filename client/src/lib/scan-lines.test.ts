import { describe, expect, it } from "vitest";
import { detectTextBands } from "./scan-lines";

describe("detectTextBands", () => {
  it("găsește rândurile întunecate pe fond alb", () => {
    const w = 100, h = 100; const g = new Uint8Array(w * h).fill(240);
    for (const [a, b] of [[10, 14], [30, 34], [60, 65]]) for (let y = a; y < b; y++) for (let x = 20; x < 80; x += 2) g[y * w + x] = 20;
    const bands = detectTextBands(g, w, h);
    expect(bands).toHaveLength(3);
    expect(bands[0].top).toBeCloseTo(0.1, 2);
    expect(bands[2].left).toBeCloseTo(0.2, 2);
  });
  it("nu inventează rânduri pe o poză goală", () => { expect(detectTextBands(new Uint8Array(400).fill(250), 20, 20)).toEqual([]); });
});
