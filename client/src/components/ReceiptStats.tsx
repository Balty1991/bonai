import { useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, ScanLine, Store } from "lucide-react";
import { isoToday, type AppData } from "@/lib/finance-data";
import { periodStats, type Grain } from "@/lib/shop-stats";
import { CATEGORY_COLORS } from "@/lib/receipt-review-model";
import { receiptsLabel, t } from "@/lib/i18n";

const PERIODS: Array<[Grain, string]> = [
  ["week", "Săptămână"],
  ["month", "Lună"],
  ["year", "An"],
];
const lei = (value: number) => `${value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0lei`;
const fold = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ro-RO");

type CategoryPart = { category: string; amount: number; color: string };

export function ReceiptStats({ data, onScan }: { data: AppData; onScan: () => void }) {
  const [grain, setGrain] = useState<Grain>("month");
  const [offset, setOffset] = useState(0);
  const today = isoToday();
  const stats = useMemo(
    () => periodStats(data.receipts.filter((receipt) => receipt.amount > 0), grain, today, offset),
    [data.receipts, grain, today, offset],
  );
  const periodReceipts = useMemo(
    () => data.receipts.filter((receipt) => receipt.amount > 0 && receipt.date >= stats.from && receipt.date <= stats.to),
    [data.receipts, stats.from, stats.to],
  );
  const stores = useMemo(() => {
    const grouped = new Map<string, { vendor: string; amount: number; count: number }>();
    for (const receipt of periodReceipts) {
      const vendor = receipt.vendor.trim() || t("Magazin necunoscut");
      const key = fold(vendor);
      const item = grouped.get(key) || { vendor, amount: 0, count: 0 };
      item.amount += receipt.amount;
      item.count += 1;
      grouped.set(key, item);
    }
    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount).slice(0, 4);
  }, [periodReceipts]);

  const categoryTotal = stats.categories.reduce((sum, item) => sum + item.amount, 0);
  const categoryParts: CategoryPart[] = stats.categories.slice(0, 5).map((item, index) => ({
    category: item.category,
    amount: item.amount,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }));
  const rest = Math.max(0, categoryTotal - categoryParts.reduce((sum, item) => sum + item.amount, 0));
  if (rest > 0.01) categoryParts.push({ category: t("Altele"), amount: rest, color: "#9aa79a" });
  const ringStops: string[] = [];
  let cursor = 0;
  for (const part of categoryParts) {
    const next = cursor + (part.amount / Math.max(1, categoryTotal)) * 100;
    ringStops.push(`${part.color} ${cursor}% ${next}%`);
    cursor = next;
  }
  const ring = ringStops.length ? `conic-gradient(${ringStops.join(", ")})` : "var(--bn-soft)";
  const maxBucket = Math.max(1, ...stats.buckets.map((bucket) => bucket.total));
  const average = stats.count > 0 ? stats.total / stats.count : 0;
  const delta = stats.previous > 0 ? Math.round(((stats.total - stats.previous) / stats.previous) * 100) : undefined;
  const chartTitle = t("Cheltuielile pe bonuri în {period}", { period: stats.title });

  return <div className="sh-page bn-receipt-stats">
    <header className="sh-head">
      <p className="sh-kicker">{t("BONURILE TALE")}</p>
      <h1 className="sh-h1">{t("Statistici")}</h1>
      <p className="sh-muted">{t("Cheltuielile extrase din bonuri, pe perioade, categorii și magazine.")}</p>
    </header>

    <section className="sh-card bn-rs-period" aria-label={t("Alege perioada")}>
      <div className="sh-seg" role="group" aria-label={t("Perioada")}>{PERIODS.map(([id, label]) =>
        <button key={id} type="button" aria-pressed={grain === id} onClick={() => { setGrain(id); setOffset(0); }}>{t(label)}</button>,
      )}</div>
      <div className="bn-stats-nav">
        <button type="button" className="bn-icon-btn" aria-label={t("Perioada anterioară")} onClick={() => setOffset((value) => value - 1)}><ChevronLeft size={20} /></button>
        <b>{stats.title}</b>
        <button type="button" className="bn-icon-btn" aria-label={t("Perioada următoare")} disabled={offset >= 0} onClick={() => setOffset((value) => Math.min(0, value + 1))}><ChevronRight size={20} /></button>
      </div>
    </section>

    <section className="bn-rs-hero" aria-label={t("Totalul bonurilor din perioada aleasă")}>
      <span className="bn-rs-hero-kicker">{t("CHELTUIELI DIN BONURI")}</span>
      <strong>{lei(stats.total)}</strong>
      <div className="bn-rs-hero-meta">
        <span>{receiptsLabel(stats.count)}</span>
        {average > 0 && <span>{t("bonul mediu {amount}", { amount: lei(average) })}</span>}
      </div>
      {delta !== undefined
        ? <p className={`bn-rs-delta${delta < 0 ? " is-down" : delta > 0 ? " is-up" : ""}`}>{delta > 0 ? "+" : ""}{delta}% {t("față de perioada trecută")}</p>
        : <p className="bn-rs-delta">{stats.total > 0 ? t("Prima perioadă cu bonuri") : t("Din bonurile salvate în aplicație")}</p>}
    </section>

    <section className="sh-card bn-rs-chart-card">
      <div className="sh-card-head"><p className="sh-kicker">{t("EVOLUȚIE")}</p><BarChart3 size={18} aria-hidden="true" /></div>
      {stats.total > 0 ? <div className="bn-rs-chart" role="img" aria-label={chartTitle} key={`${grain}-${offset}`}>
        {stats.buckets.map((bucket, index) => {
          const visibleLabel = grain === "month" ? index % 5 === 0 || index === stats.buckets.length - 1
            : grain === "week" || grain === "year" ? true
              : stats.buckets.length <= 8 || index % Math.ceil(stats.buckets.length / 6) === 0;
          return <span className={bucket.total > 0 ? "has-value" : undefined} key={bucket.key} title={`${bucket.label}: ${lei(bucket.total)}`}>
            <i style={{ height: `${Math.max(bucket.total > 0 ? 4 : 0, bucket.total / maxBucket * 100)}%` }} />
            {visibleLabel && <small>{bucket.label}</small>}
          </span>;
        })}
      </div> : <p className="sh-muted bn-rs-empty-chart">{t("Nicio cheltuială din bonuri în perioada asta.")}</p>}
      <p className="sh-muted bn-rs-chart-note">{t("Fiecare bară arată suma bonurilor din ziua sau luna respectivă.")}</p>
    </section>

    {categoryParts.length > 0 && <section className="sh-card bn-rs-categories">
      <p className="sh-kicker">{t("PE CATEGORII")}</p>
      <div className="bn-rs-category-overview">
        <div className="bn-rs-ring" role="img" aria-label={t("Cheltuielile pe categorii, {period}", { period: stats.title })} style={{ background: ring }}>
          <span><b>{lei(categoryTotal)}</b><small>{t("pe bonuri")}</small></span>
        </div>
        <ul className="bn-rs-legend">{categoryParts.map((part) => <li key={part.category}>
          <i style={{ background: part.color }} aria-hidden="true" />
          <span>{t(part.category)}</span>
          <b>{Math.round(part.amount / Math.max(1, categoryTotal) * 100)}%</b>
        </li>)}</ul>
      </div>
      <ul className="bn-rs-category-list">{categoryParts.map((part) => <li key={part.category}>
        <span><i style={{ background: part.color }} aria-hidden="true" /><b>{t(part.category)}</b></span>
        <strong>{lei(part.amount)}</strong>
        <div><i style={{ width: `${Math.min(100, part.amount / Math.max(1, categoryTotal) * 100)}%`, background: part.color }} /></div>
      </li>)}</ul>
    </section>}

    {stores.length > 0 && <section className="sh-card bn-rs-stores">
      <p className="sh-kicker">{t("PE MAGAZINE")}</p>
      <ul className="bn-rs-store-list">{stores.map((store) => <li key={fold(store.vendor)}>
        <span className="bn-rs-store-icon" aria-hidden="true"><Store size={17} /></span>
        <span className="bn-rs-store-copy"><b>{store.vendor}</b><small>{receiptsLabel(store.count)}</small></span>
        <strong>{lei(store.amount)}</strong>
      </li>)}</ul>
    </section>}

    {data.receipts.length === 0 && <section className="sh-card bn-rs-empty">
      <span className="bn-rs-empty-icon" aria-hidden="true"><ScanLine size={22} /></span>
      <h2 className="sh-title">{t("Scanează primul bon")}</h2>
      <p className="sh-muted">{t("După ce salvezi bonuri, vezi aici totalurile, categoriile și evoluția cheltuielilor.")}</p>
      <button type="button" className="bn-btn is-primary" onClick={onScan}><ScanLine size={17} aria-hidden="true" /> {t("Scanează bonul")}</button>
    </section>}
  </div>;
}
