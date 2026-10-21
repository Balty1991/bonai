/**
 * Ce notificări vrea omul și la ce oră vine amintirea de seară. Preferință a telefonului
 * (nu a familiei): fiecare alege pentru el. Implicit toate sunt pornite, la 20:00.
 */
import { safeSetItem } from "@/lib/safe-storage";

export const NOTIFY_KINDS = ["bills", "envelopes", "income", "goals", "summaries", "checkin", "backup", "warranty", "prices"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type NotifyPrefs = { off: NotifyKind[]; eveningHour: number };

const KEY = "buget-familie:notify-prefs";
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { off: [], eveningHour: 20 };

/** Felul unei alerte, după eticheta ei (tag-ul rămâne aceeași cheie ca înainte). */
export function notifyKindOf(tag: string): NotifyKind {
  if (/^(due|debt|cost)-/.test(tag)) return "bills";
  if (/^payday-/.test(tag)) return "income";
  if (/^goal-/.test(tag)) return "goals";
  if (/^(weekly-summary|month-card|month-end)-/.test(tag)) return "summaries";
  if (/^checkin-/.test(tag)) return "checkin";
  if (/^backup-/.test(tag)) return "backup";
  if (/^warranty-/.test(tag)) return "warranty";
  if (/^price-/.test(tag)) return "prices";
  return "envelopes";
}

type Store = Pick<Storage, "getItem">;
export function readNotifyPrefs(storage: Store | undefined = typeof window !== "undefined" ? window.localStorage : undefined): NotifyPrefs {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) || "null") as Partial<NotifyPrefs> | null;
    if (!raw) return DEFAULT_NOTIFY_PREFS;
    const off = Array.isArray(raw.off) ? raw.off.filter((kind): kind is NotifyKind => (NOTIFY_KINDS as readonly string[]).includes(kind)) : [];
    const hour = Number(raw.eveningHour);
    return { off, eveningHour: Number.isInteger(hour) && hour >= 17 && hour <= 23 ? hour : 20 };
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

export function writeNotifyPrefs(prefs: NotifyPrefs) {
  try { safeSetItem(window.localStorage, KEY, JSON.stringify(prefs)); } catch { /* fără stocare: rămân implicitele */ }
}
