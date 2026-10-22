/**
 * Rapoarte: Săptămână / Lună / Trimestru / An, cu navigare înapoi. Cumpărăturile pe categorii,
 * produse și magazine; plățile fixe separat (rate, împrumuturi, abonamente, facturi); totalul.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { isoToday, type AppData } from "@/lib/finance-data";
import { buildReport, change, reportText, reportTitle, type FixedGroupId, type QuantityUnit, type ReportGrain, type ReportRow } from "@/lib/reports";
import { quickIcon } from "@/lib/quick-expense";
import { habitInsights } from "@/lib/habit-insights";
import { receiptsLabel, t } from "@/lib/i18n";

/** „12,4 kg”, „3,5 l”, „46 buc”, cu spațiu nedespărțitor. */
const qty = (v: number, unit: QuantityUnit) => `${v.toLocaleString("ro-RO", { maximumFractionDigits: unit === "buc" ? 0 : 1 })}\u00a0${unit}`;
const lei = (v: number) => `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0lei`;
const GRAINS: Array<[ReportGrain, string]> = [["day", "Zi"], ["week", "Săptămână"], ["month", "Lună"], ["quarter", "Trimestru"], ["year", "An"]];
const GROUP_LABEL: Record<FixedGroupId, string> = { rates: "Rate la produse", loans: "Împrumuturi și credite", bank: "Dobânzi și comisioane bancare", subscriptions: "Abonamente", bills: "Facturi și taxe" };
const PREVIOUS: Record<ReportGrain, string> = { day: "față de ziua dinainte", week: "față de săptămâna trecută", month: "față de luna trecută", quarter: "față de trimestrul trecut", year: "față de anul trecut" };

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  const value = change(now, before);
  if (value === undefined) return null;
  const up = value > 0;
  // La cheltuieli, mai mult e roșu; mai puțin e verde.
  return <small className={(up !== invert) ? "sh-up" : "sh-down"}>{up ? "+" : ""}{value}%</small>;
}

const DONUT_COLORS = ["#7c5cff", "#2ec5d3", "#ff6fa8", "#ffb547", "#4ad991", "#8a94a6"];

/** Inelul categoriilor: primele 5 și „restul”, cu totalul în mijloc; segmentele se desenează pe rând. */
function Donut({ rows, total, label }: { rows: ReportRow[]; total: number; label: string }) {
  const top = rows.slice(0, 5);
  const rest = Math.max(0, total - top.reduce((sum, row) => sum + row.amount, 0));
  const parts = [...top.map((row) => ({ key: row.key, label: t(row.label), amount: row.amount })), ...(rest > 0.5 ? [{ key: "rest", label: t("Altele"), amount: rest }] : [])];
  const c = 2 * Math.PI * 40;
  let offset = 0;
  return <div className="bn-donut">
    <svg viewBox="0 0 100 100" role="img" aria-label={label}>
      <circle cx="50" cy="50" r="40" className="bn-donut-track" />
      {parts.map((part, index) => { const len = (part.amount / Math.max(1, total)) * c; const el = <circle key={part.key} cx="50" cy="50" r="40" className="bn-donut-seg" stroke={DONUT_COLORS[index % DONUT_COLORS.length]} strokeDasharray={`${Math.max(0, len - 1.2)} ${c}`} strokeDashoffset={-offset} style={{ animationDelay: `${index * 90}ms` }} />; offset += len; return el; })}
      <text x="50" y="48" textAnchor="middle" className="bn-donut-big">{Math.round(total).toLocaleString("ro-RO")}</text>
      <text x="50" y="61" textAnchor="middle" className="bn-donut-small">lei</text>
    </svg>
    <ul className="bn-donut-legend">{parts.map((part, index) => <li key={part.key}><i style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} aria-hidden="true" /><span>{part.label}</span><b>{Math.round((part.amount / Math.max(1, total)) * 100)}%</b></li>)}</ul>
  </div>;
}

function Rows({ rows, limit, icon }: { rows: Array<ReportRow & { extra?: string }>; limit: number; icon?: (label: string) => string }) {
  const [all, setAll] = useState(false);
  // O categorie apăsată își arată produsele cumpărate în perioada raportului.
  const [open, setOpen] = useState<string>();
  const shown = all ? rows : rows.slice(0, limit);
  const max = Math.max(1, ...rows.map((row) => row.amount));
  const head = (row: ReportRow & { extra?: string }) => <>
    <span><b>{icon ? `${icon(row.label)} ` : ""}{t(row.label)}</b><small>{row.extra || (row.count === 1 ? t("o dată") : t("{count} ori", { count: row.count }))}</small><i aria-hidden="true" style={{ transform: `scaleX(${row.amount / max})` }} /></span>
    <b>{lei(row.amount)}<Delta now={row.amount} before={row.previous} /></b>
  </>;
  return <>
    <ul className="sh-list bn-report-rows">{shown.map((row) => <li key={row.key} className={row.items?.length ? "has-items" : undefined}>
      {row.items?.length ? <button type="button" className="bn-report-row-btn" aria-expanded={open === row.key} onClick={() => setOpen(open === row.key ? undefined : row.key)}>{head(row)}<ChevronDown size={16} aria-hidden="true" className="bn-report-chev" style={{ transform: open === row.key ? "rotate(180deg)" : undefined }} /></button> : head(row)}
      {open === row.key && row.items && <ul className="bn-report-items" aria-label={t("Ce ai luat la {category}", { category: t(row.label) })}>{row.items.slice(0, 30).map((item) => <li key={item.label}>
        <span>{item.label === "Rând fără nume" ? t(item.label) : item.label}{item.count > 1 && <small> · {t("{count} ori", { count: item.count })}</small>}</span><b>{lei(item.amount)}</b>
      </li>)}{row.items.length > 30 && <li className="sh-muted">{t("și încă {count}", { count: row.items.length - 30 })}</li>}</ul>}
    </li>)}</ul>
    {rows.length > limit && <button type="button" className="sh-link" aria-expanded={all} onClick={() => setAll(!all)}>{all ? t("Arată mai puțin") : t("Vezi toate ({count})", { count: rows.length })} <ChevronDown size={16} aria-hidden="true" style={{ transform: all ? "rotate(180deg)" : undefined }} /></button>}
  </>;
}

export function ShopReports({ data }: { data: AppData }) {
  const [grain, setGrain] = useState<ReportGrain>("month");
  const [offset, setOffset] = useState(0);
  const [openGroup, setOpenGroup] = useState<FixedGroupId | "">("");
  const [unit, setUnit] = useState<QuantityUnit>("kg");
  const today = isoToday();
  const report = useMemo(() => buildReport(data, grain, today, offset), [data, grain, today, offset]);
  const title = reportTitle(grain, report.from, report.to);
  const max = Math.max(1, ...report.buckets.map((b) => b.total));
  const share = async () => {
    const text = reportText(report, title, { shopping: t("Cumpărături"), fixed: t("Plăți fixe"), total: t("Total cheltuit"), categories: t("Pe categorii"), products: t("Produsele pe care s-au dus cei mai mulți bani"), groups: { rates: t(GROUP_LABEL.rates), loans: t(GROUP_LABEL.loans), bank: t(GROUP_LABEL.bank), subscriptions: t(GROUP_LABEL.subscriptions), bills: t(GROUP_LABEL.bills) } }, lei);
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* anulat */ }
    try { await navigator.clipboard.writeText(text); } catch { /* fără clipboard */ }
  };
  const empty = report.shopping.total === 0 && report.fixed.total === 0;
  // Unitatea arătată: cea aleasă dacă are ceva în perioada asta, altfel prima care are.
  const shownUnit: QuantityUnit = report.quantity[unit].total > 0 ? unit : (["kg", "l", "buc"] as QuantityUnit[]).find((id) => report.quantity[id].total > 0) || unit;
  const insights = useMemo(() => habitInsights(data, today), [data, today]);
  return <div className="bn-report">
    <section className="sh-card">
      <div className="sh-seg" role="group" aria-label={t("Perioada")}>{GRAINS.map(([id, label]) => <button key={id} type="button" aria-pressed={grain === id} onClick={() => { setGrain(id); setOffset(0); }}>{t(label)}</button>)}</div>
      <div className="bn-stats-nav"><button type="button" className="bn-icon-btn" aria-label={t("Perioada anterioară")} onClick={() => setOffset((o) => o - 1)}><ChevronLeft size={20} /></button><b>{title}</b><button type="button" className="bn-icon-btn" aria-label={t("Perioada următoare")} disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}><ChevronRight size={20} /></button></div>
      <div className="bn-report-sum">
        <span><small>{t("Cumpărături")}</small><b>{lei(report.shopping.total)}</b><Delta now={report.shopping.total} before={report.shopping.previous} /></span>
        <span><small>{t("Plăți fixe")}</small><b>{lei(report.fixed.total)}</b><Delta now={report.fixed.total} before={report.fixed.previous} /></span>
        <span className="is-total"><small>{t("Total cheltuit")}</small><b>{lei(report.total)}</b></span>
      </div>
      <p className="sh-muted bn-report-meta">{[receiptsLabel(report.shopping.receipts), report.shopping.loose ? t("{count} fără bon", { count: report.shopping.loose }) : "", report.shopping.total > 0 ? t("{amount} pe zi", { amount: lei(report.shopping.perDay) }) : "", report.shopping.perReceipt > 0 ? t("bonul mediu {amount}", { amount: lei(report.shopping.perReceipt) }) : ""].filter(Boolean).join(" · ")}{report.shopping.previous > 0 ? ` · ${t(PREVIOUS[grain])}: ${lei(report.shopping.previous)}` : ""}</p>
      {report.shopping.total > 0 && report.buckets.length > 0 && <div className={`bn-stats-chart is-${grain === "quarter" ? "week" : grain}`} role="img" aria-label={t("Cumpărături pe {period}", { period: title })} key={`${grain}${offset}`}>
        {report.buckets.map((b, i) => <span key={b.key} title={`${b.label}: ${lei(b.total)}`}><i style={{ transform: `scaleY(${b.total / max})`, animationDelay: `${Math.min(i, 30) * 18}ms` }} />{(grain !== "month" || i % 5 === 0) && <small>{b.label}</small>}</span>)}
      </div>}
      {empty && <p className="sh-muted">{t("Nimic notat în perioada asta. Scanează bonuri sau mergi înapoi cu săgeata.")}</p>}
      {!empty && <button type="button" className="sh-link" onClick={() => void share()}><Share2 size={16} aria-hidden="true" /> {t("Trimite raportul")}</button>}
    </section>

    {insights.length > 0 && offset === 0 && <section className="sh-card"><p className="sh-kicker">{t("OBSERVAȚII · ASISTENTUL TĂU")}</p>
      <ul className="bn-insights is-static">{insights.map((item) => <li key={item.id}><div><span className="bn-insight-icon" aria-hidden="true">{item.icon}</span><span><b>{item.title}</b><small>{item.body}</small></span></div></li>)}</ul>
    </section>}

    {report.categories.length > 0 && <section className="sh-card"><p className="sh-kicker">{t("PE CATEGORII")}</p>{report.categories.length > 1 && <Donut rows={report.categories} total={report.categories.reduce((sum, row) => sum + row.amount, 0)} label={t("Cumpărăturile pe categorii, {period}", { period: title })} />}<Rows rows={report.categories} limit={6} icon={quickIcon} /></section>}

    {report.products.length > 0 && <section className="sh-card"><p className="sh-kicker">{t("PE PRODUSE")}</p><h2 className="sh-title">{t("Unde s-au dus banii la cumpărături")}</h2>
      <Rows rows={report.products.map((row) => ({ ...row, extra: `${row.count === 1 ? t("o cumpărare") : t("{count} cumpărări", { count: row.count })} · ${t("~{price} lei/{per}", { price: row.avgPrice.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), per: row.per === "buc" ? t("buc") : row.per })}` }))} limit={8} />
    </section>}

    {(report.quantity.kg.total > 0 || report.quantity.l.total > 0 || report.quantity.buc.total > 0) && <section className="sh-card"><p className="sh-kicker">{t("CANTITATE")}</p><h2 className="sh-title">{t("Cât ai luat, nu doar cât ai dat")}</h2>
      <div className="sh-seg" role="group" aria-label={t("Unitatea")}>{(["kg", "l", "buc"] as QuantityUnit[]).map((id) => <button key={id} type="button" aria-pressed={shownUnit === id} disabled={!(report.quantity[id].total > 0)} onClick={() => setUnit(id)}>{`${qty(report.quantity[id].total, id)}`}</button>)}</div>
      {report.quantity[shownUnit].top.length > 0 ? <ul className="sh-list bn-report-rows">{report.quantity[shownUnit].top.map((row) => <li key={row.key}><span><b>{row.label}</b></span><b>{qty(row.amount, shownUnit)}</b></li>)}</ul>
        : <p className="sh-muted">{t("Nimic în {unit} în perioada asta.", { unit: shownUnit === "buc" ? t("bucăți") : shownUnit === "l" ? t("litri") : t("kilograme") })}</p>}
      <p className="sh-muted sh-note">{t("Din gramajul de pe bon sau din cântar; produsele fără gramaj se numără la bucată.")}</p>
    </section>}

    {report.stores.length > 0 && <section className="sh-card"><p className="sh-kicker">{t("PE MAGAZINE")}</p><Rows rows={report.stores.map((row) => ({ ...row, extra: row.count === 1 ? t("o vizită") : t("{count} vizite", { count: row.count }) }))} limit={6} /></section>}

    {report.fixed.groups.length > 0 && <section className="sh-card"><p className="sh-kicker">{t("PLĂȚI FIXE · SEPARAT DE CUMPĂRĂTURI")}</p><h2 className="sh-title">{lei(report.fixed.total)}</h2>
      <ul className="sh-list bn-report-rows">{report.fixed.groups.map((group) => <li key={group.id} className="bn-report-group">
        <button type="button" aria-expanded={openGroup === group.id} onClick={() => setOpenGroup(openGroup === group.id ? "" : group.id)}>
          <span><b>{t(GROUP_LABEL[group.id])}</b><small>{group.items.length === 1 ? t("o plată") : t("{count} plăți", { count: group.items.length })}</small></span>
          <b>{lei(group.total)}<Delta now={group.total} before={group.previous} /></b>
        </button>
        {openGroup === group.id && <ul className="bn-report-items">{group.items.map((item) => <li key={item.id}><span>{item.title}</span><b>{lei(item.amount)}</b></li>)}</ul>}
      </li>)}</ul>
    </section>}
  </div>;
}

export default ShopReports;
