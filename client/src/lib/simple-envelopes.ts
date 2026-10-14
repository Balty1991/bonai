/**
 * „Plicuri mai simple”: puține plicuri care acoperă tot ce cumperi, după ritmul lui Alin
 * (14 oct): salariile pe 10, ratele și facturile puse deoparte singure, apoi doar
 * Cumpărături (~600 pe săptămână), Copil (~500 pe lună), Taxi și Altele (~150 pe lună).
 *
 * Plicul devine o limită a familiei, nu o pușculiță pe un card: scade din el plata făcută de oricine, cu orice card,
 * bonuri sau cash („din orice card”), fără întrebarea „din plic sau din nerepartizat”. Cardul
 * arată în continuare unde sunt banii; plicul arată pentru ce. Facturile și ratele nu au plic:
 * se pun deoparte singure, la Scadențe.
 *
 * Tot aici se corectează tipul surselor de bonuri trecute drept card („Card de bunuri Angi”,
 * „Voucher SGR”): bonurile se văd separat în sold și nu se amestecă cu banii de pe card.
 */
import { foldRomanian, isBalanceAdjustment, newId, type AppData, type BudgetAllocation, type PaymentKind, type PaymentSource } from "./finance-data";
import { t } from "./i18n";

/** Tot ce iei din magazin pentru casă. */
export const SHOPPING_CATEGORIES = ["Alimente", "Dulciuri", "Băuturi", "Apă", "SGR", "Sacoșe"];
/** Ce e pentru copil: scutece, șervețele, lapte praf. Se ia rar și mult, deci plic lunar. */
export const CHILD_CATEGORIES = ["Consumabile copil"];
/** Ce nu e cumpărătură zilnică, factură sau rată. */
export const OTHER_CATEGORIES = ["Altele", "Haine", "Sănătate", "Timp liber"];

/** Sursele cu nume de bonuri sau voucher, dar trecute drept card obișnuit. */
export function mistypedSources(data: AppData): Array<{ source: PaymentSource; kind: PaymentKind }> {
  return data.settings.paymentSources.flatMap((source): Array<{ source: PaymentSource; kind: PaymentKind }> => {
    if (source.kind !== "card") return [];
    const name = foldRomanian(source.name);
    if (/voucher|\bsgr\b/.test(name)) return [{ source, kind: "voucher" }];
    if (/\bbon(uri)?\b|tichet|bunuri|meal|edenred|pluxee|up ro/.test(name)) return [{ source, kind: "meal" }];
    return [];
  });
}

export type SimplePlan = {
  /** Plicul care devine „Cumpărături” (de obicei Alimente); lipsă = se creează cu 0. */
  shoppingId?: string;
  /** Plicul care acoperă deja consumabilele copilului; lipsă = se creează. */
  childId?: string;
  /** Plicul care acoperă deja haine, farmacie etc.; lipsă = se creează. */
  otherId?: string;
  fixes: Array<{ source: PaymentSource; kind: PaymentKind }>;
};


export const isSimplified = (data: AppData) => {
  const allocations = data.settings.salaryPlan.allocations;
  return allocations.length > 0 && allocations.every((item) => item.anySource) && !mistypedSources(data).length;
};

export function proposeSimpleEnvelopes(data: AppData): SimplePlan {
  const allocations = data.settings.salaryPlan.allocations;
  const biggest = (list: BudgetAllocation[]) => [...list].sort((a, b) => b.amount - a.amount)[0];
  const shopping = biggest(allocations.filter((item) => SHOPPING_CATEGORIES.includes(item.category || "")));
  const child = biggest(allocations.filter((item) => item.id !== shopping?.id && CHILD_CATEGORIES.includes(item.category || "")));
  const other = biggest(allocations.filter((item) => item.id !== shopping?.id && OTHER_CATEGORIES.includes(item.category || "")));
  return { shoppingId: shopping?.id, childId: child?.id, otherId: other?.id, fixes: mistypedSources(data) };
}

export type SimpleAmounts = { child: number; other: number };

/** Aplică propunerea. Nimic nu se șterge: plicurile rămân cu sumele și cheltuielile lor. */
export function applySimpleEnvelopes(data: AppData, proposal: SimplePlan, amounts: SimpleAmounts): AppData {
  const plan = data.settings.salaryPlan;
  const now = new Date().toISOString();
  const card = data.settings.paymentSources.find((item) => item.kind === "card") || data.settings.paymentSources[0];
  const without = (list: string[], own?: string) => list.filter((category) => category !== own);
  // Plicul e al familiei: cumpărăturile făcute de Angi scad din același plic ca ale lui Alin.
  const allocations: BudgetAllocation[] = plan.allocations.map(({ memberId: _member, ...item }) => {
    if (item.id === proposal.shoppingId) return { ...item, label: t("Cumpărături"), categories: without(SHOPPING_CATEGORIES, item.category), anySource: true, updatedAt: now };
    if (item.id === proposal.childId) return { ...item, categories: without(CHILD_CATEGORIES, item.category), anySource: true, ...(amounts.child > 0 ? { amount: Math.round(amounts.child) } : {}), weeklyPace: false, updatedAt: now };
    if (item.id === proposal.otherId) return { ...item, categories: without(OTHER_CATEGORIES, item.category), anySource: true, ...(amounts.other > 0 ? { amount: Math.round(amounts.other) } : {}), weeklyPace: false, updatedAt: now };
    return { ...item, anySource: true, updatedAt: now };
  });
  const fresh = (label: string, category: string, list: string[], amount: number, weekly: boolean): BudgetAllocation => ({ id: newId("allocation"), label, amount: Math.round(amount), category, categories: without(list, category), sourceId: card?.id, anySource: true, weeklyPace: weekly, updatedAt: now });
  if (!proposal.shoppingId) allocations.unshift(fresh(t("Cumpărături"), "Alimente", SHOPPING_CATEGORIES, 0, true));
  if (!proposal.childId && amounts.child > 0) allocations.push(fresh(t("Copil"), "Consumabile copil", CHILD_CATEGORIES, amounts.child, false));
  if (!proposal.otherId && amounts.other > 0) allocations.push(fresh(t("Altele"), "Altele", OTHER_CATEGORIES, amounts.other, false));
  const kinds = new Map(proposal.fixes.map((fix) => [fix.source.id, fix.kind]));
  return {
    ...data,
    settings: {
      ...data.settings,
      paymentSources: data.settings.paymentSources.map((source) => kinds.has(source.id) ? { ...source, kind: kinds.get(source.id)!, updatedAt: now } : source),
      salaryPlan: { ...plan, allocations, updatedAt: now },
    },
  };
}

/**
 * Cât s-a cheltuit deja în ciclul curent pe categoriile unui plic nou: după simplificare,
 * cheltuielile din afara plicurilor intră singure în el, deci omul trebuie să vadă cifra înainte
 * să aleagă suma (Copil avea deja 630 din 9 oct, cu BebeTei 488).
 */
export const spentThisCycle = (data: AppData, categories: string[]) => {
  const start = data.settings.salaryPlan.periodStart;
  return Math.round(data.transactions.filter((item) => item.kind === "expense" && (!start || item.date >= start) && categories.includes(item.category) && !item.transferId && !item.debtId && !item.recurringId && !isBalanceAdjustment(item)).reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
};

/** Pentru afișare: ce acoperă plicul, în cuvinte. */
export const coveredCategories = (item: BudgetAllocation) => [item.category, ...(item.categories || [])].filter((category): category is string => Boolean(category));
