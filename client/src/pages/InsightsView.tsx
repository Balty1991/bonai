/** Ecranul Analiză. Scos din home-secondary. */
import { lazy, Suspense, useState } from "react";
import { Activity, Bot, CalendarHeart, CalendarRange, ChartSpline, FileBarChart, LayoutDashboard, Users } from "lucide-react";
import { type AppData } from "@/lib/finance-data";
import { type MainView, type MoreView } from "@/pages/home-kit";
import { t } from "@/lib/i18n";
import { warmLazy } from "@/lib/lazy-safe";
import { MonthVsAverage } from "@/components/MonthVsAverage";
import { SmallSpendsCard } from "@/components/SmallSpendsCard";
import { TagTotalsCard } from "@/components/TagTotalsCard";
import "../monthly-needs.css";

const ReportsPanel = lazy(() => import("@/components/ReportsPanel").then((module) => ({ default: module.ReportsPanel })));
const AdvisorPanel = lazy(() => import("@/components/AdvisorPanel").then((module) => ({ default: module.AdvisorPanel })));
const HouseholdStudio = lazy(() => import("@/components/HouseholdStudio").then((module) => ({ default: module.HouseholdStudio })));

/** Restul analizei, într-un singur loc: raportul lunii, graficele, tendințele, calendarul și planul pe 12 luni. */
const TOOLS: Array<{ tab: MoreView; label: string; icon: typeof Activity }> = [
  { tab: "advisor", label: "Raportul lunii", icon: FileBarChart },
  { tab: "charts", label: "Grafice", icon: ChartSpline },
  { tab: "trends", label: "Tendințe", icon: Activity },
  { tab: "money-calendar", label: "Calendarul banilor", icon: CalendarHeart },
  { tab: "year-plan", label: "Planul pe 12 luni", icon: CalendarRange },
];
const openTool = (tab: MoreView) => window.dispatchEvent(new CustomEvent("buget-familie:open-analysis-tool", { detail: tab }));

export const preloadInsights = () => Promise.all([warmLazy(ReportsPanel), warmLazy(HouseholdStudio), warmLazy(AdvisorPanel)]).then(() => undefined);

/** Atelierul Financiar 3.0 — Analiza este o destinație de lucru, cu rapoarte și asistent separat încărcate la cerere. */
export function InsightsView({ data, onChange, onGo }: { data: AppData; onChange: (next: AppData) => void; onGo?: (view: MainView) => void }) {
  const [panel, setPanel] = useState<"reports" | "household" | "assistant">("reports");
  return <div className="bf-page bf-insights-workspace"><header className="bf-insights-header"><div><p className="bf-kicker">{t("ANALIZĂ FINANCIARĂ")}</p><h1>{t("Înțelege")} <em>{t("schimbarea.")}</em></h1></div><span><LayoutDashboard size={25} /></span></header><div className="bf-insights-switch bf-segment" role="tablist" aria-label={t("Tip analiză")}><button role="tab" aria-selected={panel === "reports"} className={panel === "reports" ? "active" : ""} onClick={() => setPanel("reports")}><LayoutDashboard size={16} /> {t("Istoric")}</button><button role="tab" aria-selected={panel === "household"} className={panel === "household" ? "active" : ""} onClick={() => setPanel("household")}><Users size={16} /> {t("Gospodărie")}</button><button role="tab" aria-selected={panel === "assistant"} className={panel === "assistant" ? "active" : ""} onClick={() => setPanel("assistant")}><Bot size={16} /> {t("Asistent")}</button></div><nav className="bf-hero-chips" aria-label={t("Mai mult din Analiză")} style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "4px 0 14px" }}>{TOOLS.map(({ tab, label, icon: Icon }) => <button key={tab} type="button" className="bf-hero-chip" onClick={() => openTool(tab)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon size={15} aria-hidden="true" />{t(label)}</button>)}</nav>{panel === "reports" ? <><MonthVsAverage data={data} /><TagTotalsCard data={data} /><SmallSpendsCard data={data} /><Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim analiza…")}</div>}><ReportsPanel data={data} onGo={onGo} /></Suspense></> : panel === "household" ? <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim gospodăria…")}</div>}><HouseholdStudio data={data} onChange={onChange} /></Suspense> : <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim asistentul…")}</div>}><AdvisorPanel data={data} onChange={onChange} /></Suspense>}</div>;
}
