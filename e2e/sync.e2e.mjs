/**
 * Test cap-coadă al sincronizării familiei, pe emulatoarele Firestore și Auth (fără date reale),
 * cu regulile din etapa 2 (firestore.auth.rules): fiecare telefon intră cu identitate anonimă.
 *
 * Refă scenariul lui Radu și al Ioanei din testarea cu utilizatori: două „telefoane”
 * (profiluri de browser izolate) pe aplicația reală, legată de emulator.
 *   - Radu creează camera, Ioana intră cu invitația (C4);
 *   - cheltuiala Ioanei ajunge la Radu pe numele ei, nu ca „Eu” (C3);
 *   - Ioana redeschide aplicația: sync-ul se reia singur și cheltuiala ajunge (C2);
 *   - cheltuiala lui Radu ajunge la Ioana pe numele lui.
 *
 * Rulare: pnpm test:sync  (pornește emulatorul, serverul Vite și Chromium).
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/`;
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const PROJECT = process.env.GCLOUD_PROJECT || "buget-familie-a6a0d";

const fail = (message) => { throw new Error(message); };
const step = (message) => console.log(`• ${message}`);

async function waitFor(check, what, timeout = 30_000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await check().catch((error) => error);
    if (last === true) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  fail(`Timp depășit: ${what}${last instanceof Error ? ` (${last.message})` : ""}`);
}

async function startVite() {
  // Vite pornit direct (nu prin pnpm), ca `kill()` să-l oprească sigur: altfel serverul rămas
  // deschis ține procesul Node în viață, iar pasul din CI nu se mai termină.
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    env: { ...process.env, VITE_FIRESTORE_EMULATOR: EMULATOR, VITE_AUTH_EMULATOR: AUTH_EMULATOR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  vite.stdout.on("data", (chunk) => { output += chunk; });
  vite.stderr.on("data", (chunk) => { output += chunk; });
  await waitFor(async () => (await fetch(BASE)).ok, `Vite pe ${BASE}\n${output}`, 60_000);
  return vite;
}

/** Un telefon nou: onboarding închis, un nume și 2.500 lei pe card, scrise prin stocarea aplicației. */
async function phone(browser, { name, partner }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ro-RO", permissions: ["clipboard-read", "clipboard-write"] });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("buget-familie:setup-complete", "true");
      
      localStorage.setItem("buget-familie:onboarding-complete", "true");
    } catch {
      // about:blank nu are stocare; pagina aplicației o are.
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await page.evaluate(async ({ name, partner }) => {
    const storage = await import("/src/lib/app-storage.ts");
    const data = await storage.readAppData() ?? (await import("/src/lib/finance-data.ts")).createEmptyAppData();
    data.settings.memberName = name;
    data.settings.members = [{ id: "member-me", name }, ...(partner ? [{ id: "member-partner", name: partner }] : [])];
    data.settings.paymentSources = data.settings.paymentSources.map((source) => ({ ...source, openingBalance: source.id === "source-debit" ? 2500 : 0 }));
    const later = new Date(Date.now() + 60_000).toISOString();
    await storage.writeAppData(data, later);
    storage.writeLocalStorageSnapshot(JSON.stringify(data), later);
  }, { name, partner });
  await page.reload();
  await page.waitForTimeout(1500);
  return { page, context, errors };
}

const ledger = (page) => page.evaluate(async () => {
  const data = await (await import("/src/lib/app-storage.ts")).readAppData();
  return { transactions: data.transactions.map((item) => ({ amount: item.amount, person: item.person, memberId: item.memberId })), members: data.settings.members.map((item) => item.name) };
});

/**
 * Codul invitației, luat ca de om: „Copiază invitația” din Sync. Pe web el nu mai stă în
 * IndexedDB (S5): sesiunea păstrează doar cheia neexportabilă și `inviteRoom`.
 */
async function copiedInvite(page) {
  await openSync(page);
  await page.getByRole("button", { name: "Copiază invitația" }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return text.match(/bf1\.[A-Za-z0-9_.-]+/)?.[0];
}

async function openSync(page) {
  if (await page.locator(".bf-sync-session").count()) return;
  // BonAI: Cont → Familie și membri.
  await page.locator(".os-dock-v2 > button").last().click();
  await page.getByRole("button", { name: /^Familie și membri/ }).first().click();
  await page.locator(".bf-sync-session").waitFor();
}

async function addExpense(page, amount) {
  // BonAI: „Fără bon” → un produs cu suma → Salvează bonul (aceeași cheltuială ca înainte, sincronizată la fel).
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.locator(".os-dock-add").click();
  await page.getByRole("button", { name: /Fără bon/ }).click();
  await page.getByRole("button", { name: /Adaugă un produs/ }).click();
  await page.locator(".bn-review input:not([inputmode])").nth(1).fill(`Test ${amount}`);
  await page.locator(".bn-review input[inputmode=\"decimal\"]").nth(1).fill(String(amount).replace(".", ","));
  await page.getByRole("button", { name: "Gata" }).click();
  await page.getByRole("button", { name: /Salvează bonul/ }).click();
  const saved = page.getByRole("dialog", { name: "Bon salvat" });
  await saved.waitFor();
  await saved.getByRole("button", { name: "Gata" }).click();
  await page.locator(".bn-review").waitFor({ state: "detached" });
}

/** „Intră în familie”; telefonul are deja date, deci confirmă că le trimite în camera invitației. */
async function joinWithInvite(page) {
  await page.getByRole("button", { name: "Intră în familie" }).click();
  const confirm = page.getByRole("button", { name: "Da, intru" });
  await confirm.waitFor({ timeout: 5_000 });
  await confirm.click();
}

const connected = (page) => page.locator(".bf-sync-state.connected").count().then((count) => count > 0);

async function main() {
  const vite = await startVite();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    step("Fără identitate, Firestore refuză camera familiei");
    const room = "a".repeat(64);
    const anonymousWrite = await fetch(`http://${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/familySync/${room}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields: { envelope: { mapValue: { fields: { version: { integerValue: "1" } } } } } }),
    });
    if (anonymousWrite.status !== 403) fail(`Scriere fără identitate: HTTP ${anonymousWrite.status}, așteptat 403`);
    const anonymousRead = await fetch(`http://${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/familySync/${room}`);
    if (anonymousRead.status !== 403) fail(`Citire fără identitate: HTTP ${anonymousRead.status}, așteptat 403`);

    step("Radu creează camera familiei");
    const radu = await phone(browser, { name: "Radu", partner: "Ioana" });
    await openSync(radu.page);
    await radu.page.getByRole("button", { name: "Creează camera" }).click();
    await waitFor(() => connected(radu.page), "Radu conectat");
    const stored = await radu.page.evaluate(async () => { const session = await (await import("/src/lib/family-session.ts")).loadFamilySession(); return { invite: session?.invite, inviteRoom: session?.inviteRoom }; });
    if (stored.invite || !stored.inviteRoom) fail(`Pe web sesiunea trebuie să țină doar cheia, fără codul invitației: ${JSON.stringify(stored)}`);
    const invite = await copiedInvite(radu.page);
    if (!invite?.startsWith("bf1.")) fail(`Invitația nu se poate copia: ${invite}`);
    const raduUid = await radu.page.evaluate(async () => (await import("/src/lib/realtime-sync.ts")).ensureSignedIn());
    if (!raduUid) fail("Telefonul lui Radu nu are identitate anonimă");

    step("Ioana intră cu invitația, de pe alt telefon");
    const ioana = await phone(browser, { name: "Ioana" });
    // Linkul deschis de la zero, ca din camera telefonului (doar schimbarea `#` n-ar reîncărca pagina).
    await ioana.page.goto("about:blank");
    await ioana.page.goto(`${BASE}#alatura=${invite}`);
    await joinWithInvite(ioana.page);
    await waitFor(() => connected(ioana.page), "Ioana conectată");
    const ioanaUid = await ioana.page.evaluate(async () => (await import("/src/lib/realtime-sync.ts")).ensureSignedIn());
    if (!ioanaUid || ioanaUid === raduUid) fail(`Identitatea Ioanei: ${ioanaUid}`);

    step("Cheltuiala Ioanei ajunge la Radu pe numele ei");
    await addExpense(ioana.page, 38);
    await waitFor(async () => (await ledger(radu.page)).transactions.some((item) => item.amount === 38 && item.person === "Ioana"), "38 lei pe numele Ioanei la Radu");
    const raduMembers = (await ledger(radu.page)).members.sort();
    if (JSON.stringify(raduMembers) !== JSON.stringify(["Ioana", "Radu"])) fail(`Membrii la Radu: ${raduMembers}`);

    step("Ioana redeschide aplicația: sync-ul se reia singur, cu aceeași identitate");
    await ioana.page.reload();
    await waitFor(() => connected(ioana.page).catch(() => false).then(async (ok) => ok || (await openSync(ioana.page).then(() => connected(ioana.page)))), "Ioana reconectată după redeschidere");
    if (await ioana.page.locator(".bf-sync-off-banner").count()) fail("Bannerul „sync oprit” apare după reconectare");
    if ((await ioana.page.evaluate(async () => (await import("/src/lib/realtime-sync.ts")).ensureSignedIn())) !== ioanaUid) fail("Ioana a primit altă identitate după redeschidere");
    await addExpense(ioana.page, 12.5);
    await waitFor(async () => (await ledger(radu.page)).transactions.some((item) => item.amount === 12.5 && item.person === "Ioana"), "12,50 lei după redeschidere ajung la Radu");

    step("Cheltuiala lui Radu ajunge la Ioana pe numele lui");
    await addExpense(radu.page, 245.3);
    await waitFor(async () => (await ledger(ioana.page)).transactions.some((item) => item.amount === 245.3 && item.person === "Radu"), "245,30 lei pe numele lui Radu la Ioana");
    const ioanaMembers = (await ledger(ioana.page)).members.sort();
    if (JSON.stringify(ioanaMembers) !== JSON.stringify(["Ioana", "Radu"])) fail(`Membrii la Ioana: ${ioanaMembers}`);

    // D1 din auditul 26.09: o cheltuială notată chiar când sosea pachetul partenerului rămânea netrimisă.
    step("Radu și Ioana notează în aceeași clipă: ambele cheltuieli ajung pe ambele telefoane");
    await Promise.all([addExpense(radu.page, 71.1), addExpense(ioana.page, 83.2)]);
    for (const [who, page] of [["Radu", radu.page], ["Ioana", ioana.page]]) {
      await waitFor(async () => { const list = (await ledger(page)).transactions; return list.some((item) => item.amount === 71.1) && list.some((item) => item.amount === 83.2); }, `ambele cheltuieli simultane la ${who}`);
    }

    step("Cine știe doar ID-ul camerei nu poate suprascrie pachetul familiei (lanțul de scriere)");
    const raduRoom = await radu.page.evaluate(async () => (await (await import("/src/lib/family-session.ts")).loadFamilySession())?.roomId);
    const intruder = await phone(browser, { name: "Străin" });
    const intrusion = await intruder.page.evaluate(async (roomId) => {
      const crypto = await import("/src/lib/family-crypto.ts");
      const sync = await import("/src/lib/realtime-sync.ts");
      const { createEmptyAppData } = await import("/src/lib/finance-data.ts");
      const junk = await crypto.encryptFamilyData(createEmptyAppData(), "o-cheie-care-nu-e-a-familiei");
      const attempts = {};
      try { await sync.pushFamilyEnvelope(roomId, junk); attempts.plain = "scris"; } catch { attempts.plain = "refuzat"; }
      try { await sync.pushFamilyEnvelope(roomId, junk, undefined, (seq) => crypto.writeChainToken("o-cheie-care-nu-e-a-familiei", roomId, seq)); attempts.chain = "scris"; } catch { attempts.chain = "refuzat"; }
      return attempts;
    }, raduRoom);
    // Cu regulile etapei 2 (E2E_RULES=auth, cele publicate acum) scrierea fără lanț e încă permisă.
    if (process.env.E2E_RULES !== "auth" && (intrusion.plain !== "refuzat" || intrusion.chain !== "refuzat")) fail(`Străinul a putut scrie în cameră: ${JSON.stringify(intrusion)}`);
    await addExpense(radu.page, 12.5);
    await waitFor(async () => (await ledger(ioana.page)).transactions.some((item) => item.amount === 12.5), "familia scrie mai departe după încercarea străinului");

    // Intrarea cu parolă se închide pe LEGACY_PASSWORD_UNTIL (family-password.ts); după aceea scenariul nu mai are sens.
    let ana; let mihai;
    if (Date.now() < Date.parse("2027-01-01T00:00:00")) {
      step("Camera veche, cu parolă: doi părinți conectați cu parola");
      const password = "pisicaVerdeSareGardul7";
      ana = await phone(browser, { name: "Ana", partner: "Mihai" });
      // O cameră veche nu se mai poate crea din aplicație; o punem direct, cum ar fi rămas din versiunile trecute.
      await ana.page.evaluate(async (password) => {
        const crypto = await import("/src/lib/family-crypto.ts");
        const sync = await import("/src/lib/realtime-sync.ts");
        const data = await (await import("/src/lib/app-storage.ts")).readAppData();
        const roomId = await crypto.deriveFamilyRoomId(password);
        await sync.pushFamilyEnvelope(roomId, await crypto.encryptFamilyData(data, password), undefined, (seq) => crypto.writeChainToken(password, roomId, seq));
      }, password);
      const connectWithPassword = async (page) => {
        await openSync(page);
        await page.getByRole("button", { name: "Am o parolă de familie" }).click();
        await page.getByLabel("Parola familiei").fill(password);
        await page.getByRole("button", { name: "Conectează cu parola" }).click();
        await waitFor(() => connected(page), "conectat cu parola");
      };
      await connectWithPassword(ana.page);
      mihai = await phone(browser, { name: "Mihai" });
      await connectWithPassword(mihai.page);
      await addExpense(mihai.page, 99);
      await waitFor(async () => (await ledger(ana.page)).transactions.some((item) => item.amount === 99 && item.person === "Mihai"), "99 lei ai lui Mihai la Ana, prin camera veche");

      step("Ana mută familia pe invitație; Mihai se oprește și intră cu invitația nouă");
      await openSync(ana.page);
      await ana.page.getByRole("button", { name: "Mută familia" }).click();
      await ana.page.getByRole("button", { name: "Da, mută familia" }).click();
      await waitFor(async () => Boolean(await ana.page.evaluate(async () => (await (await import("/src/lib/family-session.ts")).loadFamilySession())?.inviteRoom)), "Ana în camera nouă");
      const moved = await copiedInvite(ana.page);
      await waitFor(async () => (await mihai.page.locator(".bf-sync-off-banner").count()) > 0, "bannerul „sync oprit” la Mihai");
      // Exact ce face omul: „Reconectează” din banner duce la Sync, unde scrie ce s-a întâmplat.
      await mihai.page.locator(".bf-sync-off-banner button").first().click();
      await mihai.page.locator(".bf-sync-session").waitFor();
      await waitFor(async () => (await mihai.page.locator(".bf-notice").allInnerTexts()).some((text) => text.includes("Familia s-a mutat")), "Mihai află că familia s-a mutat");
      const oldRoom = await ana.page.evaluate(async (password) => {
        const crypto = await import("/src/lib/family-crypto.ts");
        const sync = await import("/src/lib/realtime-sync.ts");
        const envelope = await sync.fetchFamilyEnvelope(await crypto.deriveFamilyRoomId(password));
        const data = await crypto.decryptFamilyData(envelope, password);
        return { movedAt: data.settings.syncRoomMovedAt, transactions: data.transactions.length, hasInvite: JSON.stringify(data).includes("bf1.") };
      }, password);
      if (!oldRoom.movedAt || oldRoom.transactions || oldRoom.hasInvite) fail(`Camera veche nu a fost golită corect: ${JSON.stringify(oldRoom)}`);
      // B3: camera veche e sigilată. Cine are încă parola veche (un telefon scos din familie) nu o mai poate rescrie.
      // Regulile de rezervă (E2E_RULES=auth, fără lanț) nu au sigiliu: acolo încercarea ar reuși și ar goli camera.
      const rewrite = process.env.E2E_RULES === "auth" ? "sărit" : await ana.page.evaluate(async (password) => {
        const crypto = await import("/src/lib/family-crypto.ts");
        const sync = await import("/src/lib/realtime-sync.ts");
        const finance = await import("/src/lib/finance-data.ts");
        const roomId = await crypto.deriveFamilyRoomId(password);
        try {
          await sync.pushFamilyEnvelope(roomId, await crypto.encryptFamilyData(finance.createEmptyAppData(), password), undefined, (seq) => crypto.writeChainToken(password, roomId, seq));
          return "scris";
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }, password);
      if (rewrite === "scris") fail("Camera veche s-a putut rescrie după „Mută familia” (sigiliul nu ține)");
      await mihai.page.goto("about:blank");
      await mihai.page.goto(`${BASE}#alatura=${moved}`);
      await joinWithInvite(mihai.page);
      await waitFor(() => connected(mihai.page), "Mihai în camera nouă");
      await addExpense(mihai.page, 7);
      await waitFor(async () => (await ledger(ana.page)).transactions.some((item) => item.amount === 7 && item.person === "Mihai"), "7 lei ai lui Mihai la Ana, prin camera nouă");
      if (!(await ledger(mihai.page)).transactions.some((item) => item.amount === 99)) fail("Mihai a pierdut cheltuiala din camera veche");
    } else step("Intrarea cu parolă e închisă: sar peste camera veche");

    const errors = [...radu.errors, ...ioana.errors, ...intruder.errors.filter((text) => !/permission|insufficient/i.test(text)), ...(ana?.errors || []), ...(mihai?.errors || [])];
    if (errors.length) fail(`Erori în pagină: ${errors.join(" | ")}`);
    console.log("✓ Sincronizarea familiei merge cap-coadă (C2, C3, C4 și mutarea de pe parolă).");
  } finally {
    await browser.close();
    vite.kill();
  }
}

/** Plasă de siguranță: un test care atârnă e tot un test picat, nu un pas care nu se termină. */
const watchdog = setTimeout(() => {
  console.error("✗ Testul a depășit 8 minute.");
  process.exit(1);
}, 8 * 60_000);

main().then(() => {
  clearTimeout(watchdog);
  process.exit(0);
}).catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
