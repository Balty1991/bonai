/**
 * Ieșirea din datorii (Mai mult → Planificare): suma în plus pe lună, avalanșa față de bulgăre,
 * data în care sunteți liberi, dobânda economisită, ordinea și calendarul plăților.
 */
import { useMemo, useState } from "react";
import { type AppData } from "@/lib/finance-data";
import { debtExit } from "@/lib/debt-exit";
import { monthAfter, type PayoffPlan, type PayoffStrategy } from "@/lib/debt-plan";
import { getLocale, monthsLabel, t } from "@/lib/i18n";
import { lei } from "@/lib/money-format";

/** O singură coloană care se poate strânge: un rând lat nu mai împinge cifrele afară din card. */
const CARD = { gridTemplateColumns: "minmax(0, 1fr)" } as const;
const RANGE = { width: "100%", minHeight: 32, padding: 0, border: 0, background: "transparent", boxShadow: "none", accentColor: "var(--cf-primary)" } as const;

const W = 320, H = 120;
const monthName = (offset: number, long = false) => new Intl.DateTimeFormat(getLocale(), { month: long ? "long" : "short", year: "numeric" }).format(monthAfter(offset));

function Curve({ plans }: { plans: Array<{ plan: PayoffPlan; color: string; dash?: string }> }) {
  const longest = Math.max(1, ...plans.map(({ plan }) => plan.totals.length - 1));
  const top = Math.max(1, ...plans.map(({ plan }) => plan.totals[0]));
  const path = (totals: number[]) => totals.map((value, index) => `${index ? "L" : "M"}${(4 + (index / longest) * (W - 8)).toFixed(1)},${(H - 6 - (value / top) * (H - 16)).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Datoriile scad în timp")} style={{ width: "100%", height: "auto", display: "block" }}>
    {plans.map(({ plan, color, dash }, index) => <path key={index} d={path(plan.totals)} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={dash} strokeLinejoin="round" />)}
  </svg>;
}

export function DebtExitPanel({ data }: { data: AppData }) {
  const open = useMemo(() => data.debts.filter((debt) => debt.remaining > 0 && !debt.openEnded), [data.debts]);
  const [extra, setExtra] = useState(100);
  const [strategy, setStrategy] = useState<PayoffStrategy | undefined>(undefined);
  const exit = useMemo(() => debtExit(open, extra, strategy), [open, extra, strategy]);
  if (!exit) return <section className="bf-scenario-card" style={CARD}><p className="bf-kicker">{t("IEȘIREA DIN DATORII")}</p><h2>{t("Nu aveți datorii deschise.")}</h2><p className="bf-helper">{t("Adăugați un credit sau o rată în Obligații și aici apare planul de achitare.")}</p></section>;
  const total = open.reduce((sum, debt) => sum + debt.remaining, 0);
  const rates = open.reduce((sum, debt) => sum + Math.max(0, debt.monthly), 0);
  const chosen = exit.chosen;
  const card = (plan: PayoffPlan, name: string, detail: string) => {
    const on = plan.strategy === chosen.strategy;
    return <button type="button" aria-pressed={on} onClick={() => setStrategy(plan.strategy)} style={{ display: "grid", gap: 4, padding: 14, textAlign: "left", borderRadius: 16, border: `2px solid ${on ? "var(--cf-primary)" : "var(--cf-line)"}`, background: on ? "color-mix(in srgb, var(--cf-primary) 8%, var(--cf-surface))" : "var(--cf-surface)", color: "var(--cf-ink)", font: "inherit" }}>
      <b>{name}{plan.strategy === exit.recommended ? ` · ${t("recomandat")}` : ""}</b>
      <small style={{ color: "var(--cf-muted)" }}>{detail}</small>
      <span>{plan.months === null ? t("Ratele nu acoperă dobânda") : t("liberi în {date}", { date: monthName(plan.months) })}</span>
      <small>{t("dobândă totală {amount}", { amount: lei(plan.totalInterest) })}</small>
    </button>;
  };
  return <div style={{ display: "grid", gap: 14 }}>
    <section className="bf-scenario-card" style={CARD}>
      <div className="bf-scenario-heading"><div>
        <p className="bf-kicker">{t("IEȘIREA DIN DATORII")}</p>
        <h2>{chosen.months === null ? t("Ratele de acum nu ajung să închidă datoriile.") : t("Liberi de datorii în {date}", { date: monthName(chosen.months, true) })}</h2>
        <p>{t("{total} de achitat, {rates} pe lună în rate.", { total: lei(total), rates: lei(rates) })}</p>
      </div></div>
      <label style={{ display: "grid", gap: 6, fontWeight: 600 }}><span>{t("În plus pe lună: {amount}", { amount: lei(extra) })}</span><input type="range" min={0} max={Math.max(2000, Math.round(rates))} step={50} value={extra} onChange={(event) => setExtra(Number(event.target.value))} style={RANGE} /></label>
      {extra > 0 && exit.monthsSaved !== null && <p style={{ margin: 0, fontWeight: 600, color: "var(--cf-primary-strong)" }}>{t("Cu {extra} în plus: {months} mai devreme și {interest} dobândă economisită.", { extra: lei(extra), months: monthsLabel(exit.monthsSaved), interest: lei(exit.interestSaved) })}</p>}
      <Curve plans={[{ plan: exit.minimum, color: "var(--cf-muted)", dash: "4 4" }, { plan: chosen, color: "var(--cf-primary)" }]} />
      <small className="bf-helper" style={{ margin: 0 }}>{t("Linia punctată: doar ratele. Linia plină: cu suma în plus.")}</small>
    </section>
    <section className="bf-scenario-card" style={CARD}>
      <p className="bf-kicker">{t("STRATEGIA")}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {card(exit.avalanche, t("Avalanșă"), t("întâi dobânda cea mai mare"))}
        {card(exit.snowball, t("Bulgăre de zăpadă"), t("întâi datoria cea mai mică"))}
      </div>
      {exit.strategyGap >= 1 && <small className="bf-helper" style={{ margin: 0 }}>{t("Diferența dintre ele: {amount} dobândă.", { amount: lei(exit.strategyGap) })}</small>}
    </section>
    <section className="bf-scenario-card" style={CARD}>
      <p className="bf-kicker">{t("ORDINEA")}</p>
      <ol style={{ display: "grid", gap: 8, margin: 0, paddingLeft: 20 }}>
        {chosen.order.map((debt) => <li key={debt.id}><b>{debt.name}</b> · {lei(debt.remaining)}{debt.annualRate ? ` · ${debt.annualRate}%` : ""}<br /><small style={{ color: "var(--cf-muted)" }}>{chosen.closedAt[debt.id] ? t("închisă în {date}", { date: monthName(chosen.closedAt[debt.id]) }) : t("nu se închide la ritmul acesta")}</small></li>)}
      </ol>
    </section>
    <section className="bf-scenario-card" style={CARD}>
      <p className="bf-kicker">{t("CALENDARUL PLĂȚILOR")}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {chosen.schedule.slice(0, 6).map((month, index) => <div key={index} style={{ display: "grid", gap: 2, paddingBottom: 8, borderBottom: "1px solid var(--cf-line)" }}>
          <b>{monthName(index + 1, true)}</b>
          {chosen.order.filter((debt) => month[debt.id]).map((debt) => <span key={debt.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>{debt.name}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{lei(month[debt.id])}</span></span>)}
        </div>)}
      </div>
    </section>
  </div>;
}
