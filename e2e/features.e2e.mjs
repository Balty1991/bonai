/**
 * Funcțiile BonAI pe aplicația reală, cu bonuri de test (Vite + Chromium), în ambele teme, la 360 px:
 *   1. „Ai economisit la cumpărături” pe Acasă — doar reduceri și alegeri mai ieftine din bonuri.
 *   0. Cheltuială fără bon: suma + categoria în 2 atingeri, repetare dintr-o atingere, apare în Toate costurile.
 *   2. Lista cu prețuri: ultimul preț pe bucată, unde și când, totalul estimat și magazinul mai ieftin.
 * Pică dacă cifra nu e cea calculată din bonuri, dacă un text iese din cutie sau dacă pagina aruncă erori.
 * Rulare: node e2e/features.e2e.mjs (CHROMIUM_PATH, THEMES, ONLY=regex, SHOTS=dir opționale).
 */
/* global document, getComputedStyle, window */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { contrastOffenders } from "./lib/contrast.mjs";

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
/** Scanează offline bonul de test, îl face „Lapte Zuzu 1L” de 9,99 lei la alimente și îl salvează. */
async function saveLapte(page) {
  await page.evaluate(() => { const d = new Date().toISOString().slice(0, 10); localStorage.setItem("bonai:ai-scans-v1", JSON.stringify(Array(15).fill(d))); localStorage.setItem("buget-familie:receipt-scan-consent", "1"); });
  await page.getByRole("button", { name: /^Scanează bonul$/ }).first().click();
  const hub = page.locator(".bn-hub");
  await waitFor(() => hub.isVisible(), "centrul de scanare");
  const chooser = page.waitForEvent("filechooser");
  await hub.getByRole("button", { name: /Offline/ }).click();
  await (await chooser).setFiles("e2e/receipts/vodka-39.76.jpg");
  await page.getByRole("button", { name: /^Citește bonul$/ }).click();
  const review = page.getByRole("dialog", { name: "Verifică bonul" });
  await waitFor(() => review.isVisible(), "verificarea bonului", 90_000);
  await review.locator(".bn-item").first().click();
  await review.getByLabel("Produs").fill("Lapte Zuzu 1L");
  await review.getByLabel("Total (lei)").fill("9.99");
  await review.getByLabel("Categorie").selectOption({ label: (await review.getByLabel("Categorie").locator("option").allInnerTexts()).find((o) => /Alimente/.test(o)) });
  await review.getByRole("button", { name: /^Gata$/ }).click();
  await review.getByRole("button", { name: /^Salvează bonul$/ }).click();
  const sum = page.getByRole("button", { name: /^Salvez / });
  if (await sum.isVisible({ timeout: 1500 }).catch(() => false)) await sum.click();
  return page.locator(".bn-city-offer");
}
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
    const card = page.locator(".sh-card", { hasText: "AI ECONOMISIT LA CUMPĂRĂTURI" }).first();
    await waitFor(() => card.isVisible(), "cardul „Ai economisit la cumpărături”");
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
  /** 4. Laptele luat azi la Lidl cu 8,49 (ultima dată 6,99 acolo) e semnalat în detaliul bonului. */
  async discount(page, theme) {
    await page.evaluate(async () => {
      const s = await import("/src/lib/app-storage.ts"); const { isoToday } = await import("/src/lib/finance-data.ts");
      const d = await s.readAppData(); const now = new Date().toISOString();
      d.receipts.push({ id: "d1", vendor: "LIDL DISCOUNT SCS", date: isoToday(), category: "Cumpărături", amount: 13.69, lines: [{ id: "d1a", label: "Lapte Zuzu 1L", amount: 8.49, category: "Alimente" }, { id: "d1b", label: "Pâine albă", amount: 5.2, category: "Alimente" }], updatedAt: now });
      const later = new Date(Date.now() + 3_600_000).toISOString(); await s.writeAppData(d, later); s.writeLocalStorageSnapshot(JSON.stringify(d), later);
    });
    await page.reload(); await page.waitForTimeout(2000);
    await page.locator(".os-dock-v2 > button").nth(4).click(); await page.waitForTimeout(600);
    await page.getByRole("button", { name: /^Bonuri/ }).first().click();
    const history = page.getByRole("dialog", { name: "Istoric" });
    // Firma de pe bon („LIDL DISCOUNT SCS”) se arată ca marcă: „Lidl”.
    if (await history.getByText(/LIDL DISCOUNT/).count()) fail("bonul arată firma, nu marca Lidl");
    await history.locator("button", { hasText: "13,69" }).first().click();
    const flags = page.locator(".bn-flags");
    await waitFor(() => flags.isVisible(), "secțiunea Verifică reducerile");
    const text = await flags.innerText();
    if (!/Lapte Zuzu/.test(text) || !text.includes("6,99") || /Pâine/.test(text)) fail(`semnal greșit: ${text}`);
    await shot(page, `discount-${theme}`, flags);
    const cut = await clipped(page, ".bn-flags");
    if (cut.length) fail(`text tăiat: ${cut.join(" | ")}`);
  },
  /** 5. Ce urmează: factură, abonament, rată și retur, în ordinea datelor; rata deschide Datoriile. */
  async next(page, theme) {
    const want = await page.evaluate(async () => {
      const s = await import("/src/lib/app-storage.ts"); const { isoToday } = await import("/src/lib/finance-data.ts"); const { upcoming } = await import("/src/lib/upcoming.ts");
      const d = await s.readAppData(); const now = new Date().toISOString(); const today = isoToday();
      const day = (o) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + o); return x.toISOString().slice(0, 10); };
      const dom = (o) => Number(day(o).slice(8, 10));
      const R = (id, name, category, amount, o, extra = {}) => ({ id, name, amount, category, sourceId: "", memberId: "", dueDay: dom(o), active: true, updatedAt: now, ...extra });
      d.recurring = [R("n1", "Netflix", "Abonamente", 49.99, 3), R("n2", "Curent Hidroelectrica", "Casă & facturi", 180, 9, { variable: true })];
      d.debts = [{ id: "dd", name: "Rată mașină", remaining: 12000, monthly: 950, due: "", tone: "forest", dueDay: dom(6), updatedAt: now }];
      d.settings.warranties = [{ id: "ww", name: "Aspirator Dyson", price: 1999, purchaseDate: day(-10), months: 24, returnDays: 14, updatedAt: now }];
      const later = new Date(Date.now() + 3_600_000).toISOString(); await s.writeAppData(d, later); s.writeLocalStorageSnapshot(JSON.stringify(d), later);
      return upcoming(d, today).map((i) => i.name);
    });
    if (want.length < 4) fail(`datele de test: ${want.join(", ")}`);
    await page.reload(); await page.waitForTimeout(2000);
    const card = page.locator(".sh-card", { hasText: "CE URMEAZĂ" }).first();
    await waitFor(() => card.isVisible(), "cardul Ce urmează");
    const names = await card.locator(".sh-next-main b").allInnerTexts();
    if (names.join("|") !== want.slice(0, 4).join("|")) fail(`ordinea: ${names.join(", ")} ≠ ${want.join(", ")}`);
    await shot(page, `next-${theme}`, card);
    const text = await card.textContent();
    if (!/~180/.test(text) || !/ultima zi de retur/.test(text)) fail(`detalii lipsă: ${text}`);
    await shot(page, `next-${theme}`, card);
    const cut = await clipped(page, ".sh-next");
    if (cut.length) fail(`text tăiat: ${cut.join(" | ")}`);
    await card.getByRole("button", { name: /Rată mașină/ }).click();
    await waitFor(async () => /Rată mașină/.test(await page.locator("[role=dialog]").last().innerText().catch(() => "")), "rata deschide Datoriile");
  },
  /** 6. Scanare offline: „Offline” citește pe telefon, marcat „Citit pe telefon”; totalul nepotrivit cere confirmare; același bon a doua oară e semnalat. */
  async offline(page, theme) {
    await page.evaluate(() => { const d = new Date().toISOString().slice(0, 10); localStorage.setItem("bonai:ai-scans-v1", JSON.stringify(Array(15).fill(d))); localStorage.setItem("buget-familie:receipt-scan-consent", "1"); });
    await page.getByRole("button", { name: /^Scanează bonul$/ }).first().click();
    const hub = page.locator(".bn-hub");
    await waitFor(() => hub.isVisible(), "centrul de scanare");
    // Cât timp plata e oprită toți au planul complet; limita de 15 e acoperită de testele bonut-plans.
    await shot(page, `offline-hub-${theme}`);
    const cut = await clipped(page, ".bn-hub");
    if (cut.length) fail(`text tăiat: ${cut.join(" | ")}`);
    const chooser = page.waitForEvent("filechooser");
    await hub.getByRole("button", { name: /Offline/ }).click();
    await (await chooser).setFiles("e2e/receipts/vodka-39.76.jpg");
    await page.getByRole("button", { name: /^Citește bonul$/ }).click();
    const review = page.getByRole("dialog", { name: "Verifică bonul" });
    await waitFor(() => review.isVisible(), "verificarea bonului citit offline", 90_000);
    if (!/Citit pe telefon/.test(await review.innerText())) fail("rezultatul offline nu e marcat");
    await shot(page, `offline-review-${theme}`);
    // Același bon a doua oară: cardul „Ai mai înregistrat bonul ăsta”, iar „Nu-l salva” nu adaugă nimic.
    const count = () => page.evaluate(async () => (await (await import("/src/lib/app-storage.ts")).readAppData()).receipts.length);
    const start = await count();
    await review.getByRole("button", { name: /^Salvează bonul$/ }).click();
    const sum = page.getByRole("button", { name: /^Salvez / });
    if (await sum.isVisible({ timeout: 1500 }).catch(() => false)) await sum.click();
    await page.getByRole("button", { name: /^Gata$/ }).click();
    await waitFor(async () => (await count()) === start + 1, "primul bon salvat");
    const saved = start + 1;
    await page.getByRole("button", { name: /^Scanează bonul$/ }).first().click();
    await waitFor(() => hub.isVisible(), "centrul de scanare, a doua oară");
    const again = page.waitForEvent("filechooser");
    await hub.getByRole("button", { name: /Offline/ }).click();
    await (await again).setFiles("e2e/receipts/vodka-39.76.jpg");
    await page.getByRole("button", { name: /^Citește bonul$/ }).click();
    const twin = review.locator(".bn-dupe");
    await waitFor(() => twin.isVisible(), "avertizarea de bon dublat", 90_000);
    if (!/Ai mai înregistrat bonul ăsta/.test(await twin.innerText())) fail("cardul de bon dublat nu spune ce e");
    await shot(page, `offline-twin-${theme}`, twin);
    await twin.getByRole("button", { name: /^Nu-l salva$/ }).click();
    await waitFor(async () => !(await review.isVisible()), "„Nu-l salva” închide verificarea");
    await page.waitForTimeout(1500);
    const after = await count();
    if (after !== saved) fail(`„Nu-l salva” a salvat totuși bonul (${saved} → ${after})`);
  },
  /** 6b. După salvare: produsul scump propune „Adaug garanția” (bifa rămâne vizibilă), iar ce era pe listă se bifează singur. */
  async warranty(page, theme) {
    await page.evaluate(() => { const d = new Date().toISOString().slice(0, 10); localStorage.setItem("bonai:ai-scans-v1", JSON.stringify(Array(15).fill(d))); localStorage.setItem("buget-familie:receipt-scan-consent", "1"); });
    // Pe listă: „Aspirator” se bifează singur când bonul îl conține.
    await page.evaluate(async () => {
      const s = await import("/src/lib/app-storage.ts");
      const d = await s.readAppData();
      d.settings.shoppingList = [...(d.settings.shoppingList || []), { id: "asp", text: "Aspirator", updatedAt: new Date().toISOString() }];
      const later = new Date(Date.now() + 3_600_000).toISOString(); await s.writeAppData(d, later); s.writeLocalStorageSnapshot(JSON.stringify(d), later);
    });
    await page.reload(); await page.waitForTimeout(2000);
    await page.getByRole("button", { name: /^Scanează bonul$/ }).first().click();
    const hub = page.locator(".bn-hub");
    await waitFor(() => hub.isVisible(), "centrul de scanare");
    const chooser = page.waitForEvent("filechooser");
    await hub.getByRole("button", { name: /Offline/ }).click();
    await (await chooser).setFiles("e2e/receipts/vodka-39.76.jpg");
    await page.getByRole("button", { name: /^Citește bonul$/ }).click();
    const review = page.getByRole("dialog", { name: "Verifică bonul" });
    await waitFor(() => review.isVisible(), "verificarea bonului", 90_000);
    await review.locator(".bn-item").first().click();
    await review.getByLabel("Produs").fill("Aspirator vertical Dyson V8");
    await review.getByLabel("Total (lei)").fill("1999");
    await review.getByLabel("Categorie").selectOption({ label: (await review.getByLabel("Categorie").locator("option").allInnerTexts()).find((o) => /Casă/.test(o)) });
    await review.getByRole("button", { name: /^Gata$/ }).click();
    await review.getByRole("button", { name: /^Salvează bonul$/ }).click();
    const sum = page.getByRole("button", { name: /^Salvez / });
    if (await sum.isVisible({ timeout: 1500 }).catch(() => false)) await sum.click();
    const offer = page.locator(".bn-warranty-offer");
    await waitFor(() => offer.isVisible(), "„Are garanție?” după salvare");
    if (!/Aspirator vertical Dyson V8/.test(await offer.innerText())) fail(`propunerea nu numește produsul: ${await offer.innerText()}`);
    await offer.getByRole("button", { name: "Adaug garanția" }).click();
    await waitFor(() => offer.getByText("Garanție adăugată").isVisible(), "bifa „Garanție adăugată”");
    await shot(page, `warranty-offer-${theme}`, offer);
    const stored = () => page.evaluate(async () => ((await (await import("/src/lib/app-storage.ts")).readAppData()).settings.warranties || []).filter((item) => !item.deleted).map((item) => `${item.name}|${item.months}`));
    await waitFor(async () => (await stored()).includes("Aspirator vertical Dyson V8|24"), "garanția salvată, 24 de luni");
    if (!/Am bifat din listă: Aspirator/.test(await page.locator(".bn-aha").innerText())) fail("„Bon salvat” nu spune ce a bifat din listă");
    await waitFor(() => page.evaluate(async () => ((await (await import("/src/lib/app-storage.ts")).readAppData()).settings.shoppingList || []).some((item) => item.id === "asp" && item.done)), "„Aspirator” bifat în listă");
  },
  /** 6d. După bon: invitația la prețurile din oraș (o dată), apoi „mai ieftin în oraș” din prețurile comunității. */
  async cityinvite(page, theme) {
    const offer = await saveLapte(page);
    await waitFor(() => offer.isVisible(), "invitația la prețurile din oraș");
    if (!/Vrei să afli unde sunt mai ieftine/.test(await offer.innerText())) fail(`invitația nu spune ce e: ${await offer.innerText()}`);
    await offer.getByLabel("Orașul").fill("Roșiori");
    await shot(page, `city-invite-${theme}`, offer);
    await offer.getByRole("button", { name: /^Particip$/ }).click();
    await waitFor(() => page.getByText(/Participi din Roșiori/).isVisible(), "confirmarea „Participi din Roșiori”");
    const pref = await page.evaluate(() => JSON.parse(localStorage.getItem("bonai:community") || "{}"));
    if (!pref.on || pref.city !== "Roșiori") fail(`acordul nu e salvat: ${JSON.stringify(pref)}`);
  },
  async citydeal(page, theme) {
    await page.evaluate(async () => {
      const { normalizeProductKey } = await import("/src/lib/price-history.ts");
      const key = normalizeProductKey("Lapte Zuzu 1L");
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem("bonai:community", JSON.stringify({ on: true, city: "Roșiori", sentUntil: today }));
      const prices = Object.fromEntries(["kg", "l", "buc"].map((per) => [`${key}|${per}`, { "Penny Market": { price: 6.5, n: 5 } }]));
      localStorage.setItem("bonai:community-cache", JSON.stringify({ city: "Roșiori", at: Date.now(), prices }));
    });
    const offer = await saveLapte(page);
    await waitFor(() => offer.isVisible(), "„Mai ieftin în oraș” după salvare");
    const text = await offer.innerText();
    if (!/MAI IEFTIN ÎN ROȘIORI/.test(text) || !/Penny Market/.test(text) || !/Lapte Zuzu/.test(text)) fail(`cardul nu arată prețul din oraș: ${text}`);
    await shot(page, `city-deal-${theme}`, offer);
    const cut = await clipped(page, ".bn-city-offer");
    if (cut.length) fail(`text tăiat: ${cut.join(" | ")}`);
  },
  /** 6e. Lista goală: „Iei des” cu nume lungi din bonuri nu împinge ecranul în lateral; o atingere pune produsul pe listă. */
  async emptylist(page, theme) {
    await page.evaluate(async () => {
      const s = await import("/src/lib/app-storage.ts");
      const d = await s.readAppData();
      const long = "Apă minerală naturală carbogazoasă Perla Harghitei 2 l SGR";
      d.settings.shoppingList = [];
      d.receipts = d.receipts.map((receipt, index) => index < 2 ? { ...receipt, lines: [...(receipt.lines || []), { id: `long${index}`, label: long, amount: 6.5, category: "Apă" }] } : receipt);
      const later = new Date(Date.now() + 3_600_000).toISOString(); await s.writeAppData(d, later); s.writeLocalStorageSnapshot(JSON.stringify(d), later);
    });
    await page.reload(); await page.waitForTimeout(2000);
    await page.locator(".os-dock-v2 > button").nth(1).click(); await page.waitForTimeout(900);
    const chips = page.locator(".bf-shop-chip");
    await waitFor(() => chips.first().isVisible(), "butoanele „Iei des”");
    // Pagina nu se derulează în lateral (e tăiată), așa că se verifică marginea dreaptă a fiecărui element.
    const out = await page.evaluate(() => Array.from(document.querySelectorAll(".sh-page *")).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1; }).map((el) => `${el.className || el.tagName}: ${(el.textContent || "").trim().slice(0, 30)}`).slice(0, 4));
    if (out.length) fail(`lista goală iese din ecran: ${out.join(" | ")}`);
    await shot(page, `empty-list-${theme}`, page.locator(".bf-shop-empty"));
    const first = (await chips.first().innerText()).trim();
    await chips.first().click();
    await waitFor(() => page.evaluate(async (name) => ((await (await import("/src/lib/app-storage.ts")).readAppData()).settings.shoppingList || []).some((item) => item.text === name), first), `„${first}” pus pe listă`);
  },
  /** 6f. Rapoarte: apeși pe o categorie și vezi produsele cumpărate în ea, fără să iasă din ecran. */
  async reportcat(page, theme) {
    await page.locator(".os-dock-v2 > button").nth(3).click(); await page.waitForTimeout(800);
    await page.getByRole("tab", { name: /^Rapoarte$/ }).click(); await page.waitForTimeout(900);
    const row = page.locator(".bn-report-row-btn", { hasText: "Alimente" }).first();
    await waitFor(() => row.isVisible(), "categoria Alimente în Rapoarte");
    await row.click();
    const items = page.locator(".bn-report-items").first();
    await waitFor(() => items.isVisible(), "produsele din Alimente");
    const text = await items.innerText();
    if (!/Lapte Zuzu/.test(text) || !/Pâine albă/.test(text)) fail(`produsele categoriei lipsesc: ${text}`);
    if ((await row.getAttribute("aria-expanded")) !== "true") fail("rândul nu spune că e deschis");
    const out = await page.evaluate(() => Array.from(document.querySelectorAll(".bn-report-items *")).filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length);
    if (out) fail(`produsele ies din ecran (${out})`);
    await shot(page, `report-category-${theme}`, items);
    await row.click();
    await waitFor(async () => !(await items.isVisible()), "a doua atingere închide lista");
  },
  /** 6c. Prețuri față de data trecută la verificare, bonul în euro salvat în lei, și listele multiple. */
  async pricesfx(page, theme) {
    await page.evaluate(async () => {
      const d = new Date().toISOString().slice(0, 10); localStorage.setItem("bonai:ai-scans-v1", JSON.stringify(Array(15).fill(d))); localStorage.setItem("buget-familie:receipt-scan-consent", "1");
      const s = await import("/src/lib/app-storage.ts");
      const data = await s.readAppData();
      data.receipts = [...data.receipts, { id: "old-kinder", vendor: "Profi", amount: 3.2, category: "Dulciuri", date: "2026-09-01", lines: [{ id: "k", category: "Dulciuri", amount: 3.2, label: "Kinder Delice 11 396 1B A" }] }];
      const later = new Date(Date.now() + 3_600_000).toISOString(); await s.writeAppData(data, later); s.writeLocalStorageSnapshot(JSON.stringify(data), later);
    });
    await page.reload(); await page.waitForTimeout(2000);
    await page.getByRole("button", { name: /^Scanează bonul$/ }).first().click();
    const hub = page.locator(".bn-hub");
    await waitFor(() => hub.isVisible(), "centrul de scanare");
    const chooser = page.waitForEvent("filechooser");
    await hub.getByRole("button", { name: /Offline/ }).click();
    await (await chooser).setFiles("e2e/receipts/vodka-39.76.jpg");
    await page.getByRole("button", { name: /^Citește bonul$/ }).click();
    const review = page.getByRole("dialog", { name: "Verifică bonul" });
    await waitFor(() => review.isVisible(), "verificarea bonului", 90_000);
    const label = await review.locator(".bn-item-copy b").first().innerText();
    const prices = review.locator(".bn-prices");
    if (/Kinder Delice 11 396/i.test(label)) {
      await waitFor(() => prices.isVisible(), "„Față de data trecută”");
      if (!/1 mai scumpe/.test(await prices.innerText())) fail(`rezumatul prețurilor: ${await prices.innerText()}`);
      if (!/▲/.test(await review.locator(".bn-item").first().innerText())) fail("rândul scumpit nu are ▲");
      await shot(page, `prices-${theme}`, prices);
    }
    await review.locator(".bn-review-when").click();
    await review.getByLabel("Moneda bonului").selectOption("EUR");
    const total = Number((await review.locator(".bn-bar-total b").innerText()).replace(/[^\d,]/g, "").replace(",", "."));
    if (!/EUR/.test(await review.locator(".bn-bar-total b").innerText())) fail("totalul nu arată EUR");
    await review.getByRole("button", { name: /^Gata$/ }).click();
    await review.getByRole("button", { name: /^Salvează bonul$/ }).click();
    const sum = page.getByRole("button", { name: /^Salvez / });
    if (await sum.isVisible({ timeout: 1500 }).catch(() => false)) await sum.click();
    const twin = page.getByRole("button", { name: /^E alt bon, salvează$/ });
    if (await twin.isVisible({ timeout: 1000 }).catch(() => false)) await twin.click();
    const want = Math.round(total * 4.97 * 100) / 100;
    await waitFor(() => page.evaluate(async (want) => (await (await import("/src/lib/app-storage.ts")).readAppData()).transactions.some((tx) => Math.abs(tx.amount - want) < 0.02 && /Bon în EUR/.test(tx.note || "")), want), `bonul în euro salvat ca ${want} lei, cu nota`);
    await page.getByRole("button", { name: /^Gata$/ }).click();
    // Liste: „Petrecere” separat de lista familiei.
    await page.locator(".os-dock-v2 > button").nth(1).click(); await page.waitForTimeout(800);
    await page.getByRole("button", { name: /Listă nouă/ }).click();
    await page.getByLabel("Numele listei noi").fill("Petrecere"); await page.keyboard.press("Enter");
    await page.getByLabel("Ce trebuie luat").fill("chipsuri, pahare"); await page.keyboard.press("Enter");
    await waitFor(() => page.evaluate(async () => ((await (await import("/src/lib/app-storage.ts")).readAppData()).settings.shoppingList || []).filter((item) => item.list === "Petrecere").length === 2), "două produse pe lista „Petrecere”");
    await page.getByRole("tab", { name: /^Lista familiei/ }).click();
    if (await page.locator(".bf-shop-list li", { hasText: "Pahare" }).count()) fail("„Pahare” apare și pe lista familiei");
    await shot(page, `lists-${theme}`, page.locator(".bf-shop-lists"));
  },
  /** 7. Contrast: fiecare text de pe Acasă, Cumpărături, Prețuri, Cont și Scanează: cel puțin 4,5:1 ziua și 7:1 noaptea (3:1 la text mare). */
  async contrast(page, theme) {
    const bad = [];
    const dock = page.locator(".os-dock-v2 > button");
    for (const [label, open] of [["Acasă", () => dock.nth(0).click()], ["Cumpărături", () => dock.nth(1).click()], ["Prețuri", () => dock.nth(3).click()], ["Cont", () => dock.nth(4).click()], ["Scanează", () => dock.nth(2).click()]]) {
      await open(); await page.waitForTimeout(900);
      for (let y = 0; y < 4; y++) { bad.push(...(await contrastOffenders(page, "body", Number(process.env.MIN_CONTRAST || (theme === "dark" ? 7 : 4.5)))).map((x) => `${label}: ${x}`)); await page.mouse.wheel(0, 700); await page.waitForTimeout(250); }
      await shot(page, `contrast-${label}-${theme}`);
      await page.keyboard.press("Escape"); await page.evaluate(() => window.scrollTo(0, 0));
    }
    const unique = [...new Set(bad)];
    if (unique.length) fail(`contrast sub 4,5:1 (${unique.length}):\n${unique.join("\n")}`);
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
