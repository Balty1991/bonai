/**
 * Același produs, scris la fel la fiecare scanare. Modelul poate citi „Lapte Zuzu 1,5% 1L” o dată
 * și „LAPTE ZUZU 1.5% 1 L” altă dată; istoricul de prețuri le-ar vedea ca două produse. Înainte de
 * salvare, numele citit se aliniază la cel deja salvat în bonuri, dacă e clar același: aceleași
 * cuvinte (în orice ordine, fără diacritice și majuscule) și aceleași cifre (gramaj, procent).
 * Nu ghicim: la orice diferență de cifre sau de cuvinte, numele rămâne cum l-a citit modelul.
 */
import type { AppData } from "./finance-data";

const QTY_SUFFIX = / × [\d.,]+( kg)?$/;

/** Cheia de comparare: litere fără diacritice, cifre cu punct zecimal, unitățile lipite de număr. */
export function nameKey(name: string): string {
  const folded = name.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d)\s+(kg|g|gr|l|ml|cl|buc|%)\b/g, "$1$2")
    .replace(/(\d)\s*%/g, "$1%")
    .replace(/[^a-z0-9.%]+/g, " ").trim();
  return folded.split(/\s+/).filter(Boolean).sort().join(" ");
}

/** Numele deja salvate, cea mai recentă formă pentru fiecare cheie. */
export function knownNames(data: AppData): Map<string, string> {
  const names = new Map<string, { label: string; date: string }>();
  for (const receipt of data.receipts) {
    for (const line of receipt.lines || []) {
      const label = (line.label || "").replace(QTY_SUFFIX, "").trim();
      if (!label) continue;
      const key = nameKey(label);
      const seen = names.get(key);
      if (!seen || receipt.date >= seen.date) names.set(key, { label, date: receipt.date });
    }
  }
  return new Map(Array.from(names, ([key, value]) => [key, value.label]));
}

/** Numele salvat pentru același produs, altfel cel citit. */
export function consistentName(name: string, known: Map<string, string>): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  return known.get(nameKey(trimmed)) || trimmed;
}

/** Magazinul scris ca la bonurile de dinainte („LIDL” → „Lidl”, dacă așa e deja salvat). */
export function consistentStore(store: string, data: AppData): string {
  const key = nameKey(store);
  if (!key) return store;
  const hit = [...data.receipts].sort((a, b) => b.date.localeCompare(a.date)).find((receipt) => nameKey(receipt.vendor || "") === key);
  return hit?.vendor || store;
}
