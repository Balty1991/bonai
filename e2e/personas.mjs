/**
 * Testul cu 10 persoane pe aplicația publicată (PWA), 360–412 px, ambele teme.
 * Fiecare persoană trece prin drumurile ei; după fiecare ecran: erori JS, depășire pe orizontală,
 * text tăiat, butoane fără nume, ținte mici, contrast. Notează problemele în loc să se oprească.
 * Rulare: node e2e/personas.mjs (URL, ONLY=regex persoană, OUT=dir capturi, JSON=fișier rezultat).
 * Atenție: scanările merg la serverul real (câțiva bani pe bon).
 */
/* global document, window, getComputedStyle, innerWidth, innerHeight */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { contrastOffenders } from "./lib/contrast.mjs";

const URL = process.env.URL || "https://balty1991.github.io/buget-familie/";
const OUT = process.env.OUT || "/workspace/bonai/test10/shots";
const R = "/workspace/buget-familie/e2e/receipts";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, what, timeout = 20_000) { const s = Date.now(); while (Date.now() - s < timeout) { if (await check().catch(() => false)) return; await sleep(300); } throw new Error(`timp depășit: ${what}`); }

const PERSONAS = [
  { id: "mama", name: "Mama ocupată", width: 360, theme: "white", start: "scan", flows: ["manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "pensionar", name: "Pensionar, text mare", width: 412, theme: "white", zoom: 1.3, start: "demo", flows: ["demoHome", "leaveDemo", "manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "student", name: "Student", width: 390, theme: "dark", start: "skip", flows: ["manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "cuplu", name: "Cuplu, Familie comună", width: 412, theme: "dark", start: "list", flows: ["family", "manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "lowtech", name: "Utilizator cu puțină tehnologie", width: 360, theme: "white", start: "demo", flows: ["demoHome", "leaveDemo", "manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "power", name: "Utilizator avansat", width: 390, theme: "dark", start: "scan", flows: ["manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "oferte", name: "Vânător de oferte", width: 360, theme: "dark", start: "scan", flows: ["manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "datorii", name: "Datorii și rate", width: 412, theme: "white", start: "skip", flows: ["manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "lidl", name: "Cumpărător Lidl frecvent", width: 390, theme: "white", start: "scan", flows: ["manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant"] },
  { id: "a11y", name: "Accesibilitate (tastatură, mișcare redusă)", width: 412, theme: "dark", reducedMotion: true, start: "skip", flows: ["manual", "scan1", "scan2", "edit", "del", "list", "barcode", "pantry", "prices", "costs", "next", "theme", "paywall", "assistant", "keyboard"] },
];

async function audit(page, where) {
  const found = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[aria-hidden=true],[hidden],[inert]"); };
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth + 2) out.push(`depășire orizontală: ${document.documentElement.scrollWidth}px > ${innerWidth}px`);
    const clipped = Array.from(document.querySelectorAll("body *")).filter((el) => el.children.length === 0 && el.textContent.trim() && vis(el) && el.scrollWidth > el.clientWidth + 1 && ["hidden", "clip"].includes(getComputedStyle(el).overflowX) && getComputedStyle(el).textOverflow !== "ellipsis").map((el) => el.textContent.trim().slice(0, 40));
    if (clipped.length) out.push(`text tăiat: ${[...new Set(clipped)].slice(0, 4).join(" | ")}`);
    const nameless = Array.from(document.querySelectorAll("button, a[href], [role=button], input:not([type=hidden]), select, textarea")).filter((el) => vis(el) && !(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.textContent.trim() || el.getAttribute("title") || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest("label") || el.getAttribute("placeholder"))).map((el) => el.outerHTML.slice(0, 80));
    if (nameless.length) out.push(`fără nume accesibil: ${nameless.slice(0, 3).join(" | ")}`);
    const small = Array.from(document.querySelectorAll("button, a[href], [role=button], [role=tab]")).filter((el) => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); return (r.height < 24 || r.width < 24) && !el.closest("p, li small"); }).map((el) => `${(el.getAttribute("aria-label") || el.textContent).trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
    if (small.length) out.push(`ținte sub 24px: ${small.slice(0, 4).join(" | ")}`);
    return out;
  });
  const low = await contrastOffenders(page, "body", 4.5).catch(() => []);
  if (low.length) found.push(`contrast sub 4,5: ${low.slice(0, 3).map((o) => `„${o.text}” ${o.ratio}`).join(" | ")}`);
  return found.map((f) => `${where}: ${f}`);
}

const dock = (page, i) => page.locator(".os-dock-v2 > button").nth(i).click();
const confirmIfAsked = async (page, label) => { const b = page.locator("[role=alertdialog], [role=dialog]").getByRole("button", { name: label }).last(); if (await b.isVisible().catch(() => false)) await b.click(); };
/** După „Salvează bonul” apare ecranul „Bon salvat”: îl notăm și apăsăm Gata. */
async function saveReview(page, review, ctx) {
  await review.getByRole("button", { name: "Salvează bonul" }).click(); await sleep(1500);
  const done = page.getByRole("button", { name: "Gata", exact: true }).last();
  if (await done.isVisible().catch(() => false)) { const txt = await page.locator("[role=dialog]").last().innerText().catch(() => ""); const m = /Ultima dată la ([^:]+): ([\d.,]+ lei)/.exec(txt); if (m) ctx.note(`după salvare: „Ultima dată la ${m[1]}: ${m[2]}”`); await ctx.shot("saved"); await done.click(); await sleep(900); }
}

async function scan(page, files) {
  await dock(page, 2); await sleep(900);
  const chooser = page.waitForEvent("filechooser", { timeout: 15_000 });
  await page.locator(".bn-tile", { hasText: "Galerie" }).click();
  await sleep(500); await confirmIfAsked(page, "Am înțeles, scanez");
  await (await chooser).setFiles(files);
  const t0 = Date.now();
  const review = page.getByRole("dialog", { name: "Verifică bonul" });
  await waitFor(() => review.isVisible(), "ecranul Verifică bonul", 120_000);
  return { review, seconds: Math.round((Date.now() - t0) / 100) / 10 };
}

const FLOWS = {
  async scan1(page, P, ctx) { const { review, seconds } = await scan(page, [`${R}/${P.id === "lidl" ? "vodka-39.76.jpg" : "familia-57.30.jpg"}`]); ctx.note(`scanare 1 poză: ${seconds} s până la verificare`); await sleep(1500); ctx.issues.push(...await audit(page, "Verifică bonul")); await ctx.shot("scan1-review"); await saveReview(page, review, ctx); },
  async scan1b(page, P, ctx) { const { review, seconds } = await scan(page, [`${R}/crumpled-44.58.jpg`]); ctx.note(`scanare bon șifonat: ${seconds} s`); await saveReview(page, review, ctx); },
  async scan2(page, P, ctx) { const { review, seconds } = await scan(page, [1, 2, 3, 4].map((n) => `${R}/profi-82.71/${n}.jpg`)); ctx.note(`scanare 4 capturi: ${seconds} s`); const total = await review.innerText(); if (!/82,71/.test(total)) ctx.issues.push("bon din 4 capturi: totalul 82,71 nu apare în verificare"); await ctx.shot("scan2-review"); await saveReview(page, review, ctx); },
  async manual(page, P, ctx) {
    await dock(page, 0); await sleep(700);
    await page.getByRole("button", { name: /Fără bon\? Notează suma/ }).first().click();
    const sheet = page.getByRole("dialog", { name: "Cheltuială fără bon" });
    await waitFor(() => sheet.isVisible(), "foaia fără bon");
    await page.keyboard.type("25"); await sheet.getByRole("radio").first().click();
    ctx.issues.push(...await audit(page, "Cheltuială fără bon")); await ctx.shot("manual");
    await sheet.getByRole("button", { name: /^Salvează/ }).click(); await sleep(1200);
    if (await sheet.isVisible()) ctx.issues.push("cheltuiala fără bon nu s-a salvat");
  },
  async edit(page, P, ctx) {
    await dock(page, 4); await sleep(800);
    await page.getByRole("button", { name: /^Bonuri/ }).first().click(); await sleep(900);
    const history = page.getByRole("dialog", { name: "Istoric" });
    await history.locator("li button, .bn-costs-row, button").filter({ hasText: /lei/ }).first().click(); await sleep(800);
    await history.getByRole("button", { name: "Editează" }).click();
    const editor = page.getByRole("dialog", { name: "Editează bonul" });
    await waitFor(() => editor.isVisible(), "editorul bonului");
    await ctx.shot("edit"); ctx.issues.push(...await audit(page, "Editează bonul"));
    await editor.getByRole("button", { name: "Salvează modificările" }).click(); await sleep(800);
    await history.getByRole("button", { name: "Șterge bonul" }).click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "Ștergi bonul?" }));
    await confirm.first().getByRole("button", { name: "Șterge bonul" }).click();
    await waitFor(() => page.locator(".bf-undo-bar").isVisible(), "bara Anulează după ștergere");
    await page.locator(".bf-undo-bar").getByRole("button", { name: "Anulează" }).click(); await sleep(800);
    for (let i = 0; i < 3 && await history.isVisible().catch(() => false); i++) { await page.keyboard.press("Escape"); await sleep(500); }
    if (await history.isVisible().catch(() => false)) { ctx.issues.push("Istoric: nu se închide cu Esc"); await history.getByRole("button", { name: "Înapoi" }).click(); }
  },
  async del(page, P, ctx) {
    await dock(page, 4); await sleep(800);
    await page.getByRole("button", { name: /^Bonuri/ }).first().click(); await sleep(900);
    const history = page.getByRole("dialog", { name: "Istoric" });
    const rows = history.locator("li button, .bn-costs-row, button").filter({ hasText: /lei/ });
    const before = await rows.count();
    await rows.first().click(); await sleep(800);
    await history.getByRole("button", { name: "Șterge bonul" }).click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "Ștergi bonul?" }));
    await confirm.first().getByRole("button", { name: "Șterge bonul" }).click();
    await sleep(6500); await ctx.shot("deleted");
    const after = await rows.count(); ctx.note(`ștergere: rânduri cu „lei” în Istoric ${before} → ${after}`);
    if (after >= before) ctx.issues.push(`Istoric: după ștergere numărul de rânduri nu a scăzut (${before} → ${after})`);
    for (let i = 0; i < 3 && await history.isVisible().catch(() => false); i++) { await page.keyboard.press("Escape"); await sleep(500); }
  },
  async assistant(page, P, ctx) {
    await dock(page, 0); await sleep(600);
    await page.getByRole("button", { name: "Deschide ghidul" }).first().click();
    const d = page.getByRole("dialog", { name: "Asistent BonAI" });
    await waitFor(() => d.isVisible(), "asistentul");
    await d.getByLabel("Întreabă asistentul").fill("cât am cheltuit luna asta?"); await d.getByRole("button", { name: "Trimite" }).click();
    await sleep(9000); const txt = await d.innerText(); ctx.note(`asistent: ${txt.replace(/\s+/g, " ").slice(-220)}`);
    ctx.issues.push(...await audit(page, "Asistent")); await ctx.shot("assistant");
    await d.getByRole("button", { name: "Închide" }).click(); await sleep(500);
  },
  async list(page, P, ctx) {
    await dock(page, 1); await sleep(900);
    const input = page.locator(".bf-shopping input[type=text], .bf-shopping input:not([type])").first();
    await input.fill("lapte"); await input.press("Enter"); await input.fill("pâine"); await input.press("Enter"); await sleep(600);
    if (!(await page.getByText("pâine").first().isVisible())) ctx.issues.push("produsul adăugat nu apare în listă");
    ctx.issues.push(...await audit(page, "Lista")); await ctx.shot("list");
  },
  async barcode(page, P, ctx) {
    await dock(page, 1); await sleep(900);
    await page.getByRole("button", { name: /^Scanează codul de bare$/ }).first().click(); await sleep(1500);
    const sc = page.getByRole("dialog", { name: "Scanează codul de bare" });
    const manual = sc.getByRole("button", { name: /Scriu cifrele/ });
    if (await manual.isVisible().catch(() => false)) { await manual.click(); await sleep(600); const digits = sc.locator("#bn-barcode-digits"); if (!(await digits.isVisible().catch(() => false))) ctx.issues.push("Listă: „Scriu cifrele” nu arată câmpul pentru cifre"); else { await digits.fill("5942247100868"); await digits.press("Enter"); await sleep(1500); ctx.note(`listă, cifre scrise: scanerul ${await sc.isVisible().catch(() => false) ? "încă deschis" : "închis, codul trimis"}`); } }
    if (await sc.isVisible().catch(() => false)) await page.keyboard.press("Escape");
    await dock(page, 3); await sleep(900);
    const input = page.locator("input[aria-label='Codul de bare']").first(); await input.scrollIntoViewIfNeeded();
    await input.fill("5942247100868"); await input.press("Enter");
    await waitFor(() => page.locator(".bn-bc-card, .bn-bc-found, .bn-bc-pick, .bn-bc").filter({ hasText: /Ultima dată|Alege|Nu am|Tușnad|TUSNAD|produs/i }).first().isVisible(), "rezultatul codului", 20_000).catch(() => ctx.issues.push("codul 5942247100868 nu a dat niciun rezultat"));
    await sleep(2500); const txt = await page.locator(".bn-bc").first().innerText().catch(() => ""); ctx.note(`cod 5942247100868: ${txt.replace(/\s+/g, " ").slice(0, 300)}`);
    ctx.issues.push(...await audit(page, "Cod de bare")); await page.locator(".bn-bc").first().screenshot({ path: `${process.env.OUT || "/workspace/bonai/test10/shots"}/${P.id}-barcode.png` }).catch(() => ctx.shot("barcode"));
  },
  async pantry(page, P, ctx) {
    await dock(page, 1); await sleep(700);
    for (const tab of ["Stoc", "Meniu"]) { await page.getByRole("tab", { name: tab }).click(); await sleep(700); ctx.issues.push(...await audit(page, tab)); await ctx.shot(tab.toLowerCase()); }
    // Capătul Meniului: ultimul rând trebuie să stea deasupra barei de jos.
    await page.evaluate(() => { const m = document.querySelector("main"); if (m) m.scrollTop = m.scrollHeight; window.scrollTo(0, document.documentElement.scrollHeight); }); await sleep(500);
    const gap = await page.evaluate(() => { const dockEl = document.querySelector(".os-dock-v2"); const rows = [...document.querySelectorAll("main *")].filter((e) => e.children.length === 0 && e.textContent.trim() && e.getBoundingClientRect().height > 0); const last = rows[rows.length - 1]; return dockEl && last ? Math.round(dockEl.getBoundingClientRect().top - last.getBoundingClientRect().bottom) : null; });
    if (gap !== null && gap < 8) ctx.issues.push(`Meniu: ultimul rând e sub bara de jos (spațiu ${gap}px)`);
    ctx.note(`Meniu, spațiu sub ultimul rând: ${gap}px`); await ctx.shot("meniu-jos");
    ctx.note(`focus după Meniu: ${await page.evaluate(() => { const e = document.activeElement; return !e || e === document.body ? "(body)" : `${e.tagName} ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)}`; })}`);
    await page.getByRole("tab", { name: "Listă" }).click();
  },
  async prices(page, P, ctx) {
    await dock(page, 3); await sleep(900);
    for (const tab of ["Produsele mele", "Statistici", "Magazine"]) { await page.getByRole("tab", { name: tab }).click(); await sleep(700); ctx.issues.push(...await audit(page, `Prețuri/${tab}`)); }
    await page.getByRole("tab", { name: "Produsele mele" }).click(); await sleep(500); await ctx.shot("prices");
  },
  async costs(page, P, ctx) {
    await dock(page, 4); await sleep(800);
    for (const row of [/^Datorii/, /^Abonamente/, /^Facturi/]) {
      const b = page.getByRole("button", { name: row }).first();
      if (!(await b.isVisible().catch(() => false))) { ctx.issues.push(`Cont: lipsește rândul ${row}`); continue; }
      await b.click(); await sleep(900); ctx.issues.push(...await audit(page, `Cont/${row.source}`)); await ctx.shot(`costs-${row.source.replace(/\W/g, "")}`);
      await page.keyboard.press("Escape"); await sleep(600);
      const panel = page.locator(".bn-costs[role=dialog]");
      if (await panel.isVisible().catch(() => false)) { ctx.issues.push(`Cont/${row.source}: panoul nu se închide cu Esc`); await panel.getByRole("button", { name: "Înapoi" }).first().click(); await sleep(500); }
    }
  },
  async next(page, P, ctx) { await dock(page, 0); await sleep(800); const card = page.locator(".sh-card", { hasText: "CE URMEAZĂ" }).first(); if (await card.count()) { await card.scrollIntoViewIfNeeded(); await ctx.shot("next"); } else ctx.note("Ce urmează: nimic programat (card ascuns)"); },
  async theme(page, P, ctx) {
    await dock(page, 4); await sleep(700);
    const other = P.theme === "dark" ? "Luminos" : "Noapte";
    await page.getByRole("button", { name: other, exact: true }).click(); await sleep(900);
    const dark = await page.evaluate(() => document.documentElement.classList.contains("theme-dark") || document.documentElement.classList.contains("dark"));
    if (dark !== (other === "Noapte")) ctx.issues.push(`tema nu s-a schimbat în ${other}`);
    await dock(page, 0); await sleep(700); ctx.issues.push(...await audit(page, `Acasă (${other})`)); await ctx.shot(`theme-${other}`);
    await dock(page, 4); await sleep(500); await page.getByRole("button", { name: P.theme === "dark" ? "Noapte" : "Luminos", exact: true }).click();
  },
  async paywall(page, P, ctx) { await dock(page, 4); await sleep(800); const acct = await page.locator("main, body").first().innerText(); ctx.note(`Cont plan: ${(/(Plan gratuit|BonAI Pro|BonAI Familie)/.exec(acct) || ["?"])[0]}; „Treci la BonAI Pro” ${/Treci la BonAI Pro/.test(acct) ? "vizibil" : "absent"}`); const up = page.getByRole("button", { name: /Treci la BonAI Pro|BonAI Pro|BonAI Familie|Abonament/ }).first(); if (await up.isVisible().catch(() => false)) { await up.click(); await sleep(1500); ctx.issues.push(...await audit(page, "Paywall/abonament")); await ctx.shot("paywall"); ctx.note(`ecran abonament: ${(await page.locator("[role=dialog]").last().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 260)}`); await page.keyboard.press("Escape"); await sleep(600); } await dock(page, 3); await sleep(800); const locked = await page.locator(".sh-lock, [data-pro-gate]").count(); ctx.note(locked ? `paywall: ${locked} carduri blocate` : "paywall: nevizibil (plățile nu sunt pornite, toată lumea are Familie)"); },
  async family(page, P, ctx) { await dock(page, 4); await sleep(700); const b = page.getByRole("button", { name: /Familie|Invită|Sincronizare/ }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await sleep(1200); ctx.issues.push(...await audit(page, "Familie")); await ctx.shot("family"); await page.keyboard.press("Escape"); await sleep(500); } else ctx.issues.push("Cont: nu găsesc intrarea pentru Familie / invitație"); },
  async demoHome(page, P, ctx) { await waitFor(() => page.getByText("datele sunt inventate").isVisible(), "banda exemplului"); ctx.issues.push(...await audit(page, "Acasă exemplu")); await ctx.shot("demo"); },
  async leaveDemo(page) { await page.getByRole("button", { name: "Încep cu datele mele" }).click(); await sleep(400); await confirmIfAsked(page, "Încep cu datele mele"); await sleep(1500); const welcome = page.getByRole("button", { name: /Mă uit întâi/ }); if (await welcome.isVisible().catch(() => false)) await welcome.click(); await sleep(1000); },
  async keyboard(page, P, ctx) {
    await dock(page, 0); await sleep(500);
    const seen = [];
    for (let i = 0; i < 25; i++) { await page.keyboard.press("Tab"); seen.push(await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return "(body)"; const s = getComputedStyle(el); const ring = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== "none"; return `${(el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 20)}${ring ? "" : " [fără inel de focus]"}`; })); }
    const noRing = seen.filter((s) => s.includes("fără inel")); if (noRing.length) ctx.issues.push(`tastatură: ${noRing.length}/25 elemente fără inel de focus vizibil (${noRing.slice(0, 3).join(", ")})`);
    if (!seen.some((s) => /Scanează/.test(s))) ctx.issues.push("tastatură: butonul Scanează nu e atins în primele 25 de Tab");
    ctx.note(`ordinea Tab: ${seen.slice(0, 8).join(" → ")}`);
  },
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const results = [];
const flowOnly = process.env.FLOWS ? process.env.FLOWS.split(",") : null;
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const P of PERSONAS) {
  if (only && !only.test(P.id)) continue;
  const context = await browser.newContext({ viewport: { width: P.width, height: 820 }, locale: "ro-RO", reducedMotion: P.reducedMotion ? "reduce" : "no-preference", colorScheme: P.theme === "dark" ? "dark" : "light" });
  await context.addInitScript(({ theme, zoom }) => { try { if (!localStorage.getItem("buget-familie:theme")) { localStorage.setItem("buget-familie:theme", theme); localStorage.setItem("buget-familie:theme-schedule", "manual"); } } catch { /* */ } if (zoom) document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = (zoom*100)+"%"; }); }, { theme: P.theme, zoom: P.zoom });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_|net::|Failed to load resource|appCheck|recaptcha/i.test(m.text())) errors.push(`consolă: ${m.text().slice(0, 140)}`); });
  page.on("dialog", (d) => d.accept());
  const ctx = { issues: [], notes: [], note: (n) => ctx.notes.push(n), shot: (name) => page.screenshot({ path: `${OUT}/${P.id}-${name}.png` }) };
  const flows = [];
  try {
    await page.goto(URL, { waitUntil: "networkidle" }); await sleep(3500);
    ctx.issues.push(...await audit(page, "Bun venit")); await ctx.shot("welcome");
    const start = { scan: /Scanează primul bon/, list: /Încep cu lista/, demo: /Văd întâi un exemplu/, skip: /Mă uit întâi/ }[P.start];
    await page.getByRole("button", { name: start }).first().click(); await sleep(1500);
    if (P.start === "scan") { const close = page.getByRole("dialog", { name: "Scanează bonul" }); await page.keyboard.press("Escape"); await sleep(600); if (await close.isVisible().catch(() => false)) { ctx.issues.push("Scanează: ecranul nu se închide cu Esc"); await close.getByRole("button", { name: "Închide" }).click(); await sleep(500); } }
    flows.push({ flow: "onboarding", ok: true });
  } catch (e) { flows.push({ flow: "onboarding", ok: false, error: e.message.split("\n")[0] }); }
  for (const name of P.flows) {
    if (flowOnly && !flowOnly.includes(name)) continue;
    const t0 = Date.now();
    try { await FLOWS[name](page, P, ctx); flows.push({ flow: name, ok: true, s: Math.round((Date.now() - t0) / 1000) }); }
    catch (e) { await ctx.shot(`FAIL-${name}`).catch(() => {}); for (let i = 0; i < 3; i++) { const x = page.getByRole("button", { name: /^(Închide|Gata|Anulează)$/ }).last(); if (await x.isVisible().catch(() => false)) { await x.click().catch(() => {}); await sleep(500); } else await page.keyboard.press("Escape").catch(() => {}); }
      flows.push({ flow: name, ok: false, error: e.message.split("\n")[0].slice(0, 200) }); await sleep(600); }
  }
  results.push({ id: P.id, name: P.name, width: P.width, theme: P.theme, zoom: P.zoom || 1, flows, issues: [...new Set(ctx.issues)], notes: ctx.notes, errors: [...new Set(errors)].slice(0, 8) });
  console.log(`${P.id}: ${flows.filter((f) => f.ok).length}/${flows.length} drumuri, ${new Set(ctx.issues).size} probleme, ${errors.length} erori`);
  for (const f of flows.filter((x) => !x.ok)) console.log(`   ✗ ${f.flow}: ${f.error}`);
  await context.close();
}
await browser.close();
writeFileSync(process.env.JSON || `${OUT}/rezultate.json`, JSON.stringify(results, null, 2));
