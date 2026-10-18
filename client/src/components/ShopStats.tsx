import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isoToday, type AppData } from "@/lib/finance-data";
import { receiptsLabel, t } from "@/lib/i18n";
import { periodStats, type Grain } from "@/lib/shop-stats";
import { spendEntries } from "@/lib/quick-expense";

const lei = (v: number) => `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const GRAINS: Array<[Grain, string]> = [["day", "Zi"], ["week", "Săptămână"], ["month", "Lună"], ["year", "An"]];

/** Statistici pe Zi / Săptămână / Lună / An, cu navigare înapoi-înainte și grafic animat. */
export function ShopStats({ data }: { data: AppData }) {
  const [grain, setGrain] = useState<Grain>("month");
  const [offset, setOffset] = useState(0);
  // Bonurile și cheltuielile fără bon (taxi, cafea), fiecare cu categoria ei.
  const stats = useMemo(() => periodStats(spendEntries(data), grain, isoToday(), offset), [data, grain, offset]);
  const max = Math.max(1, ...stats.buckets.map((b) => b.total));
  const delta = stats.previous > 0 ? Math.round(((stats.total - stats.previous) / stats.previous) * 100) : undefined;
  const top = stats.categories.slice(0, 5);
  return <section className="sh-card bn-stats" aria-label={t("Statistici")}>
    <div className="sh-seg" role="group" aria-label={t("Perioada")}>{GRAINS.map(([id, label]) => <button key={id} type="button" aria-pressed={grain === id} onClick={() => { setGrain(id); setOffset(0); }}>{t(label)}</button>)}</div>
    <div className="bn-stats-nav"><button type="button" className="bn-icon-btn" aria-label={t("Perioada anterioară")} onClick={() => setOffset((o) => o - 1)}><ChevronLeft size={20} /></button><b>{stats.title}</b><button type="button" className="bn-icon-btn" aria-label={t("Perioada următoare")} disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}><ChevronRight size={20} /></button></div>
    <div className="bn-stats-total"><strong>{lei(stats.total)}</strong><small>{receiptsLabel(stats.count)}{delta !== undefined ? ` · ${delta >= 0 ? "+" : ""}${delta}% ${t("față de perioada trecută")}` : ""}</small></div>
    <div className={`bn-stats-chart is-${grain}`} role="img" aria-label={t("Cheltuieli pe {period}", { period: stats.title })} key={`${grain}${offset}`}>
      {stats.buckets.length ? stats.buckets.map((b, i) => <span key={b.key} title={`${b.label}: ${lei(b.total)}`}><i style={{ transform: `scaleY(${b.total / max})`, animationDelay: `${Math.min(i, 30) * 18}ms` }} />{(grain !== "month" || i % 5 === 0) && <small>{b.label}</small>}</span>) : <p className="sh-muted">{t("Niciun bon în ziua asta.")}</p>}
    </div>
    {top.length > 0 && <ul className="bn-stats-cats">{top.map((c) => <li key={c.category}><span>{t(c.category)}</span><i style={{ transform: `scaleX(${c.amount / top[0].amount})` }} /><b>{lei(c.amount)}</b></li>)}</ul>}
  </section>;
}

export default ShopStats;
