/**
 * Aplicația nouă, a cumpărăturilor: Acasă, Produse, Magazine și Casa.
 * Totul pornește de la bon: scanezi, iar aplicația îți arată ce cumperi, cât costă fiecare
 * produs, unde e mai ieftin și cât s-a scumpit viața ta. Bugetul cu plicuri a rămas întreg,
 * cu toate datele, sub Casa → „Buget (vechi)”.
 */
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Lock, Send, Share2, Download, ListChecks, PiggyBank, ReceiptText, ScanLine, Settings, ShieldCheck, ShoppingBasket, Sparkles, Store, Users, Wallet } from "lucide-react";
import { isoToday, type AppData } from "@/lib/finance-data";
import { monthShopping, savingsOpportunity, storeStats, topProducts } from "@/lib/shop-insights";
import { monthInflation, shrinkflationAlerts } from "@/lib/personal-inflation";
import { liveWarranties } from "@/lib/warranties";
import { lei } from "@/lib/money-format";
import { t } from "@/lib/i18n";
import { dateText, type MoreView } from "@/pages/home-kit";
import { visibleShopping } from "@/lib/shopping-list";
import { listShareLink, listShareText, whatsappShareUrl } from "@/lib/list-share";
import { buildLegacyArchive, hasLegacyData } from "@/lib/legacy-archive";
import { saveExport } from "@/lib/save-export";
import { monthSaved, savedShareText, threeMonthAverage } from "@/lib/savings-summary";
import { currentBonutPlan } from "@/lib/bonut-plan-current";
import { BONUT_PRICES, TRIAL_AFTER_RECEIPTS, TRIAL_DAYS, hasFeature, yearlySavingPercent, type BonutFeature } from "@/lib/bonut-plans";
import { PLAY_STORE_URL } from "@/lib/review-prompt";

const ShoppingListPanel = lazy(() => import("@/components/ShoppingListPanel").then((module) => ({ default: module.ShoppingListPanel })));
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
export function ProGate({ data, feature, title, pitch, children }: { data: AppData; feature: BonutFeature; title: string; pitch: string; children: ReactNode }) {
  const plan = currentBonutPlan(data, isoToday());
  if (hasFeature(plan, feature)) return <>{children}</>;
  const familyOnly = !hasFeature("pro", feature);
  const price = familyOnly ? BONUT_PRICES.familie : BONUT_PRICES.pro;
  return <Card kicker={familyOnly ? t("BONUȚ FAMILIE") : t("BONUȚ PRO")} title={<><Lock size={18} aria-hidden="true" /> {title}</>}>
    <p className="sh-muted">{pitch}</p>
    <p><b>{t("{year} lei/an", { year: money2(price.year) })}</b> <small className="sh-muted">{t("sau {month} lei/lună · anual cu {percent}% mai ieftin", { month: money2(price.month), percent: yearlySavingPercent(familyOnly ? "familie" : "pro") })}</small></p>
    <p className="sh-muted">{data.receipts.length < TRIAL_AFTER_RECEIPTS ? t("Proba gratuită de {days} zile pornește singură după al {n}-lea bon scanat.", { days: TRIAL_DAYS, n: TRIAL_AFTER_RECEIPTS }) : t("Abonamentele pornesc în curând în Google Play.")}</p>
  </Card>;
}

function shareSaved(text: string) {
  const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
  if (nav.share) { void nav.share({ text }).catch(() => undefined); return; }
  window.open(whatsappShareUrl(text), "_blank", "noopener");
}

export function ShopHome({ data, onScan, onOpenProducts, onOpenStores, onOpenMore }: { data: AppData; onScan: () => void; onOpenProducts: () => void; onOpenStores: () => void; onOpenMore: (tab: MoreView) => void }) {
  const today = isoToday();
  const month = useMemo(() => monthShopping(data, today), [data, today]);
  const top = useMemo(() => topProducts(data, today), [data, today]);
  const saving = useMemo(() => savingsOpportunity(data, today), [data, today]);
  const inflation = useMemo(() => monthInflation(data), [data]);
  const shrink = useMemo(() => shrinkflationAlerts(data, today).slice(0, 2), [data, today]);
  const warranties = useMemo(() => liveWarranties(data, today).filter((item) => item.status.state === "return" || item.status.state === "expiring").slice(0, 2), [data, today]);
  const diff = month.spent - month.lastMonthSoFar;
  const saved = useMemo(() => monthSaved(data, today), [data, today]);
  const avg = useMemo(() => threeMonthAverage(data, today), [data, today]);
  const recent = useMemo(() => [...data.receipts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), [data.receipts]);
  return <div className="sh-page">
    <header className="sh-hero">
      <p className="sh-kicker">{t("CUMPĂRĂTURILE TALE ÎN {month}", { month: monthName(month.month).toLocaleUpperCase("ro-RO") })}</p>
      <h1 className="sh-big">{lei(month.spent)}</h1>
      <p className="sh-sub">{month.receipts ? t("din {count} bonuri", { count: month.receipts }) : t("Scanează primul bon al lunii.")}{month.lastMonthSoFar > 0 && <> · <span className={diff > 0 ? "sh-up" : "sh-down"}>{diff > 0 ? t("{amount} mai mult", { amount: lei(diff) }) : t("{amount} mai puțin", { amount: lei(-diff) })}</span> {t("decât luna trecută până azi")}</>}</p>
      {avg && month.spent > 0 && <p className="sh-sub">{t("Media pe {count} luni: {amount}", { count: avg.months, amount: lei(avg.average) })}</p>}
      <button type="button" className="sh-scan" onClick={onScan}><ScanLine size={22} aria-hidden="true" /> {t("Scanează bonul")}</button>
    </header>

    {saved.saved > 0 && <ProGate data={data} feature="savedWithApp" title={t("Economisit cu Bonuț")} pitch={t("Vezi cât ai economisit din reducerile de pe bonuri, lună de lună.")}>
      <Card tone="accent" kicker={t("ECONOMISIT CU BONUȚ")} title={lei(saved.saved)}>
        <p className="sh-muted">{t("din reducerile de pe {count} bonuri în {month}", { count: saved.receipts, month: monthName(saved.month) })}</p>
        <button type="button" className="sh-link" onClick={() => shareSaved(savedShareText(saved.saved, monthName(saved.month), PLAY_STORE_URL))}><Share2 size={16} aria-hidden="true" /> {t("Spune-le prietenilor")}</button>
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

    {warranties.length > 0 && <Card tone="warn" kicker={t("GARANȚII ȘI RETURURI")}>
      {warranties.map(({ warranty, status }) => <p key={warranty.id} className="sh-alert"><ShieldCheck size={15} aria-hidden="true" /> {status.state === "return" ? t("{name}: retur până pe {date}", { name: warranty.name, date: dateText(status.returnUntil || today, true) }) : t("{name}: garanția expiră pe {date}", { name: warranty.name, date: dateText(status.until || today, true) })}</p>)}
      <button type="button" className="sh-link" onClick={() => onOpenMore("warranties")}>{t("Deschide garanțiile")} <ChevronRight size={16} aria-hidden="true" /></button>
    </Card>}

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

/** Cumpărături: lista comună, gratuită, cu prețuri estimate din bonuri și trimitere pe WhatsApp. */
export function ListView({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const todo = visibleShopping(data.settings.shoppingList || []).todo;
  const share = () => {
    const text = listShareText(todo, t("Lista de cumpărături:"), `${t("Bifează aici, fără aplicație:")} ${listShareLink(todo, data.settings.familyName || undefined)}`);
    window.open(whatsappShareUrl(text), "_blank", "noopener");
  };
  return <div className="sh-page">
    <header className="sh-head"><p className="sh-kicker">{t("CUMPĂRĂTURI")}</p><h1 className="sh-h1">{t("Lista familiei")}</h1></header>
    {todo.length > 0 && <button type="button" className="sh-scan" onClick={share}><Send size={20} aria-hidden="true" /> {t("Trimite pe WhatsApp")}</button>}
    <Suspense fallback={<div className="bf-lazy-panel">{t("Pregătim lista…")}</div>}><ShoppingListPanel data={data} onChange={onChange} /></Suspense>
  </div>;
}

/** Prețuri: produsele mele și magazinele, în taburi. */
export function PricesView({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const [tab, setTab] = useState<"products" | "stores">("products");
  return <div className="sh-page">
    <div className="sh-tabs" role="tablist">{([["products", t("Produsele mele")], ["stores", t("Magazine")]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "products" ? <ProductsView data={data} onChange={onChange} /> : <StoresView data={data} />}
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

export function HouseView({ data, onOpenMore, onOpenJournal, onOpenBudget }: { data: AppData; onOpenMore: (tab: MoreView) => void; onOpenJournal: () => void; onOpenBudget: () => void }) {
  const members = data.settings.members.filter((item) => item.kind !== "child").map((item) => item.name).join(", ");
  return <div className="sh-page">
    <header className="sh-head"><p className="sh-kicker">{t("GOSPODĂRIE")}</p><h1 className="sh-h1">{data.settings.familyName || t("Familia ta")}</h1></header>
    <div className="sh-rows">
      <Row icon={<Users size={20} />} title={t("Familia și sincronizarea")} hint={members || t("invită partenerul")} onClick={() => onOpenMore("sync")} />
      <Row icon={<ShieldCheck size={20} />} title={t("Garanții și retururi")} hint={t("bonul păstrat, amintire înainte de retur")} onClick={() => onOpenMore("warranties")} />
      <Row icon={<ListChecks size={20} />} title={t("Lista de cumpărături")} hint={t("comună pentru toată familia")} onClick={() => onOpenMore("shopping")} />
      <Row icon={<ReceiptText size={20} />} title={t("Bonuri")} hint={t("toate bonurile scanate")} onClick={() => onOpenMore("receipts")} />
      <Row icon={<ShoppingBasket size={20} />} title={t("Toate cheltuielile")} hint={t("și cele fără bon")} onClick={onOpenJournal} />
      <Row icon={<Download size={20} />} title={t("Export și copii de siguranță")} hint={t("fișier pe telefon")} onClick={() => onOpenMore("settings")} />
      <Row icon={<Settings size={20} />} title={t("Setări")} hint={t("limbă, notificări, temă")} onClick={() => onOpenMore("settings")} />
    </div>
    <div className="sh-rows">
      {hasLegacyData(data) && <Row icon={<Download size={20} />} title={t("Exportă arhiva veche")} hint={t("fișier JSON cu bugetul de dinainte")} onClick={() => void saveExport(`bonut-arhiva-${isoToday()}.json`, new Blob([JSON.stringify(buildLegacyArchive(data), null, 2)], { type: "application/json" }))} />}
      <Row icon={<Wallet size={20} />} title={t("Arhiva veche (buget)")} hint={t("plicurile, conturile și veniturile de dinainte, păstrate întregi")} onClick={onOpenBudget} />
      <Row icon={<PiggyBank size={20} />} title={t("Toate uneltele")} hint={t("rapoarte, avere, investiții")} onClick={() => onOpenMore("overview")} />
    </div>
    <p className="sh-muted sh-note"><Store size={14} aria-hidden="true" /> {t("Bonurile și prețurile rămân pe telefoanele familiei, criptate. Nimeni altcineva nu le vede.")}</p>
  </div>;
}

/** Prima pornire în aplicația nouă: fără salariu și plicuri; un bon e tot ce trebuie ca să înceapă. */
export function ShopWelcome({ onScan, onJoin, onSkip }: { onScan: () => void; onJoin: () => void; onSkip: () => void }) {
  const steps: Array<[ReactNode, string, string]> = [
    [<ScanLine size={22} key="scan" />, t("Scanezi bonul"), t("O poză. Citesc fiecare produs, cu marca, gramajul și prețul.")],
    [<ShoppingBasket size={22} key="basket" />, t("Vezi ce cumperi"), t("Prețul fiecărui produs în timp și cât s-a scumpit viața ta.")],
    [<Store size={22} key="store" />, t("Afli unde economisești"), t("Același produs, mai ieftin la alt magazin. Garanțiile, la timp.")],
  ];
  return <div className="sh-page sh-welcome">
    <header className="sh-hero">
      <p className="sh-kicker">{t("BINE AI VENIT")}</p>
      <h1 className="sh-big sh-welcome-title">{t("Vezi exact cât te costă viața, produs cu produs.")}</h1>
      <button type="button" className="sh-scan" onClick={onScan}><ScanLine size={22} aria-hidden="true" /> {t("Scanează primul bon")}</button>
    </header>
    <div className="sh-rows">{steps.map(([icon, title, hint]) => <div key={title} className="sh-row" role="presentation"><span className="sh-row-icon" aria-hidden="true">{icon}</span><span className="sh-row-copy"><b>{title}</b><small>{hint}</small></span><span /></div>)}</div>
    <div className="sh-rows">
      <Row icon={<Users size={20} />} title={t("Am deja familia în aplicație")} hint={t("intru cu invitația partenerului")} onClick={onJoin} />
    </div>
    <button type="button" className="sh-link" onClick={onSkip}>{t("Mă uit întâi prin aplicație")} <ChevronRight size={16} aria-hidden="true" /></button>
  </div>;
}
