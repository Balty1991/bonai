/**
 * Aplicația nouă, a cumpărăturilor: Acasă, Produse, Magazine și Casa.
 * Totul pornește de la bon: scanezi, iar aplicația îți arată ce cumperi, cât costă fiecare
 * produs, unde e mai ieftin și cât s-a scumpit viața ta. Bugetul cu plicuri a rămas întreg,
 * cu toate datele, sub Casa → „Buget (vechi)”.
 */
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Lock, Plus, Send, Share2, Download, ListChecks, ReceiptText, ScanLine, Settings, ShieldCheck, ShoppingBasket, Sparkles, Store, Users, Repeat, Zap, Landmark, PenLine, CalendarClock, RotateCcw } from "lucide-react";
import { upcoming, upcomingTotal, type UpcomingItem } from "@/lib/upcoming";
import { isoToday, newId, type AppData } from "@/lib/finance-data";
import { monthShopping, savingsOpportunity, storeStats, topProducts } from "@/lib/shop-insights";
import { monthInflation, shrinkflationAlerts } from "@/lib/personal-inflation";
import { lei as leiRon } from "@/lib/money-format";
const lei = (value: number) => leiRon(value).replace(/\s?RON/, "\u00a0lei");
import { t } from "@/lib/i18n";
import { dateText, type MoreView } from "@/pages/home-kit";
import { visibleShopping } from "@/lib/shopping-list";
import { idsFromTickReply, listShareLink, listShareText, whatsappShareUrl } from "@/lib/list-share";
import { productObservations } from "@/lib/personal-inflation";
import { pantryFromReceipts, readRunoutSnooze, runningOut, RUNOUT_SNOOZE_KEY } from "@/lib/pantry";
import { nameScore } from "@/lib/barcode-check";
import { weeklyMenu } from "@/lib/weekly-menu";
import { threeMonthAverage } from "@/lib/savings-summary";
import { savedShareTextV2, savedWithBonAI } from "@/lib/saved-with-bonai";
import { currentBonutPlan } from "@/lib/bonut-plan-current";
import { BONUT_PRICES, FREE_SCANS_PER_MONTH, TRIAL_AFTER_RECEIPTS, TRIAL_DAYS, hasFeature, yearlySavingPercent, type BonutFeature } from "@/lib/bonut-plans";
import { PLAY_STORE_URL } from "@/lib/review-prompt";

const ShoppingListPanel = lazy(() => import("@/components/ShoppingListPanel").then((module) => ({ default: module.ShoppingListPanel })));
const BarcodeCheck = lazy(() => import("@/components/BarcodeCheck").then((module) => ({ default: module.BarcodeCheck })));
const PriceWatchPanel = lazy(() => import("@/components/PriceWatchPanel").then((module) => ({ default: module.PriceWatchPanel })));
const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;
const monthName = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("ro-RO", { month: "long" });

function Card({ kicker, title, children, tone }: { kicker?: string; title?: ReactNode; children?: ReactNode; tone?: "accent" | "warn" }) {
  return <section className={`sh-card${tone ? ` is-${tone}` : ""}`}>{kicker && <p className="sh-kicker">{kicker}</p>}{title && <h2 className="sh-title">{title}</h2>}{children}</section>;
}

function Row({ icon, title, hint, onClick }: { icon: ReactNode; title: string; hint?: string; onClick: () => void }) {
  return <button type="button" className="sh-row" onClick={onClick}><span className="sh-row-icon" aria-hidden="true">{icon}</span><span className="sh-row-copy"><b>{title}</b>{hint && <small>{hint}</small>}</span><ChevronRight size={18} aria-hidden="true" /></button>;
}

const money2 = (value: number) => value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Paywall în context: arată ce deblochează exact cardul ascuns, cu prețurile și proba. */
const ShopStats = lazy(() => import("@/components/ShopStats"));

export function ProGate({ data, feature, title, pitch, children }: { data: AppData; feature: BonutFeature; title: string; pitch: string; children: ReactNode }) {
  const plan = currentBonutPlan(data, isoToday());
  if (hasFeature(plan, feature)) return <>{children}</>;
  const familyOnly = !hasFeature("pro", feature);
  const price = familyOnly ? BONUT_PRICES.familie : BONUT_PRICES.pro;
  return <Card kicker={familyOnly ? t("BONAI FAMILIE") : t("BONAI PRO")} title={<><Lock size={18} aria-hidden="true" /> {title}</>}>
    <p className="sh-muted">{pitch}</p>
    <p><b>{t("{year} lei/an", { year: money2(price.year) })}</b> <small className="sh-muted">{t("sau {month} lei/lună · anual cu {percent}% mai ieftin", { month: money2(price.month), percent: yearlySavingPercent(familyOnly ? "familie" : "pro") })}</small></p>
    <p className="sh-muted">{t("Gratuit rămân {n} scanări AI pe lună și scanarea offline pe telefon, nelimitată.", { n: FREE_SCANS_PER_MONTH })}</p>
    <p className="sh-muted">{data.receipts.length < TRIAL_AFTER_RECEIPTS ? t("Proba gratuită de {days} zile pornește singură după al {n}-lea bon scanat.", { days: TRIAL_DAYS, n: TRIAL_AFTER_RECEIPTS }) : t("Abonamentele pornesc în curând în Google Play.")}</p>
  </Card>;
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
function UpcomingCard({ data, today, onOpen }: { data: AppData; today: string; onOpen: (item: UpcomingItem) => void }) {
  const items = useMemo(() => upcoming(data, today, 30), [data, today]);
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const total = upcomingTotal(items);
  const shown = all ? items : items.slice(0, 4);
  return <Card kicker={t("CE URMEAZĂ · 30 DE ZILE")} title={total > 0 ? t("{amount} de plătit", { amount: lei(total) }) : undefined}>
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

export function ShopHome({ data, onScan, onManual, onOpenProducts, onOpenStores, onOpenMore, onOpenCosts }: { data: AppData; onScan: () => void; onManual?: () => void; onOpenProducts: () => void; onOpenStores: () => void; onOpenMore: (tab: MoreView) => void; onOpenCosts?: (kind: "sub" | "bill" | "debts") => void }) {
  const today = isoToday();
  const month = useMemo(() => monthShopping(data, today), [data, today]);
  const top = useMemo(() => topProducts(data, today), [data, today]);
  const saving = useMemo(() => savingsOpportunity(data, today), [data, today]);
  const inflation = useMemo(() => monthInflation(data), [data]);
  const shrink = useMemo(() => shrinkflationAlerts(data, today).slice(0, 2), [data, today]);
  const diff = month.spent - month.lastMonthSoFar;
  const savedNow = useMemo(() => savedWithBonAI(data, today), [data, today]);
  const avg = useMemo(() => threeMonthAverage(data, today), [data, today]);
  const recent = useMemo(() => [...data.receipts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), [data.receipts]);
  const me = data.settings.members.find((item) => item.id === data.settings.selfMemberId) || data.settings.members[0];
  const hour = new Date().getHours();
  const hello = hour < 11 ? t("Bună dimineața") : hour < 18 ? t("Bună ziua") : t("Bună seara");
  return <div className="sh-page">
    <div className="sh-greet"><span className="sh-greet-avatar" aria-hidden="true">{(me?.name || "B").trim().charAt(0).toUpperCase()}</span><p><small>{hello}{me?.name && me.name !== "Eu" ? "," : ""}</small><b>{me?.name && me.name !== "Eu" ? me.name : t("Ce cumpărăm azi?")}</b></p></div>
    <header className="sh-hero">
      <p className="sh-kicker">{t("CUMPĂRĂTURILE TALE ÎN {month}", { month: monthName(month.month).toLocaleUpperCase("ro-RO") })}</p>
      <h1 className="sh-big">{lei(month.spent)}</h1>
      <p className="sh-sub">{month.receipts === 1 ? t("din 1 bon") : month.receipts ? t("din {count} bonuri", { count: month.receipts }) : t("Scanează primul bon al lunii.")}{month.lastMonthSoFar > 0 && <> · <span className={diff > 0 ? "sh-up" : "sh-down"}>{diff > 0 ? t("{amount} mai mult", { amount: lei(diff) }) : t("{amount} mai puțin", { amount: lei(-diff) })}</span> {t("decât luna trecută până azi")}</>}</p>
      {avg && month.spent > 0 && <p className="sh-sub">{t("Media pe {count} luni: {amount}", { count: avg.months, amount: lei(avg.average) })}</p>}
      <button type="button" className="sh-scan" onClick={onScan}><ScanLine size={22} aria-hidden="true" /> {t("Scanează bonul")}</button>
      {onManual && <button type="button" className="sh-link sh-manual" onClick={onManual}><PenLine size={16} aria-hidden="true" /> {t("Fără bon? Notează suma")}</button>}
    </header>

    {(savedNow.total > 0 || savedNow.allTime > 0) && <ProGate data={data} feature="savedWithApp" title={t("Economisit cu BonAI")} pitch={t("Vezi cât ai economisit din reducerile de pe bonuri și din magazinele mai ieftine, lună de lună.")}>
      <Card tone="accent" kicker={t("ECONOMISIT CU BONAI · {month}", { month: monthName(savedNow.month).toLocaleUpperCase("ro-RO") })} title={<span className="sh-saved-big">{lei(savedNow.total)}</span>}>
        <ul className="sh-list sh-saved-split">
          {savedNow.discounts > 0 && <li><span><b>{t("Reduceri pe bon")}</b><small>{t("tipărite pe bonurile tale")}</small></span><b className="sh-down">{lei(savedNow.discounts)}</b></li>}
          {savedNow.store > 0 && <li><span><b>{t("Magazin mai ieftin")}</b><small>{t("față de ce ai dat ultima dată în alt magazin")}</small></span><b className="sh-down">{lei(savedNow.store)}</b></li>}
          {savedNow.drop > 0 && <li><span><b>{t("Preț mai mic")}</b><small>{t("același magazin, mai ieftin decât data trecută")}</small></span><b className="sh-down">{lei(savedNow.drop)}</b></li>}
        </ul>
        {savedNow.items.filter((item) => item.kind !== "discount").slice(0, 2).map((item) => <p key={`${item.label}-${item.date}-${item.vendor}`} className="sh-muted sh-saved-item">{item.kind === "drop" ? t("{label}: {amount} mai puțin la {vendor} decât data trecută", { label: item.label, amount: lei(item.amount), vendor: item.vendor }) : t("{label}: {amount} mai puțin la {vendor} decât la {was}", { label: item.label, amount: lei(item.amount), vendor: item.vendor, was: item.was!.vendor })}</p>)}
        {savedNow.allTime > savedNow.total && <p className="sh-muted">{t("De la început: {amount}", { amount: lei(savedNow.allTime) })}</p>}
        <p className="sh-muted sh-note">{t("Doar bani reali din bonurile tale, nimic estimat.")}</p>
        {savedNow.total > 0 && <button type="button" className="sh-link" onClick={() => shareSaved(savedShareTextV2(savedNow.total, monthName(savedNow.month), PLAY_STORE_URL))}><Share2 size={16} aria-hidden="true" /> {t("Spune-le prietenilor")}</button>}
      </Card>
    </ProGate>}

    {saving.total > 0 && <Card tone="accent" kicker={t("UNDE POȚI ECONOMISI")} title={t("Ai fi dat cu {amount} mai puțin luna asta", { amount: lei(saving.total) })}>
      <ul className="sh-list">{saving.items.slice(0, 3).map((item) => <li key={item.key}><span><b>{item.label}</b><small>{t("luat la {vendor}, mai ieftin la {cheaper}", { vendor: item.vendor, cheaper: item.cheaperVendor })}</small></span><b className="sh-down">−{lei(item.saved)}</b></li>)}</ul>
      <button type="button" className="sh-link" onClick={onOpenStores}>{t("Vezi magazinele")} <ChevronRight size={16} aria-hidden="true" /></button>
    </Card>}

    <ProGate data={data} feature="myInflation" title={t("Inflația ta")} pitch={t("Cât s-au scumpit exact produsele pe care le cumperi tu, nu media țării.")}>
    <Card kicker={t("INFLAȚIA TA")} title={inflation && inflation.products > 0 ? t("{percent} în {month}", { percent: pct(inflation.percent), month: monthName(inflation.month) }) : t("Se calculează din bonurile tale")}>
      {inflation && inflation.risers.length > 0 ? <ul className="sh-list">{inflation.risers.slice(0, 3).map((row) => <li key={row.label}><span><b>{row.label}</b></span><b className="sh-up"><ArrowUpRight size={14} aria-hidden="true" />{pct(row.percent)}</b></li>)}</ul>
        : <p className="sh-muted">{t("Cu fiecare bon scanat îți arăt cât s-au scumpit exact produsele pe care le cumperi tu.")}</p>}
      {shrink.map((alert) => <p key={`${alert.key}-${alert.date}`} className="sh-alert"><Sparkles size={15} aria-hidden="true" /> {t("{name}: mai puțin în pachet, {percent} pe {per}", { name: alert.label, percent: pct(alert.perUnitPercent), per: alert.per })}</p>)}
      <button type="button" className="sh-link" onClick={onOpenProducts}>{t("Toate produsele")} <ChevronRight size={16} aria-hidden="true" /></button>
    </Card>
    </ProGate>

    <UpcomingCard data={data} today={today} onOpen={(item) => { if (item.kind === "return" || item.kind === "warranty") onOpenMore("warranties"); else if (onOpenCosts) onOpenCosts(item.kind === "debt" ? "debts" : item.kind); }} />

    {top.length > 0 && <Card kicker={t("PE CE SE DUC BANII")} title={t("Ultimele 30 de zile")}>
      <ul className="sh-list">{top.map((item) => <li key={item.key}><span><b>{item.label}</b><small>{item.count === 1 ? t("o cumpărare") : t("{count} cumpărări", { count: item.count })}</small></span><b>{lei(item.spent)}</b></li>)}</ul>
    </Card>}

    {month.categories.length > 0 && <Card kicker={t("PE CATEGORII")}>
      <div className="sh-bars">{month.categories.slice(0, 5).map((item) => <div key={item.category} className="sh-bar"><span>{t(item.category)}</span><i style={{ width: `${Math.max(4, Math.round((item.amount / month.categories[0].amount) * 100))}%` }} /><b>{lei(item.amount)}</b></div>)}</div>
    </Card>}

    <Card kicker={t("BONURILE RECENTE")}>
      {recent.length ? <ul className="sh-list">{recent.map((receipt) => <li key={receipt.id}><span><b>{receipt.vendor || t("Bon")}</b><small>{dateText(receipt.date, true)}{receipt.lines?.length ? ` · ${t("{count} produse", { count: receipt.lines.length })}` : ""}</small></span><b>{lei(receipt.amount)}</b></li>)}</ul>
        : <p className="sh-muted">{t("Niciun bon încă. Fă o poză bonului de la magazin: citesc fiecare produs, cu prețul lui.")}</p>}
      <button type="button" className="sh-link" onClick={() => onOpenMore("receipts")}>{t("Toate bonurile")} <ChevronRight size={16} aria-hidden="true" /></button>
    </Card>
  </div>;
}

export function ProductsView({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  return <div className="sh-page">
    <header className="sh-head"><p className="sh-kicker">{t("PRODUSE")}</p><h1 className="sh-h1">{t("Tot ce cumperi, cu prețul în timp")}</h1></header>
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
    <header className="sh-head"><p className="sh-kicker">{t("CUMPĂRĂTURI")}</p><h1 className="sh-h1">{t("Lista familiei")}</h1></header>
    <div className="sh-tabs" role="tablist">{([["list", t("Listă")], ["pantry", t("Stoc")], ["menu", t("Meniu")]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "list" && <>
      {todo.length > 0 && <button type="button" className="sh-scan" onClick={share}><Send size={20} aria-hidden="true" /> {t("Trimite pe WhatsApp")}</button>}
      {todo.length > 0 && (reply === undefined
        ? <button type="button" className="sh-link" onClick={() => setReply("")}>{t("Am primit răspunsul cu ce s-a luat")}</button>
        : <div className="sh-card"><textarea className="sh-reply" aria-label={t("Răspunsul de pe WhatsApp")} placeholder={t("Lipește aici mesajul „Am luat: …”")} value={reply} onChange={(event) => setReply(event.target.value)} rows={4} /><button type="button" className="sh-link" onClick={applyReply}>{t("Bifează ce s-a luat")}</button></div>)}
      <RunningOutCard data={data} onAdd={addToList} />
      <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim lista…")}</div>}><ShoppingListPanel data={data} onChange={onChange} /></Suspense>
    </>}
    {tab === "pantry" && <PantryCard data={data} onAdd={addToList} />}
    {tab === "menu" && <ProGate data={data} feature="weeklyMenu" title={t("Meniul săptămânii")} pitch={t("Șapte mese ieftine din ce cumperi deja, cu costul din prețurile tale.")}><MenuCard data={data} onAdd={addToList} /></ProGate>}
  </div>;
}

/** „Ți se termină”: din ritmul cumpărăturilor tale, cu un tap pe listă. */
function RunningOutCard({ data, onAdd }: { data: AppData; onAdd: (texts: string[]) => void }) {
  const today = isoToday();
  const [snoozed, setSnoozed] = useState(() => readRunoutSnooze());
  const items = useMemo(() => pantryFromReceipts(productObservations(data), today), [data, today]);
  const onList = visibleShopping(data.settings.shoppingList || []).todo.map((item) => item.text);
  const list = runningOut(items, onList, snoozed, nameScore);
  if (!list.length) return null;
  const snooze = (key: string, lastDate: string) => { const next = { ...snoozed, [key]: lastDate }; setSnoozed(next); try { window.localStorage.setItem(RUNOUT_SNOOZE_KEY, JSON.stringify(next)); } catch { /* fără stocare */ } };
  return <section className="sh-card sh-runout" aria-label={t("Ți se termină")}>
    <p className="sh-kicker">{t("ȚI SE TERMINĂ")}</p>
    <p className="sh-muted">{t("După cât de des le cumperi.")}</p>
    <ul className="sh-runout-list">{list.map((item) => <li key={item.key}>
      <span><b>{item.label}</b><small>{item.state === "out" ? t("de obicei la ~{days} zile, acum {since} zile", { days: item.everyDays, since: item.daysSince }) : t("o dată la ~{days} zile · curând", { days: item.everyDays })}</small></span>
      <button type="button" className="sh-runout-add" aria-label={t("Pune {item} pe listă", { item: item.label })} onClick={() => onAdd([item.label])}><Plus size={18} aria-hidden="true" /></button>
      <button type="button" className="sh-link sh-runout-skip" onClick={() => snooze(item.key, item.lastDate)}>{t("Am destul")}</button>
    </li>)}</ul>
    {list.length > 1 && <button type="button" className="sh-link" onClick={() => onAdd(list.map((item) => item.label))}><Plus size={16} aria-hidden="true" /> {t("Pune-le pe toate pe listă")}</button>}
  </section>;
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
  const [tab, setTab] = useState<"products" | "stores" | "stats">("products");
  return <div className="sh-page">
    <div className="sh-tabs" role="tablist">{([["products", t("Produsele mele")], ["stats", t("Statistici")], ["stores", t("Magazine")]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
    <Suspense fallback={null}><BarcodeCheck data={data} onChange={onChange} /></Suspense>
    {tab === "products" ? <ProductsView data={data} onChange={onChange} /> : tab === "stats" ? <Suspense fallback={null}><ShopStats data={data} /></Suspense> : <StoresView data={data} />}
  </div>;
}

export function StoresView({ data }: { data: AppData }) {
  const today = isoToday();
  const stores = useMemo(() => storeStats(data, today), [data, today]);
  const saving = useMemo(() => savingsOpportunity(data, today, 90), [data, today]);
  const cheapest = stores.filter((item) => item.priceIndex !== undefined).sort((a, b) => (a.priceIndex ?? 0) - (b.priceIndex ?? 0))[0];
  return <div className="sh-page">
    <header className="sh-head"><p className="sh-kicker">{t("MAGAZINE")}</p><h1 className="sh-h1">{t("Unde cumperi și unde ar merita")}</h1></header>
    {cheapest && <Card tone="accent" kicker={t("CEL MAI IEFTIN PENTRU TINE")} title={cheapest.vendor}><p className="sh-muted">{t("La produsele pe care le iei din mai multe locuri, {vendor} iese cel mai bine.", { vendor: cheapest.vendor })}</p></Card>}
    {saving.total > 0 && <Card kicker={t("ULTIMELE 90 DE ZILE")} title={t("Puteai economisi {amount}", { amount: lei(saving.total) })}>
      <ul className="sh-list">{saving.items.slice(0, 6).map((item) => <li key={item.key}><span><b>{item.label}</b><small>{t("{vendor} → {cheaper}", { vendor: item.vendor, cheaper: item.cheaperVendor })}</small></span><b className="sh-down">−{lei(item.saved)}</b></li>)}</ul>
    </Card>}
    <Card kicker={t("MAGAZINELE TALE")} title={t("Ultimele 90 de zile")}>
      {stores.length ? <ul className="sh-list">{stores.map((item) => <li key={item.vendor}><span><b>{item.vendor}</b><small>{[item.visits === 1 ? t("o vizită") : t("{count} vizite", { count: item.visits }), t("coș mediu {amount}", { amount: lei(item.average) }), item.priceIndex !== undefined ? (item.priceIndex <= 0.5 ? t("cel mai ieftin la produsele comune") : t("{percent} față de cel mai ieftin", { percent: pct(item.priceIndex) })) : ""].filter(Boolean).join(" · ")}</small></span><b>{lei(item.spent)}</b></li>)}</ul>
        : <p className="sh-muted">{t("Scanează bonuri de la magazinele unde mergi: aici vezi unde lași cei mai mulți bani și care e mai scump.")}</p>}
    </Card>
    {stores.some((item) => item.priceIndex !== undefined) && <p className="sh-muted sh-note">{t("Comparația ține doar de produsele pe care le-ai cumpărat în cel puțin două magazine, pe kg, litru sau bucată.")}</p>}
  </div>;
}

export type Look = "light" | "dark" | "auto";
/** Cont: profilul, BonAI Pro, bonurile și costurile casei, familia, setările. Fără unelte din aplicația veche. */
export function HouseView({ data, onOpenMore, onOpenJournal, onOpenCosts, look, onLook }: { data: AppData; onOpenMore: (tab: MoreView) => void; onOpenJournal: () => void; onOpenBudget?: () => void; onOpenCosts?: (kind: "sub" | "bill" | "debts" | "receipts" | "costs") => void; look?: Look; onLook?: (look: Look) => void }) {
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
    <div className="sh-rows">
      <Row icon={<ReceiptText size={20} />} title={t("Bonuri")} hint={t("toate bonurile scanate")} onClick={() => (onOpenCosts ? onOpenCosts("receipts") : onOpenMore("receipts"))} />
      <Row icon={<ShoppingBasket size={20} />} title={t("Toate costurile")} hint={t("și cele fără bon")} onClick={() => (onOpenCosts ? onOpenCosts("costs") : onOpenJournal())} />
      <Row icon={<Users size={20} />} title={t("Familie și membri")} hint={members || t("invită partenerul")} onClick={() => onOpenMore("sync")} />
      <Row icon={<ShieldCheck size={20} />} title={t("Garanții și retururi")} hint={t("bonul păstrat, amintire înainte de retur")} onClick={() => onOpenMore("warranties")} />
      <Row icon={<Repeat size={20} />} title={t("Abonamente")} hint={t("Netflix, telefon, sală")} onClick={() => onOpenCosts?.("sub")} />
      <Row icon={<Zap size={20} />} title={t("Facturi")} hint={t("curent, gaz, internet")} onClick={() => onOpenCosts?.("bill")} />
      <Row icon={<Landmark size={20} />} title={t("Datorii")} hint={data.debts.length ? t("{n} în evidență", { n: data.debts.length }) : t("rate, împrumuturi, carduri")} onClick={() => onOpenCosts?.("debts")} />
    </div>
    {onLook && <section className="sh-card" aria-label={t("Aspect")}><p className="sh-kicker">{t("ASPECT")}</p><div className="sh-seg" role="group" aria-label={t("Tema aplicației")}>{([["light", t("Luminos")], ["dark", t("Noapte")], ["auto", t("Automat")]] as Array<[Look, string]>).map(([id, label]) => <button key={id} type="button" aria-pressed={look === id} onClick={() => onLook(id)}>{label}</button>)}</div><p className="sh-muted sh-note">{t("Automat urmează setarea telefonului.")}</p></section>}
    <div className="sh-rows">
      <Row icon={<Download size={20} />} title={t("Export și copii de siguranță")} hint={t("fișier pe telefon")} onClick={() => onOpenMore("settings")} />
      <Row icon={<Settings size={20} />} title={t("Setări")} hint={t("limbă, notificări, date și confidențialitate")} onClick={() => onOpenMore("settings")} />
    </div>
    <p className="sh-muted sh-note"><Store size={14} aria-hidden="true" /> {t("Bonurile și prețurile rămân pe telefoanele familiei, criptate. Nimeni altcineva nu le vede.")}</p>
  </div>;
}

/** Prima pornire: lista gratuită, scanarea bonului și verificarea cu codul de bare; fără salariu și plicuri. */
export function ShopWelcome({ onScan, onList, onJoin, onSkip }: { onScan: () => void; onList: () => void; onJoin: () => void; onSkip: () => void }) {
  const steps: Array<[ReactNode, string, string]> = [
    [<ListChecks size={22} key="list" />, t("Lista familiei, gratuit"), t("Comună pe toate telefoanele, cu prețul estimat din bonurile voastre. O trimiți pe WhatsApp și se bifează și fără aplicație.")],
    [<ScanLine size={22} key="scan" />, t("Scanezi bonul"), t("O poză. Citesc fiecare produs, cu marca, gramajul și prețul.")],
    [<Store size={22} key="store" />, t("Verifici prețul în magazin"), t("Scanezi codul de bare și vezi cât ai dat ultima dată și unde a fost mai ieftin.")],
    [<Sparkles size={22} key="pro" />, t("Inflația ta și cât economisești"), t("După al {n}-lea bon primești {days} zile de BonAI Pro gratuit.", { n: TRIAL_AFTER_RECEIPTS, days: TRIAL_DAYS })],
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
      <Row icon={<Users size={20} />} title={t("Am deja familia în aplicație")} hint={t("intru cu invitația partenerului")} onClick={onJoin} />
    </div>
    <button type="button" className="sh-link" onClick={onSkip}>{t("Mă uit întâi prin aplicație")} <ChevronRight size={16} aria-hidden="true" /></button>
  </div>;
}
