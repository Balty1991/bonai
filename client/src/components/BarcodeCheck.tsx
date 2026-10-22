/** Verifică un produs în magazin după codul de bare, față de prețurile din bonurile tale. */
import { useMemo, useState } from "react";
import { Barcode, Check, Plus, Search, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { newId, isoToday, type AppData } from "@/lib/finance-data";
import { productObservations } from "@/lib/personal-inflation";
import { confidentMatch, isValidEan, nameScore, readBarcodeLinks, shelfDiff, suggestProducts, verdictFor } from "@/lib/barcode-check";
import { lei } from "@/lib/money-format";
import { withBarcodeLink } from "@/lib/barcode-links";
import { OFFICIAL_ATTRIBUTION, OFFICIAL_PRICES_ENABLED, lookupOfficialPrice, type OfficialResult } from "@/lib/official-prices";
import { t } from "@/lib/i18n";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { rememberShelf } from "@/lib/discount-check";
import { BARCODE_SOURCES, lookupBarcode, productTitle, type BarcodeProduct } from "@/lib/barcode-sources";
import { receiptCategories } from "@/lib/receipt-scan";

const perText = (per: string) => (per === "buc" ? t("bucata") : per);
const pctText = (value: number) => Math.abs(value).toLocaleString("ro-RO", { maximumFractionDigits: 1 });
const dayText = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });

export function BarcodeCheck({ data, onChange, compact = false }: { data: AppData; onChange: (next: AppData) => void; /** Fără titlu și explicație cât nu verifici nimic: nu împinge produsele în jos. */ compact?: boolean }) {
  const [code, setCode] = useState("");
  const [ean, setEan] = useState<string>();
  const [offName, setOffName] = useState<string>();
  const [found, setFound] = useState<BarcodeProduct>();
  const [noNet, setNoNet] = useState(false);
  const [linked, setLinked] = useState<string>();
  const [linkedLabel, setLinkedLabel] = useState<string>();
  const [guessed, setGuessed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [shelf, setShelf] = useState("");
  const [promo, setPromo] = useState(false);
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [tried, setTried] = useState(false);
  const [added, setAdded] = useState(false);
  const [official, setOfficial] = useState<OfficialResult | null>();
  const city = useMemo(() => [...data.receipts].sort((a, b) => b.date.localeCompare(a.date)).find((r) => r.city)?.city || "", [data.receipts]);
  const observations = useMemo(() => productObservations(data), [data]);
  const products = useMemo(() => { const seen = new Map<string, { key: string; label: string }>(); for (const o of observations) { const id = `${o.key}\u0000${o.label}`; if (!seen.has(id)) seen.set(id, { key: o.key, label: o.label }); } return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, "ro")); }, [observations]);
  const today = isoToday();
  const verdict = linked ? verdictFor(linked, observations, today, linkedLabel || offName) : undefined;
  const suggestions = useMemo(() => (offName ? suggestProducts(offName, observations, 6) : []), [offName, observations]);
  const options = useMemo(() => {
    const q = query.trim();
    if (!q) { const top = new Set(suggestions.map((s) => s.label)); return [...suggestions.map((s) => ({ key: s.key, label: s.label })), ...products.filter((p) => !top.has(p.label))].slice(0, 8); }
    return products.map((p) => ({ ...p, score: nameScore(q, p.label) + (p.label.toLocaleLowerCase("ro-RO").includes(q.toLocaleLowerCase("ro-RO")) ? 0.5 : 0) })).filter((p) => p.score > 0.2).sort((a, b) => b.score - a.score).slice(0, 8);
  }, [query, suggestions, products]);
  const shelfPrice = Number(shelf.replace(",", "."));
  const lastObs = useMemo(() => (verdict ? observations.find((o) => o.key === linked && o.label === verdict.label && o.date === verdict.last.date) : undefined), [verdict, linked, observations]);
  const diff = lastObs ? shelfDiff(shelfPrice, lastObs.piecePrice) : undefined;

  const reset = () => { setFound(undefined); setNoNet(false); setKept(false); setPromo(false); setAdded(false); setOffName(undefined); setLinked(undefined); setLinkedLabel(undefined); setGuessed(false); setPicking(false); setQuery(""); setShelf(""); setTried(true); };
  const check = async (value: string) => {
    const clean = value.replace(/\D/g, "");
    reset();
    if (!isValidEan(clean)) { setEan(undefined); return; }
    setEan(clean);
    const link = data.settings.barcodeLinks?.[clean];
    const known = link?.key || readBarcodeLinks()[clean];
    if (known) { setLinked(known); setLinkedLabel(link?.label); return; }
    setBusy(true);
    const result = await lookupBarcode(clean, receiptCategories(data));
    const name = result.product ? productTitle(result.product) : undefined;
    setFound(result.product); setNoNet(Boolean(result.offline && !result.product));
    setOffName(name); setBusy(false);
    const sure = name ? confidentMatch(suggestProducts(name, observations, 6)) : undefined;
    if (sure) { setLinked(sure.key); setLinkedLabel(sure.label); setGuessed(true); }
  };
  const scanned = (value: string) => { setScanning(false); setCode(value); void check(value); };
  const pick = (key: string, label: string) => { if (!ean) return; onChange(withBarcodeLink(data, ean, key, undefined, label)); setLinked(key); setLinkedLabel(label); setGuessed(false); setPicking(false); };
  const confirm = () => { if (ean && linked && guessed) { onChange(withBarcodeLink(data, ean, linked, undefined, linkedLabel)); setGuessed(false); } };
  const addToList = () => {
    const text = verdict?.label || offName;
    if (!text) return;
    const base = ean && linked && guessed ? withBarcodeLink(data, ean, linked, undefined, linkedLabel) : data;
    onChange({ ...base, settings: { ...base.settings, shoppingList: [...(base.settings.shoppingList || []), { id: newId("shop"), text, ...(found?.category ? { category: found.category } : {}), updatedAt: new Date().toISOString() }] } });
    setGuessed(false); setAdded(true);
  };
  const Trend = verdict?.trend === undefined ? null : verdict.trend > 0.5 ? TrendingUp : verdict.trend < -0.5 ? TrendingDown : Minus;

  const productCard = found && <div className="bn-bc-found">
    {found.image ? <img src={found.image} srcSet={/\.200\.jpg$/.test(found.image) ? `${found.image} 1x, ${found.image.replace(/\.200\.jpg$/, ".400.jpg")} 2x` : undefined} alt="" width={56} height={56} decoding="async" referrerPolicy="no-referrer" /> : <span className="bn-bc-noimg" aria-hidden="true" />}
    <p><b>{found.name}</b>{(found.brand || found.quantity) && <small>{[found.brand, found.quantity].filter(Boolean).join(" · ")}</small>}<small className="bn-bc-src">{t("după {source}", { source: BARCODE_SOURCES[found.source].label })}{found.category ? ` · ${found.category}` : ""}</small></p>
  </div>;
  const picker = <div className="bn-bc-pick">
    {productCard}
    {noNet && <p className="bn-bc-ask" role="status">{t("Fără internet nu pot căuta codul în bazele deschise. Leagă-l acum de un produs din bonuri sau încearcă mai târziu.")}</p>}
    <p className="bn-bc-ask">{found ? (products.length ? t("Leagă-l de produsul tău din bonuri, ca să-ți arăt prețul.") : t("Încă nu l-ai cumpărat. Pune-l pe listă; după primul bon îți arăt prețul.")) : offName ? t("Pare să fie {name}. Leagă-l de produsul tău din bonuri, ca să-ți arăt prețul.", { name: offName }) : t("Nu-l recunosc după cod. Leagă-l de un produs din bonurile tale.")}</p>
    {products.length > 0 ? <>
      <label className="bn-bc-search"><Search size={18} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Caută în produsele tale")} aria-label={t("Caută în produsele tale")} /></label>
      <ul className="bn-bc-options" aria-label={t("Leagă de un produs din bonuri")}>{options.map((item) => <li key={`${item.key}-${item.label}`}><button type="button" aria-pressed={linked === item.key} onClick={() => pick(item.key, item.label)}><span>{item.label}</span>{linked === item.key && <Check size={18} aria-hidden="true" />}</button></li>)}</ul>
      {options.length === 0 && <p className="sh-muted">{t("Niciun produs nu se potrivește. Încearcă alt cuvânt.")}</p>}
    </> : <p className="sh-muted">{t("Încă nu ai bonuri cu produse. Scanează un bon și data viitoare îți spun dacă prețul e bun.")}</p>}
  </div>;

  const slim = compact && !ean && !busy;
  return <section className={`sh-card bn-bc${slim ? " is-slim" : ""}`}>
    {!slim && <p className="sh-kicker">{t("VERIFICĂ ÎN MAGAZIN")}</p>}
    {!slim && <p className="bn-bc-lead">{t("Scanează un produs de pe raft și vezi cât l-ai plătit ultima dată și unde — afli pe loc dacă prețul e bun.")}</p>}
    <button type="button" className="sh-scan" onClick={() => setScanning(true)}><Barcode size={20} aria-hidden="true" /> {t("Scanează codul de bare")}</button>
    {slim && <p className="sh-muted bn-bc-hint">{t("La raft: vezi cât ai dat ultima dată pe produs.")}</p>}
    {scanning && <BarcodeScanner onCode={scanned} onClose={() => setScanning(false)} />}
    <form className="sh-row-form" onSubmit={(event) => { event.preventDefault(); void check(code); }}>
      <input inputMode="numeric" aria-label={t("Codul de bare")} placeholder={t("sau scrie cifrele de sub cod")} value={code} onChange={(event) => { setCode(event.target.value); setTried(false); }} />
      <button type="submit" className="sh-link">{t("Verifică")}</button>
    </form>
    {!ean && !busy && (tried || code.replace(/\D/g, "").length >= 8) && <p className="sh-muted" role="status">{code.replace(/\D/g, "") ? t("Codul nu pare corect. Verifică cifrele.") : t("Scrie cifrele de sub codul de bare (8 sau 13 cifre).")}</p>}
    {busy && <p className="sh-muted" role="status">{t("Caut produsul…")}</p>}
    {ean && !busy && (!verdict || picking) && picker}
    {verdict && !picking && <article className="bn-bc-card" aria-live="polite">
      <h3>{verdict.label}</h3>
      <p className="bn-bc-last"><span>{t("Ultima dată")}</span><b>{lei(lastObs?.piecePrice ?? verdict.last.price)}</b><small>{t("la {vendor} ({date})", { vendor: verdict.last.vendor, date: dayText(verdict.last.date) })}{verdict.last.per !== "buc" ? ` · ${lei(verdict.last.price)}/${verdict.last.per}` : ""}</small></p>
      {Trend && verdict.previous && <p className={`bn-bc-trend ${verdict.trend! > 0.5 ? "is-up" : verdict.trend! < -0.5 ? "is-down" : ""}`}><Trend size={18} aria-hidden="true" /> {verdict.trend! > 0.5 ? t("+{pct}% față de data trecută ({price})", { pct: pctText(verdict.trend!), price: lei(verdict.previous.price) }) : verdict.trend! < -0.5 ? t("−{pct}% față de data trecută ({price})", { pct: pctText(verdict.trend!), price: lei(verdict.previous.price) }) : t("La fel ca data trecută")}</p>}
      {verdict.cheapest && <p className="bn-bc-cheap">{t("Cel mai mic preț la tine: {price} pe {per}, la {vendor} ({date}).", { price: lei(verdict.cheapest.price), per: perText(verdict.cheapest.per), vendor: verdict.cheapest.vendor, date: dayText(verdict.cheapest.date) })}</p>}
      <label className="bn-bc-shelf"><span>{t("Prețul de pe raft acum")}</span><input inputMode="decimal" value={shelf} onChange={(event) => { setShelf(event.target.value); setKept(false); }} placeholder="0,00" aria-label={t("Prețul de pe raft acum")} /><em>lei</em></label>
      {diff !== undefined && <p className={`bn-bc-verdict ${diff > 0.5 ? "is-up" : diff < -0.5 ? "is-down" : ""}`} role="status">{diff > 0.5 ? t("Mai scump cu {pct}% decât ai dat ultima dată.", { pct: pctText(diff) }) : diff < -0.5 ? t("Mai ieftin cu {pct}% decât ai dat ultima dată.", { pct: pctText(diff) }) : t("Același preț ca ultima dată.")}</p>}
      {shelfPrice > 0 && <div className="bn-bc-keep">
        <label><input type="checkbox" checked={promo} onChange={(event) => { setPromo(event.target.checked); setKept(false); }} /> {t("E preț de promoție")}</label>
        <button type="button" className="sh-link" disabled={kept} onClick={() => { if (!linked || !verdict) return; rememberShelf({ key: linked, label: verdict.label, price: Math.round(shelfPrice * 100) / 100, date: today, ...(promo ? { promo: true } : {}) }, today); setKept(true); }}>{kept ? t("Ținut minte: îl verific pe bon") : t("Ține minte și verifică-l pe bon")}</button>
      </div>}
      {guessed && <p className="bn-bc-guess">{t("Potrivit după nume.")} <button type="button" className="sh-link" onClick={confirm}>{t("E corect")}</button> <button type="button" className="sh-link" onClick={() => setPicking(true)}>{t("Alt produs")}</button></p>}
      {!guessed && <button type="button" className="sh-link bn-bc-change" onClick={() => setPicking(true)}>{t("Schimbă produsul legat")}</button>}
      <button type="button" className="sh-scan bn-bc-add" onClick={addToList} disabled={added}>{added ? <><Check size={18} aria-hidden="true" /> {t("Adăugat în listă")}</> : <><Plus size={18} aria-hidden="true" /> {t("Adaugă în listă")}</>}</button>
      <p className="sh-muted bn-bc-note">{t("Prețurile vin doar din bonurile tale.")}</p>
    </article>}
    {OFFICIAL_PRICES_ENABLED && city && (verdict || offName) && (official === undefined
      ? <button type="button" className="sh-link" onClick={() => { setOfficial(null); void lookupOfficialPrice(verdict?.label || offName || "", city).then((result) => setOfficial(result || null)); }}>{t("Prețul oficial în {city}", { city })}</button>
      : official && official.offers.length > 0 ? <div className="sh-rows"><ul className="sh-list">{official.offers.slice(0, 3).map((offer) => <li key={`${offer.store}-${offer.price}`}><span><b>{offer.network || offer.store}</b><small>{offer.address || offer.store}</small></span><b>{lei(offer.price)}</b></li>)}</ul><p className="sh-muted sh-note">{OFFICIAL_ATTRIBUTION}</p></div>
      : official === null ? <p className="sh-muted">{t("Caut produsul…")}</p> : null)}
    {!verdict && offName && <button type="button" className="sh-link" onClick={addToList} disabled={added}>{added ? <><Check size={16} aria-hidden="true" /> {t("Adăugat în listă")}</> : <><Plus size={16} aria-hidden="true" /> {t("Adaugă în listă")}</>}</button>}
  </section>;
}
