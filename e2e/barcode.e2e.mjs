/**
 * Codul de bare pe aplicația reală (Vite + Chromium cu cameră falsă):
 *   1. Prețuri › Produse › „Scanează codul de bare” deschide scanerul cu camera live;
 *   2. cu camera refuzată, scanerul arată de ce (nu tace);
 *   3. cifrele scrise + „Verifică” leagă codul de produsul din bonuri și arată cardul cu ultimul preț;
 *   4. Cumpărături › Listă are butonul de scanare care deschide scanerul.
 * Rulare: node e2e/barcode.e2e.mjs (CHROMIUM_PATH opțional, SHOTS=dir pentru capturi).
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5199, BASE = `http://127.0.0.1:${PORT}/`;
const fail = (message) => { throw new Error(message); };
async function waitFor(check, what, timeout = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await check().catch(() => false)) return; await new Promise((r) => setTimeout(r, 400)); }
  fail(`Timp depășit: ${what}`);
}
/* global document, getComputedStyle -- rulează în pagină */
const CODE = "5942247100868";

async function open(browser, { theme = "white", width = 360, camera = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, locale: "ro-RO", permissions: camera ? ["camera"] : [] });
  await context.addInitScript((theme) => {
    try {
      for (const [k, v] of Object.entries({ "buget-familie:setup-complete": "true", "buget-familie:onboarding-complete": "true", "buget-familie:first-week-tour-dismissed": "1", "buget-familie:theme": theme, "buget-familie:whats-new-2026-10h": "1", "bonai:look-v1": "1", "buget-familie:theme-schedule": "manual" })) localStorage.setItem(k, v);
      for (const key of ["catalog", "ink", "atelier", "premium", "ui-chrome"]) localStorage.setItem(`buget-familie:theme-migrated-${key}-2026-09`, "1");
    } catch { /* about:blank */ }
  }, theme);
  // Open Food Facts: numele produsului, fără rețea.
  await context.route("https://world.openfoodfacts.org/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: 1, product: { product_name: "Apă minerală carbogazoasă", brands: "Tușnad", quantity: "2 L" } }) }));
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE); await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const storage = await import("/src/lib/app-storage.ts");
    const { createEmptyAppData, isoToday } = await import("/src/lib/finance-data.ts");
    const data = await storage.readAppData() ?? createEmptyAppData();
    const day = (o) => { const d = new Date(`${isoToday()}T12:00:00`); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); };
    const line = (id, label, amount) => ({ id, label, amount, category: "Băuturi", qty: 1 });
    data.receipts = [
      { id: "b1", vendor: "Kaufland", amount: 6.4, date: day(-20), category: "Cumpărături", lines: [line("l1", "APA MIN TUSNAD 2L", 3.0), line("l2", "APA MIN BORSEC 2L", 3.4)] },
      { id: "b2", vendor: "Lidl", amount: 5.3, date: day(-4), category: "Cumpărături", lines: [line("l3", "APA MIN TUSNAD 2L", 3.2), line("l4", "APA MIN TUSNAD 0.5L", 2.1)] },
    ];
    data.settings.shoppingList = [];
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await storage.writeAppData(data, later); storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
  });
  await page.reload(); await page.waitForTimeout(2000);
  return { context, page, errors };
}
const dock = async (page, index) => { await page.locator(".os-dock-v2 > button").nth(index).click(); await page.waitForTimeout(900); };
const products = async (page) => { await dock(page, 3); await page.getByRole("tab", { name: /^Produse$/ }).click(); await page.waitForTimeout(500); };
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: false }); };

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
try {
  await waitFor(async () => (await fetch(BASE)).ok, "Vite");
  const themes = (process.env.THEMES || "white,dark").split(",");
  for (const theme of themes) {
    // 1. Butonul deschide scanerul cu camera pornită.
    let { context, page, errors } = await open(browser, { theme });
    await products(page);
    await page.getByRole("button", { name: /^Scanează codul de bare$/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Scanează codul de bare" });
    await waitFor(() => dialog.isVisible(), "scanerul se deschide");
    await waitFor(() => page.evaluate(() => { const v = document.querySelector(".bn-barcode-video"); return Boolean(v && v.srcObject && v.readyState >= 2); }), "camera live în scaner");
    await shot(page, `barcode-scanner-${theme}`);
    await dialog.getByRole("button", { name: "Închide" }).click();
    await waitFor(async () => !(await dialog.isVisible()), "scanerul se închide");
    if (await page.evaluate(() => { const v = document.querySelector(".bn-barcode-video"); return Boolean(v); })) fail("camera rămâne pornită după închidere");

    // 3. Cifrele scrise: potrivirea după nume și gramaj arată cardul cu ultimul preț.
    await page.getByLabel("Codul de bare").fill(CODE);
    await page.getByRole("button", { name: /^Verifică$/ }).click();
    await waitFor(() => page.locator(".bn-bc-card").isVisible(), "cardul produsului după cifre").catch(async (error) => { await page.screenshot({ path: "/tmp/bc-fail.png" }); console.log(errors.join("; ")); throw error; });
    const card = await page.locator(".bn-bc-card").innerText();
    if (!/APA MIN TUSNAD 2L/.test(card) || !/3,20/.test(card) || !/Lidl/.test(card)) fail(`cardul nu arată ultimul preț corect: ${card}`);
    await page.getByLabel("Prețul de pe raft acum").fill("3,52");
    await waitFor(async () => /Mai scump cu 10%/.test(await page.locator(".bn-bc-verdict").innerText()), "comparația cu raftul");
    await page.locator(".bn-bc-card").scrollIntoViewIfNeeded();
    await shot(page, `barcode-card-${theme}`);
    const clipped = await page.evaluate(() => Array.from(document.querySelectorAll(".bn-bc *")).filter((el) => el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible").map((el) => el.textContent.trim().slice(0, 40)));
    if (clipped.length) fail(`text tăiat în card: ${clipped.join(" | ")}`);
    // Legarea manuală prin căutare.
    await page.getByRole("button", { name: /^Alt produs$/ }).click();
    await page.getByLabel("Caută în produsele tale").fill("tusnad");
    await shot(page, `barcode-picker-${theme}`);
    const first = await page.locator(".bn-bc-options button").first().innerText();
    if (!/TUSNAD/.test(first)) fail(`căutarea nu pune Tușnad primul: ${first}`);
    await page.locator(".bn-bc-options button").first().click();
    await waitFor(() => page.locator(".bn-bc-card").isVisible(), "cardul după legare");
    await waitFor(() => page.evaluate(async (code) => { const s = await import("/src/lib/app-storage.ts"); const d = await s.readAppData(); return Boolean(d?.settings?.barcodeLinks?.[code]); }, CODE), "legătura cod → produs salvată", 10_000);
    if (errors.length) fail(`erori în pagină: ${errors.join("; ")}`);
    await context.close();

    // 5. Cod necunoscut în bonuri (hrană pisici): găsit în Open Pet Food Facts, cu poză, marcă, sursă și categorie; „Adaugă în listă”.
    ({ context, page, errors } = await open(browser, { theme }));
    await context.route(/open(food|petfood|products|beauty)facts\.org\/api|query\.wikidata\.org/, (route) => {
      const url = route.request().url();
      const body = url.includes("openpetfoodfacts") ? { status: 1, product: { product_name: "Hrană uscată pentru pisici adulte cu somon", brands: "Ultima", quantity: "1,5 kg", categories_tags: ["en:pet-food", "en:cat-food"] } } : url.includes("wikidata") ? { results: { bindings: [] } } : { status: 0 };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await products(page);
    await page.getByLabel("Codul de bare").fill("8445292288705");
    await page.getByRole("button", { name: /^Verifică$/ }).click();
    await waitFor(() => page.locator(".bn-bc-found").isVisible(), "produsul din Open Pet Food Facts");
    const petText = await page.locator(".bn-bc-found").innerText();
    if (!/pisici/.test(petText) || !/Ultima/.test(petText) || !/Open Pet Food Facts/.test(petText)) fail(`cardul produsului găsit: ${petText}`);
    if (/Nu-l recunosc/.test(await page.locator(".bn-bc").innerText())) fail("încă spune „Nu-l recunosc”");
    await page.locator(".bn-bc-found").scrollIntoViewIfNeeded();
    await shot(page, `barcode-pet-${theme}`);
    await page.getByRole("button", { name: /^Adaugă în listă$/ }).click();
    await waitFor(() => page.evaluate(async () => { const s = await import("/src/lib/app-storage.ts"); const d = await s.readAppData(); return d.settings.shoppingList.some((i) => /pisici/.test(i.text)); }), "produsul pe listă");
    await context.close();

    // 4. Lista: butonul de scanare deschide scanerul.
    ({ context, page, errors } = await open(browser, { theme }));
    await dock(page, 1);
    await page.locator(".bf-shop-barcode").click();
    await waitFor(() => page.getByRole("dialog", { name: "Scanează codul de bare" }).isVisible(), "scanerul din listă");
    await context.close();
  }
  // 2. Camera refuzată: mesaj clar, nu tăcere.
  const { context, page } = await open(browser, { camera: false });
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })); });
  await products(page);
  await page.getByRole("button", { name: /^Scanează codul de bare$/ }).first().click();
  await waitFor(async () => /Nu am acces la cameră/.test(await page.getByRole("alert").innerText()), "mesajul de cameră refuzată");
  await shot(page, "barcode-denied");
  await context.close();
  console.log("✓ Codul de bare: scanerul pornește, refuzul se explică, cifrele găsesc produsul, lista scanează.");
} finally { await browser.close(); vite.kill(); }
