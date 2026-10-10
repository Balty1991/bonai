/**
 * Formularul de mișcare. Scos din home-secondary. Salvarea rămâne aceeași.
 */
import { TagChips } from "@/components/TagChips";
import { suggestTag } from "@/lib/tags";
import { isSplitPartner } from "@/lib/split-payment";
import "../receipt-mobile.css";
import "../currency.css";
import "../transaction-envelope-picker.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { SourcePicker } from "@/components/SourcePicker";
import { allocationSourceIds, allocationSourceParts, guessCategoryFromText, amountInput, amountError, BASE_CURRENCY, allocationBudget, allocationSpent, allocationWeekStatus, allocationWeeksStatus, closeReceiptGap, exchangeRateFor, expenseCategories, isReceiptGapLabel, isoToday, isWeeklyPaced, matchingAllocationsForExpense, newId, parseRomanianAmount, pickerAllocationsForExpense, planAllocationMath, resolveReceiptLines, sourceBalance, sourceCurrency, spendTargetFromText, toBaseAmount, transactionShareScope, type AppData, type ReceiptLine, type ShareScope, type Transaction, type TransactionKind } from "@/lib/finance-data";
import { Field, Modal, fmtExact, money } from "@/pages/home-kit";
import { getLocale, t } from "@/lib/i18n";
import { askConfirm } from "@/lib/confirm-dialog";
import { hasInvalidRoDate, RoDateInput } from "@/components/RoDateInput";
import { envelopeChargePhrase, envelopeOptionRemain, weekOptionLabel } from "@/lib/envelope-charge";
import { SpendFromChoice } from "@/components/SpendFromChoice";
import { ReceiptScanButton } from "@/components/ReceiptScanButton";
import type { ScanPrefill } from "@/lib/receipt-scan";
import { findKnownProduct, knownProducts } from "@/lib/price-history";
import { lineTotal, splitQuantity, withQuantity, type QuantityUnit } from "@/lib/item-quantity";
import { monthLongPart } from "@/lib/month-long";

/** Nota pusă automat de versiunile vechi pe bonul din două surse. */
const AUTO_SPLIT_NOTE = /(?:\s*·\s*)?Bon de [^:]+:.*$/;

export function TransactionForm({ data, initial, scan, onSave, onClose }: { data: AppData; initial?: Transaction; /** Bonul scanat din „Notează”: umple formularul la deschidere. */ scan?: ScanPrefill; onSave: (item: Transaction | Transaction[], meta?: { fromWeekIndex?: number; learnRule?: { match: string; category: string; allocationId?: string }; detailLines?: ReceiptLine[]; removeIds?: string[] }) => void; onClose: () => void }) {
  const [kind, setKind] = useState<TransactionKind>(initial?.kind || "expense");
  const [title, setTitle] = useState(initial?.title || "");
  /**
   * Cealaltă parte a aceluiași bon, plătit din două surse. Mișcările vechi (fără splitId) se recunosc
   * după nota „Bon de …” identică, aceeași zi și același titlu.
   */
  const splitPartner = initial ? data.transactions.find((item) => isSplitPartner(initial, item)) : undefined;
  const [amount, setAmount] = useState(initial ? amountInput(Math.round((initial.amount + (splitPartner?.amount || 0)) * 100) / 100) : "");
  const [date, setDate] = useState(initial?.date || isoToday());
  const [memberId, setMemberId] = useState(initial?.memberId || data.settings.members.find((member) => member.name === initial?.person)?.id || data.settings.members[0]?.id || "");
  const [shareScope, setShareScope] = useState<ShareScope>(transactionShareScope(initial));
  const [sourceId, setSourceId] = useState(initial?.sourceId || data.settings.paymentSources.find((source) => source.name === initial?.source)?.id || data.settings.paymentSources[0]?.id || "");
  // O cheltuială nu poate avea categoria „Venit” (rămânea așa după Venit → Cheltuială): ghicim după nume.
  const expenseCategoryFor = (current: string, text: string) => current && current !== "Venit" ? current : guessCategoryFromText(text, [...expenseCategories, ...data.settings.customCategories], data.settings.merchantRules) || "Altele";
  const [category, setCategory] = useState(() => initial?.kind === "income" ? (initial.category || "Venit") : expenseCategoryFor(initial?.category || "Alimente", initial?.title || ""));
  const [allocationId, setAllocationId] = useState(initial?.allocationId || "outside");
  const [fromWeekIndex, setFromWeekIndex] = useState<number | undefined>();
  /** Cumpărătura pentru toată luna (detergent, provizii): se împarte pe săptămânile rămase ale plicului. */
  const [spreadOn, setSpreadOn] = useState(Boolean(initial?.spreadAmount));
  const [tag, setTag] = useState<string | undefined>(initial?.tag);
  const tagTouched = useRef(Boolean(initial?.tag));
  const [spreadInput, setSpreadInput] = useState(initial?.spreadAmount ? amountInput(initial.spreadAmount) : "");
  const [allocationChoiceTouched, setAllocationChoiceTouched] = useState(() => {
    if (!initial) return false;
    if (initial.allocationId && initial.allocationId !== "outside") return true;
    return Boolean(initial.outsideChosen);
  });
  // Nota „Bon de …: … din … și … din …” o scriau versiunile vechi singure; omul vede doar ce a scris el.
  const [note, setNote] = useState(() => (initial?.note || "").replace(AUTO_SPLIT_NOTE, "").trim());
  const [error, setError] = useState("");
  const captureIdRef = useRef(initial?.id || newId("tx"));
  const heldOutside = useRef(false);
  const [originalAmountInput, setOriginalAmountInput] = useState(initial?.originalAmount ? String(initial.originalAmount) : "");
  const [splitOpen, setSplitOpen] = useState(false);
  /** Plată din două surse (de exemplu voucher SGR + cash): două cheltuieli legate, câte una pe sursă. */
  const [secondOpen, setSecondOpen] = useState(Boolean(splitPartner));
  const [secondSourceId, setSecondSourceId] = useState(splitPartner?.sourceId || "");
  const [secondAmount, setSecondAmount] = useState(splitPartner ? amountInput(splitPartner.amount) : "");
  /** Ce scrie omul în câmpul primei surse, ca „28,” să nu-și piardă virgula cât calculăm cealaltă sumă. */
  const [firstDraft, setFirstDraft] = useState<string | null>(null);
  // Bonul cu articole poate sta pe oricare parte a plății din două surse: îl căutăm pe amândouă,
  // altfel, deschisă din partea fără bon, corectura nu arăta articolele și le dezlega la salvare.
  const linkedReceipt = initial ? [initial, ...(splitPartner ? [splitPartner] : [])].map((part) => data.receipts.find((receipt) => (part.receiptId && receipt.id === part.receiptId) || receipt.linkedTransactionId === part.id || receipt.linkedTransactionIds?.includes(part.id))).find(Boolean) : undefined;
  // Denumirile din bonurile de până acum: sugerate la scriere, ca același produs să aibă mereu același nume.
  const products = useMemo(() => knownProducts(data), [data.receipts]);
  const [detailOpen, setDetailOpen] = useState(() => Boolean(linkedReceipt?.lines?.some((line) => !isReceiptGapLabel(line.label))));
  const [detailLines, setDetailLines] = useState<Array<{ id: string; category: string; amount: string; label: string; categoryPicked?: boolean; /** Bucăți sau kilograme; „amount” e atunci prețul pe bucată sau pe kg. */ qty?: string; unit?: QuantityUnit; /** Reducerea de pe bon, deja scăzută. */ discount?: number }>>(() => {
    const rows = (linkedReceipt?.lines || []).filter((line) => !isReceiptGapLabel(line.label));
    return rows.length ? rows.map((line) => { const split = splitQuantity(line.label || "", line.amount); return { id: line.id, category: line.category, amount: split.price, label: split.label, qty: split.qty || undefined, unit: split.unit, discount: line.discount }; }) : [{ id: newId("detail-line"), category: initial?.category || "Alimente", amount: "", label: "" }];
  });
  const [scanNote, setScanNote] = useState<{ text: string; warning: boolean } | null>(null);
  /** Totalul de pe bonul scanat: rândurile se verifică pe loc față de el, cât timp omul le corectează. */
  const [scanTotal, setScanTotal] = useState<number | null>(null);
  /** Bonul citit din poză umple formularul; nimic nu se salvează până nu apasă omul Salvează. */
  const applyScan = (prefill: ScanPrefill) => {
    setKind("expense");
    setTitle(prefill.title);
    setAmount(amountInput(prefill.amount));
    if (prefill.date) setDate(prefill.date);
    setCategory(prefill.category);
    if (prefill.sourceId) setSourceId(prefill.sourceId);
    if (prefill.second) {
      setSecondOpen(true);
      setSecondSourceId(prefill.second.sourceId);
      setSecondAmount(amountInput(prefill.second.amount));
    } else {
      setSecondOpen(false);
      setSecondAmount("");
    }
    setFirstDraft(null);
    if (prefill.lines.length) {
      setDetailLines(prefill.lines.map((line) => ({ id: newId("detail-line"), category: line.category, amount: amountInput(line.amount), label: line.label, discount: line.discount })));
      setDetailOpen(true);
    }
    setScanTotal(prefill.lines.length ? prefill.amount : null);
    // Diferența dintre rânduri și total o arată verificarea de sub ele, pe loc; aici rămâne doar poza greu de citit.
    const linesSum = Math.round(prefill.lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
    const mismatch = prefill.lines.length > 0 && Math.abs(linesSum - prefill.amount) > 0.05;
    setScanNote(prefill.warning && !mismatch
      ? { text: prefill.warning, warning: true }
      : { text: `${t("Am citit {count} produse, {total} în total.", { count: prefill.count, total: fmtExact.format(prefill.amount) })}${prefill.readBy === "claude" ? ` ${t("(citit de rezervă, Claude)")}` : ""}${prefill.discount > 0 ? ` ${t("Reduceri: −{amount}.", { amount: fmtExact.format(prefill.discount) })}` : ""} ${t("Verifică și apasă Salvează.")}`, warning: false });
  };
  const scanApplied = useRef(false);
  useEffect(() => {
    if (!scan || scanApplied.current) return;
    scanApplied.current = true;
    applyScan(scan);
  }, [scan]);
  const [lines, setLines] = useState<Array<{ id: string; category: string; amount: string; label: string }>>([
    { id: newId("split-line"), category: initial?.category || "Alimente", amount: initial ? amountInput(initial.amount) : "", label: "" },
  ]);
  /**
   * O încasare poate veni în altă valută decât a sursei (factură în EUR plătită în contul în
   * lei): omul alege valuta aici, nu în Setări (testare cu utilizatori, M6).
   */
  const [incomeCurrency, setIncomeCurrency] = useState(initial?.kind === "income" && initial.originalCurrency ? initial.originalCurrency : "");
  const entryCurrency = kind === "income" && incomeCurrency ? incomeCurrency : sourceCurrency(data, sourceId);
  const isForeign = entryCurrency !== BASE_CURRENCY;
  const savedRate = exchangeRateFor(data, entryCurrency);
  const [rateInput, setRateInput] = useState(initial?.exchangeRate ? String(initial.exchangeRate) : "");
  const activeRate = parseRomanianAmount(rateInput) || savedRate || 0;
  const typedAmount = parseRomanianAmount(amount);
  const baseAmount = isForeign ? toBaseAmount(typedAmount, activeRate) : typedAmount;
  const envelopeMatched = kind === "expense" ? matchingAllocationsForExpense(data, { category, memberId, sourceId }) : [];
  const envelopeCandidates = kind === "expense" ? pickerAllocationsForExpense(data, { category, memberId, sourceId }) : [];
  const envelopeCandidateIds = envelopeCandidates.map((item) => item.id).join("|");
  const matchedEnvelope = allocationId === "outside" ? undefined : envelopeCandidates.find((allocation) => allocation.id === allocationId);
  /** La corectură, soldul arătat e cel de dinaintea acestei mișcări: altfel sursa părea golită de chiar suma corectată. */
  const balanceBeforeThis = (id: string) => {
    const own = initial && data.transactions.some((item) => item.id === initial.id) && initial.sourceId === id ? (initial.kind === "expense" ? initial.amount : -initial.amount) : 0;
    const partner = splitPartner && splitPartner.sourceId === id ? splitPartner.amount : 0;
    return sourceBalance(data, id) + own + partner;
  };
  const sourceOwner = (source: AppData["settings"]["paymentSources"][number]) => data.settings.members.find((member) => member.id === source.memberId)?.name || t("Comun");
  const allocationMember = matchedEnvelope ? data.settings.members.find((member) => member.id === matchedEnvelope.memberId)?.name || t("Familie / comun") : "";
  const editedAlreadyInEnvelope = Boolean(matchedEnvelope && initial?.id && initial.allocationId === matchedEnvelope.id);
  const envelopeSpent = matchedEnvelope ? Math.max(0, allocationSpent(data, matchedEnvelope) - (editedAlreadyInEnvelope ? initial?.amount || 0 : 0)) : 0;
  const envelopeRemaining = matchedEnvelope ? allocationBudget(data, matchedEnvelope) - envelopeSpent : 0;
  const pacedEnvelope = Boolean(matchedEnvelope && isWeeklyPaced(matchedEnvelope, data.settings.salaryPlan));
  const matchedWeek = pacedEnvelope ? allocationWeekStatus(data, matchedEnvelope!, date) : undefined;
  // O mișcare din ciclul trecut nu are săptămâni în ciclul de acum: fără alegerea „Din ce săptămână”.
  const envelopeWeeks = pacedEnvelope && (!date || !data.settings.salaryPlan.periodStart || date >= data.settings.salaryPlan.periodStart) ? allocationWeeksStatus(data, matchedEnvelope!) : [];
  const proposedAmount = baseAmount || 0;
  /** Săptămâna aleasă, nu mereu tranșa datei. La corectare, suma veche nu se numără de două ori. */
  const pickedWeek = pacedEnvelope ? (envelopeWeeks.find((item) => item.index === (fromWeekIndex ?? matchedWeek?.index)) || matchedWeek) : undefined;
  const weeksAhead = matchedWeek ? envelopeWeeks.filter((item) => item.index >= matchedWeek.index).length : 0;
  const canSpread = kind === "expense" && pacedEnvelope && weeksAhead > 1;
  // Articolele bonului care țin o lună (igienă, detergent, haine, jucării, hrana animalelor): suma lor se completează la bifă.
  const monthLong = monthLongPart(detailLines.map((line) => ({ label: line.label, category: line.category, amount: lineTotal(line.amount, line.qty) })));
  const tickSpread = (on: boolean) => {
    setSpreadOn(on);
    if (on && !spreadInput.trim() && monthLong.amount > 0) setSpreadInput(amountInput(Math.min(monthLong.amount, parseRomanianAmount(amount) || monthLong.amount)));
  };
  const spreadTyped = parseRomanianAmount(spreadInput);
  const spreadPreview = Math.max(0, Math.min(parseRomanianAmount(amount) || 0, spreadTyped > 0 ? spreadTyped : parseRomanianAmount(amount) || 0));
  const initialInsidePicked = Boolean(initial?.date && pickedWeek && initial.date >= pickedWeek.start && initial.date <= pickedWeek.end);
  const pickedSpent = pickedWeek ? Math.max(0, pickedWeek.spent - (editedAlreadyInEnvelope && initialInsidePicked ? initial?.amount || 0 : 0)) : 0;
  const pickedRemaining = pickedWeek ? pickedWeek.budget - pickedSpent : envelopeRemaining;
  const envelopePhrase = matchedEnvelope ? envelopeChargePhrase({
    weekIndex: pickedWeek?.index,
    remaining: pickedRemaining,
    budget: pickedWeek ? pickedWeek.budget : allocationBudget(data, matchedEnvelope),
    pay: proposedAmount,
    format: money,
  }) : undefined;
  const unrepartized = planAllocationMath(data).unrepartized;
  const askWhere = kind === "expense" && !splitOpen && envelopeMatched.length > 0 && unrepartized > 0.009;
  const freeShort = proposedAmount > 0.009 ? Math.max(0, Math.round((proposedAmount - unrepartized) * 100) / 100) : 0;
  const suggestedEnvelope = envelopeMatched[0];
  const suggestedWeek = suggestedEnvelope && isWeeklyPaced(suggestedEnvelope, data.settings.salaryPlan) ? allocationWeekStatus(data, suggestedEnvelope, date) : undefined;
  const suggestedLeft = suggestedEnvelope ? (suggestedWeek ? suggestedWeek.remaining : allocationBudget(data, suggestedEnvelope) - allocationSpent(data, suggestedEnvelope)) : 0;
  const hideUnallocated = kind === "expense" && envelopeMatched.length > 0 && unrepartized < Math.max(0.005, proposedAmount);
  const canSplit = kind === "expense" && !initial && !isForeign;
  const resolvedSplit = canSplit && splitOpen ? resolveReceiptLines(lines, typedAmount) : [];
  const splitTotal = resolvedSplit.reduce((sum, line) => sum + line.amount, 0);
  useEffect(() => { setRateInput(savedRate && savedRate !== 1 ? String(savedRate) : ""); }, [entryCurrency]);
  useEffect(() => {
    if (kind !== "expense") { if (allocationId !== "outside") setAllocationId("outside"); return; }
    if (askWhere) {
      if (allocationId === "outside" && allocationChoiceTouched && freeShort > 0.009) setAllocationChoiceTouched(false);
      return;
    }
    if (hideUnallocated && allocationId === "outside" && envelopeMatched[0]) {
      setAllocationId(envelopeMatched[0].id);
      return;
    }
    const currentIsValid = allocationId !== "outside" && envelopeCandidates.some((allocation) => allocation.id === allocationId);
    if (!currentIsValid && allocationId !== "outside") setAllocationId(envelopeCandidates[0]?.id || "outside");
    if (!allocationChoiceTouched && allocationId === "outside") {
      const fallback = envelopeMatched[0] || (envelopeCandidates.length === 1 ? envelopeCandidates[0] : undefined);
      if (fallback) setAllocationId(fallback.id);
    }
  }, [allocationChoiceTouched, allocationId, envelopeCandidateIds, hideUnallocated, kind, askWhere, freeShort]);
  useEffect(() => {
    setFromWeekIndex(matchedWeek?.index);
  }, [allocationId, matchedWeek?.index]);
  const updateLine = (id: string, patch: Partial<(typeof lines)[number]>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  // Anul închis: mișcarea se salvează în registrul de acum (și în sold), nu se întoarce în arhivă.
  const archivedThrough = data.settings.archivedThrough || "";
  const closedYearHint = archivedThrough && date && date <= archivedThrough
    ? t("Anul {year} e închis. Mișcarea intră în registrul de acum și în sold, nu în arhiva descărcată.", { year: archivedThrough.slice(0, 4) })
    : undefined;
  // Întâi sursele celui care a plătit și cele comune; ale partenerului rămân la coadă, pentru plățile făcute cu cardul lui.
  const sourcesForMember = [...data.settings.paymentSources].sort((a, b) => Number(Boolean(a.memberId) && a.memberId !== memberId) - Number(Boolean(b.memberId) && b.memberId !== memberId));
  const pickMember = (next: string) => {
    setMemberId(next);
    const current = data.settings.paymentSources.find((item) => item.id === sourceId);
    if (!current?.memberId || current.memberId === next) return;
    const own = data.settings.paymentSources.find((item) => item.memberId === next && item.kind === current.kind)
      || data.settings.paymentSources.find((item) => item.memberId === next);
    if (own) setSourceId(own.id);
  };
  const save = async () => {
    const numeric = parseRomanianAmount(amount);
    const source = data.settings.paymentSources.find((item) => item.id === sourceId);
    const member = data.settings.members.find((item) => item.id === memberId);
    if (hasInvalidRoDate()) return setError(t("Data nu există în calendar. Scrie-o ca zz.ll.aaaa, de exemplu 05.10.2026."));
    if (!title.trim()) return setError(t("Scrie o denumire pentru mișcare."));
    if (!numeric || numeric < 0.005) return setError(amountError(amount) || t("Introdu o sumă mai mare decât zero."));
    if (!source || !member || !date) return setError(t("Alege data, membrul și sursa de plată."));
    if (isForeign && !(activeRate > 0)) return setError(t("Introdu cursul pentru {currency}: câți lei face o unitate.", { currency: entryCurrency }));
    const stored = isForeign ? toBaseAmount(numeric, activeRate) : numeric;
    if (!stored || stored <= 0) return setError(t("Suma convertită în lei nu este validă. Verifică suma și cursul."));
    if (askWhere && !splitOpen && !allocationChoiceTouched) return setError(t("Alege de unde se iau banii."));
    if (askWhere && !splitOpen && allocationId === "outside" && freeShort > 0.009) return setError(t("Nerepartizatul nu acoperă suma. Alege plicul sau o sumă mai mică."));
    if (canSplit && splitOpen) {
      const normalized = resolveReceiptLines(lines, numeric);
      const total = normalized.reduce((sum, line) => sum + line.amount, 0);
      if (!normalized.length || Math.abs(numeric - total) > 0.01) {
        return setError(t("Repartizarea este {split}, dar totalul este {total}. Corectează liniile.", { split: fmtExact.format(total), total: fmtExact.format(numeric) }));
      }
      const now = new Date().toISOString();
      const batch = normalized.map((line, index) => {
        const matched = matchingAllocationsForExpense(data, { category: line.category, memberId: member.id, sourceId: source.id })[0];
        return {
          id: index === 0 ? captureIdRef.current : newId("tx"),
          title: `${title.trim()}${line.label ? ` · ${line.label}` : ""}`,
          amount: line.amount,
          kind: "expense" as const,
          category: line.category,
          sourceId: source.id,
          source: source.name,
          memberId: member.id,
          person: member.name,
          date,
          note: note.trim() || undefined,
          allocationId: matched?.id || "outside",
          shareScope,
          createdAt: now,
          updatedAt: now,
        };
      });
      try {
        onSave(batch);
        onClose();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : t("Nu am putut salva mișcarea."));
      }
      return;
    }
    if (kind === "expense" && allocationId !== "outside" && !matchedEnvelope) return setError(t("Plicul ales nu mai corespunde categoriei, membrului sau sursei. Alege din nou."));
    const originalTyped = isForeign ? (parseRomanianAmount(originalAmountInput) || numeric) : undefined;
    const twin = !initial && data.transactions.find((item) => item.kind === kind && item.date === date && Math.abs(item.amount - stored) < 0.005 && (item.title || "").trim() === title.trim() && Date.now() - Date.parse(item.createdAt || "") < 120_000);
    if (twin && !await askConfirm(t("Ai notat deja „{title}” · {amount} acum câteva secunde. Îl mai pun o dată?", { title: twin.title, amount: money(twin.amount) }))) return;
    try {
      // Corectura păstrează natura mișcării: rata rămâne legată de datorie, transferul de
      // perechea lui, corecția de sold rămâne corecție, plata recurentă de scadența ei.
      const edited: Transaction = { ...(initial && initial.id === captureIdRef.current ? initial : {}), id: captureIdRef.current, title: title.trim(), amount: stored, originalAmount: isForeign ? originalTyped : undefined, originalCurrency: isForeign ? entryCurrency : undefined, exchangeRate: isForeign ? activeRate : undefined, kind, category: kind === "income" ? "Venit" : category, sourceId: source.id, source: source.name, memberId: member.id, person: member.name, date, note: note.trim() || undefined, allocationId: kind === "expense" ? allocationId : undefined, outsideChosen: kind === "expense" && allocationId === "outside" && (allocationChoiceTouched || Boolean(initial?.outsideChosen)) ? true : undefined, shareScope, createdAt: initial?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), receiptId: initial?.receiptId };
      // „Pentru toată luna”: partea scrisă, sau toată suma; doar la plicurile cu săptămâni, unde contează.
      edited.tag = kind === "expense" ? tag : undefined;
      edited.spreadAmount = canSpread && spreadOn && !isForeign ? Math.round(Math.min(stored, spreadTyped > 0 ? spreadTyped : stored) * 100) / 100 : undefined;
      // Transferul are două jumătăți: suma și data se corectează pe amândouă, altfel cardurile nu mai bat.
      const pair = initial?.transferId ? data.transactions.find((item) => item.transferId === initial.transferId && item.id !== initial.id) : undefined;
      const learnRule = kind === "expense" && title.trim().length >= 3 && allocationId !== "outside" && allocationId !== initial?.allocationId ? { match: title.trim(), category, allocationId } : undefined;
      let detailLinesOut: ReceiptLine[] | undefined;
      if (kind === "expense" && !isForeign && detailOpen) {
        // Fără nicio sumă scrisă nu facem bon: altfel apărea în Bonuri un bon gol cu tot totalul.
        const normalized = detailLines.some((line) => parseRomanianAmount(line.amount) > 0) ? resolveReceiptLines(detailLines.map((line) => ({ ...line, ...withQuantity(line.label, line.amount, line.qty, line.unit) })), stored) : [];
        const closed = closeReceiptGap(normalized, stored);
        if (closed.over) return setError(t("Repartizarea este {split}, dar totalul este {total}. Corectează liniile.", { split: fmtExact.format(normalized.reduce((sum, line) => sum + line.amount, 0)), total: fmtExact.format(stored) }));
        detailLinesOut = normalized.length ? closed.lines : linkedReceipt?.lines?.length ? [] : undefined;
      }
      if (secondOpen && kind === "expense" && !isForeign && !pair) {
        const second = Math.round(parseRomanianAmount(secondAmount) * 100) / 100;
        const other = data.settings.paymentSources.find((item) => item.id === secondSourceId && item.id !== source.id);
        if (!other) return setError(t("Alege a doua sursă, diferită de prima."));
        if (!(second > 0) || second >= stored) return setError(t("Suma din a doua sursă trebuie să fie mai mică decât totalul de {total}.", { total: fmtExact.format(stored) }));
        const first = Math.round((stored - second) * 100) / 100;
        // Nota rămâne a omului. Legătura dintre părți o țin splitId și totalul bonului (splitTotal):
        // dacă o parte dispare, suma rămasă nu mai dă totalul și Mișcări arată bonul ca incomplet.
        const ownNote = note.trim().replace(AUTO_SPLIT_NOTE, "").trim() || undefined;
        const splitId = initial?.splitId || splitPartner?.splitId || newId("split");
        // Bonul cu articole stă pe prima parte, oricare ar fi fost înainte.
        const spreadShare = (part: number) => edited.spreadAmount ? Math.round(edited.spreadAmount * part / stored * 100) / 100 : undefined;
        const main: Transaction = { ...edited, amount: first, note: ownNote, splitId, splitTotal: stored, receiptId: linkedReceipt?.id || edited.receiptId, spreadAmount: spreadShare(first) };
        const extra: Transaction = { ...(splitPartner || {}), ...edited, id: splitPartner?.id || newId("tx"), amount: second, sourceId: other.id, source: other.name, note: ownNote, splitId, splitTotal: stored, spreadAmount: spreadShare(second), debtId: undefined, recurringId: undefined, receiptId: undefined, createdAt: splitPartner?.createdAt || new Date().toISOString() };
        onSave([main, extra], { fromWeekIndex: kind === "expense" && pacedEnvelope ? fromWeekIndex : undefined, ...(learnRule ? { learnRule } : {}), ...(detailLinesOut ? { detailLines: detailLinesOut } : {}) });
        onClose();
        return;
      }
      if (splitPartner) {
        // „O singură sursă” scoate cealaltă parte din registru: omul o vede numită înainte.
        if (!await askConfirm(t("Bonul rămâne doar pe {source}, cu {amount}. Partea de {partAmount} din {partSource} se scoate din registru (o găsești în „Șterse recent”).", { source: source.name, amount: fmtExact.format(stored), partAmount: fmtExact.format(splitPartner.amount), partSource: splitPartner.source }), { title: t("O singură sursă?"), confirmLabel: t("Da, o singură sursă") })) return;
        edited.splitId = undefined;
        edited.splitTotal = undefined;
        edited.note = note.trim().replace(AUTO_SPLIT_NOTE, "").trim() || undefined;
        if (!edited.receiptId && linkedReceipt) edited.receiptId = linkedReceipt.id;
      }
      onSave(pair && !pair.originalCurrency && !edited.originalCurrency ? [edited, { ...pair, amount: edited.amount, date: edited.date, updatedAt: edited.updatedAt }] : edited, { fromWeekIndex: kind === "expense" && pacedEnvelope ? fromWeekIndex : undefined, ...(learnRule ? { learnRule } : {}), ...(detailLinesOut ? { detailLines: detailLinesOut } : {}), ...(splitPartner ? { removeIds: [splitPartner.id] } : {}) });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Nu am putut salva mișcarea."));
    }
  };
  const isStored = Boolean(initial && data.transactions.some((item) => item.id === initial.id));
  return <Modal title={isStored ? t("Corectează mișcarea") : t("Adaugă mișcare")} onClose={onClose}><div className="bf-segment"><button className={kind === "expense" ? "active expense" : ""} onClick={() => { setKind("expense"); setCategory((current) => expenseCategoryFor(current, title)); }}>{t("Cheltuială")}</button><button className={kind === "income" ? "active income" : ""} onClick={() => setKind("income")}>{t("Venit")}</button></div>{kind === "expense" && !isStored && !isForeign && <ReceiptScanButton data={data} memberId={memberId} onResult={applyScan} />}{scanNote && <p className={`bf-scan-note${scanNote.warning ? " is-warning" : ""}`} role="status">{scanNote.text}</p>}{scanTotal != null && detailOpen && (() => {
        const sum = Math.round(detailLines.reduce((total, line) => total + Math.max(0, lineTotal(line.amount, line.qty)), 0) * 100) / 100;
        const diff = Math.round((scanTotal - sum) * 100) / 100;
        if (Math.abs(diff) <= 0.05) return <p className="bf-scan-check is-ok" role="status">{t("✓ Rândurile bat cu totalul bonului ({total}).", { total: fmtExact.format(scanTotal) })}</p>;
        return <div className="bf-scan-check is-off" role="alert"><p>{diff > 0
          ? t("Lipsesc {diff} față de totalul bonului ({total}): rândurile fac {sum}. Poate un produs n-a fost citit.", { diff: fmtExact.format(diff), total: fmtExact.format(scanTotal), sum: fmtExact.format(sum) })
          : t("Rândurile fac {sum}, cu {diff} peste totalul bonului ({total}). Verifică sumele sau o reducere necitită.", { diff: fmtExact.format(-diff), total: fmtExact.format(scanTotal), sum: fmtExact.format(sum) })}</p><small>{t("Bonul e mototolit sau umbrit? Întinde-l, fotografiază-l drept de sus, cu lumină bună, și scanează din nou.")}</small><span className="bf-scan-check-actions">{diff > 0 && <button type="button" className="bf-link-button" onClick={() => setDetailLines((current) => [...current, { id: newId("detail-line"), category: "Altele", amount: amountInput(diff), label: t("Diferență față de bon") }])}>{t("Adaugă un rând cu diferența")}</button>}<button type="button" className="bf-link-button" onClick={() => (document.querySelector(".bf-scan-receipt-main") as HTMLButtonElement | null)?.click()}>{t("Scanează din nou")}</button></span></div>;
      })()}<div className="bf-form-grid"><Field label={t("Denumire")}><input autoFocus value={title} onChange={(event) => { const next = event.target.value; setTitle(next); const learned = kind === "expense" && !tagTouched.current ? suggestTag(data, next) : undefined; if (learned) setTag(learned); if (kind !== "expense" || (allocationChoiceTouched && !heldOutside.current)) return; const target = spendTargetFromText(data, next, { memberId, sourceId }); if (target.kind === "keep") { if (heldOutside.current) { heldOutside.current = false; setAllocationChoiceTouched(false); } return; } if (target.kind === "envelope") { heldOutside.current = false; if (target.category) setCategory(target.category); setAllocationId(target.allocationId); setAllocationChoiceTouched(false); return; } if (target.kind === "category") { heldOutside.current = false; if (target.category !== category) setCategory(target.category); setAllocationChoiceTouched(false); return; } heldOutside.current = true; setAllocationId("outside"); setAllocationChoiceTouched(true); }} placeholder={kind === "income" ? t("ex. Salariu, Voucher SGR") : t("ex. Cumpărături Lidl")} /></Field><Field label={t("Sumă ({currency})", { currency: isForeign ? entryCurrency : "lei" })}><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" /></Field>{kind === "income" && <Field label={t("Valuta încasării")}><select value={incomeCurrency || sourceCurrency(data, sourceId)} onChange={(event) => setIncomeCurrency(event.target.value === sourceCurrency(data, sourceId) ? "" : event.target.value)}>{Array.from(new Set([sourceCurrency(data, sourceId), BASE_CURRENCY, "EUR", "USD", "GBP"])).map((code) => <option key={code} value={code}>{code === BASE_CURRENCY ? t("lei (RON)") : code}</option>)}</select></Field>}{isForeign && <Field label={t("Curs: 1 {currency} = ? lei", { currency: entryCurrency })} hint={savedRate ? t("Cursul salvat în Setări este {rate}. Îl poți schimba doar pentru această mișcare.", { rate: savedRate.toLocaleString(getLocale(), { maximumFractionDigits: 4 }) }) : t("Nu ai încă un curs salvat pentru această valută. Îl poți pune o dată, în Setări.")}><input value={rateInput} onChange={(event) => setRateInput(event.target.value)} inputMode="decimal" placeholder="ex. 4,97" /></Field>}{isForeign && initial && !initial.originalAmount && <Field label={t("Sumă originală ({currency})", { currency: entryCurrency })} hint={t("Mișcarea a fost salvată doar în lei. Completează suma din extras ca soldul valutar să nu mai fie aproximativ.")}><input value={originalAmountInput} onChange={(event) => setOriginalAmountInput(event.target.value)} inputMode="decimal" placeholder="ex. 20,00" /></Field>}<Field label={t("Data")} hint={closedYearHint}><RoDateInput value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label={t("Cine a făcut mișcarea")}><select value={memberId} onChange={(event) => pickMember(event.target.value)}>{data.settings.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label={t("Perspectivă")} hint={t("Personal rămâne la membru; comun intră în bilanțul familiei.")}><select value={shareScope} onChange={(event) => setShareScope(event.target.value as ShareScope)}><option value="shared">{t("Comun (familie)")}</option><option value="personal">{t("Personal")}</option></select></Field><div style={{ gridColumn: "1 / -1" }}><SourcePicker data={data} sources={sourcesForMember} value={sourceId} label={kind === "income" ? t("Încasat în") : t("Plătit din (sursa reală)")} memberId={memberId} balanceOf={balanceBeforeThis} format={(value, source) => source.currency ? `${value.toLocaleString(getLocale(), { maximumFractionDigits: 2 })} ${source.currency}` : money(value)} onChange={setSourceId} /></div>{kind === "expense" && !splitOpen && !isForeign && !initial?.transferId && (secondOpen ? <div className="bf-second-source" style={{ display: "grid", gap: 8, gridColumn: "1 / -1" }}><Field label={t("Și din sursa")}><select value={secondSourceId} onChange={(event) => setSecondSourceId(event.target.value)}><option value="">{t("Alege")}</option>{data.settings.paymentSources.filter((item) => item.id !== sourceId && item.kind !== "transfer").map((item) => <option key={item.id} value={item.id}>{item.name}{item.memberId && !item.name.includes(sourceOwner(item)) ? ` · ${sourceOwner(item)}` : ""} · {money(balanceBeforeThis(item.id))}</option>)}</select></Field><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><Field label={t("Din {name} (lei)", { name: data.settings.paymentSources.find((item) => item.id === sourceId)?.name || t("prima sursă") })}><input inputMode="decimal" value={firstDraft ?? (secondAmount && parseRomanianAmount(amount) > 0 ? amountInput(Math.max(0, Math.round((parseRomanianAmount(amount) - parseRomanianAmount(secondAmount)) * 100) / 100)) : "")} onChange={(event) => { setFirstDraft(event.target.value); const total = parseRomanianAmount(amount); const first = parseRomanianAmount(event.target.value); setSecondAmount(total > 0 && first >= 0 && first <= total ? amountInput(Math.round((total - first) * 100) / 100) : ""); }} onBlur={() => setFirstDraft(null)} placeholder={t("ex. 28,50")} /></Field><Field label={t("Din a doua sursă (lei)")}><input inputMode="decimal" value={secondAmount} onChange={(event) => { setFirstDraft(null); setSecondAmount(event.target.value); }} placeholder={t("ex. 11,26")} /></Field></div><p className="bf-helper">{t("Scrie una din sume; cealaltă se completează din total ({total}).", { total: fmtExact.format(parseRomanianAmount(amount) || 0) })}</p><button type="button" className="bf-link-button" onClick={() => { setSecondOpen(false); setSecondAmount(""); }}>{t("O singură sursă")}</button></div> : <button type="button" className="bf-link-button" style={{ gridColumn: "1 / -1" }} onClick={() => setSecondOpen(true)}>{t("+ Plătit din două surse (ex. voucher și cash)")}</button>)}{kind === "expense" && !splitOpen && <Field label={t("Categorie")}><select value={category} onChange={(event) => setCategory(event.target.value)}>{[...expenseCategories, ...data.settings.customCategories].map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></Field>}{kind === "expense" && <TagChips data={data} value={tag} onChange={(next) => { tagTouched.current = true; setTag(next); }} />}</div>{isForeign && <section className={`bf-currency-preview ${baseAmount ? "" : "pending"}`}><p className="bf-kicker">{t("SE ÎNREGISTREAZĂ ÎN LEI")}</p>{baseAmount ? <><b>{fmtExact.format(baseAmount)}</b><span>{t("{original} × {rate} lei. Suma originală și cursul rămân salvate lângă mișcare.", { original: fmtExact.format(typedAmount).replace("RON", entryCurrency), rate: activeRate.toLocaleString(getLocale(), { maximumFractionDigits: 4 }) })}</span></> : <span>{t("Completează suma și cursul ca să vezi echivalentul în lei.")}</span>}</section>}{canSplit && <section className="bf-receipt-split bf-tx-split"><div className="bf-split-heading"><div><p className="bf-kicker">{t("ÎMPARTE CHELTUIALA")}</p><h3>{splitOpen ? `${fmtExact.format(splitTotal)} / ${amount ? fmtExact.format(typedAmount) : "0,00 RON"}` : t("Pe categorii sau plicuri")}</h3></div><button type="button" className="bf-secondary" onClick={() => setSplitOpen((value) => !value)}>{splitOpen ? t("O singură categorie") : t("Împarte pe linii")}</button></div>{splitOpen && <>{lines.map((line) => <div className="bf-split-line" key={line.id}><select aria-label={t("Categorie")} value={line.category} onChange={(event) => updateLine(line.id, { category: event.target.value })}>{[...expenseCategories, ...data.settings.customCategories].map((item) => <option key={item} value={item}>{t(item)}</option>)}</select><input aria-label={t("Sumă")} value={line.amount} onChange={(event) => updateLine(line.id, { amount: event.target.value })} inputMode="decimal" placeholder="lei" /><input aria-label={t("Detaliu")} value={line.label} onChange={(event) => updateLine(line.id, { label: event.target.value })} placeholder={t("ex. lapte")} />{lines.length > 1 && <button type="button" aria-label={t("Elimină linia")} onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))}><Trash2 size={16} /></button>}</div>)}<button type="button" className="bf-secondary" onClick={() => setLines((current) => [...current, { id: newId("split-line"), category: "Alimente", amount: "", label: "" }])}><Plus size={16} /> {t("Adaugă linie")}</button><small>{t("Fiecare linie creează o mișcare separată, cu plicul potrivit categoriei.")}</small></>}</section>}{kind === "expense" && !splitOpen && data.settings.salaryPlan.allocations.length > 0 && <section className="bf-envelope-choice"><div><p className="bf-kicker">{askWhere ? t("DE UNDE SE IA") : t("BUGET REPARTIZAT")}</p><h3>{askWhere ? t("Alege tu de unde se iau banii.") : t("Plicul compatibil este ales automat.")}</h3><p>{askWhere ? t("Plicul nu se alege singur cât ai și bani nerepartizați.") : t("Categoria, membrul și sursa reală găsesc plicul potrivit. Poți alege alt plic sau plată în afara plicurilor.")}</p></div>{askWhere && suggestedEnvelope && <SpendFromChoice envelopeLabel={suggestedEnvelope.label} envelopeLeft={money(Math.max(0, suggestedLeft))} freeLabel={money(unrepartized)} freeHint={money(freeShort)} freeDisabled={freeShort > 0.009} picked={!allocationChoiceTouched ? "none" : allocationId === "outside" ? "free" : allocationId === suggestedEnvelope.id ? "envelope" : "none"} onEnvelope={() => { setAllocationId(suggestedEnvelope.id); setAllocationChoiceTouched(true); }} onFree={() => { setAllocationId("outside"); setAllocationChoiceTouched(true); }} />}{(!askWhere || envelopeCandidates.length > 1) && <Field label={askWhere ? t("Alt plic") : t("Plic de consum")}><select value={askWhere && (allocationId === "outside" || !allocationChoiceTouched) ? "" : allocationId} onChange={(event) => { const next = event.target.value; if (!next) return; setAllocationId(next); setAllocationChoiceTouched(true); }}>{askWhere && <option value="">{allocationChoiceTouched && allocationId === "outside" ? t("Din nerepartizat") : t("Alege de unde")}</option>}{(!askWhere && (!hideUnallocated || allocationId === "outside")) && <option value="outside">{t("În afara plicurilor — nu consumă buget repartizat")}</option>}{envelopeCandidates.map((allocation) => { const owner = data.settings.members.find((member) => member.id === allocation.memberId)?.name || t("Familie / comun"); const remaining = allocationBudget(data, allocation) - allocationSpent(data, allocation); const week = isWeeklyPaced(allocation, data.settings.salaryPlan) ? allocationWeekStatus(data, allocation, date) : undefined; return <option key={allocation.id} value={allocation.id}>{allocation.label}{data.settings.members.length > 1 ? ` · ${owner}` : ""} · {week ? envelopeOptionRemain(week.remaining, money, week.index) : remaining < -0.004 ? envelopeOptionRemain(remaining, money) : money(remaining)}</option>; })}</select></Field>}{envelopeWeeks.length > 1 && <Field label={t("Din ce săptămână")}><select value={String(fromWeekIndex || matchedWeek?.index || "")} onChange={(event) => setFromWeekIndex(Number(event.target.value) || undefined)}>{envelopeWeeks.map((item) => <option key={item.index} value={item.index}>{weekOptionLabel(item.index, item.remaining, item.budget, money)}</option>)}</select></Field>}{!envelopeCandidates.length && <small className="bf-envelope-empty">{t("Nu există un plic pentru această combinație de categorie, membru și sursă. Poți înregistra cheltuiala în afara plicurilor sau crea unul în Plicuri.")}</small>}</section>}{!splitOpen && matchedEnvelope ? <section className={`bf-envelope-match ${envelopePhrase?.over ? "over" : ""}`}><p>{pickedWeek ? (pickedWeek.index === matchedWeek?.index ? t("SE VA LUA DIN PLICUL SĂPTĂMÂNII ACTIVE") : t("SE VA LUA DIN S{index}", { index: pickedWeek.index })) : t("SE VA LUA DIN PLIC")}</p><b>{matchedEnvelope.label} · {allocationMember} · {data.settings.paymentSources.find((source) => source.id === (allocationSourceIds(matchedEnvelope).includes(sourceId) ? sourceId : matchedEnvelope.sourceId))?.name || t("sursa aleasă")}</b>{envelopePhrase && <span>{envelopePhrase.text}</span>}{(() => {
        // Plic din mai multe surse: cât mai e din partea sursei alese, ca să știi dacă ajunge sau treci pe alta.
        const parts = allocationSourceParts(data, matchedEnvelope);
        const part = parts.length > 1 ? parts.find((entry) => entry.sourceId === sourceId) : undefined;
        if (!part) return null;
        const name = data.settings.paymentSources.find((source) => source.id === sourceId)?.name || "";
        const left = part.left - (initial?.sourceId === sourceId && initial.allocationId === matchedEnvelope.id ? -initial.amount : 0) - (parseRomanianAmount(amount) || 0);
        return <span>{left >= -0.009
          ? t("Din partea {source} a plicului rămân {left} din {share}.", { source: name, left: money(left), share: money(part.share) })
          : t("Partea {source} din plic e de {share} și nu mai ajunge: {over} peste. Restul plătește-l din altă sursă a plicului.", { source: name, share: money(part.share), over: money(-left) })}</span>;
      })()}</section> : kind === "expense" && !splitOpen && data.settings.salaryPlan.allocations.length > 0 && <section className="bf-envelope-match outside"><p>{t("PLATĂ ÎN AFARA PLICURILOR")}</p><b>{t("Va scădea doar soldul sursei reale de plată.")}</b><span>{t("Nu consumă nicio limită repartizată pentru categorii.")}</span></section>}{(initial || detailOpen) && kind === "expense" && !isForeign && <section className="bf-receipt-split">{!detailOpen ? <button type="button" className="bf-secondary" onClick={() => setDetailOpen(true)}><Plus size={16} /> {t("Adaugă articole")}</button> : <><div className="bf-split-heading"><p className="bf-kicker">{t("ARTICOLE")}</p></div><div className="bf-item-head" aria-hidden="true"><span>{t("Ce ai cumpărat")}</span><span>{t("Lei/buc")}</span></div>{detailLines.map((line) => <div className="bf-item-row" key={line.id}><input aria-label={t("Ce ai cumpărat")} list="bf-known-products" value={line.label} onChange={(event) => { const label = event.target.value; setDetailLines((current) => current.map((entry) => { if (entry.id !== line.id) return entry; /* Un produs știut din bonuri își aduce categoria și ultimul preț; altfel categoria se ghicește după nume (vodca → Băuturi), cât n-a ales-o omul. */ const known = findKnownProduct(products, label); const guessed = known?.category || (label.trim().length >= 3 ? guessCategoryFromText(label, [...expenseCategories, ...data.settings.customCategories], data.settings.merchantRules) : undefined); return { ...entry, label, ...(guessed && !entry.categoryPicked ? { category: guessed } : {}), ...(known && !entry.amount ? { amount: amountInput(known.amount) } : {}) }; })); }} placeholder={t("ex. cartofi")} /><input aria-label={t("Cât a costat, lei")} value={line.amount} onChange={(event) => setDetailLines((current) => current.map((entry) => entry.id === line.id ? { ...entry, amount: event.target.value } : entry))} inputMode="decimal" placeholder="0" />{detailLines.length > 1 ? <button type="button" aria-label={t("Șterge articolul")} onClick={() => setDetailLines((current) => current.filter((entry) => entry.id !== line.id))}><Trash2 size={16} /></button> : <span />}<select aria-label={t("Categorie")} value={line.category} onChange={(event) => setDetailLines((current) => current.map((entry) => entry.id === line.id ? { ...entry, category: event.target.value, categoryPicked: true } : entry))}>{[...expenseCategories, ...data.settings.customCategories].map((item) => <option key={item} value={item}>{t(item)}</option>)}</select><span className="bf-item-qty"><input aria-label={line.unit === "kg" ? t("Câte kilograme") : t("Câte bucăți")} value={line.qty || ""} onChange={(event) => setDetailLines((current) => current.map((entry) => entry.id === line.id ? { ...entry, qty: event.target.value } : entry))} inputMode="decimal" placeholder="1" /><button type="button" aria-label={t("Schimbă unitatea: bucăți sau kilograme")} onClick={() => setDetailLines((current) => current.map((entry) => entry.id === line.id ? { ...entry, unit: entry.unit === "kg" ? "buc" : "kg" } : entry))}>{line.unit === "kg" ? "kg" : t("buc")}</button></span>{(line.discount || 0) > 0 && <small className="bf-item-total">{t("reducere −{amount}", { amount: fmtExact.format(line.discount || 0) })}</small>}{(parseRomanianAmount(line.qty || "") || 0) > 0 && parseRomanianAmount(line.amount) > 0 && <small className="bf-item-total">{t("{qty} {unit} × {price} = {total}", { qty: line.qty || "", unit: line.unit === "kg" ? "kg" : t("buc"), price: fmtExact.format(parseRomanianAmount(line.amount)), total: fmtExact.format(lineTotal(line.amount, line.qty)) })}</small>}</div>)}<button type="button" className="bf-secondary" onClick={() => setDetailLines((current) => [...current, { id: newId("detail-line"), category, amount: "", label: "" }])}><Plus size={16} /> {t("Adaugă articol")}</button><small>{t("Ce nu știi rămâne diferență neînregistrată.")}</small>{products.length > 0 && <datalist id="bf-known-products">{products.map((item) => <option key={item.label} value={item.label} />)}</datalist>}</>}</section>}{canSpread && !splitOpen && !isForeign && <section className="bf-spread" style={{ display: "grid", gap: 8, margin: "4px 0 12px", padding: "12px 14px", border: "1px dashed var(--cf-line)", borderRadius: 14 }}><label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={spreadOn} onChange={(event) => tickSpread(event.target.checked)} style={{ marginTop: 3 }} /><span><b>{t("Cumpărătură pentru toată luna")}</b><br /><small className="bf-helper">{t("Detergent, hrană pentru animale, provizii: se împart pe săptămânile rămase, nu golesc săptămâna asta.")}</small></span></label>{spreadOn && <><Field label={t("Din care pentru toată luna (lei)")} hint={t("Gol = toată suma. Ex.: din bonul de 165,50, doar detergentul și hrana pisicii.")}><input inputMode="decimal" value={spreadInput} onChange={(event) => setSpreadInput(event.target.value)} placeholder={amountInput(parseRomanianAmount(amount) || 0)} /></Field>{monthLong.amount > 0 && <p className="bf-helper">{t("De pe bon, ce nu e mâncare: {items} = {amount}.", { items: monthLong.labels.slice(0, 6).join(", ") + (monthLong.labels.length > 6 ? "…" : ""), amount: fmtExact.format(monthLong.amount) })}</p>}{spreadPreview > 0 && (() => {
          // Aceeași împărțire ca în plic: pe măsura fiecărei săptămâni rămase.
          const ahead = envelopeWeeks.filter((item) => matchedWeek && item.index >= matchedWeek.index);
          const weight = ahead.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
          const thisShare = weight > 0 && matchedWeek ? spreadPreview * Math.max(0, matchedWeek.amount) / weight : spreadPreview / weeksAhead;
          return <p className="bf-helper">{t("Se împarte pe cele {weeks} săptămâni rămase, după mărimea lor (o săptămână întreagă cam {full}). Săptămâna asta scade {now}.", { weeks: weeksAhead, full: fmtExact.format(weight > 0 ? spreadPreview * Math.max(...ahead.map((item) => item.amount)) / weight : spreadPreview / weeksAhead), now: fmtExact.format(Math.max(0, (parseRomanianAmount(amount) || 0) - spreadPreview) + thisShare) })}</p>;
        })()}</>}</section>}<Field label={t("Notiță opțională")}><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("ex. cursă taxi, traseu, persoană, motiv")} /></Field>{error && <p className="bf-form-error" role="alert">{error}</p>}<button className="bf-primary full" onClick={save}><Check size={17} /> {t("Salvează mișcarea")}</button></Modal>;
}
