import { describe, expect, it } from "vitest";
import { pickRotation, rotateMask90, type Rotation } from "./receipt-orientation";

/** Un bon sintetic drept: rânduri orizontale de „text”, pornite din stânga, cu preț la dreapta, conținut sus. */
function receipt(width = 120, height = 220): Uint8Array {
  const gray = new Uint8Array(width * height).fill(240);
  for (let line = 0; line < 22; line++) {
    const y0 = 8 + line * 7;
    const nameEnd = 10 + ((line * 37) % 50) + 20;
    for (let y = y0; y < y0 + 4; y++) {
      for (let x = 8; x < nameEnd; x++) if ((x + line) % 4) gray[y * width + x] = 20;
      if (line > 2) for (let x = width - 26; x < width - 8; x++) if (x % 3) gray[y * width + x] = 20;
    }
  }
  return gray;
}

function rotate(gray: Uint8Array, width: number, height: number, turns: number) {
  let cur = { mask: gray, width, height };
  for (let i = 0; i < turns; i++) cur = rotateMask90(cur.mask, cur.width, cur.height);
  return cur;
}

describe("orientarea bonului", () => {
  it("lasă bonul drept cum e", () => {
    expect(pickRotation(receipt(), 120, 220)).toBe(0);
  });
  it.each([1, 2, 3])("îndreaptă bonul rotit de %i ori cu 90°", (turns) => {
    const turned = rotate(receipt(), 120, 220, turns);
    const expected = ((4 - turns) % 4) * 90 as Rotation;
    expect(pickRotation(turned.mask, turned.width, turned.height)).toBe(expected);
  });
  it("o poză culcată fără text clar ajunge măcar în portret", () => {
    expect(pickRotation(new Uint8Array(200 * 100).fill(200), 200, 100)).toBe(90);
  });
});
