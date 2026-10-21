import { useMemo, useState } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { createPortal } from "react-dom";
import { ArrowLeft, CalendarDays, Check, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { isoToday, newId, parseRomanianAmount, type AppData, type Debt, type DebtType } from "@/lib/finance-data";
import { debtsLabel, t } from "@/lib/i18n";
import { daysUntil } from "@/lib/house-costs";
import { bankCosts, DEBT_TYPES, debtDueDay, debtNextDue, debtOutlook, debtProgress, debtSummary, debtTypeLabel, isBankCost, paidSoFar, paidThisCycle, payInstallment, undoInstallment } from "@/lib/debts-tracker";
import { estimatedRate } from "@/lib/debt-insights";
import { DebtPlanCard } from "@/components/DebtPlanCard";

const lei = (v: number) => `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0lei`;
const num = (v: string) => parseRomanianAmount(v);
type Draft = { id?: string; debtType: DebtType; creditor: string; initial: string; remaining: string; monthly: string; rate: string; dueDay: string; endDate: string; note: string };
const empty = (): Draft => ({ debtType: "rata-banca", creditor: "", initial: "", remaining: "", monthly: "", rate: "", dueDay: "15", endDate: "", note: "" });
const str = (v?: number) => (v ? String(v).replace(".", ",") : "");

/** Datorii: doar urmărire. Cât mai ai de dat, ratele pe lună, scadențele și progresul. Fără conturi. */
export function DebtsPanel({ data, onChange, onClose, onOpenCalendar }: { data: AppData; onChange: (next: AppData) => void; onClose: () => void; onOpenCalendar?: () => void }) {
  const today = isoToday();
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState("");
  const rows = useMemo(() => data.debts.map((debt) => ({ debt, due: debtNextDue(debt, today) })).sort((a, b) => Number(b.debt.remaining > 0) - Number(a.debt.remaining > 0) || a.due.localeCompare(b.due)), [data.debts, today]);
  const sum = debtSummary(data.debts.filter((debt) => !isBankCost(debt)));
  const bank = bankCosts(data.debts);
  const openType = (type: DebtType) => type === "dobanda-card" || type === "comision-bancar";
  // Luna asta: câte rate sunt bifate și cât mai e de plătit din cele nebifate.
  const due = data.debts.filter((debt) => debt.monthly > 0 && (debt.remaining > 0 || debt.openEnded || paidThisCycle(debt, today, data)));
  const ticked = due.filter((debt) => paidThisCycle(debt, today, data));
  const leftThisMonth = Math.round(due.filter((debt) => !paidThisCycle(debt, today, data)).reduce((s, debt) => s + (debt.openEnded ? debt.monthly : Math.min(debt.monthly, debt.remaining)), 0) * 100) / 100;
  const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("ro-RO", { month: "long", year: "numeric", timeZone: "UTC" });
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const write = (debts: Debt[]) => onChange({ ...data, debts });
  const save = () => {
    if (!draft) return;
    if (!draft.creditor.trim()) { setError(t("Scrie la cine ai datoria (bancă, magazin, persoană).")); return; }
    // La dobânzi și comisioane restul nu contează, dar cel vechi rămâne cum era (nu se șterge nimic).
    const previous = draft.id ? data.debts.find((x) => x.id === draft.id)?.remaining : undefined;
    const remaining = openType(draft.debtType) ? previous ?? 0 : num(draft.remaining);
    if (!openType(draft.debtType) && (!(remaining >= 0) || !draft.remaining.trim())) { setError(t("Scrie cât mai ai de dat.")); return; }
    if (openType(draft.debtType) && !(num(draft.monthly) > 0)) { setError(t("Scrie cât te costă pe lună.")); return; }
    const id = draft.id || newId("debt");
    const old = data.debts.find((x) => x.id === id);
    const rate = num(draft.rate);
    const row: Debt = { ...(old || { tone: "forest" as const, due: "" }), id, name: `${t(debtTypeLabel(draft.debtType))} · ${draft.creditor.trim()}`, creditor: draft.creditor.trim(), debtType: draft.debtType, kind: openType(draft.debtType) ? "card" : draft.debtType === "imprumut" ? "persoane" : "credit", initial: num(draft.initial) > 0 ? Math.round(num(draft.initial) * 100) / 100 : undefined, remaining: Math.round(remaining * 100) / 100, monthly: Math.round(Math.max(0, num(draft.monthly)) * 100) / 100, annualRate: rate > 0 && rate <= 500 ? rate : undefined, dueDay: Math.min(31, Math.max(1, Math.round(Number(draft.dueDay) || 1))), endDate: /^\d{4}-\d{2}-\d{2}$/.test(draft.endDate) ? draft.endDate : undefined, openEnded: openType(draft.debtType) ? true : undefined, note: draft.note.trim() || undefined, updatedAt: new Date().toISOString() };
    write(old ? data.debts.map((x) => (x.id === id ? row : x)) : [...data.debts, row]);
    setDraft(undefined); setError("");
  };
  const remove = (id: string) => { onChange({ ...data, debts: data.debts.filter((x) => x.id !== id), deleted: [...data.deleted, { entity: "debts", id, deletedAt: new Date().toISOString() }] }); setDraft(undefined); };
  const edit = (x: Debt) => setDraft({ id: x.id, debtType: x.debtType || (isBankCost(x) ? "dobanda-card" : x.kind === "card" ? "rata-card-magazin" : x.kind === "persoane" ? "imprumut" : "rata-banca"), creditor: x.creditor || x.name, initial: str(x.initial), remaining: str(x.remaining) || "0", monthly: str(x.monthly), rate: str(x.annualRate), dueDay: String(debtDueDay(x)), endDate: x.endDate || "", note: x.note || "" });
  const renderRow = ({ debt, due }: { debt: Debt; due: string }) => { const p = debtProgress(debt); const paid = paidThisCycle(debt, today, data); const left = daysUntil(due, today); const done = debt.remaining <= 0 && !debt.openEnded; return <li key={debt.id} className={done ? "is-done" : undefined}>
        <button type="button" onClick={() => edit(debt)}><span className="bn-costs-day"><b>{Number(due.slice(8))}</b><small>{["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"][Number(due.slice(5, 7)) - 1]}</small></span><span className="bn-costs-copy"><b>{debt.creditor || debt.name}</b><small>{t(debtTypeLabel(debt.debtType))}{debt.monthly ? ` · ${t("rată {amount}", { amount: lei(debt.monthly) })}` : ""}{done ? ` · ${t("achitată")}` : paid ? ` · ${t("rata plătită")}` : ` · ${left === 0 ? t("azi") : left === 1 ? t("mâine") : t("în {n} zile", { n: left })}`}{debt.annualRate ? ` · DAE ${debt.annualRate.toLocaleString("ro-RO")}%` : ""}</small></span><span className="bn-costs-amount">{lei(debt.remaining)}</span></button>
        {p !== undefined && <div className="bn-debt-bar" role="progressbar" aria-label={t("Achitat")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}><i style={{ transform: `scaleX(${p})` }} /><small>{t("{p}% achitat din {initial}", { p: Math.round(p * 100), initial: lei(debt.initial || 0) })}</small></div>}
        {(() => { const out = debtOutlook(debt, today); const total = paidSoFar(data, debt.id); return (out || total > 0) && <p className="bn-debt-outlook">{[out ? (out.payments === 1 ? t("ultima rată: {month}", { month: monthName(out.lastMonth) }) : t("mai ai {n} rate · ultima în {month}", { n: out.payments, month: monthName(out.lastMonth) })) : "", total > 0 ? t("plătit până acum: {amount}", { amount: lei(total) }) : ""].filter(Boolean).join(" · ")}</p>; })()}
        {!done && debt.monthly > 0 && !paid && <button type="button" className="bn-debt-pay" onClick={() => onChange(payInstallment(data, debt.id, today))}><Check size={16} aria-hidden="true" /> {t("Marchează rata plătită")}</button>}
        {paid && <div className="bn-debt-paid"><span><Check size={16} aria-hidden="true" /> {t("Rata e bifată luna asta")}</span>{debt.lastPaid && <button type="button" className="bn-link" onClick={() => onChange(undoInstallment(data, debt.id))}><RotateCcw size={14} aria-hidden="true" /> {t("Anulează bifa")}</button>}</div>}
      </li>; };
  // Esc și butonul Înapoi de pe Android fac ce face săgeata din colț.
  const trapRef = useFocusTrap<HTMLDivElement>(draft ? () => setDraft(undefined) : onClose);
  return createPortal(<div ref={trapRef} tabIndex={-1} className="bn-costs" role="dialog" aria-modal="true" aria-label={t("Datorii")}>
    <header className="bn-costs-head"><button type="button" className="bn-icon-btn" aria-label={t("Înapoi")} onClick={draft ? () => setDraft(undefined) : onClose}><ArrowLeft size={20} /></button><b>{draft ? (draft.id ? t("Modifică datoria") : t("Datorie nouă")) : t("Datorii")}</b><span /></header>
    {!draft ? <div className="bn-costs-body">
      <section className="bn-costs-hero bn-debt-hero"><small>{t("MAI AI DE DAT")}</small><strong>{lei(sum.remaining)}</strong><span>{sum.count ? `${t("Rate pe lună: {monthly} · {debts}", { monthly: lei(sum.monthly), debts: debtsLabel(sum.count) })}${due.length ? ` · ${t("luna asta: {done} din {all} bifate, mai ai {amount}", { done: ticked.length, all: due.length, amount: lei(leftThisMonth) })}` : ""}` : t("Adaugă rate, împrumuturi sau carduri ca să vezi tot ce ai de dat, într-un loc.")}</span>{onOpenCalendar && <button type="button" className="bn-link bn-debt-cal" onClick={onOpenCalendar}><CalendarDays size={16} aria-hidden="true" /> {t("Scadențarul lunii")}</button>}</section>
      {sum.count > 0 && <DebtPlanCard debts={data.debts} today={today} />}
      <ul className="bn-costs-list bn-debt-list">{rows.filter(({ debt }) => !isBankCost(debt)).map(renderRow)}</ul>
      {bank.items.length > 0 && <section className="bn-bank">
        <p className="sh-kicker">{t("DOBÂNZI ȘI COMISIOANE BANCARE")}</p>
        <p className="bn-bank-sum"><strong>{lei(bank.yearly)}</strong> <span>{t("pe an · {monthly} pe lună", { monthly: lei(bank.monthly) })}</span></p>
        <ul className="bn-costs-list bn-debt-list">{rows.filter(({ debt }) => isBankCost(debt)).map(renderRow)}</ul>
        <p className="bn-costs-note">{t("Bani dați băncii doar pentru card, cont sau overdraft. Întreabă de un pachet fără comisioane sau stinge overdraftul: e economie sigură.")}</p>
      </section>}
      <button type="button" className="bn-btn is-primary bn-costs-add" onClick={() => { setDraft(empty()); setError(""); }}><Plus size={18} aria-hidden="true" /> {t("Adaugă datorie")}</button>
      <p className="bn-costs-note">{t("Doar urmărire: BonAI nu plătește și nu se leagă de bancă. Bifezi tu rata: restul scade, iar plata apare în Rapoarte la plățile fixe, nu la cumpărături.")}</p>
    </div> : <form className="bn-costs-body bn-costs-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label><span>{t("Tip")}</span><select value={draft.debtType} onChange={(e) => set({ debtType: e.target.value as DebtType })}>{DEBT_TYPES.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select></label>
      <label><span>{t("Creditor")}</span><input value={draft.creditor} onChange={(e) => set({ creditor: e.target.value })} placeholder={t("ex. BCR, eMAG, Altex, mama")} autoFocus /></label>
      {!openType(draft.debtType) && <div className="bn-costs-row"><label><span>{t("Suma inițială")}</span><input inputMode="decimal" value={draft.initial} onChange={(e) => set({ initial: e.target.value })} placeholder={t("opțional")} /></label><label><span>{t("Mai am de dat")}</span><input inputMode="decimal" value={draft.remaining} onChange={(e) => set({ remaining: e.target.value })} placeholder="0,00" /></label></div>}
      <div className="bn-costs-row"><label><span>{openType(draft.debtType) ? t("Cost pe lună") : t("Rata lunară")}</span><input inputMode="decimal" value={draft.monthly} onChange={(e) => set({ monthly: e.target.value })} placeholder="0,00" /></label>{!openType(draft.debtType) && <label><span>{t("Dobândă / DAE %")}</span><input inputMode="decimal" value={draft.rate} onChange={(e) => set({ rate: e.target.value })} placeholder={t("opțional")} /></label>}</div>
      {(() => { if (openType(draft.debtType) || draft.rate.trim()) return null; const guess = estimatedRate({ remaining: num(draft.remaining), monthly: num(draft.monthly), endDate: /^\d{4}-\d{2}-\d{2}$/.test(draft.endDate) ? draft.endDate : undefined, debtType: draft.debtType }, today); return guess > 0 ? <p className="bn-debt-guess"><Sparkles size={15} aria-hidden="true" /> {t("Din rest, rată și ultima rată, dobânda iese ~{rate}% pe an.", { rate: guess.toLocaleString("ro-RO") })} <button type="button" className="bn-link" onClick={() => set({ rate: String(guess).replace(".", ",") })}>{t("Folosește estimarea")}</button></p> : null; })()}
      <div className="bn-costs-row"><label><span>{t("Ziua ratei")}</span><input inputMode="numeric" value={draft.dueDay} onChange={(e) => set({ dueDay: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></label><label><span>{t("Ultima rată")}</span><input type="date" value={draft.endDate} onChange={(e) => set({ endDate: e.target.value })} /></label></div>
      <label><span>{t("Notițe")}</span><input value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder={t("ex. contract nr., telefon")} /></label>
      {error && <p className="bn-costs-error" role="alert">{error}</p>}
      <div className="bn-costs-actions">{draft.id && <button type="button" className="bn-btn" onClick={() => remove(draft.id!)}><Trash2 size={16} aria-hidden="true" /> {t("Șterge")}</button>}<button type="submit" className="bn-btn is-primary">{t("Salvează")}</button></div>
    </form>}
  </div>, document.body);
}

export default DebtsPanel;
