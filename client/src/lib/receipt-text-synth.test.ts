/** Regulile offline pe textul celor 40 de bonuri sintetice (toate lanțurile, cântărite, reduceri, SGR, carburant). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReceiptText } from "./receipt-text-parse";

type Truth = { id: string; store: string; date: string; total: number; items: number; text: string };
const truth = JSON.parse(readFileSync(new URL("../../../e2e/receipts-synth/truth.json", import.meta.url), "utf8")) as Truth[];

describe("regulile offline pe textul bonurilor sintetice", () => {
  it("citește totalul, data, magazinul și rândurile", () => {
    const miss: string[] = []; const score = { total: 0, date: 0, store: 0, items: 0, sum: 0 };
    for (const c of truth) {
      const r = parseReceiptText(c.text);
      const sum = Math.round(r.items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
      const ok = { total: Math.abs(r.total - c.total) < 0.011, date: r.date === c.date, store: r.store === c.store, items: r.items.length === c.items, sum: Math.abs(sum - c.total) < 0.011 };
      for (const k of Object.keys(ok) as Array<keyof typeof ok>) if (ok[k]) score[k]++; else miss.push(`${c.id}:${k}${k === "sum" ? `=${sum}≠${c.total}` : k === "items" ? `=${r.items.length}≠${c.items}` : k === "store" ? `=${r.store}` : ""}`);
    }
    console.log(`sintetic text: ${JSON.stringify(score)} din ${truth.length}\n${miss.join("\n")}`);
    expect(miss).toEqual([]);
  });
});
