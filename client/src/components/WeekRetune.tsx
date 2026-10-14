/**
 * „Reglează săptămânile”, în lista de săptămâni a unui plic: cât mai ai săptămâna asta (de azi
 * până duminică) și cât vrei pe săptămână de acum încolo. Arată înainte cât devine plicul și cât
 * se ia din nerepartizat.
 */
import { useState } from "react";
import { Check } from "lucide-react";
import { allocationWeeksStatus, isoToday, parseRomanianAmount, planAllocationMath, type AppData, type BudgetAllocation } from "@/lib/finance-data";
import { retuneWeeks } from "@/lib/week-retune";
import { t } from "@/lib/i18n";
import { lei } from "@/lib/money-format";

export function WeekRetune({ data, allocation, onChange }: { data: AppData; allocation: BudgetAllocation; onChange: (next: AppData) => void }) {
  const today = isoToday();
  const weeks = allocationWeeksStatus(data, allocation);
  const current = weeks.find((week) => today >= week.start && today <= week.end);
  const fullWeek = weeks.find((week) => week.plannedDays === 7);
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(() => String(Math.max(0, Math.round(current?.remaining || 0))));
  const [perWeek, setPerWeek] = useState(() => String(Math.round(allocation.weeklyAmount || fullWeek?.budget || 0)));
  if (!current || weeks.length < 2) return null;
  if (!open) return <div style={{ padding: "0 12px 12px" }}><button type="button" className="bf-week-transfer-toggle" onClick={() => setOpen(true)}>{t("Reglează săptămânile")}</button></div>;
  const preview = retuneWeeks(data, allocation.id, parseRomanianAmount(left), parseRomanianAmount(perWeek), today);
  const free = planAllocationMath(data).unrepartized;
  // Lipsesc bani doar când plicul crește peste ce e nerepartizat.
  const short = preview && preview.fromFree > 0 ? preview.fromFree - Math.max(0, free) : 0;
  return (
    <div style={{ display: "grid", padding: "4px 12px 12px", gap: 10 }}>
      <label className="bf-field"><span>{t("Săptămâna asta mai am (de azi până duminică)")}</span><input value={left} onChange={(event) => setLeft(event.target.value)} inputMode="decimal" /></label>
      <label className="bf-field"><span>{t("Din săptămâna viitoare, pe săptămână")}</span><input value={perWeek} onChange={(event) => setPerWeek(event.target.value)} inputMode="decimal" /></label>
      {preview && <p className="bf-helper" role="status">{t("Plicul devine {total} (acum {before}).", { total: lei(preview.total), before: lei(preview.before) })} {preview.fromFree >= 0 ? t("Se iau {amount} din nerepartizat.", { amount: lei(preview.fromFree) }) : t("Se eliberează {amount} în nerepartizat.", { amount: lei(-preview.fromFree) })} {t("Săptămâna scurtă de dinaintea salariului primește partea zilelor ei.")}</p>}
      {short > 0.009 && <p className="bf-form-error" role="alert">{t("Nu ajung banii nerepartizați: lipsesc {amount}.", { amount: lei(short) })}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="bf-primary" style={{ flex: "1 1 0", minHeight: 44 }} disabled={!preview || short > 0.009} onClick={() => { if (preview) { onChange(preview.data); setOpen(false); } }}><Check size={16} aria-hidden="true" /> {t("Aplică")}</button>
        <button type="button" className="bf-secondary" style={{ flex: "1 1 0", minHeight: 44 }} onClick={() => setOpen(false)}>{t("Renunță")}</button>
      </div>
    </div>
  );
}
