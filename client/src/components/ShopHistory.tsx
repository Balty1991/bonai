import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import type { AppData, Receipt } from "@/lib/finance-data";
import { t } from "@/lib/i18n";
import { receiptsByMonth, storeHue, storeInitials } from "@/lib/shop-stats";

const lei = (v: number) => `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const dayRo = (d: string) => { const [y, m, day] = d.split("-"); return `${Number(day)} ${["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"][Number(m) - 1]} ${y}`; };

/** Istoric: bonurile pe luni, cu inițialele magazinului; „Toate costurile” adaugă și cheltuielile fără bon. */
export function ShopHistory({ data, initialTab = "receipts", onClose }: { data: AppData; initialTab?: "receipts" | "costs"; onClose: () => void }) {
  const [tab, setTab] = useState(initialTab);
  const [open, setOpen] = useState<Receipt>();
  const items = useMemo<Receipt[]>(() => {
    if (tab === "receipts") return data.receipts;
    // Cheltuielile fără bon (cele vechi, migrate, și cele notate de mână) intră ca rânduri simple.
    const linked = new Set(data.receipts.flatMap((r) => [r.linkedTransactionId, ...(r.linkedTransactionIds || [])]).filter(Boolean) as string[]);
    const loose = data.transactions.filter((tx) => tx.kind === "expense" && !linked.has(tx.id)).map((tx) => ({ id: tx.id, vendor: tx.title || tx.category, amount: tx.amount, category: tx.category, date: tx.date }) as Receipt);
    return [...data.receipts, ...loose];
  }, [data.receipts, data.transactions, tab]);
  const months = useMemo(() => receiptsByMonth(items), [items]);
  return createPortal(<div className="bn-costs bn-history" role="dialog" aria-modal="true" aria-label={t("Istoric")}>
    <header className="bn-costs-head"><button type="button" className="bn-icon-btn" aria-label={t("Înapoi")} onClick={open ? () => setOpen(undefined) : onClose}><ArrowLeft size={20} /></button><b>{open ? open.vendor : tab === "receipts" ? t("Bonuri") : t("Toate costurile")}</b><span /></header>
    {open ? <div className="bn-costs-body">
      <section className="bn-costs-hero"><small>{dayRo(open.date)}{open.time ? ` · ${open.time}` : ""}{open.city ? ` · ${open.city}` : ""}</small><strong>{lei(open.amount)}</strong><span>{open.lines?.length ? t("{n} produse", { n: open.lines.length }) : t("fără produse detaliate")}</span></section>
      {open.lines?.length ? <ul className="bn-costs-list">{open.lines.map((line) => <li key={line.id}><div className="bn-history-line"><span className="bn-costs-copy"><b>{line.label || line.category}</b><small>{t(line.category)}{line.discount ? ` · −${lei(line.discount)}` : ""}</small></span><span className="bn-costs-amount">{lei(line.amount)}</span></div></li>)}</ul> : null}
    </div> : <div className="bn-costs-body">
      <div className="sh-seg bn-history-tabs" role="tablist">{([["receipts", t("Bonuri")], ["costs", t("Toate costurile")]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
      {!months.length && <p className="bn-costs-note">{tab === "receipts" ? t("Încă n-ai bonuri. Scanează primul bon și apare aici.") : t("Încă nu ai costuri notate.")}</p>}
      {months.map((month) => <section key={month.month} className="bn-history-month" aria-label={month.title}>
        <header><b>{month.title}</b><span>{lei(month.total)}</span></header>
        <ul className="bn-costs-list">{month.receipts.map((r) => { const isReceipt = data.receipts.some((x) => x.id === r.id); return <li key={r.id}><button type="button" disabled={!isReceipt} onClick={() => setOpen(r)}><span className="bn-store-avatar" style={{ background: `hsl(${storeHue(r.vendor)} 62% 46%)` }} aria-hidden="true">{storeInitials(r.vendor)}</span><span className="bn-costs-copy"><b>{r.vendor}</b><small>{dayRo(r.date)}{r.time ? ` · ${r.time}` : ""}{r.lines?.length ? ` · ${t("{n} produse", { n: r.lines.length })}` : isReceipt ? "" : ` · ${t("fără bon")}`}</small></span><span className="bn-costs-amount">{lei(r.amount)}</span></button></li>; })}</ul>
      </section>)}
    </div>}
  </div>, document.body);
}

export default ShopHistory;
