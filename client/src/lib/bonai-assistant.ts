/**
 * Asistent BonAI: întrebarea devine o interogare structurată, iar cifrele le calculează codul,
 * din bonurile casei (locale/sincronizate). Nicio sumă nu vine de la model: dacă nu avem bonuri
 * care să răspundă, spunem asta.
 */
import { isoToday, type AppData } from "./finance-data";
import { monthInflation, productObservations, shrinkflationAlerts } from "./personal-inflation";
import { pantryFromReceipts } from "./pantry";
import { weeklyMenu } from "./weekly-menu";
import { savingsOpportunity } from "./shop-insights";
import { splitShoppingText } from "./shopping-list";
import { spendEntries } from "./quick-expense";
import { linesLabel, looseLabel, receiptsLabel } from "./i18n";
import { upcoming, upcomingTotal } from "./upcoming";
import { debtSummary } from "./debts-tracker";
import { liveWarranties } from "./warranties";
import { habitInsights } from "./habit-insights";

export type RoleId = "detective" | "prices" | "planner" | "chef" | "savings" | "help";
export type Screen = "scan" | "list" | "prices" | "pantry" | "menu";
export type Period = "today" | "yesterday" | "week" | "month" | "lastMonth" | "year" | "all";

export const ROLES: Array<{ id: RoleId; title: string; hint: string; examples: string[] }> = [
  { id: "detective", title: "Detectiv de bonuri", hint: "caută în bonuri și produse", examples: ["pe ce se duc banii luna asta?", "cât am dat pe cafea luna asta?", "ce plăți urmează?"] },
  { id: "prices", title: "Analist de prețuri", hint: "inflația ta, ce s-a scumpit", examples: ["ce s-a scumpit luna asta?", "am produse micșorate?"] },
  { id: "planner", title: "Planificator cumpărături", hint: "lista din stoc și obiceiuri", examples: ["ce îmi lipsește din casă?", "adaugă lapte, pâine și ouă"] },
  { id: "chef", title: "Chef economic", hint: "meniu din ce ai și ce e ieftin", examples: ["fă-mi meniul săptămânii"] },
  { id: "savings", title: "Consultant economii", hint: "unde poți da mai puțin", examples: ["unde pot economisi?", "ce sfat îmi dai?", "recapitulează luna"] },
  { id: "help", title: "Ajutor aplicație", hint: "cum faci un lucru în BonAI", examples: ["cum scanez un bon lung?", "cum invit partenerul?"] },
];

/** Interogarea structurată; aceeași formă o poate produce și modelul, codul o execută. */
export type AssistantQuery =
  | { type: "spend"; terms: string[]; period: Period; store?: string; label?: string }
  | { type: "cheapest"; terms: string[] }
  | { type: "priceChanges" }
  | { type: "shrinkflation" }
  | { type: "listSuggest" }
  | { type: "listAdd"; items: string[] }
  | { type: "menu" }
  | { type: "savings" }
  | { type: "recap"; period: Period }
  | { type: "breakdown"; period: Period }
  | { type: "payments" }
  | { type: "warranties" }
  | { type: "advice" }
  | { type: "howto"; topic: string };

export type AssistantAnswer = { text: string; actions: Array<{ label: string; screen: Screen }>; listAdd?: string[] };

const fold = (text: string) => text.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Grupe de produse: cuvântul întrebat → ce poate scrie pe bon. */
const GROUPS: Record<string, string[]> = {
  lactate: ["lapte", "iaurt", "branza", "unt", "smantana", "cascaval", "telemea", "chefir", "sana", "mozzarella", "kefir", "lactate"],
  cafea: ["cafea", "coffee", "espresso", "jacobs", "doncafe", "lavazza", "nescafe", "tchibo"],
  carne: ["carne", "piept", "pulpe", "porc", "vita", "pui", "mici", "carnati", "sunca", "salam"],
  legume: ["rosii", "castraveti", "cartofi", "ceapa", "ardei", "morcov", "varza", "salata", "legume"],
  fructe: ["mere", "banane", "portocale", "pere", "prune", "struguri", "lamai", "fructe"],
  dulciuri: ["ciocolata", "biscuiti", "napolitane", "bomboane", "kinder", "dulciuri", "prajitura"],
  bauturi: ["apa", "suc", "bere", "vin", "cola", "bauturi"],
  paine: ["paine", "chifle", "bagheta", "franzela"],
};

const STOP = new Set(["azi", "astazi", "ieri", "cat", "am", "dat", "pe", "luna", "asta", "aceasta", "saptamana", "anul", "unde", "cumparat", "cel", "mai", "ieftin", "cheltuit", "in", "la", "de", "si", "ce", "trecuta", "total", "bani", "lei", "pentru", "meu", "mea", "mele", "noastre", "pana", "acum", "cate", "ori", "an", "anul", "toate", "tot", "dau", "platit", "dintre"]);

function periodOf(text: string): Period {
  if (/\bazi\b|astazi/.test(text)) return "today";
  if (/\bieri\b/.test(text)) return "yesterday";
  if (/luna trecuta/.test(text)) return "lastMonth";
  if (/saptaman/.test(text)) return "week";
  if (/\ban(ul)?\b|anul asta/.test(text)) return "year";
  if (/luna|lunar/.test(text)) return "month";
  return "month";
}

const wordsOf = (text: string) => text.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

function termsOf(text: string): string[] {
  const words = wordsOf(text);
  return words.flatMap((w) => GROUPS[w] || [w.replace(/(ul|ului|ii|ile|le)$/, "")]).filter((w) => w.length > 2);
}

const STORES = /\bla (lidl|kaufland|mega|carrefour|auchan|profi|penny|selgros|metro|cora)\b/;

/**
 * Generatorul local de interogări (fără rețea). Întrebarea decide: cuvintele ei aleg răspunsul.
 * Rolul ales doar înclină o întrebare vagă (fără niciun cuvânt pe care să-l recunosc).
 */
export function parseQuery(raw: string, role: RoleId = "detective"): AssistantQuery {
  const text = fold(raw).trim();
  const add = /^(adauga|pune|baga|trece)\b\s*(pe lista|in lista)?\s*(.*)$/.exec(text);
  if (add && add[3]) return { type: "listAdd", items: splitShoppingText(raw.replace(/^\s*\S+\s*(pe listă|pe lista|în listă|in lista)?\s*/i, "").replace(/\s+și\s+|\s+si\s+/gi, ", ")) };
  if (/^cum\b|unde gasesc|ce face|ajutor/.test(text)) return { type: "howto", topic: text };
  if (/ieftin(?!it)/.test(text)) return { type: "cheapest", terms: termsOf(text) };
  if (/micsor|shrink|gramaj/.test(text)) return { type: "shrinkflation" };
  if (/scump|inflat|ieftinit|pret(uri)?\b/.test(text)) return { type: "priceChanges" };
  if (/meniu|gatesc|reteta|mancare|cina|pranz/.test(text)) return { type: "menu" };
  if (/lipseste|lipsesc|stoc|lista|ce (sa )?cumpar|terminat/.test(text)) return { type: "listSuggest" };
  if (/recapitul|rezumat|cum a fost (luna|saptamana)/.test(text)) return { type: "recap", period: periodOf(text) };
  if (/garanti|retur/.test(text)) return { type: "warranties" };
  if (/\bplat[aie]|\brat[aei]\b|rate\b|scaden|factur|abonament|datori|credit|imprumut|overdraft|banca/.test(text)) return { type: "payments" };
  // „Pe ce cheltui de obicei?”, „unde se duc banii?”, „la ce dau cel mai mult?”
  if (/pe ce|la ce|unde se duc|se duc banii|obicei|categori|(cheltui|dau|platesc)\w* (cel )?mai mult|cel mai mult/.test(text)) return { type: "breakdown", period: /luna|saptaman|\ban\b|anul|azi|ieri/.test(text) ? periodOf(text) : "month" };
  if (/econom|alternativ|reduc|mai putin/.test(text)) return { type: "savings" };
  if (/sfat|recomand|observ|ce (ar trebui|sa fac)|ajuta-ma|cum stau/.test(text)) return { type: "advice" };
  const store = STORES.exec(text)?.[1];
  const rest = text.replace(STORES, "");
  // Cuvintele care nu numesc un produs („idei”, „ceva”, „propune-mi”) nu fac din întrebare una de sumă.
  const terms = termsOf(rest).filter((word) => !/^(idei|idee|ceva|propun|sugest|spune|zi|vreau|poti|te rog|rog|salut|buna|ajut)/.test(word));
  // Întrebare vagă („idei”, „ceva”): rolul ales spune ce vrea omul.
  if (!terms.length && !store && !/\bcat\b|cheltu|total/.test(text)) {
    const byRole: Partial<Record<RoleId, AssistantQuery>> = { prices: { type: "priceChanges" }, planner: { type: "listSuggest" }, chef: { type: "menu" }, savings: { type: "savings" }, help: { type: "howto", topic: text } };
    if (byRole[role]) return byRole[role]!;
  }
  if (role === "help" && !/\bcat\b|cheltu/.test(text)) return { type: "howto", topic: text };
  return { type: "spend", label: wordsOf(rest).join(" ") || undefined, terms, period: periodOf(text), store };
}

const lei = (value: number) => `${value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0lei`;
const monthKey = (iso: string) => iso.slice(0, 7);

const dayBefore = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

function inPeriod(date: string, period: Period, today: string): boolean {
  if (period === "all") return true;
  if (period === "today") return date === today;
  if (period === "yesterday") return date === dayBefore(today);
  if (period === "year") return date.slice(0, 4) === today.slice(0, 4);
  if (period === "month") return monthKey(date) === monthKey(today);
  if (period === "lastMonth") { const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return monthKey(date) === d.toISOString().slice(0, 7); }
  const diff = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000;
  return diff >= 0 && diff < 7;
}

const PERIOD_TEXT: Record<Period, string> = { today: "azi", yesterday: "ieri", week: "în ultimele 7 zile", month: "luna asta", lastMonth: "luna trecută", year: "anul acesta", all: "de când scanezi" };

const matches = (label: string, terms: string[]) => { const l = fold(label); return terms.some((term) => l.includes(term)); };

const HOWTO: Array<[RegExp, string, Screen?]> = [
  [/lung|mai multe poze|captur/, "Pentru un bon lung: Scanează → Galerie și alege până la 6 poze sau capturi, în ordine. Le citesc ca pe un singur bon.", "scan"],
  [/scan|bon/, "Apasă butonul din mijloc, Scanează, și fotografiază bonul drept, pe o suprafață închisă la culoare. Verifici rândurile, apoi Salvează bonul.", "scan"],
  [/invit|partener|familie|membr/, "Cont → Familie și membri → Invită. Partenerul scanează codul și vedeți aceleași bonuri și aceeași listă.", undefined],
  [/list/, "Cumpărături → Listă: scrii produsele sau mi le spui mie („adaugă lapte și ouă”). Lista e comună familiei.", "list"],
  [/garant|retur/, "Cont → Garanții și retururi: pui bonul și primești o amintire înainte de termenul de retur.", undefined],
  [/export|date|sterg/, "Cont → Setări → Date și confidențialitate: export, copii de siguranță și datele din versiunea veche.", undefined],
  [/tema|noapte|luminos/, "Cont → Aspect: Luminos, Noapte sau Automat (după telefon).", undefined],
];

/** Execută interogarea pe datele casei. Toate sumele vin din bonuri. */
export function runQuery(query: AssistantQuery, data: AppData, today = isoToday()): AssistantAnswer {
  const receipts = data.receipts || [];
  if (query.type === "listAdd") {
    if (!query.items.length) return { text: "Spune-mi ce să pun pe listă, de exemplu „adaugă lapte și ouă”.", actions: [] };
    return { text: `Am pus pe listă: ${query.items.join(", ")}.`, actions: [{ label: "Vezi lista", screen: "list" }], listAdd: query.items };
  }
  if (query.type === "payments") {
    const next = upcoming(data, today, 30).filter((item) => item.amount && item.kind !== "return" && item.kind !== "warranty");
    const debts = debtSummary(data.debts || []);
    if (!next.length && !debts.count) return { text: "Nu am plăți notate. Adaugă ratele în Cont → Datorii și abonamentele sau facturile în Cont; apoi îți spun ce vine și când.", actions: [] };
    const when = (days: number) => (days === 0 ? "azi" : days === 1 ? "mâine" : `în ${days} zile`);
    const list = next.slice(0, 4).map((item) => `${item.name} ${item.estimate ? "~" : ""}${lei(item.amount || 0)} ${when(item.days)}`).join("; ");
    return { text: `${next.length ? `În următoarele 30 de zile ai de plătit ${lei(upcomingTotal(next))}: ${list}${next.length > 4 ? " și altele" : ""}.` : "Nicio plată în următoarele 30 de zile."}${debts.count ? ` Datorii rămase: ${lei(debts.remaining)}, ${lei(debts.monthly)} pe lună.` : ""}`, actions: [] };
  }
  if (query.type === "warranties") {
    const live = liveWarranties(data, today);
    if (!live.length) return { text: "Nu ai garanții salvate. După ce scanezi bonul unui produs electronic sau electrocasnic îți propun garanția; o poți adăuga și din Cont → Garanții.", actions: [{ label: "Scanează", screen: "scan" }] };
    const soon = live.filter(({ status }) => (status.returnDaysLeft ?? -1) >= 0 || (status.daysLeft ?? 9999) <= 60);
    const text = (soon.length ? soon : live).slice(0, 3).map(({ warranty, status }) => (status.returnDaysLeft ?? -1) >= 0 ? `${warranty.name}: retur încă ${status.returnDaysLeft} zile` : `${warranty.name}: garanție până pe ${(status.until || "").split("-").reverse().join(".")}`).join("; ");
    return { text: `Ai ${live.length} ${live.length === 1 ? "garanție" : "garanții"} active. ${text}.`, actions: [] };
  }
  if (query.type === "howto") {
    const hit = HOWTO.find(([re]) => re.test(query.topic));
    return { text: hit ? hit[1] : "Te pot ajuta cu scanarea, lista, prețurile, stocul, meniul și familia. Întreabă-mă „cum …”.", actions: hit?.[2] ? [{ label: "Deschide", screen: hit[2] }] : [] };
  }
  const entries = spendEntries(data);
  const realIds = new Set(receipts.map((receipt) => receipt.id));
  if (!entries.length) return { text: "Încă nu am bonuri din care să calculez. Scanează primul bon și îți răspund cu cifrele tale.", actions: [{ label: "Scanează", screen: "scan" }] };
  if (query.type === "spend") {
    let total = 0; let count = 0; let loose = 0; const stores = new Map<string, number>();
    // Totalul include și cheltuielile notate fără bon (taxi, cafea); produsele se caută doar pe bonuri.
    for (const receipt of query.terms.length ? receipts : entries) {
      if (!inPeriod(receipt.date, query.period, today)) continue;
      if (query.store && !fold(receipt.vendor).includes(query.store)) continue;
      const lines = receipt.lines?.length ? receipt.lines : [];
      if (!query.terms.length) { total += receipt.amount; if (realIds.has(receipt.id)) count++; else loose++; stores.set(receipt.vendor, (stores.get(receipt.vendor) || 0) + receipt.amount); continue; }
      for (const line of lines) {
        if (!(line.amount > 0) || !(matches(line.label || "", query.terms) || matches(line.category || "", query.terms))) continue;
        total += line.amount; count++; stores.set(receipt.vendor, (stores.get(receipt.vendor) || 0) + line.amount);
      }
    }
    const what = query.terms.length ? `pe ${query.label || query.terms.slice(0, 3).join(", ")}` : "în total";
    if (!count && !loose) return { text: query.terms.length ? `Nu găsesc nimic ${what} ${PERIOD_TEXT[query.period]} în bonurile tale.` : `${PERIOD_TEXT[query.period][0].toUpperCase()}${PERIOD_TEXT[query.period].slice(1)} nu ai nicio cheltuială notată.`, actions: [{ label: "Prețuri", screen: "prices" }] };
    const top = Array.from(stores.entries()).sort((a, b) => b[1] - a[1])[0];
    return { text: `Ai dat ${lei(Math.round(total * 100) / 100)} ${what} ${PERIOD_TEXT[query.period]} (${query.terms.length ? linesLabel(count) : [count ? receiptsLabel(count) : "", loose ? looseLabel(loose) : ""].filter(Boolean).join(" și ")}). Cel mai mult la ${top[0]}: ${lei(Math.round(top[1] * 100) / 100)}.`, actions: [{ label: "Prețuri", screen: "prices" }] };
  }
  const observations = productObservations(data);
  if (query.type === "breakdown") {
    const scoped = entries.filter((entry) => inPeriod(entry.date, query.period, today));
    if (!scoped.length) return { text: `Nu am cheltuieli ${PERIOD_TEXT[query.period]}. Încearcă „pe ce se duc banii anul ăsta?”.`, actions: [{ label: "Scanează", screen: "scan" }] };
    const cats = new Map<string, number>(); const stores = new Map<string, number>(); const products = new Map<string, { label: string; amount: number }>();
    for (const entry of scoped) {
      const lines = entry.lines?.length ? entry.lines : [{ category: entry.category, amount: entry.amount }];
      for (const line of lines) cats.set(line.category, (cats.get(line.category) || 0) + line.amount);
      stores.set(entry.vendor, (stores.get(entry.vendor) || 0) + entry.amount);
    }
    for (const item of observations) if (inPeriod(item.date, query.period, today)) { const row = products.get(item.key) || { label: item.label, amount: 0 }; row.amount += item.paid; products.set(item.key, row); }
    const total = scoped.reduce((sum, entry) => sum + entry.amount, 0);
    const pct = (value: number) => `${Math.round((value / total) * 100)}%`;
    const topCats = Array.from(cats.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, amount]) => `${name} ${lei(Math.round(amount * 100) / 100)} (${pct(amount)})`).join(", ");
    const topProducts = Array.from(products.values()).sort((a, b) => b.amount - a.amount).slice(0, 3).map((row) => `${row.label} ${lei(Math.round(row.amount * 100) / 100)}`).join(", ");
    const topStore = Array.from(stores.entries()).sort((a, b) => b[1] - a[1])[0];
    return { text: `${PERIOD_TEXT[query.period][0].toUpperCase()}${PERIOD_TEXT[query.period].slice(1)} ai dat ${lei(Math.round(total * 100) / 100)}. Cei mai mulți bani merg pe ${topCats}.${topProducts ? ` Produsele cu cei mai mulți bani: ${topProducts}.` : ""} Cei mai mulți bani i-ai lăsat la ${topStore[0]}: ${lei(Math.round(topStore[1] * 100) / 100)}.`, actions: [{ label: "Prețuri", screen: "prices" }] };
  }
  if (query.type === "advice") {
    const tips = habitInsights(data, today).slice(0, 2);
    if (!tips.length) return { text: "Încă nu văd nimic sigur de spus. Cu mai multe bonuri îți arăt obiceiurile tale: ziua în care cheltui cel mai mult, cumpărăturile mici, ce crește.", actions: [{ label: "Scanează", screen: "scan" }] };
    return { text: tips.map((tip) => `${tip.title}. ${tip.body}`).join(" "), actions: [{ label: "Prețuri", screen: "prices" }] };
  }
  if (query.type === "cheapest") {
    const hits = observations.filter((o) => query.terms.length && matches(o.label, query.terms));
    if (!hits.length) return { text: "Nu am încă prețuri pentru produsul ăsta în bonurile tale.", actions: [{ label: "Prețuri", screen: "prices" }] };
    const best = [...hits].sort((a, b) => a.price - b.price)[0];
    const unit = best.per === "buc" ? "bucata" : best.per;
    return { text: `Cel mai ieftin: ${best.label} la ${best.vendor}, ${lei(best.price)}/${unit} (${best.date.split("-").reverse().join(".")}).`, actions: [{ label: "Istoricul prețului", screen: "prices" }] };
  }
  if (query.type === "priceChanges") {
    const month = monthInflation(data, today.slice(0, 7));
    if (!month) return { text: "Am nevoie de produse cumpărate și luna asta, și în lunile dinainte, ca să-ți calculez inflația.", actions: [{ label: "Prețuri", screen: "prices" }] };
    const up = month.risers.slice(0, 3).map((r) => `${r.label} +${r.percent.toLocaleString("ro-RO")}%`).join(", ");
    const down = month.fallers.slice(0, 3).map((r) => `${r.label} ${r.percent.toLocaleString("ro-RO")}%`).join(", ");
    return { text: `Inflația ta luna asta: ${month.percent.toLocaleString("ro-RO")}% pe ${month.products} produse.${up ? ` Scumpite: ${up}.` : ""}${down ? ` Ieftinite: ${down}.` : ""}`, actions: [{ label: "Prețuri", screen: "prices" }] };
  }
  if (query.type === "shrinkflation") {
    const alerts = shrinkflationAlerts(data, today);
    if (!alerts.length) return { text: "N-am găsit produse micșorate în bonurile tale din ultimul an.", actions: [{ label: "Prețuri", screen: "prices" }] };
    return { text: `Micșorate: ${alerts.slice(0, 3).map((a) => `${a.label} (${a.fromSize}→${a.toSize}, +${a.perUnitPercent.toLocaleString("ro-RO")}% pe ${a.per})`).join("; ")}.`, actions: [{ label: "Prețuri", screen: "prices" }] };
  }
  if (query.type === "listSuggest") {
    const due = pantryFromReceipts(observations, today).filter((item) => item.state !== "ok").slice(0, 8).map((item) => item.label);
    if (!due.length) return { text: "Din bonuri, stocul casei pare în regulă. Spune-mi ce vrei să adaug.", actions: [{ label: "Stoc", screen: "pantry" }] };
    return { text: `Pe terminate, după cât de des le cumperi: ${due.join(", ")}. Le-am pus pe listă.`, actions: [{ label: "Vezi lista", screen: "list" }, { label: "Stoc", screen: "pantry" }], listAdd: due };
  }
  if (query.type === "menu") {
    const menu = weeklyMenu(observations, today);
    if (!menu.length) return { text: "Am nevoie de mai multe bonuri cu alimente ca să-ți propun un meniu.", actions: [{ label: "Meniu", screen: "menu" }] };
    return { text: `Meniul săptămânii: ${menu.map((d) => `${d.recipe.name}${d.knownCost > 0 ? ` (~${lei(d.knownCost)}${d.unknown ? "+" : ""})` : ""}`).join("; ")}. Costurile sunt din prețurile tale.`, actions: [{ label: "Meniu", screen: "menu" }] };
  }
  if (query.type === "savings") {
    const save = savingsOpportunity(data, today);
    if (!save.items.length) return { text: "În ultimele 30 de zile ai luat produsele la cele mai bune prețuri pe care le-ai plătit. Bravo!", actions: [{ label: "Prețuri", screen: "prices" }] };
    return { text: `Ai fi dat cu ${lei(save.total)} mai puțin: ${save.items.slice(0, 3).map((s) => `${s.label} la ${s.cheaperVendor} în loc de ${s.vendor} (−${lei(s.saved)})`).join("; ")}.`, actions: [{ label: "Prețuri", screen: "prices" }] };
  }
  // recap
  const scoped = receipts.filter((r) => inPeriod(r.date, query.period, today));
  const total = Math.round(scoped.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return { text: scoped.length ? `${PERIOD_TEXT[query.period][0].toUpperCase()}${PERIOD_TEXT[query.period].slice(1)}: ${scoped.length} bonuri, ${lei(total)}.` : `Nu am bonuri ${PERIOD_TEXT[query.period]}.`, actions: [{ label: "Prețuri", screen: "prices" }] };
}

/** Mesaje lunare pe plan (ce poți întreba asistentul). */
export const ASSISTANT_CAP: Record<"free" | "pro" | "familie", number> = { free: 30, pro: 300, familie: 600 };
const CAP_KEY = "bonai:assistant-usage-v1";

export function assistantUsage(month = isoToday().slice(0, 7), store: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): number {
  try { const raw = JSON.parse(store?.getItem(CAP_KEY) || "{}") as { month?: string; used?: number }; return raw.month === month ? Math.max(0, raw.used || 0) : 0; } catch { return 0; }
}

export function recordAssistantUse(month = isoToday().slice(0, 7), store: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage): number {
  const used = assistantUsage(month, store) + 1;
  try { store?.setItem(CAP_KEY, JSON.stringify({ month, used })); } catch { /* fără stocare: numărăm doar în sesiune */ }
  return used;
}
