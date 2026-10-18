import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { isoToday, newId, parseRomanianAmount, type AppData, type Debt, type DebtType } from "@/lib/finance-data";
import { t } from "@/lib/i18n";
import { daysUntil } from "@/lib/house-costs";
import { DEBT_TYPES, debtDueDay, debtNextDue, debtProgress, debtSummary, debtTypeLabel, markInstallmentPaid, paidThisCycle } from "@/lib/debts-tracker";

const lei = (v: number) => `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const num = (v: string) => parseRomanianAmount(v);
type Draft = { id?: string; debtType: DebtType; creditor: string; initial: string; remaining: string; monthly: string; rate: string; dueDay: string; endDate: string; note: string };
const empty = (): Draft => ({ debtType: "rata-banca", creditor: "", initial: "", remaining: "", monthly: "", rate: "", dueDay: "15", endDate: "", note: "" });
const str = (v?: number) => (v ? String(v).replace(".", ",") : "");

/** Datorii: doar urmărire. Cât mai ai de dat, ratele pe lună, scadențele și progresul. Fără conturi. */
export function DebtsPanel({ data, onChange, onClose }: { data: AppData; onChange: (next: AppData) => void; onClose: () => void }) {
  const today = isoToday();
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState("");
  const rows = useMemo(() => data.debts.map((debt) => ({ debt, due: debtNextDue(debt, today) })).sort((a, b) => Number(b.debt.remaining > 0) - Number(a.debt.remaining > 0) || a.due.localeCompare(b.due)), [data.debts, today]);
  const sum = debtSummary(data.debts);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const write = (debts: Debt[]) => onChange({ ...data, debts });
  const save = () => {
    if (!draft) return;
    if (!draft.creditor.trim()) { setError(t("Scrie la cine ai datoria (bancă, magazin, persoană).")); return; }
    const remaining = num(draft.remaining);
    if (!(remaining >= 0) || !draft.remaining.trim()) { setError(t("Scrie cât mai ai de dat.")); return; }
    const id = draft.id || newId("debt");
    const old = data.debts.find((x) => x.id === id);
    const rate = num(draft.rate);
    const row: Debt = { ...(old || { tone: "forest" as const, due: "" }), id, name: `${t(debtTypeLabel(draft.debtType))} · ${draft.creditor.trim()}`, creditor: draft.creditor.trim(), debtType: draft.debtType, kind: draft.debtType === "dobanda-card" ? "card" : draft.debtType === "imprumut" ? "persoane" : "credit", initial: num(draft.initial) > 0 ? Math.round(num(draft.initial) * 100) / 100 : undefined, remaining: Math.round(remaining * 100) / 100, monthly: Math.round(Math.max(0, num(draft.monthly)) * 100) / 100, annualRate: rate > 0 && rate <= 500 ? rate : undefined, dueDay: Math.min(31, Math.max(1, Math.round(Number(draft.dueDay) || 1))), endDate: /^\d{4}-\d{2}-\d{2}$/.test(draft.endDate) ? draft.endDate : undefined, openEnded: draft.debtType === "dobanda-card" ? true : undefined, note: draft.note.trim() || undefined, updatedAt: new Date().toISOString() };
    write(old ? data.debts.map((x) => (x.id === id ? row : x)) : [...data.debts, row]);
    setDraft(undefined); setError("");
  };
  const remove = (id: string) => { onChange({ ...data, debts: data.debts.filter((x) => x.id !== id), deleted: [...data.deleted, { entity: "debts", id, deletedAt: new Date().toISOString() }] }); setDraft(undefined); };
  const edit = (x: Debt) => setDraft({ id: x.id, debtType: x.debtType || (x.kind === "card" ? "dobanda-card" : x.kind === "persoane" ? "imprumut" : "rata-banca"), creditor: x.creditor || x.name, initial: str(x.initial), remaining: str(x.remaining) || "0", monthly: str(x.monthly), rate: str(x.annualRate), dueDay: String(debtDueDay(x)), endDate: x.endDate || "", note: x.note || "" });
  return createPortal(<div className="bn-costs" role="dialog" aria-modal="true" aria-label={t("Datorii")}>
    <header className="bn-costs-head"><button type="button" className="bn-icon-btn" aria-label={t("Înapoi")} onClick={draft ? () => setDraft(undefined) : onClose}><ArrowLeft size={20} /></button><b>{draft ? (draft.id ? t("Modifică datoria") : t("Datorie nouă")) : t("Datorii")}</b><span /></header>
    {!draft ? <div className="bn-costs-body">
      <section className="bn-costs-hero bn-debt-hero"><small>{t("MAI AI DE DAT")}</small><strong>{lei(sum.remaining)}</strong><span>{sum.count ? t("Rate pe lună: {monthly} · {n} datorii", { monthly: lei(sum.monthly), n: sum.count }) : t("Adaugă rate, împrumuturi sau carduri ca să vezi tot ce ai de dat, într-un loc.")}</span></section>
      <ul className="bn-costs-list bn-debt-list">{rows.map(({ debt, due }) => { const p = debtProgress(debt); const paid = paidThisCycle(debt, today); const left = daysUntil(due, today); const done = debt.remaining <= 0 && !debt.openEnded; return <li key={debt.id} className={done ? "is-done" : undefined}>
        <button type="button" onClick={() => edit(debt)}><span className="bn-costs-day"><b>{Number(due.slice(8))}</b><small>{["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"][Number(due.slice(5, 7)) - 1]}</small></span><span className="bn-costs-copy"><b>{debt.creditor || debt.name}</b><small>{t(debtTypeLabel(debt.debtType))}{debt.monthly ? ` · ${t("rată {amount}", { amount: lei(debt.monthly) })}` : ""}{done ? ` · ${t("achitată")}` : paid ? ` · ${t("rata plătită")}` : ` · ${left === 0 ? t("azi") : left === 1 ? t("mâine") : t("în {n} zile", { n: left })}`}{debt.annualRate ? ` · DAE ${debt.annualRate.toLocaleString("ro-RO")}%` : ""}</small></span><span className="bn-costs-amount">{lei(debt.remaining)}</span></button>
        {p !== undefined && <div className="bn-debt-bar" role="progressbar" aria-label={t("Achitat")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}><i style={{ transform: `scaleX(${p})` }} /><small>{t("{p}% achitat din {initial}", { p: Math.round(p * 100), initial: lei(debt.initial || 0) })}</small></div>}
        {!done && debt.monthly > 0 && <button type="button" className="bn-debt-pay" disabled={paid} onClick={() => write(data.debts.map((x) => (x.id === debt.id ? markInstallmentPaid(x, today) : x)))}><Check size={16} aria-hidden="true" /> {paid ? t("Rata e bifată luna asta") : t("Marchează rata plătită")}</button>}
      </li>; })}</ul>
      <button type="button" className="bn-btn is-primary bn-costs-add" onClick={() => { setDraft(empty()); setError(""); }}><Plus size={18} aria-hidden="true" /> {t("Adaugă datorie")}</button>
      <p className="bn-costs-note">{t("Doar urmărire: BonAI nu plătește și nu se leagă de bancă. Bifezi tu rata, iar restul scade.")}</p>
    </div> : <form className="bn-costs-body bn-costs-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label><span>{t("Tip")}</span><select value={draft.debtType} onChange={(e) => set({ debtType: e.target.value as DebtType })}>{DEBT_TYPES.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
      <label><span>{t("Creditor")}</span><input value={draft.creditor} onChange={(e) => set({ creditor: e.target.value })} placeholder={t("ex. BCR, eMAG, Altex, mama")} autoFocus /></label>
      <div className="bn-costs-row"><label><span>{t("Suma inițială")}</span><input inputMode="decimal" value={draft.initial} onChange={(e) => set({ initial: e.target.value })} placeholder={t("opțional")} /></label><label><span>{t("Mai am de dat")}</span><input inputMode="decimal" value={draft.remaining} onChange={(e) => set({ remaining: e.target.value })} placeholder="0,00" /></label></div>
      <div className="bn-costs-row"><label><span>{t("Rata lunară")}</span><input inputMode="decimal" value={draft.monthly} onChange={(e) => set({ monthly: e.target.value })} placeholder="0,00" /></label><label><span>{t("Dobândă / DAE %")}</span><input inputMode="decimal" value={draft.rate} onChange={(e) => set({ rate: e.target.value })} placeholder={t("opțional")} /></label></div>
      <div className="bn-costs-row"><label><span>{t("Ziua ratei")}</span><input inputMode="numeric" value={draft.dueDay} onChange={(e) => set({ dueDay: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></label><label><span>{t("Ultima rată")}</span><input type="date" value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} /></label></div>
      <label><span>{t("Notițe")}</span><input value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder={t("ex. contract nr., telefon")} /></label>
      {error && <p className="bn-costs-error" role="alert">{error}</p>}
      <div className="bn-costs-actions">{draft.id && <button type="button" className="bn-btn" onClick={() => remove(draft.id!)}><Trash2 size={16} aria-hidden="true" /> {t("Șterge")}</button>}<button type="submit" className="bn-btn is-primary">{t("Salvează")}</button></div>
    </form>}
  </div>, document.body);
}

export default DebtsPanel;
