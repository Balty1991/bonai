import { afterEach, describe, expect, it, vi } from "vitest";
import { hasMemberModePin, memberModeWaitSeconds, verifyMemberModePin } from "./member-mode";

const store = new Map<string, string>();
vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }, dispatchEvent: () => true });

/** Codul salvat de versiunile vechi, în aceeași formă (PBKDF2, 150.000 de pași). */
async function legacyPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" }, material, 256));
  const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  store.set("buget-familie:member-mode-pin-v1", JSON.stringify({ salt: b64(salt), hash: b64(bits) }));
}

describe("ieșirea dintr-un telefon rămas în modul copil", () => {
  afterEach(() => store.clear());
  it("codul vechi: bun trece, greșit nu; după 5 greșeli trebuie așteptat", async () => {
    await legacyPin("1234");
    expect(hasMemberModePin()).toBe(true);
    expect(await verifyMemberModePin("1234")).toBe(true);
    for (let i = 0; i < 5; i += 1) expect(await verifyMemberModePin("0000")).toBe(false);
    expect(memberModeWaitSeconds()).toBeGreaterThan(0);
    expect(await verifyMemberModePin("1234")).toBe(false);
  });
  it("fără cod salvat, telefonul poate ieși direct", () => {
    expect(hasMemberModePin()).toBe(false);
  });
});
