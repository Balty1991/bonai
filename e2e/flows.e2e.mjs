/**
 * Fluxurile de bază, pe aplicația reală, cu date de test (fără Firebase). Fiecare pas face ce face
 * omul — atinge butoane, completează câmpuri — și verifică apoi registrul salvat, nu doar ecranul.
 *
 *   1. Notează o cheltuială → apare în registru și pe Astăzi; „Anulează” o scoate. Ziua „Ieri” se alege din formă.
 *   2. Plan → „Pornește rapid” → „Adaugă plicul” → „Confirmă repartizarea” → plicul există.
 *   3. Obligații → „Confirmă plata” la o rată → datoria scade, plata e în Mișcări.
 *   4. Mișcări → coșul unei mișcări → confirmare → mișcarea dispare.
 *   5. Analiză fără data salariului → „Ciclu salariu” explică și duce în Plan.
 *   6. Tema automată la 22:20 → Întunecat, și rămâne automată după „Aplică”.
 *
 * Rulare: pnpm test:flows  (pornește Vite și Chromium).
 */
/* global document -- rulează în pagină (page.evaluate) */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5197;
const BASE = `http://127.0.0.1:${PORT}/`;

const fail = (message) => { throw new Error(message); };
const step = (message) => console.log(`• ${message}`);

async function waitFor(check, what, timeout = 15_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await check().catch((error) => error);
    if (last === true) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  fail(`Timp depășit: ${what}${last instanceof Error ? ` (${last.message})` : ""}`);
}

async function startVite() {
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(async () => (await fetch(BASE)).ok, `Vite pe ${BASE}`, 60_000);
  return vite;
}

const KEYS = {
  "buget-familie:setup-complete": "true",
  // Fluxurile bugetului vechi (plicuri, rate): aplicația nouă a cumpărăturilor are testele ei.
  "buget-familie:app-mode": "budget",
  "buget-familie:onboarding-complete": "true",
  "buget-familie:first-week-tour-dismissed": "1",
  "buget-familie:whats-new-2026-10h": "1",
};

/** Un telefon nou. `seed` completează registrul (salariu, plicuri, o datorie) prin stocarea aplicației. */
async function phone(browser, { seed = true, theme = "white", extra = {}, time } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ro-RO" });
  await context.addInitScript((keys) => {
    try {
      for (const [key, value] of Object.entries(keys)) localStorage.setItem(key, value);
      for (const key of ["catalog", "ink", "atelier", "premium", "ui-chrome"]) localStorage.setItem(`buget-familie:theme-migrated-${key}-2026-09`, "1");
    } catch { /* about:blank */ }
  }, { ...KEYS, "buget-familie:theme": theme, ...extra });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (time) await page.clock.setFixedTime(time);
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  if (seed) {
    await page.evaluate(async () => {
      const storage = await import("/src/lib/app-storage.ts");
      const { createEmptyAppData, isoToday } = await import("/src/lib/finance-data.ts");
      const data = await storage.readAppData() ?? createEmptyAppData();
      const day = (offset) => { const date = new Date(`${isoToday()}T12:00:00`); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); };
      data.settings.paymentSources = data.settings.paymentSources.map((source) => ({ ...source, openingBalance: source.id === "source-debit" ? 4000 : 0 }));
      data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: day(-5), nextPayday: day(25), allocations: [{ id: "a-home", label: "Casă & facturi", amount: 900, category: "Casă & facturi" }] };
      data.transactions = [{ id: "t-old", title: "Enel", amount: 212.3, kind: "expense", category: "Casă & facturi", source: "Card", person: "Eu", date: day(-2), sourceId: "source-debit", memberId: data.settings.members[0]?.id || "member-me" }];
      data.debts = [{ id: "d1", name: "Credit nevoi personale", remaining: 18500, monthly: 620, annualRate: 18, kind: "credit", due: "", tone: "coral", dueDate: day(3) }];
      const later = new Date(Date.now() + 3_600_000).toISOString();
      await storage.writeAppData(data, later);
      storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
    });
    await page.reload();
  }
  await page.waitForTimeout(1800);
  return { page, context, errors };
}

const ledger = (page) => page.evaluate(async () => (await (await import("/src/lib/app-storage.ts")).readAppData()));
/** Meniul de jos: Astăzi · Plicuri · ＋ Notează · Mișcări · Mai mult. Obligațiile și Analiza se deschid din „Mai mult”. */
const nav = async (page, name) => {
  if (name === "Obligații" || name === "Analiză") {
    await page.getByRole("button", { name: /^Mai mult$/ }).first().click();
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
    return;
  }
  await page.getByRole("button", { name: new RegExp(`^${name}$`) }).first().click();
};

async function main() {
  const vite = await startVite();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const allErrors = [];
  try {
    step("Notează o cheltuială, apoi „Anulează”");
    {
      const { page, context, errors } = await phone(browser);
      await page.getByRole("button", { name: /^Notează$/ }).first().click();
      await page.locator(".bf-modal input[inputmode=\"decimal\"]").first().fill("42,50");
      // Un singur plic și bani nerepartizați: aplicația nu alege singură. Testul alege plicul.
      const fromEnvelope = page.locator(".bf-spend-from button").first();
      if (await fromEnvelope.count()) await fromEnvelope.click();
      await page.getByRole("button", { name: "Gata" }).last().click();
      await page.locator(".bf-undo-bar").waitFor();
      await waitFor(async () => (await ledger(page)).transactions.some((item) => item.amount === 42.5 && item.kind === "expense"), "42,50 în registru");
      await page.locator(".bf-undo-bar button", { hasText: "Anulează" }).click();
      await waitFor(async () => !(await ledger(page)).transactions.some((item) => item.amount === 42.5), "„Anulează” scoate mișcarea");
      allErrors.push(...errors);
      await context.close();
    }

    step("Notează pe „Ieri”, direct din formă");
    {
      const { page, context, errors } = await phone(browser);
      await page.getByRole("button", { name: /^Notează$/ }).first().click();
      await page.locator(".bf-modal input[inputmode=\"decimal\"]").first().fill("17,30");
      const fromEnvelope = page.locator(".bf-spend-from button").first();
      if (await fromEnvelope.count()) await fromEnvelope.click();
      await page.getByRole("button", { name: "Ieri", exact: true }).click();
      await page.getByRole("button", { name: "Gata" }).last().click();
      const yesterday = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
      await waitFor(async () => (await ledger(page)).transactions.some((item) => item.amount === 17.3 && item.date === yesterday), "17,30 notat pe ieri");
      allErrors.push(...errors);
      await context.close();
    }

    step("Plan: „Pornește rapid” → plic nou");
    {
      const { page, context, errors } = await phone(browser);
      await nav(page, "Plicuri");
      await page.waitForTimeout(800);
      const before = (await ledger(page)).settings.salaryPlan.allocations.length;
      const chip = page.locator(".bf-quick-envelope-chips button").first();
      const chipLabel = (await chip.innerText()).trim();
      await chip.click();
      await page.getByRole("button", { name: "Adaugă plicul" }).click();
      await page.getByRole("button", { name: "Confirmă repartizarea" }).click();
      await waitFor(async () => (await ledger(page)).settings.salaryPlan.allocations.length === before + 1, `plicul „${chipLabel}” salvat`);
      allErrors.push(...errors);
      await context.close();
    }

    step("Obligații: plata ratei scade datoria și intră în Mișcări");
    {
      const { page, context, errors } = await phone(browser);
      await nav(page, "Obligații");
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Confirmă plata" }).first().click();
      await page.getByRole("button", { name: "Confirmă plata ratei" }).click();
      await page.getByRole("button", { name: /^Da$/ }).click(); // „Ești sigur? … Soldul datoriei va deveni 17.880 RON.”
      await waitFor(async () => { const data = await ledger(page); return data.debts[0].remaining === 18500 - 620 && data.transactions.some((item) => item.amount === 620); }, "datoria scade cu 620 și plata e în registru");
      allErrors.push(...errors);
      await context.close();
    }

    step("Mișcări: ștergerea unei mișcări cere confirmare");
    {
      const { page, context, errors } = await phone(browser);
      await nav(page, "Mișcări");
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Șterge Enel" }).click();
      await page.getByRole("button", { name: /^(Da|Șterge)/ }).last().click();
      await waitFor(async () => !(await ledger(page)).transactions.some((item) => item.id === "t-old"), "Enel șters");
      allErrors.push(...errors);
      await context.close();
    }

    step("Analiză fără data salariului: „Ciclu salariu” explică și duce în Plan");
    {
      const { page, context, errors } = await phone(browser, { seed: false });
      await nav(page, "Analiză");
      await page.waitForTimeout(1000);
      await page.getByRole("button", { name: /Ciclu salariu/ }).click();
      await page.getByText("Ciclul de salariu are nevoie de data venitului").waitFor();
      await page.getByRole("button", { name: "Setează data salariului" }).click();
      await waitFor(async () => (await page.locator("[aria-current=page]").first().innerText()).includes("Plicuri"), "ajunge în Plicuri");
      allErrors.push(...errors);
      await context.close();
    }

    step("Tema automată la 22:20 → Întunecat, rămâne automată");
    {
      const { page, context, errors } = await phone(browser, { seed: false, time: new Date("2026-09-24T22:20:00") });
      await page.getByRole("button", { name: /Deschide instrumentele/ }).first().click();
      await page.getByRole("button", { name: /^Aspect/ }).first().click();
      await page.getByRole("switch", { name: /Comută automat/ }).click();
      const apply = page.locator(".bf-theme-apply");
      if (!(await apply.innerText()).includes("automat")) fail(`Butonul spune „${await apply.innerText()}”`);
      await apply.click();
      await waitFor(async () => page.evaluate(() => document.documentElement.classList.contains("theme-dark")), "tema Întunecat");
      if (await page.evaluate(() => localStorage.getItem("buget-familie:theme-schedule")) !== "auto") fail("automatul s-a oprit");
      allErrors.push(...errors);
      await context.close();
    }

    if (allErrors.length) fail(`Erori în pagină: ${allErrors.join(" | ")}`);
    console.log("✓ Fluxurile de bază merg: notare + anulare, plic nou, plata ratei, ștergere, ciclu salariu, temă automată.");
  } finally {
    await browser.close();
    vite.kill();
  }
}

const watchdog = setTimeout(() => { console.error("✗ Testul a depășit 8 minute."); process.exit(1); }, 8 * 60_000);
main().then(() => { clearTimeout(watchdog); process.exit(0); }).catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
