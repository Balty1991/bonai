/**
 * Garanțiile familiei: produsul, de unde și cu cât s-a cumpărat, câte luni de garanție și câte
 * zile de retur. Stau în setările familiei și se sincronizează ca bunurile din „Averea familiei”:
 * la unire câștigă modificarea mai nouă, iar ștergerea (și „Nu are garanție” la o propunere) lasă
 * o piatră de mormânt (`deleted`), ca partenerul să nu readucă rândul.
 * Fără importuri, ca `finance-data` să le poată folosi fără cerc.
 */
export type Warranty = {
  id: string;
  name: string;
  store?: string;
  price: number;
  /** Ziua cumpărării (AAAA-LL-ZZ). */
  purchaseDate: string;
  /** Luni de garanție; 24 e garanția legală în România pentru produsele noi. */
  months: number;
  /** Zile în care se poate returna fără motiv (14 online, 30 la unele magazine, 0 fără retur). */
  returnDays: number;
  /** Bonul și rândul din care a venit, când a pornit de la o propunere. */
  receiptId?: string;
  lineId?: string;
  transactionId?: string;
  note?: string;
  /** Poza bonului stă doar pe telefonul care a făcut-o (IndexedDB), nu în pachetul de sync. */
  hasPhoto?: boolean;
  updatedAt: string;
  deleted?: boolean;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T/;
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const MAX = 200;

export function normalizeWarranties(raw: unknown): Warranty[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Warranty[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Partial<Warranty>;
    const id = text(entry.id, 120);
    const name = text(entry.name, 80);
    const updatedAt = typeof entry.updatedAt === "string" && ISO_TIME.test(entry.updatedAt) ? entry.updatedAt : "";
    const purchaseDate = typeof entry.purchaseDate === "string" && ISO_DAY.test(entry.purchaseDate) ? entry.purchaseDate : "";
    if (!id || !name || !updatedAt || !purchaseDate || seen.has(id)) continue;
    seen.add(id);
    const months = Math.round(Number(entry.months));
    const returnDays = Math.round(Number(entry.returnDays));
    const store = text(entry.store, 60);
    const note = text(entry.note, 200);
    out.push({
      id, name, purchaseDate, updatedAt,
      price: Math.round(Math.max(0, Number(entry.price) || 0) * 100) / 100,
      months: months >= 0 && months <= 240 ? months : 24,
      returnDays: returnDays >= 0 && returnDays <= 365 ? returnDays : 0,
      ...(store ? { store } : {}),
      ...(note ? { note } : {}),
      ...(text(entry.receiptId, 120) ? { receiptId: text(entry.receiptId, 120) } : {}),
      ...(text(entry.lineId, 120) ? { lineId: text(entry.lineId, 120) } : {}),
      ...(text(entry.transactionId, 120) ? { transactionId: text(entry.transactionId, 120) } : {}),
      ...(entry.hasPhoto === true ? { hasPhoto: true } : {}),
      ...(entry.deleted ? { deleted: true } : {}),
    });
  }
  return out.slice(0, MAX);
}

export function mergeWarranties(local: ReadonlyArray<Warranty> = [], remote: ReadonlyArray<Warranty> = []): Warranty[] {
  const byId = new Map<string, Warranty>();
  for (const item of [...remote, ...local]) {
    const known = byId.get(item.id);
    if (!known || (Date.parse(item.updatedAt) || 0) >= (Date.parse(known.updatedAt) || 0)) byId.set(item.id, item);
  }
  return Array.from(byId.values()).slice(0, MAX);
}
