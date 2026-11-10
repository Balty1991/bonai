import { useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, ScanLine, Store, X } from "lucide-react";
import { isoToday, type AppData } from "@/lib/finance-data";
import { filterReceiptStatsData, periodStats, receiptStoreKey, type Grain } from "@/lib/shop-stats";
import { CATEGORY_COLORS } from "@/lib/receipt-review-model";
import { receiptsLabel, t } from "@/lib/i18n";

const PERIODS: Array<[Grain, string]> = [
  ["week", "Săptămână"],
  ["month", "Lună"],
  ["year", "An"],
];
const lei = (value: number) => `${value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0lei`;

type CategoryPart = { category: string; amount: number; color: string };
type StorePart = { key: string; vendor: string; amount: number; count: number };

export function ReceiptStats({ data, onScan }: { data: AppData; onScan: () => void }) {
  const [grain, setGrain] = useState<Grain>("month");
  const [offset, setOffset] = useState(0);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const today = isoToday();
  const selectedCategories = selectedCategory ? [selectedCategory] : undefined;
  const filteredReceipts = useMemo(
    () => filterReceiptStatsData(data.receipts, { storeKey: selectedStore ?? undefined, categories: selectedCategories }),
    [data.receipts, selectedStore, selectedCategory],
  );
  const stats = useMemo(
    () => periodStats(filteredReceipts, grain, today, offset),
    [filteredReceipts, grain, today, offset],
  );
  const categoryReceipts = useMemo(
    () => filterReceiptStatsData(data.receipts, { storeKey: selectedStore ?? undefined }),
    [data.receipts, selectedStore],
  );
  const categoryStats = useMemo(
    () => periodStats(categoryReceipts, grain, today, offset),
    [categoryReceipts, grain, today, offset],
  );
  const categoryTotal = categoryStats.categories.reduce((sum, item) => sum + item.amount, 0);
  const categoryParts: CategoryPart[] = categoryStats.categories.map((item, index) => ({
    category: item.category,
    amount: item.amount,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }));
  const ringStops: string[] = [];
  let cursor = 0;
  for (const part of categoryParts) {
    const next = cursor + (part.amount / Math.max(1, categoryTotal)) * 100;
    ringStops.push(`${part.color} ${cursor}% ${next}%`);
    cursor = next;
  }
  const ring = ringStops.length ? `conic-gradient(${ringStops.join(", ")})` : "var(--bn-soft)";
  const storeReceipts = useMemo(
    () => filterReceiptStatsData(data.receipts, { categories: selectedCategories }),
    [data.receipts, selectedCategory],
  );
  const storeParts = useMemo(() => {
    const grouped = new Map<string, StorePart>();
    for (const receipt of storeReceipts) {
      if (receipt.date < stats.from || receipt.date > stats.to) continue;
      const key = receiptStoreKey(receipt.vendor);
      const vendor = receipt.vendor.trim() || t("Magazin necunoscut");
      const item = grouped.get(key) || { key, vendor, amount: 0, count: 0 };
      item.amount += receipt.amount;
      item.count += 1;
      grouped.set(key, item);
    }
    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
  }, [storeReceipts, stats.from, stats.to]);
  const maxBucket = Math.max(1, ...stats.buckets.map((bucket) => bucket.total));
  const maxStore = Math.max(1, ...storeParts.map((store) => store.amount));
  const average = stats.count > 0 ? stats.total / stats.count : 0;
  const delta = stats.previous > 0 ? Math.round(((stats.total - stats.previous) / stats.previous) * 100) : undefined;
  const chartTitle = t("Cheltuielile pe bonuri în {period}", { period: stats.title });
  const selectedStoreLabel = selectedStore
    ? data.receipts.find((receipt) => receiptStoreKey(receipt.vendor) === selectedStore)?.vendor.trim() || t("Magazin necunoscut")
    : "";
  const toggleCategory = (category: string) => setSelectedCategory((current) => current === category ? null : category);

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

    {(selectedStore || selectedCategory) && <div className="bn-rs-active-filters" aria-label={t("Filtre active")}>
      <span className="bn-rs-filter-label">{t("Filtre active")}</span>
      {selectedStore && <button type="button" className="bn-rs-filter-chip" aria-label={t("Elimină filtrul pentru magazinul {store}", { store: selectedStoreLabel })} onClick={() => setSelectedStore(null)}>
        <span>{t("Magazin: {store}", { store: selectedStoreLabel })}</span><X size={14} aria-hidden="true" />
      </button>}
      {selectedCategory && <button type="button" className="bn-rs-filter-chip" aria-label={t("Elimină filtrul pentru categoria {category}", { category: t(selectedCategory) })} onClick={() => setSelectedCategory(null)}>
        <span>{t("Categorie: {category}", { category: t(selectedCategory) })}</span><X size={14} aria-hidden="true" />
      </button>}
      <button type="button" className="bn-rs-clear-filters" onClick={() => { setSelectedStore(null); setSelectedCategory(null); }}>{t("Șterge filtrele")}</button>
    </div>}

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
      <div className="bn-rs-section-heading"><p className="sh-kicker">{t("PE CATEGORII")}</p><span>{t("Atinge o categorie pentru a filtra.")}</span></div>
      <div className="bn-rs-category-overview">
        <div className="bn-rs-ring" role="img" aria-label={t("Cheltuielile pe categorii, {period}", { period: stats.title })} style={{ background: ring }}>
          <span><b>{lei(categoryTotal)}</b><small>{t("pe bonuri")}</small></span>
        </div>
        <ul className="bn-rs-legend" aria-label={t("Filtrează după categorie")}>{categoryParts.map((part) => <li key={part.category}>
          <button type="button" className="bn-rs-category-toggle" aria-pressed={selectedCategory === part.category} aria-label={t("Filtrează după categoria {category}", { category: t(part.category) })} onClick={() => toggleCategory(part.category)}>
            <i style={{ background: part.color }} aria-hidden="true" />
            <span>{t(part.category)}</span>
            <b>{Math.round(part.amount / Math.max(1, categoryTotal) * 100)}%</b>
          </button>
        </li>)}</ul>
      </div>
      <ul className="bn-rs-category-list" aria-label={t("Filtrează după categorie")}>{categoryParts.map((part) => <li key={part.category}>
        <button type="button" className="bn-rs-category-bar" aria-pressed={selectedCategory === part.category} aria-label={t("Filtrează după categoria {category}", { category: t(part.category) })} onClick={() => toggleCategory(part.category)}>
          <span><i style={{ background: part.color }} aria-hidden="true" /><b>{t(part.category)}</b></span>
          <strong>{lei(part.amount)}</strong>
          <span className="bn-rs-category-track" aria-hidden="true"><i style={{ width: `${Math.min(100, part.amount / Math.max(1, categoryTotal) * 100)}%`, background: part.color }} /></span>
        </button>
      </li>)}</ul>
    </section>}

    {storeParts.length > 0 && <section className="sh-card bn-rs-stores">
      <div className="bn-rs-section-heading"><p className="sh-kicker">{t("PE MAGAZINE")}</p><span>{t("Atinge un magazin pentru a filtra.")}</span></div>
      <ul className="bn-rs-store-list" aria-label={t("Filtrează după magazin")}>{storeParts.map((store) => <li key={store.key}>
        <button type="button" className="bn-rs-store-button" aria-pressed={selectedStore === store.key} aria-label={t("Filtrează după magazinul {store}", { store: store.vendor })} onClick={() => setSelectedStore((current) => current === store.key ? null : store.key)}>
          <span className="bn-rs-store-icon" aria-hidden="true"><Store size={17} /></span>
          <span className="bn-rs-store-copy"><b>{store.vendor}</b><small>{receiptsLabel(store.count)}</small><span className="bn-rs-store-track" aria-hidden="true"><i style={{ width: `${Math.min(100, store.amount / maxStore * 100)}%` }} /></span></span>
          <strong>{lei(store.amount)}</strong>
        </button>
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
