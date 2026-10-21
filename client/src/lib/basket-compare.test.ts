import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { basketCompare, basketKeys } from "./basket-compare";
import { cheaperInCity, communityFacts, communityOutside } from "./community-prices";
import { productObservations } from "./personal-inflation";
import { referralText } from "./referral";

const line = (id: string, label: string, amount: number) => ({ id, category: "Alimente", amount, label });
const data = (): AppData => {
  const d = createEmptyAppData();
  d.receipts = [
    { id: "l1", vendor: "Lidl", amount: 0, category: "Alimente", date: "2026-09-10", lines: [line("a", "Lapte Zuzu", 8), line("b", "Paine Vel Pitar", 5), line("c", "Oua 10 buc", 12), line("s", "Garantie SGR", 0.5)] },
    { id: "k1", vendor: "Kaufland", amount: 0, category: "Alimente", date: "2026-10-02", lines: [line("a", "Lapte Zuzu", 9), line("b", "Paine Vel Pitar", 6), line("c", "Oua 10 buc", 14)] },
    { id: "l2", vendor: "Lidl", amount: 0, category: "Alimente", date: "2026-10-15", lines: [line("a", "Lapte Zuzu", 8), line("b", "Paine Vel Pitar", 5), line("c", "Oua 10 buc", 12)] },
  ];
  d.receipts[0].lines![3].category = "SGR";
  return d;
};

describe("coșul la fiecare magazin", () => {
  it("pune produsele luate des la prețul fiecărui magazin și arată cel mai ieftin", () => {
    const basket = basketCompare(data(), "2026-10-20")!;
    expect(basket.items.map((item) => item.label).sort()).toEqual(["Lapte Zuzu", "Oua 10 buc", "Paine Vel Pitar"]);
    expect(basket.cheapest?.vendor).toBe("Lidl");
    expect(basket.stores.map((store) => store.vendor)).toEqual(["Lidl", "Kaufland"]);
    expect(basket.stores[1].diff).toBeCloseTo(basket.stores[1].total - basket.stores[0].total, 2);
    expect(basket.stores.every((store) => store.estimated === 0)).toBe(true);
    expect(basket.stores[1].total).toBeGreaterThan(basket.stores[0].total);
  });

  it("fără două magazine nu compară nimic; cu prețurile comunității apare și magazinul unde n-ai fost", () => {
    const d = data();
    d.receipts = d.receipts.filter((receipt) => receipt.vendor === "Lidl");
    d.receipts.push({ ...d.receipts[1], id: "l3", date: "2026-10-18" });
    expect(basketCompare(d, "2026-10-20")).toBeUndefined();
    const keys = basketKeys(d, "2026-10-20");
    expect(keys).toHaveLength(3);
    const penny = (label: string) => (label.startsWith("lapte") ? 6 : label.startsWith("paine") ? 4 : 500);
    const cache = { city: "rosiori", at: Date.now(), prices: Object.fromEntries(keys.map((key) => [`${key.k}|${key.per}`, { Penny: { price: penny(key.k), n: 3 } }])) };
    const community = communityOutside(cache);
    const basket = basketCompare(d, "2026-10-20", community.outside, community.vendors)!;
    expect(basket.cheapest?.vendor).toBe("Penny");
    // Ouăle la 500 lei sunt o greșeală: rămân la prețul tău mediu, ca estimate.
    expect(basket.stores[0]).toMatchObject({ vendor: "Penny", known: 2, estimated: 1 });
  });
});

describe("promoțiile nu fac un magazin mai ieftin", () => {
  it("compară la prețul obișnuit, fără reducerea de pe bon", () => {
    const d = data();
    // La Kaufland laptele a fost o dată la promoție: 4 lei plătiți, 5 lei reducere (9 lei de obicei).
    d.receipts.push({ id: "k2", vendor: "Kaufland", amount: 0, category: "Alimente", date: "2026-10-19", lines: [{ ...line("a", "Lapte Zuzu", 4), discount: 5 }] });
    const basket = basketCompare(d, "2026-10-20")!;
    expect(basket.cheapest?.vendor).toBe("Lidl");
    const facts = communityFacts(d, "2026-10-18", "2026-10-20");
    expect(facts.find((fact) => fact.v === "Kaufland")?.p).toBe(9);
  });
});

describe("prețurile comunității", () => {
  it("trimite doar produsul, unitatea, prețul, magazinul și luna, fără SGR și fără ce s-a trimis deja", () => {
    const facts = communityFacts(data(), "2026-10-05", "2026-10-20");
    expect(facts.every((fact) => Object.keys(fact).sort().join(",") === "k,m,p,per,v")).toBe(true);
    expect(facts.map((fact) => fact.v)).toEqual(["Lidl", "Lidl", "Lidl"]);
    expect(facts.every((fact) => fact.m === "2026-10")).toBe(true);
    expect(communityFacts(data(), undefined, "2026-10-20").some((fact) => fact.k.includes("sgr") || fact.k.includes("garantie"))).toBe(false);
  });
});

describe("recomandă BonAI", () => {
  it("are linkul și nu inventează economii", () => {
    const text = referralText(createEmptyAppData(), "2026-10-20", "https://play.example/bonai");
    expect(text).toContain("https://play.example/bonai");
    expect(text).not.toContain("economisit");
  });
});

describe("mai ieftin în oraș, după bon", () => {
  it("arată doar alt lanț, vizibil mai ieftin, cu cea mai mare diferență întâi", () => {
    const items = productObservations(data()).filter((item) => item.receiptId === "k1");
    const keyOf = (label: string) => items.find((item) => item.label === label)!;
    const lapte = keyOf("Lapte Zuzu"), paine = keyOf("Paine Vel Pitar"), oua = keyOf("Oua 10 buc");
    const prices: Record<string, Record<string, { price: number; n: number }>> = {
      [`${lapte.key}|${lapte.per}`]: { "Lidl Rosiori": { price: 8, n: 4 }, "Kaufland": { price: 7, n: 9 } },
      [`${paine.key}|${paine.per}`]: { Penny: { price: 4.5, n: 3 } },
      [`${oua.key}|${oua.per}`]: { Penny: { price: 13.8, n: 3 } },
    };
    const cache = { city: "rosiori", at: Date.now(), prices };
    const deals = cheaperInCity(items, cache);
    expect(deals.map((deal) => [deal.label, deal.vendor, deal.price])).toEqual([["Paine Vel Pitar", "Penny", 4.5], ["Lapte Zuzu", "Lidl Rosiori", 8]]);
    expect(cheaperInCity(items, undefined)).toEqual([]);
  });
});
