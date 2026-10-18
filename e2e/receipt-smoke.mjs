/**
 * Scanarea bonului pe funcția publicată: trimite pozele din e2e/receipts (așa cum le
 * face omul) și verifică totalul, suma articolelor și câteva categorii știute.
 * Rulează după publicarea funcțiilor; tipărește tot ce a citit modelul.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const config = readFileSync(join(root, "client/src/lib/firebase-config.ts"), "utf8");
const apiKey = /apiKey:\s*"([^"]+)"/.exec(config)?.[1];
const project = process.env.FIREBASE_PROJECT_ID || "buget-familie-a6a0d";
const region = process.env.FUNCTIONS_REGION || "europe-central2";
const origin = "https://balty1991.github.io";
const categories = ["Alimente", "Consumabile copil", "Abonamente", "Băuturi", "Apă", "Dulciuri", "Transport", "Casă & facturi", "Sănătate", "Educație", "Timp liber", "Haine", "SGR", "Sacoșe", "Altele"];

/** Ce trebuie să iasă, pe lângă total: un fragment din nume → categoria lui. */
const expectations = {
  "vodka-39.76.jpg": [[/vodc|vodk|stalinsk/i, "Băuturi"], [/kinder/i, "Dulciuri"], [/sacos|sacoș/i, "Sacoșe"], [/garan/i, "SGR"]],
  "crumpled-44.58.jpg": [[/milka/i, "Dulciuri"], [/salam|crenv/i, "Alimente"], [/garan/i, "SGR"], [/sacos|sacoș/i, "Sacoșe"]],
  "familia-57.30.jpg": [[/perla|harghit/i, "Apă"], [/garan/i, "SGR"], [/p[aâ]ine/i, "Alimente"], [/sacos|sacoș/i, "Sacoșe"]],
  "sinsay-50.97.jpg": [[/ciorap/i, "Haine"], [/teni/i, "Haine"], [/pung/i, "Sacoșe"]],
  // Bon digital Profi în 4 capturi care se suprapun: doi crenvurști distincți (4,54 și 4,55), fără dubluri la îmbinări.
  "profi-82.71": [[/stalin|vdk|vodc|vodk/i, "Băuturi"], [/garan/i, "SGR"], [/m&m|ciocol/i, "Dulciuri"]],
};
/** Câte rânduri distincte trebuie să aibă același nume (capturile se suprapun, dar rândurile repetate rămân). */
const repeated = { "profi-82.71": [[/crenv/i, 2]] };

const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
  method: "POST",
  headers: { "content-type": "application/json", referer: `${origin}/` },
  body: JSON.stringify({ returnSecureToken: true }),
});
const { idToken } = await signUp.json();
if (!idToken) throw new Error(`Fără identitate anonimă (HTTP ${signUp.status})`);

let failures = 0;
// „auto” = drumul din aplicație: Gemini întâi, Claude Sonnet dacă Gemini nu răspunde (credit doar atunci).
const providers = (process.env.RECEIPT_PROVIDERS || "auto").split(",").map((name) => name.trim()).filter(Boolean);
/** Doar furnizorul principal oprește publicarea; ceilalți se compară, fără să o blocheze. */
const primary = process.env.RECEIPT_PRIMARY || providers[0];
const summary = [];
const dir = join(root, "e2e/receipts");
// Un fișier .jpg = o poză; un folder „magazin-TOTAL” = capturile aceluiași bon, în ordinea numelor.
const cases = readdirSync(dir).filter((name) => name.endsWith(".jpg") || (/-\d+\.\d+$/.test(name) && statSync(join(dir, name)).isDirectory())).sort();
for (const file of cases) {
  const expectedTotal = Number(/-(\d+\.\d+)(?:\.jpg)?$/.exec(file)?.[1]);
  const shots = file.endsWith(".jpg") ? [join(dir, file)] : readdirSync(join(dir, file)).filter((name) => name.endsWith(".jpg")).sort().map((name) => join(dir, file, name));
  const images = shots.map((path) => ({ data: readFileSync(path).toString("base64"), mimeType: "image/jpeg" }));
  for (const provider of providers) {
    const started = Date.now();
    const response = await fetch(`https://${region}-${project}.cloudfunctions.net/readReceipt`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ ...(images.length === 1 ? { image: images[0].data, mimeType: "image/jpeg" } : { images }), categories, ...(provider === "auto" ? {} : { provider }) }),
    });
    const body = await response.json().catch(() => ({}));
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n=== ${file} · ${provider} · HTTP ${response.status} · ${seconds} s`);
    if (body.code === "receipt_key") {
      console.log(`(${provider}: fără cheie configurată)`);
      summary.push(`${file} · ${provider}: fără cheie`);
      continue;
    }
    const fatal = provider === primary;
    if (!response.ok || !body.receipt) {
      console.log(JSON.stringify(body));
      summary.push(`${file} · ${provider}: eroare ${response.status}`);
      if (fatal) failures++;
      continue;
    }
    const { receipt } = body;
    const sum = Math.round(receipt.items.reduce((total, item) => total + item.amount, 0) * 100) / 100;
    console.log(`model: ${receipt.model || "?"} · magazin: ${receipt.store} · data: ${receipt.date} · total: ${receipt.total} · articole: ${sum} · încredere: ${receipt.confidence}`);
    console.log(`încercări: ${receipt.trail || "?"}${receipt.usage ? ` · tokeni ${receipt.usage.in} intrare / ${receipt.usage.out} ieșire · ~$${((receipt.usage.in * 0.3 + receipt.usage.out * 2.5) / 1e6).toFixed(5)}` : ""}`);
    if (body.quota) console.log(`cotă server: ${body.quota.plan} · ${body.quota.used}/${body.quota.limit} luna ${body.quota.month} · rămase ${body.quota.remaining ?? "nelimitat"} · aplicată: ${body.quota.enforced}`);
    console.log(`plăți: ${receipt.payments.map((payment) => `${payment.method} ${payment.amount}`).join(", ")}`);
    for (const item of receipt.items) console.log(`  ${item.amount.toFixed(2).padStart(7)}  ${item.discount ? `(−${item.discount}) ` : ""}${item.name} [${item.category}] ← ${item.rawName}`);
    const problems = [];
    if (Math.abs(receipt.total - expectedTotal) > 0.009) problems.push(`totalul ${receipt.total}, așteptat ${expectedTotal}`);
    if (Math.abs(sum - expectedTotal) > 0.05) problems.push(`articolele fac ${sum}, așteptat ${expectedTotal}`);
    for (const [pattern, category] of expectations[file] || []) {
      const item = receipt.items.find((entry) => pattern.test(`${entry.name} ${entry.rawName}`));
      if (!item) problems.push(`lipsește ${pattern}`);
      else if (item.category !== category) problems.push(`${item.name} la ${item.category}, nu la ${category}`);
    }
    for (const [pattern, count] of repeated[file] || []) {
      const found = receipt.items.filter((entry) => pattern.test(`${entry.name} ${entry.rawName}`)).length;
      if (found !== count) problems.push(`${pattern}: ${found} rânduri, așteptat ${count}`);
    }
    // Pe drumul din aplicație: 30 s de Gemini plus rezerva Claude; un furnizor anume trebuie să fie rapid.
    if (Number(seconds) > (provider === "auto" ? 50 : 30) + 10 * (images.length - 1)) problems.push(`prea lent: ${seconds} s`);
    if (provider === "auto" && receipt.model && !String(receipt.model).startsWith("gemini")) console.log(`⚠ a citit rezerva (${receipt.model}): Gemini n-a răspuns la timp`);
    if (problems.length) {
      if (fatal) failures++;
      console.log(`✗ ${problems.join("; ")}`);
      summary.push(`${file} · ${provider}: ✗ ${seconds} s · ${problems.join("; ")}`);
    } else {
      console.log("✓ citit corect");
      summary.push(`${file} · ${provider}: ✓ ${seconds} s`);
    }
  }
}
/** Ghidul și consultantul: aceeași funcție aiGuide; ledul din aplicație arată cine a răspuns. */
const guideUrl = `https://${region}-${project}.cloudfunctions.net/aiGuide`;
const guideChecks = [
  ["ghid", { messages: [{ role: "user", text: "Cum stau cu banii luna asta?" }], context: { today: "2026-10-08", language: "ro" } }, (body) => typeof body.reply === "string" && body.reply.length > 0],
  ["consultant", { mode: "consult", context: { language: "ro", today: "2026-10-08", month: { dayOfMonth: 8, daysInMonth: 31, income: 5200, expense: 1900 }, previousMonths: [{ month: "2026-09", income: 5200, expense: 4900 }, { month: "2026-08", income: 5200, expense: 5300 }], categories: [{ name: "Alimente", thisMonth: 900, monthlyAverage: 2100 }, { name: "Timp liber", thisMonth: 400, monthlyAverage: 600 }], envelopes: [], nextPayday: "2026-11-05", fixedMonthly: 1400, debts: [{ kind: "card", remaining: 3000, monthly: 300 }], goals: [], emergencyFund: { monthlySpending: 5000, saved: 2000, months: 0.4, target: 15000 }, upcomingEvents: [] } }, (body) => Boolean(body.report?.headline && body.report?.summary)],
];
for (const [name, payload, valid] of guideChecks) {
  const started = Date.now();
  const response = await fetch(guideUrl, { method: "POST", headers: { "content-type": "application/json", origin, authorization: `Bearer ${idToken}` }, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n=== ${name} · HTTP ${response.status} · ${seconds} s · răspuns de la ${body.source || "?"}`);
  console.log(JSON.stringify(body.report || body.reply || body).slice(0, 1200));
  if (!response.ok || !valid(body)) {
    failures++;
    summary.push(`${name}: ✗ HTTP ${response.status}`);
  } else {
    summary.push(`${name}: ✓ ${seconds} s · ${body.source}${body.source === "gemini" ? "" : " (Gemini n-a răspuns)"}`);
  }
}
console.log(`\n--- Rezumat ---\n${summary.join("\n")}`);
if (failures) {
  console.error(`\n${failures} verificări nu au ieșit cum trebuie.`);
  process.exit(1);
}
console.log("\nBonurile, ghidul și consultantul au răspuns corect.");
