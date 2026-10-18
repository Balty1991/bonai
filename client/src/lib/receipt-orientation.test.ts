import { describe, expect, it } from "vitest";
import { candidateRotations, chooseByText, chooseLandscape, ocrScore, pickRotation, rotateMask90, type Rotation } from "./receipt-orientation";

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
  it("nu rotește niciodată o poză în portret, nici cu capul în jos (regresie: bon bun întors la 180°)", () => {
    const upside = rotate(receipt(), 120, 220, 2);
    expect(pickRotation(upside.mask, upside.width, upside.height)).toBe(0);
    expect(pickRotation(new Uint8Array(100 * 200).fill(200), 100, 200)).toBe(0);
  });
  it.each([1, 3])("îndreaptă bonul culcat (rotit de %i ori cu 90°)", (turns) => {
    const turned = rotate(receipt(), 120, 220, turns);
    const expected = ((4 - turns) % 4) * 90 as Rotation;
    expect(pickRotation(turned.mask, turned.width, turned.height)).toBe(expected);
  });
  it("o poză culcată fără text clar ajunge măcar în portret", () => {
    expect(pickRotation(new Uint8Array(200 * 100).fill(200), 200, 100)).toBe(90);
  });
});

describe("orientarea după text (OCR)", () => {
  // Scoruri reale: Tesseract pe bonurile din e2e/receipts, rotite în cele patru feluri.
  const cases: Array<[string, Array<[Rotation, number]>, Rotation]> = [
    ["portret drept (nu se atinge)", [[0, 57], [180, 36]], 0],
    ["portret drept, text slab (nu se atinge)", [[0, 58], [180, 32]], 0],
    ["portret cu capul în jos", [[0, 34], [180, 164]], 180],
    ["portret cu capul în jos, text slab", [[0, 42], [180, 56]], 180],
    ["nimic clar: rămâne cum e", [[0, 40], [180, 46]], 0],
  ];
  it.each(cases)("%s", (_name, scores, expected) => {
    expect(chooseByText(scores.map(([rotation, score]) => ({ rotation, score })))).toBe(expected);
  });
  it("cuvintele de bon și prețurile cântăresc", () => {
    expect(ocrScore("BON FISCAL\nTOTAL 12,50 LEI\nTVA B 1,20\nCIF RO123", 60)).toBeGreaterThan(ocrScore("~~ ;:. ql", 60) + 30);
  });
  it("portretul încearcă 0/180, poza culcată și 90/270", () => {
    expect(candidateRotations(100, 200)).toEqual([0, 180]);
    expect(candidateRotations(200, 100)).toEqual([90, 270]);
  });
});

describe("poza culcată nu rămâne culcată (regresie v5: Mega Image cu capul spre stânga)", () => {
  it("alege sensul cu textul mai bun", () => {
    expect(chooseLandscape([{ rotation: 90, score: 35 }, { rotation: 270, score: 168 }])).toBe(270);
    expect(chooseLandscape([{ rotation: 90, score: 151 }, { rotation: 270, score: 35 }])).toBe(90);
    expect(chooseLandscape([{ rotation: 90, score: 39 }, { rotation: 270, score: 56 }])).toBe(270);
  });
  it("la egalitate lasă decizia profilului, care tot rotește", () => {
    expect(chooseLandscape([{ rotation: 90, score: 40 }, { rotation: 270, score: 42 }])).toBeUndefined();
    const turned = rotate(receipt(), 120, 220, 1);
    expect([90, 270]).toContain(pickRotation(turned.mask, turned.width, turned.height));
  });
});
