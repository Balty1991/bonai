/**
 * Facturile notate de mână devin plăți lunare dintr-o atingere. Alin a scris pe 14 oct, una câte
 * una, telefon, lumină, apă, grădiniță, abonamente; fără plăți lunare, luna viitoare le scria
 * iar de la zero și nu erau puse deoparte din salariu.
 *
 * Utilitățile (lumină, apă, gaz, întreținere) sunt variabile: suma e o estimare, iar cea de pe
 * factură se scrie la plată. Plata deja notată luna asta se leagă de plata lunară nou creată,
 * ca să nu mai apară încă o dată „de plătit”.
 *
 * Dobânda de overdraft nu e o datorie care se stinge: rămâne la Datorii, cu plată lunară
 * aproximativă și fără dată de final.
 */
import { addIsoDays, commitLedgerEntry, foldRomanian, isBalanceAdjustment, isoToday, matchingAllocationsForExpense, newId, type AppData, type RecurringPayment, type Transaction } from "./finance-data";
import { t } from "./i18n";

export const BILL_CATEGORIES = ["Casă & facturi", "Abonamente", "Educație", "Utilități", "Telefon & internet"];
const VARIABLE = /lumin|curent|energie|electric|enel|e\.?on|engie|hidroelectrica|\bapa\b|\bapă\b|apa nova|aquatim|gaz|intretinere|întreținere|termo|caldur|căldur|salubr|gunoi/;
const NOT_A_BILL = /^cump[aă]r[aă]turi\b|^mutat\b|corec[tț]ie|^rat[aă]\b/;

export type BillCandidate = { txId: string; name: string; amount: number; category: string; sourceId: string; memberId: string; dueDay: number; variable: boolean };

/** Numele scurt: „Taxa întreținere card · Taxa întreținere card” devine „Taxa întreținere card”. */
const cleanName = (title: string) => title.split(" · ")[0].trim().replace(/\s+/g, " ").slice(0, 48);

const coveredBy = (data: AppData, name: string) => {
  const folded = foldRomanian(name);
  return data.recurring.some((item) => {
    const other = foldRomanian(item.name.trim());
    return other.length >= 3 && (folded.includes(other) || other.includes(folded));
  });
};

/** Facturile din ultimele 45 de zile care nu sunt încă plăți lunare. */
export function billCandidates(data: AppData, asOf = isoToday()): BillCandidate[] {
  const since = addIsoDays(asOf, -45);
  const seen = new Set<string>();
  const out: BillCandidate[] = [];
  const recent = [...data.transactions].filter((item) => item.date >= since && item.date <= asOf).sort((a, b) => b.date.localeCompare(a.date));
  for (const item of recent) {
    if (item.kind !== "expense" || item.recurringId || item.debtId || item.transferId || item.receiptId || isBalanceAdjustment(item)) continue;
    if (!BILL_CATEGORIES.includes(item.category)) continue;
    const name = cleanName(item.title || "");
    const folded = foldRomanian(name);
    if (name.length < 3 || NOT_A_BILL.test(folded) || seen.has(folded) || coveredBy(data, name)) continue;
    seen.add(folded);
    out.push({ txId: item.id, name, amount: item.amount, category: item.category, sourceId: item.sourceId || "", memberId: item.memberId || data.settings.members[0]?.id || "", dueDay: Number(item.date.slice(8, 10)) || 1, variable: VARIABLE.test(folded) && !/\bcard\b|\bcont\b|\bbanc/.test(folded) });
  }
  return out;
}

/** Datoriile care sunt de fapt un cost lunar fără sfârșit: dobânda de overdraft. */
export const overdraftDebts = (data: AppData) => data.debts.filter((debt) => !debt.openEnded && /overdraft|descoperit|dob[aâ]nd/.test(foldRomanian(debt.name)) && debt.monthly > 0);

export type BillPick = BillCandidate & { keep: boolean };

/** Creează plățile lunare alese și leagă de ele plata deja notată luna asta. */
export function applyBills(data: AppData, picks: BillPick[]): AppData {
  const now = new Date().toISOString();
  const chosen = picks.filter((pick) => pick.keep && pick.amount > 0 && pick.sourceId);
  if (!chosen.length) return data;
  const created = chosen.map((pick) => ({ pick, item: { id: newId("recurring"), name: pick.name, amount: Math.round(pick.amount * 100) / 100, category: pick.category, sourceId: pick.sourceId, memberId: pick.memberId, dueDay: Math.min(28, Math.max(1, pick.dueDay)), active: true, ...(pick.variable ? { variable: true } : {}), updatedAt: now } satisfies RecurringPayment }));
  const link = new Map(created.map(({ pick, item }) => [pick.txId, item.id]));
  return {
    ...data,
    recurring: [...data.recurring, ...created.map(({ item }) => item)],
    transactions: data.transactions.map((item) => link.has(item.id) ? { ...item, recurringId: link.get(item.id), updatedAt: now } : item),
  };
}

/**
 * Dobânda de overdraft rămâne la Datorii, urmărită: soldul e cât folosești din overdraft, iar
 * suma lunară e aproximativă și fără dată de final. Plata lunară nu scade soldul și nu mai
 * apare „scapi de ea în…”; soldul îl schimbi din Editează când se modifică.
 */
export const markOpenEnded = (data: AppData, debtId: string): AppData => ({
  ...data,
  debts: data.debts.map((debt) => debt.id === debtId ? { ...debt, openEnded: true, endDate: undefined, updatedAt: new Date().toISOString() } : debt),
});

/** Factura a venit, dar nu e plătită încă: suma estimată devine cea de pe factură. */
export const setRecurringAmount = (data: AppData, id: string, amount: number): AppData => ({
  ...data,
  recurring: data.recurring.map((item) => item.id === id ? { ...item, amount: Math.round(amount * 100) / 100, updatedAt: new Date().toISOString() } : item),
});

/**
 * Încă o factură în aceeași lună (la lumină vin uneori două): plata se notează pe aceeași plată
 * lunară, fără ca aplicația s-o ia drept dublură. Merge doar în plicul care are factura drept
 * categorie principală, ca la confirmarea obișnuită.
 */
export function addExtraBill(data: AppData, recurringId: string, amount: number, date = isoToday()): AppData | undefined {
  const item = data.recurring.find((entry) => entry.id === recurringId);
  const source = item && data.settings.paymentSources.find((entry) => entry.id === item.sourceId);
  const member = item && (data.settings.members.find((entry) => entry.id === item.memberId) || data.settings.members[0]);
  const value = Math.round(amount * 100) / 100;
  if (!item || !source || !member || !(value > 0)) return undefined;
  const now = new Date().toISOString();
  const envelope = matchingAllocationsForExpense(data, { category: item.category, memberId: member.id, sourceId: source.id }).find((allocation) => allocation.category === item.category);
  const transaction: Transaction = { id: newId("recurring-tx"), recurringId: item.id, title: t("{name} · încă o factură", { name: item.name }), amount: value, kind: "expense", category: item.category, sourceId: source.id, source: source.name, memberId: member.id, person: member.name, date, allocationId: envelope?.id || "outside", outsideChosen: envelope ? undefined : true, createdAt: now, updatedAt: now };
  return commitLedgerEntry(data, transaction);
}
