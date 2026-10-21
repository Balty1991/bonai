/**
 * Regresie (18.10.2026): pe telefon, când serverul respingea scanarea (cotă, App Check, 403/405),
 * animația se închidea și eroarea rămânea mică, sub marginea ecranului: scanarea „se închidea singură”.
 * Verifică: pentru fiecare tip de eșec, ecranul Scanează arată o eroare în română, VIZIBILĂ în ecran,
 * cu „Încearcă din nou” și drumul offline. Serverul e simulat, nu costă nimic.
 * Plus o citire reușită, dar lentă (16 s): „Verifică bonul” arată „Citit în … s” și unde s-a dus timpul.
 * Rulare: node e2e/scan-error.e2e.mjs (CHROMIUM_PATH opțional).
 */
/* global innerHeight */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5201, BASE = `http://127.0.0.1:${PORT}/`;
const IMG = new URL("./receipts/familia-57.30.jpg", import.meta.url).pathname;
const fail = (m) => { throw new Error(m); };
async function waitFor(check, what, timeout = 30_000) { const s = Date.now(); while (Date.now() - s < timeout) { if (await check().catch(() => false)) return; await new Promise((r) => setTimeout(r, 300)); } fail(`Timp depășit: ${what}`); }
const CASES = [
  { name: "cotă zilnică", status: 429, body: { error: "Ai scanat multe bonuri azi. Mâine poți scana din nou; până atunci le poți nota de mână.", code: "quota" }, expect: /multe bonuri azi/ },
  { name: "App Check", status: 401, body: { error: "App Check invalid", code: "app_check" }, expect: /nu a putut fi verificat/ },
  { name: "origine", status: 403, body: { error: "Origin not allowed" }, expect: /a refuzat cererea/ },
  { name: "rețea", abort: true, expect: /Nu am putut trimite poza/ },
];
const SLOW = { store: "Familiaro", date: "2026-10-18", total: 57.3, items: [{ name: "Pâine albă", quantity: 1, amount: 57.3, category: "Alimente" }], payments: [{ method: "cash", amount: 57.3 }], confidence: "high", model: "gemini-3.5-flash-lite", isReceipt: true, ms: 3000 };
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = 0;
try {
  await waitFor(async () => (await fetch(BASE)).ok, "Vite", 60_000);
  for (const C of CASES) {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, locale: "ro-RO" });
    await context.addInitScript(() => { try { for (const [k, v] of Object.entries({ "buget-familie:setup-complete": "true", "buget-familie:onboarding-complete": "true", "buget-familie:first-week-tour-dismissed": "1", "buget-familie:whats-new-2026-10h": "1", "bonai:look-v1": "1", "buget-familie:receipt-scan-consent": "1" })) localStorage.setItem(k, v); } catch { /* */ } });
    await context.route(/readReceipt/, (route) => C.abort ? route.abort() : route.fulfill({ status: C.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(C.body) }));
    const page = await context.newPage();
    try {
      await page.goto(BASE); await page.waitForTimeout(1500);
      await page.locator(".os-dock-v2 > button").nth(2).click(); await page.waitForTimeout(800);
      const chooser = page.waitForEvent("filechooser");
      await page.locator(".bn-tile", { hasText: "Galerie" }).click(); await page.waitForTimeout(400);
      const ok = page.getByRole("button", { name: "Am înțeles, scanez" }); if (await ok.isVisible().catch(() => false)) await ok.click();
      await (await chooser).setFiles(IMG);
      const box = page.getByTestId("scan-error");
      await waitFor(() => box.isVisible(), "eroarea apare");
      await page.waitForTimeout(700);
      const text = await box.innerText();
      if (!C.expect.test(text)) fail(`text greșit: ${text}`);
      const r = await box.boundingBox();
      const vh = await page.evaluate(() => innerHeight);
      if (!r || r.y < 0 || r.y + Math.min(r.height, 80) > vh) fail(`eroarea nu e în ecran (y=${r?.y}, h=${r?.height}, ecran ${vh})`);
      if (!(await box.getByRole("button", { name: "Încearcă din nou" }).isVisible())) fail("lipsește Încearcă din nou");
      console.log(`✓ ${C.name}: ${text.replace(/\n/g, " · ")}`);
    } catch (e) { failed++; console.log(`✗ ${C.name}: ${e.message}`); await page.screenshot({ path: `/tmp/scan-error-${C.status || "net"}.png` }).catch(() => {}); }
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, locale: "ro-RO" });
    await context.addInitScript(() => { try { for (const [k, v] of Object.entries({ "buget-familie:setup-complete": "true", "buget-familie:onboarding-complete": "true", "buget-familie:first-week-tour-dismissed": "1", "buget-familie:whats-new-2026-10h": "1", "bonai:look-v1": "1", "buget-familie:receipt-scan-consent": "1" })) localStorage.setItem(k, v); } catch { /* */ } });
    await context.route(/readReceipt/, async (route) => { await new Promise((r) => setTimeout(r, 16_000)); await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ receipt: SLOW }) }); });
    const page = await context.newPage();
    try {
      await page.goto(BASE); await page.waitForTimeout(1500);
      await page.locator(".os-dock-v2 > button").nth(2).click(); await page.waitForTimeout(800);
      const chooser = page.waitForEvent("filechooser");
      await page.locator(".bn-tile", { hasText: "Galerie" }).click(); await page.waitForTimeout(400);
      const ok = page.getByRole("button", { name: "Am înțeles, scanez" }); if (await ok.isVisible().catch(() => false)) await ok.click();
      await (await chooser).setFiles(IMG);
      const review = page.getByRole("dialog", { name: "Verifică bonul" });
      await waitFor(() => review.isVisible(), "„Verifică bonul” după citirea lentă", 60_000);
      const text = await review.innerText();
      if (!/Citit în [1-9]\d/.test(text)) fail(`lipsește „Citit în … s”: ${text.slice(0, 900).replace(/\n/g, " | ")}`);
      if (!/citirea pe server 3 s/.test(text) || !/internetul 1[3-6]/.test(text)) fail(`timpii nu sunt împărțiți corect: ${text.slice(0, 500)}`);
      console.log(`✓ lent: ${/A durat mai mult[^\n]*/.exec(text)?.[0]}`);
    } catch (e) { failed++; console.log(`✗ lent: ${e.message}`); await page.screenshot({ path: "/tmp/scan-slow.png" }).catch(() => {}); }
    await context.close();
  }
} finally { await browser.close(); vite.kill(); }
if (failed) { console.error(`${failed} cazuri picate`); process.exit(1); }
