/**
 * „Cât te costă viața, pe produs”: inflația ta pe luna asta, alertele de shrinkflation și
 * produsele casei, fiecare cu istoricul lui de preț. Deasupra listei de prețuri.
 */
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, PackageSearch, Search, TrendingUp } from "lucide-react";
import { foldRomanian, isoToday, type AppData } from "@/lib/finance-data";
import { monthInflation, productCards, shrinkflationAlerts, type ProductCard } from "@/lib/personal-inflation";
import { t } from "@/lib/i18n";
import { dateText } from "@/pages/home-kit";

const lei = (value: number) => value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;
const perText = (per: ProductCard["per"]) => per === "buc" ? t("buc") : per;
const monthName = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("ro-RO", { month: "long" });

function Trend({ value }: { value?: number }) {
  if (value === undefined) return <span style={{ color: "var(--cf-muted)" }}>—</span>;
  const up = value > 0.5;
  const down = value < -0.5;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontWeight: 700, color: up ? "var(--cf-danger, #b3261e)" : down ? "var(--cf-primary-strong, #1b4f42)" : "var(--cf-muted)" }}>{up ? <ArrowUpRight size={14} aria-hidden="true" /> : down ? <ArrowDownRight size={14} aria-hidden="true" /> : null}{pct(value)}</span>;
}

/** Linia prețului în timp, fără bibliotecă: puncte unite, cel mai ieftin și cel mai scump marcate. */
function Sparkline({ points }: { points: ProductCard["points"] }) {
  if (points.length < 2) return null;
  const width = 280; const height = 64; const pad = 6;
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices); const max = Math.max(...prices);
  const span = max - min || 1;
  const x = (index: number) => pad + (index * (width - pad * 2)) / (points.length - 1);
  const y = (price: number) => height - pad - ((price - min) / span) * (height - pad * 2);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.price).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={t("Prețul în timp: de la {min} la {max} lei", { min: lei(min), max: lei(max) })}>
      <path d={path} fill="none" stroke="var(--cf-primary, #2f6f5b)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => <circle key={`${point.date}-${index}`} cx={x(index)} cy={y(point.price)} r={3} fill="var(--cf-surface, #fff)" stroke="var(--cf-primary, #2f6f5b)" strokeWidth={2} />)}
    </svg>
  );
}

function ProductRow({ card, open, onToggle }: { card: ProductCard; open: boolean; onToggle: () => void }) {
  const headline = card.change.m3 ?? card.change.m1 ?? card.change.m6;
  return (
    <li style={{ display: "block", borderTop: "1px solid var(--cf-line)" }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center", padding: "10px 0", background: "none", border: 0, textAlign: "left", color: "var(--cf-ink)" }}>
        <span style={{ minWidth: 0 }}>
          <b style={{ display: "block", overflowWrap: "anywhere" }}>{card.label}</b>
          <small style={{ color: "var(--cf-muted)" }}>{[card.brand, card.count === 1 ? t("o cumpărare") : t("{count} cumpărări", { count: card.count }), card.latest.vendor].filter(Boolean).join(" · ")}</small>
        </span>
        <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <b style={{ display: "block", fontVariantNumeric: "tabular-nums" }}>{lei(card.latest.price)} {t("lei")}/{perText(card.per)}</b>
          {card.count > 1 && <small><Trend value={headline} /></small>}
        </span>
      </button>
      {open && (
        <div style={{ display: "grid", gap: 8, width: "100%", padding: "0 0 12px" }}>
          <Sparkline points={card.points} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6, textAlign: "center" }}>
            {([["m1", t("1 lună")], ["m3", t("3 luni")], ["m6", t("6 luni")]] as const).map(([key, label]) => <span key={key} style={{ display: "grid", gap: 2, padding: "6px 4px", borderRadius: 10, background: "var(--cf-surface-alt, #f1f4f2)" }}><small style={{ color: "var(--cf-muted)" }}>{label}</small><Trend value={card.change[key]} /></span>)}
          </div>
          {card.cheapest && <p className="bf-helper" style={{ margin: 0 }}>{t("Cel mai ieftin l-ai luat la {vendor}: {price} lei/{per}.", { vendor: card.cheapest.vendor, price: lei(card.cheapest.price), per: perText(card.per) })}</p>}
          <p className="bf-helper" style={{ margin: 0 }}>{t("Ultima dată: {date}, {vendor}. În ultimele 90 de zile ai dat {spent} lei pe el.", { date: dateText(card.latest.date, true), vendor: card.latest.vendor, spent: lei(card.spent90) })}</p>
        </div>
      )}
    </li>
  );
}

export function ProductInsights({ data }: { data: AppData }) {
  const today = isoToday();
  const cards = useMemo(() => productCards(data, today), [data, today]);
  const month = useMemo(() => monthInflation(data), [data]);
  const shrink = useMemo(() => shrinkflationAlerts(data, today), [data, today]);
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (!cards.length) return null;
  const repeat = cards.filter((card) => card.count > 1).length;
  const folded = foldRomanian(query.trim());
  const filtered = folded ? cards.filter((card) => foldRomanian(`${card.label} ${card.brand || ""}`).includes(folded)) : cards;
  const shown = showAll || folded ? filtered.slice(0, 60) : filtered.slice(0, 12);
  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
      <section className="bf-sub-board" aria-labelledby="bf-inflation-title">
        <div className="bf-section-heading">
          <div>
            <p className="bf-kicker">{t("INFLAȚIA TA")}</p>
            <h2 id="bf-inflation-title">{month && month.products > 0 ? t("{percent} în {month}", { percent: pct(month.percent), month: monthName(month.month) }) : t("Se calculează din bonurile tale")}</h2>
          </div>
          <TrendingUp size={20} aria-hidden="true" />
        </div>
        {month && month.products > 0 ? <>
          <p className="bf-helper">{t("Cât s-au scumpit cele {count} produse pe care le-ai cumpărat și luna asta, și în cele trei dinainte, ponderat după cât dai pe ele ({basket} lei luna asta).", { count: month.products, basket: lei(month.basket) })}</p>
          {month.risers.length > 0 && <div><b>{t("S-au scumpit cel mai mult")}</b><ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>{month.risers.slice(0, 3).map((row) => <li key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ overflowWrap: "anywhere" }}>{row.label}</span><Trend value={row.percent} /></li>)}</ul></div>}
          {month.categories.length > 0 && <p className="bf-helper" style={{ marginBottom: 0 }}>{t("Dai mai mult decât de obicei pe: {list}.", { list: month.categories.map((row) => `${t(row.category)} (${pct(row.percent)})`).join(", ") })}</p>}
        </> : <p className="bf-helper" style={{ marginBottom: 0 }}>{t("Urmăresc deja {count} produse din bonurile tale ({repeat} cumpărate de mai multe ori). De luna viitoare îți arăt aici cât s-au scumpit exact produsele pe care le cumperi tu, nu media țării.", { count: cards.length, repeat })}</p>}
      </section>

      {shrink.length > 0 && (
        <section className="bf-sub-board" aria-labelledby="bf-shrink-title">
          <div className="bf-section-heading"><div><p className="bf-kicker">{t("SHRINKFLATION")}</p><h2 id="bf-shrink-title">{t("Mai puțin în pachet, același preț")}</h2></div><PackageSearch size={20} aria-hidden="true" /></div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {shrink.slice(0, 5).map((alert) => <li key={`${alert.key}-${alert.date}`}><b>{alert.label}</b><br /><small>{t("{from} → {to} {per}, pachetul {before} → {after} lei: {percent} pe {per} ({vendor}, {date})", { from: alert.fromSize.toLocaleString("ro-RO"), to: alert.toSize.toLocaleString("ro-RO"), per: alert.per, before: lei(alert.fromPiece), after: lei(alert.toPiece), percent: pct(alert.perUnitPercent), vendor: alert.vendor, date: dateText(alert.date, true) })}</small></li>)}
          </ul>
        </section>
      )}

      <section className="bf-sub-board" aria-labelledby="bf-products-title">
        <div className="bf-section-heading"><div><p className="bf-kicker">{t("PRODUSELE TALE")}</p><h2 id="bf-products-title">{t("Prețul fiecăruia, în timp")}</h2></div><Search size={20} aria-hidden="true" /></div>
        <label className="bf-field" style={{ margin: "4px 0 6px" }}><span className="sr-only">{t("Caută un produs")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Caută: lapte, cafea, scutece…")} /></label>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {shown.map((card) => <ProductRow key={card.key} card={card} open={openKey === card.key} onToggle={() => setOpenKey((current) => current === card.key ? "" : card.key)} />)}
        </ul>
        {!folded && filtered.length > shown.length && <button type="button" className="bf-link-button" onClick={() => setShowAll(true)}>{t("Arată toate cele {count} produse", { count: Math.min(60, filtered.length) })}</button>}
        {folded && !filtered.length && <p className="bf-helper">{t("Niciun produs cu „{query}” în bonuri.", { query })}</p>}
      </section>
    </div>
  );
}
