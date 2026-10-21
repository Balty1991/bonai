/**
 * Scadențarul: calendarul lunii cu fiecare plată în ziua ei (rate, credite, dobânzi și comisioane
 * bancare, abonamente, facturi), inelul „plătit din total”, săptămânile și lista zilei alese.
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { isoToday, type AppData } from "@/lib/finance-data";
import { paymentCalendar, shiftMonth, type CalendarKind } from "@/lib/payment-calendar";
import { t } from "@/lib/i18n";

const lei = (v: number) => `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const short = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}k` : Math.round(v).toLocaleString("ro-RO"));
const KIND_LABEL: Record<CalendarKind, string> = { debt: "Rată / credit", bank: "Dobândă, comision", sub: "Abonament", bill: "Factură" };
const WEEKDAYS = ["L", "Ma", "Mi", "J", "V", "S", "D"];

function Ring({ value, label }: { value: number; label: string }) {
  const c = 2 * Math.PI * 42;
  return <svg className="bn-ring" viewBox="0 0 100 100" role="img" aria-label={label}>
    <circle cx="50" cy="50" r="42" className="bn-ring-track" />
    <circle cx="50" cy="50" r="42" className="bn-ring-fill" strokeDasharray={`${c * Math.min(1, Math.max(0, value))} ${c}`} />
    <text x="50" y="47" textAnchor="middle" className="bn-ring-big">{Math.round(value * 100)}%</text>
    <text x="50" y="63" textAnchor="middle" className="bn-ring-small">{t("plătit")}</text>
  </svg>;
}

export function PaymentCalendar({ data, onClose, onOpen }: { data: AppData; onClose: () => void; onOpen?: (kind: "debts" | "sub" | "bill") => void }) {
  const today = isoToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const cal = useMemo(() => paymentCalendar(data, month), [data, month]);
  const [picked, setPicked] = useState<string>();
  const selected = cal.days.find((day) => day.date === picked) || cal.days.find((day) => day.date >= today && day.payments.length) || cal.days.find((day) => day.payments.length);
  const max = Math.max(1, ...cal.days.map((day) => day.total));
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const title = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("ro-RO", { month: "long", year: "numeric", timeZone: "UTC" });
  const lead = cal.days[0]?.weekday || 0;
  return createPortal(<div ref={trapRef} tabIndex={-1} className="bn-costs bn-cal" role="dialog" aria-modal="true" aria-label={t("Scadențar")}>
    <header className="bn-costs-head"><button type="button" className="bn-icon-btn" aria-label={t("Înapoi")} onClick={onClose}><ArrowLeft size={20} /></button><b>{t("Scadențar")}</b><span /></header>
    <div className="bn-costs-body">
      <section className="bn-cal-hero">
        <Ring value={cal.total > 0 ? cal.paid / cal.total : 0} label={t("{paid} plătit din {total}", { paid: lei(cal.paid), total: lei(cal.total) })} />
        <div>
          <div className="bn-stats-nav"><button type="button" className="bn-icon-btn" aria-label={t("Luna anterioară")} onClick={() => { setMonth(shiftMonth(month, -1)); setPicked(undefined); }}><ChevronLeft size={20} /></button><b>{title}</b><button type="button" className="bn-icon-btn" aria-label={t("Luna următoare")} disabled={month >= shiftMonth(today.slice(0, 7), 11)} onClick={() => { setMonth(shiftMonth(month, 1)); setPicked(undefined); }}><ChevronRight size={20} /></button></div>
          <p><small>{t("De plătit în luna asta")}</small><strong>{lei(cal.total)}</strong></p>
          <p className="bn-cal-split"><span className="is-paid">{t("plătit {amount}", { amount: lei(cal.paid) })}</span><span>{t("mai ai {amount}", { amount: lei(cal.left) })}</span></p>
        </div>
      </section>

      <section className="bn-cal-grid" aria-label={t("Calendarul lunii")}>
        {WEEKDAYS.map((day) => <span key={day} className="bn-cal-wd" aria-hidden="true">{t(day)}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} aria-hidden="true" />)}
        {cal.days.map((day) => {
          const kinds = Array.from(new Set(day.payments.map((item) => item.kind)));
          const allPaid = day.payments.length > 0 && day.payments.every((item) => item.paid);
          return <button key={day.date} type="button" className={["bn-cal-day", day.date === today ? "is-today" : "", day.date === selected?.date ? "is-picked" : "", day.payments.length ? "has-pay" : "", allPaid ? "is-paid" : "", day.date < today && !allPaid && day.payments.length ? "is-late" : ""].filter(Boolean).join(" ")} aria-pressed={day.date === selected?.date} aria-label={day.payments.length ? t("{day}: {count} plăți, {amount}", { day: day.day, count: day.payments.length, amount: lei(day.total) }) : String(day.day)} onClick={() => setPicked(day.date)}>
            <b>{day.day}</b>
            {day.total > 0 && <i className="bn-cal-heat" aria-hidden="true" style={{ opacity: 0.18 + 0.6 * (day.total / max) }} />}
            {day.total > 0 && <small>{short(day.total)}</small>}
            {kinds.length > 0 && <span className="bn-cal-dots" aria-hidden="true">{kinds.map((kind) => <em key={kind} className={`is-${kind}`} />)}</span>}
          </button>;
        })}
      </section>
      <p className="bn-cal-legend" aria-hidden="true">{(Object.keys(KIND_LABEL) as CalendarKind[]).map((kind) => <span key={kind}><em className={`is-${kind}`} />{t(KIND_LABEL[kind])}</span>)}</p>

      {selected && <section className="sh-card bn-cal-dayview">
        <p className="sh-kicker">{new Date(`${selected.date}T12:00:00Z`).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).toLocaleUpperCase("ro-RO")}</p>
        {selected.payments.length ? <ul className="bn-cal-list">{selected.payments.map((item) => <li key={item.id} className={`is-${item.kind}${item.paid ? " is-paid" : ""}`}>
          <button type="button" onClick={() => onOpen?.(item.kind === "debt" || item.kind === "bank" ? "debts" : item.kind)}>
            <span className="bn-cal-mark" aria-hidden="true">{item.paid ? <Check size={14} /> : null}</span>
            <span><b>{item.name}</b><small>{t(KIND_LABEL[item.kind])}{item.paid ? ` · ${t("plătit")}` : item.date < today ? ` · ${t("întârziată?")}` : ""}</small></span>
            <b>{item.estimate ? "~" : ""}{lei(item.amount)}</b>
          </button>
        </li>)}</ul> : <p className="sh-muted">{t("Nicio plată în ziua asta.")}</p>}
      </section>}

      {cal.weeks.some((week) => week.total > 0) && <section className="sh-card">
        <p className="sh-kicker">{t("PE SĂPTĂMÂNI")}</p>
        <div className="bn-cal-weeks">{cal.weeks.map((week) => { const top = Math.max(1, ...cal.weeks.map((item) => item.total)); return <div key={week.from}>
          <span>{`${Number(week.from.slice(8))}–${Number(week.to.slice(8))}`}</span>
          <i><em style={{ transform: `scaleX(${week.total / top})` }} /></i>
          <b>{week.total > 0 ? lei(week.total) : "—"}</b>
        </div>; })}</div>
        {cal.busiest && <p className="sh-muted sh-note">{t("Cea mai încărcată zi: {day}, cu {amount}. Ține banii pe card cu o zi înainte.", { day: new Date(`${cal.busiest.date}T12:00:00Z`).toLocaleDateString("ro-RO", { day: "numeric", month: "long", timeZone: "UTC" }), amount: lei(cal.busiest.total) })}</p>}
      </section>}
      {!cal.payments.length && <p className="sh-muted">{t("Nicio plată notată în luna asta. Adaugă rate în Datorii sau abonamente și facturi în Cont.")}</p>}
    </div>
  </div>, document.body);
}

export default PaymentCalendar;
