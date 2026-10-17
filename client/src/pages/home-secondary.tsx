/**
 * Doar „Mai mult”. Setări, Sync și bonurile se încarcă când deschizi rândul.
 */
import { isDemoMode } from "@/lib/demo-data";
import { otherPhoneHasLogged } from "@/lib/habit-hold";
import { getOrCreateDeviceId } from "@/lib/sync-devices";
import "../mobile-settings-pass.css";
import "../atelier-review-final.css";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { warmLazy } from "@/lib/lazy-safe";
import { recapReady, recapYearFor, yearRecap } from "@/lib/year-recap";
import { ChartSpline, Landmark, TrendingDown, Sparkles, Sprout, MessageSquareWarning, BarChart3, Bell, BellRing, BrainCircuit, BookOpen, CalendarClock, Check, Inbox, ChevronLeft, ChevronRight, Cloud, Download, ListChecks, Search, Palette, PiggyBank, Plane, Plus, ReceiptText, Settings, ShieldCheck, ShoppingBasket, Store, PiggyBank as PiggyBankIcon, Trash2 } from "lucide-react";
import { createEmptyAppData, isReceiptGapLabel, isoToday, type AppData, type Debt, type Receipt, type SavingsGoal } from "@/lib/finance-data";
import { clearReceiptImageStorage } from "@/lib/receipt-storage";
import { setSimpleMode } from "@/lib/ui-prefs";
import {
  BudgetBar,
  dateText,
  money,
  type MainView,
  type MoreView,
  type SyncPanelProps,
} from "@/pages/home-kit";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { t } from "@/lib/i18n";
import { askConfirm } from "@/lib/confirm-dialog";
import { visibleShopping } from "@/lib/shopping-list";
import { APP_PRIVACY_PATH, APP_SUPPORT_EMAIL, APP_TERMS_PATH, APP_VERSION, publicLegalUrl } from "@/lib/app-version";

/** Subsolul din Mai mult: linkuri mici la vedere, dar cu loc de atins de 44 px. */
const FOOT_LINK = { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 4px", color: "inherit" } as const;
const ReportsPanel = lazy(() => import("@/components/ReportsPanel").then((module) => ({ default: module.ReportsPanel })));
const RecurringPanel = lazy(() => import("@/components/RecurringPanel").then((module) => ({ default: module.RecurringPanel })));
const ReviewCenterPanel = lazy(() => import("@/components/ReviewCenterPanel").then((module) => ({ default: module.ReviewCenterPanel })));
const PriceWatchPanel = lazy(() => import("@/components/PriceWatchPanel").then((module) => ({ default: module.PriceWatchPanel })));
const PocketPanel = lazy(() => import("@/components/PocketPanel").then((module) => ({ default: module.PocketPanel })));
const PlannedEventsPanel = lazy(() => import("@/components/PlannedEventsPanel").then((module) => ({ default: module.PlannedEventsPanel })));
const AdvisorPanel = lazy(() => import("@/components/AdvisorPanel").then((module) => ({ default: module.AdvisorPanel })));
const ReceiptsStudio = lazy(() => import("@/components/ReceiptsStudio").then((module) => ({ default: module.ReceiptsStudio })));
const LearnedRulesPanel = lazy(() => import("@/components/LearnedRulesPanel").then((module) => ({ default: module.LearnedRulesPanel })));
const YearPlanPanel = lazy(() => import("@/components/YearPlanPanel").then((module) => ({ default: module.YearPlanPanel })));
const NetWorthPanel = lazy(() => import("@/components/NetWorthPanel").then((module) => ({ default: module.NetWorthPanel })));
const DebtExitPanel = lazy(() => import("@/components/DebtExitPanel").then((module) => ({ default: module.DebtExitPanel })));
const ChartsPanel = lazy(() => import("@/components/ChartsPanel").then((module) => ({ default: module.ChartsPanel })));
const TrendsPanel = lazy(() => import("@/components/TrendsPanel").then((module) => ({ default: module.TrendsPanel })));
const InvestSimPanel = lazy(() => import("@/components/InvestSimPanel").then((module) => ({ default: module.InvestSimPanel })));
const MoneyCalendarPanel = lazy(() => import("@/components/MoneyCalendarPanel").then((module) => ({ default: module.MoneyCalendarPanel })));
const YearRecapStory = lazy(() => import("@/components/YearRecapStory").then((module) => ({ default: module.YearRecapStory })));
const MonthAdvisorPanel = lazy(() => import("@/components/MonthAdvisorPanel").then((module) => ({ default: module.MonthAdvisorPanel })));
const TripPanel = lazy(() => import("@/components/TripPanel").then((module) => ({ default: module.TripPanel })));
const ShoppingListPanel = lazy(() => import("@/components/ShoppingListPanel").then((module) => ({ default: module.ShoppingListPanel })));
const ProductCatalogPanel = lazy(() => import("@/components/ProductCatalogPanel").then((module) => ({ default: module.ProductCatalogPanel })));
const SettingsPanel = lazy(() => import("./SettingsPanel").then((module) => ({ default: module.SettingsPanel })));
const SyncPanel = lazy(() => import("./SyncPanel").then((module) => ({ default: module.SyncPanel })));
const FamilyGuide = lazy(() => import("./FamilyGuide").then((module) => ({ default: module.FamilyGuide })));

/** Panoul din spatele fiecărei file: încălzit înainte de deschidere, ca scheletul „Pregătim…” să nu clipească. */
const TAB_PANELS: Partial<Record<MoreView, (object | (() => Promise<unknown>))[]>> = {
  receipts: [ReceiptsStudio], catalog: [ProductCatalogPanel], review: [ReviewCenterPanel], "year-plan": [YearPlanPanel],
  "net-worth": [NetWorthPanel], "debt-exit": [DebtExitPanel], charts: [ChartsPanel], trends: [TrendsPanel], invest: [InvestSimPanel],
  "money-calendar": [MoneyCalendarPanel], advisor: [MonthAdvisorPanel], trip: [TripPanel], shopping: [ShoppingListPanel],
  prices: [PriceWatchPanel], pocket: [PocketPanel], events: [PlannedEventsPanel], recurring: [RecurringPanel], reports: [ReportsPanel],
  assistant: [AdvisorPanel], learned: [LearnedRulesPanel], settings: [SettingsPanel, () => import("./SettingsPanel").then((module) => module.preloadSettingsParts())], guide: [FamilyGuide], sync: [SyncPanel], overview: [YearRecapStory],
};
const warmTabs = new Set<MoreView>(["debts", "savings", "feedback"]);
export const isMoreTabWarm = (tab: MoreView) => warmTabs.has(tab);
/** Fără rețea, o bucată poate lipsi: fila se deschide oricum (arată „offline”), nu rămâne blocată. */
export const preloadMoreTab = (tab: MoreView): Promise<void> => warmTabs.has(tab) ? Promise.resolve()
  : Promise.all((TAB_PANELS[tab] || []).map((panel) => typeof panel === "function" ? panel() : warmLazy(panel))).then(() => { warmTabs.add(tab); }, () => undefined);
export const MORE_TABS = Object.keys(TAB_PANELS) as MoreView[];

export function MoreView({ backTo, tab, setTab, data, onChange, onAddReceipt, onSaveReceipt, onDeleteReceipt, onOpenDebt, onOpenSaving, onOpenCalendar: _onOpenCalendar, onEditDebt, onEditSaving, onPayDebt, onGo, receiptStorageNotice, sync }: { backTo?: { label: string; go: () => void }; tab: MoreView; setTab: (value: MoreView) => void; data: AppData; onChange: (value: AppData) => void; onAddReceipt: () => void; onSaveReceipt: (item: Receipt) => void; onDeleteReceipt: (id: string) => void; onOpenDebt: () => void; onOpenSaving: () => void; onOpenCalendar: () => void; onEditDebt?: (item: Debt) => void; onEditSaving?: (item: SavingsGoal) => void; onPayDebt?: (item: Debt) => void; onGo?: (view: MainView) => void; receiptStorageNotice?: string; sync: SyncPanelProps }) {
  const [simpleMode, setSimpleModeState] = useState(() => {
    try { return window.localStorage.getItem("buget-familie:simple-mode") === "1"; } catch { return false; }
  });
  useEffect(() => {
    const onPrefs = (event: Event) => {
      const detail = (event as CustomEvent<{ simpleMode?: boolean }>).detail;
      if (typeof detail?.simpleMode === "boolean") setSimpleModeState(detail.simpleMode);
    };
    window.addEventListener("buget-familie:ui-prefs", onPrefs);
    return () => window.removeEventListener("buget-familie:ui-prefs", onPrefs);
  }, []);
  useEffect(() => {
    if (!simpleMode) return;
    const allowed = new Set(["overview", "settings", "sync", "guide", "review", "recurring", "catalog", "feedback"]);
    if (!allowed.has(tab)) setTab("overview");
  }, [simpleMode, tab, setTab]);
  const isCollaborative = data.settings.members.length > 1;
  const openSettingsSection = (anchor?: string) => {
    setTab("settings");
    if (!anchor) return;
    const started = Date.now();
    const tick = () => {
      const node = document.getElementById(anchor);
      if (node) {
        // Setările sunt grupate în secțiuni pliabile: întâi deschidem grupul.
        node.closest("details")?.setAttribute("open", "");
        node.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (Date.now() - started < 2500) window.setTimeout(tick, 50);
    };
    window.setTimeout(tick, 40);
  };
  const trip = data.settings.trip;
  const [storyOpen, setStoryOpen] = useState(false);
  const story = useMemo(() => { if (tab !== "overview") return undefined; const today = isoToday(); const recap = yearRecap(data.transactions, recapYearFor(today), today); return recapReady(recap) ? recap : undefined; }, [data.transactions, tab]);
  const shoppingCount = visibleShopping(data.settings.shoppingList || []).todo.length;
  const content = () => {
    if (tab === "overview") return <div className="bf-more-overview">
      {simpleMode ? (
        <>
          <aside className="bf-simple-mode-top-banner" role="status" style={{ position: "relative", borderRadius: 12, marginBottom: 12 }}>
            <span>{t("Mod simplu activ — Dezactivează în Setări")}</span>
          </aside>
          <section className="bf-more-group" aria-labelledby="more-simple-title">
            <p className="bf-kicker bf-more-section-label" id="more-simple-title">{t("ESENȚIAL")}</p>
            <div className="bf-more-grid bf-settings-group">
              <button type="button" className="bf-settings-row" onClick={() => setTab("settings")}><Settings size={20} /><span className="bf-settings-copy"><b>{t("Setări")}</b><small>{t("profil, surse, backup și export")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
              <button type="button" className={data.pendingReview.length ? "bf-settings-row has-badge" : "bf-settings-row"} onClick={() => setTab("review")}><Inbox size={20} /><span className="bf-settings-copy"><b>{t("De verificat")}{data.pendingReview.length > 0 && <span className="bf-nav-count">{data.pendingReview.length}</span>}</b><small>{data.pendingReview.length ? t("{count} propuneri de confirmat", { count: data.pendingReview.length }) : t("import și confirmări")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
              <button type="button" className="bf-settings-row" onClick={() => setTab("catalog")}><Search size={20} /><span className="bf-settings-copy"><b>{t("Catalog")}</b><small>{t("caută un articol din listele online")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
              <button type="button" className="bf-settings-row" onClick={() => setTab("recurring")}><CalendarClock size={20} /><span className="bf-settings-copy"><b>{t("Scadențe")}</b><small>{t("facturi și abonamente")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
              <button type="button" className="bf-settings-row" onClick={() => setTab("sync")}><Cloud size={20} /><span className="bf-settings-copy"><b>{t("Sincronizare")}</b><small>{t("opțională între telefoane")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
              <button type="button" className="bf-settings-row" onClick={() => openSettingsSection("backup")}><Download size={20} /><span className="bf-settings-copy"><b>{t("Backup / Export")}</b><small>{t("în Setări, pe acest telefon")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
              <button type="button" className="bf-settings-row" onClick={() => setTab("guide")}><BookOpen size={20} /><span className="bf-settings-copy"><b>{t("Tutorial")}</b><small>{t("tutorial de folosire")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
              <button type="button" className="bf-settings-row" onClick={() => setTab("feedback")}><MessageSquareWarning size={20} /><span className="bf-settings-copy"><b>{t("Spune-ne ce nu merge")}</b><small>{t("o problemă sau o idee, direct la noi")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
            </div>
          </section>
          <button type="button" className="bf-primary bf-simple-mode-exit" onClick={() => { setSimpleMode(false); setSimpleModeState(false); }}>{t("Arată instrumentele avansate")}</button>
        </>
      ) : (
        <>
      {onGo && <section className="bf-more-group bf-more-screens" aria-labelledby="more-screens-title">
        <p className="bf-kicker bf-more-section-label" id="more-screens-title">{t("BANII FAMILIEI")}</p>
        <div className="bf-more-grid bf-settings-group">
          <button type="button" className="bf-settings-row" onClick={() => onGo("obligations")}><Bell size={20} /><span className="bf-settings-copy"><b>{t("Obligații")}</b><small>{t("scadențe, rate, datorii")}</small></span><ChevronRight className="bf-settings-chevron" size={18} /></button>
          <button type="button" className="bf-settings-row" onClick={() => onGo("insights")}><BarChart3 size={20} /><span className="bf-settings-copy"><b>{t("Analiză")}</b><small>{t("luna, raportul, grafice, tendințe, calendar, plan pe 12 luni")}</small></span><ChevronRight className="bf-settings-chevron" size={18} /></button>
          <button type="button" className="bf-settings-row" onClick={() => onGo("goals")}><PiggyBankIcon size={20} /><span className="bf-settings-copy"><b>{t("Obiective")}</b><small>{t("economii și ținte pe termen lung")}</small></span><ChevronRight className="bf-settings-chevron" size={18} /></button>
        </div>
      </section>}
      {/* Ce așteaptă o decizie urcă sus, doar cât e ceva de confirmat. */}
      {data.pendingReview.length > 0 && <section className="bf-more-group" aria-labelledby="more-daily-title">
        <p className="bf-kicker bf-more-section-label" id="more-daily-title">{t("DE REZOLVAT")}</p>
        <div className="bf-more-grid bf-settings-group">
          <button type="button" className={data.pendingReview.length ? "bf-settings-row has-badge" : "bf-settings-row"} onClick={() => setTab("review")}><Inbox size={20} /><span className="bf-settings-copy"><b>{t("De verificat")}{data.pendingReview.length > 0 && <span className="bf-nav-count">{data.pendingReview.length}</span>}</b><small>{data.pendingReview.length ? t("{count} propuneri de confirmat", { count: data.pendingReview.length }) : t("import și confirmări")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
        </div>
      </section>}
      <section className="bf-more-group" aria-labelledby="more-shop-title">
        <p className="bf-kicker bf-more-section-label" id="more-shop-title">{t("CUMPĂRĂTURI ȘI BONURI")}</p>
        <div className="bf-more-grid bf-settings-group">
          <button type="button" className="bf-settings-row" onClick={() => setTab("shopping")}><ListChecks size={20} /><span className="bf-settings-copy"><b>{t("Lista de cumpărături")}</b><small>{shoppingCount ? t("{count} de luat", { count: shoppingCount }) : t("comună pentru toată familia")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          <button type="button" className="bf-settings-row" onClick={() => setTab("prices")}><ShoppingBasket size={20} /><span className="bf-settings-copy"><b>{t("Produsele tale")}</b><small>{t("prețul fiecăruia, inflația ta, shrinkflation")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          <button type="button" className="bf-settings-row" onClick={() => setTab("receipts")}><ReceiptText size={20} /><span className="bf-settings-copy"><b>{t("Bonuri")}</b><small>{t("produse, catalog și alimente vs nealimentare")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          <button type="button" className="bf-settings-row" onClick={() => setTab("catalog")}><Search size={20} /><span className="bf-settings-copy"><b>{t("Catalog")}</b><small>{t("caută Napolact, Ariel, lapte — liste online")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          {!data.pendingReview.length && <button type="button" className={data.pendingReview.length ? "bf-settings-row has-badge" : "bf-settings-row"} onClick={() => setTab("review")}><Inbox size={20} /><span className="bf-settings-copy"><b>{t("De verificat")}{data.pendingReview.length > 0 && <span className="bf-nav-count">{data.pendingReview.length}</span>}</b><small>{data.pendingReview.length ? t("{count} propuneri de confirmat", { count: data.pendingReview.length }) : t("import și confirmări")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>}
        </div>
      </section>
      <section className="bf-more-group" aria-labelledby="more-plans-title">
        <p className="bf-kicker bf-more-section-label" id="more-plans-title">{t("PLANURI")}</p>
        <div className="bf-more-grid bf-settings-group">
          <button type="button" className="bf-settings-row" onClick={() => setTab("trip")}><Plane size={20} /><span className="bf-settings-copy"><b>{t("Vacanță")}</b><small>{trip && !trip.closedAt && trip.end >= isoToday() ? t("{name} · până pe {date}", { name: trip.name, date: dateText(trip.end) }) : t("buget separat pentru o călătorie")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
        </div>
      </section>
      {/* Ecranele pentru cine vrea mai mult stau strânse: un om obișnuit vede doar ce folosește zilnic. */}
      <details className="bf-more-group bf-more-advanced">
        <summary className="bf-settings-row" id="more-plan-title" style={{ cursor: "pointer", listStyle: "none" }}><ChartSpline size={20} /><span className="bf-settings-copy"><b>{t("Instrumente avansate")}</b><small>{t("investiții, avere, datorii, prețuri, reguli")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></summary>
        <div className="bf-more-grid bf-settings-group">
          {story && <button type="button" className="bf-settings-row" onClick={() => setStoryOpen(true)}><Sparkles size={20} /><span className="bf-settings-copy"><b>{t("Povestea anului {year}", { year: story.year })}</b><small>{t("anul familiei în cifre, ecran cu ecran")}</small></span><ChevronRight className="bf-settings-chevron" size={17} /></button>}
          <button type="button" className="bf-settings-row" onClick={() => setTab("invest")}><Sprout size={20} /><span className="bf-settings-copy"><b>{t("Investiții și pensie")}</b><small>{t("simulator: dobândă compusă, inflație, pensie")}</small></span><ChevronRight className="bf-settings-chevron" size={17} /></button>
          <button type="button" className="bf-settings-row" onClick={() => setTab("net-worth")}><Landmark size={20} /><span className="bf-settings-copy"><b>{t("Averea familiei")}</b><small>{t("ce aveți minus ce datorați")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          {data.debts.some((debt) => debt.remaining > 0) && <button type="button" className="bf-settings-row" onClick={() => setTab("debt-exit")}><TrendingDown size={20} /><span className="bf-settings-copy"><b>{t("Ieșirea din datorii")}</b><small>{t("data în care sunteți liberi, dobânda economisită")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>}
          <button type="button" className="bf-settings-row" onClick={() => openSettingsSection("bf-merchant-rules")}><Store size={20} /><span className="bf-settings-copy"><b>{t("Reguli comerciant")}</b><small>{t("categorie și plic după magazin")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          <button type="button" className="bf-settings-row" onClick={() => setTab("learned")}><BrainCircuit size={20} /><span className="bf-settings-copy"><b>{t("Ce am învățat")}</b><small>{t("regulile după care îți propun")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
        </div>
      </details>
      <section className="bf-more-group" aria-labelledby="more-house-title">
        <p className="bf-kicker bf-more-section-label" id="more-house-title">{t("SETĂRI")}</p>
        <div className="bf-more-grid bf-settings-group">
          <button type="button" className="bf-settings-row" onClick={() => setTab("settings")}><Settings size={20} /><span className="bf-settings-copy"><b>{isCollaborative ? t("Setări familie") : t("Setări profil")}</b><small>{isCollaborative ? t("membri și surse") : t("surse și categorii")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          <button type="button" className="bf-settings-row" onClick={() => setTab("sync")}><Cloud size={20} /><span className="bf-settings-copy"><b>{t("Sincronizare")}</b><small>{isCollaborative ? t("spațiu conectat") : t("opțională între telefoane")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          <button type="button" className="bf-settings-row" onClick={() => openSettingsSection("backup")}><Download size={20} /><span className="bf-settings-copy"><b>{t("Backup / Export")}</b><small>{t("o copie pe acest telefon")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          <button type="button" className="bf-settings-row" onClick={() => window.dispatchEvent(new CustomEvent("buget-familie:open-theme"))}><Palette size={20} /><span className="bf-settings-copy"><b>{t("Aspect")}</b><small>{t("Alb, Întunecat sau Bleumarin")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
          {data.settings.members.some((item) => item.kind === "child") && <button type="button" className="bf-settings-row" onClick={() => setTab("pocket")}><PiggyBankIcon size={20} /><span className="bf-settings-copy"><b>{t("Buzunar")}</b><small>{t("banii copilului")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>}
        </div>
      </section>
      <section className="bf-more-group" aria-labelledby="more-help-title">
        <p className="bf-kicker bf-more-section-label" id="more-help-title">{t("AJUTOR")}</p>
        <div className="bf-more-grid bf-settings-group">
          <button type="button" className="bf-settings-row" onClick={() => setTab("guide")}><BookOpen size={20} /><span className="bf-settings-copy"><b>{t("Tutorial")}</b><small>{t("cum notezi, cum citești cifra")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button><button type="button" className="bf-settings-row" onClick={() => setTab("feedback")}><MessageSquareWarning size={20} /><span className="bf-settings-copy"><b>{t("Spune-ne ce nu merge")}</b><small>{t("o problemă sau o idee, direct la noi")}</small></span><ChevronRight className="bf-settings-chevron" size={18} aria-hidden="true" /></button>
        </div>
      </section>
      <footer style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px", margin: "40px 0 0", color: "var(--cf-muted)", fontSize: 12 }}>
        <span style={FOOT_LINK}>{t("Buget Familie {version}", { version: APP_VERSION })}</span>
        <a href={publicLegalUrl(APP_PRIVACY_PATH)} target="_blank" rel="noreferrer" style={FOOT_LINK}>{t("Confidențialitate")}</a>
        <a href={publicLegalUrl(APP_TERMS_PATH)} target="_blank" rel="noreferrer" style={FOOT_LINK}>{t("Termeni")}</a>
        <a href={`mailto:${APP_SUPPORT_EMAIL}`} style={FOOT_LINK}>{t("Suport")}</a>
      </footer>
        </>
      )}
    </div>;
    if (tab === "debts") return <div className="bf-more-list"><button className="bf-primary bf-inline-add" onClick={onOpenDebt}><Plus size={16} /> {t("Adaugă datorie")}</button>{data.debts.map((debt) => <article key={debt.id}><button type="button" className="bf-more-list-main" onClick={() => onEditDebt?.(debt)}><span><b>{debt.name}</b><small>{debt.due}</small></span><strong>{money(debt.remaining)}</strong><em>{t("Rată {amount}/lună", { amount: money(debt.monthly) })}</em></button>{debt.remaining > 0 && onPayDebt ? <button type="button" className="bf-more-list-pay" onClick={() => onPayDebt(debt)}><Check size={16} /> {t("Plătește")}</button> : null}</article>)}{!data.debts.length && <div className="bf-empty-state slim"><BellRing size={23} /><h2>{t("Nicio datorie")}</h2></div>}</div>;
    if (tab === "savings") return <div className="bf-more-list"><button className="bf-primary bf-inline-add" onClick={onOpenSaving}><Plus size={16} /> {t("Creează obiectiv")}</button>{data.savings.map((saving) => <article key={saving.id} role="button" tabIndex={0} onClick={() => onEditSaving?.(saving)} onKeyDown={(event) => { if (event.key === "Enter") onEditSaving?.(saving); }}><span><b>{saving.name}</b><small>{saving.due}</small></span><strong>{money(saving.current)}</strong><BudgetBar used={saving.current} total={saving.target} tone="gold" /></article>)}{!data.savings.length && <div className="bf-empty-state slim"><PiggyBank size={23} /><h2>{t("Niciun obiectiv")}</h2></div>}</div>;
    if (tab === "receipts") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim bonurile…")}</div>}><div>{receiptStorageNotice && <p className="bf-notice" role="status"><ShieldCheck size={15} /> {receiptStorageNotice}</p>}<ReceiptsStudio data={data} onAddReceipt={onAddReceipt} /><div className="bf-receipt-list">{data.receipts.map((receipt) => <article key={receipt.id}><span className="bf-receipt-thumb" aria-hidden="true"><ReceiptText size={18} /></span><div><b>{receipt.vendor}</b><small>{dateText(receipt.date)} · {receipt.lines?.length || 1} {t("produse")}</small>{receipt.lines?.length ? <ul className="bf-receipt-lines" style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 3 }}>{receipt.lines.map((line) => <li key={line.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, lineHeight: 1.35 }}><span>{isReceiptGapLabel(line.label) ? t("Diferență neînregistrată") : (line.label || t(line.category))}</span><b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(line.amount)}</b></li>)}</ul> : <p>{receipt.note || t("Fără detalii")}</p>}</div><strong>{money(receipt.amount)}</strong><button aria-label={t("Șterge bonul {vendor}", { vendor: receipt.vendor })} onClick={() => onDeleteReceipt(receipt.id)}><Trash2 size={16} /></button></article>)}{!data.receipts.length && <div className="bf-empty-state slim"><ReceiptText size={23} /><h2>{t("Niciun bon")}</h2><p>{t("Scrie un bon de mână sau caută un produs în catalog.")}</p></div>}</div></div></Suspense>;
    if (tab === "catalog") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim catalogul…")}</div>}><ProductCatalogPanel data={data} onSaveReceipt={onSaveReceipt} onOpenReceiptForm={onAddReceipt} /></Suspense>;
    if (tab === "review") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim revizuirea…")}</div>}><ReviewCenterPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "year-plan") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim planul…")}</div>}><YearPlanPanel data={data} /></Suspense>;
    if (tab === "net-worth") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim averea…")}</div>}><NetWorthPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "debt-exit") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim planul de datorii…")}</div>}><DebtExitPanel data={data} /></Suspense>;
    if (tab === "charts") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim graficele…")}</div>}><ChartsPanel data={data} /></Suspense>;
    if (tab === "trends") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim tendințele…")}</div>}><TrendsPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "invest") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim simulatorul…")}</div>}><InvestSimPanel data={data} /></Suspense>;
    if (tab === "money-calendar") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim calendarul…")}</div>}><MoneyCalendarPanel data={data} /></Suspense>;
    if (tab === "advisor") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim raportul…")}</div>}><MonthAdvisorPanel data={data} /></Suspense>;
    if (tab === "trip") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim vacanța…")}</div>}><TripPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "shopping") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim lista…")}</div>}><ShoppingListPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "prices") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim prețurile…")}</div>}><PriceWatchPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "pocket") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim buzunarul…")}</div>}><PocketPanel data={data} /></Suspense>;
    if (tab === "events") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim evenimentele…")}</div>}><PlannedEventsPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "recurring") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim scadențele…")}</div>}><RecurringPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "reports") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim statisticile…")}</div>}><ReportsPanel data={data} onGo={onGo} /></Suspense>;
    if (tab === "assistant") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim asistentul…")}</div>}><AdvisorPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "learned") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim regulile…")}</div>}><LearnedRulesPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "settings") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim setările…")}</div>}><SettingsPanel data={data} onChange={onChange} onReset={async () => { if (!await askConfirm(t("Ștergi toate datele locale de pe acest dispozitiv?"))) return; void clearReceiptImageStorage(); onChange(createEmptyAppData()); }} /></Suspense>;
    if (tab === "feedback") return <FeedbackPanel screen={`utilities`} synced={Boolean(sync.connected)} />;
    if (tab === "guide") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim ghidul…")}</div>}><FamilyGuide onGo={onGo} onOpenReview={() => setTab("review")} onOpenSync={() => setTab("sync")} /></Suspense>;
    // Familia exemplu nu pleacă în camera de sincronizare a nimănui.
    if (isDemoMode()) return <div className="bf-empty-state"><h2>{t("Sincronizarea pornește cu datele tale")}</h2><p>{t("Acum vezi familia exemplu. Apasă „Încep cu datele mele” sus, apoi poți invita partenerul.")}</p></div>;
    return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim sincronizarea…")}</div>}><SyncPanel {...sync} otherPhoneLogged={otherPhoneHasLogged(data, getOrCreateDeviceId())} /></Suspense>;
  };
  return <div className="bf-page bf-utilities-workspace"><header className="bf-topline compact"><div><h1>{t("Mai mult")}</h1></div></header>{tab !== "overview" && <div className="bf-more-back-row"><button type="button" className="bf-more-back" onClick={() => (backTo ? backTo.go() : setTab("overview"))}><ChevronLeft size={18} aria-hidden="true" /> {backTo ? backTo.label : t("Înapoi la instrumente")}</button></div>}{content()}{storyOpen && story && <Suspense fallback={null}><YearRecapStory recap={story} data={data} familyName={data.settings.familyName || t("Familia noastră")} onClose={() => setStoryOpen(false)} /></Suspense>}</div>;
}

