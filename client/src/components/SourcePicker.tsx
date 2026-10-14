/**
 * „Plătit din”: în locul listei de sistem (nume, proprietar și sold lipite pe un rând, greu de
 * citit pe telefon), o foaie cu sursele grupate pe persoană. Fiecare rând: numele mare, felul
 * sursei mic, soldul aliniat în dreapta; sursele goale stau estompate, nu ascunse.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, Check, ChevronDown, CreditCard, Ticket, Wallet, X } from "lucide-react";
import { type AppData, type PaymentKind } from "@/lib/finance-data";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { t } from "@/lib/i18n";
import "../safe-spend-sheet.css";

type Source = AppData["settings"]["paymentSources"][number];

const ICON: Record<PaymentKind, typeof CreditCard> = { card: CreditCard, cash: Banknote, meal: Ticket, voucher: Ticket, transfer: Wallet };
const KIND: Record<PaymentKind, string> = { card: "card", cash: "numerar", meal: "tichete de masă", voucher: "voucher", transfer: "transfer" };

const amountStyle = (empty: boolean): React.CSSProperties => ({ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap", color: empty ? "var(--cf-muted)" : "var(--cf-ink)" });
const iconBox: React.CSSProperties = { width: 36, height: 36, display: "grid", placeItems: "center", flex: "0 0 auto", borderRadius: 12, background: "color-mix(in srgb, var(--cf-primary, #2f6f5b) 12%, transparent)", color: "var(--cf-primary-strong, #185849)" };

function Sheet({ data, sources, value, title, memberId, balanceOf, format, onPick, onClose }: { data: AppData; sources: Source[]; value: string; title: string; memberId?: string; balanceOf: (id: string) => number; format: (value: number, source: Source) => string; onPick: (id: string) => void; onClose: () => void }) {
  const ref = useFocusTrap<HTMLElement>(onClose);
  const members = [...data.settings.members].sort((a, b) => Number(b.id === memberId) - Number(a.id === memberId));
  const groups = [
    ...members.map((member) => ({ id: member.id, name: member.name, sources: sources.filter((source) => source.memberId === member.id) })),
    { id: "", name: t("Familie / comun"), sources: sources.filter((source) => !source.memberId || !data.settings.members.some((member) => member.id === source.memberId)) },
  ].filter((group) => group.sources.length);
  return createPortal(
    <div className="bf-modal-backdrop bf-safe-spend-backdrop" style={{ zIndex: 140 }} role="presentation" onClick={onClose}>
      <section ref={ref} tabIndex={-1} className="bf-safe-spend-sheet" role="dialog" aria-modal="true" aria-labelledby="bf-source-picker-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <h2 id="bf-source-picker-title">{title}</h2>
          <button type="button" className="bf-icon-button" aria-label={t("Închide")} onClick={onClose}><X size={18} /></button>
        </header>
        {groups.map((group) => (
          <div key={group.id || "shared"} role="group" aria-label={group.name} style={{ marginBottom: 14 }}>
            {groups.length > 1 && <p className="bf-kicker" style={{ margin: "0 0 6px 4px" }}>{group.name.toLocaleUpperCase()}</p>}
            <div style={{ display: "grid", border: "1px solid var(--cf-line)", borderRadius: 16, overflow: "hidden" }}>
              {group.sources.map((source, index) => {
                const Icon = ICON[source.kind] || Wallet;
                const balance = balanceOf(source.id);
                const empty = Math.abs(balance) < 0.005;
                const picked = source.id === value;
                return (
                  <button key={source.id} type="button" aria-pressed={picked} onClick={() => onPick(source.id)} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "8px 14px", border: 0, borderTop: index ? "1px solid var(--cf-line)" : 0, background: picked ? "color-mix(in srgb, var(--cf-primary, #2f6f5b) 10%, var(--cf-surface))" : "var(--cf-surface)", color: "var(--cf-ink)", textAlign: "left", opacity: empty && !picked ? 0.62 : 1 }}>
                    <span style={iconBox} aria-hidden="true"><Icon size={18} /></span>
                    <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                      <b style={{ fontSize: 16, fontWeight: 650, lineHeight: 1.2, overflowWrap: "anywhere" }}>{source.name}</b>
                      <small style={{ fontSize: 13, color: "var(--cf-muted)" }}>{t(KIND[source.kind] || "card")}{source.currency ? ` · ${source.currency}` : ""}</small>
                    </span>
                    <span style={amountStyle(empty)}>{format(balance, source)}</span>
                    <span style={{ width: 20, flex: "0 0 auto", color: "var(--cf-primary-strong, #185849)" }} aria-hidden="true">{picked && <Check size={20} />}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>,
    document.body,
  );
}

/** Câmpul „Plătit din” / „Încasat în”: arată sursa aleasă cu soldul ei; o atingere deschide lista. */
export function SourcePicker({ data, sources = data.settings.paymentSources, value, label, memberId, balanceOf, format, onChange }: { data: AppData; sources?: Source[]; value: string; label: string; memberId?: string; balanceOf: (id: string) => number; format: (value: number, source: Source) => string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const source = data.settings.paymentSources.find((item) => item.id === value);
  const Icon = (source && ICON[source.kind]) || Wallet;
  const owner = source?.memberId ? data.settings.members.find((member) => member.id === source.memberId)?.name : undefined;
  // Sursele goale (fără nicio mișcare și cu sold 0, ca Revolut-urile nefolosite) nu încarcă lista; cea aleasă rămâne mereu.
  const shown = sources.filter((item) => item.id === value || Math.abs(balanceOf(item.id)) >= 0.005 || data.transactions.some((entry) => entry.sourceId === item.id));
  return (
    <div className="bf-field">
      <span>{label}</span>
      <button type="button" aria-haspopup="dialog" aria-label={`${label}: ${source?.name || t("Alege")}`} onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 56, padding: "6px 12px", border: "1px solid var(--cf-line)", borderRadius: 14, background: "var(--cf-surface)", color: "var(--cf-ink)", textAlign: "left" }}>
        <span style={{ ...iconBox, width: 32, height: 32 }} aria-hidden="true"><Icon size={17} /></span>
        <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 1 }}>
          <b style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source?.name || t("Alege")}</b>
          {source && <small style={{ fontSize: 12, color: "var(--cf-muted)" }}>{[owner && !source.name.includes(owner) ? owner : "", t(KIND[source.kind] || "card")].filter(Boolean).join(" · ")}</small>}
        </span>
        {source && <span style={amountStyle(Math.abs(balanceOf(source.id)) < 0.005)}>{format(balanceOf(source.id), source)}</span>}
        <ChevronDown size={18} aria-hidden="true" style={{ flex: "0 0 auto", color: "var(--cf-muted)" }} />
      </button>
      {open && <Sheet data={data} sources={shown.length ? shown : sources} value={value} title={label} memberId={memberId} balanceOf={balanceOf} format={format} onPick={(id) => { onChange(id); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}
