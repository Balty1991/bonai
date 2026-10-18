/**
 * Citirea bonului fără AI: textul scos de Tesseract pe telefon → aceeași formă ca răspunsul AI,
 * ca să treacă prin același `scanToPrefill`. Reguli simple, pentru bonurile fiscale din România
 * („2 BUC X 3,20 = 6,40 B”, „TOTAL LEI 44,58”). Nimic nu se ghicește: ce nu se citește lipsește,
 * iar încrederea e mereu „low”, ca omul să verifice.
 */
import { guessCategoryFromText } from "./finance-data";
import type { ScannedReceipt } from "./receipt-scan";

const CHAINS: Array<[RegExp, string]> = [
  [/\bLIDL\b/i, "Lidl"], [/\bKAUFLAND\b/i, "Kaufland"], [/\bCARREFOUR\b/i, "Carrefour"], [/\bMEGA\s*IMAGE\b/i, "Mega Image"],
  [/\bPROFI\b/i, "Profi"], [/\bAUCHAN\b/i, "Auchan"], [/\bPENNY\b/i, "Penny"], [/\bSELGROS\b/i, "Selgros"], [/\bMETRO\b/i, "Metro"],
  [/\bDM\s+DROGERIE\b/i, "dm"], [/\bCATENA\b/i, "Catena"], [/\bDR\.?\s*MAX\b/i, "Dr. Max"], [/\bSENSIBLU\b/i, "Sensiblu"], [/\bHELP\s*NET\b/i, "HelpNet"],
  [/\bS\.?INSAY\b/i, "Sinsay"], [/\bPEPCO\b/i, "Pepco"], [/\bH\s*&\s*M\b/i, "H&M"], [/\bDEDEMAN\b/i, "Dedeman"], [/\bLEROY\b/i, "Leroy Merlin"],
  [/\bOMV\b/i, "OMV"], [/\bPETROM\b/i, "Petrom"], [/\bMOL\b/, "MOL"], [/\bROMPETROL\b/i, "Rompetrol"], [/\bLUKOIL\b/i, "Lukoil"], [/\bFAMILIA\w*\b/i, "Familiar"],
];
const MONTHS: Record<string, number> = { ian: 1, jan: 1, feb: 2, mar: 3, apr: 4, mai: 5, may: 5, iun: 6, jun: 6, iul: 7, jul: 7, aug: 8, sep: 9, oct: 10, noi: 11, nov: 11, dec: 12 };
/** Rânduri care nu sunt produse: totaluri, TVA, plăți, antet. */
const NOT_ITEM = /\b(sub\s*total|total|t[vu][au]|tva|numerar|cash|card|rest|tichet|voucher|bon\b|fiscal|cif|c\.?i\.?f|cod fiscal|nr\.?\s*(poz|bon|tranz)|tranzac|plata|plată|achitat|schimb|casier|operator|pos\b|id unic|data|ora|str\.?|strada|jud|telefon|tel\b|www|mulțumim|multumim|rotunj)/i;
const DISCOUNT = /\b(reducere|discount|disc\.?|cupon|promo|lidl\s*plus|rabat|storno)\b/i;
const SGR = /\bgaran[tț]ie\b|\bsgr\b/i;

/** Repară cifrele citite greșit (O→0, l→1, „3:29” → 3.29, „44 58” la total → 44.58). */
const cleanNumber = (s: string) => s.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/[Ss](?=\d)|(?<=\d)[Ss]/g, "5");
const AMOUNT = /(-?\d{1,5})\s?[.,:]\s?(\d{2})(?!\d)/g;

function amounts(line: string): number[] {
  const out: number[] = [];
  const re = new RegExp(AMOUNT.source, "g"); const clean = cleanNumber(line);
  for (let m = re.exec(clean); m; m = re.exec(clean)) out.push(Number(`${m[1]}.${m[2]}`));
  return out;
}
const LETTERS3 = /[A-Za-zĂÂÎȘȚăâîșțşţ]{3}/;
const round2 = (v: number) => Math.round(v * 100) / 100;

function findDate(text: string): string | null {
  const numeric = /(\d{2})[./-](\d{2})[./-](\d{4})/.exec(text);
  if (numeric) {
    const [d, m, y] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const iso = /(20\d{2})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return iso[0];
  const word = /(\d{1,2})\s+([a-z]{3})[a-zăâîșț.]*\s+(20\d{2})|([a-z]{3})[a-z.]*\s+(\d{1,2}),?\s+(20\d{2})/i.exec(text);
  if (word) {
    const day = Number(word[1] || word[5]); const month = MONTHS[(word[2] || word[4]).toLowerCase()]; const year = word[3] || word[6];
    if (month && day >= 1 && day <= 31) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

function findTotal(lines: string[]): number {
  // „TOTAL LEI 44,58”, nu „TOTAL TVA”; dacă lipsește, „SUBTOTAL”.
  for (const pattern of [/\btota\s*l\s*e?\s*(lei|le[!1\]]|ron)(?![a-z])/i, /^\W*total\s*(de plat[aă])?\s*[:\d\s.,]+$/i, /\bsubtotal\b/i]) {
    for (const line of lines) {
      if (!pattern.test(line) || /\bt[vu][au]\b|tva/i.test(line)) continue;
      const found = amounts(line).filter((v) => v > 0);
      if (found.length) return found[found.length - 1];
      const spaced = /(\d{1,5})\s+(\d{2})\s*$/.exec(cleanNumber(line));
      if (spaced) return Number(`${spaced[1]}.${spaced[2]}`);
    }
  }
  return 0;
}

const nameOf = (s: string) => s
  .replace(/^(?:[a-z]{1,4}\s+|[^A-Za-z0-9ĂÂÎȘȚ]+\s*|\d\s+)+(?=[A-ZĂÂÎȘȚ])/, "")
  .replace(/\b\d+(?:[.,]\d+)?\s*(buc|bu|kg|pet|x|@)\b.*$/i, "")
  .replace(/\b(buc|bu|uc|kg|pet)\b\.?\s*[xX×¥@].*$/i, "")
  .replace(AMOUNT, "")
  .replace(/[^A-Za-z0-9ĂÂÎȘȚăâîșțŞŢşţ%&.,\- ]+/g, " ")
  .replace(/\s+/g, " ").trim();

export function parseReceiptText(text: string, categories?: string[]): ScannedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const store = CHAINS.find(([re]) => re.test(text))?.[1] || "";
  const total = findTotal(lines);
  const date = findDate(text);
  const items: ScannedReceipt["items"] = [];
  let pendingName = "";
  // Totalul e ultimul lucru de pe bon care ne interesează: după el vin TVA și plățile.
  const stop = lines.findIndex((l) => /\b(sub\s*total|tota\s*l\s*e?\s*(lei|le[!1\]]|ron)?)\b/i.test(l) && !/t[vu][au]|tva/i.test(l) && amounts(l).length > 0);
  for (const line of stop > 0 ? lines.slice(0, stop) : lines) {
    if (findDate(line)) continue;
    const found = amounts(line);
    const ownName = nameOf(line);
    if (!found.length) { if (!NOT_ITEM.test(line) && LETTERS3.test(ownName)) pendingName = ownName; continue; }
    if (NOT_ITEM.test(line) && !SGR.test(line) && !DISCOUNT.test(line)) { pendingName = ""; continue; }
    // „2 BUC X 3,20 = 6,40”: cantitatea × prețul verifică suma; la nepotrivire crede înmulțirea (cifrele mici se citesc mai bine).
    const calc = /(\d+(?:[.,]\d{1,3})?)\s*(?:buc|bu|kg|pet)?\.?\s*[xX×¥]\s*(\d{1,5}[.,:]\d{2})/i.exec(cleanNumber(line));
    const product = calc ? round2(Number(calc[1].replace(",", ".")) * Number(calc[2].replace(/[,:]/, "."))) : 0;
    const read = Math.abs(found[found.length - 1]);
    const amount = product > 0 && Math.abs(product - read) > 0.01 ? product : read;
    if (!(amount > 0) || amount > 100_000) continue;
    const name = (LETTERS3.test(ownName) && ownName.length >= 4 ? ownName : pendingName) || "";
    if (!name) continue;
    if (DISCOUNT.test(line) || DISCOUNT.test(name)) {
      const last = items[items.length - 1];
      if (last && amount < last.amount) { last.discount = round2((last.discount || 0) + amount); last.amount = round2(last.amount - amount); }
      pendingName = "";
      continue;
    }
    const qtyMatch = /(\d+(?:[.,]\d{1,3})?)\s*(?:buc|bu|kg|pet)?\.?\s*[xX×@¥]/i.exec(cleanNumber(line));
    const quantity = qtyMatch ? Number(qtyMatch[1].replace(",", ".")) || 1 : 1;
    const isSgr = SGR.test(name);
    // Numele vine din rândul de dinainte când rândul curent e doar „1 BUC X 3,50 = 3,50”.
    items.push({ name: name.slice(0, 80), quantity: quantity > 0 && quantity < 1000 ? quantity : 1, amount: round2(amount), category: isSgr ? "SGR" : /saco[sș]|pung/i.test(name) ? "Sacoșe" : guessCategoryFromText(name, categories) || "Altele" });
    pendingName = "";
  }
  return { store, date, total, items, payments: [], confidence: "low", model: "offline" };
}
