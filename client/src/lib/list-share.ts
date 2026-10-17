/**
 * Lista trimisă pe WhatsApp: text simplu, cu bife, plus invitația spre Bonuț.
 * Linkul web: lista e codată în fragmentul adresei (#…), deci merge pe GitHub Pages fără server și
 * nu ajunge în jurnalele niciunui server. Cine îl primește bifează în browser (bifele rămân la el) și
 * poate trimite înapoi pe WhatsApp ce a luat. Sincronizarea live a bifelor e pasul următor (Firestore).
 */
import type { ShoppingItem } from "./shopping-list";

export function listShareText(items: ReadonlyArray<Pick<ShoppingItem, "text">>, intro: string, footer: string): string {
  const lines = items.map((item) => `☐ ${item.text.trim()}`).filter((line) => line.length > 2);
  return [intro, "", ...lines, "", footer].join("\n").trim();
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export const SHARE_PAGE_URL = "https://balty1991.github.io/buget-familie/l.html";
export const SHARE_MAX_ITEMS = 60;

export type SharedList = { v: 1; title?: string; items: string[] };

const toB64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (value: string) => {
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function encodeSharedList(items: ReadonlyArray<Pick<ShoppingItem, "text">>, title?: string): string {
  const list: SharedList = { v: 1, ...(title ? { title: title.slice(0, 60) } : {}), items: items.map((i) => i.text.trim().slice(0, 80)).filter(Boolean).slice(0, SHARE_MAX_ITEMS) };
  return toB64Url(JSON.stringify(list));
}

export function decodeSharedList(fragment: string): SharedList | undefined {
  try {
    const parsed = JSON.parse(fromB64Url(fragment.replace(/^#/, ""))) as SharedList;
    if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return undefined;
    return { v: 1, ...(typeof parsed.title === "string" ? { title: parsed.title.slice(0, 60) } : {}), items: parsed.items.filter((i): i is string => typeof i === "string").map((i) => i.slice(0, 80)).slice(0, SHARE_MAX_ITEMS) };
  } catch {
    return undefined;
  }
}

export function listShareLink(items: ReadonlyArray<Pick<ShoppingItem, "text">>, title?: string, base = SHARE_PAGE_URL): string {
  return `${base}#${encodeSharedList(items, title)}`;
}
