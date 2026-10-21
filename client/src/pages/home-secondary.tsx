/**
 * Doar „Mai mult”. Setări, Sync și bonurile se încarcă când deschizi rândul.
 */
import { isDemoMode } from "@/lib/demo-data";
import { otherPhoneHasLogged } from "@/lib/habit-hold";
import { getOrCreateDeviceId } from "@/lib/sync-devices";
import "../mobile-settings-pass.css";
import "../atelier-review-final.css";
import { lazy, Suspense } from "react";
import { warmLazy } from "@/lib/lazy-safe";
import { ChevronLeft } from "lucide-react";
import { createEmptyAppData, type AppData, type Receipt } from "@/lib/finance-data";
import { clearReceiptImageStorage } from "@/lib/receipt-storage";

import {
  type MainView,
  type MoreView,
  type SyncPanelProps,
} from "@/pages/home-kit";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { t } from "@/lib/i18n";
import { askConfirm } from "@/lib/confirm-dialog";


import { readAppMode } from "@/lib/app-mode";


/** Subsolul din Mai mult: linkuri mici la vedere, dar cu loc de atins de 44 px. */
const WarrantiesPanel = lazy(() => import("@/components/WarrantiesPanel").then((module) => ({ default: module.WarrantiesPanel })));
const ProductCatalogPanel = lazy(() => import("@/components/ProductCatalogPanel").then((module) => ({ default: module.ProductCatalogPanel })));
const SettingsPanel = lazy(() => import("./SettingsPanel").then((module) => ({ default: module.SettingsPanel })));
const SyncPanel = lazy(() => import("./SyncPanel").then((module) => ({ default: module.SyncPanel })));

/** Panoul din spatele fiecărei file: încălzit înainte de deschidere, ca scheletul „Pregătim…” să nu clipească. */
const TAB_PANELS: Partial<Record<MoreView, (object | (() => Promise<unknown>))[]>> = {
  catalog: [ProductCatalogPanel], warranties: [WarrantiesPanel],
  settings: [SettingsPanel, () => import("./SettingsPanel").then((module) => module.preloadSettingsParts())], sync: [SyncPanel],
};
const warmTabs = new Set<MoreView>(["feedback"]);
export const isMoreTabWarm = (tab: MoreView) => warmTabs.has(tab);
/** Fără rețea, o bucată poate lipsi: fila se deschide oricum (arată „offline”), nu rămâne blocată. */
export const preloadMoreTab = (tab: MoreView): Promise<void> => warmTabs.has(tab) ? Promise.resolve()
  : Promise.all((TAB_PANELS[tab] || []).map((panel) => typeof panel === "function" ? panel() : warmLazy(panel))).then(() => { warmTabs.add(tab); }, () => undefined);
export const MORE_TABS = Object.keys(TAB_PANELS) as MoreView[];

export function MoreView({ backTo, tab, setTab, data, onChange, onAddReceipt, onSaveReceipt, onOpenCalendar: _onOpenCalendar, sync }: { backTo?: { label: string; go: () => void }; tab: MoreView; setTab: (value: MoreView) => void; data: AppData; onChange: (value: AppData) => void; onAddReceipt: () => void; onSaveReceipt: (item: Receipt) => void; onDeleteReceipt: (id: string) => void; onOpenCalendar: () => void; onGo?: (view: MainView) => void; receiptStorageNotice?: string; sync: SyncPanelProps }) {
  if (!["catalog", "warranties", "settings", "feedback", "sync"].includes(tab)) tab = "settings";
  const content = () => {
    if (tab === "catalog") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim catalogul…")}</div>}><ProductCatalogPanel data={data} onSaveReceipt={onSaveReceipt} onOpenReceiptForm={onAddReceipt} /></Suspense>;
    if (tab === "warranties") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim garanțiile…")}</div>}><WarrantiesPanel data={data} onChange={onChange} /></Suspense>;
    if (tab === "settings") return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim setările…")}</div>}><SettingsPanel data={data} onChange={onChange} onReset={async () => { if (!await askConfirm(t("Ștergi toate datele locale de pe acest dispozitiv?"))) return; void clearReceiptImageStorage(); onChange(createEmptyAppData()); }} /></Suspense>;
    if (tab === "feedback") return <FeedbackPanel screen={`utilities`} synced={Boolean(sync.connected)} />;
    // Familia exemplu nu pleacă în camera de sincronizare a nimănui.
    if (isDemoMode()) return <div className="bf-empty-state"><h2>{t("Sincronizarea pornește cu datele tale")}</h2><p>{t("Acum vezi familia exemplu. Apasă „Încep cu datele mele” sus, apoi poți invita partenerul.")}</p></div>;
    return <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim sincronizarea…")}</div>}><SyncPanel {...sync} otherPhoneLogged={otherPhoneHasLogged(data, getOrCreateDeviceId())} /></Suspense>;
  };
  return <div className="bf-page bf-utilities-workspace"><header className="bf-topline compact"><div><h1>{readAppMode() === "shop" ? ({ settings: t("Setări"), sync: t("Familie și membri"), warranties: t("Garanții și retururi"), catalog: t("Produse") } as Record<string, string>)[tab] ?? t("Cont") : t("Mai mult")}</h1></div></header>{tab !== "overview" && <div className="bf-more-back-row"><button type="button" className="bf-more-back" onClick={() => (backTo ? backTo.go() : setTab("overview"))}><ChevronLeft size={18} aria-hidden="true" /> {backTo ? backTo.label : t("Înapoi la instrumente")}</button></div>}{content()}</div>;
}

