import { describe, expect, it } from "vitest";
import { frequentProducts, mergeShoppingLists, normalizeShoppingList, splitShoppingText, visibleShopping } from "./shopping-list";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 2, 10, minutes)).toISOString();

describe("lista de cumpărături", () => {
  it("la unire câștigă modificarea mai nouă a aceluiași produs", () => {
    const local = [{ id: "a", text: "Lapte", done: true, updatedAt: at(5) }, { id: "b", text: "Pâine", updatedAt: at(1) }];
    const remote = [{ id: "a", text: "Lapte", updatedAt: at(2) }, { id: "c", text: "Ouă", updatedAt: at(3) }];
    const merged = mergeShoppingLists(local, remote);
    expect(merged.find((item) => item.id === "a")?.done).toBe(true);
    expect(merged.map((item) => item.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("un produs golit de partener nu revine de pe telefonul meu", () => {
    const merged = mergeShoppingLists([{ id: "a", text: "Lapte", done: true, updatedAt: at(1) }], [{ id: "a", text: "Lapte", done: true, cleared: true, updatedAt: at(4) }]);
    expect(visibleShopping(merged)).toEqual({ todo: [], done: [] });
  });

  it("curăță datele stricate și uită golirile mai vechi de 30 de zile", () => {
    const now = Date.parse(at(0));
    const list = normalizeShoppingList([
      { id: "a", text: "  Lapte  ", updatedAt: at(0) },
      { id: "a", text: "Dublură", updatedAt: at(0) },
      { id: "b", text: "", updatedAt: at(0) },
      { id: "c", text: "Vechi", cleared: true, updatedAt: "2026-08-01T10:00:00.000Z" },
      { id: "d", text: "Fără dată" },
      "nimic",
    ], now);
    expect(list).toEqual([{ id: "a", text: "Lapte", updatedAt: at(0) }]);
  });

  it("desparte ce se scrie dintr-o dată", () => {
    expect(splitShoppingText("lapte, pâine;  2 x ouă\nmere")).toEqual(["Lapte", "Pâine", "2 x ouă", "Mere"]);
  });
});

describe("lista de cumpărături în sincronizare", () => {
  it("se unește între două telefoane și supraviețuiește normalizării", async () => {
    const { mergeFamilyData } = await import("./family-crypto");
    const { createEmptyAppData, normalizeAppData } = await import("./finance-data");
    const mine = createEmptyAppData();
    const theirs = createEmptyAppData();
    mine.settings.shoppingList = [{ id: "a", text: "Lapte", done: true, updatedAt: at(5) }];
    theirs.settings.shoppingList = [{ id: "a", text: "Lapte", updatedAt: at(1) }, { id: "b", text: "Pâine", by: "m-maria", updatedAt: at(2) }];
    const merged = normalizeAppData(mergeFamilyData(mine, theirs));
    expect(merged.settings.shoppingList?.find((item) => item.id === "a")?.done).toBe(true);
    expect(merged.settings.shoppingList?.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });
});

describe("ce iei des, pentru lista goală", () => {
  const o = (key: string, label: string, date: string, category = "Alimente") => ({ key, label, date, category });
  it("produsele luate de cel puțin două ori, cele mai dese întâi, fără SGR și fără ce e deja pe listă", () => {
    const obs = [o("lapte", "Lapte Zuzu", "2026-09-01"), o("lapte", "Lapte Zuzu 1L", "2026-10-01"), o("lapte", "Lapte Zuzu 1L", "2026-10-10"),
      o("paine", "Pâine albă", "2026-10-02"), o("paine", "Pâine albă", "2026-10-12"), o("sgr", "Garanție SGR", "2026-10-02", "SGR"), o("sgr", "Garanție SGR", "2026-10-03", "SGR"),
      o("cafea", "Cafea", "2026-10-05"), o("ulei", "Ulei", "2026-05-01"), o("ulei", "Ulei", "2026-05-02")];
    expect(frequentProducts(obs, [], "2026-07-20")).toEqual(["Lapte Zuzu 1L", "Pâine albă"]);
    expect(frequentProducts(obs, [{ text: "lapte zuzu" }], "2026-07-20")).toEqual(["Pâine albă"]);
  });
});
