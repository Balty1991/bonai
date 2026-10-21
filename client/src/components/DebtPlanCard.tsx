/**
 * Planul de ieșire din datorii, în Datorii: luna în care termini, graficul restului pe luni,
 * ce câștigi dacă muți rata unei datorii stinse la următoarea și dacă dai ceva în plus pe lună.
 */
import { useMemo, useState } from "react";
import type { Debt } from "@/lib/finance-data";
import { debtFreePlan } from "@/lib/debt-insights";
import { t } from "@/lib/i18n";

const lei = (v: number) => `${Math.round(v).toLocaleString("ro-RO")}\u00a0lei`;
const EXTRAS = [0, 100, 200, 500];
const monthName = (offset: number, today: string) => {
  const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 15));
  return date.toLocaleDateString("ro-RO", { month: "long", year: "numeric", timeZone: "UTC" });
};
const duration = (months: number) => {
  const years = Math.floor(months / 12), rest = months % 12;
  return [years ? (years === 1 ? t("un an") : t("{n} ani", { n: years })) : "", rest ? (rest === 1 ? t("o lună") : t("{n} luni", { n: rest })) : ""].filter(Boolean).join(t(" și ")) || t("o lună");
};

/** Aria restului pe luni; linia punctată e „fără nicio schimbare”. */
function Chart({ lines, label }: { lines: Array<{ values: number[]; className: string }>; label: string }) {
  const width = 320, height = 120;
  const longest = Math.max(1, ...lines.map((line) => line.values.length - 1));
  const top = Math.max(1, ...lines.flatMap((line) => line.values));
  const path = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"}${((index / longest) * width).toFixed(1)},${(height - (value / top) * (height - 6)).toFixed(1)}`).join(" ");
  return <svg className="bn-plan-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
    <defs><linearGradient id="bnPlanFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".35" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
    {lines.map((line, index) => index === lines.length - 1
      ? <g key={line.className} className={line.className}><path d={`${path(line.values)} L${(((line.values.length - 1) / longest) * width).toFixed(1)},${height} L0,${height} Z`} fill="url(#bnPlanFill)" /><path d={path(line.values)} fill="none" pathLength={1} /></g>
      : <path key={line.className} className={line.className} d={path(line.values)} fill="none" />)}
  </svg>;
}

export function DebtPlanCard({ debts, today }: { debts: ReadonlyArray<Debt>; today: string }) {
  const [extra, setExtra] = useState(0);
  const plan = useMemo(() => debtFreePlan(debts, today, extra), [debts, today, extra]);
  if (!plan || plan.months === null) return null;
  const months = plan.faster?.months ?? plan.months;
  const totals = plan.faster?.totals ?? plan.totals;
  const rolled = plan.asIs.months !== null ? Math.max(0, plan.asIs.months - plan.months) : 0;
  const guessed = plan.debts.filter((debt) => debt.rateGuessed);
  return <section className="sh-card bn-plan">
    <p className="sh-kicker">{t("PLANUL DE IEȘIRE DIN DATORII")}</p>
    <h2 className="sh-title">{t("Fără datorii în {month}", { month: monthName(months, today) })}</h2>
    <p className="sh-muted">{t("peste {time} · mai ai de dat în total {total}, din care dobânzi ~{interest}", { time: duration(months), total: lei(plan.totalToPay), interest: lei(plan.interest) })}</p>
    <Chart lines={[{ values: plan.asIs.totals, className: "is-asis" }, { values: totals, className: "is-plan" }]} label={t("Restul de plată, lună de lună, până la {month}", { month: monthName(months, today) })} />
    <p className="bn-plan-legend"><span className="is-plan">{t("planul tău")}</span><span className="is-asis">{t("fără nicio schimbare")}</span></p>
    {rolled > 0 && <p className="bn-plan-tip">{t("Când se termină o rată, mută banii ei la următoarea datorie: termini cu {time} mai devreme, cu aceiași bani pe lună.", { time: duration(rolled) })}</p>}
    <div className="sh-seg bn-plan-extra" role="group" aria-label={t("În plus pe lună")}>{EXTRAS.map((value) => <button key={value} type="button" aria-pressed={extra === value} onClick={() => setExtra(value)}>{value ? `+${value}` : t("Doar ratele")}</button>)}</div>
    {plan.faster && plan.faster.monthsSaved > 0 && <p className="bn-plan-win">{t("Cu {extra} în plus pe lună termini cu {time} mai devreme și dai cu ~{saved} mai puțin la dobânzi.", { extra: lei(plan.faster.extra), time: duration(plan.faster.monthsSaved), saved: lei(plan.faster.interestSaved) })}</p>}
    <p className="sh-muted sh-note">{plan.strategy === "avalanche" ? t("Banii în plus merg întâi la datoria cu dobânda cea mai mare: costă cel mai puțin.") : t("Banii în plus merg întâi la datoria cea mai mică: o închizi repede și ai o rată mai puțin.")}{guessed.length ? ` ${t("Dobânda e estimată din rate la: {names}. Dacă o știi din contract, scrie-o la datorie.", { names: guessed.map((debt) => debt.creditor || debt.name).join(", ") })}` : ""}</p>
  </section>;
}

export default DebtPlanCard;
