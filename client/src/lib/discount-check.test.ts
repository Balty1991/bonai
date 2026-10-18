import { describe, expect, it } from "vitest";
import { checkReceiptLines, rememberShelf, readShelfSeen } from "./discount-check";
import type { ProductObservation } from "./personal-inflation";
import { normalizeProductKey } from "./price-history";

const obs = (label: string, vendor: string, date: string, piecePrice: number): ProductObservation => ({ key: normalizeProductKey(label)!, label, vendor, date, category: "Alimente", paid: piecePrice, price: piecePrice, per: "buc", piecePrice });
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe("verifică reducerile", () => {
  it("semnalează prețul de pe bon peste cel văzut la raft (promoție care n-a trecut)", () => {
    const shelf = [{ key: normalizeProductKey("Cafea Jacobs 250g")!, label: "Cafea Jacobs 250g", price: 17.99, date: "2026-10-17", promo: true }];
    const flags = checkReceiptLines([{ label: "Cafea Jacobs 250g", amount: 43.8, qty: 2 }], "Lidl", "2026-10-18", [], shelf);
    expect(flags).toEqual([expect.objectContaining({ kind: "shelf", charged: 21.9, expected: 17.99, diff: 7.82, promo: true })]);
  });
  it("semnalează un salt mare față de data trecută la același magazin, nu și când rândul are reducere", () => {
    const history = [obs("Ulei Spornic 1L", "Lidl", "2026-10-05", 7.5), obs("Ulei Spornic 1L", "Kaufland", "2026-10-10", 6)];
    expect(checkReceiptLines([{ label: "Ulei Spornic 1L", amount: 9.9 }], "LIDL DISCOUNT", "2026-10-18", history, [])).toEqual([expect.objectContaining({ kind: "jump", expected: 7.5, pct: 32 })]);
    expect(checkReceiptLines([{ label: "Ulei Spornic 1L", amount: 9.9, discount: 1 }], "Lidl", "2026-10-18", history, [])).toEqual([]);
    expect(checkReceiptLines([{ label: "Ulei Spornic 1L", amount: 7.9 }], "Lidl", "2026-10-18", history, [])).toEqual([]);
  });
  it("păstrează prețurile de raft pe telefon, ultimul câștigă", () => {
    const s = mem();
    rememberShelf({ key: "cafea", label: "Cafea", price: 18, date: "2026-10-17" }, "2026-10-18", s);
    rememberShelf({ key: "cafea", label: "Cafea", price: 17, date: "2026-10-18" }, "2026-10-18", s);
    expect(readShelfSeen(s)).toEqual([{ key: "cafea", label: "Cafea", price: 17, date: "2026-10-18" }]);
  });
});
