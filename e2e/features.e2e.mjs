/**
 * Funcțiile BonAI pe aplicația reală, cu bonuri de test (Vite + Chromium), în ambele teme, la 360 px:
 *   1. Economisit cu BonAI pe Acasă — doar reduceri și alegeri mai ieftine din bonuri.
 *   0. Cheltuială fără bon: suma + categoria în 2 atingeri, repetare dintr-o atingere, apare în Toate costurile.
 *   2. Lista cu prețuri: ultimul preț pe bucată, unde și când, totalul estimat și magazinul mai ieftin.
 *   3. Ți se termină: din ritmul cumpărăturilor, cu un tap pe listă și „Am destul”.
 * Pică dacă cifra nu e cea calculată din bonuri, dacă un text iese din cutie sau dacă pagina aruncă erori.
 * Rulare: node e2e/features.e2e.mjs (CHROMIUM_PATH, THEMES, ONLY=regex, SHOTS=dir opționale).
 */
/* global document, getComputedStyle */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5196, BASE = `http://127.0.0.1:${PORT}/`;
const fail = (message) => { throw new Error(message); };
async function waitFor(check, what, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await check().catch(() => false)) return; await new Promise((r) => setTimeout(r, 300)); }
  fail(`Timp depășit: ${what}`);
}
const shot = async (page, name, locator) => { if (!process.env.SHOTS) return; if (locator) await locator.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const clipped = (page, selector) => page.evaluate((selector) => Array.from(document.querySelectorAll(`${selector} *`)).filter((el) => el.children.length === 0 && el.textContent.trim() && el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible").map((el) => el.textContent.trim().slice(0, 40)), selector);

/** Bonuri de test: date relative la azi, ca luna curentă să aibă conținut. */
async function seed(page) {
  await page.evaluate(async () => {
    const storage = await import("/src/lib/app-storage.ts");
    const { createEmptyAppData, isoToday } = await import("/src/lib/finance-data.ts");
    const data = await storage.readAppData() ?? createEmptyAppData();
    const today = isoToday();
    const day = (o) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); };
    // Ziua bonurilor din luna curentă: cel mult azi, dar în aceeași lună.
    const inMonth = (o) => { const d = day(-o); return d.slice(0, 7) === today.slice(0, 7) ? d : `${today.slice(0, 7)}-01`; };
    const now = new Date().toISOString();
    const L = (id, label, amount, category = "Alimente", extra = {}) => ({ id, label, amount, category, ...extra });
    const R = (id, vendor, date, lines) => ({ id, vendor, date, category: "Cumpărături", amount: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, lines, updatedAt: now });
    data.receipts = [
      R("c1", "Profi", day(-60), [L("c1a", "Cafea Jacobs 250g", 21.9)]), R("c2", "Profi", day(-45), [L("c2a", "Cafea Jacobs 250g", 21.9)]), R("c3", "Profi", day(-30), [L("c3a", "Cafea Jacobs 250g", 21.9)]),
      R("e1", "Kaufland", day(-40), [L("k1", "Ulei Spornic 1L", 9.5), L("k2", "Lapte Zuzu 1L", 7.49), L("k3", "Pâine albă", 5.2)]),
      R("e2", "Kaufland", day(-26), [L("k4", "Lapte Zuzu 1L", 7.49), L("k5", "Ouă 10 buc", 12.9), L("k6", "Pâine albă", 5.2)]),
      R("e3", "Lidl", day(-12), [L("l1", "Ulei Spornic 1L", 8.0), L("l2", "Lapte Zuzu 1L", 6.99), L("l3", "Pâine albă", 5.2), L("l4", "Detergent Ariel 2L", 39.9, "Casă")]),
      R("e4", "Lidl", inMonth(2), [L("m1", "Ulei Spornic 1L", 7.0, "Alimente", { discount: 0.5 }), L("m2", "Lapte Zuzu 1L", 6.99), L("m3", "Ouă 10 buc", 11.9), L("m4", "Pâine albă", 5.2, "Alimente", { discount: 0.6 })]),
    ];
    data.settings.shoppingList = ["lapte", "ulei", "ouă", "zahăr"].map((text, i) => ({ id: `s${i}`, text, updatedAt: now }));
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await storage.writeAppData(data, later); storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
  });
}

async function open(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: "ro-RO" });
  await context.addInitScript((theme) => {
    try {
      for (const [k, v] of Object.entries({ "buget-familie:setup-complete": "true", "buget-familie:onboarding-complete": "true", "buget-familie:first-week-tour-dismissed": "1", "buget-familie:theme": theme, "buget-familie:whats-new-2026-10h": "1", "bonai:look-v1": "1", "buget-familie:theme-schedule": "manual" })) localStorage.setItem(k, v);
      for (const key of ["catalog", "ink", "atelier", "premium", "ui-chrome"]) localStorage.setItem(`buget-familie:theme-migrated-${key}-2026-09`, "1");
    } catch { /* about:blank */ }
  }, theme);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE); await page.waitForTimeout(1200);
  await seed(page); await page.reload(); await page.waitForTimeout(2000);
  return { context, page, errors };
}
const expected = (page) => page.evaluate(async () => { const { savedWithBonAI } = await import("/src/lib/saved-with-bonai.ts"); const s = await import("/src/lib/app-storage.ts"); const { isoToday } = await import("/src/lib/finance-data.ts"); return savedWithBonAI(await s.readAppData(), isoToday()); });
const leiRo = (v) => v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FEATURES = {
  /** 0. Foaia rapidă fără bon (taxi, cafea): nu creează bon fals. */
  async quick(page, theme) {
    await page.getByRole("button", { name: /Fără bon\? Notează suma/ }).click();
    const sheet = page.getByRole("dialog", { name: "Cheltuială fără bon" });
    await waitFor(() => sheet.isVisible(), "foaia fără bon");
    if (!(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Suma"))) fail("suma nu primește focus");
    await page.keyboard.type("25");
    await sheet.getByRole("radio", { name: /Taxi/ }).click();
    await shot(page, `quick-${theme}`);
    const cut = await clipped(page, ".bn-qx");
    if (cut.length) fail(`text tăiat: ${cut.join(" | ")}`);
    await sheet.getByRole("button", { name: /^Salvează · 25 lei$/ }).click();
    await waitFor(async () => !(await sheet.isVisible()), "foaia se închide");
    const after = () => page.evaluate(async () => { const s = await import("/src/lib/app-storage.ts"); const d = await s.readAppData(); return { tx: d.transactions.filter((t) => t.category === "Taxi"), receipts: d.receipts.length }; });
    await waitFor(async () => (await after()).tx.length === 1, "taxiul salvat");
    if ((await after()).receipts !== 7) fail("cheltuiala fără bon a creat un bon");
    // Repetare dintr-o atingere.
    await page.getByRole("button", { name: /Fără bon\? Notează suma/ }).click();
    await waitFor(() => sheet.isVisible(), "foaia din nou");
    await shot(page, `quick-repeat-${theme}`);
    await sheet.getByRole("button", { name: /Taxi · 25 lei/ }).click();
    await waitFor(async () => (await after()).tx.length === 2, "repetarea salvată");
    // Toate costurile o arată, cu categoria.
    await page.locator(".os-dock-v2 > button").nth(4).click(); await page.waitForTimeout(600);
    await page.getByRole("button", { name: /^Bonuri/ }).first().click();
    const history = page.getByRole("dialog", { name: "Istoric" });
    await history.getByRole("tab", { name: "Toate costurile" }).click();
    await waitFor(async () => /Taxi/.test(await history.innerText()), "taxiul în Toate costurile");
  },
  /** 1. Contorul de pe Acasă arată exact suma calculată din bonuri și defalcarea ei. */
  async saved(page, theme) {
    const want = await expected(page);
    if (!(want.total > 0)) fail(`datele de test ar trebui să dea economii, nu ${want.total}`);
    const card = page.locator(".sh-card", { hasText: "ECONOMISIT CU BONAI" }).first();
    await waitFor(() => card.isVisible(), "cardul Economisit cu BonAI");
    const text = await card.innerText();
    if (!text.includes(leiRo(want.total))) fail(`cardul nu arată ${leiRo(want.total)}: ${text}`);
    for (const [label, value] of [["Reduceri pe bon", want.discounts], ["Magazin mai ieftin", want.store], ["Preț mai mic", want.drop]]) if (value > 0 && !text.includes(label)) fail(`lipsește „${label}”`);
    await shot(page, `saved-${theme}`, card);
    const cut = await clipped(page, ".sh-card");
    if (cut.length) fail(`text tăiat: ${cut.join(" | ")}`);
  },
  /** 2. Lista: prețurile vin din bonuri (lapte 6,99 la Lidl), produsul necunoscut rămâne fără preț. */
  async list(page, theme) {
    await page.locator(".os-dock-v2 > button").nth(1).click();
    const panel = page.locator(".bf-shopping");
    await waitFor(() => panel.isVisible(), "lista");
    const want = await page.evaluate(async () => { const { estimateShopping } = await import("/src/lib/shopping-price.ts"); const s = await import("/src/lib/app-storage.ts"); const { isoToday } = await import("/src/lib/finance-data.ts"); const d = await s.readAppData(); return estimateShopping(d.settings.shoppingList, d.receipts, isoToday()); });
    if (want.known !== 3 || want.prices.s3) fail(`estimarea de test: ${JSON.stringify(want)}`);
    const milk = panel.locator("li", { hasText: "lapte" }).first();
    const text = await milk.innerText();
    if (!text.includes(leiRo(want.prices.s0.price)) || !/Lidl/.test(text)) fail(`laptele nu arată ultimul preț: ${text}`);
    if (/~/.test(await panel.locator("li", { hasText: "zahăr" }).first().innerText())) fail("zahărul n-are bon, dar are preț");
    const estimate = await panel.locator(".bf-shop-estimate").innerText();
    if (!estimate.includes(leiRo(want.total))) fail(`totalul estimat nu e ${leiRo(want.total)}: ${estimate}`);
    await shot(page, `list-${theme}`, panel.locator(".bf-shop-estimate"));
    const cut = await clipped(page, ".bf-shopping");
    if (cut.length) fail(`text tăiat: ${cut.join(" | ")}`);
  },
  /** 3. Cafeaua (o dată la ~15 zile, ultima acum 30) apare; un tap o pune pe listă și dispare din card. */
  async runout(page, theme) {
    await page.locator(".os-dock-v2 > button").nth(1).click();
    const card = page.locator(".sh-runout");
    await waitFor(() => card.isVisible(), "cardul Ți se termină");
    const text = await card.innerText();
    if (!/Cafea Jacobs/.test(text)) fail(`cafeaua lipsește: ${text}`);
    if (/Lapte/.test(text)) fail("laptele e deja pe listă, nu trebuia sugerat");
    await shot(page, `runout-${theme}`, card);
    const cut = await clipped(page, ".sh-runout");
    if (cut.length) fail(`text tăiat: ${cut.join(" | ")}`);
    await card.getByRole("button", { name: /Pune Cafea Jacobs/ }).click();
    await waitFor(async () => (await page.evaluate(async () => { const s = await import("/src/lib/app-storage.ts"); const d = await s.readAppData(); return d.settings.shoppingList.some((i) => /Cafea Jacobs/.test(i.text)); })), "cafeaua pe listă");
    await waitFor(async () => !(await card.isVisible()) || !/Cafea Jacobs/.test(await card.innerText()), "cafeaua iese din card");
  },
};

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  await waitFor(async () => (await fetch(BASE)).ok, "Vite", 60_000);
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  for (const theme of (process.env.THEMES || "white,dark").split(",")) for (const [name, run] of Object.entries(FEATURES)) {
    if (only && !only.test(name)) continue;
    const { context, page, errors } = await open(browser, theme);
    try { await run(page, theme); } catch (error) { throw new Error(`${name} (${theme}): ${error.message}`, { cause: error }); }
    if (errors.length) fail(`${name} (${theme}): erori în pagină: ${errors.join("; ")}`);
    await context.close();
  }
  console.log(`✓ Funcțiile BonAI: ${Object.keys(FEATURES).join(", ")}.`);
} finally { await browser.close(); vite.kill(); }
