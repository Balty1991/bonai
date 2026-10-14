import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { receiptCategories, scanToPrefill, spreadReceiptDiscount, type ScannedReceipt } from "./receipt-scan";

function family(): AppData {
  const data = createEmptyAppData();
  return {
    ...data,
    settings: {
      ...data.settings,
      members: [{ id: "m1", name: "Andrei" }, { id: "m2", name: "Ana" }] as AppData["settings"]["members"],
      paymentSources: [
        { id: "card-a", name: "Card Andrei", kind: "card", memberId: "m1", openingBalance: 0 },
        { id: "cash-a", name: "Cash Andrei", kind: "cash", memberId: "m1", openingBalance: 0 },
        { id: "cash-b", name: "Cash Ana", kind: "cash", memberId: "m2", openingBalance: 0 },
        { id: "sgr", name: "Voucher SGR", kind: "voucher", openingBalance: 0 },
      ],
    },
  };
}

/** Bonul mototolit din Roșiori, așa cum îl citește modelul: 10 articole, 44,58 lei, numerar. */
const crumpled: ScannedReceipt = {
  store: "Robert I.I.",
  date: "2026-10-07",
  total: 44.58,
  confidence: "high",
  payments: [{ method: "cash", amount: 44.58 }],
  items: [
    { name: "Ulei Spornic bun la toate 1 L", quantity: 1, amount: 8.19, category: "Alimente" },
    { name: "Pepsi Cola Twist 1,5 L", quantity: 1, amount: 6.51, category: "Băuturi" },
    { name: "Napolitane Milka Choco 30 g", quantity: 1, amount: 2.69, category: "Dulciuri" },
    { name: "Sticks Croco ciocolată 80 g", quantity: 1, amount: 3, category: "Dulciuri" },
    { name: "Sacoșă", quantity: 1, amount: 1, category: "Sacoșe" },
    { name: "Salam șuncă feliat Cristim 100 g", quantity: 2, amount: 6.4, category: "Alimente" },
    { name: "Salam Victoria Cristim feliat 100 g", quantity: 1, amount: 3.5, category: "Alimente" },
    { name: "Crenvurști piept pui extra Cristim 250 g", quantity: 1, amount: 9.5, category: "Alimente" },
    { name: "Napolitane Dare ciocolată neagră 44 g", quantity: 1, amount: 3.29, category: "Dulciuri" },
    { name: "Garanție SGR", quantity: 1, amount: 0.5, category: "SGR" },
  ],
};

/** Bonul cu vodca: 39,76 lei, 28,50 din vouchere Returo și 11,26 numerar. */
const twoSources: ScannedReceipt = {
  store: "Sales Consulting",
  date: null,
  total: 39.76,
  confidence: "high",
  payments: [{ method: "cash", amount: 11.26 }, { method: "voucher", amount: 28.5 }],
  items: [
    { name: "Vodcă Stalinskaya 40% 0,5 L", quantity: 1, amount: 34.88, category: "Băuturi" },
    { name: "Garanție sticlă SGR", quantity: 1, amount: 0.5, category: "SGR" },
    { name: "Kinder Delice 39 g", quantity: 1, amount: 3.38, category: "Dulciuri" },
    { name: "Sacoșă maieu bio 35×60 cm", quantity: 1, amount: 1, category: "Sacoșe" },
  ],
};

/** Bonul Familia lung, cu două reduceri de 8,33% la baxurile de apă: 57,30 lei. */
const withDiscounts: ScannedReceipt = {
  store: "Familia",
  date: "2026-10-07",
  total: 57.3,
  confidence: "high",
  payments: [{ method: "cash", amount: 57.3 }],
  items: [
    { name: "Apă plată Aqua Carpatica Kids 0,25 L", quantity: 1, amount: 2.58, category: "Apă" },
    { name: "Garanție PET SGR", quantity: 1, amount: 0.5, category: "SGR" },
    { name: "Primola Papi lapte 26,8 g", quantity: 1, amount: 2.98, category: "Dulciuri" },
    { name: "Primola Papi lapte 26,8 g", quantity: 1, amount: 2.98, category: "Dulciuri" },
    { name: "Sacoșă maieu bio 35×60 cm", quantity: 1, amount: 1, category: "Sacoșe" },
    { name: "Pâine albă feliată Vel Pitar 300 g", quantity: 1, amount: 2.98, category: "Alimente" },
    { name: "Apă minerală carbogazoasă Perla Harghitei 2 L", quantity: 6, amount: 19.14, discount: 1.74, category: "Apă" },
    { name: "Garanție PET SGR", quantity: 6, amount: 3, category: "SGR" },
    { name: "Apă minerală plată Bucovina 2 L", quantity: 6, amount: 19.14, discount: 1.74, category: "Apă" },
    { name: "Garanție PET SGR", quantity: 6, amount: 3, category: "SGR" },
  ],
};

describe("scanToPrefill", () => {
  it("arată reducerile pe rândul produsului și le adună", () => {
    const prefill = scanToPrefill(withDiscounts, family(), "m1", "2026-10-07");
    expect(prefill.amount).toBe(57.3);
    expect(prefill.lines.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(57.3, 2);
    expect(prefill.warning).toBeUndefined();
    expect(prefill.discount).toBe(3.48);
    expect(prefill.lines[6]).toMatchObject({ label: "Apă minerală carbogazoasă Perla Harghitei 2 L × 6", discount: 1.74 });
    expect(prefill.lines[6].amount).toBe(19.14);
    expect(prefill.category).toBe("Apă");
    expect(prefill.lines.filter((line) => line.category === "SGR").reduce((sum, line) => sum + line.amount, 0)).toBe(6.5);
  });

  it("pune fiecare produs al bonului mototolit la categoria lui și păstrează totalul", () => {
    const prefill = scanToPrefill(crumpled, family(), "m1", "2026-10-07");
    expect(prefill.count).toBe(10);
    expect(prefill.amount).toBe(44.58);
    expect(prefill.lines.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(44.58, 2);
    expect(prefill.category).toBe("Alimente");
    expect(prefill.lines.find((line) => line.label.startsWith("Salam șuncă"))?.label).toBe("Salam șuncă feliat Cristim 100 g × 2");
    expect(prefill.lines.filter((line) => line.category === "SGR")).toHaveLength(1);
    expect(prefill.lines.filter((line) => line.category === "Sacoșe")).toHaveLength(1);
    expect(prefill.sourceId).toBe("cash-a");
    expect(prefill.second).toBeUndefined();
    expect(prefill.date).toBe("2026-10-07");
    expect(prefill.warning).toBeUndefined();
    expect(prefill.title).toContain("Robert");
  });

  it("împarte plata pe voucher SGR și numerar, cu un singur bon", () => {
    const prefill = scanToPrefill(twoSources, family(), "m2", "2026-10-07");
    expect(prefill.amount).toBe(39.76);
    expect(prefill.sourceId).toBe("sgr");
    expect(prefill.second).toEqual({ sourceId: "cash-b", amount: 11.26 });
    expect(prefill.category).toBe("Băuturi");
    expect(prefill.lines.map((line) => line.category)).toEqual(["Băuturi", "SGR", "Dulciuri", "Sacoșe"]);
    expect(prefill.date).toBeUndefined();
  });

  it("avertizează când articolele nu dau totalul și ignoră categoriile necunoscute", () => {
    const prefill = scanToPrefill({ ...crumpled, total: 50, items: [...crumpled.items.slice(0, 2), { name: "Ceva", quantity: 1, amount: 1, category: "Inventată" }] }, family(), "m1", "2026-10-07");
    expect(prefill.warning).toMatch(/Verifică/);
    expect(prefill.lines[2].category).toBe("Altele");
  });

  it("nu ia o dată din viitor sau prea veche", () => {
    expect(scanToPrefill({ ...crumpled, date: "2026-10-09" }, family(), "m1", "2026-10-07").date).toBeUndefined();
    expect(scanToPrefill({ ...crumpled, date: "2025-01-02" }, family(), "m1", "2026-10-07").date).toBeUndefined();
  });

  it("fără sursă de felul plății, lasă sursa aleasă de om", () => {
    const data = family();
    data.settings.paymentSources = data.settings.paymentSources.filter((source) => source.kind !== "voucher");
    const prefill = scanToPrefill(twoSources, data, "m1", "2026-10-07");
    expect(prefill.sourceId).toBeUndefined();
    expect(prefill.second).toBeUndefined();
  });
});

describe("bonul Sinsay", () => {
  /** Haine cu reduceri mari, plătite cash (51 date, 0,03 rest). */
  const sinsay: ScannedReceipt = {
    store: "Sinsay",
    date: "2026-08-31",
    total: 50.97,
    confidence: "high",
    payments: [{ method: "cash", amount: 50.97 }],
    items: [
      { name: "Ciorapi", quantity: 1, amount: 8.57, discount: 3.42, category: "Haine" },
      { name: "Teniși", quantity: 1, amount: 32.84, discount: 13.15, category: "Haine" },
      { name: "Jucărie", quantity: 1, amount: 8.56, discount: 3.43, category: "Consumabile copil" },
      { name: "Pungă", quantity: 1, amount: 1, category: "Sacoșe" },
    ],
  };
  it("pune hainele la Haine, cu reducerile lor", () => {
    const prefill = scanToPrefill(sinsay, family(), "m1", "2026-10-07");
    expect(prefill.title).toBe("Cumpărături Sinsay");
    expect(prefill.category).toBe("Haine");
    expect(prefill.discount).toBe(20);
    expect(prefill.date).toBe("2026-08-31");
    expect(prefill.lines.map((line) => line.category)).toEqual(["Haine", "Haine", "Consumabile copil", "Sacoșe"]);
    expect(prefill.lines[1]).toMatchObject({ label: "Teniși", discount: 13.15 });
    expect(prefill.warning).toBeUndefined();
  });
});

describe("receiptCategories", () => {
  it("trimite categoriile de cumpărături, fără credite, plus cele ale familiei", () => {
    const data = family();
    data.settings.customCategories = ["Animale"];
    const list = receiptCategories(data);
    expect(list).toContain("SGR");
    expect(list).toContain("Sacoșe");
    expect(list).not.toContain("SGR și sacoșe");
    expect(list).toContain("Animale");
    expect(list).not.toContain("Credite");
  });
});

describe("sursa „Voucher SGR” salvată ca tip card", () => {
  it("plata cu voucher merge pe ea, iar cea cu cardul pe cardul adevărat", async () => {
    const { createEmptyAppData } = await import("./finance-data");
    const data = createEmptyAppData();
    data.settings.paymentSources = [
      { id: "card", name: "Card Raiffeisen", kind: "card", openingBalance: 0 },
      { id: "v", name: "Voucher SGR", kind: "card", openingBalance: 0 },
    ];
    const prefill = scanToPrefill({ store: "Exflor", date: null, total: 20.36, items: [{ name: "Kinder", quantity: 1, amount: 20.36, category: "Dulciuri" }], payments: [{ method: "voucher", amount: 12 }, { method: "card", amount: 8.36 }], confidence: "high" }, data, undefined, "2026-10-08");
    expect(prefill.sourceId).toBe("v");
    expect(prefill.second).toEqual({ sourceId: "card", amount: 8.36 });
  });
});

describe("reducerea pe tot bonul (Pepco, 14 oct)", () => {
  const pepco: ScannedReceipt = {
    store: "Pepco", date: "2026-10-14", total: 69.67, confidence: "high", payments: [{ method: "card", amount: 69.67 }],
    items: [
      { name: "Accesorii păpuși", quantity: 1, amount: 50, category: "Altele" },
      { name: "Pulover bebeluși", quantity: 1, amount: 30, category: "Altele" },
      { name: "Papuci barefoot", quantity: 1, amount: 12, category: "Altele" },
      { name: "Sacoșă mică", quantity: 1, amount: 0.9, category: "Altele" },
    ],
  };

  it("25% de pe tot bonul se împarte pe articole și rândurile dau totalul", () => {
    const prefill = scanToPrefill(pepco, createEmptyAppData(), undefined, "2026-10-14");
    const sum = Math.round(prefill.lines.reduce((total, line) => total + line.amount, 0) * 100) / 100;
    expect(sum).toBe(69.67);
    expect(prefill.lines[0]).toMatchObject({ amount: 37.5, discount: 12.5 });
    expect(prefill.discount).toBeCloseTo(23.23, 2);
    expect(prefill.warning).toBeUndefined();
  });

  it("o diferență care nu e un procent rotund rămâne de verificat (probabil un rând citit greșit)", () => {
    expect(spreadReceiptDiscount([{ amount: 50 }, { amount: 30 }], 80, 71.3)).toBeUndefined();
    expect(scanToPrefill({ ...pepco, total: 81.5 }, createEmptyAppData(), undefined, "2026-10-14").warning).toBeDefined();
  });
});
