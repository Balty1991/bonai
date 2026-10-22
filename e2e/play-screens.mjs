/**
 * Capturile pentru Google Play, din aplicația de acum (Vite + Chromium), cu o familie demo inventată:
 * fiecare ecran e fotografiat la 390 px (×2), apoi pus într-un cadru 1080×1920 (9:16) cu titlul lui.
 * Ies în docs/play-store-assets/screenshots/{ro,en}/NN-nume.png. Fără date reale, fără promisiuni:
 * titlurile spun ce face ecranul de dedesubt.
 * Rulare: node e2e/play-screens.mjs (CHROMIUM_PATH, LANGS=ro,en, ONLY=regex, RAW=1 doar capturile brute).
 */
/* global window */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = 5207, BASE = `http://127.0.0.1:${PORT}/`;
const OUT = new URL("../docs/play-store-assets/screenshots/", import.meta.url).pathname;
const RAW = new URL("../docs/play-store-assets/screenshots/raw/", import.meta.url).pathname;
const fail = (message) => { throw new Error(message); };
async function waitFor(check, what, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await check().catch(() => false)) return; await new Promise((r) => setTimeout(r, 300)); }
  fail(`Timp depășit: ${what}`);
}

/** Familia demo: trei luni de bonuri de la patru magazine, cu mărci și gramaje, listă și garanție. */
async function seed(page, lang) {
  await page.evaluate(async (lang) => {
    const storage = await import("/src/lib/app-storage.ts");
    const { createEmptyAppData, isoToday } = await import("/src/lib/finance-data.ts");
    const data = createEmptyAppData();
    const today = isoToday();
    const day = (o) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); };
    const now = new Date().toISOString();
    const me = { id: "member-me", name: "Andrei", color: "#6d28d9" };
    data.settings.members = [me, { id: "member-maria", name: "Maria", color: "#0e7490" }];
    data.settings.selfMemberId = me.id;
    data.settings.memberName = me.name;
    data.settings.familyName = lang === "en" ? "The Popescu family" : "Familia Popescu";
    // [nume, preț, categorie, marcă, gramaj, unitate gramaj, reducere]
    const P = {
      lapte: ["Lapte Zuzu 1,5% 1 l", "Alimente", "Zuzu", 1, "l"],
      paine: ["Pâine albă feliată Vel Pitar 500 g", "Alimente", "Vel Pitar", 500, "g"],
      oua: ["Ouă M 10 buc", "Alimente", undefined, 10, "buc"],
      ulei: ["Ulei Floriol 1 l", "Alimente", "Floriol", 1, "l"],
      cafea: ["Cafea Jacobs Krönung 500 g", "Alimente", "Jacobs", 500, "g"],
      iaurt: ["Iaurt Danone 140 g", "Alimente", "Danone", 140, "g"],
      branza: ["Telemea de vacă Hochland 300 g", "Alimente", "Hochland", 300, "g"],
      banane: ["Banane", "Alimente", undefined, 1, "kg"],
      apa: ["Apă minerală Borsec 2 l", "Apă", "Borsec", 2, "l"],
      detergent: ["Detergent Ariel 2,2 l", "Casă & facturi", "Ariel", 2.2, "l"],
      scutece: ["Scutece Pampers 4 x 50", "Consumabile copil", "Pampers", 50, "buc"],
      ciocolata: ["Ciocolată Milka 100 g", "Dulciuri", "Milka", 100, "g"],
    };
    const prices = {
      Lidl: { lapte: 6.99, paine: 4.99, oua: 11.9, ulei: 8.49, cafea: 34.9, iaurt: 2.29, banane: 6.49, apa: 3.59, detergent: 42.9, ciocolata: 5.49 },
      Kaufland: { lapte: 7.49, paine: 5.39, oua: 12.9, ulei: 8.99, cafea: 36.9, iaurt: 2.49, branza: 15.9, banane: 6.99, apa: 3.79, detergent: 44.9, scutece: 69.9, ciocolata: 5.99 },
      Profi: { lapte: 7.99, paine: 5.69, oua: 13.5, cafea: 39.9, iaurt: 2.69, branza: 16.9, apa: 3.99, ciocolata: 6.49 },
      "Mega Image": { lapte: 8.29, paine: 5.99, oua: 13.9, cafea: 41.5, iaurt: 2.79, branza: 17.5, banane: 7.49, ciocolata: 6.99 },
    };
    const visits = [
      ["Lidl", -84, ["lapte", "paine", "oua", "ulei", "banane", "apa", "iaurt"]], ["Kaufland", -76, ["lapte", "paine", "cafea", "branza", "detergent", "scutece"]],
      ["Profi", -70, ["lapte", "paine", "iaurt", "ciocolata"]], ["Lidl", -63, ["lapte", "oua", "banane", "apa", "iaurt", "ciocolata"]],
      ["Mega Image", -56, ["lapte", "paine", "branza", "cafea"]], ["Kaufland", -49, ["lapte", "paine", "oua", "ulei", "scutece", "apa"]],
      ["Lidl", -42, ["lapte", "paine", "banane", "iaurt", "detergent", "ciocolata"]], ["Profi", -35, ["lapte", "paine", "oua", "cafea"]],
      ["Kaufland", -28, ["lapte", "paine", "branza", "banane", "apa", "iaurt"]], ["Lidl", -21, ["lapte", "paine", "oua", "ulei", "cafea", "apa", "ciocolata"]],
      ["Mega Image", -14, ["lapte", "paine", "iaurt", "branza"]], ["Kaufland", -9, ["lapte", "paine", "oua", "scutece", "detergent", "banane"]],
      ["Lidl", -4, ["lapte", "paine", "oua", "banane", "iaurt", "apa", "ciocolata", "cafea"]], ["Profi", -1, ["lapte", "paine", "branza", "ciocolata"]],
    ];
    // Prețurile urcă puțin în timp (inflația), iar câteva rânduri au reducere tipărită pe bon.
    data.receipts = visits.map(([vendor, offset, keys], index) => {
      const drift = 1 + (offset + 84) / 84 * 0.06;
      const lines = keys.map((key, line) => {
        const [label, category, brand, size, sizeUnit] = P[key];
        const amount = Math.round(prices[vendor][key] * drift * 100) / 100;
        const discount = (index + line) % 5 === 0 ? Math.round(amount * 0.2 * 100) / 100 : 0;
        return { id: `l${index}-${line}`, label, category, amount: Math.round((amount - discount) * 100) / 100, ...(discount ? { discount } : {}), ...(brand ? { brand } : {}), size, sizeUnit, qty: 1 };
      });
      const amount = Math.round(lines.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
      return { id: `r${index}`, vendor, date: day(offset), category: "Cumpărături", amount, lines, city: "Cluj-Napoca", memberId: index % 3 ? me.id : "member-maria", updatedAt: now };
    });
    data.settings.shoppingList = (lang === "en" ? ["milk", "bread", "eggs", "coffee", "bananas", "yogurt"] : ["lapte", "pâine", "ouă", "cafea", "banane", "iaurt"]).map((text, i) => ({ id: `s${i}`, text, updatedAt: now, ...(i === 1 ? { done: true } : {}) }));
    data.settings.warranties = [{ id: "w1", name: lang === "en" ? "Vacuum cleaner" : "Aspirator vertical", price: 1299, purchaseDate: day(-40), months: 24, returnDays: 14, updatedAt: now }];
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await storage.writeAppData(data, later); storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
  }, lang);
}

async function open(browser, lang) {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, locale: lang === "en" ? "en-US" : "ro-RO", isMobile: true, hasTouch: true });
  await context.addInitScript((lang) => {
    try {
      for (const [k, v] of Object.entries({ "buget-familie:setup-complete": "true", "buget-familie:onboarding-complete": "true", "buget-familie:first-week-tour-dismissed": "1", "buget-familie:theme": "white", "buget-familie:whats-new-2026-10h": "1", "bonai:look-v1": "1", "buget-familie:theme-schedule": "manual", "bonai:community-invite": "no", "buget-familie:language": lang })) localStorage.setItem(k, v);
      for (const key of ["catalog", "ink", "atelier", "premium", "ui-chrome"]) localStorage.setItem(`buget-familie:theme-migrated-${key}-2026-09`, "1");
    } catch { /* about:blank */ }
  }, lang);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE); await page.waitForTimeout(1200);
  await seed(page, lang); await page.reload(); await page.waitForTimeout(2200);
  return { context, page, errors };
}

const dock = async (page, index) => { await page.locator(".os-dock-v2 > button").nth(index).click(); await page.waitForTimeout(1000); };
const tab = async (page, name) => { await page.getByRole("tab", { name }).first().click(); await page.waitForTimeout(900); };
const top = (page) => page.evaluate(() => window.scrollTo(0, 0));
const scrollTo = async (page, selector, gap = 90) => { await page.locator(selector).first().evaluate((el, gap) => { el.scrollIntoView({ block: "start" }); window.scrollBy(0, -gap); }, gap); await page.waitForTimeout(500); };

/** Fiecare ecran: cum ajungi la el și titlul din cadru (RO / EN). */
const SCREENS = [
  { id: "01-acasa", go: async (page) => { await top(page); }, ro: ["Bonurile tale,", "lunile tale, clar"], en: ["Your receipts,", "your month, clearly"] },
  { id: "02-bonul", go: async (page, lang) => {
    await dock(page, 4); await page.getByRole("button", { name: lang === "en" ? /^Receipts/ : /^Bonuri/ }).first().click(); await page.waitForTimeout(900);
    const history = page.getByRole("dialog").first();
    await history.getByRole("button", { name: /Lidl/ }).first().click(); await page.waitForTimeout(700);
    await history.getByRole("button", { name: lang === "en" ? "Edit" : "Editează" }).click(); await page.waitForTimeout(1200);
    // Produsele bonului, nu doar antetul: prima grupă sus, sub bara de titlu.
    await page.locator(".bn-item").first().evaluate((el) => { el.scrollIntoView({ block: "start" }); el.closest(".bn-review-scroll")?.scrollBy(0, -150); }); await page.waitForTimeout(500);
  }, ro: ["Fotografiezi bonul.", "Citesc fiecare produs"], en: ["Snap the receipt.", "Every item, with its price"] },
  { id: "03-magazine", go: async (page, lang) => { await dock(page, 3); await tab(page, lang === "en" ? /^Stores$/ : /^Magazine$/); await top(page); }, ro: ["Unde coșul tău", "iese mai ieftin"], en: ["Where your basket", "costs less"] },
  { id: "04-lista", go: async (page) => { await dock(page, 1); await scrollTo(page, ".bf-shop-add", 150); }, ro: ["Lista familiei,", "cu prețurile plătite"], en: ["The family list,", "with prices you paid"] },
  { id: "05-produs", go: async (page) => { await dock(page, 3); await page.locator(".bn-pw-item, .bf-price-row, [data-product]").first().click().catch(async () => { await page.getByRole("button", { name: /Lapte Zuzu/ }).first().click(); }); await page.waitForTimeout(1200); }, ro: ["Prețul fiecărui", "produs, în timp"], en: ["Every product's", "price over time"] },
  { id: "06-in-casa", go: async (page, lang) => { await dock(page, 1); await tab(page, lang === "en" ? /^At home$/ : /^În casă$/); await top(page); }, ro: ["Vezi ce ai în casă", "și ce se termină"], en: ["See what's at home", "and what runs out"] },
  { id: "07-economisit", go: async (page) => { await top(page); await scrollTo(page, ".sh-card:has(.sh-saved-big)", 80); }, ro: ["Reducerile de pe bonuri,", "adunate pentru tine"], en: ["Your receipt discounts,", "added up for you"] },
  { id: "08-rapoarte", go: async (page, lang) => { await dock(page, 3); await tab(page, lang === "en" ? /^Reports$/ : /^Rapoarte$/); await top(page); }, ro: ["Unde se duc banii,", "lună de lună"], en: ["Where the money goes,", "month by month"] },
];

const font = (file) => `data:font/woff2;base64,${readFileSync(new URL(`../client/src/assets/fonts/${file}`, import.meta.url)).toString("base64")}`;
const FONTS = `@font-face{font-family:Head;src:url(${font("space-grotesk-latin.woff2")}) format("woff2");font-weight:300 700}
@font-face{font-family:Head;src:url(${font("ibm-plex-sans-latin-ext.woff2")}) format("woff2");unicode-range:U+0100-024F,U+0218-021B;font-weight:300 700}`;

/** Cadrul 1080×1920: titlul sus, captura cu colțuri rotunjite dedesubt. */
async function frame(browser, shot, lines) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const img = `data:image/png;base64,${shot.toString("base64")}`;
  await page.setContent(`<!doctype html><html><head><style>${FONTS}
    html,body{margin:0;width:1080px;height:1920px;overflow:hidden}
    body{background:linear-gradient(160deg,#7c3aed 0%,#4f46e5 55%,#0e7490 100%);font-family:Head,system-ui,sans-serif;color:#fff;display:flex;flex-direction:column;align-items:center}
    h1{margin:104px 60px 0;font-size:76px;line-height:1.08;font-weight:700;letter-spacing:-1.5px;text-align:center}
    h1 span{display:block}
    img{margin-top:70px;width:760px;height:1520px;object-fit:cover;object-position:top;border-radius:56px;box-shadow:0 40px 90px -20px rgba(10,8,40,.55);border:10px solid rgba(255,255,255,.22)}
  </style></head><body><h1>${lines.map((line) => `<span>${line}</span>`).join("")}</h1><img src="${img}"></body></html>`);
  await page.waitForTimeout(300);
  const out = await page.screenshot({ type: "png" });
  await page.close();
  return out;
}

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  await waitFor(async () => (await fetch(BASE)).ok, "Vite", 60_000);
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  for (const lang of (process.env.LANGS || "ro,en").split(",")) {
    mkdirSync(`${OUT}${lang}`, { recursive: true });
    if (process.env.RAW) mkdirSync(`${RAW}${lang}`, { recursive: true });
    for (const screen of SCREENS) {
      if (only && !only.test(screen.id)) continue;
      const { context, page, errors } = await open(browser, lang);
      try { await screen.go(page, lang); } catch (error) { throw new Error(`${screen.id} (${lang}): ${error.message}`, { cause: error }); }
      await page.waitForTimeout(600);
      const shot = await page.screenshot({ type: "png" });
      if (errors.length) fail(`${screen.id} (${lang}): erori în pagină: ${errors.join("; ")}`);
      await context.close();
      if (process.env.RAW) writeFileSync(`${RAW}${lang}/${screen.id}.png`, shot);
      writeFileSync(`${OUT}${lang}/${screen.id}.png`, await frame(browser, shot, screen[lang]));
      console.log(`✓ ${lang}/${screen.id}`);
    }
  }
} finally { await browser.close(); vite.kill(); }
