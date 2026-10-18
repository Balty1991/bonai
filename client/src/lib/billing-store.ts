/**
 * Dreptul la Familia, păstrat pe telefon după verificarea pe server.
 *
 * Două surse: abonamentul cumpărat pe acest telefon (Google Play) și abonamentul altui
 * membru, primit prin camera familiei (validat tot pe server, în `familyEntitlements`).
 * Registrul nu depinde de aici: la expirare se blochează doar funcțiile Familia, nu datele.
 */
import { safeSetItem } from "@/lib/safe-storage";

const KEY = "buget-familie:entitlements-v1";
/** Câteva zile fără internet nu scot pe nimeni din Familia. */
export const OFFLINE_GRACE_DAYS = 3;

export type EntitlementSource = "play" | "room";
export type Entitlement = { source: EntitlementSource; productId?: string; roomId?: string; expiresAt: string; verifiedAt: string };

export function readEntitlements(): Entitlement[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is Entitlement => Boolean(item && (item.source === "play" || item.source === "room") && typeof item.expiresAt === "string")) : [];
  } catch {
    return [];
  }
}

/** Înlocuiește dreptul dintr-o sursă; `undefined` îl scoate (abonament expirat sau anulat). */
export function saveEntitlement(source: EntitlementSource, entitlement: Omit<Entitlement, "source"> | undefined) {
  if (typeof window === "undefined") return;
  const others = readEntitlements().filter((item) => item.source !== source);
  const next = entitlement ? [...others, { ...entitlement, source }] : others;
  safeSetItem(window.localStorage, KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("buget-familie:entitlements"));
}

export function hasActiveFamilie(now = Date.now()) {
  const grace = OFFLINE_GRACE_DAYS * 86_400_000;
  return readEntitlements().some((item) => (Date.parse(item.expiresAt) || 0) + grace > now);
}

/** Planul BonAI plătit, din dreptul verificat: „bonut_pro” → pro; Familia (nouă sau veche) și camera → familie. */
export function activePaidPlan(now = Date.now()): "pro" | "familie" | undefined {
  const grace = OFFLINE_GRACE_DAYS * 86_400_000;
  const live = readEntitlements().filter((item) => (Date.parse(item.expiresAt) || 0) + grace > now);
  if (live.some((item) => item.source === "room" || item.productId !== "bonut_pro")) return "familie";
  return live.length ? "pro" : undefined;
}
