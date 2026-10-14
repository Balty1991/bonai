/**
 * Verificarea soldului: singura întrebare care ține aplicația onestă.
 *
 * O aplicație de plicuri moare mereu la fel — în luna a treia cifra din ecran nu mai
 * seamănă cu cea din card, fiindcă s-au uitat niște cumpărături cu cash. Omul o deschide,
 * vede o minciună politicoasă și o închide la loc.
 *
 * Nimic din aplicație nu întreba până acum „cât ai de fapt?”. Aici e întrebarea, pusă rar
 * (o dată pe tranșă) și doar pentru locurile unde chiar se mișcă bani. Răspunsul nu
 * rescrie soldul pe ascuns: diferența intră în registru ca mișcare, cu ziua ei, ca omul
 * să vadă mai târziu de ce nu se potriveau cifrele.
 */
import {
  isBalanceAdjustment,
  isoToday,
  newId,
  planEndDate,
  resolveExpenseAllocationId,
  sourceBalance,
  type AppData,
  type PaymentSource,
  type Transaction,
} from "./finance-data";
import { t } from "./i18n";

const CHECK_KEY = "buget-familie:last-balance-check";
const SHOWN_KEY = "buget-familie:balance-check-shown";
/** Întrebarea ignorată atâtea zile se retrage singură, ca „Mai târziu” (stătea 11 zile pe Astăzi). */
const ZILE_AFISATA = 3;
/** O tranșă are șapte zile; mai des de atât, întrebarea devine zgomot. */
const ZILE_INTRE_VERIFICARI = 7;
/** Sub atâtea mișcări, registrul e prea tânăr ca să fi apucat să se abată de la realitate. */
const MISCARI_MINIME = 4;

export type BalanceCheckRow = { id: string; name: string; kind: PaymentSource["kind"]; balance: number };
export type BalanceCheckPrompt = { due: boolean; why: string; rows: BalanceCheckRow[]; /** N-a mai notat nimic de câteva zile: diferența e, cel mai probabil, cumpărături nenotate. */ gap?: number };
/** Ce înseamnă diferența dintre bancă și aplicație. */
export type BalanceMeaning = "correction" | "unlogged" | "opening";

/** După atâtea zile fără nicio cheltuială notată, întrebarea vine fără să aștepte săptămâna. */
const ZILE_FARA_NOTARI = 3;

/** Câte zile au trecut de la ultima cheltuială notată (corecțiile și mutările nu contează). */
export function daysWithoutEntries(data: AppData, today = isoToday()): number {
  const last = data.transactions.reduce((latest, item) => {
    if (item.kind !== "expense" || isBalanceAdjustment(item)) return latest;
    const day = (item.createdAt || "").slice(0, 10) || item.date;
    return day > latest ? day : latest;
  }, "");
  return last ? zile(last, today) : 0;
}

const zile = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);

/** Locurile unde chiar se mișcă bani: sursele planului, iar dacă planul tace, cele cu activitate. */
export function balanceCheckRows(data: AppData): BalanceCheckRow[] {
  const plan = data.settings.salaryPlan;
  const folosite = new Set([
    ...(plan.sourceIds || []),
    ...data.transactions.slice(0, 200).map((item) => item.sourceId || ""),
  ]);
  return data.settings.paymentSources
    .filter((item) => folosite.has(item.id) || item.openingBalance > 0)
    // Bonurile de masă nu se verifică pe card: soldul lor se vede pe bon, nu în bancă.
    // Dar pe minus nu pot fi: atunci se întreabă cât e de fapt pe card.
    .filter((item) => item.kind !== "meal" || sourceBalance(data, item.id) < -0.005)
    .map((item) => ({ id: item.id, name: item.name, kind: item.kind, balance: Math.round(sourceBalance(data, item.id) * 100) / 100 }))
    // Sursa pe minus se întreabă prima.
    .sort((left, right) => Number(left.balance >= 0) - Number(right.balance >= 0))
    .slice(0, 4);
}

/**
 * Se cuvine întrebat acum? Prima dată abia după ce registrul are ce să piardă, apoi o dată
 * la șapte zile — sau imediat ce începe un ciclu nou, fiindcă atunci se compară cel mai ușor.
 */
export function balanceCheckDue(data: AppData, lastCheck: string | null, today = isoToday()): BalanceCheckPrompt {
  const rows = balanceCheckRows(data);
  const gol = { due: false, why: "", rows };
  // O sursă pe minus (tichete sau cash de la 0) nu așteaptă verificarea săptămânală.
  const minus = rows.find((row) => row.balance < -0.005);
  if (minus && lastCheck !== today) return { due: true, why: t("„{name}” a ajuns pe minus. Spune cât ai de fapt și potrivesc soldul.", { name: minus.name }), rows };
  if (!rows.length || data.transactions.length < MISCARI_MINIME) return gol;
  // „Am lipsit câteva zile”: o singură întrebare pe card, în loc să refaci zilele din memorie.
  const gap = daysWithoutEntries(data, today);
  if (gap >= ZILE_FARA_NOTARI && (!lastCheck || zile(lastCheck, today) >= ZILE_FARA_NOTARI)) return { due: true, gap, why: t("N-ai mai notat nimic de {days} zile. Spune cât arată banca; ce lipsește trec la cumpărături nenotate.", { days: String(gap) }), rows };
  const plan = data.settings.salaryPlan;
  if (!plan.periodStart || !planEndDate(plan)) return gol;
  if (!lastCheck) return { due: true, why: t("Prima verificare: potrivim cifrele cu realitatea."), rows };
  const trecute = zile(lastCheck, today);
  if (trecute < 0) return gol;
  if (lastCheck < plan.periodStart && today >= plan.periodStart) {
    return { due: true, why: t("Ciclu nou — e cel mai ușor moment să potrivim cifrele."), rows };
  }
  if (trecute >= ZILE_INTRE_VERIFICARI) {
    return { due: true, why: t("Au trecut {days} zile de la ultima verificare.", { days: String(trecute) }), rows };
  }
  return gol;
}

/**
 * Cât spune omul că are. Se adaugă doar diferența, deci soldul ajunge exact la suma spusă, iar
 * a doua declarație a aceleiași sume nu mai scrie nimic. Diferența poate însemna trei lucruri:
 * - „correction”: o corecție de sold, care nu apare în analiză (ca până acum);
 * - „unlogged”: cumpărături făcute și nenotate în zilele lipsă; intră ca cheltuială la Alimente,
 *   deci în plicul de cumpărături și în analiză;
 * - „opening”: soldul de pornire era greșit; se îndreaptă el, fără nicio mișcare în registru
 *   (în backup-ul din 14 oct erau 8 corecții de sold doar pentru asta).
 */
export function applyDeclaredBalance(data: AppData, sourceId: string, amount: number, today = isoToday(), meaning: BalanceMeaning = "correction"): AppData {
  const target = data.settings.paymentSources.find((item) => item.id === sourceId);
  if (!target || !Number.isFinite(amount) || amount < 0) return data;
  const diferenta = Math.round((amount - sourceBalance(data, sourceId)) * 100) / 100;
  if (Math.abs(diferenta) < 0.005) return data;
  const now = new Date().toISOString();
  if (meaning === "opening" && !target.currency) {
    return { ...data, settings: { ...data.settings, paymentSources: data.settings.paymentSources.map((item) => item.id === sourceId ? { ...item, openingBalance: Math.round((item.openingBalance + diferenta) * 100) / 100, updatedAt: now } : item) } };
  }
  const urcare = diferenta > 0;
  const persoana = data.settings.members.find((item) => item.id === target.memberId) || data.settings.members[0];
  if (meaning === "unlogged" && !urcare) {
    const cheltuiala: Transaction = {
      id: newId("unlogged"),
      title: t("Cumpărături nenotate"),
      amount: Math.abs(diferenta),
      kind: "expense",
      category: "Alimente",
      sourceId: target.id,
      source: target.name,
      memberId: persoana?.id,
      person: persoana?.name || "",
      date: today,
      allocationId: resolveExpenseAllocationId(data, { category: "Alimente", memberId: persoana?.id, sourceId: target.id }),
      note: t("Diferența față de bancă după câteva zile fără notări."),
      createdAt: now,
    };
    return { ...data, transactions: [cheltuiala, ...data.transactions] };
  }
  const miscare: Transaction = {
    id: newId("balance-check"),
    title: t("Corecție de sold"),
    amount: Math.abs(diferenta),
    kind: urcare ? "income" : "expense",
    adjustment: true,
    category: urcare ? "Venit" : "Altele",
    sourceId: target.id,
    source: target.name,
    memberId: persoana?.id,
    person: persoana?.name || "",
    date: today,
    allocationId: urcare ? undefined : "outside",
    note: t("Sold verificat — diferența față de cât vedea aplicația."),
    createdAt: now,
  };
  return { ...data, transactions: [miscare, ...data.transactions] };
}

/* ------------------------------------------------ când am întrebat ultima oară */

export function readLastBalanceCheck(): string | null {
  try {
    const raw = window.localStorage.getItem(CHECK_KEY);
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Notează prima zi în care întrebarea a fost pe ecran. Dacă a stat ZILE_AFISATA zile fără
 * răspuns, o închidem ca „Mai târziu”; revine la următoarea verificare săptămânală.
 * Întoarce true când a fost retrasă acum.
 */
export function retireIgnoredBalanceCheck(today = isoToday()): boolean {
  try {
    const shown = window.localStorage.getItem(SHOWN_KEY);
    if (!shown || !/^\d{4}-\d{2}-\d{2}$/.test(shown)) {
      window.localStorage.setItem(SHOWN_KEY, today);
      return false;
    }
    if (zile(shown, today) < ZILE_AFISATA) return false;
    markBalanceChecked(today);
    return true;
  } catch {
    return false;
  }
}

export function markBalanceChecked(today = isoToday()): void {
  try {
    window.localStorage.removeItem(SHOWN_KEY);
    window.localStorage.setItem(CHECK_KEY, today);
  } catch {
    // Fără localStorage întrebarea revine la următoarea deschidere; nu e o pagubă.
  }
}
