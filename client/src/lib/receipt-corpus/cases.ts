/**
 * Corpusul de bonuri: ce întoarce modelul (readReceipt) pentru bonuri românești tipice și ce trebuie să
 * vadă omul în ecranul de verificare. Bonurile sunt construite pentru test (formate reale: SGR,
 * reduceri, cântărite, plăți mixte), nu sunt observații de preț. Se adaugă câte un caz la fiecare bon
 * citit greșit în producție.
 */
import type { ScannedReceipt } from "../receipt-scan";

export type CorpusCase = {
  id: string;
  input: ScannedReceipt;
  expect: { total: number; date?: string; count: number; discount: number; warning: boolean; title: string };
};

const today = "2026-10-18";
export const CORPUS_TODAY = today;

export const corpus: CorpusCase[] = [
  {
    id: "hipermarket-card-sgr",
    input: { store: "Kaufland", date: "2026-10-15", total: 31.48, confidence: "high", payments: [{ method: "card", amount: 31.48 }], items: [
      { name: "Lapte 1,5% 1 L", quantity: 2, amount: 13.98, category: "Alimente" },
      { name: "Apă plată 2 L", quantity: 1, amount: 3.5, category: "Băuturi" },
      { name: "Garanție SGR", quantity: 1, amount: 0.5, category: "SGR" },
      { name: "Pâine albă 500 g", quantity: 1, amount: 13.5, category: "Alimente" },
    ] },
    expect: { total: 31.48, date: "2026-10-15", count: 4, discount: 0, warning: false, title: "Cumpărături Kaufland" },
  },
  {
    id: "reducere-pe-rand",
    input: { store: "Lidl", date: "2026-10-16", total: 20, confidence: "high", payments: [{ method: "cash", amount: 20 }], items: [
      { name: "Cafea măcinată 250 g", quantity: 1, amount: 15, discount: 3, category: "Alimente" },
      { name: "Banane", quantity: 0.85, amount: 5, category: "Alimente" },
    ] },
    expect: { total: 20, date: "2026-10-16", count: 2, discount: 3, warning: false, title: "Cumpărături Lidl" },
  },
  {
    id: "reducere-pe-tot-bonul-10",
    input: { store: "Pepco", date: "2026-10-10", total: 90, confidence: "high", payments: [{ method: "card", amount: 90 }], items: [
      { name: "Prosop", quantity: 1, amount: 60, category: "Casă" },
      { name: "Lumânare", quantity: 1, amount: 40, category: "Casă" },
    ] },
    expect: { total: 90, date: "2026-10-10", count: 2, discount: 10, warning: false, title: "Cumpărături Pepco" },
  },
  {
    id: "rand-citit-gresit",
    input: { store: "Profi", date: "2026-10-17", total: 25.3, confidence: "medium", payments: [{ method: "cash", amount: 25.3 }], items: [
      { name: "Iaurt 140 g", quantity: 1, amount: 2.3, category: "Alimente" },
      { name: "Brânză telemea 400 g", quantity: 1, amount: 31.7, category: "Alimente" },
    ] },
    expect: { total: 25.3, date: "2026-10-17", count: 2, discount: 0, warning: true, title: "Cumpărături Profi" },
  },
  {
    id: "data-din-viitor-si-poza-slaba",
    input: { store: "", date: "2027-01-01", total: 12, confidence: "low", payments: [{ method: "other", amount: 12 }], items: [
      { name: "Covrigi", quantity: 3, amount: 12, category: "Necunoscută" },
    ] },
    expect: { total: 12, count: 1, discount: 0, warning: true, title: "Cumpărături" },
  },
];
