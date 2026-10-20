/**
 * Verificare automată a interfeței pe aplicația reală, cu date de test (fără Firebase):
 * ecranele principale × temele Alb, Întunecat, Navy × lățimi de telefon (360 și 412 px).
 *
 * Pică dacă:
 *   - pagina iese din ecran pe orizontală;
 *   - un text iese din ecran (în afara zonelor cu scroll orizontal);
 *   - un text nu încape într-o cutie îngustă sau are lățime zero (rândul din Mișcări avea butonul strâns la 32 px);
 *   - un text vizibil are contrast sub pragul WCAG AA (4,5:1; 3:1 pentru text mare), și pe bannere cu gradient;
 *   - pagina aruncă o eroare.
 *
 * Rulare: pnpm test:layout  (pornește Vite și Chromium).
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5198;
const BASE = `http://127.0.0.1:${PORT}/`;

const fail = (message) => { throw new Error(message); };

async function waitFor(check, what, timeout = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  fail(`Timp depășit: ${what}`);
}

async function startVite() {
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(async () => (await fetch(BASE)).ok, `Vite pe ${BASE}`);
  return vite;
}

const click = (label) => async (page) => { await page.getByRole("button", { name: label }).first().click(); await page.waitForTimeout(1000); };
const seq = (...steps) => async (page) => { for (const step of steps) await step(page); };
const dock = (index) => async (page) => { await page.locator(".os-dock-v2 > button").nth(index).click(); await page.waitForTimeout(1000); };
const cont = (label) => seq(dock(4), click(label));
// BonAI: Acasă · Cumpărături · Scanează · Prețuri · Cont, plus ecranele din Cont.
const SCREENS = {
  "Acasă": null,
  "Cumpărături": dock(1),
  "Scanează": dock(2),
  "Prețuri": dock(3),
  "Rapoarte": seq(dock(3), async (page) => { await page.getByRole("tab", { name: /^Rapoarte$/ }).or(page.getByRole("button", { name: /^Rapoarte$/ })).first().click(); await page.waitForTimeout(1000); }),
  "Cont": dock(4),
  "Bonuri": cont(/^Bonuri/),
  "Familie": cont(/^Familie și membri/),
  "Garanții": cont(/^Garanții și retururi/),
  "Setări": cont(/^Setări/),
  "Asistent": click(/Deschide ghidul/),
};
const THEMES = process.env.THEMES ? process.env.THEMES.split(",") : ["white", "dark"];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const WIDTHS = [360, 412];

/** Date de test: salariu, cheltuieli, plicuri, datorii, scadențe — ca ecranele să aibă conținut. */
async function seed(page) {
  await page.evaluate(async () => {
    const storage = await import("/src/lib/app-storage.ts");
    const { createEmptyAppData, isoToday } = await import("/src/lib/finance-data.ts");
    const data = await storage.readAppData() ?? createEmptyAppData();
    const day = (offset) => { const date = new Date(`${isoToday()}T12:00:00`); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); };
    const me = data.settings.members[0]?.id || "member-me";
    data.settings.paymentSources = data.settings.paymentSources.map((source) => ({ ...source, openingBalance: source.id === "source-debit" ? 4200 : 300 }));
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: day(-10), nextPayday: day(20), allocations: [
      { id: "a-food", label: "Alimente", amount: 1500, category: "Alimente" },
      { id: "a-home", label: "Casă & facturi", amount: 900, category: "Casă & facturi" },
      { id: "a-transport", label: "Transport", amount: 400, category: "Transport" },
    ] };
    const tx = (id, title, amount, kind, category, date) => ({ id, title, amount, kind, category, source: "Card", person: "Eu", date, sourceId: "source-debit", memberId: me });
    data.transactions = [
      tx("t1", "Lidl", 184.5, "expense", "Alimente", day(0)), tx("t2", "Benzină", 250, "expense", "Transport", day(-3)),
      tx("t3", "Salariu", 5200, "income", "Salariu", day(-10)), tx("t4", "Enel", 212.3, "expense", "Casă & facturi", day(-3)),
      tx("t5", "Farmacie Catena", 64, "expense", "Sănătate", day(-3)),
    ];
    data.debts = [{ id: "d1", name: "Credit nevoi personale", remaining: 18500, monthly: 620, annualRate: 18, kind: "credit", due: "", tone: "coral", dueDate: day(8) }];
    data.savings = [{ id: "s1", name: "Vacanță", current: 1200, target: 5000, due: "", tone: "forest", dueDate: day(280) }];
    data.recurring = [{ id: "r1", name: "Internet", amount: 60, category: "Casă & facturi", sourceId: "source-debit", memberId: me, dueDay: 12, active: true }];
    const later = new Date(Date.now() + 3_600_000).toISOString();
    data.receipts = [["r1", "Lidl", 143.27, day(-1)], ["r2", "Mega Image", 58.4, day(-3)], ["r3", "Kaufland", 212.9, day(-12)], ["r4", "Profi", 31.5, day(-30)]].map(([id, vendor, amount, date]) => ({ id, vendor, amount, date, category: "Cumpărături", lines: [{ name: "Lapte", price: 7.49, qty: 1 }, { name: "Pâine", price: 5.2, qty: 1 }] }));
    await storage.writeAppData(data, later);
    storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
  });
}

/* global document, getComputedStyle, innerHeight -- inspect() rulează în pagină */
/** Rulează în pagină: ce nu e în regulă pe ecranul curent. */
function inspect() {
  for (const animation of document.getAnimations()) { try { animation.finish(); } catch { /* animație infinită */ } }
  const problems = [];
  const docWidth = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > docWidth + 1) problems.push(`pagina iese din ecran cu ${document.documentElement.scrollWidth - docWidth}px`);
  const parse = (color) => { const match = color.match(/rgba?\(([^)]+)\)/); if (!match) return null; const v = match[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const channel = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  /** Fundalurile posibile sub text: o culoare, sau fiecare culoare opacă a unui gradient (se ia cea mai rea). */
  const backgrounds = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const color = parse(style.backgroundColor);
      if (style.backgroundImage !== "none" && !(color && color.a >= 1)) {
        // Textul pictat cu gradient (background-clip: text) își are culoarea în gradient, nu dedesubt.
        if (style.backgroundClip === "text" || !/gradient/.test(style.backgroundImage)) return [];
        const stops = (style.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter((stop) => stop && stop.a >= 0.9);
        // Doar gradientele pline (bannere); cele decorative, transparente, nu decid fundalul.
        return stops.length >= 2 ? stops.map((stop) => layers.reduceRight((acc, layer) => blend(layer, acc), stop)) : [];
      }
      if (color && color.a > 0) { layers.push(color); if (color.a >= 1) break; }
    }
    if (!layers.length) return [];
    return [layers.reverse().reduce((acc, layer) => blend(layer, acc), { r: 255, g: 255, b: 255, a: 1 })];
  };
  for (const el of document.querySelectorAll("body *")) {
    const text = [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent.trim()).join(" ").trim();
    if (!text || el.closest(".bf-skip-link, [aria-hidden='true'], :disabled, [aria-disabled='true']")) continue;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    // Un text vizibil cu înălțime, dar fără lățime, e strivit (așa arăta titlul din Mișcări), nu ascuns.
    if (!rect.height || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || Number(style.opacity) < 0.5) continue;
    let inScroller = false;
    for (let node = el.parentElement; node; node = node.parentElement) { const overflow = getComputedStyle(node).overflowX; if (overflow === "auto" || overflow === "scroll") { inScroller = true; break; } }
    if (!inScroller && (rect.right > docWidth + 1 || rect.left < -1)) problems.push(`„${text.slice(0, 30)}” iese din ecran`);
    if (rect.width < 2 || (rect.width < 24 && el.scrollWidth > el.clientWidth + 4)) problems.push(`„${text.slice(0, 30)}” strivit în ${Math.round(rect.width)}px`);
    if (rect.bottom < 0 || rect.top > innerHeight) continue;
    // Opacitatea elementului și a părinților lui deschide culoarea textului spre fundal.
    let opacity = 1;
    for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    const color = parse(style.color);
    const fg = color && { ...color, a: color.a * opacity }, under = backgrounds(el);
    if (!fg || !under.length || style.backgroundClip === "text") continue;
    const ratio = Math.min(...under.map((bg) => {
      const front = fg.a < 1 ? blend(fg, bg) : fg;
      const [light, dark] = [lum(front), lum(bg)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    }));
    const size = parseFloat(style.fontSize), bold = Number(style.fontWeight) >= 700;
    const needed = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (ratio < needed) problems.push(`contrast ${ratio.toFixed(2)}:1 la „${text.slice(0, 30)}” (${size}px)`);
  }
  // Text tăiat cu „…”: suma sau numele trebuie să se vadă întregi (se rup pe rânduri, nu se ascund).
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.textOverflow !== "ellipsis" && !(style.overflowX === "hidden" && style.whiteSpace === "nowrap")) continue;
    if (!el.textContent.trim() || !el.checkVisibility() || el.closest("[aria-hidden='true']")) continue;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) problems.push(`„${el.textContent.trim().slice(0, 30)}” e tăiat cu „…” (${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]})`);
  }
  return [...new Set(problems)].slice(0, 8);
}

/* global window, MutationObserver -- zoomText() rulează în pagină */
/**
 * Fontul mare al telefonului: Android pune textZoom până la 130% (MainActivity), adică mărește
 * fiecare font-size. Aici mărim font-size din toate regulile CSS (px și rem) și rădăcina, o singură dată.
 */
function zoomText(scale) {
  const scaled = new WeakSet();
  const apply = () => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      const walk = (list) => {
        for (const rule of list) {
          if (rule.cssRules) walk(rule.cssRules);
          if (!rule.style || !rule.style.fontSize || scaled.has(rule)) continue;
          const match = /^([\d.]+)(px|rem)$/.exec(rule.style.fontSize.trim());
          if (match) rule.style.setProperty("font-size", `${(Number(match[1]) * scale).toFixed(2)}${match[2]}`, rule.style.getPropertyPriority("font-size"));
          scaled.add(rule);
        }
      };
      walk(rules);
    }
  };
  if (window.__bfZoom) return;
  window.__bfZoom = true;
  apply();
  document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * scale}px`;
  // Foile încărcate mai târziu (ecranele leneșe) primesc aceeași mărire.
  new MutationObserver(apply).observe(document.head, { childList: true, subtree: true });
}

async function main() {
  const vite = await startVite();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const found = [];
  try {
    // Pe lângă teme × lățimi: o trecere cu fontul telefonului la 130%, pe cel mai îngust ecran.
    const RUNS = [...THEMES.flatMap((theme) => WIDTHS.map((width) => ({ theme, width, zoom: 1 }))), ...(THEMES.includes("white") ? [{ theme: "white", width: 360, zoom: 1.3 }] : [])];
    for (const { theme, width, zoom } of RUNS) for (const [name, open] of Object.entries(SCREENS)) {
      if (ONLY && !ONLY.test(name)) continue;
      const context = await browser.newContext({ viewport: { width, height: 800 }, locale: "ro-RO" });
      await context.addInitScript((theme) => {
        try {
          const keys = { "buget-familie:setup-complete": "true", "buget-familie:onboarding-complete": "true", "buget-familie:first-week-tour-dismissed": "1", "buget-familie:theme": theme, "buget-familie:whats-new-2026-10h": "1", "bonai:look-v1": "1", "buget-familie:theme-schedule": "manual" };
          for (const [key, value] of Object.entries(keys)) localStorage.setItem(key, value);
          for (const key of ["catalog", "ink", "atelier", "premium", "ui-chrome"]) localStorage.setItem(`buget-familie:theme-migrated-${key}-2026-09`, "1");
        } catch { /* about:blank */ }
      }, theme);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(BASE);
      await page.waitForTimeout(1200);
      await seed(page);
      await page.reload();
      await page.waitForTimeout(2000);
      if (zoom !== 1) await page.evaluate(zoomText, zoom);
      if (open) await open(page);
      if (zoom !== 1) await page.evaluate(zoomText, zoom);
      await page.waitForTimeout(600);
      const problems = [...await page.evaluate(inspect), ...errors.map((message) => `eroare: ${message}`)];
      if (problems.length) found.push(`${name} · ${theme} · ${width}px${zoom !== 1 ? ` · font ${zoom * 100}%` : ""}\n    ${problems.join("\n    ")}`);
      await context.close();
    }
  } finally {
    await browser.close();
    vite.kill();
  }
  if (found.length) fail(`Probleme de interfață:\n  ${found.join("\n  ")}`);
  console.log(`✓ Interfața trece: ${Object.keys(SCREENS).length} ecrane × ${THEMES.length} teme × ${WIDTHS.length} lățimi.`);
}

const watchdog = setTimeout(() => { console.error("✗ Testul a depășit 15 minute."); process.exit(1); }, 15 * 60_000);
main().then(() => { clearTimeout(watchdog); process.exit(0); }).catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
