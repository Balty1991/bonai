/**
 * „Asistentul tău”: observații despre obiceiuri, calculate pe telefon din bonuri, cheltuieli și
 * plăți. Nimic nu pleacă din aplicație. Fiecare observație are o cifră din datele omului și,
 * unde se poate, un pas concret. Se arată doar ce e sigur (destule date, diferență clară).
 */
import { addIsoDays, isoToday, type AppData } from "./finance-data";
import { fixedCostEntries, spendEntries } from "./quick-expense";
import { bankCosts } from "./debts-tracker";
import { debtFreePlan } from "./debt-insights";
import { paymentCalendar } from "./payment-calendar";
import { t } from "./i18n";

export type InsightAction = "reports" | "debts" | "calendar" | "stores";
export type Insight = { id: string; icon: string; title: string; body: string; action?: InsightAction; weight: number };

const r2 = (value: number) => Math.round(value * 100) / 100;
const lei = (value: number) => `${Math.round(value).toLocaleString("ro-RO")}\u00a0lei`;
const WEEKDAYS = ["duminica", "lunea", "marțea", "miercurea", "joia", "vinerea", "sâmbăta"];
const monthOf = (iso: string) => iso.slice(0, 7);
const duration = (months: number) => {
  const years = Math.floor(months / 12), rest = months % 12;
  return [years ? (years === 1 ? t("un an") : t("{n} ani", { n: years })) : "", rest ? (rest === 1 ? t("o lună") : t("{n} luni", { n: rest })) : ""].filter(Boolean).join(t(" și "));
};

export function habitInsights(data: AppData, today = isoToday()): Insight[] {
  const out: Insight[] = [];
  const spend = spendEntries(data).filter((entry) => entry.amount > 0 && entry.date <= today);
  const last90 = spend.filter((entry) => entry.date >= addIsoDays(today, -90));

  // 1. Ziua din săptămână în care se duc cei mai mulți bani (media pe zi a acelei zile).
  if (last90.length >= 10) {
    const byDay = Array.from({ length: 7 }, () => 0);
    for (const entry of last90) byDay[new Date(`${entry.date}T12:00:00Z`).getUTCDay()] += entry.amount;
    const weeks = 90 / 7;
    const avg = byDay.map((sum) => sum / weeks);
    const top = avg.indexOf(Math.max(...avg));
    const others = avg.filter((_, index) => index !== top);
    const rest = others.reduce((sum, value) => sum + value, 0) / others.length;
    if (rest > 0 && avg[top] >= rest * 1.8 && avg[top] >= 40) {
      out.push({ id: "weekday", icon: "📅", weight: 60, action: "reports",
        title: t("{day} cheltuiești cel mai mult", { day: t(WEEKDAYS[top]).replace(/^./, (c) => c.toLocaleUpperCase("ro-RO")) }),
        body: t("În medie {amount}, de {times} ori mai mult decât în celelalte zile. Fă lista înainte de cumpărăturile mari: așa se evită ce iei din impuls.", { amount: lei(avg[top]), times: (avg[top] / rest).toLocaleString("ro-RO", { maximumFractionDigits: 1 }) }) });
    }
  }

  // 2. Cumpărăturile mici și dese din ultimele 30 de zile.
  const last30 = spend.filter((entry) => entry.date >= addIsoDays(today, -30));
  const small = last30.filter((entry) => entry.amount < 30);
  const smallTotal = r2(small.reduce((sum, entry) => sum + entry.amount, 0));
  if (small.length >= 8 && smallTotal >= 100) {
    out.push({ id: "small", icon: "🪙", weight: 55, action: "reports",
      title: t("{count} cumpărături mici în 30 de zile", { count: small.length }),
      body: t("Sub 30 de lei fiecare, dar împreună {amount}. Cele mai multe merită strânse într-o cumpărătură pe săptămână, cu listă.", { amount: lei(smallTotal) }) });
  }

  // 3. Categoria care crește cel mai mult față de luna trecută, până în aceeași zi.
  const month = monthOf(today);
  const prevDay = addIsoDays(`${month}-01`, -1).slice(0, 8) + today.slice(8, 10);
  const prevMonth = monthOf(addIsoDays(`${month}-01`, -1));
  const byCat = (from: string, to: string) => {
    const map = new Map<string, number>();
    for (const entry of spend) {
      if (entry.date < from || entry.date > to) continue;
      const lines = entry.lines?.length ? entry.lines : [{ category: entry.category, amount: entry.amount }];
      for (const line of lines) map.set(line.category, (map.get(line.category) || 0) + line.amount);
    }
    return map;
  };
  const now = byCat(`${month}-01`, today);
  const before = byCat(`${prevMonth}-01`, prevDay);
  let rise: { category: string; now: number; before: number } | undefined;
  now.forEach((value, category) => {
    const was = before.get(category) || 0;
    if (was >= 30 && value - was >= 50 && value >= was * 1.3 && (!rise || value - was > rise.now - rise.before)) rise = { category, now: value, before: was };
  });
  if (rise) {
    out.push({ id: "rise", icon: "📈", weight: 70, action: "reports",
      title: t("{category}: +{percent}% față de luna trecută", { category: t(rise.category), percent: Math.round((rise.now / rise.before - 1) * 100) }),
      body: t("{now} până azi, față de {before} luna trecută până în aceeași zi. Uită-te în Rapoarte ce produse au crescut.", { now: lei(rise.now), before: lei(rise.before) }) });
  }

  // 4. Cât din banii lunii se duc pe plăți fixe (rate, credite, comisioane, abonamente, facturi).
  const fixed = r2(fixedCostEntries(data).filter((entry) => monthOf(entry.date) === month && entry.date <= today).reduce((sum, entry) => sum + entry.amount, 0));
  const shopping = r2(spend.filter((entry) => monthOf(entry.date) === month).reduce((sum, entry) => sum + entry.amount, 0));
  if (fixed > 0 && fixed + shopping >= 300) {
    const share = Math.round((fixed / (fixed + shopping)) * 100);
    if (share >= 40) out.push({ id: "fixed", icon: "🧾", weight: 50, action: "calendar",
      title: t("{share}% din bani merg pe plăți fixe", { share }),
      body: t("Luna asta {fixed} pe rate, facturi și abonamente, față de {shopping} la cumpărături. Scadențarul arată ce mai vine și în ce zile.", { fixed: lei(fixed), shopping: lei(shopping) }) });
  }

  // 5. Banca: dobânzi de overdraft și comisioane, pe un an.
  const bank = bankCosts(data.debts);
  if (bank.yearly >= 60) {
    out.push({ id: "bank", icon: "💸", weight: 75, action: "debts",
      title: t("Banca te costă {amount} pe an", { amount: lei(bank.yearly) }),
      body: t("Doar dobânzi de overdraft și comisioane: {monthly} pe lună. Un pachet de cont fără comision sau stingerea overdraftului e economie sigură.", { monthly: lei(bank.monthly) }) });
  }

  // 6. Datoriile: ce câștigi dacă muți ratele eliberate sau dai ceva în plus.
  const plan = debtFreePlan(data.debts, today, 200);
  if (plan && plan.months !== null) {
    const rolled = plan.asIs.months !== null ? plan.asIs.months - plan.months : 0;
    if (rolled >= 3) out.push({ id: "rollover", icon: "🏁", weight: 80, action: "debts",
      title: t("Poți scăpa de datorii cu {time} mai devreme", { time: duration(rolled) }),
      body: t("Fără bani în plus: când se termină o rată, pune banii ei la următoarea datorie. Planul e în Datorii.") });
    else if (plan.faster && plan.faster.monthsSaved >= 3 && plan.faster.interestSaved >= 200) out.push({ id: "extra", icon: "🏁", weight: 65, action: "debts",
      title: t("Cu 200 de lei în plus pe lună termini cu {time} mai devreme", { time: duration(plan.faster.monthsSaved) }),
      body: t("Și dai cu ~{saved} mai puțin la dobânzi.", { saved: lei(plan.faster.interestSaved) }) });
  }

  // 7. Ziua din lună cu cele mai multe plăți: banii trebuie să fie pe card înainte.
  const cal = paymentCalendar(data, month);
  const upcomingBusy = cal.days.filter((day) => day.date >= today && day.payments.filter((item) => !item.paid).length >= 2).sort((a, b) => b.total - a.total)[0];
  if (upcomingBusy && upcomingBusy.total >= 300) {
    out.push({ id: "busy", icon: "⏰", weight: 72, action: "calendar",
      title: t("Pe {day} ai {count} plăți: {amount}", { day: new Date(`${upcomingBusy.date}T12:00:00Z`).toLocaleDateString("ro-RO", { day: "numeric", month: "long", timeZone: "UTC" }), count: upcomingBusy.payments.filter((item) => !item.paid).length, amount: lei(upcomingBusy.total) }),
      body: t("Pune banii pe card cu o zi înainte, ca să nu treacă vreo rată neplătită.") });
  }

  return out.sort((a, b) => b.weight - a.weight);
}
