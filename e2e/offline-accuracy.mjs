/**
 * Acuratețea scanării offline (Tesseract pe telefon + reguli) pe pozele reale din e2e/receipts,
 * prin exact codul aplicației, în Chrome. Totalul corect e în numele fișierului; AI-ul (testul
 * receipt-smoke) trebuie să le citească pe toate exact. Tipărește un tabel și scrie JSON în OUT.
 * Rulare: CHROMIUM_PATH=… node e2e/offline-accuracy.mjs [OUT=fișier.json]
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const PORT = 5197;
const BASE = `http://127.0.0.1:${PORT}/`;
const root = new URL("..", import.meta.url).pathname;
const dir = join(root, "e2e/receipts");
const cases = readdirSync(dir).map((name) => {
  const path = join(dir, name);
  const files = statSync(path).isDirectory() ? readdirSync(path).sort().map((f) => join(path, f)) : [path];
  return { name, total: Number(/(\d+\.\d{2})/.exec(name)?.[1]), files: files.map((f) => readFileSync(f).toString("base64")) };
});
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore", cwd: root });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* încă pornește */ } await new Promise((r) => setTimeout(r, 1000)); }
  const page = await browser.newPage();
  await page.goto(BASE); await page.waitForTimeout(1500);
  const rows = [];
  for (const item of cases) {
    const started = Date.now();
    const got = await page.evaluate(async ({ files, prep }) => {
      const { compressReceiptPhoto, scanToPrefill } = await import("/src/lib/receipt-scan.ts");
      const { offlineReadReceipt } = await import("/src/lib/receipt-offline.ts");
      const { createEmptyAppData } = await import("/src/lib/finance-data.ts");
      const photos = [];
      for (const b64 of files) { const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const p = await compressReceiptPhoto(new File([bytes], "bon.jpg", { type: "image/jpeg" })); photos.push({ data: p.data, mimeType: p.mimeType }); }
      const raw = await offlineReadReceipt(photos, undefined, prep);
      const prefill = scanToPrefill(raw, createEmptyAppData());
      return { store: raw.store, total: raw.total, items: raw.items.length, sum: Math.round(raw.items.reduce((s, x) => s + x.amount, 0) * 100) / 100, warning: Boolean(prefill.warning), prefillAmount: prefill.amount };
    }, { files: item.files, prep: process.env.PREP ? JSON.parse(process.env.PREP) : undefined });
    rows.push({ receipt: item.name, expected: item.total, ...got, totalOk: Math.abs(got.total - item.total) < 0.011, sumOk: Math.abs(got.sum - item.total) < 0.011, ms: Date.now() - started });
  }
  console.table(rows);
  const n = rows.length;
  const summary = { receipts: n, totalExact: rows.filter((r) => r.totalOk).length, itemsSumExact: rows.filter((r) => r.sumOk).length, usableWithoutEdit: rows.filter((r) => r.totalOk && r.sumOk).length, flaggedForReview: rows.filter((r) => !(r.totalOk && r.sumOk) && r.warning).length, silentWrong: rows.filter((r) => !(r.totalOk && r.sumOk) && !r.warning).length, aiReference: "receipt-smoke cere total exact pe toate" };
  console.log(JSON.stringify(summary));
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ summary, rows }, null, 2));
  if (summary.silentWrong) { console.error("✗ un bon greșit a trecut fără avertizare"); process.exitCode = 1; }
} finally { await browser.close(); vite.kill(); }
