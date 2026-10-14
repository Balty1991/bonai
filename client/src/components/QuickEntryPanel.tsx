/**
 * Atelier Financiar — captură rapidă locală care respectă plicul compatibil și tranșa activă.
 * Filosofie: sursa plății poate aparține unui alt membru; plicul se alege după categoria și sursa reală.
 */
import { RoDateInput } from "./RoDateInput";
import { TagChips } from "@/components/TagChips";
import { suggestTag } from "@/lib/tags";
import { categoryTone } from "@/lib/category-color";
import { SourceTransferForm } from "@/components/SourceTransferForm";
import "../currency.css";
import "../transaction-envelope-picker.css";
import "../mobile-capture-pass.css";
import "../receipt-form-fix.css";
import "../capture-amount-first.css";
import { ReceiptScanButton } from "@/components/ReceiptScanButton";
import type { ScanPrefill } from "@/lib/receipt-scan";
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, Baby, BookmarkPlus, Bus, Check, CreditCard, Ellipsis, Mic, MicOff, HeartPulse, House, Plane, Plus, ShoppingCart, Ticket, Trash2, X } from "lucide-react";
import { CategoryGlyph } from "@/components/CategoryGlyph";
import { SourcePicker } from "@/components/SourcePicker";
import { allocationSourceParts, amountError, BASE_CURRENCY, isBalanceAdjustment, allocationStatus, allocationWeeksStatus, allocationWeekStatus, exchangeRateFor, expenseCategories, formatDate, foldRomanian, isoToday, addIsoDays, isWeeklyPaced, matchingAllocationsForExpense, pickerAllocationsForExpense, planAllocationMath, newId, parseRomanianAmount, sourceBalance, sourceCurrency, spendTargetFromText, toBaseAmount, guessCategoryFromText, type AppData, type ReceiptLine, type QuickTransactionTemplate, type Transaction, type TransactionKind, type PaymentSource } from "@/lib/finance-data";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { getLocale, t } from "@/lib/i18n";
import { selfMemberIdOf } from "@/lib/member-identity";
import { askConfirm } from "@/lib/confirm-dialog";
import { lei } from "@/lib/money-format";
import { listenOnce, voiceAvailable } from "@/lib/voice-input";
import { parseSpokenEntry } from "@/lib/voice-entry";
import { activeTrip } from "@/lib/trip";
import { envelopeChargePhrase, envelopeOptionRemain, weekOptionLabel } from "@/lib/envelope-charge";
import { SpendFromChoice } from "@/components/SpendFromChoice";
import { findKnownProduct, knownProducts } from "@/lib/price-history";

const money = { format: lei };

/**
 * Registrul și soldul sursei sunt în lei. Pe o sursă în euro, cifra tastată nu e deja lei —
 * fără curs nu inventăm impactul, ca previzualizarea să nu scadă 10 când se salvează 50.
 */
export function entryLedgerAmount(typed: number, isForeign: boolean, rate?: number): number | undefined {
  if (!Number.isFinite(typed) || typed <= 0) return 0;
  if (!isForeign) return typed;
  return toBaseAmount(typed, rate);
}

const CAPTURE_CATEGORIES: Array<[string, typeof ShoppingCart]> = [
  ["Alimente", ShoppingCart],
  ["Casă & facturi", House],
  ["Transport", Bus],
  ["Consumabile copil", Baby],
  ["Sănătate", HeartPulse],
  ["Timp liber", Ticket],
  ["Abonamente", CreditCard],
  ["Altele", Ellipsis],
];

type Props = { /** „Mută bani” de pe Astăzi deschide direct mutarea între surse. */ initialMoving?: boolean; onAddSource?: (source: PaymentSource) => void; data: AppData; onSave: (item: Transaction | Transaction[], meta?: { fromWeekIndex?: number; learnRule?: { match: string; category: string; allocationId?: string }; detailLines?: ReceiptLine[]; vendor?: string }) => void; onClose: () => void; onMore: (draft: Transaction, scan?: ScanPrefill) => void; onSaveTemplate: (item: QuickTransactionTemplate) => void; onDeleteTemplate: (id: string) => void; onArchiveTemplate: (id: string) => void; onRestoreTemplate: (id: string) => void; onDeleteArchivedTemplate: (id: string) => void; initialTemplateId?: string; /** „Notează salariul” deschide direct pe Venit. */ initialKind?: TransactionKind; /** Scurtătura „Spune” de pe iconiță: microfonul pornește singur. */ autoVoice?: boolean; };

export function QuickEntryPanel({ data, onSave, onClose, onMore, onSaveTemplate, onDeleteTemplate, onArchiveTemplate, onRestoreTemplate, onDeleteArchivedTemplate, initialTemplateId, initialKind, autoVoice, initialMoving, onAddSource }: Props) {
  const amountRef = useRef<HTMLInputElement>(null);
  /**
   * Pe telefon foaia se deschide întreagă, fără tastatură: omul vede tot formularul, iar
   * tastatura apare când atinge „Sumă”. Deschisă automat, ea acoperea jumătate de foaie și
   * reașeza ecranul chiar în timpul animației. Pe calculator cursorul stă direct pe sumă.
   */
  useEffect(() => {
    const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (!touch) amountRef.current?.focus({ preventScroll: true });
  }, []);
  const [kind, setKind] = useState<TransactionKind>(initialKind || "expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Alimente");
  const [incomeLabel, setIncomeLabel] = useState("");
  /** Salariile declarate la pornire („Salariul meu · 4.700”): o atingere completează suma, persoana și cardul. */
  const declaredIncomes = (data.settings.salaryPlan.incomes || []).filter((item) => !item.archived && item.amount > 0);
  const pickDeclaredIncome = (item: (typeof declaredIncomes)[number]) => {
    setIncomeLabel(item.label);
    setAmount(String(item.amount).replace(".", ","));
    if (item.memberId && data.settings.members.some((member) => member.id === item.memberId)) setMemberId(item.memberId);
    const own = data.settings.paymentSources.find((source) => source.memberId === item.memberId && source.kind !== "meal" && source.kind !== "cash");
    if (own) setSourceId(own.id);
  };
  const [merchant, setMerchant] = useState("");
  const [tag, setTag] = useState<string | undefined>(undefined);
  const tagTouched = useRef(false);
  /** Ce s-a cumpărat, opțional, lângă magazin: „Lidl · pâine” fără să deschizi cheltuiala detaliată. */
  const [article, setArticle] = useState("");
  const products = useMemo(() => knownProducts(data), [data.receipts]);
  /** Produsele potrivite cu ce scrii: apar abia după 2 litere, ca lista să nu acopere tastatura. */
  const productHits = useMemo(() => {
    const typed = foldRomanian(article.trim());
    if (typed.length < 2) return [];
    return products.filter((item) => { const label = foldRomanian(item.label); return label !== typed && label.includes(typed); }).slice(0, 5);
  }, [article, products]);
  /** Ziua cheltuielii: azi, ieri sau alta, fără să deschizi forma completă. */
  const [entryDate, setEntryDate] = useState(isoToday());
  const [otherDay, setOtherDay] = useState(false);
  const pickArticle = (next: string) => {
    setArticle(next);
    if (categoryTouched || next.trim().length < 3) return;
    const guessed = findKnownProduct(products, next)?.category || guessCategoryFromText(next, [...expenseCategories, ...data.settings.customCategories], data.settings.merchantRules);
    if (guessed && guessed !== category) { setCategory(guessed); setAllocationChoiceTouched(false); }
  };
  const quickTitle = () => [merchant.trim(), article.trim()].filter(Boolean).join(" · ");
  const [memberId, setMemberId] = useState(selfMemberIdOf(data));
  const [sourceId, setSourceId] = useState(data.settings.paymentSources[0]?.id || "");
  const [allocationId, setAllocationId] = useState("outside");
  // În vacanță, cheltuiala merge în bugetul călătoriei, nu în plicuri; chipul o poate scoate.
  const trip = activeTrip(data, isoToday());
  const [forTrip, setForTrip] = useState(true);
  const tripOn = kind === "expense" && Boolean(trip) && forTrip;
  const [fromWeekIndex, setFromWeekIndex] = useState<number | undefined>();
  const [allocationChoiceTouched, setAllocationChoiceTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const initialTemplateApplied = useRef(false);
  const [templateLabel, setTemplateLabel] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [error, setError] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const shortStore = kind === "expense" && !moreOpen;
  const [moving, setMoving] = useState(Boolean(initialMoving));
  const captureIdRef = useRef(newId("tx"));
  const activeTemplate = data.settings.quickTemplates.find((item) => item.id === templateId);
  const matched = kind === "expense" ? matchingAllocationsForExpense(data, { category, memberId, sourceId }) : [];
  const candidates = kind === "expense" ? pickerAllocationsForExpense(data, { category, memberId, sourceId }) : [];
  const candidateIds = candidates.map((item) => item.id).join("|");
  const matchedAllocation = candidates.find((item) => item.id === allocationId);
  const paced = Boolean(matchedAllocation && isWeeklyPaced(matchedAllocation, data.settings.salaryPlan));
  const week = paced ? allocationWeekStatus(data, matchedAllocation!) : undefined;
  const weeks = paced ? allocationWeeksStatus(data, matchedAllocation!) : [];
  const matchedTotal = matchedAllocation && !paced ? allocationStatus(data, matchedAllocation) : undefined;
  const unrepartized = planAllocationMath(data).unrepartized;
  const entryCurrency = sourceCurrency(data, sourceId);
  const isForeign = entryCurrency !== BASE_CURRENCY;
  const entryRate = exchangeRateFor(data, entryCurrency);
  const typedAmount = parseRomanianAmount(amount);
  const ledgerAmount = entryLedgerAmount(typedAmount, isForeign, entryRate);
  const hideUnallocated = kind === "expense" && matched.length > 0 && ledgerAmount != null && unrepartized < Math.max(0.005, ledgerAmount || 0);
  const askWhere = kind === "expense" && !tripOn && matched.length > 0 && !matched[0].anySource && unrepartized > 0.009;
  const freeShort = ledgerAmount != null && ledgerAmount > 0.009 ? Math.max(0, Math.round((ledgerAmount - unrepartized) * 100) / 100) : 0;
  const suggestedEnvelope = matched[0];
  const suggestedWeek = suggestedEnvelope && isWeeklyPaced(suggestedEnvelope, data.settings.salaryPlan) ? allocationWeekStatus(data, suggestedEnvelope) : undefined;
  const suggestedLeft = suggestedEnvelope ? (suggestedWeek ? suggestedWeek.remaining : allocationStatus(data, suggestedEnvelope).remaining) : 0;
  const archiveGroups = useMemo(() => Object.entries(data.settings.archivedQuickTemplates.reduce<Record<string, typeof data.settings.archivedQuickTemplates>>((all, item) => {
    const month = item.archivedAt.slice(0, 7); return { ...all, [month]: [...(all[month] || []), item] };
  }, {})).sort(([left], [right]) => right.localeCompare(left)), [data.settings.archivedQuickTemplates]);

  useEffect(() => {
    if (!data.settings.paymentSources.some((source) => source.id === sourceId)) setSourceId(data.settings.paymentSources[0]?.id || "");
  }, [data.settings.paymentSources, sourceId]);
  useEffect(() => {
    if (kind !== "expense") { if (allocationId !== "outside") setAllocationId("outside"); return; }
    if (askWhere) {
      if (allocationId === "outside" && allocationChoiceTouched && freeShort > 0.009) setAllocationChoiceTouched(false);
      return;
    }
    if (hideUnallocated && allocationId === "outside" && matched[0]) {
      setAllocationId(matched[0].id);
      return;
    }
    const currentIsValid = allocationId !== "outside" && candidates.some((item) => item.id === allocationId);
    if (!currentIsValid && allocationId !== "outside") setAllocationId(candidates[0]?.id || "outside");
    if (!allocationChoiceTouched && allocationId === "outside") {
      const fallback = matched[0] || (candidates.length === 1 ? candidates[0] : undefined);
      if (fallback) setAllocationId(fallback.id);
    }
  }, [allocationChoiceTouched, allocationId, candidateIds, hideUnallocated, kind, askWhere, freeShort]);
  /**
   * Categoria s-a schimbat (din text: „Benzină OMV” → Transport) și omul n-a ales plicul:
   * plicul o urmează. Altfel rămânea Mâncare și benzina golea săptămâna de mâncare.
   */
  const previousCategory = useRef(category);
  /** Text necunoscut, ținut în afara plicurilor până apare un magazin pe care îl cunoaștem. */
  const heldOutside = useRef(false);
  useEffect(() => {
    if (previousCategory.current === category) return;
    previousCategory.current = category;
    if (kind !== "expense" || allocationChoiceTouched) return;
    setAllocationId(matched[0]?.id || (candidates.length === 1 ? candidates[0].id : "outside"));
  }, [category]);
  useEffect(() => {
    setFromWeekIndex(week?.index);
  }, [allocationId, week?.index]);

  /** Sursa aleasă dă valuta; fără marcaj vizibil utilizatorul ar tasta euro crezând că sunt lei. */
  const convertedPreview = isForeign && typedAmount > 0 ? ledgerAmount : undefined;
  const chooseManual = () => { setTemplateId(""); setTemplateLabel(""); setError(""); };
  const selectTemplate = (template: QuickTransactionTemplate) => {
    // Șablonul e o plată obișnuită (chiria, rata): nu intră din oficiu în bugetul vacanței.
    setForTrip(false);
    setTemplateId(template.id); setKind(template.kind); setCategory(template.category); setAmount(template.amount ? String(template.amount) : "");
    if (template.memberId) setMemberId(template.memberId); if (template.sourceId) setSourceId(template.sourceId); setTemplateLabel(template.label); setIncomeLabel(template.kind === "income" ? template.label : ""); setAllocationChoiceTouched(false); setCategoryTouched(false); setError("");
  };
  useEffect(() => {
    if (initialTemplateApplied.current || !initialTemplateId) return;
    const template = data.settings.quickTemplates.find((item) => item.id === initialTemplateId && item.kind !== "income");
    if (!template) return;
    initialTemplateApplied.current = true;
    selectTemplate(template);
  }, [data.settings.quickTemplates, initialTemplateId]);
  const draftFromForm = (): Transaction => {
    const member = data.settings.members.find((item) => item.id === memberId) || data.settings.members[0];
    const source = data.settings.paymentSources.find((item) => item.id === sourceId) || data.settings.paymentSources[0];
    const numeric = parseRomanianAmount(amount);
    const foreign = source?.currency && source.currency !== BASE_CURRENCY ? source.currency : undefined;
    const rate = exchangeRateFor(data, foreign);
    const stored = foreign ? toBaseAmount(numeric, rate) : numeric;
    return {
      id: captureIdRef.current,
      title: activeTemplate?.label || (kind === "expense" ? (quickTitle() || (numeric > 0 ? t("Cheltuială rapidă · {category}", { category: t(category) }) : "")) : incomeLabel.trim()),
      amount: stored || numeric,
      originalAmount: foreign ? numeric || undefined : undefined,
      originalCurrency: foreign,
      exchangeRate: foreign ? rate : undefined,
      kind,
      category: kind === "expense" ? category : "Venit",
      sourceId: source?.id || "",
      source: source?.name || "",
      memberId: member?.id || "",
      person: member?.name || "",
      date: entryDate,
      allocationId: kind === "expense" ? (tripOn ? "outside" : allocationId) : undefined,
      ...(tripOn && trip ? { tripId: trip.id, outsideChosen: true } : {}),
      createdAt: new Date().toISOString(),
    };
  };
  /** Magazinul scris (sau spus) alege categoria și plicul, cât timp omul nu le-a ales singur. */
  const applyMerchant = (next: string) => {
    setMerchant(next);
    const learned = tagTouched.current ? undefined : suggestTag(data, next);
    if (learned) setTag(learned);
    if (categoryTouched) return;
    const target = spendTargetFromText(data, next, { memberId, sourceId });
    if (target.kind === "keep") {
      if (heldOutside.current) { heldOutside.current = false; setAllocationChoiceTouched(false); }
      return;
    }
    if (target.kind === "envelope") {
      heldOutside.current = false;
      if (target.category && target.category !== category) { previousCategory.current = target.category; setCategory(target.category); }
      setAllocationId(target.allocationId);
      setAllocationChoiceTouched(false);
      return;
    }
    if (target.kind === "category") {
      heldOutside.current = false;
      if (target.category !== category) setCategory(target.category);
      setAllocationChoiceTouched(false);
      return;
    }
    if (!allocationChoiceTouched || heldOutside.current) {
      heldOutside.current = true;
      setAllocationId("outside");
      setAllocationChoiceTouched(true);
    }
        };
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [partial, setPartial] = useState("");
  const voiceCancel = useRef<() => void>(() => {});
  useEffect(() => () => voiceCancel.current(), []);
  const canSpeak = useMemo(() => voiceAvailable(), []);
  const speak = async () => {
    if (listening) { voiceCancel.current(); return; }
    setError(""); setListening(true);
    const session = listenOnce(getLocale().startsWith("en") ? "en-US" : "ro-RO", setPartial);
    voiceCancel.current = session.cancel;
    const outcome = await session.result;
    setListening(false);
    if ("error" in outcome) {
      if (outcome.error === "denied") setError(t("Aplicația nu are voie la microfon. Îl poți permite din setările telefonului."));
      else if (outcome.error === "unavailable" || outcome.error === "failed") setError(t("Recunoașterea vocală nu merge acum pe acest telefon. Scrie suma de mână."));
      else if (outcome.error === "silent") setError(t("Nu am auzit nimic. Atinge microfonul și spune, de exemplu, „30 de lei taxi”."));
      return;
    }
    const spoken = parseSpokenEntry(outcome.text);
    setHeard(outcome.text);
    if (spoken.amount) setAmount(String(spoken.amount).replace(".", ","));
    // Pe Venit, orice spune omul e venit: „300 alocația” nu trebuie să sară pe Cheltuială.
    if (spoken.income || kind === "income") { setKind("income"); if (spoken.text) setIncomeLabel(spoken.text); return; }
    setKind("expense");
    if (spoken.text) applyMerchant(spoken.text);
  };
  const autoVoiceStarted = useRef(false);
  useEffect(() => {
    if (!autoVoice || !canSpeak || autoVoiceStarted.current) return;
    autoVoiceStarted.current = true;
    void speak();
  }, [autoVoice, canSpeak]);
  const save = async () => {
    const numeric = parseRomanianAmount(amount); const member = data.settings.members.find((item) => item.id === memberId); const source = data.settings.paymentSources.find((item) => item.id === sourceId);
    if (numeric < 0.005) return setError(amountError(amount) || t("Introdu o sumă mai mare decât zero."));
    if (!member || !source) return setError(t("Alege un membru și o sursă de plată."));
    // Suma tastată este în valuta sursei; fără curs nu o putem trece în registru, care e în lei.
    const foreign = source.currency && source.currency !== BASE_CURRENCY ? source.currency : undefined;
    const rate = exchangeRateFor(data, foreign);
    const stored = foreign ? toBaseAmount(numeric, rate) : numeric;
    if (foreign && !stored) return setError(t("Adaugă în Setări cursul pentru {currency} înainte de a folosi această sursă.", { currency: foreign }));
    if (askWhere && !allocationChoiceTouched) return setError(t("Alege de unde se iau banii."));
    if (askWhere && allocationId === "outside" && freeShort > 0.009) return setError(t("Nerepartizatul nu acoperă suma. Alege plicul sau o sumă mai mică."));
    if (kind === "expense" && !tripOn && allocationId !== "outside" && !matchedAllocation) return setError(t("Plicul nu mai corespunde categoriei sau sursei. Alege din nou."));
    // Dublă atingere pe „Gata”: aceeași sumă și același nume în ultimele 2 minute.
    const titleNow = kind === "expense" ? quickTitle() : incomeLabel.trim();
    const twin = data.transactions.find((item) => item.kind === kind && Math.abs(item.amount - (stored || numeric)) < 0.005 && item.date === entryDate && (item.title || "").trim() === titleNow && Date.now() - Date.parse(item.createdAt || "") < 120_000);
    if (twin && !await askConfirm(t("Ai notat deja „{title}” · {amount} acum câteva secunde. Îl mai pun o dată?", { title: twin.title, amount: money.format(twin.amount) }))) return;
    try {
      onSave({ id: captureIdRef.current, title: activeTemplate?.label || (kind === "expense" ? (quickTitle() || t("Cheltuială rapidă · {category}", { category: t(category) })) : incomeLabel.trim() || t("Venit rapid")), amount: stored || numeric, originalAmount: foreign ? numeric : undefined, originalCurrency: foreign, exchangeRate: foreign ? rate : undefined, kind, category: kind === "expense" ? category : "Venit", sourceId: source.id, source: source.name, memberId: member.id, person: member.name, date: entryDate, allocationId: kind === "expense" ? (tripOn ? "outside" : allocationId) : undefined, outsideChosen: tripOn || (kind === "expense" && allocationId === "outside" && allocationChoiceTouched) ? true : undefined, ...(tripOn && trip ? { tripId: trip.id } : {}), ...(kind === "expense" && tag ? { tag } : {}), createdAt: new Date().toISOString() }, { fromWeekIndex: kind === "expense" && !tripOn && paced ? fromWeekIndex : undefined, learnRule: kind === "expense" && !tripOn && allocationChoiceTouched && allocationId !== "outside" && merchant.trim().length >= 3 && !activeTemplate ? { match: merchant.trim(), category, allocationId } : undefined, ...(kind === "expense" && article.trim() && !activeTemplate ? { detailLines: [{ id: newId("detail-line"), label: article.trim(), amount: stored || numeric, category }], vendor: merchant.trim() || undefined } : {}) });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Nu am putut salva mișcarea."));
    }
  };
  const remember = () => {
    const numeric = parseRomanianAmount(amount); const member = data.settings.members.find((item) => item.id === memberId); const source = data.settings.paymentSources.find((item) => item.id === sourceId); const label = templateLabel.trim() || (kind === "expense" ? category : incomeLabel.trim() || t("Venit rapid"));
    if (!member || !source) return setError(t("Alege membrul și sursa înainte de salvarea șablonului."));
    onSaveTemplate({ id: templateId || newId("quick-template"), label, kind, category: kind === "expense" ? category : "Venit", amount: Math.max(0, numeric), memberId: member.id, sourceId: source.id, updatedAt: new Date().toISOString() });
    setTemplateLabel(label); setError("");
  };
  const archive = async () => { if (!templateId || !activeTemplate) return; if (!await askConfirm(t("Arhivezi șablonul local „{label}”? Îl poți restaura ulterior; tranzacțiile rămân neschimbate.", { label: activeTemplate.label }))) return; onArchiveTemplate(templateId); chooseManual(); };
  const remove = async () => { if (!templateId) return; if (!await askConfirm(t("Ștergi definitiv șablonul local „{label}”? Tranzacțiile rămân neschimbate.", { label: activeTemplate?.label || t("acesta") }))) return; onDeleteTemplate(templateId); chooseManual(); };
  const removeArchived = async (id: string, label: string) => { if (await askConfirm(t("Ștergi definitiv șablonul arhivat „{label}”? Tranzacțiile rămân neschimbate.", { label }))) onDeleteArchivedTemplate(id); };
  /** Categoriile proprii folosite recent intră în șirul de butoane, după cele de bază. */
  const recentCategories = useMemo(() => Array.from(new Set(data.transactions.filter((item) => item.kind === "expense" && item.category !== "Venit" && !isBalanceAdjustment(item)).sort((left, right) => (right.createdAt || right.date).localeCompare(left.createdAt || left.date)).map((item) => item.category))).filter((name) => !CAPTURE_CATEGORIES.some(([base]) => base === name)).slice(0, 3), [data.transactions]);
  const recentAmounts = useMemo(() => [...data.transactions].filter((item) => item.kind === kind && item.amount > 0).sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || "")).map((item) => item.amount).filter((amount, index, all) => all.indexOf(amount) === index).slice(0, 4), [data.transactions, kind]);
  const parsedAmount = typedAmount;
  const selectedSourceBalance = sourceId ? sourceBalance(data, sourceId) : 0;
  const projectedSourceBalance = ledgerAmount == null ? undefined : selectedSourceBalance + (kind === "income" ? ledgerAmount : -ledgerAmount);
  /** Săptămâna aleasă în listă, nu mereu tranșa de azi. Suma e în lei, nu în valuta tastată. */
  const chargeWeek = paced ? weeks.find((item) => item.index === (fromWeekIndex ?? week?.index)) || week : undefined;
  const chargeRemaining = chargeWeek ? chargeWeek.remaining : matchedTotal?.remaining;
  const chargePay = ledgerAmount != null && ledgerAmount > 0 ? ledgerAmount : 0;
  const chargeBudget = chargeWeek ? chargeWeek.budget : matchedTotal?.budget || 0;
  const chargePhrase = chargeRemaining != null && (chargeWeek || matchedTotal)
    ? envelopeChargePhrase({
      weekIndex: chargeWeek?.index,
      remaining: chargeRemaining,
      budget: chargeWeek ? chargeWeek.budget : matchedTotal!.budget,
      pay: chargePay,
      format: money.format,
    })
    : undefined;
  const dialogRef = useFocusTrap<HTMLElement>(onClose);

  if (moving) {
    return <div className="bf-modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className="bf-modal bf-quick-entry-panel" role="dialog" aria-modal="true" aria-label={t("Mută bani între surse")} onPointerDown={(event) => event.stopPropagation()}>
        <header><div><p className="bf-kicker">{t("NOTEAZĂ")}</p><h2>{t("Mută bani între surse")}</h2></div><button className="bf-icon-button" aria-label={t("Închide")} onClick={onClose}><X size={19} /></button></header>
        <div className="bf-quick-entry-scroll"><SourceTransferForm data={data} onAddSource={onAddSource} onBack={() => (initialMoving ? onClose() : setMoving(false))} onSave={(pair) => { onSave(pair); onClose(); }} /></div>
      </section>
    </div>;
  }

  const closeIfBackdrop = (event: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
    if (event.target === event.currentTarget) onClose();
  };

  return <div className="bf-modal-backdrop" role="presentation" onPointerDown={closeIfBackdrop}>
    <section ref={dialogRef} tabIndex={-1} className="bf-modal bf-quick-entry-panel" role="dialog" aria-modal="true" aria-label={t("Cât ai dat?")} onPointerDown={(event) => event.stopPropagation()}>
      <header><div><p className="bf-kicker">{t("NOTEAZĂ")}</p><h2>{kind === "income" ? t("Cât a intrat?") : t("Cât ai dat?")}</h2></div><button className="bf-icon-button" aria-label={t("Închide")} onClick={onClose}><X size={19} /></button></header>
      <div className="bf-quick-entry-scroll">
      <p className="bf-quick-entry-intro">{kind === "income" ? t("Suma și de unde vine: salariu, bonus, o încasare.") : t("Suma, magazinul, Gata.")}</p>
      {(data.settings.quickTemplates.length > 0 || data.settings.archivedQuickTemplates.length > 0) && <div className="bf-template-header-actions"><span>{t("{count} șabloane active", { count: data.settings.quickTemplates.length })}</span><button type="button" onClick={() => setShowArchive((value) => !value)}><Archive size={15} /> {t("Arhivă")}{data.settings.archivedQuickTemplates.length ? ` (${data.settings.archivedQuickTemplates.length})` : ""}</button></div>}
      {showArchive && <section className="bf-template-archive" aria-label={t("Arhiva lunară a șabloanelor")}><p className="bf-kicker">{t("ARHIVĂ LOCALĂ")}</p>{archiveGroups.map(([month, items]) => <div key={month}><h3>{formatDate(`${month}-01`, { month: "long", year: "numeric" })}</h3>{items.map((item) => <article key={item.id}><div><b>{item.label}</b><small>{item.amount ? money.format(item.amount) : t("sumă liberă")} · arhivat {formatDate(item.archivedAt)}</small></div><div className="bf-template-archive-actions"><button type="button" onClick={() => onRestoreTemplate(item.id)}><ArchiveRestore size={15} /> {t("Restaurează")}</button><button type="button" className="danger" aria-label={t("Șterge definitiv {label}", { label: item.label })} onClick={() => removeArchived(item.id, item.label)}><Trash2 size={15} /></button></div></article>)}</div>)}{!archiveGroups.length && <p className="bf-empty-inline">{t("Nu ai șabloane arhivate. Arhivează un șablon activ pentru a-l păstra în istoricul local.")}</p>}</section>}
      {data.settings.quickTemplates.length > 0 && <div className="bf-quick-template-rail" role="list" aria-label={t("Șabloane locale")}><button role="listitem" className={!templateId ? "active" : ""} onClick={chooseManual}>{t("Manual")}</button>{data.settings.quickTemplates.map((item) => <button role="listitem" key={item.id} className={templateId === item.id ? "active" : ""} onClick={() => selectTemplate(item)}><b>{item.label}</b><small>{item.amount ? money.format(item.amount) : t("sumă liberă")}</small></button>)}</div>}
      <div className="bf-segment"><button className={kind === "expense" ? "active expense" : ""} onClick={() => setKind("expense")}>{t("Cheltuială")}</button><button className={kind === "income" ? "active income" : ""} onClick={() => setKind("income")}>{t("Venit")}</button></div>{kind === "expense" && <ReceiptScanButton data={data} memberId={memberId} onResult={(prefill) => onMore(draftFromForm(), prefill)} />}{canSpeak && <div className="bf-voice-entry"><button type="button" className={`bf-voice-button${listening ? " is-listening" : ""}`} aria-pressed={listening} onClick={() => void speak()}>{listening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}<span><b>{listening ? t("Te ascult…") : kind === "income" ? t("Spune ce a intrat") : t("Spune ce ai cumpărat")}</b><small>{listening ? (partial ? `„${partial}”` : t("Atinge ca să oprești")) : kind === "income" ? t("ex. „salariul, 4.700 de lei”") : t("ex. „50 de lei la Lidl”")}</small></span></button>{heard && !listening && <p aria-live="polite">{t("Am auzit")}: „{heard}”. {t("Verifică și apasă Gata.")}</p>}</div>}{!shortStore && <button type="button" className="bf-link-button bf-quick-move" onClick={() => setMoving(true)}>{t("Mută bani: cash, între carduri sau partenerului")}</button>}
      {kind === "income" && declaredIncomes.length > 0 && <div className="bf-quick-category-picks bf-declared-incomes" aria-label={t("Veniturile declarate")}>{declaredIncomes.map((item) => <button type="button" key={item.id} className={incomeLabel === item.label ? "active" : ""} onClick={() => pickDeclaredIncome(item)}>{item.label} · {money.format(item.amount)}</button>)}</div>}
      {kind === "income" && <div className="bf-quick-category-picks" aria-label={t("Venituri rapide")}>{[t("Alocație"), t("Al 13-lea salariu"), t("Bonus")].map((label) => <button type="button" key={label} className={incomeLabel === label ? "active" : ""} onClick={() => setIncomeLabel(label)}>{label}</button>)}</div>}
      <div className="bf-quick-entry-grid"><label className="bf-field bf-amount-field"><span>{t("Sumă ({currency})", { currency: isForeign ? entryCurrency : t("lei") })}</span><input ref={amountRef} value={amount} onChange={(event) => setAmount(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }} inputMode="decimal" placeholder="0,00" aria-describedby="bf-quick-amount-hint" />{recentAmounts.length > 0 && <span className="bf-amount-suggestions" id="bf-quick-amount-hint"><span>{t("Folosit recent")}</span>{recentAmounts.map((value) => { const filled = !isForeign ? value : entryRate ? Math.round((value / entryRate) * 100) / 100 : undefined; if (filled == null) return null; return <button type="button" key={value} onClick={() => { setAmount(String(filled)); setError(""); }}>{isForeign ? `${filled.toLocaleString(getLocale(), { maximumFractionDigits: 2 })} ${entryCurrency}` : money.format(value)}</button>; })}</span>}</label>{kind === "expense" ? <label className="bf-field"><span>{t("Magazin sau denumire")}</span><input value={merchant} onChange={(event) => applyMerchant(event.target.value)} placeholder={t("ex. Lidl")} /></label> : null}{kind === "expense" && !activeTemplate ? <label className="bf-field"><span>{t("Ce ai cumpărat (opțional)")}</span><input value={article} autoComplete="off" onChange={(event) => pickArticle(event.target.value)} placeholder={t("ex. pâine, motorină")} />{productHits.length > 0 && <span className="bf-amount-suggestions"><span>{t("Din bonurile tale")}</span>{productHits.map((item) => <button type="button" key={item.label} onClick={() => pickArticle(item.label)}>{item.label}</button>)}</span>}</label> : null}{kind === "expense" && shortStore ? null : kind === "expense" ? <><div className="bf-cat-strip" role="listbox" aria-label={t("Categorii rapide")}>{CAPTURE_CATEGORIES.map(([name, Icon]) => <button type="button" key={name} role="option" aria-selected={category === name} className={category === name ? "is-on" : ""} style={categoryTone(name)} onClick={() => { setCategory(name); setCategoryTouched(true); setAllocationChoiceTouched(false); }}><i><Icon size={18} aria-hidden="true" /></i><span>{t(name)}</span></button>)}{recentCategories.map((name) => <button type="button" key={name} role="option" aria-selected={category === name} className={category === name ? "is-on" : ""} style={categoryTone(name)} onClick={() => { setCategory(name); setCategoryTouched(true); setAllocationChoiceTouched(false); }}><i><CategoryGlyph category={name} size={18} /></i><span>{t(name)}</span></button>)}</div><label className="bf-field"><span>{t("Sau altă categorie")}</span><select value={category} onChange={(event) => { setCategory(event.target.value); setCategoryTouched(true); setAllocationChoiceTouched(false); }}>{[...expenseCategories, ...data.settings.customCategories].map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></label></> : <label className="bf-field"><span>{t("Ce venit?")}</span><input value={incomeLabel} onChange={(event) => setIncomeLabel(event.target.value)} placeholder={t("ex. Salariu, Bonus")} /></label>}</div>{kind === "expense" && !activeTemplate && <TagChips data={data} value={tag} onChange={(next) => { tagTouched.current = true; setTag(next); }} />}
      {kind === "expense" && trip && <button type="button" className={`bf-trip-chip${forTrip ? " is-on" : ""}`} aria-pressed={forTrip} onClick={() => setForTrip((value) => !value)}><Plane size={16} aria-hidden="true" /> {forTrip ? t("Din bugetul vacanței „{name}”", { name: trip.name }) : t("Nu e pentru vacanța „{name}”", { name: trip.name })}</button>}
      {kind === "expense" && !tripOn && data.settings.salaryPlan.allocations.length > 0 && (askWhere || !shortStore) && <section className="bf-quick-envelope"><p className="bf-kicker">{askWhere ? t("DE UNDE SE IA") : t("PLICUL SĂPTĂMÂNII")}</p>{askWhere && suggestedEnvelope ? <SpendFromChoice envelopeLabel={suggestedEnvelope.label} envelopeLeft={money.format(Math.max(0, suggestedLeft))} freeLabel={money.format(unrepartized)} freeHint={money.format(freeShort)} freeDisabled={freeShort > 0.009} picked={!allocationChoiceTouched ? "none" : allocationId === "outside" ? "free" : allocationId === suggestedEnvelope.id ? "envelope" : "none"} onEnvelope={() => { setAllocationId(suggestedEnvelope.id); setAllocationChoiceTouched(true); }} onFree={() => { setAllocationId("outside"); setAllocationChoiceTouched(true); }} /> : null}{(!askWhere || candidates.length > 1) && <label className="bf-field"><span>{askWhere ? t("Alt plic") : t("Se consumă din")}</span><select value={askWhere && (allocationId === "outside" || !allocationChoiceTouched) ? "" : allocationId} onChange={(event) => { const next = event.target.value; if (!next) return; setAllocationId(next); setAllocationChoiceTouched(true); }}>{askWhere && <option value="">{allocationChoiceTouched && allocationId === "outside" ? t("Din nerepartizat") : t("Alege de unde")}</option>}{(!askWhere && (!hideUnallocated || allocationId === "outside")) && <option value="outside">{t("În afara plicurilor")}{unrepartized > 0 ? ` · ${money.format(unrepartized)}` : ""}</option>}{candidates.map((allocation) => { const activeWeek = isWeeklyPaced(allocation, data.settings.salaryPlan) ? allocationWeekStatus(data, allocation) : undefined; const totalRemaining = isWeeklyPaced(allocation, data.settings.salaryPlan) ? undefined : allocationStatus(data, allocation).remaining; return <option key={allocation.id} value={allocation.id}>{allocation.label} · {activeWeek ? envelopeOptionRemain(activeWeek.remaining, money.format, activeWeek.index) : totalRemaining !== undefined ? envelopeOptionRemain(totalRemaining, money.format) : t("fără tranșă activă")}</option>; })}</select></label>}{weeks.length > 1 && <label className="bf-field"><span>{t("Din ce săptămână")}</span><select value={String(fromWeekIndex || week?.index || "")} onChange={(event) => setFromWeekIndex(Number(event.target.value) || undefined)}>{weeks.map((item) => <option key={item.index} value={item.index}>{weekOptionLabel(item.index, item.remaining, item.budget, money.format)}</option>)}</select></label>}{matchedAllocation && chargeBudget > 0 && chargeRemaining != null && <div className={`bf-quick-envelope-meter${chargeRemaining - chargePay < 0 ? " is-over" : ""}`} aria-hidden="true" style={categoryTone(matchedAllocation.category || category)}><i style={{ width: `${Math.min(100, Math.max(0, (chargeBudget - chargeRemaining) / chargeBudget) * 100)}%` }} /><em style={{ width: `${(Math.min(chargePay, Math.max(0, chargeRemaining)) / chargeBudget) * 100}%` }} /></div>}{matchedAllocation && <p className={chargePhrase?.over ? "over" : ""}>{chargePhrase ? chargePhrase.text : t("Plic selectat; încă nu este activă o tranșă calendaristică.")}</p>}{matchedAllocation && (() => {
        // Plic din mai multe surse: cât mai e din partea sursei alese (ex. cei 600 de pe bonuri).
        const parts = allocationSourceParts(data, matchedAllocation);
        const part = parts.length > 1 ? parts.find((entry) => entry.sourceId === sourceId) : undefined;
        if (!part) return null;
        const name = data.settings.paymentSources.find((source) => source.id === sourceId)?.name || "";
        const left = part.left - chargePay;
        return <p className={left < -0.009 ? "over" : ""}>{left >= -0.009
          ? t("Din partea {source} a plicului rămân {left} din {share}.", { source: name, left: money.format(left), share: money.format(part.share) })
          : t("Partea {source} din plic e de {share} și nu mai ajunge: {over} peste. Restul plătește-l din altă sursă a plicului.", { source: name, share: money.format(part.share), over: money.format(-left) })}</p>;
      })()}{!candidates.length && <p>{t("Nu există plic pentru această categorie și sursă. Poți salva în afara plicurilor.")}</p>}</section>}
      {!shortStore && <div className="bf-quick-entry-who">{data.settings.members.length > 1 && <label className="bf-field"><span>{t("Cine a înregistrat")}</span><select value={memberId} onChange={(event) => { setMemberId(event.target.value); setAllocationChoiceTouched(false); }}>{data.settings.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}<SourcePicker data={data} value={sourceId} label={kind === "expense" ? t("Plătit din") : t("Încasat în")} memberId={memberId} balanceOf={(id) => sourceBalance(data, id)} format={(value, source) => source.currency ? `${value.toLocaleString(getLocale(), { maximumFractionDigits: 2 })} ${source.currency}` : money.format(value)} onChange={(id) => { setSourceId(id); setAllocationChoiceTouched(false); }} /></div>}{isForeign && <section className={`bf-currency-preview ${convertedPreview ? "" : "pending"}`}><p className="bf-kicker">{t("SE ÎNREGISTREAZĂ ÎN LEI")}</p>{convertedPreview ? <><b>{money.format(convertedPreview)}</b><span>{t("La cursul de {rate} lei pentru 1 {currency}, salvat în Setări.", { rate: entryRate?.toLocaleString(getLocale(), { maximumFractionDigits: 4 }) || "", currency: entryCurrency })}</span></> : <span>{entryRate ? t("Completează suma în {currency}.", { currency: entryCurrency }) : t("Adaugă în Setări cursul pentru {currency} înainte de a folosi această sursă.", { currency: entryCurrency })}</span>}</section>}
      {!shortStore && parsedAmount > 0 && projectedSourceBalance != null && selectedSourceBalance > 0 && <p className={`bf-quick-source-preview ${projectedSourceBalance < 0 ? "over" : ""}`} aria-live="polite">{kind === "expense" ? t("După această plată") : t("După această încasare")}: <b>{money.format(Math.max(0, projectedSourceBalance))}</b> {t("rămân în")} {data.settings.paymentSources.find((source) => source.id === sourceId)?.name || t("sursa aleasă")}{projectedSourceBalance < 0 ? t(" — depășește soldul cu {over}", { over: money.format(-projectedSourceBalance) }) : ""}.</p>}
      {!shortStore && <details className="bf-template-save"><summary><BookmarkPlus size={16} /> {templateId ? t("Editează șablonul selectat") : t("Salvează combinația ca șablon local")}</summary><label className="bf-field"><span>{t("Nume șablon")}</span><input value={templateLabel} onChange={(event) => setTemplateLabel(event.target.value)} placeholder="ex. Taxi serviciu" /></label><div className="bf-template-actions"><button type="button" onClick={remember}>{templateId ? t("Actualizează șablonul") : t("Păstrează pe acest telefon")}</button>{templateId && <><button type="button" onClick={archive}><Archive size={15} /> {t("Arhivează")}</button><button type="button" className="danger" onClick={remove}><Trash2 size={15} /> {t("Șterge")}</button></>}</div></details>}
      <div className="bf-amount-suggestions" role="group" aria-label={t("Ziua")}><span>{t("Ziua")}</span>{([[0, t("Azi")], [-1, t("Ieri")], [-2, t("Alaltăieri")]] as const).map(([offset, label]) => { const day = addIsoDays(isoToday(), offset); return <button type="button" key={day} aria-pressed={!otherDay && entryDate === day} className={!otherDay && entryDate === day ? "is-on" : ""} onClick={() => { setOtherDay(false); setEntryDate(day); }}>{label}</button>; })}<button type="button" aria-pressed={otherDay} className={otherDay ? "is-on" : ""} onClick={() => setOtherDay(true)}>{otherDay ? formatDate(entryDate) : t("Altă zi")}</button></div>{otherDay && <label className="bf-field"><span>{t("Altă zi")}</span><RoDateInput value={entryDate} onChange={(event) => { if (event.target.value && event.target.value <= isoToday()) setEntryDate(event.target.value); }} /></label>}
      {shortStore && <button type="button" className="bf-link-button" onClick={() => setMoreOpen(true)}>{t("Cine, sursă, categorie")}</button>}
      {error && <p className="bf-form-error" role="alert">{error}</p>}
      </div>
      <div className="bf-quick-entry-footer">
      <button className="bf-primary full" onClick={save}><Check size={17} /> {t("Gata")}</button><button className="bf-quick-entry-more" onClick={() => onMore(draftFromForm())}><Plus size={16} /> {kind === "expense" ? t("Cheltuială detaliată: scrie articolele de pe bon") : t("Adaugă notiță, altă dată sau corectează")}</button>
      </div>
    </section>
  </div>;
}
