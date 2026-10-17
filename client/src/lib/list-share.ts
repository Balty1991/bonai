/**
 * Lista trimisă pe WhatsApp: text simplu, cu bife, plus invitația spre Bonuț.
 * Pasul următor (linkul web pe care îl bifează și cine nu are aplicația) are nevoie de funcția shareList.
 */
import type { ShoppingItem } from "./shopping-list";

export function listShareText(items: ReadonlyArray<Pick<ShoppingItem, "text">>, intro: string, footer: string): string {
  const lines = items.map((item) => `☐ ${item.text.trim()}`).filter((line) => line.length > 2);
  return [intro, "", ...lines, "", footer].join("\n").trim();
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
