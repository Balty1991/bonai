/** Același corpus ca AI-ul, tipărit ca bon text: cât citesc regulile offline când textul e curat. */
import { describe, expect, it } from "vitest";
import { corpus as base } from "./receipt-corpus/cases";
import { corpusRo } from "./receipt-corpus/cases-ro";
import { parseReceiptText } from "./receipt-text-parse";

const n = (v: number) => v.toFixed(2).replace(".", ",");
const render = (c: (typeof corpusRo)[number]) => [
  c.input.store.toUpperCase(), "CIF: RO1234567",
  ...c.input.items.flatMap((i) => { const gross = i.amount + (i.discount || 0); return [i.name.toUpperCase(), `${String(i.quantity).replace(".", ",")} BUC X ${n(gross / i.quantity)} = ${n(gross)} A`, ...(i.discount ? [`REDUCERE -${n(i.discount)}`] : [])]; }),
  ...(c.input.total ? [`TOTAL LEI ${n(c.input.total)}`] : []), c.input.date ? c.input.date.split("-").reverse().join(".") : "",
].join("\n");

describe("regulile offline pe corpus (text curat)", () => {
  it("măsoară totalul și suma rândurilor", () => {
    const all = [...base, ...corpusRo];
    let total = 0, sum = 0;
    for (const c of all) {
      const r = parseReceiptText(render(c));
      if (Math.abs(r.total - c.input.total) < 0.011) total++;
      if (Math.abs(r.items.reduce((s, i) => s + i.amount, 0) - c.input.items.reduce((s, i) => s + i.amount, 0)) < 0.011) sum++;
    }
    console.log(`offline corpus: total ${total}/${all.length}, rânduri ${sum}/${all.length}`);
    expect(total / all.length).toBeGreaterThanOrEqual(0.95);
    expect(sum / all.length).toBeGreaterThanOrEqual(0.75);
  });
});
