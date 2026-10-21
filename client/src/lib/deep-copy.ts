/**
 * Copie adâncă a datelor aplicației. `structuredClone` lipsește din WebView-urile Android mai vechi
 * de Chrome 98 (Sentry: „structuredClone is not defined”); acolo copiem prin JSON, ceea ce ajunge,
 * pentru că registrul e doar text, numere, liste și obiecte simple.
 */
export function deepCopy<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
