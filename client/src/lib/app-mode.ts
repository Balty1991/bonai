/**
 * Ce aplicație vede telefonul: cea nouă, a cumpărăturilor (implicit), sau bugetul vechi cu
 * plicuri. Preferință a telefonului; datele sunt aceleași în ambele, nimic nu se șterge.
 */
import { useEffect, useState } from "react";
import { safeSetItem } from "@/lib/safe-storage";

export type AppMode = "shop" | "budget";
const KEY = "buget-familie:app-mode";
const EVENT = "buget-familie:app-mode";

export function readAppMode(): AppMode {
  try { return window.localStorage.getItem(KEY) === "budget" ? "budget" : "shop"; } catch { return "shop"; }
}

export function setAppMode(mode: AppMode) {
  try { safeSetItem(window.localStorage, KEY, mode); } catch { /* fără stocare: rămâne până la repornire */ }
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
