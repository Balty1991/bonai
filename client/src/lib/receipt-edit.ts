/**
 * Bonul salvat se corectează și se șterge. În BonAI bonul ESTE cheltuiala: editarea rescrie
 * bonul și mișcarea lui, ștergerea le scoate pe amândouă, cu pietre de mormânt pentru
 * sincronizare. Tot ce se calculează din bonuri (istoric de preț, inflație, statistici, Stoc,
 * economisit, garanții propuse) se recalculează singur din `receipts`. Poza bonului rămâne.
 */
import { newId, pruneTombstones, type AppData, type Receipt, type ReceiptLine, type Transaction } from "./finance-data";
import { carryProductFacts } from "./receipt-products";
import type { ScanPrefill } from "./receipt-scan";
import { labelWithQty, round2, stripQtySuffix, type ReviewRow } from "./receipt-review-model";

export type ReceiptEdit = { rows: ReviewRow[]; total: number; store: string; date: string; memberId?: string; time?: string; city?: string };

const qtyOf = (line: ReceiptLine) => {
  if (line.qty && line.qty > 0) return line.qty;
  const m = (line.label || "").match(/\s×\s([\d.,]+)(\s?kg)?$/);
  return m ? Number(m[1].replace(",", ".")) || 1 : 1;
};

/** Bonul salvat, ca date de intrare pentru ecranul de verificare (aceleași rânduri, același total). */
export function prefillFromReceipt(receipt: Receipt): ScanPrefill {
  const lines = (receipt.lines || []).map((line) => ({ label: stripQtySuffix(line.label || line.category), amount: line.amount, category: line.category, qty: qtyOf(line), ...(line.discount ? { discount: line.discount } : {}) }));
  return {
    title: receipt.vendor, amount: receipt.amount, date: receipt.date, category: receipt.category, lines,
    discount: round2(lines.reduce((sum, line) => sum + (line.discount || 0), 0)), count: lines.length,
    store: { ...(receipt.city ? { city: receipt.city } : {}), ...(receipt.time ? { time: receipt.time } : {}), ...(receipt.storeAddress ? { storeAddress: receipt.storeAddress } : {}), ...(receipt.storeCui ? { storeCui: receipt.storeCui } : {}) },
  };
}

/** Mișcările care sunt bonul: legate de el sau făcute de el. */
export function receiptTransactionIds(data: AppData, receipt: Receipt): string[] {
  const ids = new Set<string>([receipt.linkedTransactionId, ...(receipt.linkedTransactionIds || [])].filter(Boolean) as string[]);
  for (const tx of data.transactions) if (tx.receiptId === receipt.id || tx.id === `receipt-tx-${receipt.id}` || tx.id.startsWith(`receipt-tx-${receipt.id}-`)) ids.add(tx.id);
  return Array.from(ids).filter((id) => data.transactions.some((tx) => tx.id === id));
}

const dominant = (rows: ReadonlyArray<{ category: string; amount: number }>, fallback: string) => {
  const by = new Map<string, number>();
  for (const row of rows) by.set(row.category, (by.get(row.category) || 0) + row.amount);
  return Array.from(by).sort((a, b) => b[1] - a[1])[0]?.[0] || fallback;
};

/** Salvează corectura: bonul (cu poza și faptele produselor) și mișcarea lui. */
export function applyReceiptEdit(data: AppData, receiptId: string, edit: ReceiptEdit, now = new Date().toISOString()): AppData {
  const receipt = data.receipts.find((item) => item.id === receiptId);
  if (!receipt) return data;
  const rows = edit.rows.filter((row) => row.label.trim() && row.amount > 0);
  const old = receipt.lines || [];
  const fresh: ReceiptLine[] = rows.map((row, index) => {
    const label = labelWithQty(row.label.trim(), row.qty);
    // Același rând (după poziție și nume) își păstrează id-ul: garanțiile și legăturile rămân pe el.
    const same = old[index] && stripQtySuffix(old[index].label || "").toLocaleLowerCase("ro-RO") === stripQtySuffix(row.label).toLocaleLowerCase("ro-RO") ? old[index] : undefined;
    return { id: same?.id || newId("line"), label, amount: round2(row.amount), category: row.category, ...(row.qty !== 1 ? { qty: row.qty } : {}), ...(row.discount > 0 ? { discount: round2(row.discount) } : {}) };
  });
  const lines = carryProductFacts(old, fresh);
  const total = round2(edit.total);
  const category = dominant(rows, receipt.category);
  const nextReceipt: Receipt = { ...receipt, vendor: edit.store.trim() || receipt.vendor, date: edit.date || receipt.date, amount: total, category, lines, ...(edit.memberId ? { memberId: edit.memberId } : {}), ...(edit.time !== undefined ? { time: edit.time || undefined } : {}), ...(edit.city !== undefined ? { city: edit.city || undefined } : {}), updatedAt: now };
  const txIds = receiptTransactionIds(data, receipt);
  const others = round2(data.transactions.filter((tx) => txIds.slice(1).includes(tx.id)).reduce((sum, tx) => sum + tx.amount, 0));
  const transactions = data.transactions.map((tx): Transaction => {
    if (!txIds.includes(tx.id)) return tx;
    const first = tx.id === txIds[0];
    // Bonul plătit din două surse: a doua parte rămâne, prima ia diferența până la totalul nou.
    const amount = first ? round2(Math.max(0.01, total - others)) : tx.amount;
    return { ...tx, ...(first ? { amount, title: `Bon — ${nextReceipt.vendor}`, category } : {}), date: nextReceipt.date, ...(edit.memberId ? { memberId: edit.memberId } : {}), updatedAt: now };
  });
  return { ...data, receipts: data.receipts.map((item) => (item.id === receiptId ? nextReceipt : item)), transactions };
}

/** Șterge bonul și mișcarea lui; întoarce și ce s-a scos, pentru „Anulează”. */
export function removeReceipt(data: AppData, receiptId: string, now = new Date().toISOString()): { next: AppData; removed: { receipts: Receipt[]; transactions: Transaction[] } } {
  const receipt = data.receipts.find((item) => item.id === receiptId);
  if (!receipt) return { next: data, removed: { receipts: [], transactions: [] } };
  const txIds = receiptTransactionIds(data, receipt);
  const removedTransactions = data.transactions.filter((tx) => txIds.includes(tx.id));
  const tombstones = [{ entity: "receipts" as const, id: receiptId, deletedAt: now }, ...txIds.map((id) => ({ entity: "transactions" as const, id, deletedAt: now }))];
  return {
    next: {
      ...data,
      receipts: data.receipts.filter((item) => item.id !== receiptId),
      transactions: data.transactions.filter((tx) => !txIds.includes(tx.id)),
      pendingReview: data.pendingReview.filter((draft) => draft.transaction.receiptId !== receiptId && !txIds.includes(draft.transaction.id)),
      deleted: pruneTombstones([...data.deleted, ...tombstones]),
    },
    removed: { receipts: [receipt], transactions: removedTransactions },
  };
}
