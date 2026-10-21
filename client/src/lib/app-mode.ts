/**
 * Ce aplicație vede telefonul: cea nouă, a cumpărăturilor (implicit), sau bugetul vechi cu
 * plicuri. Preferință a telefonului; datele sunt aceleași în ambele, nimic nu se șterge.
 */
import { useEffect, useState } from "react";
import { safeSetItem } from "@/lib/safe-storage";

export type AppMode = "shop" | "budget";
const KEY = "buget-familie:app-mode";
const EVENT = "buget-familie:app-mode";

/**
 * „budget” = vizita în Arhiva veche, doar citire. Ține doar cât sesiunea (sessionStorage): la repornire
 * aplicația e mereu BonAI. Vechea preferință din localStorage se ignoră și se șterge.
 */
/** Doar pentru testele cap-coadă vechi (e2e/): bugetul rămâne scriibil și persistent. Nu se setează din aplicație. */
const LEGACY_TEST_KEY = "buget-familie:legacy-writable";
const legacyTestHook = () => { try { return window.localStorage.getItem(LEGACY_TEST_KEY) === "1"; } catch { return false; } };

export function readAppMode(): AppMode {
  // Bugetul vechi a fost scos: aplicația e mereu BonAI. Vechea preferință se șterge.
  try { if (window.localStorage.getItem(KEY)) window.localStorage.removeItem(KEY); } catch { /* fără stocare */ }
  return "shop";
}

export const isArchiveMode = () => readAppMode() === "budget" && !legacyTestHook();

export function setAppMode(mode: AppMode) {
  try { safeSetItem(window.sessionStorage, KEY, mode); } catch { /* fără stocare: rămâne până la repornire */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

export function useAppMode(): AppMode {
  const [mode, setMode] = useState<AppMode>(readAppMode);
  useEffect(() => {
    const onChange = (event: Event) => setMode((event as CustomEvent<AppMode>).detail || readAppMode());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.app = mode;
  }, [mode]);
  return mode;
}
