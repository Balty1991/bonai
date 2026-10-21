/**
 * Garanții și retururi (Mai mult → Cumpărături și bonuri): propunerile din bonuri, garanțiile
 * familiei cu ultima zi de retur și data de expirare, poza bonului și adăugarea de mână.
 */
import { useEffect, useMemo, useState } from "react";
import { Camera, Check, Plus, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { isoToday, newId, parseRomanianAmount, type AppData } from "@/lib/finance-data";
import type { Warranty } from "@/lib/warranty-data";
import { DEFAULT_WARRANTY_MONTHS, defaultReturnDays, dismissedCandidate, liveWarranties, removeWarranty, upsertWarranty, warrantyCandidates, warrantyFromCandidate, type WarrantyStatus } from "@/lib/warranties";
import { compressPhoto, deleteWarrantyPhoto, loadWarrantyPhoto, saveWarrantyPhoto } from "@/lib/warranty-photos";
import { RoDateInput } from "@/components/RoDateInput";
import { lei } from "@/lib/money-format";
import { t } from "@/lib/i18n";
import { dateText } from "@/pages/home-kit";

const MONTHS = [12, 24, 36, 60];
const RETURNS = [0, 14, 30];
const returnLabel = (days: number) => days ? t("{days} zile", { days }) : t("fără");
const monthsLabel = (months: number) => months % 12 === 0 ? (months === 12 ? t("1 an") : t("{years} ani", { years: months / 12 })) : t("{months} luni", { months });

function Chips<T extends number>({ label, values, value, text, onPick }: { label: string; values: T[]; value: T; text: (value: T) => string; onPick: (value: T) => void }) {
  return <div className="bf-amount-suggestions" role="group" aria-label={label}><span>{label}</span>{values.map((item) => <button type="button" key={item} aria-pressed={value === item} className={value === item ? "is-on" : ""} onClick={() => onPick(item)}>{text(item)}</button>)}</div>;
}

function StatusLine({ status }: { status: WarrantyStatus }) {
  if (status.state === "return" && status.returnUntil !== undefined) {
    return <b style={{ color: "var(--cf-danger, #b3261e)" }}>{status.returnDaysLeft === 0 ? t("Azi e ultima zi de retur") : status.returnDaysLeft === 1 ? t("Mâine e ultima zi de retur") : t("Retur până pe {date} (încă {days} zile)", { date: dateText(status.returnUntil, true), days: status.returnDaysLeft ?? 0 })}</b>;
  }
  if (!status.until) return <span style={{ color: "var(--cf-muted)" }}>{t("Fără garanție urmărită")}</span>;
  if (status.state === "expired") return <span style={{ color: "var(--cf-muted)" }}>{t("Garanția a expirat pe {date}", { date: dateText(status.until, true) })}</span>;
  if (status.state === "expiring") return <b style={{ color: "var(--cf-warning, #8a5a00)" }}>{t("Garanția expiră pe {date}, în {days} zile", { date: dateText(status.until, true), days: status.daysLeft ?? 0 })}</b>;
  return <span>{t("Garanție până pe {date}", { date: dateText(status.until, true) })}</span>;
}

function Photo({ warranty, onChange }: { warranty: Warranty; onChange: (hasPhoto: boolean) => void }) {
  const [src, setSrc] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; if (warranty.hasPhoto) void loadWarrantyPhoto(warranty.id).then((value) => { if (alive) setSrc(value); }); return () => { alive = false; }; }, [warranty.id, warranty.hasPhoto]);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const data = await compressPhoto(file);
      await saveWarrantyPhoto(warranty.id, data);
      setSrc(data);
      onChange(true);
    } catch {
      setError(t("Poza nu s-a putut salva pe telefon. Încearcă din nou."));
    } finally {
      setBusy(false);
    }
  };
  return <div style={{ display: "grid", gap: 6 }}>
    {src && <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={t("Bonul pentru {name}", { name: warranty.name })} style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 12, background: "var(--cf-surface-alt, #f1f4f2)" }} /></a>}
    {warranty.hasPhoto && !src && <p className="bf-helper" style={{ margin: 0 }}>{t("Poza bonului e pe telefonul care a făcut-o.")}</p>}
    <label className="bf-secondary" style={{ justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
      <Camera size={16} aria-hidden="true" /> {busy ? t("Se salvează…") : src ? t("Altă poză a bonului") : t("Fă o poză bonului")}
      <input type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
    </label>
    {error && <p className="bf-helper" role="alert" style={{ margin: 0 }}>{error}</p>}
  </div>;
}

type Draft = { id?: string; name: string; store: string; priceText: string; purchaseDate: string; months: number; returnDays: number; note: string; base?: Warranty };

export function WarrantiesPanel({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const today = isoToday();
  const live = useMemo(() => liveWarranties(data, today), [data, today]);
  const candidates = useMemo(() => warrantyCandidates(data, today), [data, today]);
  const [openId, setOpenId] = useState("");
  const [draft, setDraft] = useState<Draft | undefined>();
  const [undo, setUndo] = useState<Warranty | undefined>();
  const active = live.filter((item) => item.status.state !== "expired" && item.status.state !== "none");
  const past = live.filter((item) => item.status.state === "expired" || item.status.state === "none");
  const covered = active.reduce((sum, item) => sum + item.warranty.price, 0);

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(draft.purchaseDate)) return;
    const base = draft.base;
    const warranty: Warranty = {
      ...(base || {}),
      id: draft.id || newId("warranty"), name: name.slice(0, 80), price: Math.max(0, Math.round(parseRomanianAmount(draft.priceText) * 100) / 100),
      purchaseDate: draft.purchaseDate, months: draft.months, returnDays: draft.returnDays, updatedAt: new Date().toISOString(),
      ...(draft.store.trim() ? { store: draft.store.trim().slice(0, 60) } : { store: undefined }),
      ...(draft.note.trim() ? { note: draft.note.trim().slice(0, 200) } : { note: undefined }),
    };
    delete warranty.deleted;
    if (!warranty.store) delete warranty.store;
    if (!warranty.note) delete warranty.note;
    onChange(upsertWarranty(data, warranty));
    setDraft(undefined);
    setOpenId(warranty.id);
  };
  const remove = (warranty: Warranty) => {
    onChange(removeWarranty(data, warranty.id));
    void deleteWarrantyPhoto(warranty.id);
    setUndo(warranty);
    setOpenId("");
  };
  const edit = (warranty: Warranty) => setDraft({ id: warranty.id, name: warranty.name, store: warranty.store || "", priceText: String(warranty.price || ""), purchaseDate: warranty.purchaseDate, months: warranty.months, returnDays: warranty.returnDays, note: warranty.note || "", base: warranty });

  const form = draft && <form className="bf-sub-board" style={{ display: "grid", gap: 10 }} onSubmit={(event) => { event.preventDefault(); save(); }}>
    <p className="bf-kicker">{draft.id ? t("GARANȚIA") : t("GARANȚIE NOUĂ")}</p>
    <label className="bf-field"><span>{t("Ce produs")}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={t("ex. Mașina de spălat, Telefonul Anei")} maxLength={80} /></label>
    <label className="bf-field"><span>{t("De unde")}</span><input value={draft.store} onChange={(event) => setDraft({ ...draft, store: event.target.value, ...(draft.id ? {} : { returnDays: defaultReturnDays(event.target.value) }) })} placeholder={t("ex. eMAG, Altex, Dedeman")} maxLength={60} /></label>
    <label className="bf-field"><span>{t("Cât a costat (lei)")}</span><input value={draft.priceText} onChange={(event) => setDraft({ ...draft, priceText: event.target.value })} inputMode="decimal" /></label>
    <label className="bf-field"><span>{t("Când l-ai cumpărat")}</span><RoDateInput value={draft.purchaseDate} onChange={(event) => event.target.value && setDraft({ ...draft, purchaseDate: event.target.value })} /></label>
    <Chips label={t("Garanție")} values={MONTHS} value={draft.months} text={monthsLabel} onPick={(months) => setDraft({ ...draft, months })} />
    <Chips label={t("Retur")} values={RETURNS} value={draft.returnDays} text={returnLabel} onPick={(returnDays) => setDraft({ ...draft, returnDays })} />
    <small className="bf-helper" style={{ margin: 0 }}>{t("Produsele noi au 2 ani garanție prin lege. Cumpărat online, ai 14 zile să-l returnezi fără motiv; unele magazine dau 30.")}</small>
    <label className="bf-field"><span>{t("Notă (opțional)")}</span><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder={t("ex. seria, service-ul autorizat")} maxLength={200} /></label>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button type="submit" className="bf-primary" disabled={!draft.name.trim()}><Check size={16} aria-hidden="true" /> {t("Salvează")}</button><button type="button" className="bf-ghost" onClick={() => setDraft(undefined)}>{t("Renunță")}</button></div>
  </form>;

  const row = ({ warranty, status }: (typeof live)[number]) => {
    const open = openId === warranty.id;
    return <li key={warranty.id} style={{ display: "block", borderTop: "1px solid var(--cf-line)" }}>
      <button type="button" onClick={() => setOpenId(open ? "" : warranty.id)} aria-expanded={open} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, alignItems: "center", padding: "10px 0", background: "none", border: 0, textAlign: "left", color: "var(--cf-ink)" }}>
        <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
          <b style={{ overflowWrap: "break-word" }}>{warranty.name}</b>
          <small><StatusLine status={status} /></small>
        </span>
        <span style={{ textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{warranty.price > 0 ? lei(warranty.price) : ""}</span>
      </button>
      {status.until && status.state !== "expired" && <div aria-hidden="true" style={{ height: 4, borderRadius: 4, background: "var(--cf-line)", margin: "-4px 0 8px", overflow: "hidden" }}><div style={{ width: `${Math.round(status.used * 100)}%`, height: "100%", background: status.state === "expiring" ? "var(--cf-warning, #c88a00)" : "var(--cf-primary, #2f6f5b)" }} /></div>}
      {open && <div style={{ display: "grid", gap: 8, padding: "0 0 12px" }}>
        <p className="bf-helper" style={{ margin: 0 }}>{[warranty.store, t("cumpărat pe {date}", { date: dateText(warranty.purchaseDate, true) }), warranty.months ? t("garanție {period}", { period: monthsLabel(warranty.months) }) : ""].filter(Boolean).join(" · ")}</p>
        {warranty.note && <p className="bf-helper" style={{ margin: 0 }}>{warranty.note}</p>}
        <Photo warranty={warranty} onChange={(hasPhoto) => onChange(upsertWarranty(data, { ...warranty, hasPhoto, updatedAt: new Date().toISOString() }))} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="bf-secondary" onClick={() => edit(warranty)}>{t("Modifică")}</button>
          <button type="button" className="bf-ghost" onClick={() => remove(warranty)}><Trash2 size={16} aria-hidden="true" /> {t("Șterge")}</button>
        </div>
      </div>}
    </li>;
  };

  return <div style={{ display: "grid", gap: 12 }}>
    <section className="bf-sub-board" aria-labelledby="bf-warranty-title">
      <div className="bf-section-heading">
        <div>
          <p className="bf-kicker">{t("GARANȚII ȘI RETURURI")}</p>
          <h2 id="bf-warranty-title">{active.length ? t("{count} produse în garanție · {amount}", { count: active.length, amount: lei(covered) }) : t("Bonul e dovada. Ți-l păstrez și îți amintesc la timp.")}</h2>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </div>
      <p className="bf-helper">{t("Îți amintesc cu o zi înainte de ultima zi de retur și cu 30 de zile înainte să expire garanția. Fă o poză bonului: hârtia se șterge în câteva luni.")}</p>
      {undo && <p className="bf-notice" role="status" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{t("Am șters „{name}”.", { name: undo.name })}<button type="button" className="bf-link-button" onClick={() => { onChange(upsertWarranty(data, { ...undo, hasPhoto: false, updatedAt: new Date().toISOString() })); setUndo(undefined); }}><Undo2 size={14} aria-hidden="true" /> {t("Anulează")}</button></p>}
      {active.length > 0 && <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>{active.map(row)}</ul>}
      {!draft && <button type="button" className="bf-secondary" style={{ justifySelf: "start", marginTop: 8 }} onClick={() => setDraft({ name: "", store: "", priceText: "", purchaseDate: today, months: DEFAULT_WARRANTY_MONTHS, returnDays: 0, note: "" })}><Plus size={16} aria-hidden="true" /> {t("Adaugă o garanție")}</button>}
    </section>

    {form}

    {candidates.length > 0 && <section className="bf-sub-board" aria-labelledby="bf-warranty-suggest-title">
      <p className="bf-kicker">{t("DIN BONURILE TALE")}</p>
      <h2 id="bf-warranty-suggest-title">{t("Au garanție?")}</h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid" }}>
        {candidates.map((candidate) => <li key={candidate.id} style={{ display: "grid", gap: 6, padding: "10px 0", borderTop: "1px solid var(--cf-line)" }}>
          <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8 }}><b style={{ overflowWrap: "break-word" }}>{candidate.name}</b><span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{lei(candidate.price)}</span></span>
          <small style={{ color: "var(--cf-muted)" }}>{[candidate.store, dateText(candidate.purchaseDate, true), candidate.returnDays ? t("retur {days} zile", { days: candidate.returnDays }) : ""].filter(Boolean).join(" · ")}</small>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="bf-primary" onClick={() => { const warranty = warrantyFromCandidate(candidate); onChange(upsertWarranty(data, warranty)); setOpenId(warranty.id); }}><Check size={16} aria-hidden="true" /> {t("Da, 2 ani")}</button>
            <button type="button" className="bf-ghost" onClick={() => onChange(upsertWarranty(data, dismissedCandidate(candidate)))}><X size={16} aria-hidden="true" /> {t("Nu are")}</button>
          </span>
        </li>)}
      </ul>
    </section>}

    {past.length > 0 && <details className="bf-sub-board">
      <summary style={{ cursor: "pointer" }}><b>{t("Expirate ({count})", { count: past.length })}</b></summary>
      <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>{past.map(row)}</ul>
    </details>}
  </div>;
}
