/**
 * Bonul plătit din două surse (voucher SGR + card), cu articole, de la scanare la corectură.
 * Reproduce ce a pățit un om: după salvare, partea de voucher dispărea, suma scădea la partea de
 * card și articolele se pierdeau. Verifică registrul după fiecare pas: salvare, repornire, corectură.
 *
 * Rulare: node e2e/split-receipt.e2e.mjs  (pornește Vite și Chromium; citirea bonului e simulată).
 */
/* global document -- rulează în pagină (page.evaluate) */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5198;
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

const KEYS = {
  "buget-familie:setup-complete": "true",
  "buget-familie:onboarding-complete": "true",
  "buget-familie:first-week-tour-dismissed": "1",
  "buget-familie:whats-new-2026-10h": "1",
  "buget-familie:receipt-scan-consent": "1",
  "buget-familie:theme": "white",
};

const RECEIPT = {
  store: "Exflor", date: null, total: 20.36, confidence: "high", model: "gemini-test", storeCui: "RO123456", city: "Iași",
  items: [
    { name: "Kinder Delice", quantity: 2, amount: 6.76, category: "Dulciuri" },
    { name: "Napolitane", quantity: 1, amount: 4.6, category: "Dulciuri" },
    { name: "Apă plată 2 L", quantity: 1, amount: 8.5, category: "Apă", brand: "Dorna", size: 2, sizeUnit: "l" },
    { name: "Garanție SGR", quantity: 1, amount: 0.5, category: "SGR" },
  ],
  payments: [{ method: "voucher", amount: 12 }, { method: "card", amount: 8.36 }],
};

const ledger = (page) => page.evaluate(async () => (await (await import("/src/lib/app-storage.ts")).readAppData()));
const summary = (data) => {
  const parts = data.transactions.filter((item) => /Exflor/.test(item.title));
  const receipt = data.receipts.find((item) => /Exflor/.test(item.vendor));
  return { parts: parts.map((item) => `${item.sourceId}:${item.amount}${item.receiptId ? "+bon" : ""}`).sort().join(" "), lines: receipt?.lines?.length || 0, linked: receipt?.linkedTransactionId || "" };
};
/** Bonul pe produs: magazinul (CUI, oraș) și marca/gramajul articolului rămân după salvare și corectură. */
const expectProductFacts = async (page, when) => {
  await waitFor(async () => {
    const receipt = (await ledger(page)).receipts.find((item) => /Exflor/.test(item.vendor));
    const water = receipt?.lines?.find((line) => /Apă plată/.test(line.label || ""));
    if (receipt?.storeCui !== "RO123456" || receipt?.city !== "Iași") throw new Error(`magazin: ${receipt?.storeCui} ${receipt?.city}`);
    if (water?.brand !== "Dorna" || water?.size !== 2 || water?.sizeUnit !== "l") throw new Error(`apă: ${JSON.stringify(water)}`);
    return true;
  }, `marca și magazinul ${when}`);
};

const expectIntact = async (page, when) => {
  await waitFor(async () => {
    const got = summary(await ledger(page));
    if (got.parts !== "source-debit:8.36 source-voucher:12+bon" && got.parts !== "source-debit:8.36+bon source-voucher:12") throw new Error(`părți: ${got.parts}`);
    if (got.lines < 4) throw new Error(`articole: ${got.lines}`);
    return true;
  }, `bonul întreg ${when}`);
};

async function main() {
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"] });
  await waitFor(async () => (await fetch(BASE)).ok, "Vite", 60_000);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ro-RO" });
    await context.addInitScript((keys) => { try { for (const [key, value] of Object.entries(keys)) localStorage.setItem(key, value); } catch { /* about:blank */ } }, KEYS);
    await context.route(/readReceipt/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ receipt: RECEIPT }) }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(BASE);
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const storage = await import("/src/lib/app-storage.ts");
      const { createEmptyAppData } = await import("/src/lib/finance-data.ts");
      const data = await storage.readAppData() ?? createEmptyAppData();
      data.settings.paymentSources = [
        ...data.settings.paymentSources.map((source) => ({ ...source, openingBalance: source.id === "source-debit" ? 500 : source.openingBalance })),
        { id: "source-voucher", name: "Voucher SGR", kind: "voucher", memberId: "member-me", openingBalance: 40 },
      ];
      const later = new Date(Date.now() + 3_600_000).toISOString();
      await storage.writeAppData(data, later);
      storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
    });
    await page.reload();
    await page.waitForTimeout(1800);

    step("Notează → scanează bonul (voucher 12 + card 8,36, 4 articole) → Salvează");
    await page.getByRole("button", { name: /^Notează$/ }).first().click();
    await page.locator(".bf-quick-entry-panel input[type=file]").nth(1).setInputFiles({ name: "bon.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
    await page.getByRole("button", { name: /Salvează mișcarea/ }).waitFor({ timeout: 30_000 });
    const firstSource = await page.locator(".bf-modal select").evaluateAll((selects) => selects.map((select) => select.value).join(","));
    console.log(`  formular: ${firstSource}`);
    await page.getByRole("button", { name: /Salvează mișcarea/ }).click();
    await expectIntact(page, "după salvare");
    await expectProductFacts(page, "după salvare");
    console.log(`  registru: ${JSON.stringify(summary(await ledger(page)))}`);

    step("Repornire");
    await page.reload();
    await page.waitForTimeout(2500);
    await expectIntact(page, "după repornire");
    await expectProductFacts(page, "după repornire");

    step("Mișcări → deschide bonul → Salvează fără schimbări");
    await page.getByRole("button", { name: /^Mișcări$/ }).first().click();
    await page.waitForTimeout(800);
    await page.getByText("Exflor", { exact: false }).first().click();
    await page.getByRole("button", { name: /Salvează mișcarea/ }).waitFor();
    const editState = await page.evaluate(() => ({ amount: Array.from(document.querySelectorAll(".bf-modal input")).map((input) => input.value).filter(Boolean).slice(0, 6), items: document.querySelectorAll(".bf-item-row").length }));
    console.log(`  corectură: ${JSON.stringify(editState)}`);
    if (editState.items < 4) fail(`Articolele nu apar la corectură (${editState.items})`);
    await page.getByRole("button", { name: /Salvează mișcarea/ }).click();
    await page.waitForTimeout(800);
    await expectIntact(page, "după corectură");
    await expectProductFacts(page, "după corectură");

    step("Repornire după corectură");
    await page.reload();
    await page.waitForTimeout(2500);
    await expectIntact(page, "după a doua repornire");

    step("Simulez pierderea: partea de voucher și bonul ei dispar (ca la om) → avertisment → „Repară”");
    await page.evaluate(async () => {
      const storage = await import("/src/lib/app-storage.ts");
      const bin = await import("/src/lib/removed-bin.ts");
      const before = await storage.readAppData();
      const voucher = before.transactions.find((item) => item.sourceId === "source-voucher");
      const after = { ...before, transactions: before.transactions.filter((item) => item.id !== voucher.id), receipts: before.receipts.filter((item) => item.linkedTransactionId !== voucher.id && item.id !== voucher.receiptId) };
      bin.recordRemovals(before, after);
      const later = new Date(Date.now() + 7_200_000).toISOString();
      await storage.writeAppData(after, later);
      storage.writeLocalStorageSnapshot(JSON.stringify(after), later);
    });
    await page.reload();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: /^Mișcări$/ }).first().click();
    await page.getByText("BON INCOMPLET").waitFor();
    await page.getByRole("button", { name: "Repară" }).click();
    await expectIntact(page, "după „Repară”");
    if (await page.getByText("BON INCOMPLET").count()) fail("Avertismentul a rămas după reparare");

    step("Fără coș: partea lipsă se reface din totalul bonului");
    await page.evaluate(async () => {
      const storage = await import("/src/lib/app-storage.ts");
      const data = await storage.readAppData();
      const voucher = data.transactions.find((item) => item.sourceId === "source-voucher");
      localStorage.removeItem("buget-familie:removed-bin");
      const card = data.transactions.find((item) => item.sourceId === "source-debit" && /Exflor/.test(item.title));
      const after = { ...data, transactions: data.transactions.filter((item) => item.id !== voucher.id).map((item) => item.id === card.id ? { ...item, note: "Bon de 20,36 RON: 12,00 RON din Voucher SGR și 8,36 RON din Card debit." } : item) };
      const later = new Date(Date.now() + 10_800_000).toISOString();
      await storage.writeAppData(after, later);
      storage.writeLocalStorageSnapshot(JSON.stringify(after), later);
    });
    await page.reload();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: /^Mișcări$/ }).first().click();
    await page.getByText("BON INCOMPLET").waitFor();
    await page.getByRole("button", { name: "Repară" }).click();
    await waitFor(async () => {
      const parts = (await ledger(page)).transactions.filter((item) => /Exflor/.test(item.title));
      return parts.length === 2 && Math.abs(parts.reduce((sum, item) => sum + item.amount, 0) - 20.36) < 0.01 && parts.some((item) => item.sourceId === "source-voucher" && item.amount === 12);
    }, "partea de voucher refăcută");

    step("Ștergere → „Șterse recent” → Pune înapoi");
    await page.getByRole("button", { name: /^Șterge .*Exflor/ }).first().click();
    await page.getByRole("button", { name: /^(Da|Șterge)/ }).last().click();
    await waitFor(async () => !(await ledger(page)).transactions.some((item) => /Exflor/.test(item.title)), "bonul șters întreg");
    await page.getByRole("button", { name: /Șterse recent/ }).click();
    await page.getByRole("button", { name: "Pune înapoi" }).first().click();
    await page.getByRole("button", { name: /^Pune înapoi$/ }).last().click();
    await waitFor(async () => (await ledger(page)).transactions.some((item) => /Exflor/.test(item.title)), "o parte pusă înapoi");

    if (errors.length) fail(`Erori în pagină: ${errors.join(" | ")}`);
    console.log("✓ Bonul pe două surse rămâne întreg: ambele părți, sumele și articolele.");
    await context.close();
  } finally {
    await browser.close();
    vite.kill();
  }
}

const watchdog = setTimeout(() => { console.error("✗ Testul a depășit 5 minute."); process.exit(1); }, 5 * 60_000);
main().then(() => { clearTimeout(watchdog); process.exit(0); }).catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
