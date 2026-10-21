/**
 * Ce notificări vrea omul. Preferință a telefonului (nu a familiei): fiecare alege pentru el.
 * Implicit toate sunt pornite.
 */
import { safeSetItem } from "@/lib/safe-storage";

export const NOTIFY_KINDS = ["bills", "backup", "warranty", "prices"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type NotifyPrefs = { off: NotifyKind[] };

const KEY = "buget-familie:notify-prefs";
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { off: [] };

/** Felul unei alerte, după eticheta ei: scadențe, copia de siguranță, garanții sau prețuri. */
export function notifyKindOf(tag: string): NotifyKind {
  if (/^backup-/.test(tag)) return "backup";
  if (/^warranty-/.test(tag)) return "warranty";
  if (/^price-/.test(tag)) return "prices";
  return "bills";
}

type Store = Pick<Storage, "getItem">;
export function readNotifyPrefs(storage: Store | undefined = typeof window !== "undefined" ? window.localStorage : undefined): NotifyPrefs {
  try {
    const raw = JSON.parse(storage?.getItem(KEY) || "null") as Partial<NotifyPrefs> | null;
    if (!raw) return DEFAULT_NOTIFY_PREFS;
    const off = Array.isArray(raw.off) ? raw.off.filter((kind): kind is NotifyKind => (NOTIFY_KINDS as readonly string[]).includes(kind)) : [];
    return { off };
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

export function writeNotifyPrefs(prefs: NotifyPrefs) {
  try { safeSetItem(window.localStorage, KEY, JSON.stringify(prefs)); } catch { /* fără stocare: rămân implicitele */ }
}
