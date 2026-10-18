/**
 * Bonul salvat pe aplicația reală: Cont › Bonuri › bon › Editează (prețul nou se vede în bon și în mișcare),
 * Șterge bonul (confirmare + „Anulează” 5 secunde, bonul revine), apăsare lungă în listă (meniu).
 * Rulare: node e2e/receipt-edit.e2e.mjs (CHROMIUM_PATH, THEMES, SHOTS opționale).
 */
/* global document */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5197, BASE = `http://127.0.0.1:${PORT}/`;
const fail = (message) => { throw new Error(message); };
async function waitFor(check, what, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await check().catch(() => false)) return; await new Promise((r) => setTimeout(r, 300)); }
  fail(`Timp depășit: ${what}`);
}
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

async function open(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: "ro-RO", hasTouch: false });
  await context.addInitScript((theme) => {
    try {
      for (const [k, v] of Object.entries({ "buget-familie:setup-complete": "true", "buget-familie:onboarding-complete": "true", "buget-familie:first-week-tour-dismissed": "1", "buget-familie:theme": theme, "buget-familie:whats-new-2026-10h": "1", "bonai:look-v1": "1", "buget-familie:theme-schedule": "manual" })) localStorage.setItem(k, v);
      for (const key of ["catalog", "ink", "atelier", "premium", "ui-chrome"]) localStorage.setItem(`buget-familie:theme-migrated-${key}-2026-09`, "1");
    } catch { /* about:blank */ }
  }, theme);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE); await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const storage = await import("/src/lib/app-storage.ts");
    const { createEmptyAppData, isoToday } = await import("/src/lib/finance-data.ts");
    const data = await storage.readAppData() ?? createEmptyAppData();
    const day = isoToday();
    const now = new Date().toISOString();
    data.transactions = [{ id: "tx-e2e", title: "Bon — Lidl", amount: 20.48, kind: "expense", category: "Alimente", source: "", person: "", date: day, receiptId: "detail-tx-e2e", createdAt: now, updatedAt: now }];
    data.receipts = [{ id: "detail-tx-e2e", vendor: "Lidl", amount: 20.48, category: "Alimente", date: day, linkedTransactionId: "tx-e2e", linkedTransactionIds: ["tx-e2e"], updatedAt: now, lines: [
      { id: "a", label: "Lapte Zuzu 1L × 2", amount: 13.98, category: "Alimente", qty: 2 }, { id: "b", label: "Pâine albă", amount: 6.5, category: "Alimente", discount: 1 }] }];
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await storage.writeAppData(data, later); storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
  });
  await page.reload(); await page.waitForTimeout(2000);
  await page.locator(".os-dock-v2 > button").nth(4).click(); await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^Bonuri/ }).first().click(); await page.waitForTimeout(800);
  return { context, page, errors };
}
const stored = (page) => page.evaluate(async () => { const s = await import("/src/lib/app-storage.ts"); const d = await s.readAppData(); return { receipts: d.receipts, transactions: d.transactions }; });

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  await waitFor(async () => (await fetch(BASE)).ok, "Vite", 60_000);
  for (const theme of (process.env.THEMES || "white,dark").split(",")) {
    const { context, page, errors } = await open(browser, theme);
    const history = page.getByRole("dialog", { name: "Istoric" });
    await history.getByRole("button", { name: /Lidl/ }).first().click();
    await waitFor(() => history.getByRole("button", { name: "Editează" }).isVisible(), "butonul Editează în bon");
    await shot(page, `receipt-detail-${theme}`);
    // Editare: prețul pâinii 6,50 → 7,50; totalul bonului devine 21,48.
    await history.getByRole("button", { name: "Editează" }).click();
    const editor = page.getByRole("dialog", { name: "Editează bonul" });
    await waitFor(() => editor.isVisible(), "editorul bonului");
    await editor.getByRole("button", { name: /Pâine albă/ }).click();
    await editor.getByLabel("Total (lei)").fill("7,50");
    await shot(page, `receipt-edit-${theme}`);
    await editor.getByRole("button", { name: "Gata" }).click();
    await editor.getByRole("button", { name: "Salvează modificările" }).click();
    await waitFor(async () => !(await editor.isVisible()), "editorul se închide");
    await waitFor(async () => /21,48/.test(await history.locator(".bn-costs-hero").innerText()), "totalul nou în bon").catch(async (e) => { console.log(await history.locator(".bn-costs-hero").innerText().catch(() => "?"), JSON.stringify(await stored(page))); throw e; });
    await waitFor(async () => { const d = await stored(page); return d.receipts[0]?.amount === 21.48 && d.transactions[0]?.amount === 21.48; }, "bonul și mișcarea salvate").catch(async (e) => { console.log(JSON.stringify(await stored(page))); throw e; });
    // Ștergere cu confirmare și Anulează.
    await history.getByRole("button", { name: "Șterge bonul" }).click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "Ștergi bonul?" }));
    await waitFor(() => confirm.first().isVisible(), "confirmarea ștergerii");
    await page.waitForTimeout(400);
    await shot(page, `receipt-delete-confirm-${theme}`);
    await confirm.first().getByRole("button", { name: "Șterge bonul" }).click();
    await waitFor(() => page.locator(".bf-undo-bar").isVisible(), "bara Anulează");
    await waitFor(async () => (await stored(page)).receipts.length === 0, "bonul șters");
    await shot(page, `receipt-deleted-undo-${theme}`);
    await page.locator(".bf-undo-bar").getByRole("button", { name: "Anulează" }).click();
    await waitFor(async () => (await stored(page)).receipts.length === 1 && (await stored(page)).transactions.length === 1, "Anulează readuce bonul și mișcarea");
    // Apăsare lungă în listă: meniul cu Editează / Șterge.
    const row = history.getByRole("button", { name: /Lidl/ }).first();
    await waitFor(() => row.isVisible(), "bonul revine în listă");
    const box = await row.boundingBox();
    await page.mouse.move(box.x + 40, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    await waitFor(() => page.getByRole("menu").isVisible(), "meniul la apăsare lungă");
    await shot(page, `receipt-longpress-${theme}`);
    if (await page.evaluate(() => Boolean(document.querySelector(".bn-costs-hero")))) fail("apăsarea lungă a deschis și bonul");
    if (errors.length) fail(`erori în pagină: ${errors.join("; ")}`);
    await context.close();
  }
  // Undo-ul ține 5 secunde.
  const { context, page } = await open(browser, "white");
  await page.getByRole("dialog", { name: "Istoric" }).getByRole("button", { name: /Lidl/ }).first().click();
  await page.getByRole("button", { name: "Șterge bonul" }).click();
  await page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "Ștergi bonul?" })).first().getByRole("button", { name: "Șterge bonul" }).click();
  await waitFor(() => page.locator(".bf-undo-bar").isVisible(), "bara Anulează");
  await page.waitForTimeout(5600);
  if (await page.locator(".bf-undo-bar").isVisible()) fail("Anulează a rămas mai mult de 5 secunde");
  await context.close();
  console.log("✓ Bonul salvat: editarea se salvează, ștergerea cere confirmare și se poate anula, apăsarea lungă deschide meniul.");
} finally { await browser.close(); vite.kill(); }
