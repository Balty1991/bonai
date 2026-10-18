/**
 * Prima sesiune BonAI (Vite + Chromium, 360 px, ambele teme):
 *   1. Bun venit → „Văd întâi un exemplu”: bonuri inventate, cu banda „datele sunt inventate”.
 *   2. Scanarea din exemplu cere întâi ștergerea exemplului; după, telefonul e gol (nimic inventat rămas).
 *   3. După primul bon adevărat, Acasă arată „Din primul tău bon” cu cifrele din bon și ce urmează.
 * Rulare: node e2e/first-session.e2e.mjs (CHROMIUM_PATH, THEMES, SHOTS=dir).
 */
/* global getComputedStyle */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5197, BASE = `http://127.0.0.1:${PORT}/`;
const fail = (m) => { throw new Error(m); };
async function waitFor(check, what, timeout = 20_000) { const s = Date.now(); while (Date.now() - s < timeout) { if (await check().catch(() => false)) return; await new Promise((r) => setTimeout(r, 300)); } fail(`Timp depășit: ${what}`); }
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(3000); return page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

async function run(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: "ro-RO" });
  await context.addInitScript((theme) => { try { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("buget-familie:theme", theme); localStorage.setItem("buget-familie:theme-schedule", "manual"); localStorage.setItem("bonai:look-v1", "1"); localStorage.setItem("buget-familie:whats-new-2026-10h", "1"); for (const k of ["catalog", "ink", "atelier", "premium", "ui-chrome"]) localStorage.setItem(`buget-familie:theme-migrated-${k}-2026-09`, "1"); } } catch { /* about:blank */ } }, theme);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE);
  await page.getByRole("button", { name: /Văd întâi un exemplu/ }).click();
  await waitFor(() => page.getByText("datele sunt inventate").isVisible(), "banda exemplului");
  await waitFor(() => page.getByText("BONURILE RECENTE").isVisible(), "Acasă cu exemplu");
  const receipts = await page.evaluate(async () => (await (await import("/src/lib/app-storage.ts")).readAppData())?.receipts.length || 0);
  if (receipts < 3) fail(`exemplul are ${receipts} bonuri`);
  if (await page.getByText("DIN PRIMUL TĂU BON").count()) fail("cardul primului bon apare peste exemplu");
  await shot(page, `demo-home-${theme}`);
  // Scanarea din exemplu: confirmare, apoi exemplul dispare.
  await page.getByRole("button", { name: "Scanează bonul" }).first().click();
  const confirm = page.getByRole("button", { name: "Șterg exemplul și scanez" });
  await waitFor(() => confirm.isVisible(), "confirmarea ștergerii exemplului");
  await shot(page, `demo-leave-${theme}`);
  await confirm.click();
  await waitFor(async () => (await page.evaluate(async () => { const d = await (await import("/src/lib/app-storage.ts")).readAppData(); return d ? d.receipts.length + d.transactions.length + d.debts.length : -1; })) === 0, "exemplul șters");
  if (await page.getByText("datele sunt inventate").isVisible()) fail("banda exemplului a rămas");
  // Primul bon adevărat.
  await page.evaluate(async () => {
    const storage = await import("/src/lib/app-storage.ts");
    const { createEmptyAppData, isoToday } = await import("/src/lib/finance-data.ts");
    const data = await storage.readAppData() ?? createEmptyAppData();
    const now = new Date().toISOString();
    const L = (id, label, amount, category = "Alimente", discount) => ({ id, label, amount, category, ...(discount ? { discount } : {}) });
    data.receipts = [{ id: "b1", vendor: "Lidl", date: isoToday(), category: "Cumpărături", amount: 87.38, updatedAt: now, lines: [L("1", "Lapte Pilos 1,5% 1L", 6.49), L("2", "Detergent Ariel 2,2L", 47.5, "Casă", 5), L("3", "Pâine 500g", 4.99), L("4", "Ouă M 10 buc", 11.99), L("5", "Banane kg", 5.99), L("6", "Cafea Jacobs 250g", 9.92, "Alimente", 2), L("7", "Garanție SGR", 0.5, "SGR")] }];
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await storage.writeAppData(data, later); storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
  });
  await page.reload();
  const card = page.locator(".sh-card", { hasText: "DIN PRIMUL TĂU BON" });
  await waitFor(() => card.isVisible(), "cardul primului bon");
  const text = await card.innerText();
  for (const want of ["6 produse de la Lidl", "Detergent Ariel", "Reduceri tipărite pe bon: 7 lei"]) if (!text.replace(/\s+/g, " ").includes(want)) fail(`lipsește „${want}” din card: ${JSON.stringify(text)}`);
  // Cu plățile oprite toată lumea are Familie: oferta de probă Pro nu are ce căuta aici.
  if (/zile de Pro gratuit/.test(text)) fail(`oferta Pro apare unui utilizator Familie: ${JSON.stringify(text)}`);
  const clipped = await card.evaluate((el) => Array.from(el.querySelectorAll("*")).filter((n) => n.children.length === 0 && n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== "visible").length);
  if (clipped) fail("text tăiat în card");
  await card.scrollIntoViewIfNeeded(); await shot(page, `first-receipt-${theme}`);
  if (errors.length) fail(`erori în pagină: ${errors.join("; ")}`);
  await context.close();
}

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  await waitFor(async () => (await fetch(BASE)).ok, "Vite", 60_000);
  for (const theme of (process.env.THEMES || "white,dark").split(",")) { try { await run(browser, theme); } catch (e) { throw new Error(`${theme}: ${e.message}`, { cause: e }); } }
  console.log("✓ Prima sesiune: exemplu etichetat, ieșire curată, informații după primul bon.");
} finally { await browser.close(); vite.kill(); }
