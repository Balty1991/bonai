/**
 * Ecranul de verificare a bonului trebuie să se deruleze până la ultimul articol, pe telefon,
 * cu bara „Salvează bonul” fixă jos și fără blocaj de derulare rămas pe pagină.
 *
 * Rulare: node e2e/review-scroll.e2e.mjs  (pornește Vite și Chromium cu atingere).
 */
/* global document, window, getComputedStyle -- rulează în pagină (page.evaluate) */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5199;
const URL = `http://127.0.0.1:${PORT}/e2e/review.html`;
const fail = (message) => { throw new Error(message); };

const vite = spawn("pnpm", ["exec", "vite", "--config", "vite.config.ts", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: "inherit", detached: true });
const stop = () => { try { process.kill(-vite.pid); } catch { /* deja oprit */ } };
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(URL)).ok) break; } catch { /* încă pornește */ } if (i > 120) fail("Vite n-a pornit"); await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${URL}?theme=${theme}`);
    const last = page.getByText(/Ultimul produs/i).first();
    await last.waitFor({ state: "attached", timeout: 20_000 });
    const info = await page.evaluate(() => {
      const scroller = document.querySelector(".bn-review-scroll");
      if (!scroller) return { missing: true };
      const style = getComputedStyle(scroller);
      return { overflowY: style.overflowY, scrollable: scroller.scrollHeight > scroller.clientHeight + 40, bodyTouch: getComputedStyle(document.body).touchAction };
    });
    if (info.missing) fail("Lipsește containerul de derulare .bn-review-scroll");
    if (info.overflowY !== "auto") fail(`overflow-y este ${info.overflowY}, nu auto`);
    if (!info.scrollable) fail("Lista nu e mai înaltă decât ecranul: testul n-ar verifica nimic");
    if (info.bodyTouch === "none") fail("touch-action: none rămas pe body");
    // Rotița/gestul pe listă, ca un om: nu scrollTo din cod.
    const box = await page.locator(".bn-review-scroll").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
    const visible = await page.evaluate(() => {
      const el = [...document.querySelectorAll(".bn-review-scroll *")].find((node) => /Ultimul produs/i.test(node.textContent || "") && node.children.length === 0);
      const bar = document.querySelector(".bn-review-bar");
      if (!el) return "lipsă";
      const r = el.getBoundingClientRect();
      const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      return r.bottom <= barTop + 1 && r.top >= 0 ? "ok" : `ascuns (jos ${Math.round(r.bottom)}, bara ${Math.round(barTop)})`;
    });
    if (visible !== "ok") fail(`[${theme}] Ultimul articol nu ajunge deasupra barei de salvare: ${visible}`);
    if (errors.length) fail(`[${theme}] Erori în pagină: ${errors.join("; ")}`);
    console.log(`✓ ${theme}: ecranul de verificare se derulează până la ultimul articol`);
    await page.close();
  }
} finally {
  await browser?.close();
  stop();
}
