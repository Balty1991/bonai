/**
 * Meniul săptămânii, ieftin: rețete românești simple, ordonate după ce cumperi deja (cămara din
 * bonuri) și după costul ingredientelor din prețurile TALE. Un ingredient fără preț în bonuri
 * rămâne „preț necunoscut” — nu estimăm nimic.
 */
import type { ProductObservation } from "./personal-inflation";

export type Recipe = { id: string; name: string; ingredients: Array<{ name: string; match: string[] }> };

export const RECIPES: Recipe[] = [
  { id: "ciorba-legume", name: "Ciorbă de legume", ingredients: [{ name: "cartofi", match: ["cartof"] }, { name: "morcovi", match: ["morcov"] }, { name: "ceapă", match: ["ceapa"] }, { name: "bulion", match: ["bulion", "pasta tomate"] }] },
  { id: "tocana-cartofi", name: "Tocăniță de cartofi", ingredients: [{ name: "cartofi", match: ["cartof"] }, { name: "ceapă", match: ["ceapa"] }, { name: "ulei", match: ["ulei"] }, { name: "bulion", match: ["bulion", "pasta tomate"] }] },
  { id: "omleta", name: "Omletă cu legume", ingredients: [{ name: "ouă", match: ["oua", "ou "] }, { name: "ardei", match: ["ardei"] }, { name: "brânză", match: ["branza", "telemea"] }] },
  { id: "paste-tomate", name: "Paste cu sos de roșii", ingredients: [{ name: "paste", match: ["paste", "spaghete", "penne"] }, { name: "bulion", match: ["bulion", "pasta tomate", "sos tomate"] }, { name: "cașcaval", match: ["cascaval"] }] },
  { id: "pui-cuptor", name: "Pulpe de pui la cuptor cu cartofi", ingredients: [{ name: "pulpe de pui", match: ["pulpe", "pui"] }, { name: "cartofi", match: ["cartof"] }, { name: "ulei", match: ["ulei"] }] },
  { id: "fasole", name: "Fasole bătută cu ceapă", ingredients: [{ name: "fasole", match: ["fasole"] }, { name: "ceapă", match: ["ceapa"] }, { name: "ulei", match: ["ulei"] }] },
  { id: "mamaliga", name: "Mămăligă cu brânză și smântână", ingredients: [{ name: "mălai", match: ["malai"] }, { name: "brânză", match: ["branza", "telemea"] }, { name: "smântână", match: ["smantana"] }] },
  { id: "orez-legume", name: "Orez cu legume", ingredients: [{ name: "orez", match: ["orez"] }, { name: "morcovi", match: ["morcov"] }, { name: "mazăre", match: ["mazare"] }, { name: "ceapă", match: ["ceapa"] }] },
  { id: "chiftele", name: "Chiftele cu piure", ingredients: [{ name: "carne tocată", match: ["tocata", "tocatura"] }, { name: "ouă", match: ["oua", "ou "] }, { name: "cartofi", match: ["cartof"] }, { name: "lapte", match: ["lapte"] }] },
  { id: "ciorba-perisoare", name: "Ciorbă de perișoare", ingredients: [{ name: "carne tocată", match: ["tocata", "tocatura"] }, { name: "orez", match: ["orez"] }, { name: "morcovi", match: ["morcov"] }, { name: "bulion", match: ["bulion"] }] },
  { id: "varza", name: "Varză călită", ingredients: [{ name: "varză", match: ["varza"] }, { name: "ceapă", match: ["ceapa"] }, { name: "bulion", match: ["bulion"] }] },
  { id: "clatite", name: "Clătite", ingredients: [{ name: "făină", match: ["faina"] }, { name: "lapte", match: ["lapte"] }, { name: "ouă", match: ["oua", "ou "] }] },
  { id: "salata-boeuf", name: "Salată de cartofi cu ou", ingredients: [{ name: "cartofi", match: ["cartof"] }, { name: "ouă", match: ["oua", "ou "] }, { name: "castraveți murați", match: ["castravet", "muraturi"] }] },
  { id: "pilaf-pui", name: "Pilaf cu pui", ingredients: [{ name: "orez", match: ["orez"] }, { name: "piept de pui", match: ["piept", "pui"] }, { name: "ceapă", match: ["ceapa"] }] },
];

const norm = (text: string) => ` ${text.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "")} `;

export type MenuIngredient = { name: string; price?: number; vendor?: string; product?: string; recent: boolean };
export type MenuDay = { recipe: Recipe; ingredients: MenuIngredient[]; knownCost: number; unknown: number };

/** Ultimul preț plătit pe un ambalaj, din bonurile tale, pentru primul produs care se potrivește. */
function priceFor(match: string[], observations: ReadonlyArray<ProductObservation>, since: string) {
  let best: ProductObservation | undefined;
  for (const o of observations) {
    const label = norm(`${o.brand || ""} ${o.label}`);
    if (!match.some((m) => label.includes(m))) continue;
    if (!best || o.date > best.date) best = o;
  }
  return best ? { price: best.piecePrice, vendor: best.vendor, product: best.label, recent: best.date >= since } : undefined;
}

export function weeklyMenu(observations: ReadonlyArray<ProductObservation>, today: string, days = 7): MenuDay[] {
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const scored = RECIPES.map((recipe) => {
    const ingredients: MenuIngredient[] = recipe.ingredients.map((ing) => {
      const hit = priceFor(ing.match, observations, since);
      return hit ? { name: ing.name, price: hit.price, vendor: hit.vendor, product: hit.product, recent: hit.recent } : { name: ing.name, recent: false };
    });
    const knownCost = Math.round(ingredients.reduce((sum, i) => sum + (i.price || 0), 0) * 100) / 100;
    const unknown = ingredients.filter((i) => i.price === undefined).length;
    const recent = ingredients.filter((i) => i.recent).length;
    return { recipe, ingredients, knownCost, unknown, recent };
  });
  // Întâi rețetele cu cele mai multe ingrediente cumpărate recent, apoi cele cu prețuri cunoscute, apoi cele mai ieftine.
  scored.sort((a, b) => b.recent - a.recent || a.unknown - b.unknown || a.knownCost - b.knownCost || a.recipe.name.localeCompare(b.recipe.name, "ro"));
  return scored.slice(0, days).map(({ recipe, ingredients, knownCost, unknown }) => ({ recipe, ingredients, knownCost, unknown }));
}
