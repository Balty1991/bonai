import { describe, expect, it } from "vitest";
import { listItemsOnReceipt, tickFromReceipt, type ShoppingItem } from "./shopping-list";

const item = (id: string, text: string, done = false): ShoppingItem => ({ id, text, updatedAt: "2026-10-20T10:00:00.000Z", ...(done ? { done: true } : {}) });

describe("lista se bifează din bon", () => {
  const list = [item("a", "Lapte"), item("b", "Pâine"), item("c", "2 x ouă"), item("d", "Detergent vase"), item("e", "Cafea", true)];
  const labels = ["LAPTE ZUZU 1,5% 1L", "PAINE FELIATA 500G", "OUA M 10 BUC", "CAFEA JACOBS"];
  it("găsește produsele de pe bon, fără diacritice și fără cantități", () => {
    expect(listItemsOnReceipt(list.filter((x) => !x.done), labels).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("bifează doar ce era de luat, cu ora schimbării", () => {
    const next = tickFromReceipt(list, labels, "2026-10-21T12:00:00.000Z");
    expect(next.filter((x) => x.done).map((x) => x.id).sort()).toEqual(["a", "b", "c", "e"]);
    expect(next.find((x) => x.id === "e")?.updatedAt).toBe("2026-10-20T10:00:00.000Z");
    expect(next.find((x) => x.id === "d")?.done).toBeUndefined();
  });
  it("„Detergent vase” nu se bifează doar pentru „detergent rufe”", () => {
    expect(listItemsOnReceipt([item("d", "Detergent vase")], ["DETERGENT RUFE ARIEL"])).toEqual([]);
  });
});

describe("mai multe liste", () => {
  it("numele listelor se păstrează la normalizare și se citesc din produse", async () => {
    const { normalizeShoppingList, shoppingListNames, itemsOfList } = await import("./shopping-list");
    const list = normalizeShoppingList([
      { id: "a", text: "Lapte", updatedAt: "2026-10-20T10:00:00.000Z" },
      { id: "b", text: "Chipsuri", list: " Petrecere ", updatedAt: "2026-10-20T11:00:00.000Z" },
      { id: "c", text: "Cărbuni", list: "Weekend", updatedAt: "2026-10-20T12:00:00.000Z" },
      { id: "d", text: "Suc", list: "petrecere", updatedAt: "2026-10-20T13:00:00.000Z" },
    ]);
    expect(list.find((x) => x.id === "b")?.list).toBe("Petrecere");
    expect(shoppingListNames(list)).toEqual(["Petrecere", "Weekend"]);
    expect(itemsOfList(list, undefined).map((x) => x.id)).toEqual(["a"]);
    expect(itemsOfList(list, "Petrecere").map((x) => x.id)).toEqual(["b", "d"]);
  });
});
