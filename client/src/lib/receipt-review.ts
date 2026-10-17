/**
 * Bon → coadă de revizuire: liniile propun plicuri, registrul se scrie doar după confirmare.
 */
import { carryProductFacts } from "./receipt-products";
import {
  addReviewDrafts,
  isWeeklyPaced,
  matchingAllocationsForExpense,
  newId,
  pruneTombstones,
  resolveReceiptLines,
  type AppData,
  type Receipt,
  type ReceiptLine,
  type ReviewDraft,
  type Transaction,
} from "./finance-data";
import { t } from "./i18n";
import { isMonthLong, monthLongPart } from "./month-long";
import { suggestTag } from "./tags";

export function buildReceiptReviewDrafts(data: AppData, receipt: Receipt): ReviewDraft[] {
  const member = data.settings.members.find((entry) => entry.id === receipt.memberId) || data.settings.members[0];
  const source = data.settings.paymentSources.find((entry) => entry.id === receipt.sourceId) || data.settings.paymentSources[0];
  if (!member || !source) return [];
  const lines = resolveReceiptLines(
    receipt.lines?.length ? receipt.lines : [{ id: "whole", category: receipt.category, amount: receipt.amount }],
    receipt.amount,
  );
  const biggest = [...lines].sort((left, right) => right.amount - left.amount)[0];
  let category = biggest?.category || receipt.category;
  let matched = matchingAllocationsForExpense(data, {
    category,
    memberId: member.id,
    sourceId: source.id,
  })[0];
  /**
   * Detergentul de 70 de lei e cel mai scump articol, dar bonul e de la cumpărăturile săptămânii.
   * Fără plic pentru categoria lui, bonul merge în plicul mâncării de pe el (Mega Image, 9 oct).
   */
  const food = lines.filter((line) => !isMonthLong(line)).sort((left, right) => right.amount - left.amount)[0];
  const foodMatch = food && matchingAllocationsForExpense(data, { category: food.category, memberId: member.id, sourceId: source.id })[0];
  if (food && foodMatch && isWeeklyPaced(foodMatch, data.settings.salaryPlan) && (!matched || matched.id === foodMatch.id)) {
    matched = foodMatch;
    category = food.category;
  }
  const now = new Date().toISOString();
  /**
   * Bonul cu articole, pus într-un plic pe săptămâni: ce nu e mâncare (hârtie igienică, detergent,
   * hrana pisicii) se împarte singur pe săptămânile rămase, ca la bifa „Cumpărătură pentru toată luna”.
   */
  const weekly = matched && isWeeklyPaced(matched, data.settings.salaryPlan) && receipt.lines?.length;
  const longPart = weekly ? monthLongPart(lines) : { amount: 0, labels: [] as string[] };
  const spreadAmount = longPart.amount > 0 ? Math.round(Math.min(receipt.amount, longPart.amount) * 100) / 100 : undefined;
  const title = `Bon — ${receipt.vendor}`;
  const tag = suggestTag(data, title);
  const transaction: Transaction = {
    id: `receipt-tx-${receipt.id}`,
    receiptId: receipt.id,
    title,
    amount: receipt.amount,
    kind: "expense",
    category,
    sourceId: source.id,
    source: source.name,
    memberId: member.id,
    person: member.name,
    date: receipt.date,
    note: receipt.note,
    allocationId: matched?.id || "outside",
    ...(spreadAmount ? { spreadAmount } : {}),
    ...(tag ? { tag } : {}),
    createdAt: now,
  };
  return [{
    id: newId("review"),
    origin: "bon" as const,
    reason: t("Bon {vendor}: o singură mișcare de {amount}. {count} produse rămân detaliu, nu intrări separate.", {
      vendor: receipt.vendor,
      amount: receipt.amount,
      count: lines.length,
    }) + (spreadAmount ? ` ${t("Din el, {amount} ({items}) se împarte pe săptămânile rămase, nu golește săptămâna asta.", { amount: spreadAmount, items: longPart.labels.slice(0, 4).join(", ") + (longPart.labels.length > 4 ? "…" : "") })}` : ""),
    createdAt: now,
    transaction,
  }];
}

/** Salvează bonul. Dacă e legat de o cheltuială deja notată, nu mai scrie o mișcare. Altfel, o singură propunere cu totalul. */
export function queueReceiptForReview(data: AppData, receipt: Receipt): AppData {
  const now = new Date().toISOString();
  // Doar mișcările făcute de bon. Cheltuiala notată de om, cu bonul atașat, rămâne (altfel o ștergeam la editare).
  const generated = data.transactions.filter((entry) => entry.id === `receipt-tx-${receipt.id}` || entry.id.startsWith(`receipt-tx-${receipt.id}-`));
  const formerIds = new Set(generated.map((entry) => entry.id));
  const lines = resolveReceiptLines(
    receipt.lines?.length ? receipt.lines : [{ id: "whole", category: receipt.category, amount: receipt.amount }],
    receipt.amount,
  );
  const attachable = (entry: Transaction) => entry.kind === "expense" && !formerIds.has(entry.id);
  const attach = (receipt.linkedTransactionId ? data.transactions.find((entry) => entry.id === receipt.linkedTransactionId && attachable(entry)) : undefined)
    || data.transactions.find((entry) => entry.receiptId === receipt.id && attachable(entry));
  const dropGenerated = (list: AppData["transactions"]) => list.filter((entry) => !formerIds.has(entry.id));
  const tombstones = pruneTombstones([...data.deleted, ...Array.from(formerIds, (id) => ({ entity: "transactions" as const, id, deletedAt: now }))]);
  const pendingReview = data.pendingReview.filter((draft) => draft.transaction.receiptId !== receipt.id && !formerIds.has(draft.transaction.id));
  if (attach) {
    const stored: Receipt = { ...receipt, lines, linkedTransactionId: attach.id, linkedTransactionIds: [attach.id], updatedAt: now };
    return {
      ...data,
      receipts: [stored, ...data.receipts.filter((entry) => entry.id !== receipt.id)],
      transactions: dropGenerated(data.transactions).map((entry) => entry.id === attach.id ? { ...entry, receiptId: receipt.id, updatedAt: now } : entry),
      pendingReview,
      deleted: formerIds.size ? tombstones : data.deleted,
    };
  }
  const stored: Receipt = {
    ...receipt,
    lines,
    linkedTransactionId: undefined,
    linkedTransactionIds: [`receipt-tx-${receipt.id}`],
    updatedAt: now,
  };
  const withoutFormer: AppData = {
    ...data,
    receipts: [stored, ...data.receipts.filter((entry) => entry.id !== receipt.id)],
    transactions: dropGenerated(data.transactions),
    pendingReview,
    deleted: formerIds.size ? tombstones : data.deleted,
  };
  return addReviewDrafts(withoutFormer, buildReceiptReviewDrafts(withoutFormer, stored));
}

/** Articolele unei cheltuieli deja notate. Nu creează o a doua mișcare. */
export function attachReceiptDetail(data: AppData, transactionId: string, lines: ReceiptLine[], total?: number, vendor?: string): AppData {
  const tx = data.transactions.find((item) => item.id === transactionId);
  if (!tx || tx.kind !== "expense") return data;
  const existing = data.receipts.find((receipt) => receipt.id === tx.receiptId || receipt.linkedTransactionId === tx.id || receipt.linkedTransactionIds?.includes(tx.id));
  if (!lines.length && !existing) return data;
  const now = new Date().toISOString();
  const id = existing?.id || `detail-${tx.id}`;
  const receipt: Receipt = {
    ...(existing || { vendor: tx.title.replace(/^Bon — /, ""), category: tx.category, date: tx.date }),
    id,
    // Din „Notează”, magazinul vine separat: titlul „Lidl · pâine” nu e numele magazinului.
    vendor: existing?.vendor || vendor || tx.title.replace(/^Bon — /, ""),
    amount: total ?? tx.amount,
    category: tx.category,
    date: tx.date,
    sourceId: tx.sourceId,
    memberId: tx.memberId,
    lines: carryProductFacts(existing?.lines, lines),
    linkedTransactionId: tx.id,
    linkedTransactionIds: [tx.id],
    updatedAt: now,
  };
  return {
    ...data,
    transactions: data.transactions.map((item) => item.id === tx.id ? { ...item, receiptId: id, updatedAt: now } : item),
    receipts: [receipt, ...data.receipts.filter((item) => item.id !== id)],
  };
}
