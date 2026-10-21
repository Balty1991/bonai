/**
 * Ce a rămas din „Telefonul lui X” (modul copil al bugetului vechi): doar ieșirea. Pe un telefon
 * pus în modul ăsta înainte, aplicația cere codul adultului o dată, apoi se deschide BonAI.
 * Modul nu se mai poate porni; fără cod salvat, telefonul iese direct.
 */
import { useEffect, useState } from "react";
import { safeSetItem } from "./safe-storage";

export const MEMBER_MODE_KEY = "buget-familie:member-mode-v1";
const PIN_KEY = "buget-familie:member-mode-pin-v1";
const PREVIOUS_SELF_KEY = "buget-familie:member-mode-previous-self";
const ATTEMPTS_KEY = "buget-familie:member-mode-attempts";

const encoder = new TextEncoder();
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
async function derive(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return toBase64(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" }, material, 256)));
}

/** Cât mai trebuie așteptat după prea multe încercări greșite (0 = se poate încerca). */
export const memberModeWaitSeconds = (now = Date.now()) => {
  try {
    const state = JSON.parse(window.localStorage.getItem(ATTEMPTS_KEY) || "{}") as { count?: number; until?: number };
    return Math.max(0, Math.ceil(((state.until || 0) - now) / 1000));
  } catch { return 0; }
};

/** Verifică codul; după 5 greșeli la rând, așteptarea crește: 30 s, 60 s, 120 s… */
export async function verifyMemberModePin(pin: string): Promise<boolean> {
  if (memberModeWaitSeconds() > 0) return false;
  let ok = false;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PIN_KEY) || "null") as { salt: string; hash: string } | null;
    ok = Boolean(stored && await derive(pin, fromBase64(stored.salt)) === stored.hash);
  } catch { ok = false; }
  try {
    const state = JSON.parse(window.localStorage.getItem(ATTEMPTS_KEY) || "{}") as { count?: number; until?: number };
    if (ok) window.localStorage.removeItem(ATTEMPTS_KEY);
    else {
      const count = (state.count || 0) + 1;
      const until = count >= 5 ? Date.now() + 30_000 * 2 ** Math.min(6, count - 5) : 0;
      safeSetItem(window.localStorage, ATTEMPTS_KEY, JSON.stringify({ count, until }));
    }
  } catch { /* fără stocare, fără contor */ }
  return ok;
}

export const hasMemberModePin = () => { try { return Boolean(window.localStorage.getItem(PIN_KEY)); } catch { return false; } };

/** Cine era „eu” pe telefon înainte de mod: la ieșire, cheltuielile nu mai sunt ale copilului. */
export const takePreviousSelf = () => {
  try {
    const value = window.localStorage.getItem(PREVIOUS_SELF_KEY) || "";
    window.localStorage.removeItem(PREVIOUS_SELF_KEY);
    window.localStorage.removeItem(PIN_KEY);
    return value;
  } catch { return ""; }
};

export const readMemberMode = () => {
  try { return window.localStorage.getItem(MEMBER_MODE_KEY) || ""; } catch { return ""; }
};

export const writeMemberMode = (memberId: string) => {
  try {
    if (memberId) safeSetItem(window.localStorage, MEMBER_MODE_KEY, memberId);
    else window.localStorage.removeItem(MEMBER_MODE_KEY);
  } catch { /* fără stocare, modul ține doar până la închidere */ }
  window.dispatchEvent(new CustomEvent("buget-familie:member-mode", { detail: memberId }));
};

export function useMemberMode() {
  const [memberId, setMemberId] = useState(readMemberMode);
  useEffect(() => {
    const onChange = (event: Event) => setMemberId(String((event as CustomEvent<string>).detail || ""));
    window.addEventListener("buget-familie:member-mode", onChange);
    return () => window.removeEventListener("buget-familie:member-mode", onChange);
  }, []);
  return memberId;
}
