/**
 * Widgetul Android „BonAI · luna asta”: textele gata formate pe care le arată. Widgetul nu
 * calculează nimic; dacă data publicării nu mai e azi, pune `stale` în locul rândului cu plata.
 */
import type { AppData } from "./finance-data";
import { monthShopping } from "./shop-insights";
import { upcoming } from "./upcoming";
import { lei } from "./money-format";
import { receiptsLabel, t } from "./i18n";

export type MonthWidget = { title: string; amount: string; caption: string; next: string; date: string; stale: string; zone?: string };

const whenText = (days: number) => (days === 0 ? t("azi") : days === 1 ? t("mâine") : t("în {count} zile", { count: days }));

export function monthWidgetData(data: AppData, today: string): Omit<MonthWidget, "zone"> {
  const month = monthShopping(data, today);
  const name = new Date(`${month.month}-15T12:00:00`).toLocaleDateString("ro-RO", { month: "long" });
  const diff = month.spent - month.lastMonthSoFar;
  const parts = [month.receipts ? t("din {what}", { what: receiptsLabel(month.receipts) }) : t("niciun bon încă")];
  if (month.lastMonthSoFar > 0 && Math.abs(diff) >= 1) parts.push(diff > 0 ? t("▲ {amount} față de luna trecută", { amount: lei(diff) }) : t("▼ {amount} față de luna trecută", { amount: lei(-diff) }));
  // Plata următoare: doar ce costă bani (nu termenele de retur sau garanție).
  const pay = upcoming(data, today, 30).find((item) => item.amount && item.kind !== "return" && item.kind !== "warranty");
  return {
    title: t("BonAI · {month}", { month: name }),
    amount: lei(month.spent),
    caption: parts.join(" · "),
    next: pay ? t("{name}: {amount}, {when}", { name: pay.name, amount: `${pay.estimate ? "~" : ""}${lei(pay.amount || 0)}`, when: whenText(pay.days) }) : "",
    date: today,
    stale: t("Deschide aplicația pentru plățile de azi"),
  };
}
