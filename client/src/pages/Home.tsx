/**
 * Atelierul Financiar — tablou mobil pentru o persoană sau o gospodărie, cu decizia următoare în prim-plan.
 * First paint: doar Astăzi. Restul ecranelor, sync-ul și formularele se încarcă la cerere.
 */
import { enrichSavedReceipt } from "@/lib/receipt-products";

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
import { Archive, BarChart3, Bell, CloudOff, Users, RotateCcw, Inbox, LayoutGrid, MessagesSquare, MoreHorizontal, Plus, ReceiptText, ShieldCheck, Wallet, X, Home as HomeIcon, ScanLine, ShoppingBasket, Store, UserRound } from "lucide-react";
import { isArchiveMode, setAppMode, useAppMode } from "@/lib/app-mode";
import "./shop.css";
import { allocationStatus, createEmptyAppData, TOMBSTONE_MAX, rollIncomeHorizon, deviceTimeZone, setFamilyTimeZone, getFamilyTimeZone, adoptOutsideExpenses, commitLedgerEntry, learnMerchantRule, formatDate, isoToday, newId, type AppData, type Receipt, type ReceiptLine, type Transaction } from "@/lib/finance-data";



import { clearReceiptImageStorage } from "@/lib/receipt-storage";
import { queueReceiptForReview, attachReceiptDetail } from "@/lib/receipt-review";
import { applyReceiptEdit, prefillFromReceipt, removeReceipt } from "@/lib/receipt-edit";

import { safeSetItem } from "@/lib/safe-storage";
import { closeTopDialog } from "@/hooks/use-focus-trap";
import { BrandMark } from "@/components/BrandMark";
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
  fmtExact,
  money,
  type MainView,
  type MoreView,
} from "@/pages/home-kit";
import { markWhatsNewSeen, shouldShowWhatsNew } from "@/lib/theme-default";
import { markFirstWeekTourSeen, shouldOfferFirstWeekTour } from "@/lib/first-week-tour";
import { daysLabel, t } from "@/lib/i18n";
import { todayBrief } from "@/lib/household-insights";


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

import { isNativeApp } from "@/lib/app-storage";
import { buildUndoSave } from "@/lib/undo-delete";
import { formatInvite, parseInvite, takeInviteFromLocation } from "@/lib/family-invite";
const openHouseholdGuide = () => window.dispatchEvent(new CustomEvent("buget-familie:open-guide"));

import { reloadToNewVersion, useUpdateAvailable } from "@/lib/update-check";
import { labelWithQty } from "@/lib/receipt-review-model";


const ReceiptReview = lazy(safeImport(() => import("@/components/ReceiptReview").then((module) => ({ default: module.ReceiptReview }))));
const MoreViewScreen = lazy(safeImport(() => import("@/pages/home-secondary").then((module) => ({ default: module.MoreView }))));
const ShopHome = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.ShopHome }))));
const StoresView = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.StoresView }))));
const BonAIAssistant = lazy(safeImport(() => import("@/components/BonAIAssistant")));
const HouseCostsPanel = lazy(safeImport(() => import("@/components/HouseCostsPanel")));
const DebtsPanel = lazy(safeImport(() => import("@/components/DebtsPanel")));
const ShopHistory = lazy(safeImport(() => import("@/components/ShopHistory")));
const ListView = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.ListView }))));
const PricesView = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.PricesView }))));
const HouseView = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.HouseView }))));
const ShopWelcome = lazy(safeImport(() => import("@/pages/ShopViews").then((module) => ({ default: module.ShopWelcome }))));
const ReceiptScanButton = lazy(safeImport(() => import("@/components/ReceiptScanButton").then((module) => ({ default: module.ReceiptScanButton }))));

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
  const task = id === "utilities" ? warmLazy(MoreViewScreen)
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
  /** Ecranul de unde s-a deschis un instrument, ca „Înapoi” să ducă tot acolo (testare, #6). */
  const [moreReturn, setMoreReturn] = useState<{ view: MainView; label: string } | null>(null);
  const [guideOn, setGuideOn] = useState(false);
  const openScanRef = useRef<() => void>(() => undefined);
  const openTxRef = useRef<() => void>(() => undefined);
  const [costsKind, setCostsKind] = useState<"sub" | "bill" | "debts" | "receipts" | "costs">();
  const [modal, setModal] = useState<"quick" | "transaction" | "receipt" | "debt" | "saving" | "debt-payment" | "scan" | "review" | null>(null);
  useEffect(() => {
    // Legăturile vechi din aplicație (Astăzi, lista) duc acum la echivalentul BonAI.
    const openExpense = () => window.dispatchEvent(new Event("bonai:open-manual"));
    const openShopping = () => go("list");
    window.addEventListener("buget-familie:open-expense", openExpense);
    window.addEventListener("buget-familie:open-shopping", openShopping);
    return () => { window.removeEventListener("buget-familie:open-expense", openExpense); window.removeEventListener("buget-familie:open-shopping", openShopping); };
  }, []);
  const [scanPrefill, setScanPrefill] = useState<ScanPrefill>();
  const [editReceipt, setEditReceipt] = useState<Receipt>();
  const receiptStorageNotice = "";
  const legacyReceiptMigrationStarted = useRef(false);
  const setupOffered = useRef(setupOpen);
  // Obiectiv atins: o felicitare pe obiectiv, pe telefonul acesta.
  const [whatsNewOpen, setWhatsNewOpen] = useState(false); const [firstWeekTourOpen, setFirstWeekTourOpen] = useState(false);
  const {
    activeTheme, setTheme,
    themeSchedule, setThemeSchedule,
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
  useEffect(() => { const main = document.getElementById("main-content"); if (!main) return; const remember = () => { if (scrollKeyNow.current === scrollKey) scrollMemo.current[scrollKey] = main.scrollTop; }; main.addEventListener("scroll", remember, { passive: true }); return () => main.removeEventListener("scroll", remember); }, [scrollKey]);  useEffect(() => { const replay = () => setOnboardingOpen(true); const replaySetup = () => setSetupOpen(true); const openTutorial = () => { setMore("guide"); go("utilities"); }; window.addEventListener("buget-familie:replay-onboarding", replay); window.addEventListener("buget-familie:replay-setup", replaySetup); window.addEventListener("buget-familie:open-usage-tutorial", openTutorial); const hasStarted = data.transactions.length > 0 || data.settings.salaryPlan.allocations.length > 0 || data.debts.length > 0 || data.savings.length > 0 || data.settings.paymentSources.some((source) => source.openingBalance > 0) || Boolean(data.settings.salaryPlan.nextPayday); if (hasStarted && !window.localStorage.getItem("buget-familie:setup-complete")) safeSetItem(window.localStorage, "buget-familie:setup-complete", "true"); if (storageReady && !window.localStorage.getItem("buget-familie:setup-complete") && !hasStarted && !setupOffered.current) { setupOffered.current = true; safeSetItem(window.localStorage, "buget-familie:onboarding-complete", "true"); setSetupOpen(true); } return () => { window.removeEventListener("buget-familie:replay-onboarding", replay); window.removeEventListener("buget-familie:replay-setup", replaySetup); window.removeEventListener("buget-familie:open-usage-tutorial", openTutorial); }; }, [storageReady, data.transactions.length, data.settings.salaryPlan.allocations.length, data.debts.length, data.savings.length, data.settings.paymentSources, data.settings.salaryPlan.nextPayday]);
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
      const queue: (() => Promise<unknown>)[] = [...module.MORE_TABS.map((tab) => () => module.preloadMoreTab(tab))];
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
  const saveReceipt = (item: Receipt) => update((current) => queueReceiptForReview(current, item));
  /** Șterge bonul (și mișcarea lui) după confirmare; 5 secunde de „Anulează”. Sincronizarea duce pietrele de mormânt la familie. */
  const deleteReceipt = async (receipt: Receipt): Promise<boolean> => {
    const ok = await askConfirm(t("Bonul de la {store} ({amount}) dispare din istoric, prețuri și statistici, și de pe telefoanele familiei.", { store: receipt.vendor, amount: money(receipt.amount) }), { title: t("Ștergi bonul?"), confirmLabel: t("Șterge bonul"), danger: true });
    if (!ok) return false;
    deleteWithUndo(t("Bonul a fost șters."), (current) => removeReceipt(current, receipt.id), 5000);
    return true;
  };
  const openTx = (item?: Transaction) => {
    // În BonAI, „notează de mână” e același ecran de bon, gol: fără surse, plicuri sau venituri.
    if (!item && !memberModeActive) { setScanPrefill({ title: "", amount: 0, category: "Alimente", lines: [], discount: 0, count: 0 }); setModal("review"); return; }
  };
  // Widgetul și dala din Setări rapide deschid direct ecranul cerut, fără pași intermediari.
  useEffect(() => observeQuickActions((action) => {
    // Widgetul și dalele din Setări rapide: bon → scanare, notat de mână → bon gol, voce → asistent, listă → Cumpărături.
    if (action === "receipt") { window.dispatchEvent(new Event("bonai:open-scan")); return; }
    if (action === "voice") { setGuideOn(true); return; }
    if (action === "shopping") { go("list"); return; }
    if (action === "expense" || (typeof action === "object" && action.kind === "template")) { window.dispatchEvent(new Event("bonai:open-manual")); return; }
    go("shop");
  }), []);
  useEffect(() => {
    const scan = () => openScanRef.current();
    const manual = () => openTxRef.current();
    window.addEventListener("bonai:open-scan", scan);
    window.addEventListener("bonai:open-manual", manual);
    return () => { window.removeEventListener("bonai:open-scan", scan); window.removeEventListener("bonai:open-manual", manual); };
  }, []);
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
  const openScan = () => { setScanPrefill(undefined); setModal("scan"); };
  openScanRef.current = openScan;
  openTxRef.current = () => openTx();
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
  const rawView = view;
  const current = () => {
    const view = (["shop", "list", "products", "stores", "house", "utilities"] as MainView[]).includes(rawView) ? rawView : "shop";
    if (view === "shop") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim cumpărăturile…")}</div>}><ShopHome data={data} onScan={openScan} onOpenProducts={() => go("products")} onOpenStores={() => go("stores")} onOpenMore={(tab) => { if (tab === "receipts") { setCostsKind("receipts"); return; } setMoreReturn({ view: "shop", label: t("Înapoi la Acasă") }); setMore(tab); go("utilities"); }} /></Suspense>;
    if (view === "list") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim lista…")}</div>}><ListView data={data} onChange={applyData} /></Suspense>;
    if (view === "products") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim prețurile…")}</div>}><PricesView data={data} onChange={applyData} /></Suspense>;
    if (view === "stores") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim magazinele…")}</div>}><StoresView data={data} /></Suspense>;
    if (view === "house") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim contul…")}</div>}><HouseView data={data} onOpenCosts={setCostsKind} onOpenMore={(tab) => { setMoreReturn({ view: "house", label: t("Înapoi la Cont") }); setMore(tab); go("utilities"); }} onOpenJournal={() => go("journal")} onOpenBudget={() => { setAppMode("budget"); }} look={themeSchedule === "system" ? "auto" : activeTheme === "white" ? "light" : "dark"} onLook={(look) => { if (look === "auto") { setThemeSchedule("system"); return; } setTheme(look === "light" ? "white" : "dark"); setThemeSchedule("manual"); }} /></Suspense>;
    if (view === "utilities") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim instrumentele…")}</div>}><MoreViewScreen tab={more} setTab={(value) => { if (value !== more) { if (value === "charts") void import("@/components/ChartsPanel"); setMore(value); } if (value === "overview") setMoreReturn(null); }} backTo={moreReturn ? { label: moreReturn.label, go: () => { const target = moreReturn.view; setMoreReturn(null); setMore("overview"); go(target); } } : undefined} data={data} onChange={applyData} onAddReceipt={() => setModal("receipt")} onSaveReceipt={saveReceipt} onDeleteReceipt={(id) => { const found = data.receipts.find((item) => item.id === id); if (found) void deleteReceipt(found); }} onOpenCalendar={() => go("calendar")} onGo={go} receiptStorageNotice={receiptStorageNotice} sync={syncPanelProps} /></Suspense>;
    return null;
  };
  return <div className={"bf-app os-shell" + ((setupOpen && !shopMode) || onboardingOpen ? " is-setup" : "")}>
    <a className="bf-skip-link" href="#main-content">{t("Sari la conținut")}</a>
    {appMode === "budget" && isArchiveMode() && <div className="bf-storage-notice bf-archive-banner" role="status" style={{ background: "#14231E", color: "#FFFFFF" }}><Archive size={15} aria-hidden="true" /><span style={{ color: "inherit" }}>{t("Arhiva veche, doar citire")}</span><button type="button" style={{ color: "#FFFFFF", background: "transparent", textDecoration: "underline", fontWeight: 700 }} onClick={() => setAppMode("shop")}>{t("Înapoi la BonAI")}</button></div>}
    {storageNotice && <div className="bf-storage-notice" role="status"><ShieldCheck size={15} /><span>{storageNotice}</span><button type="button" aria-label={t("Închide notificarea")} onClick={() => setStorageNotice(null)}><X size={14} /></button></div>}
    {updateAvailable && <div className="bf-offline-banner bf-update-banner" role="status" aria-live="polite"><RotateCcw size={15} aria-hidden="true" /><span>{t("Există o versiune nouă a aplicației.")}</span><button type="button" onClick={() => void reloadToNewVersion()}>{t("Reîncarcă")}</button></div>}
    {!online && <div className="bf-offline-banner" role="status" aria-live="polite"><CloudOff size={15} aria-hidden="true" /><span>{syncPanelProps.connected ? t("Fără conexiune — modificările rămân pe telefon și se trimit la reconectare.") : t("Fără conexiune — lucrezi local pe acest telefon.")}</span></div>}
    {syncPanelProps.stopped && !onSyncScreen && <div className="bf-offline-banner bf-sync-off-banner" role="status" aria-live="polite"><CloudOff size={15} aria-hidden="true" /><span>{t("Sincronizarea familiei e oprită pe acest telefon. Ce notezi nu ajunge la ceilalți.")}</span><button type="button" onClick={() => { setMore("sync"); go("utilities"); }}>{t("Reconectează")}</button></div>}
    {syncPanelProps.needsSelfChoice && syncPanelProps.connected && !onSyncScreen && !memberModeActive && <div className="bf-offline-banner bf-sync-off-banner" role="status"><Users size={15} aria-hidden="true" /><span>{t("Spune-ne cine ești pe acest telefon, ca cheltuielile tale să nu apară pe altcineva.")}</span><button type="button" onClick={() => { setMore("sync"); go("utilities"); }}>{t("Alege")}</button></div>}
    <header className="bf-appbar os-appbar"><button className="os-brand" onClick={() => go("shop")}><BrandMark /><span className="os-brand-copy bn-wordmark"><b>Bon</b><i>AI</i></span></button>{!memberModeActive && <button type="button" className="os-desktop-add" onClick={openScan}><ScanLine size={17} aria-hidden="true" /><span>{t("Scanează")}</span></button>}<nav className="os-desktop-nav" aria-label={t("Navigație principală")}>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "is-on" : ""} aria-current={view === item.id ? "page" : undefined} onPointerEnter={() => preloadView(item.id)} onPointerDown={() => { preloadView(item.id); void ensureDeferredStyles(); }} onClick={() => go(item.id)}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></button>; })}</nav>{!memberModeActive && <div className="os-tools">{!shopMode && <button className={view === "utilities" ? "os-tool is-on" : "os-tool"} aria-label={data.pendingReview.length ? t("Deschide instrumentele · {count} de verificat", { count: data.pendingReview.length }) : t("Deschide instrumentele")} onPointerDown={() => { preloadView("utilities"); void ensureDeferredStyles(); }} onClick={() => go("utilities")}><MoreHorizontal size={19} />{data.pendingReview.length > 0 && <span className="bf-nav-count" aria-hidden="true">{data.pendingReview.length}</span>}</button>}<button className="os-tool" aria-label={t("Deschide ghidul")} onClick={openHouseholdGuide}><MessagesSquare size={17} /></button></div>}</header>{!memberModeActive && <button type="button" className="os-tablet-add" onClick={openScan}><ScanLine size={20} aria-hidden="true" /><span>{t("Scanează")}</span></button>}
    {demo && !setupOpen && <aside className="bf-demo-banner" role="status"><span><b>{t("Familie exemplu")}</b> · {t("datele sunt inventate")}</span><button type="button" className="bf-primary" onClick={() => void leaveDemo()}>{t("Încep cu datele mele")}</button></aside>}
    <main id="main-content" key={today} className={(setupOpen && !shopMode) || onboardingOpen ? "is-setup-main" : undefined}>{setupOpen ? (shopMode ? <Suspense fallback={null}><ShopWelcome onScan={() => { finishShopWelcome(); openScan(); }} onList={() => { finishShopWelcome(); go("list"); }} onJoin={() => { finishShopWelcome(); setMore("sync"); go("utilities"); }} onSkip={finishShopWelcome} /></Suspense> : null) : memberModeActive ? <MemberModeScreen data={data} memberId={memberMode} onChange={applyData} /> : current()}</main>
    {/* Pe body: bara apare și peste ecranele pe tot ecranul (Bonuri, editorul bonului). */}
    {undo && createPortal(
      <div className="bf-undo-bar" role="status" aria-live="polite">
        <span>{undo.label}</span>
        <button type="button" onClick={runUndo}><RotateCcw size={15} aria-hidden="true" /> {t("Anulează")}</button>
        <button type="button" className="bf-undo-close" aria-label={t("Închide")} onClick={() => setUndo(null)}><X size={16} /></button>
      </div>, document.body,
    )}

    {data.pendingReview.length > 0 && <button type="button" className="bf-dock-review-badge" onClick={() => { setMore("review"); go("utilities"); }} aria-label={t("Deschide De verificat · {count}", { count: data.pendingReview.length })}><Inbox size={15} /> {t("De verificat")} · {data.pendingReview.length}</button>}
    <div className="os-nav-fill" aria-hidden="true" />
    {/* Meniul de jos: Astăzi · Plicuri · ＋ Notează · Mișcări · Mai mult. „Notează” stă mereu în același loc, la mijloc;
        Obligațiile și Analiza sunt în „Mai mult”, ca pe telefon să rămână 4 file și butonul care contează. */}
    {nav.length > 0 && !(shopMode && setupOpen) && <nav className="os-dock os-dock-v2" aria-label={t("Navigație mobilă")}>{(shopMode ? shopDock : dockNav).map((item) => {
      if (item.id === "add" && shopMode) return <button key="add" type="button" className="os-dock-add" onPointerDown={() => void import("@/components/ReceiptScanButton")} onClick={openScan}><span className="os-dock-add-disc"><ScanLine size={24} aria-hidden="true" /></span><span>{t("Scanează")}</span></button>;
      if (item.id === "add") return <button key="add" type="button" className="os-dock-add" onClick={() => openTx()}><span className="os-dock-add-disc"><Plus size={24} aria-hidden="true" /></span><span>{t("Notează")}</span></button>;
      const Icon = item.icon;
      const on = view === item.id || (item.id === "utilities" && (view === "obligations" || view === "insights" || view === "goals"));
      return <button key={item.id} className={on ? "is-on" : ""} aria-current={view === item.id ? "page" : undefined} onPointerDown={() => { preloadView(item.id as MainView); void ensureDeferredStyles(); }} onClick={() => { if (item.id === "utilities") setMore("overview"); go(item.id as MainView); }}><Icon size={18} aria-hidden="true" /><span>{item.label}</span>{(item.id === "journal" || item.id === "utilities") && data.pendingReview.length > 0 ? <i className="bf-dock-dot" aria-hidden="true" /> : null}</button>;
    })}</nav>}
    {shopMode && costsKind === "debts" && <Suspense fallback={null}><DebtsPanel data={data} onChange={applyData} onClose={() => setCostsKind(undefined)} /></Suspense>}
    {shopMode && (costsKind === "receipts" || costsKind === "costs") && <Suspense fallback={null}><ShopHistory data={data} initialTab={costsKind} onClose={() => setCostsKind(undefined)} onEdit={setEditReceipt} onDelete={deleteReceipt} /></Suspense>}
    {shopMode && editReceipt && <Suspense fallback={null}><ReceiptReview key={editReceipt.id} mode="edit" data={data} prefill={prefillFromReceipt(editReceipt)} onCancel={() => setEditReceipt(undefined)} onSave={(review) => update((current) => applyReceiptEdit(current, editReceipt.id, review))} /></Suspense>}
    {shopMode && (costsKind === "sub" || costsKind === "bill") && <Suspense fallback={null}><HouseCostsPanel data={data} kind={costsKind} onChange={applyData} onClose={() => setCostsKind(undefined)} /></Suspense>}
    {shopMode && guideOn && <Suspense fallback={null}><BonAIAssistant data={data} onChange={applyData} onClose={() => setGuideOn(false)} onGo={(screen) => { setGuideOn(false); if (screen === "scan") { openScan(); return; } if (screen === "prices") { go("products"); return; } go("list"); if (screen !== "list") window.setTimeout(() => window.dispatchEvent(new CustomEvent("bonai:list-tab", { detail: screen })), 0); }} /></Suspense>}
    
       
    
    
    
    
    {modal === "scan" && !memberModeActive && shopMode && createPortal(<div className="bn-review bn-scan-hub" role="dialog" aria-modal="true" aria-label={t("Scanează bonul")}><header className="bn-review-top"><button type="button" className="bn-icon-btn" aria-label={t("Închide")} onClick={() => setModal(null)}><X size={20} /></button><p className="bn-hub-title">{t("Scanează")}</p><span /></header><div className="bn-review-scroll"><Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim camera…")}</div>}><ReceiptScanButton hub data={data} onManual={() => { setModal(null); openTx(); }} onResult={(prefill) => { setScanPrefill(prefill); setModal("review"); }} /></Suspense></div></div>, document.body)}
    
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
    
    
    
    
    
    
    {whatsNewOpen && !onboardingOpen && !setupOpen && !firstWeekTourOpen && !modal && more !== "sync" && <WhatsNewSheet onClose={dismissWhatsNew} onOpenTrip={() => { dismissWhatsNew(); window.dispatchEvent(new Event("buget-familie:open-charts")); }} onOpenMore={() => { dismissWhatsNew(); setMore("overview"); go("utilities"); }} />}
  </div>;
}
