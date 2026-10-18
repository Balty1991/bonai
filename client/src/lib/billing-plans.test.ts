/** Paywall cap-coadă, fără Play: proba după al 3-lea bon, 15 scanări AI, offline nelimitat, drepturile plătite. */
import { beforeEach, describe, expect, it } from "vitest";
import { activePaidPlan, saveEntitlement } from "./billing-store";
import { currentBonutPlan } from "./bonut-plan-current";
import { readAiQuota, syncAiQuota, BONUT_SKUS, FREE_SCANS_PER_MONTH, hasFeature, readAiScans, recordAiScan, scansLeft, trialDaysLeft } from "./bonut-plans";
import { createEmptyAppData } from "./finance-data";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear() };
(globalThis as { window?: unknown }).window = { localStorage: globalThis.localStorage, dispatchEvent: () => true };
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const withReceipts = (dates: string[]) => { const d = createEmptyAppData(); d.receipts = dates.map((date, i) => ({ id: `r${i}`, vendor: "Lidl", amount: 10, category: "Cumpărături", date })); return d; };

describe("paywall BonAI", () => {
  beforeEach(() => localStorage.clear());
  it("proba de 14 zile pornește abia la al 3-lea bon", () => {
    expect(currentBonutPlan(withReceipts(["2026-10-01", "2026-10-02"]), "2026-10-03", true)).toBe("free");
    expect(currentBonutPlan(withReceipts(["2026-10-01", "2026-10-02", "2026-10-03"]), "2026-10-03", true)).toBe("pro");
    expect(trialDaysLeft(["2026-10-01", "2026-10-02", "2026-10-03"], "2026-10-17")).toBe(0);
    expect(currentBonutPlan(withReceipts(["2026-10-01", "2026-10-02", "2026-10-03"]), "2026-10-17", true)).toBe("free");
  });
  it("15 scanări AI pe lună; cele offline nu se numără; luna nouă reîncepe", () => {
    const storage = mem();
    for (let i = 0; i < FREE_SCANS_PER_MONTH; i++) recordAiScan("2026-10-18", storage);
    expect(scansLeft("free", readAiScans(storage), "2026-10-18")).toBe(0);
    expect(scansLeft("free", readAiScans(storage), "2026-11-01")).toBe(FREE_SCANS_PER_MONTH);
    expect(scansLeft("pro", readAiScans(storage), "2026-10-18")).toBe(Number.POSITIVE_INFINITY);
    expect(hasFeature("free", "scan")).toBe(true);
  });
  it("dreptul plătit: bonut_pro → Pro, Familia (nouă/veche/cameră) → Familie, expirat → nimic", () => {
    const later = new Date(Date.now() + 30 * 86_400_000).toISOString();
    saveEntitlement("play", { productId: BONUT_SKUS.pro.productId, expiresAt: later, verifiedAt: later });
    expect(activePaidPlan()).toBe("pro");
    expect(currentBonutPlan(withReceipts([]), "2026-10-18", true)).toBe("pro");
    saveEntitlement("play", { productId: "bonut_familie", expiresAt: later, verifiedAt: later });
    expect(activePaidPlan()).toBe("familie");
    saveEntitlement("play", { productId: "familie_anual", expiresAt: new Date(Date.now() - 5 * 86_400_000).toISOString(), verifiedAt: later });
    expect(activePaidPlan()).toBeUndefined();
  });

  it("cota de pe server înlocuiește numărătoarea locală (ștergerea datelor nu o resetează)", () => {
    const storage = mem();
    recordAiScan("2026-10-02", storage);
    syncAiQuota({ plan: "free", used: 15, limit: 15, remaining: 0, month: "2026-10", enforced: true }, storage);
    expect(readAiScans(storage).filter((d) => d.startsWith("2026-10"))).toHaveLength(15);
    expect(scansLeft("free", readAiScans(storage), "2026-10-18")).toBe(0);
    expect(readAiQuota(storage)?.remaining).toBe(0);
  });
});
