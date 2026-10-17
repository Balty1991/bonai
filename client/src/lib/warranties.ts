/**
 * Garanții și retururi. Bonul de la telefon, frigider sau aspirator e singura dovadă când ceva se
 * strică în doi ani; hârtia termică se șterge, iar ultima zi de retur trece fără să știi.
 *
 * - Propuneri din bonuri și cheltuieli: electronice, electrocasnice și orice rând nealimentar
 *   de cel puțin 300 lei din ultimii doi ani. Nimic nu se adaugă fără o atingere.
 * - Starea fiecăreia: câte zile mai ai de retur, până când e garanția, dacă expiră în 30 de zile.
 * - În România, produsele noi au 2 ani garanție legală de conformitate; cumpărat online, ai
 *   14 zile să-l returnezi fără motiv.
 */
import { addIsoDays, foldRomanian, isoToday, type AppData } from "./finance-data";
import { receiptVendorName } from "./price-history";
import type { Warranty } from "./warranty-data";

export const DEFAULT_WARRANTY_MONTHS = 24;
/** Cu cât timp înainte de expirare vine amintirea că garanția se termină. */
export const EXPIRY_NOTICE_DAYS = 30;

/** Cuvintele care fac din rând un produs cu garanție, chiar și la sume mici (căști, fier de călcat). */
const DEVICE_WORDS = /\b(telefon|smartphone|iphone|samsung galaxy|laptop|notebook|tablet[aă]?|ipad|televizor|tv\b|monitor|imprimant[aă]|router|c[aă]sti|casti|headphones?|boxa|box[aă]|soundbar|consol[aă]|playstation|xbox|nintendo|smartwatch|ceas|frigider|congelator|combin[aă] frigorific[aă]|ma[sș]in[aă] de sp[aă]lat|uscator|usc[aă]tor|aspirator|robot|cuptor|microunde|plit[aă]|hot[aă]|espressor|cafetier[aă]|expresor|fier de c[aă]lcat|fier de calcat|blender|mixer|robot de buc[aă]t[aă]rie|air ?fryer|friteuz[aă]|multicooker|toaster|prajitor|fierb[aă]tor|uscator de p[aă]r|placa de p[aă]r|aparat de ras|periu[tț][aă] electric[aă]|aer condi[tț]ionat|ventilator|calorifer|radiator|boiler|central[aă]|bicicle?t[aă]|trotinet[aă]|c[aă]rucior|scaun auto|ma[sș]in[aă] de cusut|bormasin[aă]|bormașin[aă]|flex|autofiletant|drujb[aă]|motocoas[aă]|saltea|canapea|electrocasnic|ssd|hdd|hard disk|placa video|procesor|tastatur[aă]|mouse|camer[aă] foto|aparat foto|drona|dron[aă]|kindle|e-?reader)\b/;
/** Categoriile în care un rând nu e produs cu garanție, oricât ar costa. */
const NO_WARRANTY = new Set(["Alimente", "Băuturi", "Apă", "Dulciuri", "SGR", "Sacoșe", "Abonamente", "Credite", "Rate produse", "Transport", "Educație", "Consumabile copil"]);
const MIN_PRICE = 300;
const MIN_DEVICE_PRICE = 50;
/** Magazinele online: acolo ai 14 zile de retur fără motiv, prin lege. */
const ONLINE = /\b(emag|altex\.ro|amazon|fashion ?days|answear|about you|zalando|temu|shein|aliexpress|pcgarage|evomag|cel\.ro|vexio|flanco\.ro|dr\.? ?max online|elefant|libris|carturesti\.ro|bebe ?tei|bebetei|notino|douglas\.ro|sinsay\.com|online)\b/;

export const isOnlineStore = (store: string | undefined) => ONLINE.test(foldRomanian(store || ""));
export const defaultReturnDays = (store: string | undefined) => isOnlineStore(store) ? 14 : 0;

export type WarrantyCandidate = { id: string; name: string; store?: string; price: number; purchaseDate: string; receiptId?: string; lineId?: string; transactionId?: string; returnDays: number };

/** Accesoriile n-au nevoie de garanție urmărită, chiar dacă numele are „telefon” sau „laptop”. */
const ACCESSORY = /\b(factur[aăi]|factura|abonament|rat[aăe]|plat[aă]|reinc[aă]rcare|cartel[aă]|credit|asigurare|service|repara[tț]ie|hus[aă]|husa|folie|cablu|adaptor|baterii?|carcas[aă]|suport|geant[aă]|rucsac|sac(i|uri)? de aspirator|filtru|capsule|cartu[sș]|toner|hartie|h[aâ]rtie)\b/;
const looksLikeDevice = (label: string) => { const folded = foldRomanian(label); return DEVICE_WORDS.test(folded) && !ACCESSORY.test(folded); };
const cleanLabel = (label: string) => label.replace(/\s×\s.*$/, "").replace(/\s*\(reducere[^)]*\)\s*/i, "").trim();

/**
 * Ce pare să aibă garanție și nu e încă în listă (nici refuzat cu „Nu are garanție”): rândurile de
 * bon din ultimii doi ani și, pentru cheltuielile fără bon detaliat, cheltuiala însăși.
 */
export function warrantyCandidates(data: AppData, today = isoToday(), limit = 8): WarrantyCandidate[] {
  const known = new Set<string>();
  for (const item of data.settings.warranties || []) {
    known.add(item.id);
    if (item.receiptId && item.lineId) known.add(`${item.receiptId}|${item.lineId}`);
    if (item.transactionId) known.add(`tx|${item.transactionId}`);
  }
  const since = addIsoDays(today, -730);
  const out: WarrantyCandidate[] = [];
  const linkedTx = new Set<string>();
  for (const receipt of data.receipts) {
    for (const id of [receipt.linkedTransactionId, ...(receipt.linkedTransactionIds || [])]) if (id) linkedTx.add(id);
    if (receipt.date < since || receipt.date > today) continue;
    const store = receiptVendorName(receipt.vendor);
    for (const line of receipt.lines || []) {
      const label = cleanLabel(line.label || "");
      if (!label || NO_WARRANTY.has(line.category)) continue;
      if (ACCESSORY.test(foldRomanian(label))) continue;
      const device = looksLikeDevice(label);
      if (!(device ? line.amount >= MIN_DEVICE_PRICE : line.amount >= MIN_PRICE)) continue;
      const id = `w-${receipt.id}-${line.id}`;
      if (known.has(id) || known.has(`${receipt.id}|${line.id}`)) continue;
      out.push({ id, name: label, store, price: line.amount, purchaseDate: receipt.date, receiptId: receipt.id, lineId: line.id, returnDays: defaultReturnDays(store) });
    }
  }
  for (const tx of data.transactions) {
    if (tx.kind !== "expense" || tx.date < since || tx.date > today || linkedTx.has(tx.id) || tx.receiptId) continue;
    if (NO_WARRANTY.has(tx.category)) continue;
    const label = (tx.title || "").trim();
    if (!label || !looksLikeDevice(label) || tx.amount < MIN_DEVICE_PRICE) continue;
    const id = `w-tx-${tx.id}`;
    if (known.has(id) || known.has(`tx|${tx.id}`)) continue;
    out.push({ id, name: label, price: tx.amount, purchaseDate: tx.date, transactionId: tx.id, returnDays: 0 });
  }
  // Cele mai noi întâi: acolo mai e timp de retur; apoi cele mai scumpe.
  return out.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.price - a.price).slice(0, limit);
}

export function warrantyFromCandidate(candidate: WarrantyCandidate, months = DEFAULT_WARRANTY_MONTHS, now = new Date().toISOString()): Warranty {
  return {
    id: candidate.id, name: candidate.name, price: candidate.price, purchaseDate: candidate.purchaseDate, months, returnDays: candidate.returnDays, updatedAt: now,
    ...(candidate.store ? { store: candidate.store } : {}),
    ...(candidate.receiptId ? { receiptId: candidate.receiptId } : {}),
    ...(candidate.lineId ? { lineId: candidate.lineId } : {}),
    ...(candidate.transactionId ? { transactionId: candidate.transactionId } : {}),
  };
}

/** „Nu are garanție”: o piatră de mormânt, ca propunerea să nu mai apară nici la partener. */
export const dismissedCandidate = (candidate: WarrantyCandidate, now = new Date().toISOString()): Warranty => ({ ...warrantyFromCandidate(candidate, 0, now), deleted: true });

/** Adaugă sau înlocuiește după id. */
export function upsertWarranty(data: AppData, warranty: Warranty): AppData {
  const list = data.settings.warranties || [];
  const next = list.some((item) => item.id === warranty.id) ? list.map((item) => item.id === warranty.id ? warranty : item) : [...list, warranty];
  return { ...data, settings: { ...data.settings, warranties: next } };
}

export function removeWarranty(data: AppData, id: string, now = new Date().toISOString()): AppData {
  return { ...data, settings: { ...data.settings, warranties: (data.settings.warranties || []).map((item) => item.id === id ? { ...item, deleted: true, updatedAt: now } : item) } };
}

/** Ziua de după un număr de luni, fără să sară peste sfârșitul lunii (31 ian + 1 lună = 28/29 feb). */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export type WarrantyState = "return" | "active" | "expiring" | "expired" | "none";
export type WarrantyStatus = {
  state: WarrantyState;
  /** Ultima zi de retur, când produsul are retur. */
  returnUntil?: string;
  returnDaysLeft?: number;
  /** Ultima zi de garanție. */
  until?: string;
  daysLeft?: number;
  /** Cât din garanție a trecut (0–1), pentru bară. */
  used: number;
};

export function warrantyStatus(warranty: Warranty, today = isoToday()): WarrantyStatus {
  const returnUntil = warranty.returnDays > 0 ? addIsoDays(warranty.purchaseDate, warranty.returnDays) : undefined;
  const returnDaysLeft = returnUntil ? daysBetween(today, returnUntil) : undefined;
  if (warranty.months <= 0) {
    return { state: returnDaysLeft !== undefined && returnDaysLeft >= 0 ? "return" : "none", returnUntil, returnDaysLeft, used: 1 };
  }
  const until = addIsoDays(addMonths(warranty.purchaseDate, warranty.months), -1);
  const daysLeft = daysBetween(today, until);
  const total = Math.max(1, daysBetween(warranty.purchaseDate, until));
  const used = Math.min(1, Math.max(0, 1 - daysLeft / total));
  const state: WarrantyState = returnDaysLeft !== undefined && returnDaysLeft >= 0 ? "return" : daysLeft < 0 ? "expired" : daysLeft <= EXPIRY_NOTICE_DAYS ? "expiring" : "active";
  return { state, returnUntil, returnDaysLeft, until, daysLeft, used };
}

const RANK: Record<WarrantyState, number> = { return: 0, expiring: 1, active: 2, expired: 3, none: 4 };

/** Garanțiile vii, cele urgente întâi (retur, apoi care expiră), apoi după data de final. */
export function liveWarranties(data: AppData, today = isoToday()): Array<{ warranty: Warranty; status: WarrantyStatus }> {
  return (data.settings.warranties || [])
    .filter((item) => !item.deleted)
    .map((warranty) => ({ warranty, status: warrantyStatus(warranty, today) }))
    .sort((a, b) => RANK[a.status.state] - RANK[b.status.state] || (a.status.returnDaysLeft ?? a.status.daysLeft ?? 0) - (b.status.returnDaysLeft ?? b.status.daysLeft ?? 0));
}

export type WarrantyReminder = { id: string; kind: "return" | "expiry"; name: string; day: string; target: string };

/**
 * Amintirile de programat: cu o zi înainte de ultima zi de retur (și în ziua ei) și cu 30 de zile
 * înainte să expire garanția. Doar cele care cad în următoarele `horizon` zile.
 */
export function warrantyReminders(data: AppData, today = isoToday(), horizon = 7): WarrantyReminder[] {
  const out: WarrantyReminder[] = [];
  const end = addIsoDays(today, horizon);
  for (const { warranty, status } of liveWarranties(data, today)) {
    if (status.returnUntil && status.returnDaysLeft !== undefined && status.returnDaysLeft >= 0) {
      const day = status.returnDaysLeft >= 1 ? addIsoDays(status.returnUntil, -1) : status.returnUntil;
      if (day >= today && day <= end) out.push({ id: warranty.id, kind: "return", name: warranty.name, day, target: status.returnUntil });
    }
    if (status.until && status.daysLeft !== undefined && status.daysLeft >= 0) {
      const day = addIsoDays(status.until, -EXPIRY_NOTICE_DAYS);
      if (day >= today && day <= end) out.push({ id: warranty.id, kind: "expiry", name: warranty.name, day, target: status.until });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}
