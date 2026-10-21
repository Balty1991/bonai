/** „Cheltuială fără bon”: suma, categoria, gata. Taxi, patiserie, cafea — fără bon fals și fără produse. */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ListPlus, Plus, Repeat2, X } from "lucide-react";
import { isoToday, type AppData, type Transaction } from "@/lib/finance-data";
import { t } from "@/lib/i18n";
import { FIXED_QUICK, QUICK_CATEGORIES, fixedSuggestions, parseAmount, quickExpenseTransaction, quickIcon, quickSuggestions } from "@/lib/quick-expense";

const lei = (value: number) => `${value.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}\u00a0lei`;

export function QuickExpenseSheet({ data, onSave, onClose, onItemize }: { data: AppData; onSave: (tx: Transaction) => void; onClose: () => void; onItemize: () => void }) {
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState<string>();
  const [custom, setCustom] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [more, setMore] = useState(false);
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(isoToday());
  const [memberId, setMemberId] = useState(data.settings.selfMemberId);
  const amount = parseAmount(amountText);
  const { repeats, categories: recent } = useMemo(() => quickSuggestions(data), [data]);
  const fixedRepeats = useMemo(() => fixedSuggestions(data), [data]);
  const members = data.settings.members.filter((member) => member.kind !== "child");
  // Categoriile folosite des vin primele; cele proprii (ex. „Croitorie”) rămân în grilă.
  const grid = useMemo(() => {
    const base = QUICK_CATEGORIES.map((item) => item.id);
    return [...recent.filter((c) => !base.includes(c)), ...base].slice(0, 16);
  }, [recent]);
  const chosen = addingCustom ? custom.trim() : category;
  const canSave = amount > 0 && Boolean(chosen);
  const save = () => { if (!canSave) return; onSave(quickExpenseTransaction(data, { amount, category: chosen!, place, note, memberId, date })); onClose(); };
  const repeat = (item: (typeof repeats)[number]) => { onSave(quickExpenseTransaction(data, { amount: item.amount, category: item.category, place: item.place, memberId, date: isoToday() })); onClose(); };

  return createPortal(<div className="bn-qx-backdrop" onClick={onClose}>
    <div className="bn-qx" role="dialog" aria-modal="true" aria-label={t("Cheltuială fără bon")} onClick={(event) => event.stopPropagation()}>
      <header className="bn-qx-head"><b>{t("Cheltuială fără bon")}</b><button type="button" className="bn-icon-btn" aria-label={t("Închide")} onClick={onClose}><X size={20} /></button></header>
      <div className="bn-qx-body">
        <label className="bn-qx-amount"><input autoFocus inputMode="decimal" enterKeyHint="done" placeholder="0" value={amountText} aria-label={t("Suma")} onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,]/g, "").slice(0, 9))} onKeyDown={(event) => { if (event.key === "Enter") save(); }} /><em>lei</em></label>
        {repeats.length > 0 && <div className="bn-qx-repeats" aria-label={t("Repetă dintr-o atingere")}>{repeats.map((item) => <button key={`${item.category}-${item.place}-${item.amount}`} type="button" className="bn-chip" onClick={() => repeat(item)}><Repeat2 size={14} aria-hidden="true" /> {quickIcon(item.category)} {item.place || t(item.category)} · {lei(item.amount)}</button>)}</div>}
        <div className="bn-qx-grid" role="radiogroup" aria-label={t("Categoria")}>
          {grid.map((id) => <button key={id} type="button" role="radio" aria-checked={!addingCustom && category === id} className={!addingCustom && category === id ? "is-on" : ""} onClick={() => { setAddingCustom(false); setCategory(id); }}><span aria-hidden="true">{quickIcon(id)}</span><b>{t(id)}</b></button>)}
          <button type="button" role="radio" aria-checked={addingCustom} className={addingCustom ? "is-on" : ""} onClick={() => setAddingCustom(true)}><span aria-hidden="true"><Plus size={20} /></span><b>{t("Alta")}</b></button>
        </div>
        <p className="bn-qx-section">{t("Plăți fixe · nu intră la cumpărături")}</p>
        {fixedRepeats.length > 0 && <div className="bn-qx-repeats" aria-label={t("Plăți fixe recente")}>{fixedRepeats.map((item) => <button key={`${item.category}-${item.place}`} type="button" className="bn-chip" onClick={() => { setAddingCustom(false); setCategory(item.category); if (item.place) setPlace(item.place); if (!amount) setAmountText(String(item.amount).replace(".", ",")); }}><Repeat2 size={14} aria-hidden="true" /> {quickIcon(item.category)} {item.place || t(item.category)} · {lei(item.amount)}</button>)}</div>}
        <div className="bn-qx-grid" role="radiogroup" aria-label={t("Plăți fixe")}>
          {FIXED_QUICK.map((item) => <button key={item.id} type="button" role="radio" aria-checked={!addingCustom && category === item.id} className={!addingCustom && category === item.id ? "is-on" : ""} onClick={() => { setAddingCustom(false); setCategory(item.id); }}><span aria-hidden="true">{item.icon}</span><b>{t(item.label)}</b></button>)}
        </div>
        {addingCustom && <input className="bn-qx-field" autoFocus value={custom} onChange={(event) => setCustom(event.target.value.slice(0, 40))} placeholder={t("Numele categoriei, ex. Croitorie")} aria-label={t("Categorie nouă")} />}
        <button type="button" className="bn-qx-more" aria-expanded={more} onClick={() => setMore((open) => !open)}><ChevronDown size={16} aria-hidden="true" /> {t("Loc, notă, dată")}</button>
        {more && <div className="bn-qx-details">
          <label><span>{t("Locul (opțional)")}</span><input className="bn-qx-field" value={place} onChange={(event) => setPlace(event.target.value.slice(0, 60))} placeholder={t("ex. Bolt, Luca, Parcare Centru")} /></label>
          <label><span>{t("Notă (opțional)")}</span><input className="bn-qx-field" value={note} onChange={(event) => setNote(event.target.value.slice(0, 120))} /></label>
          <label><span>{t("Data")}</span><input className="bn-qx-field" type="date" value={date} max={isoToday()} onChange={(event) => event.target.value && setDate(event.target.value)} /></label>
          {members.length > 1 && <div className="bn-chips" aria-label={t("Cine a plătit")}>{members.map((member) => <button key={member.id} type="button" className={memberId === member.id ? "bn-chip is-on" : "bn-chip"} aria-pressed={memberId === member.id} onClick={() => setMemberId(member.id)}>{member.name}</button>)}</div>}
        </div>}
        <button type="button" className="bn-qx-itemize" onClick={onItemize}><ListPlus size={16} aria-hidden="true" /> {t("Adaugă produse (bon pe rânduri)")}</button>
      </div>
      <footer className="bn-qx-bar"><button type="button" className="bn-btn is-primary" disabled={!canSave} onClick={save}>{canSave ? t("Salvează · {amount}", { amount: lei(amount) }) : amount > 0 ? t("Alege categoria") : t("Scrie suma")}</button></footer>
    </div>
  </div>, document.body);
}
