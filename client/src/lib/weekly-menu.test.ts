import { describe, expect, it } from "vitest";
import type { ProductObservation } from "./personal-inflation";
import { RECIPES, ingredientMatches, weeklyMenu } from "./weekly-menu";

const o = (label: string, date: string, piecePrice: number): ProductObservation => ({ key: label, label, vendor: "Lidl", date, category: "Alimente", paid: piecePrice, price: piecePrice, per: "buc", piecePrice });

describe("meniul săptămânii", () => {
  it("fără bonuri: toate prețurile sunt necunoscute, nimic inventat", () => {
    const menu = weeklyMenu([], "2026-10-18");
    expect(menu).toHaveLength(7);
    expect(menu.every((d) => d.knownCost === 0 && d.ingredients.every((i) => i.price === undefined))).toBe(true);
  });
  it("întâi ce cumperi deja, cu prețul tău cel mai recent", () => {
    const rows = [o("Ouă M 10 buc", "2026-10-15", 12.5), o("Ouă M 10 buc", "2026-09-01", 10), o("Făină 000 1kg", "2026-10-10", 4), o("Lapte 1,5% 1L", "2026-10-12", 7)];
    const first = weeklyMenu(rows, "2026-10-18")[0];
    expect(first.recipe.id).toBe("clatite");
    expect(first.unknown).toBe(0);
    expect(first.knownCost).toBe(23.5);
  });
  it("potrivește doar substantivul principal: ciocolata cu lapte nu e lapte, supa de pui nu e pui", () => {
    expect(ingredientMatches("Ciocolată cu lapte 100g", ["lapte"])).toBe(false);
    expect(ingredientMatches("Lapte 1,5% 1L", ["lapte"])).toBe(true);
    expect(ingredientMatches("Supă de pui instant", ["pulpe", "pui"])).toBe(false);
    expect(ingredientMatches("Pulpe pui dezosate", ["pulpe", "pui"])).toBe(true);
    expect(ingredientMatches("Carne tocată porc vită", ["tocata"])).toBe(true);
    expect(ingredientMatches("Biscuiți cu unt și ouă", ["oua", "ou "])).toBe(false);
    expect(ingredientMatches("Pastă de tomate 24%", ["bulion", "pasta de tomate"])).toBe(true);
    expect(ingredientMatches("Pasta tomate 24%", ["bulion", "pasta tomate"])).toBe(true);
    expect(ingredientMatches("Cartofi albi", ["cartof"])).toBe(true);
    expect(ingredientMatches("Chipsuri cartofi", ["cartof"])).toBe(false);
  });
  it("rețetele au id-uri unice", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });
});
