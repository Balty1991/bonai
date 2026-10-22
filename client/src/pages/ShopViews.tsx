/**
 * Aplicația nouă, a cumpărăturilor: Acasă, Produse, Magazine și Casa.
 * Totul pornește de la bon: scanezi, iar aplicația îți arată ce cumperi, cât costă fiecare
 * produs, unde e mai ieftin și cât s-a scumpit viața ta. Bugetul cu plicuri a rămas întreg,
 * cu toate datele, sub Casa → „Buget (vechi)”.
 */
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, BarChart3, Check, Gift, ChevronRight, Lock, Plus, Send, Share2, Download, ListChecks, ReceiptText, ScanLine, Settings, ShieldCheck, ShoppingBasket, Sparkles, Store, Users, Repeat, Zap, Landmark, PenLine, CalendarClock, RotateCcw } from "lucide-react";
import { upcoming, upcomingTotal, type UpcomingItem } from "@/lib/upcoming";
import { isoToday, newId, type AppData } from "@/lib/finance-data";
import { monthShopping, savingsOpportunity, storeStats, topProducts } from "@/lib/shop-insights";
import { monthInflation, shrinkflationAlerts } from "@/lib/personal-inflation";
import { lei as leiRon } from "@/lib/money-format";
const lei = (value: number) => leiRon(value).replace(/\s?RON/, "\u00a0lei");
import { looseLabel, productsLabel, receiptsLabel, t } from "@/lib/i18n";
import { dateText, type MoreView } from "@/pages/home-kit";
import { visibleShopping } from "@/lib/shopping-list";
import { idsFromTickReply, listShareLink, listShareText, whatsappShareUrl } from "@/lib/list-share";
import { productObservations } from "@/lib/personal-inflation";
import { pantryFromReceipts } from "@/lib/pantry";
import { weeklyMenu } from "@/lib/weekly-menu";
import { threeMonthAverage } from "@/lib/savings-summary";
import { savedShareTextV2, savedWithBonAI } from "@/lib/saved-with-bonai";
import { aiScansLeft, currentBonutPlan } from "@/lib/bonut-plan-current";
import { BILLING_LIVE } from "@/lib/entitlements";
import { BONUT_PRICES, FREE_SCANS_PER_MONTH, TRIAL_AFTER_RECEIPTS, TRIAL_DAYS, hasFeature, yearlySavingPercent, type BonutFeature } from "@/lib/bonut-plans";
import { PLAY_STORE_URL } from "@/lib/review-prompt";
import { firstReceiptsInsight } from "@/lib/first-receipts";
import { isDemoMode } from "@/lib/demo-data";
import { warmLazy } from "@/lib/lazy-safe";
import { debtSummary } from "@/lib/debts-tracker";
import { basketCompare } from "@/lib/basket-compare";
import { habitInsights, type InsightAction } from "@/lib/habit-insights";
import { communityOutside, readCommunity, readCommunityCache } from "@/lib/community-prices";
import { BasketCard } from "@/components/BasketCard";
import { referralText } from "@/lib/referral";

const ShoppingListPanel = lazy(() => import("@/components/ShoppingListPanel").then((module) => ({ default: module.ShoppingListPanel })));
const BarcodeCheck = lazy(() => import("@/components/BarcodeCheck").then((module) => ({ default: module.BarcodeCheck })));
const PriceWatchPanel = lazy(() => import("@/components/PriceWatchPanel").then((module) => ({ default: module.PriceWatchPanel })));
/** De la câte bonuri Acasă arată tabloul întreg (cifre, scurtături, asistent, rapoarte). */
const FULL_HOME_AFTER = 3;
const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;
const monthName = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("ro-RO", { month: "long" });

function Card({ kicker, title, children, tone }: { kicker?: string; title?: ReactNode; children?: ReactNode; tone?: "accent" | "warn" }) {
  return <section className={`sh-card${tone ? ` is-${tone}` : ""}`}>{kicker && <p className="sh-kicker">{kicker}</p>}{title && <h2 className="sh-title">{title}</h2>}{children}</section>;
}

/** Antetul unui card de pe Acasă: eticheta în stânga, legătura „Toate” aliniată în dreapta. */
function CardHead({ kicker, action, onAction }: { kicker: string; action?: string; onAction?: () => void }) {
  return <div className="sh-card-head"><p className="sh-kicker">{kicker}</p>{action && onAction && <button type="button" className="sh-head-link" onClick={onAction}>{action} <ChevronRight size={15} aria-hidden="true" /></button>}</div>;
}

function Row({ icon, title, hint, onClick }: { icon: ReactNode; title: string; hint?: string; onClick: () => void }) {
  return <button type="button" className="sh-row" onClick={onClick}><span className="sh-row-icon" aria-hidden="true">{icon}</span><span className="sh-row-copy"><b>{title}</b>{hint && <small>{hint}</small>}</span><ChevronRight size={18} aria-hidden="true" /></button>;
}

const money2 = (value: number) => value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Paywall în context: arată ce deblochează exact cardul ascuns, cu prețurile și proba. */
const ShopReports = lazy(() => import("@/components/ShopReports"));
const InsightsPanel = lazy(() => import("@/components/InsightsPanel"));

/**
 * Bucățile din interiorul filelor (lista, verificarea prețului, urmărirea prețurilor, rapoartele),
 * încărcate dinainte: la prima deschidere a unei file nu mai apare „Se încarcă…” pentru ele.
 */
export function warmShopViews(): Promise<void> {
  return Promise.all([warmLazy(ShoppingListPanel), warmLazy(BarcodeCheck), warmLazy(PriceWatchPanel), warmLazy(ShopReports), warmLazy(InsightsPanel)]).then(() => undefined, () => undefined);
}
/** Fila cu care se deschide Prețuri data viitoare (de pe Acasă sau din Cont: „Rapoarte”). */
let nextPricesTab: "products" | "stores" | "stats" | undefined;
export const openPricesTab = (tab: "products" | "stores" | "stats") => { nextPricesTab = tab; };

export function ProGate({ data, feature, title, pitch, children }: { data: AppData; feature: BonutFeature; title: string; pitch: string; children: ReactNode }) {
  const plan = currentBonutPlan(data, isoToday());
  if (hasFeature(plan, feature)) return <>{children}</>;
  const familyOnly = !hasFeature("pro", feature);
  const price = familyOnly ? BONUT_PRICES.familie : BONUT_PRICES.pro;
  return <Card kicker={familyOnly ? t("BONAI FAMILIE") : t("BONAI PRO")} title={<><Lock size={18} aria-hidden="true" /> {title}</>}>
    <p className="sh-muted">{pitch}</p>
    <p><b>{t("{year} lei/an", { year: money2(price.year) })}</b> <small className="sh-muted">{t("sau {month} lei/lună · anual cu {percent}% mai ieftin", { month: money2(price.month), percent: yearlySavingPercent(familyOnly ? "familie" : "pro") })}</small></p>
    <p className="sh-muted">{t("Gratuit rămân {n} scanări AI pe lună și scanarea offline pe telefon, nelimitată.", { n: FREE_SCANS_PER_MONTH })}</p>
    {BILLING_LIVE && <BuyRow plan={familyOnly ? "familie" : "pro"} />}
    <p className="sh-muted">{data.receipts.length < TRIAL_AFTER_RECEIPTS ? t("Proba gratuită de {days} zile pornește singură după al {n}-lea bon scanat.", { days: TRIAL_DAYS, n: TRIAL_AFTER_RECEIPTS }) : t("Abonamentele pornesc în curând în Google Play.")}</p>
  </Card>;
}

/** Cumpărarea prin Google Play (doar în aplicația Android, cât BILLING_LIVE e pornit), plus restaurarea. */
function BuyRow({ plan }: { plan: "pro" | "familie" }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (work: () => Promise<{ message: string }>) => { setBusy(true); try { setMessage((await work()).message); } finally { setBusy(false); } };
  const price = BONUT_PRICES[plan];
  return <div className="sh-buy">
    <button type="button" className="bn-btn is-primary" disabled={busy} onClick={() => void run(async () => (await import("@/lib/billing")).buyBonut(plan, "year"))}>{t("Anual · {year} lei", { year: money2(price.year) })}</button>
    <button type="button" className="bn-btn" disabled={busy} onClick={() => void run(async () => (await import("@/lib/billing")).buyBonut(plan, "month"))}>{t("Lunar · {month} lei", { month: money2(price.month) })}</button>
    <button type="button" className="sh-link" disabled={busy} onClick={() => void run(async () => (await import("@/lib/billing")).restoreFamilie())}>{t("Restaurează abonamentul")}</button>
    {message && <p className="sh-muted" role="status">{message}</p>}
  </div>;
}

function shareSaved(text: string) {
  const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
  if (nav.share) { void nav.share({ text }).catch(() => undefined); return; }
  window.open(whatsappShareUrl(text), "_blank", "noopener");
}

const KIND_ICON = { bill: Zap, sub: Repeat, debt: Landmark, return: RotateCcw, warranty: ShieldCheck } as const;
const whenText = (days: number) => (days === 0 ? t("azi") : days === 1 ? t("mâine") : t("în {count} zile", { count: days }));
function kindText(item: UpcomingItem) {
  if (item.kind === "return") return t("ultima zi de retur");
  if (item.kind === "warranty") return t("expiră garanția");
  if (item.kind === "debt") return t("rată");
  return item.kind === "sub" ? t("abonament") : item.estimate ? t("factură, estimată") : t("factură");
}

/** „Ce urmează” pe 30 de zile: tot ce are o dată, cu un tap spre locul unde se gestionează. */
function UpcomingCard({ items, onOpen, onCalendar }: { items: ReadonlyArray<UpcomingItem>; onOpen: (item: UpcomingItem) => void; onCalendar?: () => void }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const total = upcomingTotal(items);
  const shown = all ? items : items.slice(0, 4);
  return <Card>
    <CardHead kicker={t("CE URMEAZĂ")} action={onCalendar ? t("Calendar") : undefined} onAction={onCalendar} />
    {total > 0 && <h2 className="sh-title">{t("{amount} de plătit în 30 de zile", { amount: lei(total) })}</h2>}
    <ul className="sh-next">{shown.map((item) => { const Icon = KIND_ICON[item.kind]; return <li key={item.id}>
      <button type="button" className={`sh-next-row is-${item.kind}${item.days <= 2 ? " is-soon" : ""}`} onClick={() => onOpen(item)}>
        <span className="sh-next-icon" aria-hidden="true"><Icon size={17} /></span>
        <span className="sh-next-main"><b>{item.name}</b><small>{kindText(item)} · {whenText(item.days)}</small></span>
        <span className="sh-next-side">{item.amount ? <b>{item.estimate ? "~" : ""}{lei(item.amount)}</b> : null}<small>{new Date(`${item.date}T12:00:00`).toLocaleDateString("ro-RO", { weekday: "short", day: "numeric", month: "short" })}</small></span>
      </button>
    </li>; })}</ul>
    {items.length > 4 && <button type="button" className="sh-link" aria-expanded={all} onClick={() => setAll(!all)}>{all ? t("Arată mai puțin") : t("Vezi toate ({count})", { count: items.length })} <CalendarClock size={16} aria-hidden="true" /></button>}
  </Card>;
}

export function ShopHome({ data, onScan, onManual, onOpenProducts, onOpenStores, onOpenMore, onOpenCosts }: { data: AppData; onScan: () => void; onManual?: () => void; onOpenProducts: () => void; onOpenStores: () => void; onOpenMore: (tab: MoreView) => void; onOpenCosts?: (kind: "sub" | "bill" | "debts" | "calendar") => void }) {
  const today = isoToday();
  const month = useMemo(() => monthShopping(data, today), [data, today]);
  const top = useMemo(() => topProducts(data, today), [data, today]);
  const saving = useMemo(() => savingsOpportunity(data, today), [data, today]);
  const inflation = useMemo(() => monthInflation(data), [data]);
  const shrink = useMemo(() => shrinkflationAlerts(data, today).slice(0, 2), [data, today]);
  const diff = month.spent - month.lastMonthSoFar;
  const savedNow = useMemo(() => savedWithBonAI(data, today), [data, today]);
  const avg = useMemo(() => threeMonthAverage(data, today), [data, today]);
  const first = useMemo(() => isDemoMode() ? undefined : firstReceiptsInsight(data), [data]);
  const insights = useMemo(() => isDemoMode() ? [] : habitInsights(data, today), [data, today]);
  const act = (action?: InsightAction) => {
    if (action === "debts" || action === "calendar") onOpenCosts?.(action);
    else if (action === "stores") onOpenStores();
    else { openPricesTab("stats"); onOpenProducts(); }
  };
  const basket = useMemo(() => {
    const pref = readCommunity();
    const cache = readCommunityCache();
    const community = pref.on && cache?.city === pref.city ? communityOutside(cache) : { vendors: [] as string[] };
    return basketCompare(data, today, community.outside, community.vendors);
  }, [data, today]);
  const recent = useMemo(() => [...data.receipts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3), [data.receipts]);
  const next = useMemo(() => upcoming(data, today, 30), [data, today]);
  const debts = useMemo(() => debtSummary(data.debts || []), [data.debts]);
  const plan = currentBonutPlan(data, today);
  const scansLeftNow = aiScansLeft(data, today);
  // La început (sub 3 bonuri), Acasă arată doar ce trebuie: scanarea, pașii și bonurile. Restul (cifre,
  // scurtături, asistent, rapoarte) apare după al treilea bon, când are ce să arate.
  const realReceipts = isDemoMode() ? Infinity : data.receipts.length;
  const fresh = realReceipts < FULL_HOME_AFTER;
  const [assist, setAssist] = useState(false);
  const [spendTab, setSpendTab] = useState<"categories" | "products">("categories");
  const me = data.settings.members.find((item) => item.id === data.settings.selfMemberId) || data.settings.members[0];
  const hour = new Date().getHours();
  const hello = hour < 11 ? t("Bună dimineața") : hour < 18 ? t("Bună ziua") : t("Bună seara");
  const openReports = () => { openPricesTab("stats"); onOpenProducts(); };
  const toPay = upcomingTotal(next);
  const payCount = next.filter((item) => item.amount).length;
  const canSave = Math.max(saving.total, basket?.cheapest ? basket.saving : 0);
  const inflationOn = hasFeature(plan, "myInflation");
  const allTiles: Array<{ id: string; icon: ReactNode; label: string; value: string; hint: string; tone?: "up" | "down"; onClick?: () => void }> = [
    { id: "pay", icon: <CalendarClock size={18} />, label: t("De plătit"), value: toPay > 0 ? lei(toPay) : "—", hint: payCount ? (payCount === 1 ? t("o plată în 30 de zile") : t("{count} plăți în 30 de zile", { count: payCount })) : t("nimic în 30 de zile"), onClick: onOpenCosts ? () => onOpenCosts("calendar") : undefined },
    debts.count > 0
      ? { id: "debts", icon: <Landmark size={18} />, label: t("Datorii rămase"), value: lei(debts.remaining), hint: t("{amount} pe lună", { amount: lei(debts.monthly) }), onClick: onOpenCosts ? () => onOpenCosts("debts") : undefined }
      : { id: "receipts", icon: <ReceiptText size={18} />, label: t("Bonuri luna asta"), value: String(month.receipts), hint: month.loose ? looseLabel(month.loose) : t("scanate și citite"), onClick: () => onOpenMore("receipts") },
    { id: "inflation", icon: <ArrowUpRight size={18} />, label: t("Inflația ta"), value: !inflationOn ? "PRO" : inflation && inflation.products > 0 ? pct(inflation.percent) : "—", hint: !inflationOn ? t("deblochează cu Pro") : inflation && inflation.products > 0 ? t("{count} produse urmărite", { count: inflation.products }) : t("din bonurile tale"), tone: inflationOn && inflation && inflation.products > 0 ? (inflation.percent > 0 ? "up" : "down") : undefined, onClick: onOpenProducts },
    { id: "saved", icon: <Sparkles size={18} />, label: t("Ai economisit"), value: savedNow.total > 0 && hasFeature(plan, "savedWithApp") ? lei(savedNow.total) : "—", hint: t("luna asta, din reduceri"), tone: "down" },
    { id: "save", icon: <Store size={18} />, label: t("Poți economisi"), value: canSave > 0 ? lei(canSave) : "—", hint: canSave > 0 ? (basket?.cheapest && basket.saving >= saving.total ? t("pe lună, la {vendor}", { vendor: basket.cheapest.vendor }) : t("luna asta, la alt magazin")) : t("compar magazinele"), tone: canSave > 0 ? "down" : undefined, onClick: onOpenStores },
  ];
  // Doar cifrele care au ceva de spus, în număr par, ca grila să rămână ordonată.
  const filled = allTiles.filter((tile) => tile.value !== "—");
  const tiles = (filled.length >= 2 ? filled : allTiles).slice(0, 4);
  if (tiles.length % 2) tiles.pop();
  const shortcuts: Array<{ id: string; icon: ReactNode; label: string; onClick?: () => void }> = [
    { id: "reports", icon: <BarChart3 size={20} />, label: t("Rapoarte"), onClick: openReports },
    { id: "calendar", icon: <CalendarClock size={20} />, label: t("Plăți"), onClick: onOpenCosts ? () => onOpenCosts("calendar") : undefined },
    { id: "debts", icon: <Landmark size={20} />, label: t("Datorii"), onClick: onOpenCosts ? () => onOpenCosts("debts") : undefined },
    { id: "warranties", icon: <ShieldCheck size={20} />, label: t("Garanții"), onClick: () => onOpenMore("warranties") },
  ];
  return <div className="sh-page sh-dash">
    <div className="sh-greet"><span className="sh-greet-avatar" aria-hidden="true">{(me?.name || "B").trim().charAt(0).toUpperCase()}</span><p><small>{hello}{me?.name && me.name !== "Eu" ? "," : ""}</small><b>{me?.name && me.name !== "Eu" ? me.name : t("Ce cumpărăm azi?")}</b></p></div>
    <header className="sh-hero sh-dash-hero">
      <p className="sh-kicker">{t("CUMPĂRĂTURI · {month}", { month: monthName(month.month).toLocaleUpperCase("ro-RO") })}</p>
      <div className="sh-dash-total">
        <h1 className="sh-big">{lei(month.spent)}</h1>
        </div>
      <p className="sh-sub">{month.receipts || month.loose ? t("din {what}", { what: [month.receipts ? receiptsLabel(month.receipts) : "", month.loose ? looseLabel(month.loose) : ""].filter(Boolean).join(t(" și ")) }) : t("Scanează primul bon al lunii.")}</p>
      {(month.lastMonthSoFar > 0 || (avg && month.spent > 0)) && <div className="sh-dash-meta">
        {month.lastMonthSoFar > 0 && <span className={`sh-chip ${diff > 0 ? "sh-up" : "sh-down"}`}>{diff > 0 ? "▲" : "▼"} {t("{amount} față de luna trecută", { amount: lei(Math.abs(diff)) })}</span>}
        {avg && month.spent > 0 && <span className="sh-chip">{t("media pe {count} luni: {amount}", { count: avg.months, amount: lei(avg.average) })}</span>}
      </div>}
      <div className="sh-dash-actions">
        <button type="button" className="sh-scan" onClick={onScan}><ScanLine size={22} aria-hidden="true" /> {t("Scanează bonul")}</button>
        {onManual && <button type="button" className="sh-dash-manual" aria-label={t("Fără bon? Notează suma")} onClick={onManual}><PenLine size={18} aria-hidden="true" /><span>{t("Notează suma")}</span></button>}
      </div>
      {Number.isFinite(scansLeftNow) && <p className={`sh-scans-left${scansLeftNow <= 3 ? " is-low" : ""}`}>{scansLeftNow > 0 ? t("Mai ai {count} scanări AI luna asta · offline, nelimitat", { count: scansLeftNow }) : t("Scanările AI ale lunii s-au terminat · offline, nelimitat")}</p>}
    </header>

    {fresh && <section className="sh-card sh-steps" aria-label={t("Cum funcționează BonAI")}>
      <p className="sh-kicker">{t("CUM FUNCȚIONEAZĂ")}</p>
      <ol>
        <li className={realReceipts > 0 ? "is-done" : ""}><span aria-hidden="true">{realReceipts > 0 ? <Check size={16} /> : "1"}</span><p><b>{t("Fotografiezi bonul")}</b><small>{t("Apeși „Scanează bonul”. Citesc fiecare produs, cu prețul lui.")}</small></p></li>
        <li><span aria-hidden="true">2</span><p><b>{t("Verifici și salvezi")}</b><small>{t("Dacă am citit ceva greșit, apeși pe rând și corectezi.")}</small></p></li>
        <li><span aria-hidden="true">3</span><p><b>{t("Vezi unde se duc banii")}</b><small>{t("Ce s-a scumpit, unde e mai ieftin și cât ai dat luna asta.")}</small></p></li>
      </ol>
      <div className="sh-steps-bar" role="progressbar" aria-valuemin={0} aria-valuemax={FULL_HOME_AFTER} aria-valuenow={realReceipts} aria-label={t("Bonuri scanate")}><i style={{ transform: `scaleX(${Math.min(1, realReceipts / FULL_HOME_AFTER)})` }} /></div>
      <p className="sh-muted sh-note">{realReceipts === 0 ? t("După primele {n} bonuri îți arăt tot: cifrele lunii, prețurile și sfaturile.", { n: FULL_HOME_AFTER }) : t("{done} din {n} bonuri. Încă {left} și îți arăt tot.", { done: realReceipts, n: FULL_HOME_AFTER, left: FULL_HOME_AFTER - realReceipts })}</p>
    </section>}

    {!fresh && <section className="sh-kpis" aria-label={t("Pe scurt")}>{tiles.map((tile) => <button key={tile.id} type="button" className={`sh-kpi is-${tile.id}`} disabled={!tile.onClick} onClick={tile.onClick}>
      <span className="sh-kpi-head"><span className="sh-kpi-icon" aria-hidden="true">{tile.icon}</span><small>{tile.label}</small></span>
      <b className={tile.tone ? `sh-${tile.tone}` : undefined}>{tile.value}</b>
      <small className="sh-kpi-hint">{tile.hint}</small>
    </button>)}</section>}

    {!fresh && <nav className="sh-shortcuts" aria-label={t("Scurtături")}>{shortcuts.filter((item) => item.onClick).map((item) => <button key={item.id} type="button" onClick={item.onClick}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></button>)}</nav>}

    {!fresh && insights.length > 0 && <button type="button" className="sh-assist" onClick={() => setAssist(true)}>
      <span className="sh-assist-icon" aria-hidden="true"><Sparkles size={20} /></span>
      <span className="sh-assist-copy"><small>{t("ASISTENTUL TĂU · {count}", { count: insights.length })}</small><b>{insights[0].title}</b></span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>}
    {assist && <Suspense fallback={null}><InsightsPanel insights={insights} onClose={() => setAssist(false)} onAct={act} /></Suspense>}

    {first && <Card tone="accent" kicker={first.receipts === 1 ? t("DIN PRIMUL TĂU BON") : t("DIN PRIMELE TALE BONURI")} title={first.products ? t("{count} produse de la {vendor}, {total}", { count: first.products, vendor: first.vendor || t("magazin"), total: lei(first.total) }) : t("{total} de la {vendor}", { total: lei(first.total), vendor: first.vendor || t("magazin") })}>
      {first.categories.length > 0 && <div className="sh-bars">{first.categories.map((item) => <div key={item.category} className="sh-bar"><span>{t(item.category)}</span><i style={{ width: `${Math.max(4, item.percent)}%` }} /><b>{item.percent}%</b></div>)}</div>}
      {first.priciest.length > 1 && <><p className="sh-muted">{t("Cele mai scumpe produse:")}</p><ul className="sh-list">{first.priciest.map((item) => <li key={item.label}><span><b>{item.label}</b></span><b>{lei(item.amount)}</b></li>)}</ul></>}
      {first.discounts > 0 && <p className="sh-alert"><Sparkles size={15} aria-hidden="true" /> {t("Reduceri tipărite pe bon: {amount}", { amount: lei(first.discounts) })}</p>}
      <p className="sh-kicker sh-next-kicker">{t("CE URMEAZĂ")}</p>
      <ul className="sh-list sh-next-steps">
        <li><span><b>{first.repeated > 0 ? t("{count} produse se repetă: vezi-le prețul în Prețuri", { count: first.repeated }) : t("La următorul bon îți arăt ce s-a scumpit")}</b><small>{t("compar aceleași produse, între bonuri și magazine")}</small></span></li>
        {plan === "free" && first.toTrial > 0 && <li><span><b>{first.toTrial === 1 ? t("Încă un bon și primești {days} zile de Pro gratuit", { days: TRIAL_DAYS }) : t("Încă {count} bonuri și primești {days} zile de Pro gratuit", { count: first.toTrial, days: TRIAL_DAYS })}</b><small>{t("inflația ta, economiile și alertele de preț")}</small></span></li>}
      </ul>
      <button type="button" className="sh-link" onClick={first.repeated > 0 ? onOpenProducts : onScan}>{first.repeated > 0 ? t("Vezi prețurile") : t("Scanează următorul bon")} <ChevronRight size={16} aria-hidden="true" /></button>
    </Card>}

    <UpcomingCard items={next} onCalendar={onOpenCosts ? () => onOpenCosts("calendar") : undefined} onOpen={(item) => { if (item.kind === "return" || item.kind === "warranty") onOpenMore("warranties"); else if (onOpenCosts) onOpenCosts(item.kind === "debt" ? "debts" : item.kind); }} />

    {!fresh && (savedNow.total > 0 || savedNow.allTime > 0) && <ProGate data={data} feature="savedWithApp" title={t("Cât ai economisit la cumpărături")} pitch={t("Vezi cât ai economisit din reducerile de pe bonuri și din magazinele mai ieftine, lună de lună.")}>
      <Card tone="accent" kicker={t("AI ECONOMISIT LA CUMPĂRĂTURI · {month}", { month: monthName(savedNow.month).toLocaleUpperCase("ro-RO") })} title={<span className="sh-saved-big">{lei(savedNow.total)}</span>}>
        <ul className="sh-list sh-saved-split">
          {savedNow.discounts > 0 && <li><span><b>{t("Reduceri pe bon")}</b><small>{t("tipărite pe bonurile tale")}</small></span><b className="sh-down">{lei(savedNow.discounts)}</b></li>}
          {savedNow.store > 0 && <li><span><b>{t("Magazin mai ieftin")}</b><small>{t("față de ce ai dat ultima dată în alt magazin")}</small></span><b className="sh-down">{lei(savedNow.store)}</b></li>}
          {savedNow.drop > 0 && <li><span><b>{t("Preț mai mic")}</b><small>{t("același magazin, mai ieftin decât data trecută")}</small></span><b className="sh-down">{lei(savedNow.drop)}</b></li>}
        </ul>
        {savedNow.allTime > savedNow.total && <p className="sh-muted">{t("De la început: {amount}", { amount: lei(savedNow.allTime) })}</p>}
        <p className="sh-muted sh-note">{t("Reducerile și prețurile mai mici sunt ale magazinelor. BonAI doar le adună din bonurile tale, ca să vezi cât ai câștigat.")}</p>
        {savedNow.total > 0 && <button type="button" className="sh-link" onClick={() => shareSaved(savedShareTextV2(savedNow.total, monthName(savedNow.month), PLAY_STORE_URL))}><Share2 size={16} aria-hidden="true" /> {t("Spune-le prietenilor")}</button>}
      </Card>
    </ProGate>}

    {!fresh && inflationOn && shrink.length > 0 && <Card tone="warn" kicker={t("MAI PUȚIN ÎN PACHET")}>
      {shrink.map((alert) => <p key={`${alert.key}-${alert.date}`} className="sh-alert"><Sparkles size={15} aria-hidden="true" /> {t("{name}: mai puțin în pachet, {percent} pe {per}", { name: alert.label, percent: pct(alert.perUnitPercent), per: alert.per })}</p>)}
      <button type="button" className="sh-link" onClick={onOpenProducts}>{t("Toate produsele")} <ChevronRight size={16} aria-hidden="true" /></button>
    </Card>}

    {!fresh && (month.categories.length > 0 || top.length > 0) && <Card>
      <CardHead kicker={t("UNDE SE DUC BANII")} action={t("Rapoarte")} onAction={openReports} />
      {month.categories.length > 0 && top.length > 0 && <div className="sh-seg" role="group" aria-label={t("Unde se duc banii")}>
        <button type="button" aria-pressed={spendTab === "categories"} onClick={() => setSpendTab("categories")}>{t("Categorii · luna asta")}</button>
        <button type="button" aria-pressed={spendTab === "products"} onClick={() => setSpendTab("products")}>{t("Produse · 30 zile")}</button>
      </div>}
      {(spendTab === "categories" || !top.length) && month.categories.length > 0
        ? <ul className="sh-cats">{month.categories.slice(0, 5).map((item) => <li key={item.category}><span>{t(item.category)}</span><b>{lei(item.amount)}</b><i aria-hidden="true"><em style={{ transform: `scaleX(${Math.max(0.03, item.amount / month.categories[0].amount)})` }} /></i></li>)}</ul>
        : <ul className="sh-list">{top.slice(0, 5).map((item) => <li key={item.key}><span><b>{item.label}</b><small>{item.count === 1 ? t("o cumpărare") : t("{count} cumpărări", { count: item.count })}</small></span><b>{lei(item.spent)}</b></li>)}</ul>}
    </Card>}

    <Card>
      <CardHead kicker={t("BONURILE RECENTE")} action={recent.length ? t("Toate") : undefined} onAction={() => onOpenMore("receipts")} />
      {recent.length ? <ul className="sh-list">{recent.map((receipt) => <li key={receipt.id}><span><b>{receipt.vendor || t("Bon")}</b><small>{dateText(receipt.date, true)}{receipt.lines?.length ? ` · ${productsLabel(receipt.lines.length)}` : ""}</small></span><b>{lei(receipt.amount)}</b></li>)}</ul>
        : <p className="sh-muted">{t("Niciun bon încă. Fă o poză bonului de la magazin: citesc fiecare produs, cu prețul lui.")}</p>}
    </Card>
  </div>;
}

export function ProductsView({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  return <div className="sh-page">
    <header className="sh-head"><p className="sh-kicker">{t("PRODUSE")}</p><h1 className="sh-h1">{t("Tot ce cumperi, cu prețul în timp")}</h1><p className="sh-sub sh-muted">{t("Apasă pe un produs ca să vezi cum i s-a schimbat prețul și unde l-ai luat cel mai ieftin.")}</p></header>
    <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim prețurile…")}</div>}><PriceWatchPanel data={data} onChange={onChange} /></Suspense>
  </div>;
}

/** Cumpărături: lista comună (gratuită), stocul casei, din bonuri și meniul săptămânii (PRO). */
export function ListView({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const [tab, setTab] = useState<"list" | "pantry" | "menu">("list");
  useEffect(() => {
    const onTab = (event: Event) => { const next = (event as CustomEvent<string>).detail; if (next === "pantry" || next === "menu" || next === "list") setTab(next); };
    window.addEventListener("bonai:list-tab", onTab);
    return () => window.removeEventListener("bonai:list-tab", onTab);
  }, []);
  const todo = visibleShopping(data.settings.shoppingList || []).todo;
  const share = () => {
    const text = listShareText(todo, t("Lista de cumpărături:"), `${t("Bifează aici, fără aplicație:")} ${listShareLink(todo, data.settings.familyName || undefined)}`);
    window.open(whatsappShareUrl(text), "_blank", "noopener");
  };
  const [reply, setReply] = useState<string>();
  const applyReply = () => {
    const ids = new Set(idsFromTickReply(reply || "", todo));
    if (ids.size) {
      const now = new Date().toISOString();
      onChange({ ...data, settings: { ...data.settings, shoppingList: (data.settings.shoppingList || []).map((item) => ids.has(item.id) ? { ...item, done: true, updatedAt: now } : item) } });
    }
    setReply(undefined);
  };
  const addToList = (texts: string[]) => {
    const have = new Set(todo.map((item) => item.text.toLocaleLowerCase("ro-RO")));
    const fresh = texts.filter((text) => !have.has(text.toLocaleLowerCase("ro-RO")));
    if (!fresh.length) return;
    const now = new Date().toISOString();
    onChange({ ...data, settings: { ...data.settings, shoppingList: [...(data.settings.shoppingList || []), ...fresh.map((text) => ({ id: newId("shop"), text, updatedAt: now }))] } });
  };
  return <div className="sh-page">
    {/* Fiecare filă spune într-un rând la ce folosește. */}
    <header className="sh-head"><p className="sh-kicker">{t("CUMPĂRĂTURI")}</p><h1 className="sh-h1">{tab === "pantry" ? t("Ce ai în casă") : tab === "menu" ? t("Meniul săptămânii") : t("Lista de cumpărături")}</h1><p className="sh-sub sh-muted">{tab === "pantry" ? t("Din bonuri: ce se termină curând, după cât de des cumperi.") : tab === "menu" ? t("Mese simple din ce cumperi deja, cu costul din prețurile tale.") : t("Scrie ce trebuie luat. Se bifează singur când scanezi bonul.")}</p></header>
    <div className="sh-tabs" role="tablist">{([["list", t("Listă")], ["pantry", t("În casă")], ["menu", t("Meniu")]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "list" && <>
      {todo.length > 0 && <button type="button" className="sh-scan" onClick={share}><Send size={20} aria-hidden="true" /> {t("Trimite pe WhatsApp")}</button>}
      {todo.length > 0 && (reply === undefined
        ? <button type="button" className="sh-link" onClick={() => setReply("")}>{t("Am primit răspunsul cu ce s-a luat")}</button>
        : <div className="sh-card"><textarea className="sh-reply" aria-label={t("Răspunsul de pe WhatsApp")} placeholder={t("Lipește aici mesajul „Am luat: …”")} value={reply} onChange={(event) => setReply(event.target.value)} rows={4} /><button type="button" className="sh-link" onClick={applyReply}>{t("Bifează ce s-a luat")}</button></div>)}
      <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim lista…")}</div>}><ShoppingListPanel data={data} onChange={onChange} /></Suspense>
    </>}
    {tab === "pantry" && <PantryCard data={data} onAdd={addToList} />}
    {tab === "menu" && <ProGate data={data} feature="weeklyMenu" title={t("Meniul săptămânii")} pitch={t("Șapte mese ieftine din ce cumperi deja, cu costul din prețurile tale.")}><MenuCard data={data} onAdd={addToList} /></ProGate>}
  </div>;
}

function PantryCard({ data, onAdd }: { data: AppData; onAdd: (texts: string[]) => void }) {
  const today = isoToday();
  const items = useMemo(() => pantryFromReceipts(productObservations(data), today), [data, today]);
  const low = items.filter((item) => item.state !== "ok");
  if (!items.length) return <Card kicker={t("STOCUL CASEI")}><p className="sh-muted">{t("Stocul se completează singur din bonuri: după 3 cumpărări ale aceluiași produs îți spun când se termină.")}</p></Card>;
  return <Card kicker={t("STOCUL CASEI")} title={low.length ? t("{count} produse se termină", { count: low.length }) : t("Ai de toate, după ritmul tău")}>
    <ul className="sh-list">{items.slice(0, 12).map((item) => <li key={item.key}><span><b>{item.label}</b><small>{t("o dată la ~{days} zile · ultima dată acum {since} zile", { days: item.everyDays, since: item.daysSince })}</small></span><b className={item.state === "out" ? "sh-up" : item.state === "soon" ? "" : "sh-down"}>{item.state === "out" ? t("s-a terminat?") : item.state === "soon" ? t("curând") : t("ok")}</b></li>)}</ul>
    {low.length > 0 && <button type="button" className="sh-link" onClick={() => onAdd(low.map((item) => item.label))}><Plus size={16} aria-hidden="true" /> {t("Pune-le pe listă")}</button>}
  </Card>;
}

function MenuCard({ data, onAdd }: { data: AppData; onAdd: (texts: string[]) => void }) {
  const today = isoToday();
  const menu = useMemo(() => weeklyMenu(productObservations(data), today), [data, today]);
  const total = menu.reduce((sum, day) => sum + day.knownCost, 0);
  const unknown = menu.reduce((sum, day) => sum + day.unknown, 0);
  return <Card kicker={t("MENIUL SĂPTĂMÂNII")} title={total > 0 ? t("~{amount} din prețurile tale", { amount: lei(total) }) : t("Șapte mese simple")}>
    <ul className="sh-list">{menu.map((day) => <li key={day.recipe.id}><span><b>{day.recipe.name}</b><small>{day.ingredients.map((i) => i.price !== undefined ? `${i.name} ${lei(i.price)}` : i.name).join(" · ")}</small></span><b>{day.knownCost > 0 ? lei(day.knownCost) : "—"}</b></li>)}</ul>
    {unknown > 0 && <p className="sh-muted sh-note">{t("{count} ingrediente nu apar încă în bonurile tale, deci nu le pun preț.", { count: unknown })}</p>}
    <button type="button" className="sh-link" onClick={() => onAdd(Array.from(new Set(menu.flatMap((day) => day.ingredients.filter((i) => !i.recent).map((i) => i.name)))))}><Plus size={16} aria-hidden="true" /> {t("Pune ingredientele lipsă pe listă")}</button>
  </Card>;
}

/** Prețuri: produsele mele și magazinele, în taburi. */
export function PricesView({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const [tab, setTab] = useState<"products" | "stores" | "stats">(() => { const first = nextPricesTab || "products"; nextPricesTab = undefined; return first; });
  return <div className="sh-page">
    <div className="sh-tabs" role="tablist">{([["products", t("Produse")], ["stores", t("Magazine")], ["stats", t("Rapoarte")]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "products" && <Suspense fallback={null}><BarcodeCheck data={data} onChange={onChange} /></Suspense>}
    {tab === "products" ? <ProductsView data={data} onChange={onChange} /> : tab === "stats" ? <Suspense fallback={null}><ShopReports data={data} /></Suspense> : <StoresView data={data} />}
  </div>;
}

export function StoresView({ data }: { data: AppData }) {
  const today = isoToday();
  const stores = useMemo(() => storeStats(data, today), [data, today]);
  const saving = useMemo(() => savingsOpportunity(data, today, 90), [data, today]);
  const cheapest = stores.filter((item) => item.priceIndex !== undefined).sort((a, b) => (a.priceIndex ?? 0) - (b.priceIndex ?? 0))[0];
  return <div className="sh-page">
    <header className="sh-head"><p className="sh-kicker">{t("MAGAZINE")}</p><h1 className="sh-h1">{t("Unde cumperi și unde ar merita")}</h1><p className="sh-sub sh-muted">{t("Același coș, la prețurile fiecărui magazin unde ai fost.")}</p></header>
    {cheapest && <Card tone="accent" kicker={t("CEL MAI IEFTIN PENTRU TINE")} title={cheapest.vendor}><p className="sh-muted">{t("La produsele pe care le iei din mai multe locuri, {vendor} iese cel mai bine.", { vendor: cheapest.vendor })}</p></Card>}
    {saving.total > 0 && <Card kicker={t("ULTIMELE 90 DE ZILE")} title={t("Puteai economisi {amount}", { amount: lei(saving.total) })}>
      <ul className="sh-list">{saving.items.slice(0, 6).map((item) => <li key={item.key}><span><b>{item.label}</b><small>{t("{vendor} → {cheaper}", { vendor: item.vendor, cheaper: item.cheaperVendor })}</small></span><b className="sh-down">−{lei(item.saved)}</b></li>)}</ul>
    </Card>}
    <Card kicker={t("MAGAZINELE TALE")} title={t("Ultimele 90 de zile")}>
      {stores.length ? <ul className="sh-list">{stores.map((item) => <li key={item.vendor}><span><b>{item.vendor}</b><small>{[item.visits === 1 ? t("o vizită") : t("{count} vizite", { count: item.visits }), t("coș mediu {amount}", { amount: lei(item.average) }), item.priceIndex !== undefined ? (item.priceIndex <= 0.5 ? t("cel mai ieftin la produsele comune") : t("{percent} față de cel mai ieftin", { percent: pct(item.priceIndex) })) : ""].filter(Boolean).join(" · ")}</small></span><b>{lei(item.spent)}</b></li>)}</ul>
        : <p className="sh-muted">{t("Scanează bonuri de la magazinele unde mergi: aici vezi unde lași cei mai mulți bani și care e mai scump.")}</p>}
    </Card>
    <BasketCard data={data} />
    {stores.some((item) => item.priceIndex !== undefined) && <p className="sh-muted sh-note">{t("Comparația ține doar de produsele pe care le-ai cumpărat în cel puțin două magazine, pe kg, litru sau bucată.")}</p>}
  </div>;
}

export type Look = "light" | "dark" | "auto";
/** Cont: profilul, BonAI Pro, bonurile și costurile casei, familia, setările. Fără unelte din aplicația veche. */
export function HouseView({ data, onOpenMore, onOpenJournal, onOpenCosts, onOpenReports, look, onLook }: { data: AppData; onOpenReports?: () => void; onOpenMore: (tab: MoreView) => void; onOpenJournal: () => void; onOpenBudget?: () => void; onOpenCosts?: (kind: "sub" | "bill" | "debts" | "receipts" | "costs" | "calendar") => void; look?: Look; onLook?: (look: Look) => void }) {
  const members = data.settings.members.filter((item) => item.kind !== "child").map((item) => item.name).join(", ");
  const plan = currentBonutPlan(data, isoToday());
  const self = data.settings.members.find((item) => item.id === data.settings.selfMemberId) || data.settings.members[0];
  const name = self?.name || data.settings.memberName || t("Contul tău");
  const planLabel = plan === "familie" ? t("BonAI Familie") : plan === "pro" ? t("BonAI Pro") : t("Plan gratuit");
  return <div className="sh-page">
    <header className="sh-head"><p className="sh-kicker">{t("CONT")}</p><h1 className="sh-h1">{t("Cont")}</h1></header>
    <section className="sh-card sh-profile" aria-label={t("Profil")}>
      <span className="sh-avatar" aria-hidden="true">{name.trim().charAt(0).toLocaleUpperCase("ro-RO") || "B"}</span>
      <span><b>{name}</b><small className="sh-muted">{data.settings.familyName ? `${data.settings.familyName} · ${planLabel}` : planLabel}</small></span>
    </section>
    {plan === "free" && <p className="sh-muted sh-plan-free">{t("Planul gratuit: {n} scanări AI pe lună, apoi scanare offline nelimitată (citită pe telefon, o verifici înainte de salvare).", { n: FREE_SCANS_PER_MONTH })}</p>}
    {plan === "free" && <div className="sh-rows sh-pro-row"><Row icon={<Sparkles size={20} />} title={t("Treci la BonAI Pro")} hint={t("scanări AI nelimitate, inflația ta, meniul săptămânii · {year} lei/an", { year: money2(BONUT_PRICES.pro.year) })} onClick={() => onOpenMore("settings")} /></div>}
    <p className="sh-kicker sh-group-title">{t("BANII TĂI")}</p>
    <div className="sh-rows">
      <Row icon={<ReceiptText size={20} />} title={t("Bonuri")} hint={t("toate bonurile scanate")} onClick={() => (onOpenCosts ? onOpenCosts("receipts") : onOpenMore("receipts"))} />
      <Row icon={<ShoppingBasket size={20} />} title={t("Toate cheltuielile")} hint={t("cu bon și fără bon")} onClick={() => (onOpenCosts ? onOpenCosts("costs") : onOpenJournal())} />
      <Row icon={<BarChart3 size={20} />} title={t("Rapoarte")} hint={t("pe ce se duc banii, pe zi, lună sau an")} onClick={() => { openPricesTab("stats"); onOpenReports?.(); }} />
    </div>
    <p className="sh-kicker sh-group-title">{t("PLĂȚI ȘI DATORII")}</p>
    <div className="sh-rows">
      <Row icon={<CalendarClock size={20} />} title={t("Calendarul plăților")} hint={t("ce ai de plătit și în ce zi")} onClick={() => onOpenCosts?.("calendar")} />
      <Row icon={<Landmark size={20} />} title={t("Datorii")} hint={data.debts.length ? t("{n} în evidență", { n: data.debts.length }) : t("rate, împrumuturi, carduri")} onClick={() => onOpenCosts?.("debts")} />
      <Row icon={<Repeat size={20} />} title={t("Abonamente")} hint={t("Netflix, telefon, sală")} onClick={() => onOpenCosts?.("sub")} />
      <Row icon={<Zap size={20} />} title={t("Facturi")} hint={t("curent, gaz, internet")} onClick={() => onOpenCosts?.("bill")} />
    </div>
    <p className="sh-kicker sh-group-title">{t("CASA ȘI FAMILIA")}</p>
    <div className="sh-rows">
      <Row icon={<Users size={20} />} title={t("Familie și membri")} hint={members || t("invită partenerul")} onClick={() => onOpenMore("sync")} />
      <Row icon={<ShieldCheck size={20} />} title={t("Garanții și retururi")} hint={t("bonul păstrat, amintire înainte de retur")} onClick={() => onOpenMore("warranties")} />
    </div>
    <p className="sh-kicker sh-group-title">{t("APLICAȚIA")}</p>
    {onLook && <section className="sh-card" aria-label={t("Aspect")}><p className="sh-kicker">{t("ASPECT")}</p><div className="sh-seg" role="group" aria-label={t("Tema aplicației")}>{([["light", t("Luminos")], ["dark", t("Noapte")], ["auto", t("Automat")]] as Array<[Look, string]>).map(([id, label]) => <button key={id} type="button" aria-pressed={look === id} onClick={() => onLook(id)}>{label}</button>)}</div><p className="sh-muted sh-note">{t("Automat urmează setarea telefonului.")}</p></section>}
    <div className="sh-rows">
      <Row icon={<Download size={20} />} title={t("Export și copii de siguranță")} hint={t("fișier pe telefon")} onClick={() => onOpenMore("settings")} />
      <Row icon={<Settings size={20} />} title={t("Setări")} hint={t("limbă, notificări, date și confidențialitate")} onClick={() => onOpenMore("settings")} />
    </div>
    <div className="sh-rows">
      <Row icon={<Gift size={20} />} title={t("Recomandă BonAI")} hint={t("trimite-le prietenilor, pe WhatsApp sau unde vrei")} onClick={() => shareSaved(referralText(data))} />
    </div>
    <p className="sh-muted sh-note"><Store size={14} aria-hidden="true" /> {readCommunity().on ? t("Bonurile rămân pe telefoanele familiei, criptate. Din prețuri pleacă doar media anonimă pe oraș, cu acordul tău (Magazine).") : t("Bonurile și prețurile rămân pe telefoanele familiei, criptate. Nimeni altcineva nu le vede.")}</p>
  </div>;
}

/** Prima pornire: lista gratuită, scanarea bonului și verificarea cu codul de bare; fără salariu și plicuri. */
export function ShopWelcome({ onScan, onList, onJoin, onSkip, onDemo, trial = true }: { onScan: () => void; onList: () => void; onJoin: () => void; onSkip: () => void; onDemo?: () => void; /** Doar pe planul gratuit: cine are deja Familie/Pro nu primește oferta de probă. */ trial?: boolean }) {
  const steps: Array<[ReactNode, string, string]> = [
    [<ListChecks size={22} key="list" />, t("Lista familiei, gratuit"), t("Comună pe toate telefoanele, cu prețul estimat din bonurile voastre. O trimiți pe WhatsApp și se bifează și fără aplicație.")],
    [<ScanLine size={22} key="scan" />, t("Scanezi bonul"), t("O poză. Citesc fiecare produs, cu marca, gramajul și prețul.")],
    [<Store size={22} key="store" />, t("Verifici prețul în magazin"), t("Scanezi codul de bare și vezi cât ai dat ultima dată și unde a fost mai ieftin.")],
    [<Sparkles size={22} key="pro" />, t("Inflația ta și cât economisești"), trial ? t("După al {n}-lea bon primești {days} zile de BonAI Pro gratuit.", { n: TRIAL_AFTER_RECEIPTS, days: TRIAL_DAYS }) : t("Vezi ce s-a scumpit la produsele tale și cât ai economisit.")],
  ];
  return <div className="sh-page sh-welcome">
    <header className="sh-hero">
      <p className="sh-kicker">{t("BINE AI VENIT ÎN BONAI")}</p>
      <h1 className="sh-big sh-welcome-title">{t("Lista de cumpărături care îți arată cât economisești.")}</h1>
      <button type="button" className="sh-scan" onClick={onScan}><ScanLine size={22} aria-hidden="true" /> {t("Scanează primul bon")}</button>
      <button type="button" className="sh-link" onClick={onList}><ListChecks size={16} aria-hidden="true" /> {t("Încep cu lista")}</button>
    </header>
    <div className="sh-rows">{steps.map(([icon, title, hint]) => <div key={title} className="sh-row" role="presentation"><span className="sh-row-icon" aria-hidden="true">{icon}</span><span className="sh-row-copy"><b>{title}</b><small>{hint}</small></span><span /></div>)}</div>
    <div className="sh-rows">
      {onDemo && <Row icon={<ReceiptText size={20} />} title={t("Văd întâi un exemplu")} hint={t("bonuri și prețuri inventate, le ștergi dintr-o atingere")} onClick={onDemo} />}
      <Row icon={<Users size={20} />} title={t("Am deja familia în aplicație")} hint={t("intru cu invitația partenerului")} onClick={onJoin} />
    </div>
    <button type="button" className="sh-link" onClick={onSkip}>{t("Mă uit întâi prin aplicație")} <ChevronRight size={16} aria-hidden="true" /></button>
  </div>;
}
