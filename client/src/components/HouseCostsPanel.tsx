import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Bell, Paperclip, Plus, Trash2 } from "lucide-react";
import { isoToday, newId, parseRomanianAmount, type AppData, type RecurringPayment } from "@/lib/finance-data";
import { t } from "@/lib/i18n";
import { BILL_CATEGORY, daysUntil, kindOf, monthlyTotal, nextDue, SUB_CATEGORY, type CostKind } from "@/lib/house-costs";
import { compressPhoto, deleteWarrantyPhoto, saveWarrantyPhoto } from "@/lib/warranty-photos";

const lei = (v: number) => `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const dateRo = (d: string) => d.split("-").reverse().join(".");
type Draft = { id?: string; name: string; amount: string; variable: boolean; dueDay: string; frequency: "monthly" | "quarterly" | "yearly"; month: string; memberId: string; remindDays: string; attachment?: { name: string; type: string }; file?: File };

const empty = (): Draft => ({ name: "", amount: "", variable: false, dueDay: "1", frequency: "monthly", month: String(new Date().getMonth() + 1), memberId: "", remindDays: "2" });

/** Abonamente sau Facturi: listă cu scadențe și total pe lună, formular simplu. Doar urmărire, fără bani mutați. */
export function HouseCostsPanel({ data, kind, onChange, onClose }: { data: AppData; kind: CostKind; onChange: (next: AppData) => void; onClose: () => void }) {
  const today = isoToday();
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState("");
  const items = useMemo(() => data.recurring.filter((item) => kindOf(item) === kind).map((item) => ({ item, due: nextDue(item, today) })).sort((a, b) => a.due.localeCompare(b.due)), [data.recurring, kind, today]);
  const total = monthlyTotal(items.map((x) => x.item));
  const title = kind === "sub" ? t("Abonamente") : t("Facturi");
  const members = data.settings.members.filter((m) => m.kind !== "child");
  const save = async () => {
    if (!draft) return;
    const amount = parseRomanianAmount(draft.amount);
    if (!draft.name.trim()) { setError(t("Scrie un nume.")); return; }
    if (!draft.variable && !(amount > 0)) { setError(t("Scrie suma sau bifează „variază”.")); return; }
    const id = draft.id || newId("rec");
    let attachment = draft.attachment;
    if (draft.file) {
      try { const url = draft.file.type.startsWith("image/") ? await compressPhoto(draft.file) : await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(draft.file!); }); await saveWarrantyPhoto(`cost-${id}`, url); attachment = { name: draft.file.name, type: draft.file.type }; } catch { setError(t("Fișierul nu s-a putut păstra.")); return; }
    }
    const old = data.recurring.find((x) => x.id === id);
    const row: RecurringPayment = { ...(old || {}), id, name: draft.name.trim(), amount: amount > 0 ? Math.round(amount * 100) / 100 : 0, variable: draft.variable || undefined, category: kind === "sub" ? SUB_CATEGORY : BILL_CATEGORY, sourceId: old?.sourceId || "", memberId: draft.memberId, dueDay: Math.min(31, Math.max(1, Math.round(Number(draft.dueDay) || 1))), frequency: draft.frequency === "monthly" ? undefined : draft.frequency, month: draft.frequency === "monthly" ? undefined : Math.min(12, Math.max(1, Number(draft.month) || 1)), remindDays: Number(draft.remindDays) > 0 ? Math.min(30, Math.round(Number(draft.remindDays))) : undefined, attachment, autoPost: false, active: true, updatedAt: new Date().toISOString() };
    onChange({ ...data, recurring: old ? data.recurring.map((x) => (x.id === id ? row : x)) : [...data.recurring, row] });
    setDraft(undefined); setError("");
  };
  const remove = (id: string) => { void deleteWarrantyPhoto(`cost-${id}`); onChange({ ...data, recurring: data.recurring.filter((x) => x.id !== id), deleted: [...data.deleted, { entity: "recurring", id, deletedAt: new Date().toISOString() }] }); setDraft(undefined); };
  const edit = (item: RecurringPayment) => setDraft({ id: item.id, name: item.name, amount: item.amount ? String(item.amount).replace(".", ",") : "", variable: item.variable === true, dueDay: String(item.dueDay), frequency: item.frequency || "monthly", month: String(item.month || 1), memberId: item.memberId || "", remindDays: String(item.remindDays || 0), attachment: item.attachment });
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  return createPortal(<div className="bn-costs" role="dialog" aria-modal="true" aria-label={title}>
    <header className="bn-costs-head"><button type="button" className="bn-icon-btn" aria-label={t("Înapoi")} onClick={draft ? () => setDraft(undefined) : onClose}><ArrowLeft size={20} /></button><b>{draft ? (draft.id ? t("Modifică") : kind === "sub" ? t("Abonament nou") : t("Factură nouă")) : title}</b><span /></header>
    {!draft ? <div className="bn-costs-body">
      <section className="bn-costs-hero"><small>{t("PE LUNĂ, ÎN MEDIE")}</small><strong>{lei(total)}</strong><span>{items.length ? t("{n} în listă · următoarea: {name}, {date}", { n: items.length, name: items[0].item.name, date: dateRo(items[0].due) }) : kind === "sub" ? t("Adaugă Netflix, telefonul sau sala ca să vezi cât te costă pe lună.") : t("Adaugă curentul, gazul sau internetul ca să nu uiți nicio scadență.")}</span></section>
      <ul className="bn-costs-list">{items.map(({ item, due }) => { const left = daysUntil(due, today); return <li key={item.id}><button type="button" onClick={() => edit(item)}><span className="bn-costs-day"><b>{Number(due.slice(8))}</b><small>{["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"][Number(due.slice(5, 7)) - 1]}</small></span><span className="bn-costs-copy"><b>{item.name}</b><small>{left === 0 ? t("azi") : left === 1 ? t("mâine") : t("în {n} zile", { n: left })}{item.frequency === "yearly" ? ` · ${t("anual")}` : item.frequency === "quarterly" ? ` · ${t("trimestrial")}` : ""}{item.remindDays ? <> · <Bell size={11} aria-hidden="true" /> {t("cu {n} zile înainte", { n: item.remindDays })}</> : null}{item.attachment ? <> · <Paperclip size={11} aria-hidden="true" /></> : null}</small></span><span className="bn-costs-amount">{item.variable ? (item.amount ? `~${lei(item.amount)}` : t("variază")) : lei(item.amount)}</span></button></li>; })}</ul>
      <button type="button" className="bn-btn is-primary bn-costs-add" onClick={() => { setDraft(empty()); setError(""); }}><Plus size={18} aria-hidden="true" /> {kind === "sub" ? t("Adaugă abonament") : t("Adaugă factură")}</button>
      <p className="bn-costs-note">{t("BonAI doar îți amintește și adună costurile. Nu mută bani și nu se leagă de vreun cont bancar.")}</p>
    </div> : <form className="bn-costs-body bn-costs-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label><span>{t("Nume")}</span><input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={kind === "sub" ? t("ex. Netflix") : t("ex. Curent Hidroelectrica")} autoFocus /></label>
      <label><span>{t("Sumă (lei)")}</span><input inputMode="decimal" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} placeholder={draft.variable ? t("estimare, opțional") : "0,00"} /></label>
      <label className="bn-check"><input type="checkbox" checked={draft.variable} onChange={(e) => set({ variable: e.target.checked })} /> <span>{t("Suma variază de la o lună la alta")}</span></label>
      <div className="bn-costs-row"><label><span>{t("Ziua scadenței")}</span><input inputMode="numeric" value={draft.dueDay} onChange={(e) => set({ dueDay: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></label>
        <label><span>{t("Cât de des")}</span><select value={draft.frequency} onChange={(e) => set({ frequency: e.target.value as Draft["frequency"] })}><option value="monthly">{t("Lunar")}</option><option value="quarterly">{t("Trimestrial")}</option><option value="yearly">{t("Anual")}</option></select></label></div>
      {draft.frequency !== "monthly" && <label><span>{t("Luna scadenței")}</span><select value={draft.month} onChange={(e) => set({ month: e.target.value })}>{["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"].map((m, i) => <option key={m} value={String(i + 1)}>{t(m)}</option>)}</select></label>}
      {members.length > 1 && <label><span>{t("Al cui (opțional)")}</span><select value={draft.memberId} onChange={(e) => set({ memberId: e.target.value })}><option value="">{t("Al familiei")}</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
      <label><span>{t("Amintire")}</span><select value={draft.remindDays} onChange={(e) => set({ remindDays: e.target.value })}><option value="0">{t("Fără amintire")}</option>{[1, 2, 3, 5, 7].map((n) => <option key={n} value={String(n)}>{n === 1 ? t("Cu o zi înainte") : t("Cu {n} zile înainte", { n })}</option>)}</select></label>
      <label className="bn-file"><Paperclip size={16} aria-hidden="true" /><span>{draft.file?.name || draft.attachment?.name || (kind === "sub" ? t("Atașează contractul (poză sau PDF)") : t("Atașează factura (poză sau PDF)"))}</span><input type="file" accept="image/*,application/pdf" onChange={(e) => set({ file: e.target.files?.[0] })} /></label>
      {error && <p className="bn-costs-error" role="alert">{error}</p>}
      <div className="bn-costs-actions">{draft.id && <button type="button" className="bn-btn" onClick={() => remove(draft.id!)}><Trash2 size={16} aria-hidden="true" /> {t("Șterge")}</button>}<button type="submit" className="bn-btn is-primary">{t("Salvează")}</button></div>
    </form>}
  </div>, document.body);
}

export default HouseCostsPanel;
