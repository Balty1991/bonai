import { useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { createPortal } from "react-dom";
import { ArrowLeft, Pencil, Trash2, X } from "lucide-react";
import { isBalanceAdjustment, type AppData, type Receipt, type Transaction } from "@/lib/finance-data";
import { productsLabel, t } from "@/lib/i18n";
import { receiptsByMonth, storeHue, storeInitials } from "@/lib/shop-stats";
import { checkReceiptLines, readShelfSeen } from "@/lib/discount-check";
import { productObservations } from "@/lib/personal-inflation";
import { DiscountFlags } from "@/components/DiscountFlags";

const lei = (v: number) => `${v.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0lei`;
const dayRo = (d: string) => { const [y, m, day] = d.split("-"); return `${Number(day)} ${["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"][Number(m) - 1]} ${y}`; };
const asReceipt = (tx: Transaction) => ({ id: tx.id, vendor: tx.title || tx.category, amount: tx.amount, category: tx.category, date: tx.date }) as Receipt;

/** Istoric: bonurile pe luni; „Toate costurile” include și cheltuielile fără bon, care se pot edita. */
export function ShopHistory({ data, initialTab = "receipts", onClose, onEdit, onDelete, onEditTransaction, onDeleteTransaction }: { data: AppData; initialTab?: "receipts" | "costs"; onClose: () => void; onEdit?: (receipt: Receipt) => void; onDelete?: (receipt: Receipt) => Promise<boolean> | boolean; onEditTransaction?: (transaction: Transaction) => void; onDeleteTransaction?: (transaction: Transaction) => Promise<boolean> | boolean }) {
  const [tab, setTab] = useState(initialTab);
  const [openId, setOpenId] = useState<string>();
  const openReceipt = openId ? data.receipts.find((r) => r.id === openId) : undefined;
  const openTransaction = openId && !openReceipt ? data.transactions.find((tx) => tx.id === openId && tx.kind === "expense" && !isBalanceAdjustment(tx)) : undefined;
  const open = openReceipt || (openTransaction ? asReceipt(openTransaction) : undefined);
  const setOpen = (r?: Receipt) => setOpenId(r?.id);
  const [menu, setMenu] = useState<Receipt>();
  const menuReceipt = menu ? data.receipts.find((r) => r.id === menu.id) : undefined;
  const menuTransaction = menu && !menuReceipt ? data.transactions.find((tx) => tx.id === menu.id && tx.kind === "expense" && !isBalanceAdjustment(tx)) : undefined;
  const flags = useMemo(() => (openReceipt ? checkReceiptLines((openReceipt.lines || []).map((l) => ({ ...l, label: l.label || "" })), openReceipt.vendor, openReceipt.date, productObservations(data).filter((o) => o.receiptId !== openReceipt.id), readShelfSeen()) : []), [openReceipt, data]);
  const press = useRef<{ timer?: number; fired?: boolean }>({});
  const startPress = (r: Receipt) => { press.current.fired = false; window.clearTimeout(press.current.timer); press.current.timer = window.setTimeout(() => { press.current.fired = true; setMenu(r); }, 500); };
  const endPress = () => window.clearTimeout(press.current.timer);
  const remove = async (r: Receipt) => {
    setMenu(undefined);
    const receipt = data.receipts.find((item) => item.id === r.id);
    const transaction = receipt ? undefined : data.transactions.find((item) => item.id === r.id && item.kind === "expense" && !isBalanceAdjustment(item));
    const removed = receipt ? await onDelete?.(receipt) : transaction ? await onDeleteTransaction?.(transaction) : false;
    if (removed) setOpen(undefined);
  };
  const items = useMemo<Receipt[]>(() => {
    if (tab === "receipts") return data.receipts;
    const linked = new Set(data.receipts.flatMap((r) => [r.linkedTransactionId, ...(r.linkedTransactionIds || [])]).filter(Boolean) as string[]);
    const loose = data.transactions.filter((tx) => tx.kind === "expense" && !isBalanceAdjustment(tx) && !linked.has(tx.id)).map(asReceipt);
    return [...data.receipts, ...loose];
  }, [data.receipts, data.transactions, tab]);
  const months = useMemo(() => receiptsByMonth(items), [items]);
  const trapRef = useFocusTrap<HTMLDivElement>(open ? () => setOpen(undefined) : onClose);
  return createPortal(<div ref={trapRef} tabIndex={-1} className="bn-costs bn-history" role="dialog" aria-modal="true" aria-label={t("Istoric")}>
    <header className="bn-costs-head"><button type="button" className="bn-icon-btn" aria-label={t("Înapoi")} onClick={open ? () => setOpen(undefined) : onClose}><ArrowLeft size={20} /></button><b>{open ? open.vendor : tab === "receipts" ? t("Bonuri") : t("Toate costurile")}</b><span /></header>
    {open ? <div className="bn-costs-body">
      <section className="bn-costs-hero"><small>{dayRo(open.date)}{openReceipt?.time ? ` · ${openReceipt.time}` : ""}{openReceipt?.city ? ` · ${openReceipt.city}` : ""}</small><strong>{lei(open.amount)}</strong><span>{openReceipt?.lines?.length ? productsLabel(openReceipt.lines.length) : openTransaction ? t(openTransaction.category) : t("fără produse detaliate")}</span></section>
      {openReceipt && <DiscountFlags flags={flags} />}
      {openTransaction?.note && <p className="bn-costs-note">{openTransaction.note}</p>}
      {openReceipt && (onEdit || onDelete) && <div className="bn-history-actions">
        {onEdit && <button type="button" className="bn-btn" onClick={() => onEdit(openReceipt)}><Pencil size={16} aria-hidden="true" /> {t("Editează")}</button>}
        {onDelete && <button type="button" className="bn-btn is-danger" onClick={() => void remove(openReceipt)}><Trash2 size={16} aria-hidden="true" /> {t("Șterge bonul")}</button>}
      </div>}
      {openTransaction && (onEditTransaction || onDeleteTransaction) && <div className="bn-history-actions">
        {onEditTransaction && <button type="button" className="bn-btn" onClick={() => onEditTransaction(openTransaction)}><Pencil size={16} aria-hidden="true" /> {t("Editează")}</button>}
        {onDeleteTransaction && <button type="button" className="bn-btn is-danger" onClick={() => void remove(open)}><Trash2 size={16} aria-hidden="true" /> {t("Șterge cheltuiala")}</button>}
      </div>}
      {openReceipt?.lines?.length ? <ul className="bn-costs-list">{openReceipt.lines.map((line) => <li key={line.id}><div className="bn-history-line"><span className="bn-costs-copy"><b>{line.label || line.category}</b><small>{t(line.category)}{line.discount ? ` · −${lei(line.discount)}` : ""}</small></span><span className="bn-costs-amount">{lei(line.amount)}</span></div></li>)}</ul> : null}
    </div> : <div className="bn-costs-body">
      <div className="sh-seg bn-history-tabs" role="tablist">{([["receipts", t("Bonuri")], ["costs", t("Toate costurile")]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
      {!months.length && <p className="bn-costs-note">{tab === "receipts" ? t("Încă n-ai bonuri. Scanează primul bon și apare aici.") : t("Încă nu ai costuri notate.")}</p>}
      {months.map((month) => <section key={month.month} className="bn-history-month" aria-label={month.title}>
        <header><b>{month.title}</b><span>{lei(month.total)}</span></header>
        <ul className="bn-costs-list">{month.receipts.map((r) => {
          const isReceipt = data.receipts.some((x) => x.id === r.id);
          const canManage = isReceipt ? Boolean(onEdit || onDelete) : Boolean(onEditTransaction || onDeleteTransaction);
          return <li key={r.id}><button type="button" onClick={() => { if (press.current.fired) { press.current.fired = false; return; } setOpen(r); }} onPointerDown={() => canManage && startPress(r)} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress} onContextMenu={(event) => { if (!canManage) return; event.preventDefault(); endPress(); setMenu(r); }} aria-haspopup={canManage ? "menu" : undefined}><span className="bn-store-avatar" style={{ background: `hsl(${storeHue(r.vendor)} 62% 46%)` }} aria-hidden="true">{storeInitials(r.vendor)}</span><span className="bn-costs-copy"><b>{r.vendor}</b><small>{dayRo(r.date)}{r.time ? ` · ${r.time}` : ""}{r.lines?.length ? ` · ${productsLabel(r.lines.length)}` : isReceipt ? "" : ` · ${t("fără bon")}`}</small></span><span className="bn-costs-amount">{lei(r.amount)}</span></button></li>;
        })}</ul>
      </section>)}
    </div>}
    {menu && <div className="bn-sheet-backdrop" onClick={() => setMenu(undefined)}><div className="bn-sheet" role="menu" aria-label={t("Detalii pentru {store}", { store: menu.vendor })} onClick={(event) => event.stopPropagation()}>
      <header><b>{menu.vendor}</b><small>{dayRo(menu.date)} · {lei(menu.amount)}</small><button type="button" className="bn-icon-btn" aria-label={t("Închide")} onClick={() => setMenu(undefined)}><X size={18} /></button></header>
      {menuReceipt && onEdit && <button type="button" role="menuitem" onClick={() => { setMenu(undefined); onEdit(menuReceipt); }}><Pencil size={18} aria-hidden="true" /> {t("Editează")}</button>}
      {menuTransaction && onEditTransaction && <button type="button" role="menuitem" onClick={() => { setMenu(undefined); onEditTransaction(menuTransaction); }}><Pencil size={18} aria-hidden="true" /> {t("Editează")}</button>}
      {menuReceipt && onDelete && <button type="button" role="menuitem" className="is-danger" onClick={() => void remove(menu)}><Trash2 size={18} aria-hidden="true" /> {t("Șterge bonul")}</button>}
      {menuTransaction && onDeleteTransaction && <button type="button" role="menuitem" className="is-danger" onClick={() => void remove(menu)}><Trash2 size={18} aria-hidden="true" /> {t("Șterge cheltuiala")}</button>}
    </div></div>}
  </div>, document.body);
}

export default ShopHistory;
