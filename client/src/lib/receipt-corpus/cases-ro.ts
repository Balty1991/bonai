/**
 * Corpusul extins: bonuri sintetice, etichetate de mână, în formatele magazinelor din România
 * (Lidl, Kaufland, Carrefour, Mega Image, Profi, Auchan, Penny, dm, farmacii). Sumele sunt
 * construite pentru test și NU sunt observații de preț. Fiecare caz spune ce trebuie să iasă.
 */
import type { ScannedReceipt } from "../receipt-scan";
import type { CorpusCase } from "./cases";

type Item = [name: string, qty: number, amount: number, category: string, discount?: number];
type Pay = ScannedReceipt["payments"][number]["method"];

function rc(id: string, store: string, date: string | null, items: Item[], total: number, pay: Pay | Array<[Pay, number]>, expect: Partial<CorpusCase["expect"]> & { count: number; discount: number }, confidence: ScannedReceipt["confidence"] = "high"): CorpusCase {
  const payments = typeof pay === "string" ? [{ method: pay, amount: total }] : pay.map(([method, amount]) => ({ method, amount }));
  return {
    id,
    input: { store, date, total, confidence, payments, items: items.map(([name, quantity, amount, category, discount]) => ({ name, quantity, amount, category, ...(discount ? { discount } : {}) })) },
    expect: { total: expect.total ?? total, date: expect.date === undefined && date && date <= "2026-10-18" && date >= "2026-08-19" ? date : expect.date, count: expect.count, discount: expect.discount, warning: expect.warning ?? false, title: expect.title ?? (store ? `Cumpărături ${store}` : "Cumpărături") },
  };
}

export const corpusRo: CorpusCase[] = [
  // Lidl: reduceri Lidl Plus pe rând, cântărite, SGR
  rc("lidl-plus-doua-reduceri", "Lidl", "2026-10-14", [["Iaurt grecesc 400g", 2, 11.98, "Alimente", 2], ["Roșii cherry 250g", 1, 5.49, "Alimente"], ["Apă minerală 2L", 3, 7.47, "Băuturi"], ["Garanție SGR", 3, 1.5, "SGR"]], 26.44, "card", { count: 4, discount: 2 }),
  rc("lidl-cantarite", "Lidl", "2026-10-13", [["Mere Golden", 1.234, 6.16, "Alimente"], ["Banane", 0.98, 5.87, "Alimente"], ["Cartofi albi", 2.5, 7.48, "Alimente"]], 19.51, "cash", { count: 3, discount: 0 }),
  rc("lidl-produs-gratuit", "Lidl", "2026-10-12", [["Vin spumant 0,75L", 1, 25.99, "Băuturi"], ["Pâine feliată", 1, 4.99, "Alimente"]], 4.99, "card", { count: 2, discount: 25.99 }),
  rc("lidl-tichete-si-card", "Lidl", "2026-10-11", [["Ulei floarea-soarelui 1L", 2, 15.98, "Alimente"], ["Zahăr 1kg", 1, 4.49, "Alimente"], ["Făină 000 1kg", 2, 7.98, "Alimente"]], 28.45, [["meal", 20], ["card", 8.45]], { count: 3, discount: 0 }),
  rc("lidl-reducere-necitita-pe-rand", "Lidl", "2026-10-10", [["Cafea boabe 1kg", 1, 59.99, "Alimente", 15], ["Lapte 3,5% 1L", 1, 6.49, "Alimente"]], 51.48, "card", { count: 2, discount: 15 }),
  // Kaufland: Kaufland Card, cupon, voucher SGR
  rc("kaufland-card-mixt", "Kaufland", "2026-10-15", [["Piept de pui 1kg", 1, 27.9, "Alimente", 3], ["Detergent rufe 2L", 1, 39.9, "Casă & facturi"], ["Hârtie igienică 10 role", 1, 21.5, "Casă & facturi"]], 89.3, "card", { count: 3, discount: 3 }),
  rc("kaufland-voucher-sgr", "Kaufland", "2026-10-09", [["Bere 0,5L", 6, 23.94, "Băuturi"], ["Garanție SGR", 6, 3, "SGR"], ["Chipsuri 140g", 1, 6.99, "Dulciuri"]], 33.93, [["card", 30.93], ["voucher", 3]], { count: 3, discount: 0 }),
  rc("kaufland-10-la-suta-tot-bonul", "Kaufland", "2026-10-08", [["Tigaie 28cm", 1, 80, "Casă & facturi"], ["Spatulă", 1, 20, "Casă & facturi"]], 90, "card", { count: 2, discount: 10 }),
  rc("kaufland-sacosa", "Kaufland", "2026-10-07", [["Sacoșă rafie", 1, 2.5, "Sacoșe"], ["Lapte UHT 1L", 4, 27.96, "Alimente"]], 30.46, "cash", { count: 2, discount: 0 }),
  rc("kaufland-total-lipsa", "Kaufland", "2026-10-06", [["Morcovi 1kg", 1, 3.99, "Alimente"], ["Ceapă 1kg", 1, 2.99, "Alimente"]], 0, "cash", { count: 2, discount: 0, total: 6.98 }),
  // Carrefour: puncte, mai multe pagini
  rc("carrefour-lung", "Carrefour", "2026-10-16", [["Pastă de dinți", 1, 12.49, "Sănătate"], ["Șampon 400ml", 1, 18.99, "Sănătate"], ["Brânză telemea 500g", 1, 19.9, "Alimente"], ["Salam 300g", 1, 15.49, "Alimente"], ["Suc portocale 1L", 2, 13.98, "Băuturi"], ["Biscuiți", 3, 8.97, "Dulciuri"], ["Cereale 500g", 1, 14.49, "Alimente"], ["Ouă M 10 buc", 1, 13.99, "Alimente"]], 118.3, "card", { count: 8, discount: 0 }),
  rc("carrefour-reducere-25", "Carrefour", "2026-10-05", [["Geacă copii", 1, 120, "Haine"], ["Căciulă", 1, 40, "Haine"]], 120, "card", { count: 2, discount: 40 }),
  rc("carrefour-rand-gresit", "Carrefour", "2026-10-04", [["Unt 200g", 1, 9.99, "Alimente"], ["Smântână 20%", 1, 51.9, "Alimente"]], 15.18, "card", { count: 2, discount: 0, warning: true }, "medium"),
  rc("carrefour-numerar-si-card", "Carrefour", "2026-10-03", [["Mașină de tocat", 1, 199, "Casă & facturi"]], 199, [["cash", 100], ["card", 99]], { count: 1, discount: 0 }),
  rc("carrefour-data-veche", "Carrefour", "2026-06-01", [["Cafea 250g", 1, 17.9, "Alimente"]], 17.9, "card", { count: 1, discount: 0, date: undefined }),
  // Mega Image: Mega Image Card, bonuri mici
  rc("mega-mic", "Mega Image", "2026-10-17", [["Croissant", 2, 7.98, "Alimente"], ["Cafea la pahar", 1, 6.5, "Băuturi"]], 14.48, "card", { count: 2, discount: 0 }),
  rc("mega-card-reduceri", "Mega Image", "2026-10-16", [["Mozzarella 125g", 2, 9.18, "Alimente", 1.8], ["Rucola 100g", 1, 6.99, "Alimente", 1], ["Prosciutto 80g", 1, 12.49, "Alimente"]], 28.66, "card", { count: 3, discount: 2.8 }),
  rc("mega-poza-slaba", "Mega Image", "2026-10-15", [["Apă plată 0,5L", 2, 4.98, "Băuturi"]], 4.98, "cash", { count: 1, discount: 0, warning: true }, "low"),
  rc("mega-sgr-sticle", "Mega Image", "2026-10-14", [["Cola 2L", 2, 17.98, "Băuturi"], ["Garanție SGR", 2, 1, "SGR"]], 18.98, "card", { count: 2, discount: 0 }),
  rc("mega-data-viitor", "Mega Image", "2026-12-01", [["Pâine", 1, 5.5, "Alimente"]], 5.5, "cash", { count: 1, discount: 0, date: undefined }),
  // Profi: magazin de cartier
  rc("profi-cartier", "Profi", "2026-10-17", [["Pâine albă", 1, 3.89, "Alimente"], ["Lapte 1L", 1, 6.79, "Alimente"], ["Țigări", 1, 26, "Altele"]], 36.68, "cash", { count: 3, discount: 0 }),
  rc("profi-reducere", "Profi", "2026-10-12", [["Detergent vase 900ml", 1, 9.9, "Casă & facturi", 3]], 9.9, "card", { count: 1, discount: 3 }),
  rc("profi-tichete", "Profi", "2026-10-11", [["Carne tocată 500g", 1, 16.9, "Alimente"], ["Paste 500g", 2, 9.98, "Alimente"]], 26.88, "meal", { count: 2, discount: 0 }),
  rc("profi-categorie-necunoscuta", "Profi", "2026-10-10", [["Baterii AA", 1, 14.99, "Electronice"]], 14.99, "card", { count: 1, discount: 0 }),
  rc("profi-rand-zero", "Profi", "2026-10-09", [["Pungă", 1, 0, "Sacoșe"], ["Covrigi", 2, 4, "Alimente"]], 4, "cash", { count: 1, discount: 0 }),
  // Auchan
  rc("auchan-mare", "Auchan", "2026-10-15", [["Orez 1kg", 2, 11.98, "Alimente"], ["Fasole boabe 1kg", 1, 9.49, "Alimente"], ["Ulei măsline 0,5L", 1, 34.9, "Alimente", 5], ["Detergent 3L", 1, 49.9, "Casă & facturi"], ["Burete vase 5 buc", 1, 4.5, "Casă & facturi"]], 110.77, "card", { count: 5, discount: 5 }),
  rc("auchan-20-la-suta", "Auchan", "2026-10-02", [["Cuptor microunde", 1, 400, "Casă & facturi"], ["Set farfurii", 1, 100, "Casă & facturi"]], 400, "card", { count: 2, discount: 100 }),
  rc("auchan-fara-magazin", "", "2026-10-13", [["Banane", 1.2, 7.18, "Alimente"]], 7.18, "cash", { count: 1, discount: 0 }),
  rc("auchan-voucher-si-card", "Auchan", "2026-10-12", [["Apă 6x2L", 1, 14.99, "Băuturi"], ["Garanție SGR", 6, 3, "SGR"]], 17.99, [["card", 14.99], ["voucher", 3]], { count: 2, discount: 0 }),
  rc("auchan-greutate-mica", "Auchan", "2026-10-11", [["Măsline vrac", 0.256, 8.95, "Alimente"]], 8.95, "card", { count: 1, discount: 0 }),
  // Penny
  rc("penny-simplu", "Penny", "2026-10-16", [["Ciocolată 100g", 2, 9.98, "Dulciuri"], ["Napolitane", 3, 6.87, "Dulciuri"]], 16.85, "cash", { count: 2, discount: 0 }),
  rc("penny-reducere-rand", "Penny", "2026-10-14", [["Detergent capsule", 1, 39.99, "Casă & facturi", 10], ["Balsam rufe", 1, 14.99, "Casă & facturi"]], 54.98, "card", { count: 2, discount: 10 }),
  rc("penny-gratuit-al-doilea", "Penny", "2026-10-13", [["Suc 2L", 1, 7.49, "Băuturi"], ["Suc 2L gratuit", 1, 7.49, "Băuturi"]], 7.49, "card", { count: 2, discount: 7.49 }),
  rc("penny-diferenta-ciudata", "Penny", "2026-10-12", [["Cașcaval 400g", 1, 18.99, "Alimente"], ["Salam", 1, 12.37, "Alimente"]], 27, "cash", { count: 2, discount: 0, warning: true }),
  rc("penny-tichete-doua", "Penny", "2026-10-08", [["Cumpărături diverse", 1, 75, "Alimente"]], 75, [["meal", 60], ["cash", 15]], { count: 1, discount: 0 }),
  // dm: cosmetice, bebeluși
  rc("dm-copil", "dm", "2026-10-15", [["Scutece mărimea 4", 1, 54.95, "Consumabile copil"], ["Șervețele umede", 3, 20.85, "Consumabile copil"]], 75.8, "card", { count: 2, discount: 0 }),
  rc("dm-reducere", "dm", "2026-10-11", [["Cremă de față", 1, 29.95, "Sănătate", 6], ["Gel de duș", 2, 19.9, "Sănătate"]], 49.85, "card", { count: 2, discount: 6 }),
  rc("dm-15-la-suta", "dm", "2026-10-07", [["Parfum", 1, 160, "Sănătate"], ["Deodorant", 1, 40, "Sănătate"]], 170, "card", { count: 2, discount: 30 }),
  rc("dm-cash", "dm", "2026-10-06", [["Periuță de dinți", 2, 15.9, "Sănătate"]], 15.9, "cash", { count: 1, discount: 0 }),
  rc("dm-ilizibil", "dm", "2026-10-05", [["Produs", 1, 9.95, "Sănătate"]], 9.95, "card", { count: 1, discount: 0, warning: true }, "low"),
  // Farmacii
  rc("catena-reteta", "Catena", "2026-10-16", [["Paracetamol 500mg", 1, 8.5, "Sănătate"], ["Vitamina C", 1, 24.9, "Sănătate"]], 33.4, "card", { count: 2, discount: 0 }),
  rc("helpnet-compensat", "Help Net", "2026-10-14", [["Medicament compensat", 1, 12.3, "Sănătate", 30]], 12.3, "card", { count: 1, discount: 30 }),
  rc("dona-mixt", "Dona", "2026-10-12", [["Sirop tuse", 1, 32.5, "Sănătate"], ["Termometru", 1, 45, "Sănătate"]], 77.5, [["cash", 50], ["card", 27.5]], { count: 2, discount: 0 }),
  rc("sensiblu-card-fidelitate", "Sensiblu", "2026-10-10", [["Probiotic", 1, 49.9, "Sănătate", 10], ["Plasturi", 1, 9.9, "Sănătate"]], 59.8, "card", { count: 2, discount: 10 }),
  rc("farmacia-tei-rand-gresit", "Farmacia Tei", "2026-10-09", [["Ibuprofen", 1, 11.2, "Sănătate"], ["Magneziu", 1, 92.5, "Sănătate"]], 40.7, "card", { count: 2, discount: 0, warning: true }, "medium"),
  // Linii de reducere tipărite separat (negative), pe care modelul le întoarce ca rânduri proprii
  rc("lidl-linie-reducere-negativa", "Lidl", "2026-10-17", [["Brânză Gouda 300g", 1, 15.99, "Alimente"], ["Reducere", 1, -4, "Alimente"], ["Lapte 1L", 1, 6.49, "Alimente"]], 18.48, "card", { count: 2, discount: 4 }),
  rc("kaufland-doua-linii-negative", "Kaufland", "2026-10-17", [["Cafea 500g", 1, 32.99, "Alimente"], ["Discount K-Card", 1, -6.6, "Alimente"], ["Ciocolată", 2, 11.98, "Dulciuri"], ["Reducere", 1, -2, "Dulciuri"]], 36.37, "card", { count: 2, discount: 8.6 }),
];
