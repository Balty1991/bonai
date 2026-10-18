/**
 * Atelierul Financiar — tablou mobil pentru o persoană sau o gospodărie, cu decizia următoare în prim-plan.
 * First paint: doar Astăzi. Restul ecranelor, sync-ul și formularele se încarcă la cerere.
 */
import { enrichSavedReceipt } from "@/lib/receipt-products";
import { splitGroupIds, storedMove } from "@/lib/split-payment";
import { recordRemovals } from "@/lib/removed-bin";
import { readAutoBackup, writeAutoBackup } from "@/lib/auto-backup";
import { saveLiveBackup } from "@/lib/app-storage";
import { applyDynamicColor, haptic, readDynamicColor } from "@/lib/native-feel";
import { askConfirm } from "@/lib/confirm-dialog";
import { isDemoMode, setDemoMode } from "@/lib/demo-data";
import { loggingStreak } from "@/lib/logging-habits";
import { askReviewAfterMilestone, loggedDays, REVIEW_AFTER_LOGGED_DAYS } from "@/lib/review-prompt";
import { createPortal } from "react-dom";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Archive, BarChart3, Bell, CloudOff, Users, RotateCcw, Inbox, LayoutGrid, MessagesSquare, MoreHorizontal, Plus, ReceiptText, Search, ShieldCheck, Wallet, X, Home as HomeIcon, ScanLine, ShoppingBasket, Store, UserRound } from "lucide-react";
import { isArchiveMode, setAppMode, useAppMode } from "@/lib/app-mode";
import "./shop.css";
import { allocationStatus, autoPostDueRecurring, createEmptyAppData, TOMBSTONE_MAX, rollIncomeHorizon, deviceTimeZone, setFamilyTimeZone, getFamilyTimeZone, adoptOutsideExpenses, commitLedgerEntry, learnMerchantRule, confirmRecurringPayment, addIsoDays, formatDate, inPlanPeriod, isoDate, isoToday, newId, transferBetweenEnvelopes, type AppData, type Debt, type Receipt, type ReceiptLine, type SavingsGoal, type Transaction } from "@/lib/finance-data";
import { addContribution, eventTraits } from "@/lib/planned-events";
import { applyDeclaredBalance } from "@/lib/balance-check";
import { levelStartedWeek, totalForWeeklyPace } from "@/lib/started-week";
import { clearReceiptImageStorage } from "@/lib/receipt-storage";
import { queueReceiptForReview, attachReceiptDetail } from "@/lib/receipt-review";
import { markCelebrated, pendingCelebration } from "@/lib/goal-celebration";
import { safeSetItem } from "@/lib/safe-storage";
import { closeTopDialog } from "@/hooks/use-focus-trap";
import { BrandMark } from "@/components/BrandMark";
import type { FinancialUpdate, GuidedRevert, NaturalDraft } from "@/components/AICompanion";
import type { ScanPrefill } from "@/lib/receipt-scan";
import { isAppLockEnabled } from "@/lib/app-lock";
import { useToday } from "@/hooks/useToday";
import { safeImport, warmLazy } from "@/lib/lazy-safe";
import { applySecureScreen } from "@/lib/secure-screen";
import { observeQuickActions, publishEnvelopes, publishShopping, publishSpendToday, publishWeek, publishWidgetTemplates, shoppingWidgetData } from "@/lib/quick-action-bridge";
import { visibleShopping } from "@/lib/shopping-list";
import { weekWidgetData } from "@/lib/week-widget";
import { hasQueuedFeedback } from "@/lib/feedback-queue";
import { useMemberMode } from "@/lib/member-mode";
import { MemberModeScreen } from "@/components/MemberModeScreen";
import {
  WhatsNewSheet,
  Modal,
  fmtExact,
  money,
  type MainView,
  type MoreView,
  ANALYSIS_TOOLS,
} from "@/pages/home-kit";
import { markWhatsNewSeen, shouldShowWhatsNew } from "@/lib/theme-default";
import { markFirstWeekTourSeen, shouldOfferFirstWeekTour } from "@/lib/first-week-tour";
import { daysLabel, t } from "@/lib/i18n";
import { todayBrief } from "@/lib/household-insights";
import { applyIncomeSplit, pendingSplitIncome } from "@/lib/monthly-needs";
import { applyPayday } from "@/lib/payday";
import { hideNativeSplash, syncAndroidChrome } from "@/lib/native-splash";
import { ensureDeferredStyles, deferredStylesReady } from "@/lib/ram-hygiene";
import { useLanguage } from "@/hooks/use-language";
import { useUndo } from "@/hooks/useUndo";
import { useThemeChrome } from "@/hooks/useThemeChrome";
import { useFamilySync } from "@/hooks/useFamilySync";
import { usePersistAppData, readInitialAppData } from "@/hooks/usePersistAppData";
import { useSimpleMode } from "@/hooks/useSimpleMode";
import { clearQuietStart, distinctExpenseDays, isQuietStart } from "@/lib/quiet-start";
import { setSimpleMode } from "@/lib/ui-prefs";
import { FAMILIE_OPEN_EVENT } from "@/lib/entitlements";
import { selfMemberOf } from "@/lib/member-identity";
import { isNativeApp } from "@/lib/app-storage";
import { buildUndoSave } from "@/lib/undo-delete";
import { formatInvite, parseInvite, takeInviteFromLocation } from "@/lib/family-invite";
import { openHouseholdGuide, TodayView as TodayViewRaw } from "@/pages/TodayView";
import { stableView } from "@/lib/stable-view";
const TodayView = stableView(TodayViewRaw);
import { reloadToNewVersion, useUpdateAvailable } from "@/lib/update-check";
import { labelWithQty } from "@/lib/receipt-review-model";

export { recentActivityMoves } from "@/pages/TodayView";

const ReceiptReview = lazy(safeImport(() => import("@/components/ReceiptReview").then((module) => ({ default: module.ReceiptReview }))));
const PlanStudio = lazy(safeImport(() => import("@/components/PlanStudio").then((module) => ({ default: stableView(module.PlanStudio) }))));
const MovementsJournal = lazy(safeImport(() => import("@/components/MovementsJournal").then((module) => ({ default: stableView(module.MovementsJournal) }))));
const AffordSheet = lazy(safeImport(() => import("@/components/AffordSheet").then((module) => ({ default: module.AffordSheet }))));
const GoalCelebration = lazy(safeImport(() => import("@/components/GoalCelebration").then((module) => ({ default: module.GoalCelebration }))));
const QuickEntryPanel = lazy(safeImport(() => import("@/components/QuickEntryPanel").then((module) => ({ default: module.QuickEntryPanel }))));
const FirstWeekTour = lazy(safeImport(() => import("@/components/FirstWeekTour").then((module) => ({ default: module.FirstWeekTour }))));
const FinancialCalendarView = lazy(safeImport(() => import("@/components/FinancialCalendarView").then((module) => ({ default: module.FinancialCalendarView }))));
const ThemePicker = lazy(safeImport(() => import("@/pages/ThemePicker").then((module) => ({ default: module.ThemePicker }))));
const QuickActionsPalette = lazy(safeImport(() => import("@/pages/QuickActionsPalette").then((module) => ({ default: module.QuickActionsPalette }))));
const CalmOnboarding = lazy(safeImport(() => import("@/pages/QuickActionsPalette").then((module) => ({ default: module.CalmOnboarding }))));
const TransactionForm = lazy(safeImport(() => import("@/pages/TransactionForm").then((module) => ({ default: module.TransactionForm }))));
const GoalForm = lazy(safeImport(() => import("@/pages/GoalForms").then((module) => ({ default: module.GoalForm }))));
const DebtPaymentForm = lazy(safeImport(() => import("@/pages/GoalForms").then((module) => ({ default: module.DebtPaymentForm }))));
const ReceiptForm = lazy(safeImport(() => import("@/pages/ReceiptForm").then((module) => ({ default: module.ReceiptForm }))));
const SpendingHabitsView = lazy(safeImport(() => import("@/pages/HabitsGoals").then((module) => ({ default: module.SpendingHabitsView }))));
const LongTermGoalsView = lazy(safeImport(() => import("@/pages/HabitsGoals").then((module) => ({ default: module.LongTermGoalsView }))));
const ObjectivesView = lazy(safeImport(() => import("@/pages/ObjectivesView").then((module) => ({ default: module.ObjectivesView }))));
const InsightsView = lazy(safeImport(() => import("@/pages/InsightsView").then((module) => ({ default: module.InsightsView }))));
const MoreViewScreen = lazy(safeImport(() => import("@/pages/home-secondary").then((module) => ({ default: module.MoreView }))));
const WeekCloseSheet = lazy(safeImport(() => import("@/components/WeekCloseSheet").then((module) => ({ default: module.WeekCloseSheet }))));
const PaydaySheet = lazy(safeImport(() => import("@/components/PaydaySheet").then((module) => ({ default: module.PaydaySheet }))));
const ShopHome = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.ShopHome }))));
const StoresView = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.StoresView }))));
const BonAIAssistant = lazy(safeImport(() => import("@/components/BonAIAssistant")));
const HouseCostsPanel = lazy(safeImport(() => import("@/components/HouseCostsPanel")));
const ListView = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.ListView }))));
const PricesView = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.PricesView }))));
const HouseView = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.HouseView }))));
const ShopWelcome = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.ShopWelcome }))));
const ReceiptScanButton = lazy(safeImport(() => import("@/components/ReceiptScanButton").then((module) => ({ default: module.ReceiptScanButton }))));
const FirstRunSetup = lazy(safeImport(() => import("@/components/FirstRunSetup").then((module) => ({ default: module.FirstRunSetup }))));
const AICompanion = lazy(safeImport(() => import("@/components/AICompanion").then((module) => ({ default: module.AICompanion }))));

/**
 * Link direct către un ecran. Lista era scrisă de mână și rămăsese în urmă: „goals”,
 * „habits” și „calendar” cădeau tăcut înapoi pe Astăzi, deși ecranele există — un link
 * dintr-o notificare sau o scurtătură ducea în altă parte decât spunea.
 */
const MAIN_VIEWS: MainView[] = ["shop", "list", "products", "stores", "house", "today", "journal", "plan", "obligations", "goals", "habits", "calendar", "insights", "utilities"];
const initialMainView = (): MainView => {
  const requested = new URLSearchParams(window.location.search).get("view") as MainView | null;
  return requested && MAIN_VIEWS.includes(requested) ? requested : "today";
};

/** Ecranul nou intră ușor (opacitate și 4 px, doar pe placa video), nu apare brusc. Fără animație la „Reduce mișcarea”. */
let screenEntered = false;
const enterScreen = (main: HTMLElement | null) => {
  const first = !screenEntered; screenEntered = true;
  const page = main?.firstElementChild as HTMLElement | null;
  if (first || !page || typeof page.animate !== "function" || page.classList.contains("is-entering")) return;
  try { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch { return; }
  page.animate([{ opacity: 0.35, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
};
let secondaryModule: typeof import("@/pages/home-secondary") | undefined;
const loadSecondary = () => preloadView("utilities").then(() => import("@/pages/home-secondary")).then((module) => (secondaryModule = module));
const warmedViews = new Set<MainView>(["today"]);
const preloadView = (id: MainView): Promise<void> => {
  const task = id === "journal" ? warmLazy(MovementsJournal)
    : id === "plan" ? warmLazy(PlanStudio)
    : id === "calendar" ? warmLazy(FinancialCalendarView)
    : id === "insights" ? warmLazy(InsightsView).then(() => import("@/pages/InsightsView")).then((module) => module.preloadInsights())
    : id === "obligations" ? warmLazy(ObjectivesView)
    : id === "goals" || id === "habits" ? warmLazy(id === "goals" ? LongTermGoalsView : SpendingHabitsView)
    : id === "utilities" ? warmLazy(MoreViewScreen)
    : id === "shop" || id === "list" || id === "products" || id === "stores" || id === "house" ? warmLazy(ShopHome)
    : Promise.resolve();
  return task.then(() => { warmedViews.add(id); });
};

export default function Home() {
  const updateAvailable = useUpdateAvailable();
  const [data, setData] = useState<AppData>(readInitialAppData);
  const { storageNotice, setStorageNotice, storageReady, applyData: applyDataRaw } = usePersistAppData(data, setData);
  /** Arhiva veche e doar pentru citire: nicio scriere nu trece cât e deschisă (datele rămân neatinse). */
  const applyData: typeof applyDataRaw = (value) => {
    if (isArchiveMode()) { setStorageNotice(t("Arhiva veche e doar pentru citire. Nimic nu s-a schimbat.")); return; }
    applyDataRaw(value);
  };
  /** „Azi” al familiei: se setează înainte de orice calcul din randare (testare, #10). */
  setFamilyTimeZone(data.settings.familyTimeZone);
  /** Mesajele de feedback trimise fără internet pleacă la prima deschidere cu rețea. */
  // Firebase se încarcă doar dacă e un mesaj de trimis, nu la fiecare pornire.
  useEffect(() => { if (hasQueuedFeedback()) void import("@/lib/feedback").then(({ flushFeedbackQueue }) => flushFeedbackQueue()).catch(() => undefined); }, []);
  /** Venit neregulat: perioada „banii să-mi ajungă N zile” pornește din ziua de azi (M6). */
  const todayIso = isoToday();
  useEffect(() => {
    if (!storageReady || !data.settings.salaryPlan.horizonDays) return;
    setData((current) => rollIncomeHorizon(current, todayIso));
  }, [storageReady, todayIso, data.settings.salaryPlan.horizonDays]);
  useEffect(() => {
    if (!storageReady || data.settings.familyTimeZone) return;
    const zone = deviceTimeZone();
    if (zone) setData((current) => current.settings.familyTimeZone ? current : { ...current, settings: { ...current.settings, familyTimeZone: zone } });
  }, [storageReady, data.settings.familyTimeZone]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [demo, setDemo] = useState(() => isDemoMode());
  /** Ieșirea din familia exemplu: registrul gol și pornirea de la început. */
  const leaveDemo = async () => {
    if (!await askConfirm(t("Ștergem familia exemplu și pornești cu datele tale."), { confirmLabel: t("Încep cu datele mele") })) return;
    setDemoMode(false);
    setDemo(false);
    applyData(createEmptyAppData());
    try { window.localStorage.removeItem("buget-familie:setup-complete"); window.localStorage.removeItem("buget-familie:onboarding-complete"); } catch { /* fără stocare */ }
    setSetupOpen(true);
  };
  const [setupOpen, setSetupOpen] = useState(() => {
    try {
      if (window.localStorage.getItem("buget-familie:setup-complete")) return false;
      const seed = readInitialAppData();
      const hasStarted = seed.transactions.length > 0 || seed.settings.salaryPlan.allocations.length > 0 || seed.debts.length > 0 || seed.savings.length > 0 || seed.settings.paymentSources.some((source) => source.openingBalance > 0) || Boolean(seed.settings.salaryPlan.nextPayday);
      return !hasStarted;
    } catch {
      return false;
    }
  });
  const { simpleMode } = useSimpleMode();
  useEffect(() => {
    if (!storageReady || !isQuietStart()) return;
    if (distinctExpenseDays(data.transactions) < 3) return;
    clearQuietStart();
    setSimpleMode(false);
  }, [storageReady, data.transactions]);
  // „Telefonul lui X”: un singur ecran, doar pentru persoana aceea (copil, bunic).
  const memberMode = useMemberMode();
  const memberModeActive = Boolean(memberMode && data.settings.members.some((item) => item.id === memberMode));
  // La miezul nopții ecranul se reface: cifrele memorate pe ziua de ieri nu mai stau pe ecran.
  const today = useToday();
  useLayoutEffect(() => {
    hideNativeSplash();
    syncAndroidChrome();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.simpleMode = simpleMode ? "1" : "0";
    return () => { delete document.documentElement.dataset.simpleMode; };
  }, [simpleMode]);
  useLanguage();
  const appMode = useAppMode();
  // Migrarea la BonAI (schema 2): o dată pe telefon, după încărcare, cu copie completă înainte.
  useEffect(() => { if (storageReady) void import("@/lib/bonut-migration").then((module) => module.runBonutMigration(data)).catch(() => undefined); }, [storageReady]);
  const [view, setView] = useState<MainView>(() => { const first = initialMainView(); return appMode === "shop" && first === "today" ? "shop" : first; });
  const [more, setMoreNow] = useState<MoreView>("overview");
  const goSeq = useRef(0);
  const moreSeq = useRef(0);
  const moreReady = useRef<Promise<void>>(Promise.resolve());
  /** O filă din Mai mult se schimbă abia când panoul ei e încărcat: rămâne ecranul vechi, nu clipește scheletul. */
  const setMore = useCallback((tab: MoreView) => {
    const seq = ++moreSeq.current;
    if (secondaryModule?.isMoreTabWarm(tab)) { moreReady.current = Promise.resolve(); setMoreNow(tab); return; }
    moreReady.current = loadSecondary().then((module) => module.preloadMoreTab(tab)).catch(() => undefined).then(() => { if (seq === moreSeq.current) setMoreNow(tab); });
  }, []);
  const showTools = useCallback(() => { const seq = ++goSeq.current; void moreReady.current.then(() => { if (seq === goSeq.current) setView("utilities"); }); }, []);
  /** Ecranul de unde s-a deschis un instrument, ca „Înapoi” să ducă tot acolo (testare, #6). */
  const [moreReturn, setMoreReturn] = useState<{ view: MainView; label: string } | null>(null);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [guideOn, setGuideOn] = useState(false);
  const [costsKind, setCostsKind] = useState<"sub" | "bill">();
  const [modal, setModal] = useState<"quick" | "transaction" | "receipt" | "debt" | "saving" | "debt-payment" | "scan" | "review" | null>(null);
  const [quickTemplateId, setQuickTemplateId] = useState<string | undefined>(undefined);
  const [quickKind, setQuickKind] = useState<"income" | undefined>(undefined);
  const [quickMoving, setQuickMoving] = useState(false);
  const [quickVoice, setQuickVoice] = useState(false);
  const [paydayOpen, setPaydayOpen] = useState(false);
  const [weekCloseOpen, setWeekCloseOpen] = useState(false);
  useEffect(() => {
    // „Închide săptămâna”: restul plicurilor și soldul, duminică seara sau luni.
    const openWeekClose = () => setWeekCloseOpen(true);
    window.addEventListener("buget-familie:open-week-close", openWeekClose);
    return () => window.removeEventListener("buget-familie:open-week-close", openWeekClose);
  }, []);
  useEffect(() => {
    // „A intrat salariul”: venitul, luna nouă, plicurile și ratele, într-un singur ecran.
    const openPayday = () => setPaydayOpen(true);
    window.addEventListener("buget-familie:open-payday", openPayday);
    return () => window.removeEventListener("buget-familie:open-payday", openPayday);
  }, []);
  useEffect(() => {
    // „Notează salariul” de pe Astăzi: formularul rapid, direct pe Venit.
    const openIncome = () => { setQuickTemplateId(undefined); setQuickKind("income"); setModal("quick"); };
    window.addEventListener("buget-familie:open-income", openIncome);
    return () => window.removeEventListener("buget-familie:open-income", openIncome);
  }, []);
  useEffect(() => {
    // Lista de cumpărături: „Notează plata” deschide formularul rapid pe Alimente (implicit).
    const openExpense = () => { setQuickTemplateId(undefined); setQuickKind(undefined); setEditTx(undefined); setModal("quick"); };
    const openTransfer = () => { setQuickTemplateId(undefined); setQuickKind(undefined); setQuickMoving(true); setModal("quick"); };
    window.addEventListener("buget-familie:open-transfer", openTransfer);
    const openShopping = () => { setMoreReturn({ view: "today", label: t("Înapoi la Astăzi") }); setMore("shopping"); showTools(); };
    window.addEventListener("buget-familie:open-expense", openExpense);
    const openTrip = () => { setMoreReturn({ view: "today", label: t("Înapoi la Astăzi") }); setMore("trip"); showTools(); };
    window.addEventListener("buget-familie:open-shopping", openShopping);
    window.addEventListener("buget-familie:open-trip", openTrip);
    const openAfford = () => setAffordOpen(true);
    const openAdvisor = () => { setMoreReturn({ view: "today", label: t("Înapoi la Astăzi") }); setMore("advisor"); showTools(); };
    window.addEventListener("buget-familie:open-advisor", openAdvisor);
    const openYearPlan = () => { setMoreReturn({ view: "today", label: t("Înapoi la Astăzi") }); setMore("year-plan"); showTools(); };
    window.addEventListener("buget-familie:open-year-plan", openYearPlan);
    const openCharts = () => { setMoreReturn({ view: "today", label: t("Înapoi la Astăzi") }); setMore("charts"); showTools(); };
    window.addEventListener("buget-familie:open-charts", openCharts);
    // Din Analiză: raportul lunii, graficele, tendințele, calendarul și planul pe 12 luni; „Înapoi” duce tot în Analiză.
    const openAnalysisTool = (event: Event) => { const tab = (event as CustomEvent<MoreView>).detail; if (!ANALYSIS_TOOLS.includes(tab)) return; setMoreReturn({ view: "insights", label: t("Înapoi la Analiză") }); setMore(tab); showTools(); };
    window.addEventListener("buget-familie:open-analysis-tool", openAnalysisTool);
    window.addEventListener("buget-familie:open-afford", openAfford);
    return () => { window.removeEventListener("buget-familie:open-expense", openExpense); window.removeEventListener("buget-familie:open-charts", openCharts); window.removeEventListener("buget-familie:open-analysis-tool", openAnalysisTool); window.removeEventListener("buget-familie:open-shopping", openShopping); window.removeEventListener("buget-familie:open-trip", openTrip); window.removeEventListener("buget-familie:open-afford", openAfford); window.removeEventListener("buget-familie:open-transfer", openTransfer); window.removeEventListener("buget-familie:open-advisor", openAdvisor); window.removeEventListener("buget-familie:open-year-plan", openYearPlan); };
  }, []);
  useEffect(() => {
    const openEvents = () => { setMoreReturn({ view: "today", label: t("Înapoi la Astăzi") }); setMore("events"); showTools(); };
    window.addEventListener("buget-familie:open-events", openEvents);
    return () => window.removeEventListener("buget-familie:open-events", openEvents);
  }, []);
  useEffect(() => { if (modal !== "quick") { setQuickKind(undefined); setQuickMoving(false); } }, [modal]);
  const [editTx, setEditTx] = useState<Transaction>();
  const [scanPrefill, setScanPrefill] = useState<ScanPrefill>();
  const [editGoal, setEditGoal] = useState<Debt | SavingsGoal>();
  const receiptStorageNotice = "";
  const legacyReceiptMigrationStarted = useRef(false);
  const setupOffered = useRef(setupOpen);
  // Obiectiv atins: o felicitare pe obiectiv, pe telefonul acesta.
  const [affordOpen, setAffordOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<SavingsGoal | undefined>(undefined);
  useEffect(() => { const goal = pendingCelebration(data.savings, typeof window !== "undefined" ? window.localStorage : undefined); if (goal) setCelebrate(goal); }, [data.savings]);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false); const [firstWeekTourOpen, setFirstWeekTourOpen] = useState(false);
  const {
    themePickerOpen, setThemePickerOpen,
    activeTheme, setTheme,
    themeSchedule, setThemeSchedule,
    background, setBackground,
    highContrast, setHighContrast,
    scheduleTimes, setScheduleTimes,
  } = useThemeChrome();

  useEffect(() => {
    if (!storageReady) return;
    const win = window as Window & { requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number; cancelIdleCallback?: (id: number) => void };
    const run = () => { void import("@/lib/local-notifications").then((module) => module.scheduleFinancialReminders(data)); };
    if (typeof win.requestIdleCallback === "function") {
      const id = win.requestIdleCallback(run, { timeout: 4000 });
      return () => win.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(run, 1200);
    return () => window.clearTimeout(id);
  }, [data, storageReady]);
  // Pozele bonurilor nu se păstrează. Cele rămase din versiunile vechi se șterg o dată de pe telefon.
  useEffect(() => { if (legacyReceiptMigrationStarted.current || !storageReady) return; legacyReceiptMigrationStarted.current = true; void clearReceiptImageStorage().catch(() => undefined); if (data.receipts.some((receipt) => receipt.imageData || receipt.imageData2 || receipt.imageKeys?.length)) setData((current) => ({ ...current, receipts: current.receipts.map(({ imageData: _one, imageData2: _two, imageKeys: _keys, ...receipt }) => receipt) })); }, [data.receipts, storageReady]);
  // Pe telefon derulează <main>, nu fereastra: ecranul nou se deschidea la poziția celui vechi. Sus, înainte de desen.
  // Întors în lista Mai mult, omul o regăsește unde a lăsat-o.
  const scrollMemo = useRef<Partial<Record<string, number>>>({});
  const scrollKey = view === "utilities" ? `utilities:${more}` : view;
  const scrollKeyNow = useRef(scrollKey);
  useLayoutEffect(() => { scrollKeyNow.current = scrollKey; const main = document.getElementById("main-content"); const top = scrollKey === "utilities:overview" ? scrollMemo.current[scrollKey] || 0 : 0; if (main && main.scrollTop !== top) main.scrollTop = top; enterScreen(main); if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [scrollKey]);
  useEffect(() => { const main = document.getElementById("main-content"); if (!main) return; const remember = () => { if (scrollKeyNow.current === scrollKey) scrollMemo.current[scrollKey] = main.scrollTop; }; main.addEventListener("scroll", remember, { passive: true }); return () => main.removeEventListener("scroll", remember); }, [scrollKey]); useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setQuickActionsOpen((open) => !open); } if (event.key === "Escape") setQuickActionsOpen(false); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, []); useEffect(() => { const replay = () => setOnboardingOpen(true); const replaySetup = () => setSetupOpen(true); const openTutorial = () => { setMore("guide"); go("utilities"); }; window.addEventListener("buget-familie:replay-onboarding", replay); window.addEventListener("buget-familie:replay-setup", replaySetup); window.addEventListener("buget-familie:open-usage-tutorial", openTutorial); const hasStarted = data.transactions.length > 0 || data.settings.salaryPlan.allocations.length > 0 || data.debts.length > 0 || data.savings.length > 0 || data.settings.paymentSources.some((source) => source.openingBalance > 0) || Boolean(data.settings.salaryPlan.nextPayday); if (hasStarted && !window.localStorage.getItem("buget-familie:setup-complete")) safeSetItem(window.localStorage, "buget-familie:setup-complete", "true"); if (storageReady && !window.localStorage.getItem("buget-familie:setup-complete") && !hasStarted && !setupOffered.current) { setupOffered.current = true; safeSetItem(window.localStorage, "buget-familie:onboarding-complete", "true"); setSetupOpen(true); } return () => { window.removeEventListener("buget-familie:replay-onboarding", replay); window.removeEventListener("buget-familie:replay-setup", replaySetup); window.removeEventListener("buget-familie:open-usage-tutorial", openTutorial); }; }, [storageReady, data.transactions.length, data.settings.salaryPlan.allocations.length, data.debts.length, data.savings.length, data.settings.paymentSources, data.settings.salaryPlan.nextPayday]);
  useEffect(() => {
    if (!storageReady || onboardingOpen || setupOpen || appMode === "shop") return;
    const started = data.transactions.length > 0 || data.settings.salaryPlan.allocations.length > 0;
    if (shouldOfferFirstWeekTour({
      storage: window.localStorage,
      blocked: Boolean(modal) || (view === "utilities" && more === "sync"),
      hasModal: Boolean(modal),
      onSyncScreen: view === "utilities" && more === "sync",
      hasStarted: started,
    })) {
      setFirstWeekTourOpen(true);
      return;
    }
    if (shouldShowWhatsNew(window.localStorage) && !modal && !(view === "utilities" && more === "sync") && started) setWhatsNewOpen(true);
  }, [storageReady, onboardingOpen, setupOpen, modal, more, view, data.transactions.length, data.settings.salaryPlan.allocations.length, appMode]);
  const dismissWhatsNew = () => { markWhatsNewSeen(window.localStorage); setWhatsNewOpen(false); };
  const dismissFirstWeekTour = () => { markFirstWeekTourSeen(window.localStorage); setFirstWeekTourOpen(false); };
  // Cine a notat deja trei cheltuieli a învățat gestul: indiciul „1 · CAPTURĂ” nu mai stă pe Astăzi.
  const capturedEnough = data.transactions.filter((item) => item.kind === "expense").length >= 3;
  useEffect(() => { if (firstWeekTourOpen && capturedEnough) dismissFirstWeekTour(); }, [firstWeekTourOpen, capturedEnough]);

  const update = (fn: (current: AppData) => AppData) => applyData((current) => fn(current));
  /**
   * „Șterse recent”: orice mișcare sau bon care dispare din registru, pe orice drum (ștergere, corectură,
   * sincronizare, o greșeală), se păstrează pe telefon 60 de zile și se poate pune înapoi din Mișcări.
   */
  const lastLedger = useRef<AppData | null>(null);
  useEffect(() => {
    if (!storageReady) return;
    if (lastLedger.current) recordRemovals(lastLedger.current, data);
    lastLedger.current = data;
  }, [data, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    applyData((current) => adoptOutsideExpenses(current));
    // Doar când se schimbă plicurile sau numărul de mișcări, nu la fiecare randare.
  }, [storageReady, data.settings.salaryPlan.allocations, data.transactions.length]);

  const { undo, setUndo, runUndo, deleteWithUndo, offerUndo } = useUndo(data, applyData);
  const go = (target: MainView) => {
    // În aplicația nouă, „Astăzi” (sigla, linkurile vechi) duce la Acasă, a cumpărăturilor.
    const next = appMode === "shop" && target === "today" ? "shop" : target;
    const seq = ++goSeq.current;
    if (next !== "utilities") setMoreReturn(null);
    if (next === view) return;
    haptic("tick");
    const paint = () => { if (seq === goSeq.current) setView(next); };
    const stylesReady = next === "today" || deferredStylesReady();
    const tabReady = next === "utilities" ? moreReady.current : undefined;
    if (stylesReady && warmedViews.has(next) && !tabReady) { paint(); return; }
    // Fără rețea, o bucată poate să nu se încarce: ecranul se schimbă oricum (arată „offline”), nu rămâne blocat.
    void Promise.all([preloadView(next), stylesReady ? Promise.resolve() : ensureDeferredStyles(), tabReady]).then(paint, paint);
  };
  useEffect(() => {
    const id = window.setTimeout(() => {
      void ensureDeferredStyles();
      void preloadView("plan");
      void preloadView("journal");
      void preloadView("utilities");
      void preloadView("obligations");
      void preloadView("insights");
      void preloadView("goals");
    }, 700);
    // Apoi, pe rând, în timpii morți: toate filele din Mai mult, ca prima deschidere să fie la fel de lină ca a doua.
    let stopped = false;
    const idle = (fn: () => void) => { const win = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }; if (typeof win.requestIdleCallback === "function") win.requestIdleCallback(fn, { timeout: 3000 }); else window.setTimeout(fn, 200); };
    const later = window.setTimeout(() => void loadSecondary().then((module) => {
      const forms = [QuickEntryPanel, TransactionForm, ReceiptForm, GoalForm, DebtPaymentForm, QuickActionsPalette, ThemePicker].map((form) => () => warmLazy(form));
      const queue: (() => Promise<unknown>)[] = [...forms, ...module.MORE_TABS.map((tab) => () => module.preloadMoreTab(tab)), () => preloadView("habits"), () => preloadView("calendar")];
      const next = () => { if (stopped) return; const task = queue.shift(); if (!task) return; void task().catch(() => undefined).finally(() => idle(next)); };
      idle(next);
    }).catch(() => undefined), 2500);
    return () => { stopped = true; window.clearTimeout(id); window.clearTimeout(later); };
  }, []);
  useEffect(() => {
    if (view !== "today" || modal) void ensureDeferredStyles();
  }, [view, modal]);
  useEffect(() => {
    const openCatalog = (event: Event) => {
      const query = (event as CustomEvent<{ query?: string }>).detail?.query || "";
      try {
        if (query) sessionStorage.setItem("buget-familie:catalog-query", query);
        else sessionStorage.removeItem("buget-familie:catalog-query");
      } catch { /* ignore */ }
      setMore("catalog");
      go("utilities");
    };
    window.addEventListener("buget-familie:open-catalog", openCatalog);
    return () => window.removeEventListener("buget-familie:open-catalog", openCatalog);
  }, []);
  useEffect(() => {
    const openSync = () => {
      setMoreReturn({ view: "today", label: t("Înapoi la Astăzi") });
      setMore("sync");
      go("utilities");
    };
    window.addEventListener("buget-familie:open-sync", openSync);
    return () => window.removeEventListener("buget-familie:open-sync", openSync);
  }, []);
  useEffect(() => {
    const openFamilie = () => {
      setMore("settings");
      go("utilities");
      void import("@/pages/SettingsPanel");
      const started = Date.now();
      const tick = () => {
        const node = document.getElementById("bf-familie-plan");
        if (node) {
          // Setările sunt grupate în secțiuni pliabile: întâi deschidem grupul.
          node.closest("details")?.setAttribute("open", "");
          node.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        if (Date.now() - started < 2500) window.setTimeout(tick, 50);
      };
      window.setTimeout(tick, 80);
    };
    window.addEventListener(FAMILIE_OPEN_EVENT, openFamilie);
    return () => window.removeEventListener(FAMILIE_OPEN_EVENT, openFamilie);
  }, []);
  useEffect(() => {
    const onOpenGuide = () => setGuideOn(true);
    window.addEventListener("buget-familie:open-guide", onOpenGuide);

    return () => { window.removeEventListener("buget-familie:open-guide", onOpenGuide); };
  }, []);
  useEffect(() => {
    const skip = document.querySelector(".bf-skip-link");
    if (skip instanceof HTMLElement && skip === document.activeElement) skip.blur();
  }, []);

  const { syncPanelProps, offerInvite } = useFamilySync(data, setData, storageReady);
  /** Link de invitație (`#alatura=…`): deschidem Sync cu invitația pusă deja în câmp. */
  useEffect(() => {
    const invite = takeInviteFromLocation();
    if (!invite) return;
    offerInvite(formatInvite(invite));
    // Telefonul nou intră direct în familie; configurarea vine din camera ei.
    setSetupOpen(false);
    setMore("sync");
    go("utilities");
    // O singură dată, la deschiderea linkului.
  }, []);
  /**
   * Aplicația Android deschisă din „Deschide în aplicație” (bugetfamilie://alatura?cod=…):
   * aceeași invitație, pusă în câmp, fără să intrăm singuri în familie.
   */
  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    const accept = (url: string | undefined) => {
      const invite = url ? parseInvite(decodeURIComponent(url)) : undefined;
      if (!invite) return;
      offerInvite(formatInvite(invite));
      setSetupOpen(false);
      setMore("sync");
      go("utilities");
    };
    void import("@capacitor/app").then(async ({ App }) => {
      accept((await App.getLaunchUrl().catch(() => undefined))?.url);
      const handle = await App.addListener("appUrlOpen", (event) => accept(event.url));
      remove = () => void handle.remove();
    }).catch(() => undefined);
    return () => remove?.();
  }, []);
  /**
   * Înapoi pe Android: întâi dialogul de sus, apoi fereastra, apoi „Mai mult”, apoi Astăzi.
   * Doar de pe Astăzi iese din aplicație; altfel o ciornă scrisă se pierdea dintr-o atingere.
   */
  const backStateRef = useRef({ modal, view, more });
  backStateRef.current = { modal, view, more };
  useEffect(() => {
    let remove: (() => void) | undefined;
    void import("@capacitor/core").then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      return import("@capacitor/app").then(async ({ App }) => {
        const handle = await App.addListener("backButton", () => {
          const state = backStateRef.current;
          if (closeTopDialog()) return;
          if (state.modal) { setModal(null); return; }
          if (state.view === "utilities" && state.more !== "overview") { setMore("overview"); return; }
          if (state.view !== "today") { go("today"); return; }
          void App.exitApp();
        });
        remove = () => void handle.remove();
      });
    }).catch(() => undefined);
    return () => remove?.();
  }, []);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => { const applySettings = (event: Event) => { const patch = (event as CustomEvent<Partial<AppData["settings"]>>).detail; if (!patch) return; applyData((current) => ({ ...current, settings: { ...current.settings, ...patch } })); }; window.addEventListener("buget-familie:local-settings", applySettings); return () => window.removeEventListener("buget-familie:local-settings", applySettings); }, []);
  const saveTx = (item: Transaction | Transaction[], meta?: { fromWeekIndex?: number; learnRule?: { match: string; category: string; allocationId?: string }; detailLines?: ReceiptLine[]; removeIds?: string[]; vendor?: string; scanLines?: ScanPrefill["lines"]; store?: ScanPrefill["store"] }) => {
    let failed: Error | undefined;
    const saved = Array.isArray(item) ? item : [item];
    /** Doar mișcările noi primesc „Anulează”; o corectură se refac din formular. */
    const fresh = saved.every((entry) => !data.transactions.some((existing) => existing.id === entry.id));
    update((current) => {
      try {
        const list = Array.isArray(item) ? item : [item];
        const next = list.reduce((ledger, entry) => commitLedgerEntry(ledger, entry, meta?.fromWeekIndex), current);
        const learned = meta?.learnRule ? learnMerchantRule(next, meta.learnRule) : next;
        // O singură sursă din nou: a doua parte a bonului pleacă, cu piatră de mormânt pentru sincronizare.
        const removeIds = meta?.removeIds || [];
        const trimmed = removeIds.length ? { ...learned, transactions: learned.transactions.filter((entry) => !removeIds.includes(entry.id)), deleted: [...learned.deleted, ...removeIds.map((id) => ({ entity: "transactions" as const, id, deletedAt: new Date().toISOString() }))].slice(-TOMBSTONE_MAX) } : learned;
        // Bonul plătit din două surse are articolele pe prima parte, cu totalul întreg.
        const sameReceipt = list.length === 1 || (list.length > 1 && Boolean(list[0].splitId) && list.every((entry) => entry.splitId === list[0].splitId));
        if (!(meta?.detailLines && sameReceipt)) return trimmed;
        const attached = attachReceiptDetail(trimmed, list[0].id, meta.detailLines, Math.round(list.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100, meta.vendor);
        // Bonul scanat: marca, gramajul și magazinul (CUI, oraș, ora) se lipesc de rândurile verificate.
        return meta.scanLines ? enrichSavedReceipt(attached, list[0].id, meta.scanLines, meta.store) : scanPrefill ? enrichSavedReceipt(attached, list[0].id, scanPrefill.lines, scanPrefill.store) : attached;
      } catch (reason) {
        failed = reason instanceof Error ? reason : new Error(t("Nu am putut salva mișcarea."));
        return current;
      }
    });
    if (failed) throw failed;
    if (fresh && saved.length) {
      haptic("confirm");
      const base = saved.length === 1
        ? t("Notat · {title} · {amount}", { title: saved[0].title, amount: money(saved[0].amount) })
        : t("Notat · {count} mișcări", { count: saved.length });
      // De la 3 zile la rând, „Notat” spune și seria: obiceiul se vede, fără puncte și medalii.
      const streak = loggingStreak([...data.transactions, ...saved], isoToday());
      const label = streak >= 3 ? `${base} · ${t("{count} zile la rând", { count: streak })}` : base;
      offerUndo(buildUndoSave(label, saved.map((entry) => entry.id)));
      // A zecea zi cu cheltuieli notate e un moment bun pentru fereastra de recenzie a Play.
      if (loggedDays([...data.transactions, ...saved]) >= REVIEW_AFTER_LOGGED_DAYS) void askReviewAfterMilestone();
    }
  };
  const applyFinancialUpdate = (change: FinancialUpdate) => update((current) => { const member = current.settings.members.find((item) => "memberId" in change && change.memberId && item.id === change.memberId) || current.settings.members[0]; const source = current.settings.paymentSources.find((item) => item.memberId && member && item.memberId === member.id) || current.settings.paymentSources[0]; const now = new Date().toISOString(); if (change.kind === "income" && member && source) { const incomeSource = current.settings.paymentSources.find((item) => item.memberId === member.id && item.kind !== "meal") || current.settings.paymentSources.find((item) => item.kind !== "meal") || source; const incomeCaptureId = ("clientCaptureId" in change && change.clientCaptureId) || newId("guided-income"); if (current.transactions.some((item) => item.id === incomeCaptureId || (item.kind === "income" && item.memberId === member.id && item.amount === change.amount && item.title === change.title && item.date === (change.date || isoToday())))) return current; const transaction: Transaction = { id: incomeCaptureId, title: change.title, amount: change.amount, kind: "income", category: "Venit", sourceId: incomeSource.id, source: incomeSource.name, memberId: member.id, person: member.name, date: change.date || isoToday(), note: t("Venit adăugat împreună cu ghidul AI"), createdAt: now }; return { ...current, transactions: [transaction, ...current.transactions] }; } if (change.kind === "debt") { const key = change.name.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim(); const existingIndex = current.debts.findIndex((item) => item.name.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim() === key); const nextDebt: Debt = { id: existingIndex >= 0 ? current.debts[existingIndex].id : newId("guided-debt"), name: change.name, remaining: change.remaining, monthly: existingIndex >= 0 ? current.debts[existingIndex].monthly : 0, due: change.due || (existingIndex >= 0 ? current.debts[existingIndex].due : "Nespecificat"), memberId: member?.id, tone: existingIndex >= 0 ? current.debts[existingIndex].tone : "coral", updatedAt: now }; const debts = existingIndex >= 0 ? current.debts.map((item, index) => index === existingIndex ? nextDebt : item) : [nextDebt, ...current.debts]; return { ...current, debts }; } if (change.kind === "debt-monthly") { const key = change.name?.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim(); const index = key ? current.debts.findIndex((item) => item.name.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim() === key) : 0; if (index < 0) return current; return { ...current, debts: current.debts.map((item, itemIndex) => itemIndex === index ? { ...item, monthly: change.amount, updatedAt: now } : item) }; } if (change.kind === "expense" && member && source) { const day = change.date || isoToday(); const usedSource = current.settings.paymentSources.find((item) => item.id === change.sourceId) || source; const usedMember = current.settings.members.find((item) => item.id === change.memberId) || member; const expenseCaptureId = change.clientCaptureId || newId("guided-expense"); if (current.transactions.some((item) => item.id === expenseCaptureId)) return current; if (change.recurringId && current.transactions.some((item) => item.recurringId === change.recurringId && inPlanPeriod(item.date, current.settings.salaryPlan))) return current; const transaction: Transaction = { id: expenseCaptureId, title: change.title, amount: change.amount, kind: "expense", category: change.category, sourceId: usedSource.id, source: usedSource.name, memberId: usedMember.id, person: usedMember.name, date: day, allocationId: change.allocationId || "outside", recurringId: change.recurringId, note: change.recurringId ? t("Plată recurentă confirmată") : t("Cheltuială adăugată împreună cu ghidul AI"), createdAt: now }; try { const next = commitLedgerEntry(current, transaction, change.fromWeekIndex); if (change.kind === "expense" && change.receiptDraft?.items?.length) { const receipt: Receipt = { id: newId("guided-receipt"), vendor: change.receiptDraft.vendor || change.title, amount: change.amount, category: change.category, date: day, sourceId: usedSource.id, memberId: usedMember.id, linkedTransactionId: transaction.id, note: t("Bon citit de ghid — produsele sunt în rubrica Bonuri."), lines: change.receiptDraft.items.map((item, index) => ({ id: `guided-line-${index}`, category: item.category, amount: item.amount, label: item.label })), updatedAt: now }; return { ...next, receipts: [receipt, ...next.receipts] }; } return next; } catch { return current; } } if (change.kind === "transfer") return transferBetweenEnvelopes(current, { fromAllocationId: change.fromId, toAllocationId: change.toId, amount: change.amount, note: t("Realocare din ghidul AI") }) || current; if (change.kind === "recurring") {
      const source = current.settings.paymentSources.find((item) => item.memberId === member?.id) || current.settings.paymentSources[0];
      if (!source || !member) return current;
      const item = { id: newId("recurring"), name: change.name, amount: change.amount, category: change.category, sourceId: source.id, memberId: member.id, dueDay: Math.min(31, Math.max(1, change.dueDay)), active: true, autoPost: false, updatedAt: now };
      return { ...current, recurring: [...current.recurring, item] };
    }
    /**
     * Ștergerea și corectarea cerute prin asistent. Rândul pleacă din registru cu
     * piatră de mormânt, ca sincronizarea între telefoane să nu-l readucă înapoi.
     */
    if (change.kind === "delete-transaction") {
      const removed = current.transactions.find((item) => item.id === change.id);
      if (!removed) return current;
      const now = new Date().toISOString();
      // Bonul plătit din două surse pleacă întreg, cu bonul lui, ca în Mișcări: niciodată doar o parte.
      const group = splitGroupIds(current.transactions, change.id);
      const receiptIds = current.receipts.filter((receipt) => group.includes(receipt.linkedTransactionId || "")).map((receipt) => receipt.id);
      return {
        ...current,
        transactions: current.transactions.filter((item) => !group.includes(item.id)),
        receipts: current.receipts.filter((receipt) => !receiptIds.includes(receipt.id)),
        deleted: [...current.deleted, ...group.map((id) => ({ entity: "transactions" as const, id, deletedAt: now })), ...receiptIds.map((id) => ({ entity: "receipts" as const, id, deletedAt: now }))].slice(-TOMBSTONE_MAX),
      };
    }
    if (change.kind === "amend-transaction") {
      if (!current.transactions.some((item) => item.id === change.id)) return current;
      const now = new Date().toISOString();
      return {
        ...current,
        transactions: current.transactions.map((item) => item.id === change.id ? { ...item, amount: change.amount, updatedAt: now } : item),
      };
    }
    if (change.kind === "goal") {
      const goal: SavingsGoal = { id: newId("goal"), name: change.name, current: change.current || 0, target: change.target, due: change.dueDate ? formatDate(change.dueDate, { day: "2-digit", month: "long", year: "numeric" }) : t("Fără termen"), dueDate: change.dueDate, memberId: member?.id, tone: "honey", updatedAt: now };
      return { ...current, savings: [goal, ...current.savings] };
    }
    /**
     * Evenimentul cerut prin asistent intră în aceeași listă ca cel scris de mână.
     * Același nume la aceeași dată nu se dublează: „notează Crăciunul” spus de două
     * ori într-o conversație ar fi făcut două fonduri pentru aceeași zi.
     */
    if (change.kind === "planned-event") {
      const key = change.name.toLocaleLowerCase("ro-RO").trim();
      const events = current.settings.plannedEvents;
      const existing = events.find((item) => item.name.toLocaleLowerCase("ro-RO").trim() === key && item.date === change.date);
      const next = existing
        ? events.map((item) => item.id === existing.id ? { ...item, estimate: change.estimate || item.estimate, repeat: change.repeat, updatedAt: now } : item)
        : [...events, { id: newId("planned-event"), name: change.name, date: change.date, estimate: change.estimate, repeat: change.repeat, memberId: member?.id, updatedAt: now, ...eventTraits(change.name, isoToday()) }];
      return { ...current, settings: { ...current.settings, plannedEvents: next } };
    }
    /**
     * O regulă de magazin cerută prin asistent: „de fiecare dată când scriu Lidl, pune-l pe
     * Alimente”. Regula nu scrie nimic singură — la următoarea cheltuială propune, iar omul
     * confirmă. Același text nu se dublează: se actualizează regula existentă.
     */
    if (change.kind === "merchant-rule") {
      const rules = current.settings.merchantRules || [];
      const key = change.match.toLocaleLowerCase("ro-RO").trim();
      const existing = rules.find((item) => item.match.toLocaleLowerCase("ro-RO").trim() === key);
      const next = existing
        ? rules.map((item) => item.id === existing.id ? { ...item, category: change.category || item.category, allocationId: change.allocationId || item.allocationId, updatedAt: now } : item)
        : [...rules, { id: newId("merchant-rule"), match: change.match, category: change.category, allocationId: change.allocationId, updatedAt: now }];
      return { ...current, settings: { ...current.settings, merchantRules: next.slice(0, 60) } };
    }
    /**
     * Repartizarea automată a venitului: „din fiecare salariu pune 20% la economii”. Se
     * aplică la venitul următor, nu la banii de acum — de aceea nu atinge nimic aici.
     */
    if (change.kind === "income-split") {
      // Venitul din aceeași propunere a intrat deja (actualizările se aplică pe rând).
      const income = pendingSplitIncome(current, isoToday());
      return income ? applyIncomeSplit(current, income.id).data : current;
    }
    if (change.kind === "salary-rule") {
      const plan = current.settings.salaryPlan;
      if (!plan.allocations.some((item) => item.id === change.allocationId)) return current;
      const rules = plan.salaryAllocationRules || [];
      const existing = rules.find((item) => item.allocationId === change.allocationId && item.mode === change.mode);
      const next = existing
        ? rules.map((item) => item.id === existing.id ? { ...item, label: change.label, value: change.value, active: true, updatedAt: now } : item)
        : [...rules, { id: newId("salary-rule"), label: change.label, allocationId: change.allocationId, mode: change.mode, value: change.value, active: true, updatedAt: now }];
      return { ...current, settings: { ...current.settings, salaryPlan: { ...plan, salaryAllocationRules: next.slice(0, 24), updatedAt: now } } };
    }
    /**
     * Bani puși deoparte pentru un eveniment, cerut prin asistent. Nu e transfer și nu e
     * cheltuială: surse și registru rămân neatinse, se schimbă doar cât s-a strâns pentru
     * ziua aceea din calendar. Un eveniment care nu există nu se creează aici — asistentul
     * cere întâi să fie notat.
     */
    if (change.kind === "event-contribution") {
      const events = current.settings.plannedEvents;
      const target = events.find((item) => item.id === change.eventId);
      if (!target) return current;
      return {
        ...current,
        settings: {
          ...current.settings,
          plannedEvents: events.map((item) => item.id === target.id ? addContribution(item, change.amount, change.date, t("Pus deoparte din ghidul AI")) : item),
        },
      };
    }
    /**
     * Ștergerea unui plic cerută prin asistent. Banii nu dispar: suma plicului se întoarce
     * în nerepartizat, fiindcă „liberul” se calculează din surse minus plicuri. Un nume care
     * nu se potrivește cu niciun plic nu șterge nimic — mai bine nimic decât altceva.
     */
    /**
     * „Am un buget de 1800.” Banii nu sunt un venit de azi și nu sunt o cheltuială: sunt
     * soldul din care se face planul. Îl punem pe sursă astfel încât soldul curent să fie
     * chiar suma spusă — dacă există deja mișcări, ele rămân la locul lor și se scade doar
     * diferența, ca registrul să nu mintă în niciun sens.
     */
    /**
     * „Am un buget de 1850.” Banii ajungeau doar în soldul de pornire al sursei, deci omul
     * îi vedea în Plan, dar nu-i găsea nicăieri în Mișcări — iar o intrare de bani pe care
     * n-o vezi în registru pare pierdută. Acum se scrie diferența dintre cât spune el că
     * are și cât vede aplicația, ca mișcare adevărată, cu ziua ei.
     *
     * Soldul iese la fel ca înainte, fiindcă tot diferența se adaugă. Spus de două ori,
     * al doilea mesaj nu mai scrie nimic: diferența e zero.
     */
    if (change.kind === "funds") {
      const sources = current.settings.paymentSources;
      const target = sources.find((item) => item.id === change.sourceId)
        || (change.sourceHint ? sources.find((item) => item.kind === change.sourceHint) : undefined)
        || sources[0];
      // Aceeași scriere ca la verificarea soldului: diferența intră în registru, nu pe ascuns.
      return target ? applyDeclaredBalance(current, target.id, change.amount, change.date || isoToday()) : current;
    }
    if (change.kind === "allocation-delete") {
      const plan = current.settings.salaryPlan;
      const target = plan.allocations.find((item) => item.label === change.label || item.category === change.label);
      if (!target) return current;
      return {
        ...current,
        settings: {
          ...current.settings,
          salaryPlan: {
            ...plan,
            allocations: plan.allocations.filter((item) => item.id !== target.id),
            transfers: (plan.transfers || []).filter((item) => item.fromAllocationId !== target.id && item.toAllocationId !== target.id),
            weekTransfers: (plan.weekTransfers || []).filter((item) => item.allocationId !== target.id),
            updatedAt: now,
          },
        },
      };
    }
    if (change.kind === "payday") {
      // Data cerută devine reperul planului; fereastra spune cât poate întârzia salariul.
      const plan = current.settings.salaryPlan;
      const earliest = addIsoDays(change.date, 0);
      return { ...current, settings: { ...current.settings, salaryPlan: { ...plan, nextPayday: change.date, earliestPayday: earliest >= plan.periodStart ? earliest : plan.periodStart, paydayFlexDays: change.flexDays, updatedAt: now } } };
    }
    if (change.kind !== "allocation") return current;
    const labels: Record<string, string> = { Alimente: "Alimente", Facturi: "Casă & facturi", Transport: "Transport", Economii: "Economii", Datorii: "Rate produse" };
    const label = change.label || labels[change.category] || change.category;
    const existing = current.settings.salaryPlan.allocations.find((item) => item.label === label || item.category === label || (change.category && item.category === change.category));
    const weeklyPace = change.weekly ? true : false;
    const plan = current.settings.salaryPlan;
    const start = plan.periodStart || isoToday();
    const weeks = change.weeks && change.weeks >= 2 ? change.weeks : 4;
    const fallbackPayday = new Date(`${start}T12:00:00`); fallbackPayday.setDate(fallbackPayday.getDate() + weeks * 7 - 1);
    const spokenPayday = "payday" in change && change.payday && change.payday >= start ? change.payday : undefined;
    const nextPayday = spokenPayday || plan.nextPayday || isoDate(fallbackPayday);
    const flex = plan.paydayFlexDays ?? 3;
    const earliest = new Date(`${nextPayday}T12:00:00`); earliest.setDate(earliest.getDate() - flex);
    const earliestIso = isoDate(earliest);
    const earliestPayday = earliestIso < start ? start : earliestIso;
    /**
     * „Fă-mi plic Alimente cu 600 pe săptămână” spune un ritm, nu un total. Cât înseamnă în
     * bani se poate afla abia după ce se știe perioada, așa că suma se calculează aici, pe
     * zilele rămase până la venit — nu pe cele 26 din calendar, dintre care unele au trecut.
     */
    const withPeriod = { ...current, settings: { ...current.settings, salaryPlan: { ...plan, periodStart: start, nextPayday, earliestPayday, paydayFlexDays: flex } } };
    /**
     * „Mărește plicul de alimente cu 200” cere 1.100 peste 900, nu 200. Fără sensul ăsta,
     * ajustarea înlocuia suma și tăia 700 de lei din plic fără ca nimic să spună asta.
     * Scăderea nu trece sub zero, iar un plic care încă nu există primește suma spusă.
     */
    const paced = (change.amountIsWeekly ? totalForWeeklyPace(withPeriod, change.amount) : undefined) ?? change.amount;
    const amount = change.delta && existing
      ? Math.max(0, Math.round(((change.delta === "increase" ? existing.amount + change.amount : existing.amount - change.amount)) * 100) / 100)
      : paced;
    // O ajustare nu atinge ritmul plicului: rămâne cum l-a pus omul.
    const nextAllocation = existing ? { ...existing, amount, weeklyPace: change.delta ? existing.weeklyPace : weeklyPace, category: label, updatedAt: now } : { id: newId("guided-allocation"), label, category: label, amount, weeklyPace, memberId: member?.id, sourceId: source?.id };
    const allocations = existing ? current.settings.salaryPlan.allocations.map((item) => item.id === existing.id ? nextAllocation : item) : [...current.settings.salaryPlan.allocations, nextAllocation];
    const weeklyLimit = change.weeklyAmount || plan.weeklyLimit || (change.weekly ? Math.round((amount / weeks) * 100) / 100 : plan.weeklyLimit);
    const saved = { ...current, settings: { ...current.settings, salaryPlan: { ...plan, periodStart: start, nextPayday, earliestPayday, paydayFlexDays: flex, weeklyLimit, sourceIds: plan.sourceIds.length ? plan.sourceIds : source ? [source.id] : plan.sourceIds, allocations, updatedAt: now } } };
    /**
     * Aceeași regulă ca pe ecranul Plan: dacă săptămâna e deja începută, tranșa curentă
     * păstrează doar partea zilelor rămase, iar restul pleacă în săptămânile următoare.
     * Nu face nimic pentru un plic fără ritm săptămânal sau pentru o perioadă neîncepută.
     */
    return levelStartedWeek(saved, nextAllocation.id);
  });
  const revertGuided = (item: GuidedRevert) => update((current) => {
    const index = current.transactions.findIndex((entry) => entry.kind === item.kind && entry.title === item.title && entry.amount === item.amount && entry.date === item.date && (entry.note || "").includes("ghidul AI"));
    if (index < 0) return current;
    const removed = current.transactions[index];
    const now = new Date().toISOString();
    return {
      ...current,
      transactions: current.transactions.filter((_, position) => position !== index),
      deleted: [...current.deleted, { entity: "transactions" as const, id: removed.id, deletedAt: now }].slice(-TOMBSTONE_MAX),
    };
  });
  const openNaturalDraft = (draft: NaturalDraft) => { const member = selfMemberOf(data); const source = data.settings.paymentSources[0]; if (!member || !source) { openTx(); return; } openTx({ id: newId("natural-draft"), title: draft.title, amount: draft.amount, kind: draft.kind, category: draft.category, source: source.name, sourceId: source.id, person: member.name, memberId: member.id, date: draft.date || isoToday(), note: draft.note }); };
  const saveQuickTemplate = (item: AppData["settings"]["quickTemplates"][number]) => update((current) => ({ ...current, settings: { ...current.settings, quickTemplates: [item, ...current.settings.quickTemplates.filter((entry) => entry.id !== item.id && entry.label.toLocaleLowerCase("ro-RO") !== item.label.toLocaleLowerCase("ro-RO"))].slice(0, 12) } }));
  const deleteQuickTemplate = (id: string) => update((current) => ({ ...current, settings: { ...current.settings, quickTemplates: current.settings.quickTemplates.filter((item) => item.id !== id) } }));
  const archiveQuickTemplate = (id: string) => update((current) => { const template = current.settings.quickTemplates.find((item) => item.id === id); if (!template) return current; const archivedAt = new Date().toISOString(); return { ...current, settings: { ...current.settings, quickTemplates: current.settings.quickTemplates.filter((item) => item.id !== id), archivedQuickTemplates: [{ ...template, archivedAt }, ...current.settings.archivedQuickTemplates.filter((item) => item.id !== id)].slice(0, 60) } }; });
  const restoreQuickTemplate = (id: string) => update((current) => { const template = current.settings.archivedQuickTemplates.find((item) => item.id === id); if (!template) return current; const { archivedAt: _archivedAt, ...restored } = template; return { ...current, settings: { ...current.settings, quickTemplates: [{ ...restored, updatedAt: new Date().toISOString() }, ...current.settings.quickTemplates.filter((item) => item.id !== id && item.label.toLocaleLowerCase("ro-RO") !== restored.label.toLocaleLowerCase("ro-RO"))].slice(0, 12), archivedQuickTemplates: current.settings.archivedQuickTemplates.filter((item) => item.id !== id) } }; });
  const deleteArchivedQuickTemplate = (id: string) => update((current) => ({ ...current, settings: { ...current.settings, archivedQuickTemplates: current.settings.archivedQuickTemplates.filter((item) => item.id !== id) } }));
  const saveDebt = (item: Debt | SavingsGoal) => update((current) => { const stamped = { ...item, updatedAt: new Date().toISOString() } as Debt; return { ...current, debts: current.debts.some((entry) => entry.id === item.id) ? current.debts.map((entry) => entry.id === item.id ? stamped : entry) : [...current.debts, stamped] }; });
  const saveSaving = (item: Debt | SavingsGoal) => update((current) => { const stamped = { ...item, updatedAt: new Date().toISOString() } as SavingsGoal; return { ...current, savings: current.savings.some((entry) => entry.id === item.id) ? current.savings.map((entry) => entry.id === item.id ? stamped : entry) : [...current.savings, stamped] }; });
  const saveReceipt = (item: Receipt) => update((current) => queueReceiptForReview(current, item));
  const deleteReceipt = (id: string) => {
    deleteWithUndo(t("Bonul a fost șters."), (current) => {
      const currentReceipt = current.receipts.find((item) => item.id === id);
      // Pleacă doar mișcările făcute de bon. Cheltuiala notată de mână, cu bonul atașat ca detaliu, rămâne fără bon.
      const madeByReceipt = (txId: string) => txId === `receipt-tx-${id}` || txId.startsWith(`receipt-tx-${id}-`);
      const linked = [...(currentReceipt?.linkedTransactionIds || []), currentReceipt?.linkedTransactionId, `receipt-tx-${id}`, ...current.transactions.map((item) => item.id)]
        .filter((value): value is string => Boolean(value) && madeByReceipt(value as string));
      const now = new Date().toISOString();
      const removedTransactions = current.transactions.filter((item) => linked.includes(item.id));
      return {
        next: { ...current, receipts: current.receipts.filter((item) => item.id !== id), transactions: current.transactions.filter((item) => !linked.includes(item.id)).map((item) => item.receiptId === id ? { ...item, receiptId: undefined, updatedAt: now } : item), pendingReview: current.pendingReview.filter((draft) => draft.transaction.receiptId !== id && !linked.includes(draft.transaction.id)), deleted: [...current.deleted, { entity: "receipts" as const, id, deletedAt: now }, ...linked.map((transactionId) => ({ entity: "transactions" as const, id: transactionId, deletedAt: now }))].slice(-TOMBSTONE_MAX) },
        removed: { receipts: currentReceipt ? [currentReceipt] : [], transactions: removedTransactions },
      };
    });
  };
  const openTx = (item?: Transaction) => {
    // În BonAI, „notează de mână” e același ecran de bon, gol: fără surse, plicuri sau venituri.
    if (!item && appMode === "shop" && !memberModeActive) { setEditTx(undefined); setScanPrefill({ title: "", amount: 0, category: "Alimente", lines: [], discount: 0, count: 0 }); setModal("review"); return; }
    setEditTx(item ? storedMove(data.transactions, item) : item); setModal(item ? "transaction" : "quick");
  };
  // Widgetul și dala din Setări rapide deschid direct ecranul cerut, fără pași intermediari.
  useEffect(() => observeQuickActions((action) => {
    if (action === "receipt") { setModal("receipt"); return; }
    // Scurtăturile de pe iconița aplicației: „Spune” deschide Notează și pornește microfonul.
    if (action === "voice") { setQuickTemplateId(undefined); setEditTx(undefined); setQuickVoice(true); setModal("quick"); return; }
    if (action === "shopping") { window.dispatchEvent(new Event("buget-familie:open-shopping")); return; }
    if (action === "expense") { setQuickTemplateId(undefined); setEditTx(undefined); setModal("quick"); return; }
    if (typeof action === "object" && action.kind === "template") {
      setQuickTemplateId(action.templateId);
      setEditTx(undefined);
      setModal("quick");
      return;
    }
    go("today");
  }), []);
  // Ecranul protejat (Setări → Securitate) se reaplică la fiecare pornire a aplicației.
  useEffect(() => { void applySecureScreen(); if (readDynamicColor()) void applyDynamicColor(); }, []);
  useEffect(() => {
    // Widgetul „Poți cheltui azi” arată aceeași cifră ca Astăzi; fără punte nativă nu face nimic.
    const today = isoToday();
    // Cu PIN pe aplicație sau pe telefonul unui copil, suma nu stă pe ecranul principal.
    if (isAppLockEnabled() || memberModeActive) {
      publishSpendToday({ amount: "", caption: "", date: today, stale: "" });
      return;
    }
    const brief = todayBrief(data);
    publishSpendToday({
      amount: fmtExact.format(brief.spendable),
      caption: brief.hasPayday && !brief.expired ? t("până la salariu: {days}", { days: daysLabel(brief.remainingDays) }) : t("Setează data salariului în Plicuri."),
      date: today,
      zone: getFamilyTimeZone(),
      stale: t("Cifra e de pe {date} — deschide aplicația pentru azi", { date: formatDate(today, { day: "numeric", month: "long" }) }),
    });
  }, [data, memberModeActive, today]);
  useEffect(() => {
    // Widgetul „Plicurile mele”: primele trei plicuri cu buget, cele mai apăsate întâi.
    const today = isoToday();
    if (isAppLockEnabled() || memberModeActive) {
      publishEnvelopes({ rows: [], date: today, stale: "" });
      return;
    }
    const rows = data.settings.salaryPlan.allocations
      .map((item) => ({ item, status: allocationStatus(data, item) }))
      .filter((row) => row.status && row.status.budget > 0 && !(row.status.fixed && row.status.remaining <= 0.5))
      .sort((a, b) => (b.status!.usage - a.status!.usage))
      .slice(0, 3)
      .map(({ item, status }) => ({ label: item.label, left: status!.remaining < 0 ? `−${fmtExact.format(-status!.remaining)}` : fmtExact.format(status!.remaining), used: Math.round(Math.min(1, Math.max(0, status!.usage)) * 100) }));
    publishEnvelopes({ rows, date: today, zone: getFamilyTimeZone(), stale: t("Sumele sunt de pe {date} — deschide aplicația", { date: formatDate(today, { day: "numeric", month: "long" }) }) });
  }, [data, memberModeActive, today]);
  useEffect(() => {
    // Widgetul „Săptămâna banilor”: ultimele 7 zile; cu blocarea aplicației, fără sume.
    const today = isoToday();
    if (isAppLockEnabled() || memberModeActive) {
      publishWeek({ days: [], total: "", caption: "", date: today, stale: "" });
      return;
    }
    const week = weekWidgetData(data, today);
    const caption = week.change === undefined ? t("în ultimele 7 zile") : week.change > 0 ? t("+{change}% față de săptămâna dinainte", { change: week.change }) : week.change < 0 ? t("{change}% față de săptămâna dinainte", { change: week.change }) : t("ca săptămâna dinainte");
    publishWeek({ days: week.days, total: fmtExact.format(Math.round(week.total)), caption, date: today, zone: getFamilyTimeZone(), stale: t("Sumele sunt de pe {date} — deschide aplicația", { date: formatDate(today, { day: "numeric", month: "long" }) }) });
  }, [data, memberModeActive, today]);
  // Widgetul BonAI: lista de cumpărături (doar nume de produse) și scanarea dintr-o atingere.
  useEffect(() => {
    const todo = isAppLockEnabled() ? [] : visibleShopping(data.settings.shoppingList || []).todo;
    publishShopping(shoppingWidgetData(todo, (n) => (n === 1 ? t("1 produs") : t("{count} produse", { count: n }))));
  }, [data.settings.shoppingList]);
  // Copia săptămânală, pe telefon: o dată la 7 zile, după ce omul a spus „da”.
  useEffect(() => { void import("@/components/AutoBackupCard").then(({ runAutoBackupIfDue }) => runAutoBackupIfDue(data)).catch(() => undefined); }, [data]);
  /**
   * Salvarea automată la fiecare modificare: la 3 secunde după ultima schimbare, un singur fișier rescris.
   * Pornește și imediat ce omul apasă „Pornește”: altfel fișierul nu exista până la prima mișcare nouă.
   */
  const [liveBackupOn, setLiveBackupOn] = useState(() => readAutoBackup().live === true);
  useEffect(() => {
    const onChange = () => setLiveBackupOn(readAutoBackup().live === true);
    window.addEventListener("buget-familie:auto-backup", onChange);
    return () => window.removeEventListener("buget-familie:auto-backup", onChange);
  }, []);
  useEffect(() => {
    if (!storageReady || !isNativeApp() || !data.transactions.length || !liveBackupOn) return;
    const id = window.setTimeout(() => {
      void saveLiveBackup(data)
        .then((path) => writeAutoBackup({ liveAt: new Date().toISOString(), livePath: path, liveError: undefined }))
        .catch((error) => writeAutoBackup({ liveError: error instanceof Error ? error.message : t("Salvarea automată a eșuat.") }));
    }, 3000);
    return () => window.clearTimeout(id);
  }, [data, storageReady, liveBackupOn]);
  useEffect(() => {
    const expense = data.settings.quickTemplates.filter((item) => item.kind !== "income").slice(0, 3);
    publishWidgetTemplates(expense.map((item) => ({ id: item.id, label: item.label })));
  }, [data.settings.quickTemplates]);
  // D10: aceeași ordine ca bara de jos de pe telefon (Astăzi · Plicuri · Mișcări).
  const allNav = [{ id: "today" as MainView, label: t("Astăzi"), icon: LayoutGrid }, { id: "plan" as MainView, label: t("Plicuri"), icon: Wallet }, { id: "journal" as MainView, label: t("Mișcări"), icon: ReceiptText }, { id: "obligations" as MainView, label: t("Obligații"), icon: Bell }, { id: "insights" as MainView, label: t("Analiză"), icon: BarChart3 }];
  const dockNav: Array<{ id: MainView | "add"; label: string; icon: typeof LayoutGrid }> = [
    { id: "today", label: t("Astăzi"), icon: LayoutGrid },
    { id: "plan", label: t("Plicuri"), icon: Wallet },
    { id: "add", label: t("Notează"), icon: Plus },
    { id: "journal", label: t("Mișcări"), icon: ReceiptText },
    { id: "utilities", label: t("Mai mult"), icon: MoreHorizontal },
  ];
  const shopMode = appMode === "shop" && !memberModeActive;
  const shopNav = [{ id: "shop" as MainView, label: t("Acasă"), icon: HomeIcon }, { id: "list" as MainView, label: t("Cumpărături"), icon: ShoppingBasket }, { id: "products" as MainView, label: t("Prețuri"), icon: Store }, { id: "house" as MainView, label: t("Cont"), icon: UserRound }];
  const shopDock: Array<{ id: MainView | "add"; label: string; icon: typeof LayoutGrid }> = [shopNav[0], shopNav[1], { id: "add", label: t("Scanează"), icon: ScanLine }, shopNav[2], shopNav[3]];
  /** Prima pornire în aplicația nouă s-a încheiat: nu mai întrebăm de salariu și plicuri. */
  // Orice drum spre „Notează” vechi (widget, scurtătură, tastatură) duce în BonAI la ecranul de bon.
  useEffect(() => { if (modal === "quick" && shopMode) { setScanPrefill({ title: "", amount: 0, category: "Alimente", lines: [], discount: 0, count: 0 }); setModal("review"); } }, [modal, shopMode]);
  const finishShopWelcome = () => {
    try { safeSetItem(window.localStorage, "buget-familie:setup-complete", "true"); safeSetItem(window.localStorage, "buget-familie:onboarding-complete", "true"); } catch { /* fără stocare */ }
    setSetupOpen(false);
    go("shop");
  };
  const openScan = () => { setEditTx(undefined); setScanPrefill(undefined); setModal("scan"); };
  // Schimbarea aplicației (Casa → Buget vechi și înapoi) duce pe ecranul de start al celei alese.
  useEffect(() => {
    const shopViews: MainView[] = ["shop", "list", "products", "stores", "house"];
    if (appMode === "shop" && view === "today") setView("shop");
    if (appMode === "budget" && shopViews.includes(view)) setView("today");
  }, [appMode, view]);
  const nav = memberModeActive ? [] : shopMode ? shopNav : simpleMode ? allNav.filter((item) => item.id === "today" || item.id === "journal" || item.id === "plan" || item.id === "obligations") : allNav;
  useEffect(() => {
    if (!simpleMode) return;
    if (view === "insights" || view === "habits" || view === "goals" || view === "calendar") go("today");
  }, [simpleMode, view]);
  /** Bannerele de sync se ascund doar când ecranul Sync e chiar deschis, nu când a fost ultimul instrument. */
  const onSyncScreen = view === "utilities" && more === "sync";
  const current = () => {
    if (view === "shop") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim cumpărăturile…")}</div>}><ShopHome data={data} onScan={openScan} onOpenProducts={() => go("products")} onOpenStores={() => go("stores")} onOpenMore={(tab) => { setMoreReturn({ view: "shop", label: t("Înapoi la Acasă") }); setMore(tab); go("utilities"); }} /></Suspense>;
    if (view === "list") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim lista…")}</div>}><ListView data={data} onChange={applyData} /></Suspense>;
    if (view === "products") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim prețurile…")}</div>}><PricesView data={data} onChange={applyData} /></Suspense>;
    if (view === "stores") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim magazinele…")}</div>}><StoresView data={data} /></Suspense>;
    if (view === "house") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim contul…")}</div>}><HouseView data={data} onOpenCosts={setCostsKind} onOpenMore={(tab) => { setMoreReturn({ view: "house", label: t("Înapoi la Cont") }); setMore(tab); go("utilities"); }} onOpenJournal={() => go("journal")} onOpenBudget={() => { setAppMode("budget"); }} look={themeSchedule === "system" ? "auto" : activeTheme === "white" ? "light" : "dark"} onLook={(look) => { if (look === "auto") { setThemeSchedule("system"); return; } setTheme(look === "light" ? "white" : "dark"); setThemeSchedule("manual"); }} /></Suspense>;
    if (view === "journal") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim mișcările…")}</div>}><MovementsJournal data={data} onChange={applyData} onAdd={() => openTx()} onEdit={openTx} onOpenReview={() => { setMore("review"); go("utilities"); }} onDelete={(id) => deleteWithUndo(t("Mișcarea a fost ștearsă."), (currentData) => ({
      // Bonul plătit din două surse se șterge întreg: ambele părți.
      next: { ...currentData, transactions: currentData.transactions.filter((item) => !splitGroupIds(currentData.transactions, id).includes(item.id)), receipts: currentData.receipts.filter((receipt) => !splitGroupIds(currentData.transactions, id).includes(receipt.linkedTransactionId || "")), deleted: [...currentData.deleted, ...splitGroupIds(currentData.transactions, id).map((removedId) => ({ entity: "transactions" as const, id: removedId, deletedAt: new Date().toISOString() }))].slice(-TOMBSTONE_MAX) },
      removed: { transactions: currentData.transactions.filter((item) => splitGroupIds(currentData.transactions, id).includes(item.id)), receipts: currentData.receipts.filter((receipt) => splitGroupIds(currentData.transactions, id).includes(receipt.linkedTransactionId || "")) },
    }))} /></Suspense>; if (view === "plan")
 return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim planul…")}</div>}><PlanStudio data={data} onChange={applyData} simpleMode={simpleMode} /></Suspense>; if (view === "habits") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim obiceiurile…")}</div>}><SpendingHabitsView data={data} /></Suspense>; if (view === "calendar") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim calendarul…")}</div>}><FinancialCalendarView data={data} onOpenEvents={() => { setMore("events"); go("utilities"); }} /></Suspense>; if (view === "goals") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim obiectivele…")}</div>}><LongTermGoalsView data={data} onOpen={() => { setEditGoal(undefined); setModal("saving"); }} onEdit={(item) => { setEditGoal(item); setModal("saving"); }} onDelete={(id) => deleteWithUndo(t("Obiectivul a fost șters."), (currentData) => ({
      next: { ...currentData, savings: currentData.savings.filter((item) => item.id !== id), deleted: [...currentData.deleted, { entity: "savings" as const, id, deletedAt: new Date().toISOString() }].slice(-TOMBSTONE_MAX) },
      removed: { savings: currentData.savings.filter((item) => item.id === id) },
    }))} /></Suspense>; if (view === "obligations") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim obligațiile…")}</div>}><ObjectivesView data={data} onSaveToGoal={(id, amount) => update((currentData) => ({ ...currentData, savings: currentData.savings.map((item) => item.id === id ? { ...item, current: Math.round((item.current + amount) * 100) / 100, updatedAt: new Date().toISOString() } : item) }))} onEditDebt={(item) => { setEditGoal(item); setModal("debt"); }} onEditSaving={(item) => { setEditGoal(item); setModal("saving"); }} onPayDebt={(item) => { setEditGoal(item); setModal("debt-payment"); }} onDeleteDebt={(id) => deleteWithUndo(t("Datoria a fost ștearsă."), (currentData) => ({
      next: { ...currentData, debts: currentData.debts.filter((item) => item.id !== id), deleted: [...currentData.deleted, { entity: "debts" as const, id, deletedAt: new Date().toISOString() }].slice(-TOMBSTONE_MAX) },
      removed: { debts: currentData.debts.filter((item) => item.id === id) },
    }))} onDeleteSaving={(id) => deleteWithUndo(t("Obiectivul a fost șters."), (currentData) => ({
      next: { ...currentData, savings: currentData.savings.filter((item) => item.id !== id), deleted: [...currentData.deleted, { entity: "savings" as const, id, deletedAt: new Date().toISOString() }].slice(-TOMBSTONE_MAX) },
      removed: { savings: currentData.savings.filter((item) => item.id === id) },
    }))} onUpdate={(change) => update(change)} openDebt={() => { setEditGoal(undefined); setModal("debt"); }} openSaving={() => { setEditGoal(undefined); setModal("saving"); }} onOpenGoals={() => go("goals")} onOpenCalendar={() => go("calendar")} onOpenEvents={() => { setMore("events"); go("utilities"); }} onOpenAssistant={() => { setMore("assistant"); go("utilities"); }} onOpenRecurring={() => { setMoreReturn({ view: "obligations", label: t("Înapoi la Obligații") }); setMore("recurring"); go("utilities"); }} onAddRecurring={(item) => update((currentData) => autoPostDueRecurring({ ...currentData, recurring: [...currentData.recurring, item] }))} onAddSaving={(goal) => update((currentData) => ({ ...currentData, savings: [...currentData.savings, goal] }))} onPayRecurring={(id) => { if (data.recurring.find((item) => item.id === id)?.variable) { setMoreReturn({ view: "obligations", label: t("Înapoi la Obligații") }); setMore("recurring"); go("utilities"); return; } update((currentData) => confirmRecurringPayment(currentData, id) || currentData); }} /></Suspense>; if (view === "insights") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim analiza…")}</div>}><InsightsView data={data} onChange={applyData} onGo={go} /></Suspense>; if (view === "utilities") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim instrumentele…")}</div>}><MoreViewScreen tab={more} setTab={(value) => { if (value !== more) { if (value === "charts") void import("@/components/ChartsPanel"); setMore(value); } if (value === "overview") setMoreReturn(null); }} backTo={moreReturn ? { label: moreReturn.label, go: () => { const target = moreReturn.view; setMoreReturn(null); setMore("overview"); go(target); } } : undefined} data={data} onChange={applyData} onAddReceipt={() => setModal("receipt")} onSaveReceipt={saveReceipt} onDeleteReceipt={deleteReceipt} onOpenDebt={() => { setEditGoal(undefined); setModal("debt"); }} onOpenSaving={() => { setEditGoal(undefined); setModal("saving"); }} onEditDebt={(item) => { setEditGoal(item); setModal("debt"); }} onEditSaving={(item) => { setEditGoal(item); setModal("saving"); }} onPayDebt={(item) => { setEditGoal(item); setModal("debt-payment"); }} onOpenCalendar={() => go("calendar")} onGo={go} receiptStorageNotice={receiptStorageNotice} sync={syncPanelProps} /></Suspense>; return <TodayView data={data} onAdd={() => openTx()} onEdit={openTx} onGo={go} onChange={applyData} onOpenReview={() => { setMore("review"); go("utilities"); }} onOpenSettings={() => { setMore("settings"); go("utilities"); }} onOpenRecurring={() => { setMoreReturn({ view: "today", label: t("Înapoi la Astăzi") }); setMore("recurring"); go("utilities"); }} coach={view === "today" && firstWeekTourOpen && !onboardingOpen && !setupOpen && !modal && more !== "sync" ? <Suspense fallback={null}><FirstWeekTour onClose={dismissFirstWeekTour} onCapture={() => { dismissFirstWeekTour(); openTx(); }} onPlan={() => { dismissFirstWeekTour(); go("plan"); }} onSync={() => { dismissFirstWeekTour(); setMore("sync"); go("utilities"); }} /></Suspense> : null} />; };
  return <div className={"bf-app os-shell" + ((setupOpen && !shopMode) || onboardingOpen ? " is-setup" : "")}>
    <a className="bf-skip-link" href="#main-content">{t("Sari la conținut")}</a>
    {appMode === "budget" && isArchiveMode() && <div className="bf-storage-notice bf-archive-banner" role="status" style={{ background: "#14231E", color: "#FFFFFF" }}><Archive size={15} aria-hidden="true" /><span style={{ color: "inherit" }}>{t("Arhiva veche, doar citire")}</span><button type="button" style={{ color: "#FFFFFF", background: "transparent", textDecoration: "underline", fontWeight: 700 }} onClick={() => setAppMode("shop")}>{t("Înapoi la BonAI")}</button></div>}
    {storageNotice && <div className="bf-storage-notice" role="status"><ShieldCheck size={15} /><span>{storageNotice}</span><button type="button" aria-label={t("Închide notificarea")} onClick={() => setStorageNotice(null)}><X size={14} /></button></div>}
    {updateAvailable && <div className="bf-offline-banner bf-update-banner" role="status" aria-live="polite"><RotateCcw size={15} aria-hidden="true" /><span>{t("Există o versiune nouă a aplicației.")}</span><button type="button" onClick={() => void reloadToNewVersion()}>{t("Reîncarcă")}</button></div>}
    {!online && <div className="bf-offline-banner" role="status" aria-live="polite"><CloudOff size={15} aria-hidden="true" /><span>{syncPanelProps.connected ? t("Fără conexiune — modificările rămân pe telefon și se trimit la reconectare.") : t("Fără conexiune — lucrezi local pe acest telefon.")}</span></div>}
    {syncPanelProps.stopped && !onSyncScreen && <div className="bf-offline-banner bf-sync-off-banner" role="status" aria-live="polite"><CloudOff size={15} aria-hidden="true" /><span>{t("Sincronizarea familiei e oprită pe acest telefon. Ce notezi nu ajunge la ceilalți.")}</span><button type="button" onClick={() => { setMore("sync"); go("utilities"); }}>{t("Reconectează")}</button></div>}
    {syncPanelProps.needsSelfChoice && syncPanelProps.connected && !onSyncScreen && !memberModeActive && <div className="bf-offline-banner bf-sync-off-banner" role="status"><Users size={15} aria-hidden="true" /><span>{t("Spune-ne cine ești pe acest telefon, ca cheltuielile tale să nu apară pe altcineva.")}</span><button type="button" onClick={() => { setMore("sync"); go("utilities"); }}>{t("Alege")}</button></div>}
    <header className="bf-appbar os-appbar"><button className="os-brand" onClick={() => go("today")}><BrandMark /><span className="os-brand-copy bn-wordmark"><b>Bon</b><i>AI</i></span></button>{!memberModeActive && <button type="button" className="os-desktop-add" onPointerDown={() => void import("@/components/QuickEntryPanel")} onClick={() => { setQuickTemplateId(undefined); setEditTx(undefined); setModal("quick"); }}><Plus size={17} aria-hidden="true" /><span>{t("Notează")}</span></button>}<nav className="os-desktop-nav" aria-label={t("Navigație principală")}>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "is-on" : ""} aria-current={view === item.id ? "page" : undefined} onPointerEnter={() => preloadView(item.id)} onPointerDown={() => { preloadView(item.id); void ensureDeferredStyles(); }} onClick={() => go(item.id)}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></button>; })}</nav>{!memberModeActive && <div className="os-tools"><button className="os-tool" aria-label={t("Deschide acțiunile rapide")} title={t("Acțiuni rapide · Ctrl K")} onPointerDown={() => void import("@/pages/QuickActionsPalette")} onClick={() => setQuickActionsOpen(true)}><Search size={17} /></button><button className={view === "utilities" ? "os-tool is-on" : "os-tool"} aria-label={data.pendingReview.length ? t("Deschide instrumentele · {count} de verificat", { count: data.pendingReview.length }) : t("Deschide instrumentele")} onPointerDown={() => { preloadView("utilities"); void ensureDeferredStyles(); }} onClick={() => go("utilities")}><MoreHorizontal size={19} />{data.pendingReview.length > 0 && <span className="bf-nav-count" aria-hidden="true">{data.pendingReview.length}</span>}</button><button className="os-tool" aria-label={t("Deschide ghidul")} onClick={openHouseholdGuide}><MessagesSquare size={17} /></button></div>}</header>{!memberModeActive && <button type="button" className="os-tablet-add" onPointerDown={() => void import("@/components/QuickEntryPanel")} onClick={() => { setQuickTemplateId(undefined); setEditTx(undefined); setModal("quick"); }}><Plus size={20} aria-hidden="true" /><span>{t("Notează")}</span></button>}
    {demo && !setupOpen && <aside className="bf-demo-banner" role="status"><span><b>{t("Familie exemplu")}</b> · {t("datele sunt inventate")}</span><button type="button" className="bf-primary" onClick={() => void leaveDemo()}>{t("Încep cu datele mele")}</button></aside>}
    <main id="main-content" key={today} className={(setupOpen && !shopMode) || onboardingOpen ? "is-setup-main" : undefined}>{setupOpen ? (shopMode ? <Suspense fallback={null}><ShopWelcome onScan={() => { finishShopWelcome(); openScan(); }} onList={() => { finishShopWelcome(); go("list"); }} onJoin={() => { finishShopWelcome(); setMore("sync"); go("utilities"); }} onSkip={finishShopWelcome} /></Suspense> : null) : memberModeActive ? <MemberModeScreen data={data} memberId={memberMode} onChange={applyData} /> : current()}</main>
    {undo && (
      <div className="bf-undo-bar" role="status" aria-live="polite">
        <span>{undo.label}</span>
        <button type="button" onClick={runUndo}><RotateCcw size={15} aria-hidden="true" /> {t("Anulează")}</button>
        <button type="button" className="bf-undo-close" aria-label={t("Închide")} onClick={() => setUndo(null)}><X size={16} /></button>
      </div>
    )}

    {data.pendingReview.length > 0 && <button type="button" className="bf-dock-review-badge" onClick={() => { setMore("review"); go("utilities"); }} aria-label={t("Deschide De verificat · {count}", { count: data.pendingReview.length })}><Inbox size={15} /> {t("De verificat")} · {data.pendingReview.length}</button>}
    <div className="os-nav-fill" aria-hidden="true" />
    {/* Meniul de jos: Astăzi · Plicuri · ＋ Notează · Mișcări · Mai mult. „Notează” stă mereu în același loc, la mijloc;
        Obligațiile și Analiza sunt în „Mai mult”, ca pe telefon să rămână 4 file și butonul care contează. */}
    {nav.length > 0 && !(shopMode && setupOpen) && <nav className="os-dock os-dock-v2" aria-label={t("Navigație mobilă")}>{(shopMode ? shopDock : dockNav).map((item) => {
      if (item.id === "add" && shopMode) return <button key="add" type="button" className="os-dock-add" onPointerDown={() => void import("@/components/ReceiptScanButton")} onClick={openScan}><span className="os-dock-add-disc"><ScanLine size={24} aria-hidden="true" /></span><span>{t("Scanează")}</span></button>;
      if (item.id === "add") return <button key="add" type="button" className="os-dock-add" onPointerDown={() => void import("@/components/QuickEntryPanel")} onClick={() => openTx()}><span className="os-dock-add-disc"><Plus size={24} aria-hidden="true" /></span><span>{t("Notează")}</span></button>;
      const Icon = item.icon;
      const on = view === item.id || (item.id === "utilities" && (view === "obligations" || view === "insights" || view === "goals"));
      return <button key={item.id} className={on ? "is-on" : ""} aria-current={view === item.id ? "page" : undefined} onPointerDown={() => { preloadView(item.id as MainView); void ensureDeferredStyles(); }} onClick={() => { if (item.id === "utilities") setMore("overview"); go(item.id as MainView); }}><Icon size={18} aria-hidden="true" /><span>{item.label}</span>{(item.id === "journal" || item.id === "utilities") && data.pendingReview.length > 0 ? <i className="bf-dock-dot" aria-hidden="true" /> : null}</button>;
    })}</nav>}
    {shopMode && costsKind && <Suspense fallback={null}><HouseCostsPanel data={data} kind={costsKind} onChange={applyData} onClose={() => setCostsKind(undefined)} /></Suspense>}
    {shopMode && guideOn && <Suspense fallback={null}><BonAIAssistant data={data} onChange={applyData} onClose={() => setGuideOn(false)} onGo={(screen) => { setGuideOn(false); if (screen === "scan") { openScan(); return; } if (screen === "prices") { go("products"); return; } go("list"); if (screen !== "list") window.setTimeout(() => window.dispatchEvent(new CustomEvent("bonai:list-tab", { detail: screen })), 0); }} /></Suspense>}
    {!shopMode && !simpleMode && !memberModeActive && guideOn && <Suspense fallback={null}><AICompanion initiallyOpen data={data} view={view} onAdd={() => openTx()} onGo={go} onNaturalEntry={openNaturalDraft} onFinancialUpdate={applyFinancialUpdate} onRevert={revertGuided} /></Suspense>}
    {themePickerOpen && <Suspense fallback={null}><ThemePicker theme={activeTheme} schedule={themeSchedule} scheduleTimes={scheduleTimes} highContrast={highContrast} background={background} onChange={setTheme} onScheduleChange={setThemeSchedule} onScheduleTimesChange={setScheduleTimes} onContrastChange={setHighContrast} onBackgroundChange={setBackground} onClose={() => setThemePickerOpen(false)} /></Suspense>} {quickActionsOpen && <Suspense fallback={null}><QuickActionsPalette data={data} onClose={() => setQuickActionsOpen(false)} onAdd={() => openTx()} onGo={go} /></Suspense>} {onboardingOpen && <Suspense fallback={null}><CalmOnboarding onClose={() => { setOnboardingOpen(false); const hasStarted = data.transactions.length > 0 || data.settings.salaryPlan.allocations.length > 0 || data.debts.length > 0 || data.savings.length > 0 || data.settings.paymentSources.some((source) => source.openingBalance > 0); if (!window.localStorage.getItem("buget-familie:setup-complete") && !hasStarted) setSetupOpen(true); }} onAdd={() => openTx()} onGo={go} /></Suspense>} {setupOpen && !shopMode && <Suspense fallback={null}><FirstRunSetup data={data} onChange={applyData} onClose={() => { setSetupOpen(false); setDemo(isDemoMode()); }} onGoPlan={() => go("plan")} onAdd={() => openTx()} onOpenSync={() => { setMore("sync"); go("utilities"); }} /></Suspense>}
    {weekCloseOpen && <Suspense fallback={null}><WeekCloseSheet data={data} today={todayIso} evening={new Date().getHours() >= 18} onClose={() => setWeekCloseOpen(false)} onApply={(change) => update(change)} /></Suspense>}
    {paydayOpen && <Suspense fallback={null}><PaydaySheet data={data} today={todayIso} onClose={() => setPaydayOpen(false)} onApply={(proposal) => { update((current) => applyPayday(current, proposal)); setPaydayOpen(false); }} /></Suspense>}
    {modal === "quick" && !memberModeActive && <Suspense fallback={<div className="bf-modal-backdrop"><div className="bf-lazy-panel">{t("Pregătim înregistrarea rapidă…")}</div></div>}><QuickEntryPanel data={data} initialMoving={quickMoving} onAddSource={(source) => update((current) => ({ ...current, settings: { ...current.settings, paymentSources: [...current.settings.paymentSources, source] } }))} autoVoice={quickVoice} initialKind={quickKind} initialTemplateId={quickTemplateId} onSave={saveTx} onSaveTemplate={saveQuickTemplate} onDeleteTemplate={deleteQuickTemplate} onArchiveTemplate={archiveQuickTemplate} onRestoreTemplate={restoreQuickTemplate} onDeleteArchivedTemplate={deleteArchivedQuickTemplate} onClose={() => { setModal(null); setQuickTemplateId(undefined); setQuickKind(undefined); setQuickVoice(false); }} onMore={(draft, scan) => { setEditTx(draft); setScanPrefill(scan); setQuickTemplateId(undefined); setModal("transaction"); }} /></Suspense>}
    {modal === "transaction" && !memberModeActive && <Suspense fallback={<div className="bf-modal-backdrop"><div className="bf-lazy-panel">{t("Pregătim mișcarea…")}</div></div>}><TransactionForm data={data} initial={editTx} scan={scanPrefill} onSave={saveTx} onClose={() => { setModal(null); setEditTx(undefined); setScanPrefill(undefined); }} /></Suspense>}
    {modal === "scan" && !memberModeActive && shopMode && createPortal(<div className="bn-review bn-scan-hub" role="dialog" aria-modal="true" aria-label={t("Scanează bonul")}><header className="bn-review-top"><button type="button" className="bn-icon-btn" aria-label={t("Închide")} onClick={() => setModal(null)}><X size={20} /></button><p className="bn-hub-title">{t("Scanează")}</p><span /></header><div className="bn-review-scroll"><Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim camera…")}</div>}><ReceiptScanButton hub data={data} onManual={() => { setModal(null); openTx(); }} onResult={(prefill) => { setEditTx(undefined); setScanPrefill(prefill); setModal("review"); }} /></Suspense></div></div>, document.body)}
    {modal === "scan" && !memberModeActive && !shopMode && <Modal title={t("Scanează bonul")} onClose={() => setModal(null)}><div className="sh-scan-sheet"><p className="bf-helper">{t("Fă o poză bonului întreg. Citesc fiecare produs, cu marca, gramajul și prețul, iar tu verifici înainte să salvez.")}</p><Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim camera…")}</div>}><ReceiptScanButton data={data} onResult={(prefill) => { setEditTx(undefined); setScanPrefill(prefill); setModal(shopMode ? "review" : "transaction"); }} /></Suspense><button type="button" className="bf-secondary" onClick={() => { setModal(null); openTx(); }}><Plus size={16} aria-hidden="true" /> {t("Fără bon: notează de mână")}</button></div></Modal>}
    {modal === "review" && scanPrefill && !memberModeActive && <Suspense fallback={<div className="bf-modal-backdrop"><div className="bf-lazy-panel">{t("Pregătim bonul…")}</div></div>}><ReceiptReview data={data} prefill={scanPrefill} onRescan={() => { setScanPrefill(undefined); setModal("scan"); }} onCancel={() => { setModal(null); setScanPrefill(undefined); }} onSave={(review) => {
      // Bonul nou: o cheltuială simplă (fără plic, fără alegerea sursei), cu rândurile verificate. Aceeași formă ca înainte, deci sincronizarea rămâne compatibilă.
      const member = data.settings.members.find((item) => item.id === review.memberId) || data.settings.members.find((item) => item.id === data.settings.selfMemberId) || data.settings.members[0];
      const source = data.settings.paymentSources.find((item) => item.id === scanPrefill.sourceId) || data.settings.paymentSources.find((item) => item.memberId === member?.id) || data.settings.paymentSources[0];
      const byCategory = new Map<string, number>();
      for (const row of review.rows) byCategory.set(row.category, (byCategory.get(row.category) || 0) + row.amount);
      const category = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || scanPrefill.category;
      const now = new Date().toISOString();
      const tx: Transaction = { id: newId("tx"), title: `Bon — ${review.store}`, amount: review.total, kind: "expense", category, sourceId: source?.id, source: source?.name || "", memberId: member?.id, person: member?.name || "", date: review.date, allocationId: "outside", createdAt: now, updatedAt: now };
      const detailLines: ReceiptLine[] = review.rows.map((row) => ({ id: newId("line"), label: labelWithQty(row.label, row.qty), amount: row.amount, category: row.category, ...(row.discount > 0 ? { discount: row.discount } : {}) }));
      saveTx(tx, { detailLines, vendor: review.store, scanLines: review.rows.map((row) => ({ label: labelWithQty(row.label, row.qty), amount: row.amount, category: row.category, qty: row.qty, product: row.product })), store: scanPrefill.store });
    }} /></Suspense>}
    {modal === "receipt" && !memberModeActive && <Suspense fallback={<div className="bf-modal-backdrop"><div className="bf-lazy-panel">{t("Pregătim bonul…")}</div></div>}><ReceiptForm data={data} onSave={saveReceipt} onClose={() => setModal(null)} /></Suspense>}
    {modal === "debt" && <Suspense fallback={null}><GoalForm data={data} type="debt" item={editGoal} onSave={saveDebt} onClose={() => { setModal(null); setEditGoal(undefined); }} /></Suspense>}
    {modal === "saving" && <Suspense fallback={null}><GoalForm data={data} type="saving" item={editGoal} onSave={saveSaving} onClose={() => { setModal(null); setEditGoal(undefined); }} /></Suspense>}
    {modal === "debt-payment" && editGoal && "remaining" in editGoal && <Suspense fallback={null}><DebtPaymentForm data={data} debt={editGoal} onSave={applyData} onClose={() => { setModal(null); setEditGoal(undefined); }} /></Suspense>}
    {affordOpen && <Suspense fallback={null}><AffordSheet data={data} onClose={() => setAffordOpen(false)} onLog={() => { setAffordOpen(false); window.dispatchEvent(new Event("buget-familie:open-expense")); }} /></Suspense>}
    {celebrate && !modal && <Suspense fallback={null}><GoalCelebration goal={celebrate} onClose={() => { markCelebrated(window.localStorage, celebrate.id); setCelebrate(undefined); }} /></Suspense>}
    {whatsNewOpen && !onboardingOpen && !setupOpen && !firstWeekTourOpen && !modal && more !== "sync" && <WhatsNewSheet onClose={dismissWhatsNew} onOpenTrip={() => { dismissWhatsNew(); window.dispatchEvent(new Event("buget-familie:open-charts")); }} onOpenMore={() => { dismissWhatsNew(); setMore("overview"); go("utilities"); }} />}
  </div>;
}
