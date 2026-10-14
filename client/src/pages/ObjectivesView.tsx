/**
 * Ecranul Obligații. Se încarcă singur, fără Setări, Sync sau bon.
 */
import { BillsToMonthly } from "@/components/BillsToMonthly";
import { nextNeedDue } from "@/lib/cashflow-projection";
import "../objective-edit.css";
import "../mobile-obligations-pass.css";
import { useState } from "react";
import { BellRing, Bot, CalendarClock, CalendarDays, Check, ChevronRight, Gift, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { addIsoDays, nextDebtDue, allocationStatus, debtPaymentHistory, isoDate, isoToday, newId, pendingRecurringInPlan, type AppData, type Debt, type RecurringPayment, type SavingsGoal } from "@/lib/finance-data";
import { dateText, money } from "@/pages/home-kit";
import { amortize, buildDebtSchedule, monthAfter, orderDebts, payoffPlan, recommendedStrategy, type DebtScheduleRow, type PayoffStrategy } from "@/lib/debt-plan";
import { getLocale, monthsLabel, t } from "@/lib/i18n";
import { PaidCheck } from "@/components/PaidCheck";
import { detectSubscriptions, monthTitle, recurringFromDetection, recurringPriceChanges, savingsSuggestion } from "@/lib/household-insights";
import { safeSetItem } from "@/lib/safe-storage";
import { emergencyFund } from "@/lib/emergency-fund";

/** Comercianții pe care omul a spus că nu-s abonamente: rămân pe telefon, nu-i mai propunem. */
const DISMISSED_HITS = "buget-familie:subscription-dismissed";
/** Toate plățile active care se repetă (abonamente, facturi), aduse la lună: anualul împărțit la 12. */
const subscriptionSpendAll = (data: AppData) => { const monthly = data.recurring.filter((item) => item.active).reduce((sum, item) => sum + (item.frequency === "yearly" ? item.amount / 12 : item.frequency === "quarterly" ? item.amount / 3 : item.amount), 0); return { monthly: Math.round(monthly * 100) / 100, yearly: Math.round(monthly * 1200) / 100 }; };
import { daysBetween, upcomingPlannedEvents } from "@/lib/planned-events";
import { activeNeeds, reserveOf } from "@/lib/monthly-needs";

export function DebtPaymentHistory({ data, debt }: { data: AppData; debt: Debt }) { const history = debtPaymentHistory(data, debt.id); if (!history.length) return <p className="bf-debt-history empty">{t("Nu există încă plăți confirmate pentru această datorie.")}</p>; return <div className="bf-debt-history"><p>{t("PLĂȚI ÎNREGISTRATE")}</p>{history.slice(0, 4).map((payment) => <div key={payment.id}><span><b>{payment.title.includes("achitată integral") ? t("Achitată integral") : t("Plată parțială")}</b><small>{dateText(payment.date, true)} · {payment.source}</small></span><span><strong>{money(payment.amount)}</strong><small>{t("rămân {amount}", { amount: money(payment.debtRemainingAfter ?? debt.remaining) })}</small></span></div>)}</div>; }

function debtScheduleRows(data: AppData, debt: Debt) {
  return buildDebtSchedule({ monthly: debt.monthly, remaining: debt.remaining, annualRate: debt.annualRate, dueDate: debt.dueDate, payments: debtPaymentHistory(data, debt.id) });
}
function scheduleDetail(row: DebtScheduleRow) {
  if (row.status === "partial") return t("{paid} / {planned} plătiți · mai lipsesc {rest}", { paid: money(row.paidAmount), planned: money(row.planned), rest: money(row.remainingAmount) });
  if (row.status === "overpaid") return t("plătit {paid}, peste rata de {planned}", { paid: money(row.paidAmount), planned: money(row.planned) });
  if (row.status === "paid" && row.paidOn) return t(" · plătită la ") + dateText(row.paidOn, true);
  if (row.interest) return t(" · din care dobândă {amount}", { amount: money(row.interest) });
  return t(" · neplătită");
}
function DebtSchedule({ data, debt, onPay }: { data: AppData; debt: Debt; onPay: () => void }) {
  const { rows, plan, futureCapped } = debtScheduleRows(data, debt);
  const [expanded, setExpanded] = useState(false);
  if (!debt.monthly) return null;
  if (plan.months === null) return <div className="bf-debt-schedule"><p className="bf-form-error" role="alert">{t("Rata de {monthly} nu acoperă nici dobânda lunară: datoria crește. Mărește rata sau vorbește cu creditorul.", { monthly: money(debt.monthly) })}</p></div>;
  if (!rows.length) return null;
  const visible = expanded ? rows : rows.slice(0, 6);
  const paidCount = rows.filter((row) => row.status === "paid" || row.status === "overpaid").length;
  return <div className="bf-debt-schedule"><div className="bf-debt-schedule-head"><div><p>{futureCapped ? t("PRIMELE 120 DE RATE") : t("SCADENȚAR COMPLET")}</p><b>{t("{paid} din {total} rate bifate", { paid: paidCount, total: rows.length })}</b>{plan.totalInterest > 0 && <small>{t("Dobândă de plătit până la final: {amount}", { amount: money(plan.totalInterest) })}</small>}</div><span>{t("{amount} rămas", { amount: money(debt.remaining) })}</span></div>{futureCapped ? <small>{t("După aceste 120 de rate mai sunt luni. Lista se oprește aici ca să rămână ușoară.")}</small> : null}<div className="bf-debt-schedule-list">{visible.map((row) => <div className={"bf-debt-schedule-row " + (row.status === "paid" || row.status === "overpaid" ? "paid" : row.status === "partial" ? "partial" : "")} key={`${row.index}-${row.date}`}><button type="button" className="bf-schedule-check" aria-label={row.status === "paid" || row.status === "overpaid" ? "Rata " + row.index + t(" achitată") : t("Confirmă rata ") + row.index} onClick={row.status === "paid" || row.status === "overpaid" ? undefined : onPay}>{row.status === "paid" || row.status === "overpaid" ? <Check size={15} /> : <span />}</button><span><b>Rata {String(row.index).padStart(2, "0")}</b><small>{dateText(row.date, true)}{scheduleDetail(row)}</small></span><strong>{money(row.status === "unpaid" ? row.planned : row.paidAmount)}</strong></div>)}</div>{rows.length > 6 && <button type="button" className="bf-schedule-more" onClick={() => setExpanded((value) => !value)}>{expanded ? t("Arată mai puține") : t("Arată toate cele ") + rows.length + " rate"}</button>}</div>;
}
const monthYear = (date: Date) => new Intl.DateTimeFormat(getLocale(), { month: "long", year: "numeric" }).format(date);

/** Soldul total al datoriilor lună de lună: linia fără bani în plus și linia cu banii în plus. */
function PayoffChart({ base, withExtra }: { base: number[]; withExtra: number[] }) {
  const months = Math.max(base.length, withExtra.length) - 1;
  if (months < 2 || !base[0]) return null;
  const W = 300; const H = 90; const P = 6;
  const x = (index: number) => P + index / months * (W - P * 2);
  const y = (value: number) => P + (1 - value / base[0]) * (H - P * 2);
  const line = (values: number[]) => values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  return <figure className="bf-payoff-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Datoriile scad la zero în {base} luni fără bani în plus și în {extra} cu ei.", { base: base.length - 1, extra: withExtra.length - 1 })}>
      <line className="zero" x1={P} x2={W - P} y1={y(0)} y2={y(0)} />
      <polyline className="base" points={line(base)} />
      <polyline className="extra" points={line(withExtra)} />
    </svg>
    <figcaption><span><i className="base" aria-hidden="true" /> {t("doar ratele")}</span><span><i className="extra" aria-hidden="true" /> {t("cu suma în plus")}</span></figcaption>
  </figure>;
}
/** Simulatorul: cu dobândă, în ordinea care costă cel mai puțin, și data în care scapi de datorii. */
function DebtPayoffSimulator({ data }: { data: AppData }) {
  const [extra, setExtra] = useState(0);
  const active = data.debts.filter((debt) => debt.remaining > 0);
  const [strategy, setStrategy] = useState<PayoffStrategy>(() => recommendedStrategy(active));
  const minimum = active.reduce((sum, debt) => sum + Math.max(0, debt.monthly), 0);
  if (!active.length || !minimum) return null;
  const base = payoffPlan(active, 0, strategy);
  const withExtra = payoffPlan(active, extra, strategy);
  const other = payoffPlan(active, extra, strategy === "avalanche" ? "snowball" : "avalanche");
  const savedMonths = base.months !== null && withExtra.months !== null ? Math.max(0, base.months - withExtra.months) : 0;
  const savedInterest = Math.max(0, base.totalInterest - withExtra.totalInterest);
  const maxExtra = Math.max(100, Math.ceil(minimum * 1.5 / 100) * 100);
  const hasRates = active.some((debt) => (debt.annualRate || 0) > 0);
  return <section className="bf-debt-simulator"><div className="bf-debt-simulator-head"><div><p className="bf-kicker">{t("SIMULATOR DE DECIZIE")}</p><h2>{t("Dacă plătești")} <em>{t("în plus")}</em>?</h2><span>{t("Testează un efort lunar suplimentar. Nu schimbă datele tale, doar îți arată scenariul.")}</span></div><div className="bf-debt-simulator-result"><strong>{savedMonths ? "−" + savedMonths : "0"}</strong><small>{t("luni câștigate")}</small></div></div>
    <div className="bf-debt-strategy" role="radiogroup" aria-label={t("Ordinea de plată")}><button type="button" role="radio" aria-checked={strategy === "avalanche"} className={strategy === "avalanche" ? "active" : ""} onClick={() => setStrategy("avalanche")}><b>{t("Avalanșă")}</b><small>{t("întâi dobânda cea mai mare")}</small></button><button type="button" role="radio" aria-checked={strategy === "snowball"} className={strategy === "snowball" ? "active" : ""} onClick={() => setStrategy("snowball")}><b>{t("Minge de zăpadă")}</b><small>{t("întâi soldul cel mai mic")}</small></button></div>
    <div className="bf-debt-slider"><div><span>{t("Sumă extra / lună")}</span><b>{money(extra)}</b></div><input type="range" min="0" max={maxExtra} step="50" value={extra} onChange={(event) => setExtra(Number(event.target.value))} aria-label={t("Sumă suplimentară lunară")} /><div className="bf-debt-slider-labels"><small>0 RON</small><small>{money(maxExtra)}</small></div></div>
    {base.months !== null && withExtra.months !== null && extra > 0 && <PayoffChart base={base.totals} withExtra={withExtra.totals} />}
    {withExtra.months === null
      ? <p className="bf-form-error" role="alert">{t("Cu plățile acestea, dobânzile cresc mai repede decât scad datoriile. Mărește efortul lunar.")}</p>
      : <><p className="bf-debt-freedom"><b>{t("Scapi de datorii în {date}", { date: monthYear(monthAfter(withExtra.months)) })}</b>{hasRates ? <span>{t(" · dobândă totală {amount}", { amount: money(withExtra.totalInterest) })}{savedInterest > 0 ? t(" · economisești {amount}", { amount: money(savedInterest) }) : ""}</span> : <span>{t(" · scrie dobânzile în fiecare datorie pentru costul real")}</span>}</p>
        <ol className="bf-debt-order">{withExtra.order.map((debt, index) => <li key={debt.id}><b>{index + 1}. {debt.name}</b><small>{debt.annualRate ? t("{rate}% pe an", { rate: String(debt.annualRate).replace(".", ",") }) : t("dobândă necunoscută")} · {t("închisă în {date}", { date: monthYear(monthAfter(withExtra.closedAt[debt.id] || withExtra.months || 0)) })}</small></li>)}</ol>
        {hasRates && other.months !== null && other.totalInterest - withExtra.totalInterest > 1 && <p className="bf-helper">{t("Ordinea aleasă costă cu {amount} mai puțin decât cealaltă.", { amount: money(other.totalInterest - withExtra.totalInterest) })}</p>}
        {hasRates && other.months !== null && withExtra.totalInterest - other.totalInterest > 1 && <p className="bf-helper">{t("Cealaltă ordine ar costa cu {amount} mai puțin în dobânzi.", { amount: money(withExtra.totalInterest - other.totalInterest) })}</p>}</>}
    <div className="bf-debt-simulator-summary"><span><b>{base.months ?? "∞"}</b><small>{t("luni acum")}</small></span><span><b>{withExtra.months ?? "∞"}</b><small>{t("luni cu extra")}</small></span><span><b>{money(minimum + extra)}</b><small>{t("efort lunar")}</small></span></div></section>;
}
export function ObjectivesView({ data, onSaveToGoal, onEditDebt, onEditSaving, onPayDebt, onDeleteDebt, onDeleteSaving, openDebt, openSaving, onOpenRecurring, onPayRecurring, onAddRecurring, onOpenGoals, onOpenCalendar, onOpenEvents, onOpenAssistant, onAddSaving, onUpdate }: { data: AppData; onUpdate?: (change: (current: AppData) => AppData) => void; onAddSaving?: (goal: SavingsGoal) => void; onAddRecurring?: (item: RecurringPayment) => void; onSaveToGoal?: (id: string, amount: number) => void; onEditDebt: (item: Debt) => void; onEditSaving: (item: SavingsGoal) => void; onPayDebt: (item: Debt) => void; onDeleteDebt: (id: string) => void; onDeleteSaving: (id: string) => void; openDebt: () => void; openSaving: () => void; onOpenRecurring: () => void; onPayRecurring: (id: string) => void; onOpenGoals: () => void; onOpenCalendar: () => void; onOpenEvents: () => void; onOpenAssistant: () => void }) {
  const [laterIds, setLaterIds] = useState<string[]>([]);
  /** Obiectivele alimentate acum: butonul devine „Pus deoparte”, ca o dublă atingere să nu pună de două ori. */
  const [savedNow, setSavedNow] = useState<string[]>([]);
  const totalDebt = data.debts.reduce((sum, item) => sum + item.remaining, 0);
  const totalSavings = data.savings.reduce((sum, item) => sum + item.current, 0);
  const monthlyRates = data.debts.reduce((sum, item) => sum + item.monthly, 0);
  // Ordinea de plată: cu dobânzi cunoscute, avalanșa (costă cel mai puțin); altfel soldul cel mai mic.
  const openDebts = data.debts.filter((item) => item.remaining > 0);
  const ordered = orderDebts(openDebts, recommendedStrategy(openDebts));
  const snowball = { next: ordered[0] ? { debt: ordered[0] } : undefined };
  const rankedDebts = ordered.length ? [...ordered, ...data.debts.filter((item) => item.remaining <= 0)] : data.debts;
  const today = isoToday();
  const inferDue = (item: { dueDate?: string; due?: string }) => {
    if (item.dueDate) return item.dueDate;
    const day = Number(String(item.due || "").match(/\d{1,2}/)?.[0]);
    if (!Number.isFinite(day) || day < 1 || day > 31) return "";
    const now = new Date(`${today}T12:00:00`);
    const lastThis = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const thisMonth = isoDate(new Date(now.getFullYear(), now.getMonth(), Math.min(day, lastThis), 12));
    if (thisMonth >= today) return thisMonth;
    const lastNext = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
    return isoDate(new Date(now.getFullYear(), now.getMonth() + 1, Math.min(day, lastNext), 12));
  };
  const spend = subscriptionSpendAll(data);
  const rises = recurringPriceChanges(data);
  const [dismissed, setDismissed] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(DISMISSED_HITS) || "[]") as string[]; } catch { return []; } });
  const dismissHit = (key: string) => { const next = [...dismissed, key].slice(-60); setDismissed(next); try { safeSetItem(localStorage, DISMISSED_HITS, JSON.stringify(next)); } catch { /* fără stocare: revine data viitoare */ } };
  const suggestions = detectSubscriptions(data).filter((hit) => !dismissed.includes(hit.key)).slice(0, 3);
  const allUpcoming = [
    ...data.debts.filter((item) => item.remaining > 0).map((item) => ({
      id: `debt-${item.id}`,
      kind: "debt" as const,
      date: item.dueDate ? nextDebtDue(data, item, today) : inferDue(item),
      label: item.name,
      detail: t("Rată {amount}/lună", { amount: money(item.monthly) }),
      amount: item.monthly || item.remaining,
      onConfirm: () => onPayDebt(item),
    })).filter((item) => item.date),
    ...data.savings.filter((item) => item.dueDate).map((item) => ({
      id: `saving-${item.id}`,
      kind: "saving" as const,
      date: item.dueDate!,
      label: item.name,
      detail: t("Obiectiv"),
      amount: Math.max(0, item.target - item.current),
      onConfirm: onOpenGoals,
    })),
    /**
     * Evenimentele din calendar stau lângă rate și facturi, fiindcă la fel se cer:
     * la o dată știută, cu o sumă știută. Suma arătată e cât mai lipsește din fond,
     * nu costul întreg — restul e deja pus deoparte.
     */
    ...upcomingPlannedEvents(data.settings.plannedEvents, today, 120).map((status) => ({
      id: `event-${status.event.id}`,
      kind: "event" as const,
      date: status.date,
      label: status.event.name,
      detail: status.remaining > 0 ? t("mai ai de strâns {amount}", { amount: money(status.remaining) }) : t("fondul e complet"),
      amount: status.remaining,
      onConfirm: onOpenEvents,
    })),
    ...pendingRecurringInPlan(data).map((item) => ({
      id: `recurring-${item.id}`,
      kind: "recurring" as const,
      date: item.dueDate,
      label: item.name,
      detail: t(item.category),
      amount: item.amount,
      onConfirm: () => onPayRecurring(item.id),
    })),
    // Chiria sau rata din „Ce plătim lunar”, cu ziua plății aleasă, fără plată recurentă separată.
    ...(data.settings.salaryPlan.needs || []).filter((need) => !data.recurring.some((item) => item.active && item.name.trim().toLowerCase() === need.label.trim().toLowerCase())).flatMap((need) => {
      const due = nextNeedDue(data, need, today);
      return due ? [{ id: `need-${need.id}`, kind: "need" as const, date: due.date, label: need.label, detail: t(need.category), amount: due.amount, onConfirm: onOpenCalendar }] : [];
    }),
  ].filter((entry) => !laterIds.includes(entry.id)).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = allUpcoming.slice(0, 8);
  /** Următoarele 30 de zile dintr-o privire: cât e de plătit și când (obiectivele nu sunt plăți). */
  const horizon = addIsoDays(today, 30);
  const dueSoon = allUpcoming.filter((entry) => entry.kind !== "saving" && entry.date <= horizon);
  const dueTotal = dueSoon.reduce((sum, entry) => sum + entry.amount, 0);
  const overdue = dueSoon.filter((entry) => entry.date < today).length;
  const kindLabel = (kind: "debt" | "saving" | "recurring" | "event" | "need") => kind === "debt" ? t("Rată") : kind === "saving" ? t("Obiectiv") : kind === "event" ? t("Eveniment") : kind === "need" ? t("Ce plătim lunar") : t("Factură / abonament");
  const whenLabel = (date: string) => {
    if (date < today) return t("Întârziată");
    if (date === today) return t("Azi");
    return dateText(date, true);
  };
  /** „Ce plătim lunar” și Obligații erau două lumi: rata declarată nu apărea aici („Nu ai datorii”). */
  const fixedNeeds = activeNeeds(data)
    .filter((need) => need.priority === "fixed" || (!need.priority && ["Casă & facturi", "Rate produse", "Credite", "Abonamente", "Educație"].includes(need.category)))
    .map((need) => {
      const envelope = data.settings.salaryPlan.allocations.find((item) => item.id === need.allocationId);
      return { need, status: envelope ? allocationStatus(data, envelope) : undefined };
    });
  return (
    <div className="bf-page bf-obligations-workspace">
      <section className="bf-upcoming-hero" aria-labelledby="bf-upcoming-title">
        <div>
          <p className="bf-kicker">{t("CE URMEAZĂ")}</p>
          <h1 id="bf-upcoming-title">{t("Ce trebuie")} <em>{t("plătit, rezervat sau amânat.")}</em></h1>
          {dueSoon.length > 0 ? <div className="bf-due-summary">
            <p><b>{money(dueTotal)}</b> {t("de plătit în următoarele 30 de zile")}{overdue > 0 ? <em> · {t("{count} întârziate", { count: overdue })}</em> : null}</p>
            <div className="bf-due-track" aria-hidden="true"><span className="is-today" />{dueSoon.map((entry) => <i key={entry.id} className={`kind-${entry.kind}${entry.date < today ? " is-overdue" : ""}`} style={{ left: `${Math.max(0, Math.min(30, daysBetween(today, entry.date))) / 30 * 100}%` }} />)}</div>
            <div className="bf-due-scale" aria-hidden="true"><span>{t("azi")}</span><span>{dateText(addIsoDays(today, 15), true)}</span><span>{dateText(horizon, true)}</span></div>
          </div> : <p>{t("Rate, facturi și obiective pe o singură listă. Confirmarea creează mișcarea — nu trimite bani din bancă.")}</p>}
        </div>
        <div className="bf-obligations-links">
          <button className="bf-goals-link" aria-label={t("Obiective pe termen lung")} onClick={onOpenGoals}><PiggyBank size={16} /> {t("Obiective")}</button>
          <button className="bf-goals-link" aria-label={t("Calendar de scadențe")} onClick={onOpenCalendar}><CalendarDays size={16} /> {t("Calendar")}</button>
          <button className="bf-goals-link" aria-label={t("Evenimente viitoare")} onClick={onOpenEvents}><Gift size={16} /> {t("Evenimente")}</button>
        </div>
        {onUpdate && <BillsToMonthly data={data} onUpdate={onUpdate} />}
        <section className="bf-sub-board" aria-label={t("Abonamente")}>
          <div className="bf-section-heading">
            <div>
              <p className="bf-kicker">{t("ABONAMENTE")}</p>
              <h2>{t("Plăți care se repetă")}</h2>
              {spend.monthly > 0 && <p className="bf-sub-total"><b>{money(spend.monthly)}</b> {t("pe lună")} · {t("{amount} pe an", { amount: money(spend.yearly) })}</p>}
            </div>
            <button type="button" onClick={onOpenRecurring}>{data.recurring.some((item) => item.active) ? t("Gestionează") : t("Adaugă")}</button>
          </div>
          {data.recurring.some((item) => item.active) ? (
            <ul>
              {data.recurring.filter((item) => item.active).map((item) => (
                <li key={item.id}>
                  <b>{item.name}</b>
                  {/* RCA-ul anual nu e „în fiecare lună”: frecvența și luna se spun cum sunt. */}
                  <small>{item.frequency === "yearly" ? t("anual · {date}", { date: item.month ? new Date(2026, item.month - 1, Math.min(item.dueDay, 28)).toLocaleDateString(getLocale(), { day: "numeric", month: "long" }) : t("Ziua {day}", { day: item.dueDay }) }) : item.frequency === "quarterly" ? t("la 3 luni · Ziua {day}", { day: item.dueDay }) : `${t("în fiecare lună")} · ${t("Ziua {day}", { day: item.dueDay })}`}</small>
                  <strong>{money(item.amount)}</strong>
                </li>
              ))}
            </ul>
          ) : <p>{t("Chirie, telefon, Netflix — un nume și o sumă. Fără logo.")}</p>}
          {rises.length > 0 && <ul className="bf-sub-rises">{rises.map((rise) => <li key={rise.recurringId}><b>{rise.name}</b> {t("s-a scumpit: {from} → {to}", { from: money(rise.from), to: money(rise.to) })}</li>)}</ul>}
          {suggestions.length > 0 && <div className="bf-sub-found">
            <p className="bf-kicker">{t("AM GĂSIT ÎN MIȘCĂRI")}</p>
            {suggestions.map((hit) => <div key={hit.key} className="bf-sub-found-row">
              <span><b>{hit.name}</b><small>{money(hit.amount)} · {hit.reason}</small></span>
              {onAddRecurring && <button type="button" className="bf-secondary" onClick={() => { const draft = recurringFromDetection(data, hit); if (draft) onAddRecurring(draft); }}><Plus size={15} aria-hidden="true" /> {t("Adaugă")}</button>}
              <button type="button" className="bf-link-button" onClick={() => dismissHit(hit.key)}>{t("Nu e abonament")}</button>
            </div>)}
          </div>}
        </section>
        {upcoming.length ? (
          <div className="bf-upcoming-list">
            {upcoming.map((entry, index) => (
              <article key={entry.id} className={`bf-upcoming-item kind-${entry.kind}${index === 0 ? " is-next" : ""}${entry.date < today ? " is-overdue" : ""}`}>
                <div className="bf-upcoming-item-main">
                  <span>{entry.kind === "saving" ? <PiggyBank size={17} /> : entry.kind === "recurring" || entry.kind === "need" ? <CalendarClock size={17} /> : entry.kind === "event" ? <Gift size={17} /> : <BellRing size={17} />}</span>
                  <div>
                    <b>{entry.label}</b>
                    <small>{kindLabel(entry.kind)} · {whenLabel(entry.date)} · {entry.detail}</small>
                  </div>
                  <strong>{money(entry.amount)}</strong>
                </div>
                <div className="bf-upcoming-actions">
                  <button type="button" className="pay" onClick={entry.onConfirm}><Check size={16} /> {entry.kind === "saving" || entry.kind === "event" || entry.kind === "need" ? t("Deschide") : t("Confirmă plata")}</button>
                  <button type="button" onClick={() => setLaterIds((current) => [...current, entry.id])}>{t("Mai târziu")}</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bf-upcoming-empty">
            <b>{t("Nu ai scadențe apropiate.")}</b>
            <p>{t("Adaugă o rată, o factură recurentă sau un obiectiv — apar aici, în ordine.")}</p>
          </div>
        )}
      </section>
      <details className="bf-debt-tools">
        <summary>{t("Simulează o plată în plus")}</summary>
        <DebtPayoffSimulator data={data} />
      </details>
      {fixedNeeds.length > 0 && (
        <section className="bf-obligation-ledger bf-declared-bills" aria-labelledby="bf-declared-bills-title">
          <p className="bf-kicker" id="bf-declared-bills-title">{t("PLĂȚI LUNARE DECLARATE")}</p>
          <p className="bf-declared-bills-note">{t("Din „Ce plătim lunar”: ratele și facturile de care ține planul, cu starea lor în ciclul acesta.")}</p>
          <ul>
            {fixedNeeds.map(({ need, status }) => (
              <li key={need.id}>
                <span><b>{need.label}</b><small>{money(reserveOf(need))} {t("pe lună")}</small></span>
                <strong className={status?.paid ? "paid" : status && status.remaining < 0 ? "over" : ""}>
                  {!status ? t("fără plic încă") : status.paid ? <PaidCheck /> : status.remaining < 0 ? t("depășit") : status.spent > 0 ? t("mai sunt {amount}", { amount: money(status.remaining) }) : t("de plătit")}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(() => {
        const fund = emergencyFund(data, isoToday());
        if (!fund) return null;
        const months = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(fund.months);
        const goal = fund.goal;
        return <section className="bf-emergency" aria-labelledby="bf-emergency-title">
          <p className="bf-kicker">{t("FOND DE URGENȚĂ")}</p>
          <h2 id="bf-emergency-title">{fund.months >= 1 ? t("Ați rezista {months} luni fără venit.", { months }) : t("Încă nu ați rezista o lună fără venit.")}</h2>
          <i className="bf-emergency-bar" role="img" aria-label={t("{months} din 6 luni", { months })}><em style={{ width: `${Math.min(100, (fund.months / 6) * 100)}%` }} /><b style={{ left: "50%" }}>{t("{count} luni", { count: 3 })}</b><b style={{ right: 0, transform: "none" }}>{t("{count} luni", { count: 6 })}</b></i>
          <p>{fund.basis === "plan" ? t("O lună vă costă ~{amount}, după plicurile din plan.", { amount: money(fund.monthly) }) : t("O lună obișnuită vă costă ~{amount}, după ultimele 3 luni.", { amount: money(fund.monthly) })} {fund.months >= 6 ? t("Aveți liniștea a șase luni; restul poate merge spre alte obiective.") : t("Ținta: {target}. Cu {step} pe lună, îl aveți într-un an.", { target: money(fund.target), step: money(fund.step) })}</p>
          {goal ? (onSaveToGoal && fund.step > 0 && fund.months < 6 && (savedNow.includes(goal.id)
            ? <button type="button" className="bf-secondary" disabled><Check size={15} /> {t("Pus deoparte")}</button>
            : <button type="button" className="bf-secondary" onClick={() => { onSaveToGoal(goal.id, fund.step); setSavedNow((current) => [...current, goal.id]); }}><PiggyBank size={15} /> {t("Pune deoparte {amount}", { amount: money(fund.step) })}</button>))
            : onAddSaving && <button type="button" className="bf-primary" onClick={() => onAddSaving({ id: newId("saving"), name: t("Fond de urgență"), current: 0, target: fund.target, due: "", tone: "forest", updatedAt: new Date().toISOString() })}><Plus size={16} /> {t("Începe fondul de urgență")}</button>}
        </section>;
      })()}
      <section className="bf-obligation-ledger">
        <article className="debt"><span>{t("Sold datorii")}</span><b>{money(totalDebt)}</b><small>{t("{amount} rate declarate / lună", { amount: money(monthlyRates) })}</small></article>
        <article className="savings"><span>{t("Economii urmărite")}</span><b>{money(totalSavings)}</b><small>{t("{count} obiective înregistrate", { count: data.savings.length })}</small></article>
        <button onClick={onOpenRecurring}><CalendarClock size={18} /><span>{t("Scadențe programate")}</span><b>{data.recurring.length + data.debts.filter((item) => item.remaining > 0 && item.monthly > 0 && item.dueDate).length}</b><ChevronRight size={16} /></button>
      </section>
      <section className="bf-obligation-actions">
        <button type="button" className="bf-secondary bf-obligation-cta debt" onClick={openDebt}><Plus size={17} /> {t("Adaugă datorie")}</button>
        <button type="button" className="bf-secondary bf-obligation-cta savings" onClick={openSaving}><Plus size={17} /> {t("Creează economisire")}</button>
      </section>
      <div className="bf-obligation-lanes">
        <section className="bf-obligation-lane debt">
          <header><div><p className="bf-kicker">{t("DE PLĂTIT")}</p><h2>{t("Rate și împrumuturi")}</h2></div><span>{data.debts.length}</span></header>
          {rankedDebts.map((debt) => (
            <article className={`bf-obligation-entry${snowball.next?.debt.id === debt.id ? " next" : ""}`} key={debt.id}>
              <div className="bf-obligation-entry-main">
                <span><BellRing size={17} /></span>
                <div>
                  <b>{debt.name}</b>
                  {snowball.next?.debt.id === debt.id ? <em className="bf-snowball-tag">{t("01 · următoarea")}</em> : null}
                  <small>{debt.due} · {t("rată {amount}/lună", { amount: money(debt.monthly) })}</small>
                  {(() => { const months = debt.monthly > 0 ? amortize(debt.remaining, debt.annualRate, debt.monthly).months : null; return months ? <small className="bf-debt-free">{t("Scapi de ea în {month}", { month: monthYear(monthAfter(months)) })}</small> : null; })()}
                </div>
                <strong>{money(debt.remaining)}</strong>
              </div>
              <DebtPaymentHistory data={data} debt={debt} />
              <DebtSchedule data={data} debt={debt} onPay={() => onPayDebt(debt)} />
              <div className="bf-obligation-entry-actions">
                <button className="pay" onClick={() => onPayDebt(debt)}><Check size={16} /> {t("Confirmă plata")}</button>
                <button onClick={() => onEditDebt(debt)}><Pencil size={15} /> {t("Editează")}</button>
                <button className="delete" aria-label={t("Șterge {name}", { name: debt.name })} onClick={() => onDeleteDebt(debt.id)}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
          {!data.debts.length && (
            <div className="bf-obligation-empty">
              <BellRing size={21} />
              <span><b>{t("Nu ai datorii înregistrate.")}</b><small>{t("Adaugă doar obligațiile pe care vrei să le rezervi în plan.")}</small></span>
              <button type="button" className="bf-secondary" onClick={openDebt}>{t("Adaugă")}</button>
            </div>
          )}
        </section>
        <section className="bf-obligation-lane savings">
          <header><div><p className="bf-kicker">{t("DE CONSTRUIT")}</p><h2>{t("Economii și obiective")}</h2></div><span>{data.savings.length}</span></header>
          {data.savings.map((saving) => (
            <article className="bf-obligation-entry" key={saving.id}>
              <div className="bf-obligation-entry-main">
                <span className="bf-goal-ring-slot"><i className="bf-goal-ring" style={{ ["--bf-goal" as string]: `${Math.min(100, saving.target > 0 ? Math.round((saving.current / saving.target) * 100) : 0)}` }} role="img" aria-label={t("{share}% strâns", { share: Math.min(100, saving.target > 0 ? Math.round((saving.current / saving.target) * 100) : 0) })}><b>{Math.min(100, saving.target > 0 ? Math.round((saving.current / saving.target) * 100) : 0)}%</b></i></span>
                <div><b>{saving.name}</b><small>{saving.due}</small></div>
                <strong>{money(saving.current)}</strong>
              </div>
              <div className="bf-obligation-progress">
                <small>{t("{left} rămași până la {target}", { left: money(Math.max(0, saving.target - saving.current)), target: money(saving.target) })}</small>
              </div>
              {(() => {
                const plan = savingsSuggestion(data, saving);
                if (!plan) return null;
                const eta = monthTitle(plan.eta);
                return (
                  <div className={`bf-saving-plan${plan.stretch ? " is-stretch" : ""}`}>
                    <p>
                      {plan.basis === "deadline"
                        ? t("Pune deoparte {amount} pe lună și ajungi la timp ({months}).", { amount: money(plan.monthly), months: monthsLabel(plan.months) })
                        : t("Cu {amount} pe lună ajungi în {eta}.", { amount: money(plan.monthly), eta })}
                      {plan.stretch && plan.surplus !== undefined ? ` ${t("E mai mult decât rămâne de obicei la final de lună ({surplus}).", { surplus: money(Math.max(0, plan.surplus)) })}` : ""}
                    </p>
                    {onSaveToGoal && (savedNow.includes(saving.id)
                      ? <button type="button" className="bf-secondary" disabled><Check size={15} /> {t("Pus deoparte")}</button>
                      : <button type="button" className="bf-secondary" onClick={() => { onSaveToGoal(saving.id, Math.min(plan.monthly, plan.left)); setSavedNow((current) => [...current, saving.id]); }}><PiggyBank size={15} /> {t("Pune deoparte {amount}", { amount: money(Math.min(plan.monthly, plan.left)) })}</button>)}
                  </div>
                );
              })()}
              <div className="bf-obligation-entry-actions">
                <button onClick={() => onEditSaving(saving)}><Pencil size={15} /> {t("Editează")}</button>
                <button className="delete" aria-label={t("Șterge {name}", { name: saving.name })} onClick={() => onDeleteSaving(saving.id)}><Trash2 size={16} /></button>
              </div>
            </article>
          ))}
          {!data.savings.length && (
            <div className="bf-obligation-empty">
              <PiggyBank size={21} />
              <span><b>{t("Nu ai obiective de economisire.")}</b><small>{t("Începe cu fondul de siguranță sau un obiectiv concret.")}</small></span>
              <button type="button" className="bf-secondary" onClick={openSaving}>{t("Creează")}</button>
            </div>
          )}
        </section>
      </div>
      <section className="bf-obligation-ai">
        <div className="bf-obligation-ai-icon"><Bot size={22} /></div>
        <div>
          <p className="bf-kicker">{t("GHIDUL TĂU PENTRU OBLIGAȚII")}</p>
          <h2>{t("Îți urmăresc ratele, pas cu pas.")}</h2>
          <p>{t("Spune-mi ce datorie ai, ce rată ai plătit și îți arăt imediat ce urmează și cât mai rămâne.")}</p>
        </div>
        <button type="button" onClick={onOpenAssistant} className="bf-primary">{t("Deschide ghidul")} <ChevronRight size={16} /></button>
      </section>
    </div>
  );
}
