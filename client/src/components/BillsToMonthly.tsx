/**
 * „Fă-le plăți lunare”: facturile notate de mână (lumină, apă, telefon, grădiniță, abonamente)
 * devin plăți lunare dintr-o atingere, iar dobânda de overdraft rămâne la Datorii, cu plată
 * lunară aproximativă, fără dată de final. Utilitățile sunt bifate „sumă aproximativă”: suma de
 * pe factură se scrie când vine, la Scadențe.
 */
import { useMemo, useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import { type AppData } from "@/lib/finance-data";
import { applyBills, billCandidates, markOpenEnded, overdraftDebts, type BillPick } from "@/lib/monthly-bills";
import { t } from "@/lib/i18n";
import { lei } from "@/lib/money-format";

const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--cf-line)" };

export function BillsToMonthly({ data, onUpdate }: { data: AppData; onUpdate: (change: (current: AppData) => AppData) => void }) {
  const candidates = useMemo(() => billCandidates(data), [data]);
  const overdrafts = overdraftDebts(data);
  const [picks, setPicks] = useState<Record<string, Partial<BillPick>>>({});
  const [done, setDone] = useState(0);
  if (!candidates.length && !overdrafts.length) return done ? <p className="bf-helper" role="status">{t("Gata: {count} plăți lunare. Le găsești la Scadențe.", { count: done })}</p> : null;
  const merged = candidates.map((item) => ({ ...item, keep: true, ...picks[item.txId] }));
  const kept = merged.filter((item) => item.keep);
  const save = () => {
    onUpdate((current) => applyBills(current, merged));
    setDone(kept.length);
    setPicks({});
  };
  return (
    <section className="bf-sub-board" aria-labelledby="bf-bills-monthly-title" style={{ marginTop: 12 }}>
      <div className="bf-section-heading">
        <div>
          <p className="bf-kicker">{t("PLĂȚI LUNARE")}</p>
          <h2 id="bf-bills-monthly-title">{t("Să nu le mai scrii în fiecare lună")}</h2>
        </div>
        <CalendarClock size={20} aria-hidden="true" />
      </div>
      {merged.length > 0 && <>
        <p className="bf-helper">{t("Le-ai notat de mână. Fă-le lunare: se pun deoparte din salariu și apar la „de plătit” cu un buton. Cele cu sumă aproximativă (lumină, apă) le confirmi cu suma de pe factură.")}</p>
        {merged.map((item) => (
          <div key={item.txId} style={row}>
            <input type="checkbox" checked={item.keep} aria-label={t("Fă lunară: {name}", { name: item.name })} onChange={(event) => setPicks((current) => ({ ...current, [item.txId]: { ...current[item.txId], keep: event.target.checked } }))} style={{ width: 22, height: 22 }} />
            <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <b style={{ overflowWrap: "anywhere" }}>{item.name}</b>
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 13, color: "var(--cf-muted)" }}>
                <button type="button" aria-pressed={item.variable} onClick={() => setPicks((current) => ({ ...current, [item.txId]: { ...current[item.txId], variable: !item.variable } }))} style={{ minHeight: 32, padding: "0 10px", borderRadius: 999, border: "1px solid var(--cf-line)", background: item.variable ? "color-mix(in srgb, var(--cf-primary, #2f6f5b) 12%, var(--cf-surface))" : "var(--cf-surface)", color: "var(--cf-ink)", fontSize: 13, fontWeight: 600 }}>{item.variable ? t("sumă aproximativă") : t("sumă fixă")}</button>
                {t("pe {day} ale lunii", { day: item.dueDay })}
              </span>
            </span>
            <b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{item.variable ? "~" : ""}{lei(item.amount)}</b>
          </div>
        ))}
        <button type="button" className="bf-primary" disabled={!kept.length} onClick={save} style={{ marginTop: 10 }}><Check size={16} aria-hidden="true" /> {t("Fă-le lunare ({count})", { count: kept.length })}</button>
      </>}
      {overdrafts.length > 0 && <div style={{ marginTop: merged.length ? 16 : 0 }}>
        <p className="bf-helper">{t("Dobânda de overdraft nu are dată de final: nu știi când scapi. Rămâne la Datorii, ca s-o urmărești, cu plată lunară aproximativă; plata nu scade soldul și nu-ți mai promite „scapi în…”.")}</p>
        {overdrafts.map((debt) => (
          <div key={debt.id} style={{ ...row, gridTemplateColumns: "1fr auto auto" }}>
            <b style={{ overflowWrap: "anywhere" }}>{debt.name}</b>
            <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>~{lei(debt.monthly)}</span>
            <button type="button" className="bf-secondary" onClick={() => { onUpdate((current) => markOpenEnded(current, debt.id)); }}>{t("Lunar, fără dată de final")}</button>
          </div>
        ))}
      </div>}
    </section>
  );
}
