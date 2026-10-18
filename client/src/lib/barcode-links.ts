/** Legăturile cod de bare → produs, în pachetul familiei (se sincronizează; mai nou câștigă). */
import type { AppData } from "./finance-data";

/** label: rândul de bon ales (păstrează ambalajul, ex. 2L față de 0.5L), opțional. */
export type BarcodeLink = { key: string; at: string; label?: string };
export type BarcodeLinks = Record<string, BarcodeLink>;
const MAX = 2000;

export function normalizeBarcodeLinks(raw: unknown): BarcodeLinks | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: BarcodeLinks = {};
  for (const [ean, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX)) {
    if (!/^\d{8,14}$/.test(ean) || !value || typeof value !== "object") continue;
    const v = value as Partial<BarcodeLink>;
    if (typeof v.key === "string" && v.key && typeof v.at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v.at)) out[ean] = { key: v.key.slice(0, 200), at: v.at, ...(typeof v.label === "string" && v.label ? { label: v.label.slice(0, 200) } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

export function mergeBarcodeLinks(local: BarcodeLinks | undefined, remote: BarcodeLinks | undefined): BarcodeLinks | undefined {
  if (!local && !remote) return undefined;
  const out: BarcodeLinks = { ...(remote || {}) };
  for (const [ean, link] of Object.entries(local || {})) if (!out[ean] || link.at >= out[ean].at) out[ean] = link;
  return out;
}

export function withBarcodeLink(data: AppData, ean: string, key: string, now = new Date().toISOString(), label?: string): AppData {
  return { ...data, settings: { ...data.settings, barcodeLinks: { ...(data.settings.barcodeLinks || {}), [ean]: { key, at: now, ...(label ? { label } : {}) } } } };
}
