/**
 * Atelier Financiar — Plan pe categorii: fiecare plic își declară o singură dată suma; totalul e suma lor.
 * Filosofie: o familie adaugă bani direct pe categorii, unele cu ritm săptămânal, altele doar cu un total.
 * Perioada e opțională și comună — servește doar categoriilor cu ritm săptămânal; nu există o sumă „generală” separată.
 */
import { CategoryGlyph } from "@/components/CategoryGlyph";
import { WeekRetune } from "@/components/WeekRetune";
import { SimpleEnvelopesCard } from "@/components/SimpleEnvelopesCard";
import { categoryColor } from "@/lib/category-color";
import "../envelope-weekly-toggle.css";
import "../week-transfer.css";
import "../plan-header-stat.css";
import "../plan-studio.css";
import "../envelope-source.css";
import "../envelope-transfer.css";
import "../envelope-insights.css";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap, useFocusTrapOn } from "@/hooks/use-focus-trap";
import { BookmarkPlus, Check, ChevronDown, FileDown, Pencil, Plus, Sparkles, Trash2, WalletCards } from "lucide-react";
import { EnvelopeEmptyArt, EnvelopeMark } from "@/components/EnvelopeMark";
import { calendarBudget, periodDays as daysBetween, remainingPace, startedWeekShare, totalFromWeeklyPace, weeklyPaceFromTotal } from "@/lib/calendar-budget";
import { levelStartedWeek, spreadStartedWeekSurplus, startedWeekPlan } from "@/lib/started-week";
import { downloadCalendarPlanPdf } from "@/lib/calendar-plan-pdf";
import { AllocationHistoryPanel } from "@/components/AllocationHistoryPanel";
import { CycleClosePanel } from "@/components/CycleClosePanel";
import { AllocationRecommendationsPanel } from "@/components/AllocationRecommendationsPanel";
import { EnvelopeTransferPanel } from "@/components/EnvelopeTransferPanel";
import { MonthlyAllocationWizard } from "@/components/MonthlyAllocationWizard";
import { SalaryRitualPanel } from "@/components/SalaryRitualPanel";
import { allocationSourceParts, allocationSpentFromSource, amountInput, debtsOutsideTrackedMoney, sourceBalance, allocationStatus, allocationWeekStatus, allocationWeeksStatus, addIsoDays, appendAllocationHistory, expenseCategories, formatDate, isoDate, isoToday, isWeeklyPaced, newId, parseRomanianAmount, paydayWindow, planAllocationMath, planEndDate, planWeeklyCycle, sourceFreeBalance, transferBetweenWeeks, type AppData, type BudgetAllocation } from "@/lib/finance-data";
import { applyPlanRows, parsePlanTable } from "@/lib/plan-import";
import { nextCycleIncomeArrived, envelopeBurnPace, envelopeMonthlyHistory, envelopeRunOut, envelopeUntilPayday, weekDayCap, envelopeBurndown} from "@/lib/household-insights";
import { MonthlyNeedsSection, NextPayday } from "@/components/MonthlyNeedsPanel";
import { EnvelopeBurndownChart } from "@/components/EnvelopeBurndownChart";
import { WeekBand } from "@/components/WeekBand";
import { activeIncomes } from "@/lib/monthly-needs";
import "../monthly-needs.css";
import { daysLabel, envelopesLabel, getLocale, t } from "@/lib/i18n";
import { PaidCheck } from "@/components/PaidCheck";
import { hasSeenEnvelopeGlossary, markEnvelopeGlossarySeen } from "@/lib/ui-prefs";
import { EnvelopeConflictBadge, EnvelopeConflictBanner } from "@/components/EnvelopeConflictBanner";
import { canAddEnvelope, PLANS } from "@/lib/entitlements";
import { RoDateInput } from "@/components/RoDateInput";
import { askConfirm } from "@/lib/confirm-dialog";
import { PlanCashflowSuggest, PlanSimulator } from "@/components/PlanTools";
import { lei } from "@/lib/money-format";

const money = lei;
const thresholdOptions = [50, 60, 70, 80, 90, 95];

const QUICK_ENVELOPE_PRESETS = [
  { category: "Alimente", amount: "1500", weekly: true },
  { category: "Transport", amount: "400", weekly: true },
  { category: "Casă & facturi", amount: "800", weekly: false },
  { category: "Abonamente", amount: "150", weekly: false },
  { category: "Consumabile copil", amount: "500", weekly: true },
  { category: "Timp liber", amount: "300", weekly: true },
] as const;

/** Cât din perioadă a trecut până la sfârșitul zilei de azi: marcajul „aici ar trebui să fii azi” de pe bara plicului. */
function todayMark(start: string | undefined, end: string | undefined, today = isoToday()) {
  if (!start || !end || end < start) return undefined;
  const total = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000 + 1;
  const done = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000 + 1;
  if (!(total > 0) || done <= 0 || done > total) return undefined;
  return Math.round((done / total) * 1000) / 10;
}

function PlanField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="bf-plan-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function personName(data: AppData, memberId?: string) {
  return data.settings.members.find((member) => member.id === memberId)?.name || "Familie / comun";
}

function sourceName(data: AppData, sourceId?: string) {
  return data.settings.paymentSources.find((source) => source.id === sourceId)?.name || t("Orice sursă");
}

/**
 * Sumele plicurilor văzute ultima dată în această sesiune. Când salariul e repartizat (de pe
 * Astăzi sau din Plan), plicurile care au primit bani arată suma „coborând” în ele o dată.
 */
const seenEnvelopeAmounts = new Map<string, number>();

export function PlanStudio({ data, onChange, simpleMode = false }: { data: AppData; onChange: (data: AppData) => void; simpleMode?: boolean }) {
  const plan = data.settings.salaryPlan;
  const planEnd = planEndDate(plan);
  const categories = [...expenseCategories, ...data.settings.customCategories.filter((category) => !expenseCategories.includes(category))];
  const [cycleStart, setCycleStart] = useState(plan.periodStart);
  const [cycleEnd, setCycleEnd] = useState(plan.nextPayday || "");
  const cycleRef = useRef({ start: cycleStart, end: cycleEnd });
  cycleRef.current.start = cycleStart;
  cycleRef.current.end = cycleEnd;
  const [cycleFlex, setCycleFlex] = useState(plan.paydayFlexDays ?? 3);
  const [cycleError, setCycleError] = useState("");
  const [cycleTemplateLabel, setCycleTemplateLabel] = useState("");
  const [templateRenameId, setTemplateRenameId] = useState("");
  const [templateRename, setTemplateRename] = useState("");
  const [allocationLabel, setAllocationLabel] = useState("");
  const [allocationCategory, setAllocationCategory] = useState(categories[0] || "Alimente");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [allocationMemberId, setAllocationMemberId] = useState("");
  /* Prima sursă din listă e rareori cea potrivită: un card gol nu poate plăti niciun plic.
     Pornim de la sursa care chiar are bani liberi. */
  const richestSourceId = () => [...data.settings.paymentSources]
    .map((source) => ({ id: source.id, free: sourceFreeBalance(data, source.id).free }))
    .sort((left, right) => right.free - left.free)[0]?.id || data.settings.paymentSources[0]?.id || "";
  const [allocationSourceId, setAllocationSourceId] = useState(() => richestSourceId());
  const [allocationNote, setAllocationNote] = useState("");
  const [allocationThreshold, setAllocationThreshold] = useState(80);
  const [allocationWeeklyPace, setAllocationWeeklyPace] = useState(true);
  /** „total” = suma pe toată perioada; „weekly” = cât revine unei săptămâni întregi. */
  const [allocationPaceMode, setAllocationPaceMode] = useState<"total" | "weekly">("total");
  /**
   * Când perioada e deja începută, zilele trecute nu mai pot primi bani. Comutatorul dă tranșei
   * curente doar partea zilelor rămase și trimite restul în săptămânile următoare, la salvare.
   */
  const [allocationLevelStarted, setAllocationLevelStarted] = useState(true);
  /** Completări din alte surse, când sursa principală nu acoperă singură plicul. */
  const [allocationFunding, setAllocationFunding] = useState<Array<{ sourceId: string; amount: string }>>([]);
  const [editingAllocationId, setEditingAllocationId] = useState("");
  const [allocationError, setAllocationError] = useState("");
  const [weekTransferAllocationId, setWeekTransferAllocationId] = useState("");
  const [weekTransferDirection, setWeekTransferDirection] = useState<"in" | "out">("in");
  const [weekTransferFromIndex, setWeekTransferFromIndex] = useState("");
  const [weekTransferAmount, setWeekTransferAmount] = useState("");
  const [weekTransferError, setWeekTransferError] = useState("");
  const [allocationPeriod, setAllocationPeriod] = useState<"next-income" | "month" | "week" | "custom">("next-income");
  // Data salariului se poate schimba și din „Ce plătim lunar” sau de la repartizare: câmpurile de aici o urmează.
  useEffect(() => {
    if (allocationPeriod !== "next-income") return;
    setCycleStart(plan.periodStart); setCycleEnd(plan.nextPayday || ""); setCycleFlex(plan.paydayFlexDays ?? 3);
  }, [plan.periodStart, plan.nextPayday, plan.paydayFlexDays, allocationPeriod]);
  const [allocationPreviewOpen, setAllocationPreviewOpen] = useState(false);
  const [planFlowOpen, setPlanFlowOpen] = useState(false);
  const [showGlossary, setShowGlossary] = useState(() => !hasSeenEnvelopeGlossary());
  /** Formularul de plic stă închis sub listă; „+ Plic”, „Modifică” și pornirea rapidă îl deschid. */
  const [builderOpen, setBuilderOpen] = useState(false);
  /** Graficele și lunile unui plic se calculează doar când „Detalii” e deschis, nu la fiecare literă din „+ Plic”. */
  const [openDetails, setOpenDetails] = useState<ReadonlySet<string>>(() => new Set());
  const closeBuilder = () => { setBuilderOpen(false); setEditingAllocationId(""); };
  const builderRef = useRef<HTMLDetailsElement>(null);
  // D16: pe telefon, formularul deschis se randează la nivelul aplicației (peste barele de sus și de jos).
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches);
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 760px)");
    if (!query) return;
    const update = () => setPhone(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const sheetOrInline = (node: ReactNode) => {
    const open = builderOpen || Boolean(editingAllocationId);
    // În <body>, ca dialogul de previzualizare: `.bf-app` are `overflow: clip` și ar tăia foaia.
    const host = typeof document !== "undefined" ? document.body : null;
    return open && phone && host ? createPortal(<div className="bf-plan-workspace bf-plan-sheet-host">{node}</div>, host) : node;
  };
  const openBuilder = () => {
    setBuilderOpen(true);
    // Pe telefon e foaie (se deschide de sus); pe ecran mare formularul e sub listă și ducem pagina la el.
    if (!window.matchMedia?.("(max-width: 760px)").matches) window.setTimeout(() => document.getElementById("bf-allocation-builder")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const periodValid = Boolean(cycleStart && cycleEnd && cycleEnd >= cycleStart);
  const weeklyPacedTotal = plan.allocations.filter((item) => isWeeklyPaced(item, plan)).reduce((sum, item) => sum + item.amount, 0);
  const activeCycle = planWeeklyCycle(data) || (planEnd && weeklyPacedTotal > 0 ? calendarBudget(weeklyPacedTotal, plan.periodStart, planEnd) : undefined);
  const activeWeek = activeCycle?.weeks.find((week) => isoToday() >= week.start && isoToday() <= week.end);
  const runOutById = useMemo(() => new Map(envelopeRunOut(data).map((entry) => [entry.allocationId, entry])), [data]);
  const burnById = useMemo(() => new Map(envelopeBurnPace(data).map((entry) => [entry.allocationId, entry])), [data]);
  const envelopes = useMemo(() => plan.allocations.map((item) => ({ item, ...allocationStatus(data, item), week: isWeeklyPaced(item, plan) ? allocationWeekStatus(data, item) : undefined, weeks: isWeeklyPaced(item, plan) ? allocationWeeksStatus(data, item) : [] })), [data, plan]);
  const [funded, setFunded] = useState<Record<string, number>>({});
  const [importText, setImportText] = useState("");
  const [importNotice, setImportNotice] = useState("");
  useEffect(() => {
    const gains: Record<string, number> = {};
    for (const item of plan.allocations) {
      const before = seenEnvelopeAmounts.get(item.id);
      if (before !== undefined && item.amount - before > 0.5) gains[item.id] = Math.round((item.amount - before) * 100) / 100;
      seenEnvelopeAmounts.set(item.id, item.amount);
    }
    if (!Object.keys(gains).length) return;
    setFunded(gains);
    const timer = window.setTimeout(() => setFunded({}), 1400);
    return () => window.clearTimeout(timer);
  }, [plan.allocations]);
  const allocated = envelopes.reduce((sum, envelope) => sum + envelope.budget, 0);
  const weekSpentByIndex = envelopes.reduce((all, envelope) => { envelope.weeks.forEach((week) => all.set(week.index, (all.get(week.index) || 0) + week.spent)); return all; }, new Map<number, number>());
  const { availableSources, scheduled, scheduledInEnvelopes, reservedInEnvelopes, unrepartized } = useMemo(() => planAllocationMath(data), [data]);
  const outsideDebts = useMemo(() => debtsOutsideTrackedMoney(data), [data]);
  // Tichetele nu intră în plicuri, dar sunt tot bani de mâncare: se arată lângă plicul de alimente (utilizator #9).
  const mealLeft = data.settings.paymentSources.filter((source) => source.kind === "meal").reduce((sum, source) => sum + Math.max(0, sourceBalance(data, source.id)), 0);
  const isFoodCategory = (category?: string) => category === "Alimente" || category === "Mâncare";
  /**
   * Suma scrisă poate fi totalul pe perioadă sau ritmul unei săptămâni întregi. Plicul
   * păstrează mereu totalul — ritmul e doar felul în care îl scrii, tradus pe zile.
   */
  const paceByWeek = allocationWeeklyPace && Boolean(planEnd);
  /** Perioada e începută dacă ziua de azi cade după prima zi a ei — atunci contează doar zilele rămase. */
  const periodStarted = Boolean(planEnd) && isoToday() > plan.periodStart && isoToday() <= planEnd;
  const levelStarted = paceByWeek && periodStarted && allocationLevelStarted;
  /** Ritmul scris se traduce în total pe zilele care chiar mai pot primi bani. */
  const paceToday = levelStarted ? isoToday() : undefined;
  const allocationTotalFromInput = () => {
    const typed = Math.round(parseRomanianAmount(allocationAmount) * 100) / 100;
    if (!paceByWeek || allocationPaceMode !== "weekly") return typed;
    return Math.round(totalFromWeeklyPace(typed, plan.periodStart, planEnd, paceToday));
  };
  const allocationTotal = allocationTotalFromInput();
  const previewPrevious = editingAllocationId ? plan.allocations.find((item) => item.id === editingAllocationId) : undefined;
  const previewOldRemaining = previewPrevious ? Math.max(0, allocationStatus(data, previewPrevious).remaining) : 0;
  const previewNextRemaining = allocationTotal > 0
    ? Math.max(0, allocationStatus(data, previewPrevious
      ? { ...previewPrevious, amount: allocationTotal }
      : { id: "preview", label: allocationLabel || allocationCategory, amount: allocationTotal, category: allocationCategory, sourceId: allocationSourceId || undefined, memberId: allocationMemberId || undefined, weeklyPace: allocationWeeklyPace ? true : false }).remaining)
    : 0;
  const previewAfter = unrepartized - previewNextRemaining + previewOldRemaining;
  const allocationPreview = planEnd ? calendarBudget(allocationTotal, plan.periodStart, planEnd) : undefined;
  /** Câți bani i-ar reveni tranșei începute din suma scrisă, ca să se vadă înainte de salvare. */
  const allocationStartedShare = (() => {
    if (!levelStarted || allocationTotal <= 0) return undefined;
    const current = allocationPreview?.weeks.find((week) => isoToday() >= week.start && isoToday() <= week.end);
    return current ? startedWeekShare(current, isoToday(), remainingPace(allocationTotal, planEnd, isoToday())) : undefined;
  })();
  /**
   * Două feluri de a împărți banii nerepartizați, ca familia să aleagă, nu să ghicească.
   * „De azi” socotește doar zilele rămase: o săptămână începută joi primește partea a patru zile,
   * nu a șapte. „Perioada întreagă” lasă tranșa curentă cu bugetul ei plin — mai lejer acum,
   * mai strâns până la venit. Ambele repartizează exact aceiași bani.
   */
  const paceOptions = (() => {
    /* Variantele se socotesc pe suma scrisă în câmp, nu pe toți banii liberi: dacă omul a
       hotărât că plicul ăsta ia 1.800, nu are ce face cu o împărțire a celor 2.200 din casă.
       Doar cu câmpul gol se propune întreg disponibilul. */
    const base = allocationTotal > 0 ? allocationTotal : unrepartized;
    if (!paceByWeek || base <= 0) return [];
    const today = isoToday();
    const cycle = calendarBudget(base, plan.periodStart, planEnd);
    const current = cycle?.weeks.find((week) => today >= week.start && today <= week.end);
    const pace = remainingPace(base, planEnd, today > plan.periodStart ? today : plan.periodStart);
    if (!pace || !cycle) return [];
    const share = current ? startedWeekShare(current, today, pace) : undefined;
    const started = Boolean(share && share.daysLeft < share.daysTotal);
    const options = [{
      id: "even",
      weekly: Math.round(pace.weekly),
      level: true,
      title: started ? t("De azi, egal pe zile") : t("Egal pe toată perioada"),
      detail: started && share
        ? t("{days} rămase din S{index} primesc {fair}, apoi {weekly} pe săptămână întreagă — ≈{perDay} pe zi peste tot.", { days: daysLabel(share.daysLeft), index: String(current?.index ?? 1), fair: money(share.fair), weekly: money(Math.round(pace.weekly)), perDay: money(pace.perDay) })
        : t("{weekly} pe fiecare săptămână întreagă, ≈{perDay} pe zi.", { weekly: money(Math.round(pace.weekly)), perDay: money(pace.perDay) }),
    }];
    if (started && current && share) {
      const wholeWeekly = weeklyPaceFromTotal(base, plan.periodStart, planEnd);
      options.push({
        id: "whole",
        weekly: Math.round(wholeWeekly),
        level: false,
        title: t("Săptămâna începută rămâne întreagă"),
        detail: t("S{index} păstrează {amount} pentru {days} rămase, apoi {weekly} pe săptămână — mai lejer acum, mai strâns până la venit.", { index: String(current.index), amount: money(current.amount), days: daysLabel(share.daysLeft), weekly: money(Math.round(wholeWeekly)) }),
      });
    }
    return options;
  })();
  const currentSourceOptions = data.settings.paymentSources.filter((source) => !allocationMemberId || !source.memberId || source.memberId === allocationMemberId);
  /**
   * Eticheta sursei arată banii care mai pot fi repartizați, nu soldul brut: ce stă deja în
   * plicuri plătite din sursa asta nu mai e disponibil pentru un plic nou. Când editezi un
   * plic, propria lui rezervă intră la loc în disponibil — altfel n-ai putea să-l salvezi.
   */
  /**
   * Cât poate da o sursă plicului editat: banii ei liberi plus ce a cheltuit deja plicul din ea.
   * Tichetele de 600 cheltuite la Lidl din plicul de cumpărături au soldul 0, dar partea lor din
   * plic e acoperită; fără asta, „Modifică plicul” refuza salvarea cu „liberi doar 0 RON”.
   */
  const sourceAvailable = (sourceId: string) => {
    const base = sourceFreeBalance(data, sourceId, editingAllocationId || undefined);
    const editing = editingAllocationId ? plan.allocations.find((item) => item.id === editingAllocationId) : undefined;
    const spent = editing ? Math.max(0, allocationSpentFromSource(data, editing, sourceId)) : 0;
    return { ...base, free: Math.round((base.free + spent) * 100) / 100 };
  };
  const wholeLei = (value: number) => Math.round(value).toLocaleString(getLocale());
  const sourceOptionLabel = (source: { id: string; name: string }) => {
    const { balance, free } = sourceAvailable(source.id);
    return Math.round(free) === Math.round(balance)
      ? `${source.name} · ${wholeLei(balance)}`
      : `${source.name} · ${wholeLei(free)} ${t("liberi din")} ${wholeLei(balance)}`;
  };
  const selectedSourceAvailable = allocationSourceId ? sourceAvailable(allocationSourceId) : undefined;
  /**
   * Acoperirea plicului: sursa principală plus completările, fiecare limitată la cât are
   * liber. Un plic fără bani în spate nu e un plan, e o dorință — de aceea suma se compară
   * cu ce chiar există, nu cu totalul casei.
   */
  const fundingEntries = allocationFunding
    .map((entry) => ({ sourceId: entry.sourceId, amount: Math.max(0, parseRomanianAmount(entry.amount)) }))
    .filter((entry) => entry.sourceId && entry.sourceId !== allocationSourceId && entry.amount > 0);
  const fundingTotal = Math.round(fundingEntries.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100;
  const fundingOverdrawn = fundingEntries.filter((entry) => entry.amount > sourceAvailable(entry.sourceId).free + 0.5);
  const fundingExcess = allocationTotal > 0 && fundingTotal > allocationTotal + 0.5;
  const primaryNeeded = Math.max(0, allocationTotal - fundingTotal);
  const primaryFree = selectedSourceAvailable?.free ?? 0;
  const covered = Math.min(primaryNeeded, primaryFree) + fundingTotal;
  const shortfall = Math.round(Math.max(0, allocationTotal - covered) * 100) / 100;
  /** Surse care mai au bani liberi și nu sunt deja folosite de acest plic. */
  const fundingCandidates = data.settings.paymentSources.filter((source) =>
    source.id !== allocationSourceId
    && !allocationFunding.some((entry) => entry.sourceId === source.id)
    && sourceAvailable(source.id).free > 0.5);
  /** Plicul se face din bani care chiar sunt: înainte de salariu, spunem ce lipsește și ce e de făcut. */
  const incomeMissing = !data.transactions.some((item) => item.kind === "income" && item.date >= (plan.periodStart || "") && item.category !== "Transfer");
  const overdrawnMessage = fundingOverdrawn.length
    ? t("Pe {source} sunt liberi acum doar {free}. Scade suma completării sau alege altă sursă.", { source: sourceName(data, fundingOverdrawn[0].sourceId), free: money(Math.max(0, sourceAvailable(fundingOverdrawn[0].sourceId).free)) })
      + (incomeMissing ? ` ${t("Dacă salariul sau tichetele n-au intrat încă, notează-le întâi ca venit: plicul se face din banii care chiar sunt.")}` : "")
    : "";
  /** Toate celelalte surse pe care omul le poate adăuga de bunăvoie, nu doar când prima nu ajunge. */
  const otherSources = data.settings.paymentSources.filter((source) => source.id !== allocationSourceId && !allocationFunding.some((entry) => entry.sourceId === source.id));
  const addSecondSource = () => {
    const best = fundingCandidates[0] || otherSources[0];
    if (!best) return;
    const free = sourceAvailable(best.id).free;
    // O sumă de pornire: jumătate din plic, cât are liber sursa; omul o schimbă.
    const start = Math.max(0, Math.min(Math.round(allocationTotal / 2), Math.floor(free)));
    setAllocationFunding((current) => [...current, { sourceId: best.id, amount: start > 0 ? String(start) : "" }]);
    setAllocationError("");
  };
  /** Câți bani mai stau liberi în toată casa, dacă surplusul se caută în altă parte. */
  const freeElsewhere = Math.round(fundingCandidates.reduce((sum, source) => sum + sourceAvailable(source.id).free, 0) * 100) / 100;
  const sourceFreeHint = !selectedSourceAvailable
    ? undefined
    : Math.round(selectedSourceAvailable.reserved) <= 0
      ? undefined
      : selectedSourceAvailable.free > 0
        ? t("Pe {source} mai sunt liberi {free} (din {balance}, {reserved} sunt deja în plicuri sau scadențe).", { source: data.settings.paymentSources.find((item) => item.id === allocationSourceId)?.name || t("sursa aleasă"), balance: money(selectedSourceAvailable.balance), reserved: money(selectedSourceAvailable.reserved), free: money(selectedSourceAvailable.free) })
        : t("Toți banii din această sursă sunt deja repartizați.");

  const updatePlan = (patch: Partial<typeof plan>) => onChange({ ...data, settings: { ...data.settings, salaryPlan: { ...plan, ...patch, updatedAt: new Date().toISOString() } } });
  const addDays = (start: string, amount: number) => { const date = new Date(`${start || isoToday()}T12:00:00`); date.setDate(date.getDate() + amount); return isoDate(date); };
  const allocationPeriodOptions = [{ id: "next-income" as const, label: t("Până la următorul venit") }, { id: "month" as const, label: t("Luna aceasta") }, { id: "week" as const, label: t("Săptămâna aceasta") }, { id: "custom" as const, label: t("Personalizat") }];
  const selectAllocationPeriod = (periodId: typeof allocationPeriod) => { setAllocationPeriod(periodId); if (periodId === "next-income") { setCycleStart(plan.periodStart); setCycleEnd(plan.nextPayday || ""); } else if (periodId === "month") { const now = new Date(); setCycleStart(isoDate(new Date(now.getFullYear(), now.getMonth(), 1))); setCycleEnd(isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))); } else if (periodId === "week") { setCycleStart(isoToday()); setCycleEnd(addIsoDays(isoToday(), 6)); } };
  const resetAllocationBuilder = () => { setAllocationLabel(""); setAllocationCategory(categories[0] || "Alimente"); setAllocationAmount(""); setAllocationMemberId(""); setAllocationSourceId(richestSourceId()); setAllocationNote(""); setAllocationThreshold(80); setAllocationWeeklyPace(true); setAllocationFunding([]); setEditingAllocationId(""); setAllocationError(""); };

  const windowPayday = paydayWindow(plan);
  const persistCycle = (start: string, end: string, flex = cycleFlex) => {
    if (!start || !end || end < start) return;
    const earliest = flex > 0 ? addIsoDays(end, -flex) : undefined;
    updatePlan({ periodStart: start, nextPayday: end, paydayFlexDays: flex, earliestPayday: earliest && earliest >= start ? earliest : start });
    setCycleError("");
  };
  const autoApplyPeriod = () => {
    persistCycle(cycleRef.current.start, cycleRef.current.end, cycleFlex);
  };
  const saveCycleTemplate = () => {
    if (!periodValid) return setCycleError(t("Alege perioada înainte de a salva șablonul."));
    const days = daysBetween(cycleStart, cycleEnd);
    const label = cycleTemplateLabel.trim() || `Ciclu de ${days} zile`;
    const now = new Date().toISOString();
    const duplicate = data.settings.salaryCycleTemplates.find((item) => item.label.toLocaleLowerCase("ro-RO") === label.toLocaleLowerCase("ro-RO"));
    const template = { id: duplicate?.id || newId("salary-cycle"), label, amount: 0, durationDays: days, updatedAt: now };
    onChange({ ...data, settings: { ...data.settings, salaryCycleTemplates: [template, ...data.settings.salaryCycleTemplates.filter((item) => item.id !== duplicate?.id)].slice(0, 12) } });
    setCycleTemplateLabel("");
  };
  const applyCycleTemplate = (template: AppData["settings"]["salaryCycleTemplates"][number]) => {
    const start = cycleStart || isoToday(); const end = addDays(start, template.durationDays - 1);
    setCycleStart(start); setCycleEnd(end); setCycleError("");
    persistCycle(start, end, cycleFlex);
  };
  const renameCycleTemplate = (id: string) => {
    const label = templateRename.trim(); if (!label) return;
    onChange({ ...data, settings: { ...data.settings, salaryCycleTemplates: data.settings.salaryCycleTemplates.map((item) => item.id === id ? { ...item, label: label.slice(0, 42), updatedAt: new Date().toISOString() } : item) } });
    setTemplateRenameId(""); setTemplateRename("");
  };
  const deleteCycleTemplate = async (id: string, label: string) => { if (await askConfirm(t("Ștergi șablonul local „{label}”?", { label }))) onChange({ ...data, settings: { ...data.settings, salaryCycleTemplates: data.settings.salaryCycleTemplates.filter((item) => item.id !== id) } }); };

  const saveAllocation = () => {
    const amount = allocationTotalFromInput();
    const source = data.settings.paymentSources.find((item) => item.id === allocationSourceId);
    const member = data.settings.members.find((item) => item.id === allocationMemberId);
    if (amount <= 0) return setAllocationError(t("Introdu suma pentru această categorie."));
    if (fundingExcess) return setAllocationError(t("Completările depășesc suma plicului. Scade-le sau mărește suma."));
    if (fundingOverdrawn.length) return setAllocationError(overdrawnMessage);
    if (shortfall > 0.5) {
      return setAllocationError(freeElsewhere > 0.5
        ? t("Mai lipsesc {amount}. Completează din altă sursă mai jos sau scade suma plicului.", { amount: money(shortfall) })
        : t("Mai lipsesc {amount} și nu mai sunt bani liberi în nicio sursă. Scade suma plicului.", { amount: money(shortfall) })
          + (incomeMissing ? ` ${t("Dacă salariul sau tichetele n-au intrat încă, notează-le întâi ca venit: plicul se face din banii care chiar sunt.")}` : ""));
    }
    if (!source) return setAllocationError(t("Alege sursa din care vei plăti această categorie."));
    if (!editingAllocationId && !canAddEnvelope(plan.allocations.length)) {
      return setAllocationError(t("Casa include până la {n} plicuri. Planul Familia deblochează plicuri nelimitate.", { n: String(PLANS.casa.envelopes) }));
    }
    const label = allocationLabel.trim() || `${allocationCategory}${member ? ` · ${member.name}` : ""}`;
    // Editarea păstrează ce nu e în formular: „din orice card”, categoriile adăugate, suma pe săptămână.
    const kept = editingAllocationId ? plan.allocations.find((item) => item.id === editingAllocationId) : undefined;
    const keptExtras = kept ? { ...(kept.anySource ? { anySource: true } : {}), ...(kept.categories?.length ? { categories: kept.categories } : {}), ...(kept.weeklyAmount && allocationWeeklyPace && amount === kept.amount ? { weeklyAmount: kept.weeklyAmount } : {}) } : {};
    const next: BudgetAllocation = { ...keptExtras, id: editingAllocationId || newId("allocation"), label, amount, category: allocationCategory, memberId: member?.id, sourceId: source.id, funding: fundingEntries.length ? fundingEntries : undefined, note: allocationNote.trim() || undefined, alertThreshold: allocationThreshold, weeklyPace: allocationWeeklyPace ? true : false };
    const previous = editingAllocationId ? plan.allocations.find((item) => item.id === editingAllocationId) : undefined;
    const nextAllocations = editingAllocationId ? plan.allocations.map((item) => item.id === editingAllocationId ? next : item) : [...plan.allocations, next];
    const nextData = { ...data, settings: { ...data.settings, salaryPlan: { ...plan, allocations: nextAllocations, totalLimit: nextAllocations.reduce((sum, item) => sum + item.amount, 0), updatedAt: new Date().toISOString() } } };
    const saved = appendAllocationHistory(nextData, { kind: editingAllocationId ? "updated" : "created", allocationId: next.id, allocationLabel: label, amount, previousAmount: previous?.amount, newAmount: amount });
    onChange(levelStarted ? levelStartedWeek(saved, next.id) : saved);
    resetAllocationBuilder();
    setBuilderOpen(false);
  };
  const editAllocation = (item: BudgetAllocation) => { setAllocationFunding((item.funding || []).map((entry) => ({ sourceId: entry.sourceId, amount: amountInput(entry.amount) }))); setEditingAllocationId(item.id); setAllocationLabel(item.label); setAllocationCategory(item.category || categories[0] || "Alimente"); setAllocationAmount(amountInput(item.amount)); setAllocationMemberId(item.memberId || ""); setAllocationSourceId(item.sourceId || data.settings.paymentSources[0]?.id || ""); setAllocationNote(item.note || ""); setAllocationThreshold(item.alertThreshold || 80); setAllocationWeeklyPace(item.weeklyPace !== false); setAllocationError(""); openBuilder(); };
  const applyRecommendation = (allocation: BudgetAllocation, amount: number) => { setEditingAllocationId(allocation.id); setAllocationLabel(allocation.label); setAllocationCategory(allocation.category || categories[0] || "Alimente"); setAllocationAmount(amountInput(amount)); setAllocationMemberId(allocation.memberId || ""); setAllocationSourceId(allocation.sourceId || data.settings.paymentSources[0]?.id || ""); setAllocationNote(allocation.note || ""); setAllocationThreshold(allocation.alertThreshold || 80); setAllocationWeeklyPace(allocation.weeklyPace !== false); setAllocationError(""); openBuilder(); };
  const applyMonthlyAllocation = (changes: { id: string; amount: number }[]) => { let nextData = data; changes.forEach(({ id, amount }) => { const currentPlan = nextData.settings.salaryPlan; const previous = currentPlan.allocations.find((item) => item.id === id); if (!previous || previous.amount === amount) return; const nextAllocations = currentPlan.allocations.map((item) => item.id === id ? { ...item, amount } : item); const changedData = { ...nextData, settings: { ...nextData.settings, salaryPlan: { ...currentPlan, allocations: nextAllocations, totalLimit: nextAllocations.reduce((sum, item) => sum + item.amount, 0), updatedAt: new Date().toISOString() } } }; nextData = appendAllocationHistory(changedData, { kind: "updated", allocationId: id, allocationLabel: previous.label, amount, previousAmount: previous.amount, newAmount: amount }); }); if (nextData !== data) onChange(nextData); };
  const deleteAllocation = async (id: string, label: string) => {
    if (!await askConfirm(t("Ștergi plicul „{label}”? Cheltuielile deja înregistrate rămân în jurnal.", { label }))) return;
    const nextAllocations = plan.allocations.filter((item) => item.id !== id);
    const nextData = { ...data, settings: { ...data.settings, salaryPlan: { ...plan, allocations: nextAllocations, totalLimit: nextAllocations.reduce((sum, item) => sum + item.amount, 0), transfers: plan.transfers.filter((transfer) => transfer.fromAllocationId !== id && transfer.toAllocationId !== id), salaryAllocationRules: (plan.salaryAllocationRules || []).filter((rule) => rule.allocationId !== id) } } };
    onChange(appendAllocationHistory(nextData, { kind: "deleted", allocationId: id, allocationLabel: label, previousAmount: plan.allocations.find((item) => item.id === id)?.amount }));
  };
  const exportCyclePdf = async () => {
    if (!activeCycle) return;
    try {
      const weekSpent = Object.fromEntries(Array.from(weekSpentByIndex.entries()));
      await downloadCalendarPlanPdf(activeCycle, data.settings.familyName, {
        weekSpent,
        envelopes: envelopes.map(({ item, budget, remaining, spent }) => ({
          label: item.label,
          budget,
          spent,
          remaining,
        })),
      });
    } catch {
      setCycleError(t("PDF-ul nu a putut fi generat local. Încearcă din nou."));
    }
  };

  const openWeekTransfer = (allocationId: string) => { setWeekTransferAllocationId(allocationId); setWeekTransferDirection("in"); setWeekTransferFromIndex(""); setWeekTransferAmount(""); setWeekTransferError(""); };
  const closeWeekTransfer = () => { setWeekTransferAllocationId(""); setWeekTransferDirection("in"); setWeekTransferFromIndex(""); setWeekTransferAmount(""); setWeekTransferError(""); };
  /**
   * `currentWeekIndex` e tranșa din care se citește cardul. Direcția alege dacă banii vin
   * spre ea („aduc din altă săptămână”) sau pleacă din ea spre tranșa aleasă — aceeași
   * mișcare, în ambele sensuri, ca săptămâna 1 să nu fie doar destinație.
   */
  const applyWeekTransfer = (allocationId: string, currentWeekIndex: number) => {
    const otherWeekIndex = Number(weekTransferFromIndex);
    const amount = parseRomanianAmount(weekTransferAmount);
    const allocation = plan.allocations.find((item) => item.id === allocationId);
    if (!allocation) return setWeekTransferError(t("Plicul nu mai există în plan."));
    if (!otherWeekIndex) return setWeekTransferError(weekTransferDirection === "in" ? t("Alege săptămâna din care muți bani.") : t("Alege săptămâna în care muți bani."));
    if (amount <= 0) return setWeekTransferError(t("Introdu o sumă mai mare decât zero."));
    const fromWeekIndex = weekTransferDirection === "in" ? otherWeekIndex : currentWeekIndex;
    const toWeekIndex = weekTransferDirection === "in" ? currentWeekIndex : otherWeekIndex;
    const next = transferBetweenWeeks(data, { allocationId, fromWeekIndex, toWeekIndex, amount });
    if (!next) return setWeekTransferError(t("Suma depășește ce a mai rămas în săptămâna aleasă."));
    const transfer = next.settings.salaryPlan.weekTransfers?.[0];
    const updated = appendAllocationHistory(next, { kind: "week-transfer", referenceId: transfer?.id, allocationId, allocationLabel: allocation.label, amount, fromWeekIndex, toWeekIndex });
    onChange(updated);
    closeWeekTransfer();
  };

  /**
   * Săptămâna începută ține bugetul a șapte zile pentru zilele care au mai rămas. Surplusul
   * nu dispare: se împarte în tranșele următoare, proporțional cu zilele lor, prin aceleași
   * transferuri pe care le poți face și de mână (deci se văd în istoric și se pot desface).
   */
  const rebalanceStartedWeek = (allocationId: string, weekIndex: number, amount: number) => {
    const next = spreadStartedWeekSurplus(data, allocationId, weekIndex, amount);
    if (next !== data) onChange(next);
  };

  const hasPacedAllocations = plan.allocations.some((item) => item.weeklyPace !== false);
  const completedPlanSteps = Number(periodValid) + Number(envelopes.length > 0) + Number(Boolean(activeCycle));
  const nextPlanStep = !envelopes.length ? t("Adaugă primul plic") : hasPacedAllocations && !periodValid ? t("Setează perioada pentru ritm") : t("Verifică ritmul și consumul");
  const allocationHealth = unrepartized < 0 ? "attention" : unrepartized > 0 ? "ready" : "balanced";
  const allocationHealthLabel = allocationHealth === "attention" ? "Ai alocat peste soldul disponibil" : allocationHealth === "ready" ? t("Mai există bani de repartizat") : t("Banii disponibili sunt repartizați");
  const allocatedRatio = availableSources > 0 ? Math.min(1, Math.max(0, (availableSources - Math.max(0, unrepartized)) / availableSources)) : 0;
  const missingCategories = QUICK_ENVELOPE_PRESETS.filter((preset) => !plan.allocations.some((item) => item.category === preset.category));
  const quickStartPreset = (preset: (typeof QUICK_ENVELOPE_PRESETS)[number]) => {
    setAllocationCategory(preset.category);
    setAllocationLabel(preset.category);
    setAllocationAmount(preset.amount);
    setAllocationWeeklyPace(preset.weekly);
    setAllocationError("");
    setEditingAllocationId("");
    openBuilder();
  };

  return <div className="bf-page bf-plan-workspace bf-salary-cycle-plan">
    {/* Un ciclu încheiat e cel mai important lucru de pe ecran: stă înaintea planului. */}
    <CycleClosePanel data={data} onChange={onChange} />
    <EnvelopeConflictBanner data={data} onChange={onChange} />
    <header className="bf-plan-studio-header bf-plan-hero-glass">
      <div className="bf-plan-hero-copy"><p className="bf-kicker">{t("PLANUL FAMILIEI, PE CATEGORII")}</p><h1>{t("Fiecare leu")} <em>{t("are un loc.")}</em></h1>{allocated > 0 ? (
        <div className="bf-plan-split" aria-label={t("Cum e împărțit planul")}>
          <i className="bf-plan-split-bar" aria-hidden="true">{envelopes.filter((entry) => entry.budget > 0).map((entry) => <em key={entry.item.id} style={{ flexGrow: entry.budget, background: categoryColor(entry.item.category || entry.item.label) }} />)}</i>
          <ul>{[...envelopes].filter((entry) => entry.budget > 0).sort((a, b) => b.budget - a.budget).slice(0, 4).map((entry) => <li key={entry.item.id}><i style={{ background: categoryColor(entry.item.category || entry.item.label) }} aria-hidden="true" />{entry.item.label} <b>{Math.round((entry.budget / allocated) * 100)}%</b></li>)}</ul>
        </div>
      ) : <p>{t("Adaugă câte o categorie cu suma ei. Totalul e suma categoriilor — nu introduci nicio sumă generală separat.")}</p>}</div>
      <div className="bf-plan-header-stat"><span><WalletCards size={20} /></span><small>{unrepartized < -0.009 ? t("LIPSESC") : t("NEREPARTIZAȚI")}</small><b>{money(unrepartized < -0.009 ? -unrepartized : unrepartized)}</b>
        {/* D12: cele trei cifre se leagă: disponibili = în plicuri (și scadențe) + liberi. */}
        {availableSources > 0 && <>
          <i className="bf-plan-header-bar" role="progressbar" aria-label={t("Procentul banilor repartizați în plicuri")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(allocatedRatio * 100)}><em style={{ width: `${Math.round(allocatedRatio * 100)}%` }} /></i>
          <small className="bf-plan-header-eq">{unrepartized < -0.009
            // Ratele și facturile până la venit nu sunt „în plicuri”: le spunem pe nume și spunem cât lipsește.
            ? t("Ai {available} în surse. Până la venit sunt de plătit {dues} în rate și facturi{envelopes}. Lipsesc {missing}; când notezi salariul, se acoperă.", { available: money(availableSources), dues: money(Math.max(0, scheduled)), envelopes: reservedInEnvelopes > 0.009 ? t(" și {amount} rămân în plicuri", { amount: money(reservedInEnvelopes) }) : "", missing: money(-unrepartized) })
            : scheduled > 0.009
              ? t("{available} disponibili = {placed} în plicuri + {dues} rate și facturi + {free} liberi · {percent}% așezat", { available: money(availableSources), placed: money(Math.max(0, reservedInEnvelopes)), dues: money(scheduled), free: money(Math.max(0, unrepartized)), percent: Math.round(allocatedRatio * 100) })
              : t("{available} disponibili = {placed} în plicuri + {free} liberi · {percent}% așezat", { available: money(availableSources), placed: money(Math.max(0, availableSources - Math.max(0, unrepartized))), free: money(Math.max(0, unrepartized)), percent: Math.round(allocatedRatio * 100) })}</small>
          {outsideDebts.length > 0 && <small className="bf-plan-header-eq">{t("Ratele pe numele {names} ({amount}) nu se scad din banii tăi: pe sursele lor nu e notat niciun venit. Le vezi și le confirmi în Obligații; dacă una se plătește din banii tăi, alege sursa ta la confirmare.", { names: Array.from(new Set(outsideDebts.map((debt) => data.settings.members.find((member) => member.id === debt.memberId)?.name || ""))).filter(Boolean).join(", "), amount: money(outsideDebts.reduce((sum, debt) => sum + debt.amount, 0)) })}</small>}
          <button type="button" className="bf-link-button" onClick={() => window.dispatchEvent(new Event("buget-familie:open-transfer"))}>{t("Mută bani sau dă cuiva")}</button>
        </>}
        {data.settings.salaryPlan.allocations.length > 0 && <button type="button" className="bf-link-button" onClick={() => window.dispatchEvent(new Event("buget-familie:open-payday"))}>{t("A intrat salariul: pornește luna")}</button>}
      </div>
    </header>

    {/* Lista plicurilor e primul lucru de pe ecran; înainte începea abia după ~3.400 px de setări. */}
    <SimpleEnvelopesCard data={data} onChange={onChange} />
    <section className="bf-envelope-list-first" aria-labelledby="bf-envelope-list-title">
      <div className="bf-plan-sheet-heading"><div><p className="bf-kicker">{t("PLICURILE TALE")}</p><h2 id="bf-envelope-list-title">{envelopesLabel(envelopes.length)} · {money(allocated)}</h2></div><button type="button" className="bf-primary bf-add-envelope" onClick={() => { resetAllocationBuilder(); openBuilder(); }}><Plus size={17} /> {t("Plic")}</button></div>
      <div className="bf-allocation-list bf-envelope-desk" aria-live="polite">
        {(() => {
          // Grupate ca în raportul de design: Fixe (facturi, rate), Variabile (zi cu zi), Economii.
          const groupOf = (entry: (typeof envelopes)[number]) => entry.fixed ? 0 : entry.item.category === "Economii" ? 2 : 1;
          const names = [t("Fixe"), t("Variabile"), t("Economii")];
          const sorted = envelopes.map((entry, order) => ({ entry, order })).sort((a, b) => groupOf(a.entry) - groupOf(b.entry) || a.order - b.order).map(({ entry }) => entry);
          const several = new Set(sorted.map(groupOf)).size > 1;
          return sorted.map((entry, index) => ({ ...entry, groupStart: several && (index === 0 || groupOf(sorted[index - 1]) !== groupOf(entry)) ? names[groupOf(entry)] : "" }));
        })().map(({ item, budget, remaining, spent, usage, state, week, weeks, fixed, paid, groupStart }, index) => <Fragment key={item.id}>{groupStart && <div className="bf-envelope-group" role="heading" aria-level={3}>{groupStart}</div>}<article className={`${state}${funded[item.id] ? " is-funded" : ""}`} style={{ "--bf-i": Math.min(index, 8), "--bf-cat": categoryColor(item.category || item.label) } as React.CSSProperties}>{funded[item.id] ? <span className="bf-envelope-fly" aria-hidden="true">+{money(funded[item.id])}</span> : null}
          <div className="bf-envelope-portrait" aria-hidden="true"><EnvelopeMark remaining={Math.max(0, 1 - usage)} state={state} size={58} /></div>
          <div className="bf-allocation-list-heading"><div className="bf-allocation-flags">{(() => {
            // O singură etichetă, nu două care se contrazic: fixele au „de plătit / ✓ Plătit”, restul „în ritm / în urmă / atenție / depășit”.
            const burn = fixed ? undefined : burnById.get(item.id);
            const label = state === "over" ? t("depășit") : paid ? <PaidCheck /> : fixed ? t("de plătit") : state === "watch" ? t("atenție") : burn?.pace === "behind" ? t("în urmă") : t("în ritm");
            const tone = state === "over" ? "over" : paid ? "healthy paid" : state === "watch" || burn?.pace === "behind" ? "watch" : "healthy";
            // D11: „în ritm” e starea obișnuită; eticheta apare doar când spune ceva.
            if (tone === "healthy" && !fixed) return null;
            return <span className={`bf-allocation-state ${tone}`} title={burn?.reason}>{label}</span>;
          })()}<EnvelopeConflictBadge allocationId={item.id} data={data} /></div><span className="bf-envelope-name"><span className="bf-envelope-ring is-small" style={{ ["--bf-used" as string]: String(Math.min(100, Math.round(Math.max(0, usage) * 100))) }} aria-hidden="true"><CategoryGlyph category={item.category || item.label} size={15} /></span><b>{item.label}</b></span>{(item.memberId || item.sourceId || item.note) && <small>{personName(data, item.memberId)} · {item.anySource ? t("din orice card") : sourceName(data, item.sourceId)}{item.note ? ` · ${item.note}` : ""}</small>}</div>
          <div className="bf-allocation-list-total"><strong>{money(Math.max(0, remaining))}</strong><small>{t("rămași din {amount}", { amount: money(budget) })}</small>{(() => {
            // Plic din mai multe surse: cât mai e din partea fiecăreia, ca să știi cu ce plătești.
            const parts = allocationSourceParts(data, item);
            if (parts.length > 1) return parts.map((part) => <small key={part.sourceId} className="bf-allocation-meal">{t("{source}: {left} din {share}", { source: sourceName(data, part.sourceId), left: money(Math.max(0, part.left)), share: money(part.share) })}</small>);
            // Tichetele care nu sunt în plic se pot folosi în plus; cele puse în plic sunt deja în suma lui.
            const inEnvelope = parts.some((part) => data.settings.paymentSources.find((source) => source.id === part.sourceId)?.kind === "meal");
            return mealLeft > 0 && !inEnvelope && !item.anySource && isFoodCategory(item.category) ? <small className="bf-allocation-meal">{t("+ tichete în afara plicului: {amount}", { amount: money(mealLeft) })}</small> : null;
          })()}</div>
          <div className={`bf-envelope-meter${(week ? week.state : state) === "over" ? " is-over" : (!fixed && (week ? week.budget : budget) > 0 && (week ? week.spent : spent) / (week ? week.budget : budget) >= (item.alertThreshold || 80) / 100) ? " is-watch" : ""}`}><span>{week ? t("Săptămâna S{index}", { index: week.index }) : t("Tot plicul")}{" · "}{t("cheltuit")}</span><b>{money(week ? week.spent : spent)} <small>/ {money(week ? week.budget : budget)}</small></b><i aria-hidden="true"><em style={{ width: `${Math.min(100, Math.max(0, ((week ? week.budget : budget) > 0 ? (week ? week.spent : spent) / (week ? week.budget : budget) : 0) * 100))}%` }} />{!fixed && (() => { const mark = todayMark(week ? week.start : plan.periodStart, week ? week.end : plan.nextPayday); return mark === undefined ? null : <u className="bf-meter-today" style={{ left: `${mark}%` }} title={t("Aici ar trebui să fii azi")} />; })()}</i></div>
          <details className="bf-envelope-more" onToggle={(event) => { const open = event.currentTarget.open; setOpenDetails((current) => { if (open === current.has(item.id)) return current; const next = new Set(current); if (open) next.add(item.id); else next.delete(item.id); return next; }); }}><summary>{t("Detalii")}<ChevronDown size={15} aria-hidden="true" /></summary>
          {openDetails.has(item.id) && <>
          {(() => { const chart = fixed ? undefined : envelopeBurndown(data, item); return chart ? <EnvelopeBurndownChart chart={chart} /> : null; })()}
          {(() => {
            const until = envelopeUntilPayday(data, item);
            if (!until) return null;
            const date = (iso: string) => formatDate(iso, { day: "numeric", month: "long" });
            const head = until.days > 0
              ? t("Mai ai nevoie de bani {days}, până la salariu (~{date}).", { days: daysLabel(until.days), date: date(until.typical) })
              : nextCycleIncomeArrived(data) > 0 ? t("Salariul a intrat; repartizează-l ca să pornească ciclul nou.") : t("Salariul e așteptat azi.");
            // Pe plicurile pe săptămâni, cifra de azi e a tranșei — aceeași ca în avertizare și în ghid.
            const cap = weekDayCap(data, item);
            const tail = until.remaining <= 0
              ? t("Plicul e gol.")
              : cap
                ? cap.week.remaining > 0
                  ? cap.daysLeft > 1
                    ? t("Săptămâna asta mai ai {left}: {today} azi, apoi cam {future} pe zi.", { left: money(cap.week.remaining), today: money(cap.todayLeft), future: money(cap.futureShare) })
                    : t("Săptămâna asta mai ai {left}, toți pentru azi.", { left: money(cap.week.remaining) })
                  : t("Tranșa săptămânii s-a terminat; în tot plicul mai sunt {amount}.", { amount: money(until.remaining) })
                : t("Rămân {amount} pentru perioada asta.", { amount: money(until.remaining) });
            return <p className="bf-envelope-until">{head} {tail}</p>;
          })()}
          {runOutById.get(item.id) && (() => { const runOut = runOutById.get(item.id)!; return <p className="bf-envelope-runout" role="note">{t("La ritmul de acum se termină pe {date}, cu {days} înainte de salariu. Ca să ajungă: cel mult {safe} pe zi.", { date: formatDate(runOut.runOutDate, { day: "numeric", month: "long" }), days: daysLabel(runOut.daysShort), safe: money(runOut.safeDaily) })}</p>; })()}
          {weeks.length > 1 && <WeekBand weeks={weeks} currentIndex={week?.index} />}{weeks.length > 1 && <details className="bf-envelope-weeks"><summary><span>{t("Toate săptămânile ({count})", { count: weeks.length })}</span><ChevronDown size={16} aria-hidden="true" /></summary><ol>{weeks.map((other) => <li key={other.index} className={`${other.index === week?.index ? "is-current" : ""}${other.remaining < 0 ? " is-over" : ""}`} aria-current={other.index === week?.index ? "true" : undefined}><span>S{other.index}</span><b>{formatDate(other.start)} – {formatDate(other.end)}</b><small>{t("{spent} cheltuiți din {amount}", { spent: money(other.spent), amount: money(other.budget) })}{other.carry ? ` · ${other.carry > 0 ? t("+{amount} rămași din săptămâna trecută", { amount: money(other.carry) }) : t("−{amount} depășiți săptămâna trecută", { amount: money(-other.carry) })}` : ""}</small><strong>{money(Math.max(0, other.remaining))}</strong></li>)}</ol><label className="bf-envelope-carry"><input type="checkbox" checked={Boolean(plan.weekCarryOver)} onChange={(event) => updatePlan({ weekCarryOver: event.target.checked || undefined })} /><span>{t("Ce rămâne dintr-o săptămână trece în următoarea (și ce depășești se scade din ea). Se aplică la toate plicurile pe săptămâni.")}</span></label><WeekRetune data={data} allocation={item} onChange={onChange} />
          {week && weeks.length > 1 && (() => {
            const shift = startedWeekPlan(data, item);
            // Doar când chiar e ceva de mutat; altfel e încă o cifră pe zi, care o contrazice pe cea a săptămânii.
            if (!shift || shift.movable < 1) return null;
            return <div className="bf-week-started">
              <p>{t("Săptămâna e începută: pentru {days} rămase revin {fair} (≈{perDay}/zi).", { days: daysLabel(shift.share.daysLeft), fair: money(shift.share.fair), perDay: money(shift.share.perDay) })}</p>
              {shift.movable >= 1
                ? <button type="button" onClick={() => rebalanceStartedWeek(item.id, shift.weekIndex, shift.movable)}>{t("Mută {amount} mai departe", { amount: money(shift.movable) })}</button>
                : <small>{t("Nu prisosește nimic de mutat în săptămânile următoare.")}</small>}
            </div>;
          })()}
          {week && weeks.length > 1 && <div className="bf-week-transfer">
            {weekTransferAllocationId === item.id ? <div className="bf-week-transfer-form">
              <div className="bf-week-transfer-direction" role="group" aria-label={t("Sensul mutării")}>
                <button type="button" className={weekTransferDirection === "in" ? "active" : ""} aria-pressed={weekTransferDirection === "in"} onClick={() => { setWeekTransferDirection("in"); setWeekTransferFromIndex(""); setWeekTransferError(""); }}>{t("Adu în S{index}", { index: String(week.index) })}</button>
                <button type="button" className={weekTransferDirection === "out" ? "active" : ""} aria-pressed={weekTransferDirection === "out"} onClick={() => { setWeekTransferDirection("out"); setWeekTransferFromIndex(""); setWeekTransferError(""); }}>{t("Trimite din S{index}", { index: String(week.index) })}</button>
              </div>
              <select value={weekTransferFromIndex} aria-label={weekTransferDirection === "in" ? t("Din ce săptămână?") : t("În ce săptămână?")} onChange={(event) => { setWeekTransferFromIndex(event.target.value); setWeekTransferError(""); }}>
                <option value="">{weekTransferDirection === "in" ? t("Din ce săptămână?") : t("În ce săptămână?")}</option>
                {weeks.filter((other) => other.index !== week.index).map((other) => <option key={other.index} value={other.index}>S{other.index} · {formatDate(other.start)}–{formatDate(other.end)} · {money(other.remaining)} rămași</option>)}
              </select>
              <input value={weekTransferAmount} onChange={(event) => { setWeekTransferAmount(event.target.value); setWeekTransferError(""); }} inputMode="decimal" placeholder="ex. 100" aria-label={t("Suma mutată")} />
              <small className="bf-week-transfer-note">{weekTransferDirection === "in" ? t("Mai ai {amount} în S{index}; aduci din altă tranșă.", { amount: money(Math.max(0, week.remaining)), index: String(week.index) }) : t("Poți trimite cel mult {amount}, cât a rămas în S{index}.", { amount: money(Math.max(0, week.remaining)), index: String(week.index) })}</small>
              <div><button className="bf-primary" onClick={() => applyWeekTransfer(item.id, week.index)}>{weekTransferDirection === "in" ? t("Transferă în S{index}", { index: String(week.index) }) : t("Transferă din S{index}", { index: String(week.index) })}</button><button onClick={closeWeekTransfer}>{t("Renunță")}</button></div>
              {weekTransferError && <p className="bf-form-error" role="alert">{weekTransferError}</p>}
            </div> : <button type="button" className="bf-week-transfer-toggle" onClick={() => openWeekTransfer(item.id)}>{t("Mută bani între săptămâni")}</button>}
          </div>}
          </details>}
          {(state === "over" || state === "watch") && <p className="bf-allocation-why"><b>{state === "over" ? t("De ce cere atenție") : t("De ce apare aici")}:</b> {state === "over" ? t("Ai depășit limita cu {amount}. Redu suma planificată sau revizuiește cheltuielile înainte de următorul venit.", { amount: money(Math.abs(remaining)) }) : t("{usage}% din plic este consumat; mai ai {amount} pentru perioada aleasă.", { usage: Math.round(usage * 100), amount: money(Math.max(0, remaining)) })}</p>}
          {(() => {
            const history = envelopeMonthlyHistory(data, item);
            if (!history.fullMonths) return null;
            const top = Math.max(1, ...history.months.map((entry) => entry.amount));
            const monthName = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString(getLocale(), { month: "long" });
            const gap = history.average !== undefined && budget > 0 ? history.average - budget : 0;
            return <details className="bf-envelope-history">
              <summary><span>{t("Pe luni · media {amount}", { amount: money(history.average || 0) })}</span><ChevronDown size={16} aria-hidden="true" /></summary>
              <ol>{history.months.map((entry, index) => <li key={entry.month}><span>{monthName(entry.month)}{index === history.months.length - 1 ? ` ${t("(în curs)")}` : ""}</span><i aria-hidden="true"><em style={{ width: `${Math.round(entry.amount / top * 100)}%` }} /></i><b>{money(entry.amount)}</b></li>)}</ol>
              {Math.abs(gap) >= Math.max(50, budget * 0.1) && <p>{gap > 0 ? t("De obicei cheltuiți cu {amount} mai mult decât are plicul acum.", { amount: money(gap) }) : t("De obicei cheltuiți cu {amount} mai puțin decât are plicul acum.", { amount: money(-gap) })}</p>}
            </details>;
          })()}
          <div className="bf-allocation-actions"><button aria-label={t("Editează {label}", { label: item.label })} onClick={() => editAllocation(item)}><Pencil size={15} /> {t("Editează")}</button><button aria-label={t("Șterge {label}", { label: item.label })} onClick={() => deleteAllocation(item.id, item.label)}><Trash2 size={15} /> {t("Șterge")}</button></div>
          </>}</details>
        </article></Fragment>)}
        {!envelopes.length && <div className="bf-allocation-empty"><EnvelopeEmptyArt size={88} /><b>{t("Așază primii lei într-un plic.")}</b><span>{t("Un plic e o limită pe o categorie: Mâncare, Transport, Chirie. Începe cu unul, restul le adaugi când ai nevoie.")}</span><button type="button" className="bf-primary" onClick={() => setBuilderOpen(true)}><Plus size={16} /> {t("Fă primul plic")}</button></div>}
            </div>
    </section>
    <details className="bf-plan-import">
      <summary>{t("Adu plicuri dintr-un tabel")}</summary>
      <p className="bf-helper">{t("Câte o linie: nume, apoi sumă, pe ciclu. Plicurile care există deja rămân neschimbate.")}</p>
      <label className="bf-field">
        <textarea aria-label={t("Adu plicuri dintr-un tabel")} value={importText} onChange={(event) => setImportText(event.target.value)} rows={4} placeholder={"Mâncare, 600\nChirie, 1800"} />
      </label>
      <button type="button" className="bf-secondary" onClick={() => {
        const rows = parsePlanTable(importText);
        if (!rows.length) { setImportNotice(t("Nu am găsit linii cu nume și sumă.")); return; }
        const result = applyPlanRows(data, rows);
        if (result.added > 0) { onChange(result.data); setImportText(""); }
        setImportNotice(t("Am adăugat {count} plicuri.", { count: String(result.added) }));
      }}>{t("Adaugă plicurile noi")}</button>
      {importNotice && <p className="bf-helper" role="status">{importNotice}</p>}
    </details>
    {/* D16: pe telefon formularul e o foaie peste pagină; fundalul și Escape o închid. */}
    {sheetOrInline(<>
    {(builderOpen || Boolean(editingAllocationId)) && <div className="bf-plan-builder-backdrop" aria-hidden="true" onClick={closeBuilder} />}
    {(builderOpen || Boolean(editingAllocationId)) && <FocusTrapScope target={builderRef} onClose={closeBuilder} />}
    <details ref={builderRef} tabIndex={-1} className="bf-plan-tools bf-plan-builder" open={builderOpen || Boolean(editingAllocationId)} onToggle={(event) => { const open = (event.currentTarget as HTMLDetailsElement).open; setBuilderOpen(open); if (!open && editingAllocationId) setEditingAllocationId(""); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeBuilder(); } }}>
      <summary>{editingAllocationId ? t("Modifică plicul") : t("Plic nou")}<span className="bf-plan-builder-close" aria-hidden="true">×</span></summary>
      <section className={`bf-allocation-guidance ${allocationHealth}`} aria-labelledby="bf-allocation-guidance-title"><div className="bf-allocation-guidance-heading"><div><p className="bf-kicker">{t("REPARTIZARE GHIDATĂ")}</p><h2 id="bf-allocation-guidance-title">{unrepartized > 0 ? <>{t("Înainte să adaugi un plic, vezi")} <em>{t("ce mai trebuie acoperit.")}</em></> : unrepartized < 0 ? t("Plicurile depășesc disponibilul") : t("Banii disponibili sunt repartizați")}</h2><p>{allocationHealthLabel}. {t("Plicurile sunt limite de planificare; nu mută bani din card sau cash.")}</p></div><WalletCards size={23} aria-hidden="true" /></div><div className="bf-allocation-guidance-stats"><span><small>{t("Disponibil în surse")}</small><b>{money(Math.max(0, availableSources))}</b></span><span><small>{t("În plicuri")}</small><b>{money(Math.max(0, reservedInEnvelopes))}</b></span><span><small>{t("Scadențe")}</small><b>{money(Math.max(0, scheduled))}</b>{scheduledInEnvelopes > 0 && <small>{t("+{amount} plătite din plicuri", { amount: money(scheduledInEnvelopes) })}</small>}</span><span><small>{t("De repartizat")}</small><b>{money(Math.max(0, unrepartized))}</b></span></div>{unrepartized > 0 && <button type="button" className="bf-allocation-guidance-action" onClick={() => { setAllocationAmount(String(Math.round(unrepartized))); setAllocationError(""); document.getElementById("bf-allocation-builder")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{t("Folosește suma nealocată pentru următorul plic")} <ChevronDown size={15} /></button>}{unrepartized < 0 && <p className="bf-form-error" role="alert">{t("Limitele plicurilor și scadențele depășesc soldul disponibil. Redu un plic sau verifică sursele înainte de a continua.")}</p>}</section><p className="bf-allocation-intro">{t("Adaugă o categorie pentru fiecare parte a banilor: alimente, taxi, abonamente, consumabile copil. La o cheltuială reală, alegi categoria și aplicația scade automat din plicul potrivit.")}</p>
      <div id="bf-allocation-builder" className="bf-allocation-builder">
        <PlanField label={t("Ce plătește plicul")}><select value={allocationCategory} onChange={(event) => setAllocationCategory(event.target.value)}>{categories.map((category) => <option key={category} value={category}>{t(category)}</option>)}</select></PlanField>
        <PlanField label={t("Nume plic")} hint={t("Poți scrie „Taxi soție” sau lăsa automat.")}><input value={allocationLabel} onChange={(event) => setAllocationLabel(event.target.value)} placeholder={t("ex. Alimente · card soție")} /></PlanField>
        <PlanField label={t("Membru")}><select value={allocationMemberId} onChange={(event) => { const memberId = event.target.value; setAllocationMemberId(memberId); const firstCompatible = data.settings.paymentSources.find((source) => !source.memberId || source.memberId === memberId); if (firstCompatible) setAllocationSourceId(firstCompatible.id); }}><option value="">{t("Familie")}</option>{data.settings.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></PlanField>
        {/* Sursa și completările ei stau într-un singur loc din grilă: regulile vechi de
            layout numără copiii, așa că un element în plus ar muta coloanele celorlalte câmpuri. */}
        <div className={`bf-source-field${allocationTotal > 0 && (shortfall > 0.5 || allocationFunding.length > 0) ? " is-funding" : ""}`}>
        <PlanField label={t("Plătit din")} hint={sourceFreeHint}><select value={allocationSourceId} onChange={(event) => setAllocationSourceId(event.target.value)}>{currentSourceOptions.map((source) => <option key={source.id} value={source.id}>{sourceOptionLabel(source)}</option>)}</select></PlanField>
        {previewPrevious?.anySource && <small className="bf-helper" style={{ display: "block" }}>{t("Plicul ia plata din orice card, tichete sau cash. Sursa de aici spune doar din ce bani se pune deoparte suma.")}</small>}
        {/* Plicul se plătește din surse reale. Când cea aleasă nu ajunge, diferența se ia
            explicit din alta — 1.800 din cashul tău și 100 din al partenerei — în loc să fie
            promisă din bani care nu există. */}
        {allocationTotal > 0 && (shortfall > 0.5 || allocationFunding.length > 0) && (
          <div className="bf-funding">
            <p className={shortfall > 0.5 || fundingExcess ? "bf-funding-gap" : "bf-funding-ok"}>
              {fundingExcess
                ? t("Completările fac {funded}, mai mult decât plicul de {total}.", { funded: money(fundingTotal), total: money(allocationTotal) })
                : shortfall > 0.5
                ? t("{source} acoperă {covered} din {total}. Mai lipsesc {gap}.", { source: sourceName(data, allocationSourceId), covered: money(Math.max(0, covered)), total: money(allocationTotal), gap: money(shortfall) })
                : fundingEntries.length
                  ? t("Împărțit: {parts}.", { parts: [{ sourceId: allocationSourceId, amount: Math.max(0, allocationTotal - fundingTotal) }, ...fundingEntries].filter((entry) => entry.amount > 0.005).map((entry) => t("{amount} din {source}", { amount: money(entry.amount), source: sourceName(data, entry.sourceId) })).join(" + ") })
                  : t("Acoperit integral: {total}.", { total: money(allocationTotal) })}
            </p>
            {allocationFunding.map((entry, index) => {
              const free = entry.sourceId ? sourceAvailable(entry.sourceId).free : 0;
              const asked = Math.max(0, parseRomanianAmount(entry.amount));
              return <div className="bf-funding-row" key={`${entry.sourceId}-${index}`}>
                <select value={entry.sourceId} aria-label={t("Sursa completării")} onChange={(event) => setAllocationFunding((current) => current.map((row, position) => position === index ? { ...row, sourceId: event.target.value } : row))}>
                  {data.settings.paymentSources.filter((source) => source.id !== allocationSourceId).map((source) => <option key={source.id} value={source.id}>{sourceOptionLabel(source)}</option>)}
                </select>
                <input value={entry.amount} inputMode="decimal" aria-label={t("Cât iei din această sursă")} onChange={(event) => { setAllocationFunding((current) => current.map((row, position) => position === index ? { ...row, amount: event.target.value } : row)); setAllocationError(""); }} />
                <button type="button" aria-label={t("Renunță la completare")} onClick={() => setAllocationFunding((current) => current.filter((_, position) => position !== index))}>×</button>
                {asked > free + 0.5 && <small className="bf-funding-over">{t("Liberi doar {amount}.", { amount: money(free) })}</small>}
              </div>;
            })}
            {shortfall > 0.5 && fundingCandidates.length > 0 && (
              <button type="button" className="bf-funding-add" onClick={() => { const best = fundingCandidates[0]; setAllocationFunding((current) => [...current, { sourceId: best.id, amount: String(Math.round(Math.min(shortfall, sourceAvailable(best.id).free))) }]); setAllocationError(""); }}>
                <Plus size={14} /> {t("Ia {amount} din {source}", { amount: money(Math.min(shortfall, sourceAvailable(fundingCandidates[0].id).free)), source: fundingCandidates[0].name })}
              </button>
            )}
            {shortfall > 0.5 && fundingCandidates.length === 0 && <small className="bf-funding-none">{t("Nu mai sunt bani liberi în nicio sursă. Scade suma plicului.")}</small>}
            {shortfall <= 0.5 && otherSources.length > 0 && <button type="button" className="bf-funding-add" onClick={addSecondSource}><Plus size={14} /> {t("Încă o sursă")}</button>}
          </div>
        )}
        {/* Plicul plătit din două surse și când prima ajunge: 300 din card și 200 din cash, alese de om. */}
        {allocationTotal > 0 && shortfall <= 0.5 && allocationFunding.length === 0 && otherSources.length > 0 && (
          <button type="button" className="bf-funding-add" onClick={addSecondSource}><Plus size={14} /> {t("Plătit și din altă sursă")}</button>
        )}
        </div>
        {/* Un singur loc în grilă: câmpul sumei plus comutatorul „total / pe săptămână”.
            Regulile vechi de layout numără copiii, așa că tot ce ține de sumă stă împreună. */}
        <div className="bf-pace-field">
          <PlanField
            label={allocationPaceMode === "weekly" && paceByWeek ? t("Cât pe săptămână întreagă") : t("Suma acestei categorii")}
            hint={!allocationWeeklyPace
              ? t("Fără ritm săptămânal — contează doar totalul.")
              : !paceByWeek
                ? t("Pune data salariului (Plicuri → Salariul) ca să vezi ritmul săptămânal.")
                : allocationPaceMode === "weekly"
                  ? (allocationTotal <= 0
                      ? t("Scrie cât vrei să ai la dispoziție într-o săptămână întreagă.")
                      : allocationStartedShare
                        ? t("{total} pentru zilele rămase, din care {fair} în săptămâna începută.", { total: money(allocationTotal), fair: money(allocationStartedShare.fair) })
                        : t("Total pe perioadă: {amount}.", { amount: money(allocationTotal) }))
                  : (allocationStartedShare
                      ? t("≈{weekly} pe săptămână întreagă, {fair} pentru zilele rămase din săptămâna începută.", { weekly: money(Math.round(weeklyPaceFromTotal(allocationTotal, plan.periodStart, planEnd, paceToday))), fair: money(allocationStartedShare.fair) })
                      : allocationPreview ? t("În fiecare săptămână: aproximativ {amount} din acest plic.", { amount: money(allocationPreview.weeklyAmount) }) : t("Pune data salariului (Plicuri → Salariul) ca să vezi ritmul săptămânal."))}
          >
            <input value={allocationAmount} onChange={(event) => { setAllocationAmount(event.target.value); setAllocationError(""); }} inputMode="decimal" placeholder={allocationPaceMode === "weekly" ? "ex. 500" : "ex. 1200"} />
          </PlanField>
          {paceByWeek && (
            <div className="bf-pace-switch" role="group" aria-label={t("Cum scrii suma")}>
              <button type="button" className={allocationPaceMode === "total" ? "active" : ""} aria-pressed={allocationPaceMode === "total"} onClick={() => {
                if (allocationPaceMode === "total") return;
                const weekly = parseRomanianAmount(allocationAmount);
                setAllocationPaceMode("total");
                if (weekly > 0) setAllocationAmount(String(Math.round(totalFromWeeklyPace(weekly, plan.periodStart, planEnd, paceToday))));
              }}>{t("Total pe perioadă")}</button>
              <button type="button" className={allocationPaceMode === "weekly" ? "active" : ""} aria-pressed={allocationPaceMode === "weekly"} onClick={() => {
                if (allocationPaceMode === "weekly") return;
                const total = parseRomanianAmount(allocationAmount);
                setAllocationPaceMode("weekly");
                if (total > 0) setAllocationAmount(String(Math.round(weeklyPaceFromTotal(total, plan.periodStart, planEnd, paceToday))));
              }}>{t("Pe săptămână întreagă")}</button>
            </div>
          )}
        </div>
        <PlanField label={t("Avertizează la")}><select value={allocationThreshold} onChange={(event) => setAllocationThreshold(Number(event.target.value))}>{thresholdOptions.map((value) => <option key={value} value={value}>{value}%</option>)}</select></PlanField>
        <PlanField label="Detaliu liber"><input value={allocationNote} onChange={(event) => setAllocationNote(event.target.value)} placeholder={t("ex. telefon, cablu și aplicații")} /></PlanField>
        <label className="bf-plan-toggle"><input type="checkbox" checked={allocationWeeklyPace} onChange={(event) => setAllocationWeeklyPace(event.target.checked)} /><span><b>{t("Împarte pe săptămâni")}</b><small>{t("Dezactivează pentru plicuri fără ritm fix — taxi, cheltuieli ocazionale: rămâne doar totalul, fără presiune pe săptămână.")}</small></span></label>
        {paceByWeek && periodStarted && <label className="bf-plan-toggle"><input type="checkbox" checked={allocationLevelStarted} onChange={(event) => setAllocationLevelStarted(event.target.checked)} /><span><b>{t("Alocă de azi, nu și pe zilele trecute")}</b><small>{t("Săptămâna e începută: tranșa curentă primește doar partea zilelor rămase, iar restul pleacă în săptămânile următoare. Fără asta, zilele deja trecute rămân cu bani pe hârtie.")}</small></span></label>}
        {paceOptions.length > 0 && (
          /* Recomandările pleacă de la banii nerepartizați și de la zilele care au mai rămas.
             Sunt variante, nu o singură cifră: familia alege dacă săptămâna începută primește
             partea zilelor rămase sau bugetul ei întreg. */
          <div className="bf-pace-advice">
            <p><b>{allocationTotal > 0 ? t("Cum împarți cei {amount} din acest plic", { amount: money(allocationTotal) }) : t("Cum împarți cei {amount} nerepartizați", { amount: money(unrepartized) })}</b></p>
            <ul>
              {paceOptions.map((option) => <li key={option.id}>
                <div><b>{option.title}</b><small>{option.detail}</small></div>
                <button type="button" onClick={() => {
                  setAllocationWeeklyPace(true);
                  setAllocationLevelStarted(option.level);
                  setAllocationPaceMode("weekly");
                  setAllocationAmount(String(option.weekly));
                  setAllocationError("");
                }}>{t("Folosește")} · {money(option.weekly)}{t("/săpt.")}</button>
              </li>)}
            </ul>
          </div>
        )}
        {fundingOverdrawn.length > 0 && <p className="bf-form-error" role="alert">{overdrawnMessage}</p>}
        <div className="bf-allocation-builder-actions"><button className="bf-primary" onClick={() => setAllocationPreviewOpen(true)}><Plus size={17} /> {editingAllocationId ? t("Salvează plicul") : t("Adaugă plicul")}</button>{editingAllocationId && <button onClick={resetAllocationBuilder}>{t("Renunță")}</button>}</div>
      </div>
      {/* Randat prin portal în <body>: `.bf-app` are `overflow: clip`, care limitează un element
          `position: fixed` la pagină, așa că dialogul apărea sus, nu peste ecran. */}
      {allocationPreviewOpen && createPortal(<TrappedDialog className="bf-allocation-preview" labelledBy="allocation-preview-title" onClose={() => setAllocationPreviewOpen(false)}><div><p className="bf-kicker">{t("PREVIZUALIZARE")}</p><h3 id="allocation-preview-title">{t("Verifică înainte de aplicare")}</h3><p>{t(editingAllocationId ? "Vei actualiza plicul „{label}” la {amount} pentru perioada aleasă." : "Vei adăuga plicul „{label}” cu {amount} pentru perioada aleasă.", { label: allocationLabel.trim() || t(allocationCategory), amount: money(allocationTotal) })}</p><div><span>{t("Rămas acum")}<strong>{money(unrepartized)}</strong></span><span>{t("Rămas după")}<strong>{money(previewAfter)}</strong></span></div><small>{t("Previzualizarea nu schimbă nimic până când nu confirmi.")}</small><footer><button onClick={() => setAllocationPreviewOpen(false)}>{t("Înapoi la editare")}</button><button className="bf-primary" onClick={() => { setAllocationPreviewOpen(false); saveAllocation(); }}><Check size={16} /> {t("Confirmă repartizarea")}</button></footer></div></TrappedDialog>, document.body)}
      {allocationError && <p className="bf-form-error" role="alert">{allocationError}</p>}
    </details>
    </>)}
    {(simpleMode || showGlossary) && (
      <aside className={simpleMode ? "bf-plan-simple-tip" : "bf-envelope-glossary-tip"} role="note">
        <p className="bf-kicker">{t("PE SCURT")}</p>
        <b>{t("Plicul e o limită, nu un sold.")}</b>
        <p>{t("Banii stau în surse (card, cash). Plicul spune cât poți cheltui pe o categorie până la următorul venit — nu „mută” lei din cont.")}</p>
        {!simpleMode && <button type="button" className="bf-link-button" onClick={() => { markEnvelopeGlossarySeen(); setShowGlossary(false); }}>{t("Am înțeles")}</button>}
      </aside>
    )}
    {/* D12: un singur total, în antet; aici rămâne doar pornirea rapidă. */}
    {missingCategories.length > 0 && <section className="bf-allocation-progress-card" aria-label={t("Pornire rapidă plicuri")}>
      {(
        <div className="bf-quick-envelope-chips" aria-label={t("Pornire rapidă plicuri")}>
          <p><Sparkles size={14} /> {t("Pornește rapid")}</p>
          <div>
            {missingCategories.slice(0, 5).map((preset) => (
              <button key={preset.category} type="button" onClick={() => quickStartPreset(preset)}>
                {t(preset.category)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>}

    {activeWeek && <section className="bf-active-week" aria-labelledby="active-week-title"><div><p className="bf-kicker">{t("ACUM · TRANȘA S{index}", { index: activeWeek.index })}</p><h2 id="active-week-title">{formatDate(activeWeek.start)} – {formatDate(activeWeek.end)}</h2><span>{t("Aceasta este săptămâna din care se vor scădea cheltuielile repartizate.")}</span></div><strong>{money(activeWeek.amount)}<small>{t("ritm total")}</small></strong></section>}

    <details className="bf-plan-tools">
      <summary>{t("Alege ritmul casei.")}</summary>
    <section className="bf-allocation-period" aria-labelledby="allocation-period-title"><div className="bf-allocation-period-heading"><div><p className="bf-kicker">{t("REPARTIZARE PE PERIOADĂ")}</p><h2 id="allocation-period-title">{t("Alege ritmul casei.")}</h2><p>{t("Vezi banii disponibili pentru intervalul în care iei decizia.")}</p></div><span>{money(Math.max(0, unrepartized))}<small>{t("rămași de repartizat")}</small></span></div><div className="bf-allocation-period-tabs" role="tablist" aria-label={t("Perioada repartizării")}>{allocationPeriodOptions.map((option) => <button key={option.id} role="tab" aria-selected={allocationPeriod === option.id} className={allocationPeriod === option.id ? "active" : ""} onClick={() => selectAllocationPeriod(option.id)}>{option.label}</button>)}</div><div className="bf-allocation-period-summary"><span><b>{money(availableSources)}</b><small>{t("disponibil în surse")}</small></span><span><b>{money(reservedInEnvelopes)}</b><small>{t("în plicuri")}</small></span><span><b>{money(scheduled)}</b><small>{t("scadențe rezervate")}</small></span><span><b>{money(Math.max(0, unrepartized))}</b><small>{t("de repartizat")}</small></span></div></section>
    </details>

    <details className="bf-plan-tools">
      <summary>{t("Unelte: propunere, simulare, ghid")}</summary>
    <PlanCashflowSuggest data={data} allocations={plan.allocations} onApply={applyMonthlyAllocation} />
    <PlanSimulator allocations={plan.allocations} available={availableSources - scheduled} onApply={applyMonthlyAllocation} />
    {!simpleMode && <AllocationRecommendationsPanel data={data} allocations={plan.allocations} periodDays={periodValid ? daysBetween(cycleStart, cycleEnd) : 30} onApply={applyRecommendation} />}
    <section className={`bf-plan-flow ${planFlowOpen ? "expanded" : "compact"}`} aria-label={t("Progresul planului în trei pași")}><button type="button" className="bf-plan-flow-toggle" aria-expanded={planFlowOpen} onClick={() => setPlanFlowOpen((value) => !value)}><span>{planFlowOpen ? "Ascunde ghidul" : t("Arată ghidul complet")}</span><ChevronDown size={16} /></button>
      <div className="bf-plan-flow-summary"><div><p className="bf-kicker">{t("PLAN ÎN TREI PAȘI")}</p><h2>{nextPlanStep}</h2><span>{t("Configurația rămâne locală și poate fi ajustată oricând.")}</span></div><strong>{completedPlanSteps}<small>{t("/ 3 pregătit")}</small></strong></div>
      <ol>
        <li className={periodValid ? "complete" : "active"}><span>01</span><div><b>{t("Cadrul")}</b><small>{t("Perioadă opțională")}</small></div></li>
        <li className={envelopes.length ? "complete" : "active"}><span>02</span><div><b>{t("Plicurile")}</b><small>{envelopes.length ? t("{count} configurate", { count: envelopes.length }) : t("Adaugă categorii")}</small></div></li>
        <li className={activeCycle ? "complete" : "upcoming"}><span>03</span><div><b>{t("Ritmul")}</b><small>{activeCycle ? t("Gata de urmărit") : t("Se activează cu perioada")}</small></div></li>
      </ol>
    </section>
    </details>


    <section className="bf-cycle-setup" aria-labelledby="cycle-setup-title">
      {/* Secțiunea e despre salariu: fără pastila care repeta totalul plicurilor și fără paragraful lung. */}
      <div className="bf-plan-sheet-heading"><div><p className="bf-kicker">{t("SALARIUL")}</p><h2 id="cycle-setup-title">{t("Când vine salariul")}</h2></div></div>
      <p className="bf-cycle-setup-lead">{t("Data dă ritmul săptămânal al plicurilor. Poate varia cu câteva zile.")}</p>
      {!plan.horizonDays && <NextPayday plan={plan} incomes={activeIncomes(data)} onSave={updatePlan} />}
      <div className={`bf-irregular-income${plan.horizonDays ? " is-on" : ""}`}>
        <label className="bf-recurring-auto">
          <input type="checkbox" checked={Boolean(plan.horizonDays)} onChange={(event) => { const today = isoToday(); updatePlan(event.target.checked ? { horizonDays: 30, periodStart: today, nextPayday: addIsoDays(today, 29), paydayFlexDays: 0, earliestPayday: undefined } : { horizonDays: undefined }); }} />
          <span><b>{t("Am venituri neregulate (PFA, freelancer)")}</b><small>{t("Fără dată de salariu: alegi câte zile trebuie să-ți ajungă banii, iar cifra zilei e banii de acum împărțiți pe atâtea zile.")}</small></span>
        </label>
        {plan.horizonDays ? <PlanField label={t("Vreau ca banii să-mi ajungă")}><select value={plan.horizonDays} onChange={(event) => { const days = Number(event.target.value); const today = isoToday(); updatePlan({ horizonDays: days, periodStart: today, nextPayday: addIsoDays(today, days - 1) }); }}>{[7, 14, 21, 30, 45, 60, 90].map((days) => <option key={days} value={days}>{t("{days} zile", { days })}</option>)}</select></PlanField> : null}
      </div>
      {!plan.horizonDays && <details className="bf-plan-period">
        <summary>{t("Perioada salariului, dacă vrei ritm săptămânal")}</summary>
      <div className="bf-cycle-setup-fields">
        <PlanField label={t("Prima zi a perioadei (opțional)")}><RoDateInput value={cycleStart} onChange={(event) => { cycleRef.current.start = event.target.value; setCycleStart(event.target.value); setCycleError(""); }} onBlur={autoApplyPeriod} /></PlanField>
        <PlanField label={t("Data obișnuită a salariului")} hint={t("Alege ziua la care vine de obicei, nu trebuie să fie exactă.")}><RoDateInput min={cycleStart || undefined} value={cycleEnd} onChange={(event) => { cycleRef.current.end = event.target.value; setCycleEnd(event.target.value); setCycleError(""); }} onBlur={autoApplyPeriod} /></PlanField>
        <PlanField label={t("Poate varia cu")} hint={t("Dacă salariul întârzie sau vine mai devreme.")}>
          <select value={cycleFlex} onChange={(event) => { const flex = Number(event.target.value); setCycleFlex(flex); persistCycle(cycleStart, cycleEnd, flex); }}>
            <option value={0}>{t("Nu variază")}</option>
            {[1, 2, 3, 4, 5].map((days) => <option key={days} value={days}>± {daysLabel(days)}</option>)}
          </select>
        </PlanField>
      </div>
      {windowPayday.typical && windowPayday.flex > 0 && <p className="bf-payday-window">{t("Tranșele țin până pe {typical}. Dacă salariul întârzie, plicurile rămân active până pe {latest}; ritmul zilnic e calculat ca și cum ar veni pe {earliest}.", { typical: formatDate(windowPayday.typical), latest: formatDate(windowPayday.latest), earliest: formatDate(windowPayday.earliest) })}</p>}
      {activeCycle && <div className="bf-cycle-tranches"><div><span>{t("RITM ORIENTATIV, DOAR CATEGORIILE CU RITM SĂPTĂMÂNAL")}</span><b>{money(activeCycle.weeklyAmount)} / {t("săptămână")}</b></div><details className="bf-cycle-tools"><summary><span>{t("Vezi cele {count} tranșe", { count: activeCycle.weeks.length })}</span><ChevronDown size={17} /></summary><ol>{activeCycle.weeks.map((week) => { const spent = weekSpentByIndex.get(week.index) || 0; return <li key={week.index}><span>S{week.index}</span><b>{formatDate(week.start)} – {formatDate(week.end)}</b><small>{t("{spent} cheltuiți din {amount}", { spent: money(spent), amount: money(week.amount) })}</small><strong>{money(Math.max(0, week.amount - spent))}</strong></li>; })}</ol></details></div>}
      {cycleError && <p className="bf-form-error" role="alert">{cycleError}</p>}
      <div className="bf-cycle-setup-actions"><button disabled={!activeCycle} onClick={() => void exportCyclePdf()}><FileDown size={17} /> {t("Descarcă planul")}</button></div>
      </details>}

      <EnvelopeTransferPanel data={data} onChange={onChange} />
      {!simpleMode && <details className="bf-plan-tools"><summary>{t("Ritual de salariu și istoric")}</summary><SalaryRitualPanel data={data} onChange={onChange} /><AllocationHistoryPanel data={data} /></details>}
    </section>
    <MonthlyNeedsSection data={data} onChange={onChange} />
    {!simpleMode && <MonthlyAllocationWizard allocations={plan.allocations} available={availableSources} scheduled={scheduled} remainingById={Object.fromEntries(envelopes.map((envelope) => [envelope.item.id, Math.max(0, envelope.remaining)]))} periodLabel={allocationPeriodOptions.find((option) => option.id === allocationPeriod)?.label || t("Luna aceasta")} onApply={applyMonthlyAllocation} />}
    <details className="bf-cycle-tools"><summary><span><BookmarkPlus size={17} /> {t("Instrumente pentru perioade repetate")}</span><ChevronDown size={17} /></summary><div className="bf-cycle-tools-body"><p>{t("Un șablon reține doar durata perioadei; începi mereu următorul ciclu cu data aleasă de tine.")}</p><div className="bf-cycle-template-save"><input value={cycleTemplateLabel} onChange={(event) => setCycleTemplateLabel(event.target.value)} maxLength={42} placeholder={periodValid ? `ex. Salariu ${daysBetween(cycleStart, cycleEnd)} zile` : t("Completează mai întâi perioada")} disabled={!periodValid} /><button disabled={!periodValid} onClick={saveCycleTemplate}>{t("Salvează șablonul")}</button></div><div className="bf-cycle-template-list">{data.settings.salaryCycleTemplates.map((template) => <article key={template.id}>{templateRenameId === template.id ? <div className="bf-cycle-template-rename"><input autoFocus value={templateRename} maxLength={42} onChange={(event) => setTemplateRename(event.target.value)} /><button onClick={() => renameCycleTemplate(template.id)}>{t("Salvează")}</button><button onClick={() => { setTemplateRenameId(""); setTemplateRename(""); }}>{t("Anulează")}</button></div> : <><button type="button" onClick={() => applyCycleTemplate(template)}><b>{template.label}</b><small>{template.durationDays} zile</small></button><div><button type="button" aria-label={t("Redenumește șablonul {label}", { label: template.label })} onClick={() => { setTemplateRenameId(template.id); setTemplateRename(template.label); }}><Pencil size={15} /></button><button type="button" aria-label={t("Șterge șablonul {label}", { label: template.label })} onClick={() => deleteCycleTemplate(template.id, template.label)}><Trash2 size={15} /></button></div></>}</article>)}{!data.settings.salaryCycleTemplates.length && <span>{t("Nu ai șabloane salvate încă.")}</span>}</div></div></details>
  </div>;
}

/** Foaia „+ Plic” deschisă ține focusul în ea; Escape și Înapoi pe Android o închid. */
function FocusTrapScope({ target, onClose }: { target: RefObject<HTMLElement | null>; onClose: () => void }) {
  useFocusTrapOn(target, onClose);
  return null;
}

function TrappedDialog({ className, labelledBy, onClose, children }: { className: string; labelledBy: string; onClose: () => void; children: ReactNode }) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  return <div ref={ref} tabIndex={-1} className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</div>;
}
