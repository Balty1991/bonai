import { askConfirm } from "@/lib/confirm-dialog";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Peste tot ecranul: un strămoș cu transform ar prinde altfel `position: fixed`. */
const Layer = ({ children }: { children: ReactNode }) => typeof document === "undefined" ? <>{children}</> : createPortal(children, document.body);
import { Check, ChevronLeft, Copy, Plus, ShieldCheck, RotateCcw, Sparkles, Trash2, X, Pencil } from "lucide-react";
import type { AppData } from "@/lib/finance-data";
import { productsLabel, t } from "@/lib/i18n";
import { receiptCategories, type ScanPrefill } from "@/lib/receipt-scan";
import { checkReceiptLines, readShelfSeen } from "@/lib/discount-check";
import { productObservations } from "@/lib/personal-inflation";
import { DiscountFlags } from "@/components/DiscountFlags";
import { findDuplicateReceipt } from "@/lib/receipt-duplicates";
import { DEFAULT_WARRANTY_MONTHS, dismissedCandidate, warrantyCandidates, warrantyFromCandidate, type WarrantyCandidate } from "@/lib/warranties";
import type { Warranty } from "@/lib/warranty-data";
import { listItemsOnReceipt, visibleShopping } from "@/lib/shopping-list";
import { CATEGORY_COLORS, categoryIcon, groupRows, round2, rowsFromPrefill, rowsTotal, totalGap, type ReviewRow } from "@/lib/receipt-review-model";

const lei = (value: number) => `${value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0lei`;
const num = (value: string) => { const parsed = Number(String(value).replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; };
/** Lanțul magazinului: primul cuvânt după „Cumpărături”/„Bon” (titlul bonului scanat e „Cumpărături Profi”). */
export const chainOf = (vendor: string) => String(vendor || "").trim().replace(/^(cumpărături|cumparaturi|bon)\s+/i, "").split(/\s+/)[0]?.toLowerCase() || "";
const fmtDate = (iso?: string) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("ro-RO", { weekday: "short", day: "numeric", month: "long" }) : "";

export type ReviewSave = { rows: ReviewRow[]; total: number; store: string; date: string; memberId?: string; /** Corectate de om dacă scanarea le-a citit greșit. */ time?: string; city?: string };

/**
 * Verificarea bonului scanat, în locul formularului vechi de mișcare: fără surse, plicuri sau venituri.
 * Produsele pe categorii, cu subtotal și reduceri; totalul tipărit e verificat înainte de salvare.
 */


export function ReceiptReview({ data, prefill, onSave, onCancel, onRescan, onWarranty, mode = "new", receiptId }: { data: AppData; prefill: ScanPrefill; onSave: (save: ReviewSave) => void; onCancel: () => void; onRescan?: () => void; /** Garanția propusă din bonul abia salvat (adăugată sau „Nu are garanție”). */ onWarranty?: (warranty: Warranty) => void; mode?: "new" | "edit"; receiptId?: string }) {
  const editMode = mode === "edit";
  const [rows, setRows] = useState<ReviewRow[]>(() => rowsFromPrefill(prefill));
  const [store, setStore] = useState(() => prefill.title.replace(/^Bon\s*[—-]\s*/, ""));
  const [editing, setEditing] = useState<string>();
  const [memberId, setMemberId] = useState<string | undefined>(data.settings.selfMemberId);
  const [saved, setSaved] = useState<ReviewSave>();
  /** Produsele din lista de cumpărături găsite pe bonul salvat (Home le bifează). */
  const [ticked, setTicked] = useState<string[]>([]);
  const [date, setDate] = useState(() => prefill.date || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => prefill.store?.time || "");
  const [city, setCity] = useState(() => prefill.store?.city || "");
  const [details, setDetails] = useState(false);
  const categories = useMemo(() => receiptCategories(data), [data]);
  const groups = groupRows(rows);
  const total = rowsTotal(rows);
  // La editare, totalul de pe bon se poate corecta și el (ex. bonul fusese citit greșit).
  const [printed, setPrinted] = useState(prefill.amount);
  const gap = totalGap(printed, rows);
  const discount = round2(rows.reduce((sum, row) => sum + row.discount, 0));
  const history = useMemo(() => productObservations(data).filter((o) => o.receiptId !== receiptId), [data, receiptId]);
  const flags = useMemo(() => checkReceiptLines(rows.map((row) => ({ label: row.label, amount: row.amount, qty: row.qty, discount: row.discount })), store, date, history, readShelfSeen()), [rows, store, date, history]);
  const members = data.settings.members.filter((member) => member.kind !== "child");
  // Bonurile de dinainte de deschiderea ecranului: după salvare, bonul ăsta nu e „ultima dată” față de el însuși.
  const [before] = useState(() => data.receipts.filter((receipt) => receipt.id !== receiptId));
  const previous = useMemo(() => before.filter((receipt) => chainOf(receipt.vendor) === chainOf(store) && receipt.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0], [before, store, date]);
  // Bonul mai e salvat? Se verifică din nou la fiecare schimbare de magazin, dată, oră sau total.
  const [notTwin, setNotTwin] = useState<string>();
  const twin = useMemo(() => editMode ? undefined : findDuplicateReceipt(before, { vendor: store, date, amount: printed > 0 ? printed : total, time, storeCui: prefill.store?.storeCui, labels: rows.map((row) => row.label) }), [editMode, before, store, date, printed, total, time, prefill.store?.storeCui, rows]);
  const twinShown = twin && twin.id !== notTwin ? twin : undefined;
  // După salvare: produsele din bonul ăsta care par să aibă garanție (electronice, electrocasnice, scumpe).
  const warrantyOffers = useMemo(() => {
    if (!saved || !onWarranty) return [];
    const old = new Set(before.map((receipt) => receipt.id));
    // Bonul nou e singurul care n-a existat la deschiderea ecranului, cu data aleasă aici.
    return warrantyCandidates(data).filter((item) => item.receiptId && !old.has(item.receiptId) && item.purchaseDate === saved.date);
  }, [saved, onWarranty, before, data]);
  // Lista se fixează la prima apariție: după „Adaug” rândul rămâne, cu bifa, nu dispare.
  const [offers, setOffers] = useState<WarrantyCandidate[]>();
  const [answered, setAnswered] = useState<Record<string, "added" | "no">>({});
  useEffect(() => { if (!offers && warrantyOffers.length) setOffers(warrantyOffers.slice(0, 3)); }, [offers, warrantyOffers]);
  const answer = (item: WarrantyCandidate, added: boolean) => { onWarranty?.(added ? warrantyFromCandidate(item, DEFAULT_WARRANTY_MONTHS) : dismissedCandidate(item)); setAnswered((map) => ({ ...map, [item.id]: added ? "added" : "no" })); };
  const patch = (key: string, change: Partial<ReviewRow>) => setRows((list) => list.map((row) => row.key === key ? { ...row, ...change } : row));
  const addRow = (row?: Partial<ReviewRow>) => { const key = `m${Date.now()}`; setRows((list) => [...list, { key, label: "", raw: "", qty: 1, amount: 0, discount: 0, category: categories[0] || "Alimente", manual: true, ...row }]); if (!row) setEditing(key); };
  const save = async () => {
    if (twinShown) {
      const ok = await askConfirm(t("Ai salvat deja un bon {store} pe {date}, de {amount}. Îl salvez încă o dată?", { store: twinShown.vendor, date: fmtDate(twinShown.date), amount: lei(twinShown.amount) }), { title: t("Bonul pare deja înregistrat"), confirmLabel: t("E alt bon, salvează") });
      if (!ok) return;
    }
    // Citit offline: un total care nu se potrivește nu se salvează fără să întrebăm.
    if (prefill.readBy === "offline" && gap !== 0 && printed > 0) {
      const ok = await askConfirm(t("Produsele fac {sum}, dar pe bon scrie {printed}. Salvez {sum}? Poți corecta rândurile înainte.", { sum: lei(total), printed: lei(printed) }), { title: t("Totalul nu se potrivește"), confirmLabel: t("Salvez {sum}", { sum: lei(total) }) });
      if (!ok) return;
    }
    const clean = rows.filter((row) => row.label.trim() && row.amount > 0); if (!clean.length) return; const result = { rows: clean, total: rowsTotal(clean), store: store.trim() || t("Magazin"), date, memberId, time: /^\d{1,2}:\d{2}$/.test(time.trim()) ? time.trim() : "", city: city.trim().slice(0, 60) }; if (!editMode) setTicked(listItemsOnReceipt(visibleShopping(data.settings.shoppingList || []).todo, clean.map((row) => row.label)).map((item) => item.text)); onSave(result); if (editMode) onCancel(); else setSaved(result); };

  if (saved) {
    const split = groupRows(saved.rows);
    return <Layer><div className="bn-review" role="dialog" aria-modal="true" aria-label={t("Bon salvat")}>
      <div className="bn-review-scroll bn-aha">
        <div className="bn-aha-badge" aria-hidden="true"><Check size={34} /></div>
        <p className="sh-kicker">{t("BON SALVAT")}</p>
        <h2 className="bn-aha-total">{lei(saved.total)}</h2>
        <p className="sh-muted">{saved.store} · {fmtDate(saved.date)}</p>
        <div className="bn-split" aria-hidden="true">{split.map((group, index) => <i key={group.category} style={{ flexGrow: group.share, background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />)}</div>
        <ul className="bn-aha-list">{split.map((group, index) => <li key={group.category}><span className="bn-dot" style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /><span>{categoryIcon(group.category)} {group.category}</span><b>{lei(group.total)}</b></li>)}</ul>
        {discount > 0 && <p className="bn-aha-save"><Sparkles size={16} aria-hidden="true" /> {t("Ai prins reduceri de {amount} pe bonul ăsta.", { amount: lei(discount) })}</p>}
        {previous && <p className="sh-muted">{t("Ultima dată la {store}: {amount}, {date}.", { store: previous.vendor, amount: lei(previous.amount), date: fmtDate(previous.date) })}</p>}
        {ticked.length > 0 && <p className="bn-aha-save" role="status"><Check size={16} aria-hidden="true" /> {ticked.length === 1 ? t("Am bifat din listă: {items}", { items: ticked[0] }) : t("Am bifat {count} produse din listă: {items}", { count: ticked.length, items: ticked.slice(0, 4).join(", ") + (ticked.length > 4 ? "…" : "") })}</p>}
        {offers && offers.length > 0 && <section className="bn-warranty-offer" aria-label={t("Garanții din bonul ăsta")}>
          <p className="sh-kicker"><ShieldCheck size={15} aria-hidden="true" /> {t("ARE GARANȚIE?")}</p>
          <ul>{offers.map((item) => <li key={item.id}>
            <span><b>{item.name}</b><small>{item.returnDays ? t("{price} · 2 ani garanție · {days} zile de retur", { price: lei(item.price), days: item.returnDays }) : t("{price} · 2 ani garanție", { price: lei(item.price) })}</small></span>
            {answered[item.id] ? <span className={`bn-chip ${answered[item.id] === "added" ? "is-ok" : ""}`} role="status">{answered[item.id] === "added" ? <><Check size={14} aria-hidden="true" /> {t("Garanție adăugată")}</> : t("Fără garanție")}</span>
              : <span className="bn-warranty-offer-actions">
                <button type="button" className="bn-btn is-primary" onClick={() => answer(item, true)}>{t("Adaug garanția")}</button>
                <button type="button" className="bn-btn" onClick={() => answer(item, false)}>{t("Nu are")}</button>
              </span>}
          </li>)}</ul>
          <p className="sh-muted sh-note">{t("Îți amintesc cu 30 de zile înainte să expire și păstrez bonul ca dovadă, în Cont → Garanții.")}</p>
        </section>}
      </div>
      <div className="bn-review-bar"><button type="button" className="bn-btn is-primary" onClick={onCancel}>{t("Gata")}</button></div>
    </div></Layer>;
  }

  return <Layer><div className="bn-review" role="dialog" aria-modal="true" aria-label={editMode ? t("Editează bonul") : t("Verifică bonul")}>
    <header className="bn-review-top">
      <button type="button" className="bn-icon-btn" aria-label={t("Înapoi")} onClick={onCancel}><ChevronLeft size={22} /></button>
      <label className="bn-store-pill"><span className="bn-avatar" aria-hidden="true">{(store.trim()[0] || "?").toUpperCase()}</span><input value={store} placeholder={t("Magazinul")} onChange={(event) => setStore(event.target.value)} aria-label={t("Magazinul")} /></label>
      {onRescan && !editMode ? <button type="button" className="bn-icon-btn" aria-label={t("Scanează din nou")} onClick={onRescan}><RotateCcw size={19} /></button> : <span className="bn-icon-btn is-ghost" aria-hidden="true" />}
    </header>
    <div className="bn-review-scroll">
      <section className="bn-review-hero">
        <button type="button" className="bn-review-when" aria-expanded={details} onClick={() => setDetails(!details)}><span className="sh-kicker">{fmtDate(date)}{time ? ` · ${time}` : ""}{city ? ` · ${city}` : ""}</span><Pencil size={14} aria-hidden="true" /><span className="sr-only">{t("Modifică data, ora, orașul")}</span></button>
        {details && <div className="bn-review-details">
          <label><span>{t("Data bonului")}</span><input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => event.target.value && setDate(event.target.value)} /></label>
          <label><span>{t("Ora")}</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
          <label><span>{t("Orașul")}</span><input value={city} maxLength={60} onChange={(event) => setCity(event.target.value)} placeholder={t("opțional")} /></label>
          <label><span>{t("Totalul de pe bon")}</span><input inputMode="decimal" defaultValue={printed > 0 ? String(printed).replace(".", ",") : ""} placeholder="0,00" onChange={(event) => setPrinted(round2(num(event.target.value)))} /></label>
          <button type="button" className="bn-btn is-primary" onClick={() => setDetails(false)}><Check size={16} aria-hidden="true" /> {t("Gata")}</button>
        </div>}
        <p className="bn-review-total">{lei(total)}</p>
        <div className="bn-chips">
          {prefill.readBy === "offline" && <span className="bn-chip is-offline">{t("Citit pe telefon")}</span>}
          <span className="bn-chip">{productsLabel(rows.length)}</span>
          {discount > 0 && <span className="bn-chip is-save">−{lei(discount)} {t("reduceri")}</span>}
          {gap === 0 ? <span className="bn-chip is-ok"><Check size={14} aria-hidden="true" /> {printed > 0 ? t("Totalul se potrivește") : t("Fără total tipărit")}</span> : <span className="bn-chip is-warn">{gap > 0 ? t("Lipsesc {amount}", { amount: lei(gap) }) : t("Cu {amount} peste total", { amount: lei(-gap) })}</span>}
        </div>
        {groups.length > 1 && <div className="bn-split" aria-hidden="true">{groups.map((group, index) => <i key={group.category} style={{ flexGrow: group.share, background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />)}</div>}
        {gap !== 0 && <div className="bn-gap-actions">
          {editMode && <button type="button" className="bn-btn" onClick={() => setPrinted(total)}><Check size={16} aria-hidden="true" /> {t("Totalul de pe bon e {amount}", { amount: lei(total) })}</button>}
          {gap > 0 && <button type="button" className="bn-btn" onClick={() => addRow({ label: t("Diferență bon"), raw: "", amount: gap, category: "Altele" })}><Plus size={16} aria-hidden="true" /> {t("Adaugă rând cu diferența")}</button>}
          {onRescan && !editMode && <button type="button" className="bn-btn" onClick={onRescan}><RotateCcw size={16} aria-hidden="true" /> {t("Scanează din nou")}</button>}
        </div>}
        {prefill.warning && <p className="sh-muted sh-note">{prefill.warning}</p>}
      </section>
      {twinShown && <section className="bn-dupe" role="alert">
        <span className="bn-dupe-icon" aria-hidden="true"><Copy size={20} /></span>
        <div>
          <b>{t("Ai mai înregistrat bonul ăsta")}</b>
          <p>{t("Pe {date}{time} ai salvat un bon {store} de {amount}{products}.", { date: fmtDate(twinShown.date), time: twinShown.time ? `, ${twinShown.time}` : "", store: twinShown.vendor, amount: lei(twinShown.amount), products: twinShown.lines?.length ? `, ${productsLabel(twinShown.lines.length)}` : "" })}</p>
          <div className="bn-dupe-actions">
            <button type="button" className="bn-btn is-primary" onClick={onCancel}>{t("Nu-l salva")}</button>
            <button type="button" className="bn-btn" onClick={() => setNotTwin(twinShown.id)}>{t("E alt bon")}</button>
          </div>
        </div>
      </section>}
      <DiscountFlags flags={flags} />
      {groups.map((group, index) => <section key={group.category} className="bn-group">
        <header className="bn-group-head"><span className="bn-cat-icon" style={{ boxShadow: `inset 0 0 0 1px ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]}` }} aria-hidden="true">{categoryIcon(group.category)}</span><b>{group.category}</b><small>{Math.round(group.share * 100)}%</small><span className="bn-group-sum">{lei(group.total)}</span></header>
        <ul className="bn-items">{group.rows.map((row) => <li key={row.key} className={editing === row.key ? "is-editing" : ""}>
          {editing === row.key ? <div className="bn-edit">
            <label><span>{t("Produs")}</span><input autoFocus value={row.label} onChange={(event) => patch(row.key, { label: event.target.value })} /></label>
            {row.raw && <small className="sh-muted">{t("Pe bon: {raw}", { raw: row.raw })}</small>}
            <div className="bn-edit-grid">
              <label><span>{t("Cantitate")}</span><input inputMode="decimal" defaultValue={String(row.qty).replace(".", ",")} onChange={(event) => patch(row.key, { qty: num(event.target.value) || 1 })} /></label>
              <label><span>{t("Total (lei)")}</span><input inputMode="decimal" defaultValue={row.amount ? String(row.amount).replace(".", ",") : ""} onChange={(event) => patch(row.key, { amount: round2(num(event.target.value)) })} /></label>
              <label><span>{t("Reducere (lei)")}</span><input inputMode="decimal" defaultValue={row.discount ? String(row.discount).replace(".", ",") : ""} placeholder="0" onChange={(event) => patch(row.key, { discount: Math.max(0, round2(num(event.target.value))) })} /></label>
            </div>
            <label><span>{t("Categorie")}</span><select value={row.category} onChange={(event) => patch(row.key, { category: event.target.value })}>{categories.map((item) => <option key={item} value={item}>{categoryIcon(item)} {item}</option>)}</select></label>
            <div className="bn-edit-actions"><button type="button" className="bn-btn" onClick={() => { setRows((list) => list.filter((item) => item.key !== row.key)); setEditing(undefined); }}><Trash2 size={16} aria-hidden="true" /> {t("Șterge")}</button><button type="button" className="bn-btn is-primary" onClick={() => setEditing(undefined)}><Check size={16} aria-hidden="true" /> {t("Gata")}</button></div>
          </div> : <button type="button" className="bn-item" onClick={() => setEditing(row.key)}>
            <span className="bn-item-copy"><b>{row.label || t("Produs fără nume")}</b><small><span className="bn-chip is-mini">{row.qty !== 1 ? `${String(row.qty).replace(".", ",")} × ${lei(round2(row.amount / row.qty))}` : t("1 buc")}</span>{row.discount > 0 && <span className="bn-chip is-mini is-save">−{lei(row.discount)}</span>}</small></span>
            <span className="bn-item-price">{lei(row.amount)}</span>
          </button>}
        </li>)}</ul>
      </section>)}
      <p className="sh-muted sh-note bn-review-hint"><Pencil size={13} aria-hidden="true" /> {t("Ceva citit greșit? Apasă pe produs ca să corectezi numele, cantitatea sau prețul; sus, pe dată, pentru data, ora, orașul și totalul.")}</p>
      <button type="button" className="bn-add" onClick={() => addRow()}><span aria-hidden="true"><Plus size={20} /></span>{t("Adaugă un produs")}</button>
      {members.length > 1 && <section className="bn-who"><p className="sh-kicker">{t("CINE A CUMPĂRAT (OPȚIONAL)")}</p><div className="bn-chips">{members.map((member) => <button key={member.id} type="button" className={memberId === member.id ? "bn-chip is-on" : "bn-chip"} aria-pressed={memberId === member.id} onClick={() => setMemberId(memberId === member.id ? undefined : member.id)}>{member.name}</button>)}</div></section>}
    </div>
    <footer className="bn-review-bar">
      <div className="bn-bar-total"><small>{t("Total")}</small><b>{lei(total)}</b></div>
      <button type="button" className="bn-btn" onClick={onCancel}><X size={16} aria-hidden="true" /> {t("Anulează")}</button>
      <button type="button" className="bn-btn is-primary" disabled={!rows.some((row) => row.label.trim() && row.amount > 0)} onClick={() => void save()}>{editMode ? t("Salvează modificările") : t("Salvează bonul")}</button>
    </footer>
  </div></Layer>;
}
