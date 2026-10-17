/** Acuratețea parserului pe corpus: fiecare câmp verificat contează; pragul blochează CI-ul. */
import { describe, expect, it } from "vitest";
import { createEmptyAppData } from "./finance-data";
import { scanToPrefill } from "./receipt-scan";
import { CORPUS_TODAY, corpus as base } from "./receipt-corpus/cases";
import { corpusRo } from "./receipt-corpus/cases-ro";

const corpus = [...base, ...corpusRo];

const THRESHOLD = 1; // corpusul curent trebuie citit perfect; scade doar cu justificare în ARHITECTURA.md
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;

describe("corpusul de bonuri românești", () => {
  const data = createEmptyAppData();
  let checks = 0;
  let ok = 0;
  const misses: string[] = [];
  for (const item of corpus) {
    const got = scanToPrefill(item.input, data, undefined, CORPUS_TODAY);
    const fields: Array<[string, boolean]> = [
      ["total", near(got.amount, item.expect.total)],
      ["date", got.date === item.expect.date],
      ["count", got.count === item.expect.count],
      ["discount", near(got.discount, item.expect.discount)],
      ["warning", Boolean(got.warning) === item.expect.warning],
      ["title", got.title === item.expect.title],
      ["lines-sum", !item.expect.warning ? near(got.lines.reduce((s, l) => s + l.amount, 0), item.expect.total) : true],
    ];
    for (const [name, pass] of fields) { checks += 1; if (pass) ok += 1; else misses.push(`${item.id}:${name}`); }
  }
  it(`acuratețe ≥ ${THRESHOLD * 100}% pe ${corpus.length} bonuri`, () => {
    expect(misses).toEqual([]);
    expect(ok / checks).toBeGreaterThanOrEqual(THRESHOLD);
  });
});
