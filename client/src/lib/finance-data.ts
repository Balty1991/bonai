/**
 * Atelierul Financiar 2.0 — registru financiar local, normalizat și portabil.
 * Toate sumele sunt în RON, toate datele sunt ISO (YYYY-MM-DD), iar identitățile sunt stabile.
 */
import { tickMemo } from "@/lib/tick-cache";
import { calendarBudget, periodDays, type CalendarBudget } from "./calendar-budget";
import { memoString } from "./memo-string";
import { normalizeShoppingList, type ShoppingItem } from "@/lib/shopping-list";
import { normalizeTrip, type Trip } from "@/lib/trip-data";
import { normalizeAssets, type Asset } from "@/lib/asset-data";
import { normalizeWarranties, type Warranty } from "@/lib/warranty-data";
import { type PlannedEvent, type PlannedEventKind, type PlannedEventRepeat } from "./planned-events";
import { getLocale, t } from "./i18n";

export type TransactionKind = "income" | "expense";
/** Personal = doar al membrului; shared = bugetul comun al familiei. Implicit shared pentru compatibilitate. */
export type ShareScope = "personal" | "shared";
/** `voucher`: voucher SGR, card cadou — bani buni de cheltuit, dar doar într-un loc anume. */
export type PaymentKind = "card" | "cash" | "meal" | "voucher" | "transfer";

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  kind: TransactionKind;
  category: string;
  /** Denumire păstrată pentru lizibilitatea exporturilor vechi. */
  source: string;
  person: string;
  date: string;
  note?: string;
  sourceId?: string;
  memberId?: string;
  /** Corecție de sold („Sold real = X”): mută soldul sursei, dar nu e venit sau cheltuială în rapoarte. */
  adjustment?: boolean;
  /** Mutare între sursele familiei (card → cash, alimentare Revolut): cele două jumătăți au același id de pereche. */
  transferId?: string;
  /** Plicul ales expres pentru această cheltuială; valoarea „outside” înseamnă că nu consumă niciun plic. */
  allocationId?: string;
  /** Omul a ales el „În afara plicurilor”; „outside” fără bifa asta e doar valoarea implicită și poate fi pus în plic. */
  outsideChosen?: boolean;
  receiptId?: string;
  /** Călătoria (modul vacanță) căreia îi aparține cheltuiala; nu consumă plicurile lunii. */
  tripId?: string;
  /** Legătură cu plata recurentă care a generat mișcarea. */
  recurringId?: string;
  /** Datoria redusă de această plată confirmată manual. */
  debtId?: string;
  /** Soldul datoriei imediat după această plată, pentru istoricul explicabil. */
  debtRemainingAfter?: number;
  createdAt?: string;
  updatedAt?: string;
  /**
   * `amount` este întotdeauna în lei, ca toate însumările să rămână corecte fără conversii.
   * Când plata s-a făcut în altă valută, suma tastată și cursul folosit se păstrează aici,
   * ca mișcarea să poată fi verificată față de extrasul băncii.
   */
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  /** Lipsa valorii = shared (mișcări vechi și sync fără câmp). */
  shareScope?: ShareScope;
  /** Telefonul care a scris mișcarea. Lipsește la rândurile vechi. Nu se schimbă la editare. */
  deviceId?: string;
  /** Același bon plătit din două surse: cele două cheltuieli au același splitId și se corectează împreună. */
  splitId?: string;
  /** Totalul bonului plătit din două surse, pe fiecare parte: dacă o parte lipsește, se vede din diferență. */
  splitTotal?: number;
  /**
   * Partea cumpărată pentru toată luna (detergent, hrană pisică, provizii): în plicul cu ritm
   * săptămânal se împarte pe săptămânile rămase, nu golește săptămâna în care s-a cumpărat.
   */
  spreadAmount?: number;
  /** Unde sau pentru cine („Serviciu”, „Copil”, „Mașină”): peste categorie, ca să se vadă separat în Analiză. */
  tag?: string;
};

export type Debt = { id: string; name: string; remaining: number; monthly: number; due: string; tone: "forest" | "honey" | "coral"; dueDate?: string; memberId?: string; updatedAt?: string; /** Dobânda anuală, în procente (DAE sau dobânda din contract). */ annualRate?: number; /** Credit bancar, card de credit, IFN sau bani de la persoane. */ kind?: "credit" | "card" | "ifn" | "persoane"; /** Data ultimei rate din contract, dacă e știută. */ endDate?: string; /** Fără dată de final (dobânda de overdraft): se plătește lunar, iar plata nu scade soldul. */ openEnded?: boolean };
export type SavingsGoal = { id: string; name: string; current: number; target: number; due: string; tone: "forest" | "honey" | "coral"; dueDate?: string; memberId?: string; /** „Scrisoare pentru viitor”: se arată abia când obiectivul e atins. */ message?: string; updatedAt?: string };
export type RecurringFrequency = "monthly" | "quarterly" | "yearly";
export type RecurringPayment = { id: string; name: string; amount: number; category: string; sourceId: string; memberId: string; dueDay: number; active: boolean; /** Lipsă = lunar. Trimestrial/anual: RCA, impozit, abonamente anuale. */ frequency?: RecurringFrequency; /** Luna (1–12) a unei scadențe, pentru trimestrial și anual. */ month?: number; /** Suma e o estimare (curent, gaz): valoarea reală se scrie la plată și nu se adaugă automat. */ variable?: boolean; /** Creează local plata la prima deschidere din ziua scadenței sau după aceasta. */ autoPost?: boolean; note?: string; updatedAt?: string };
export type ReceiptLine = { id: string; category: string; amount: number; label?: string; allocationId?: string; /** Reducerea de pe bon, deja scăzută din sumă. */ discount?: number; /** Din scanare: marca, gramajul unei bucăți, cantitatea, cum se vinde și prețul pe bucată/kg tipărit. */ brand?: string; size?: number; sizeUnit?: "g" | "kg" | "ml" | "l" | "buc"; qty?: number; unit?: "buc" | "kg" | "l"; unitPrice?: number; vatRate?: number };
/** Regulă locală: dacă titlul conține textul, propune categorie/plic — niciodată fără confirmare. */
export type MerchantRule = { id: string; match: string; category?: string; allocationId?: string; updatedAt?: string };

export type Receipt = {
  id: string;
  vendor: string;
  amount: number;
  category: string;
  date: string;
  note?: string;
  imageData?: string;
  /** A doua pagină a unui bon lung, păstrată doar local. */
  imageData2?: string;
  /** Chei locale IndexedDB pentru fotografiile bonului; nu se sincronizează între dispozitive. */
  imageKeys?: string[];
  /** Repartizarea validată a totalului pe categorii. */
  lines?: ReceiptLine[];
  /** Antetul magazinului, din scanare: cod fiscal, adresă, oraș, ora bonului și TVA-ul total. */
  storeCui?: string;
  storeAddress?: string;
  city?: string;
  time?: string;
  vat?: number;
  /** Rămas din versiunile vechi, cu citirea bonului din poză; se scoate la încărcare. */
  ocrText?: string;
  linkedTransactionId?: string;
  linkedTransactionIds?: string[];
  updatedAt?: string;
  sourceId?: string;
  memberId?: string;
};

/**
 * `kind` marchează un membru drept copil. Nu schimbă nimic în contabilitate — banii de
 * buzunar sunt tot un plic al familiei, iar cheltuielile copilului sunt tot cheltuieli.
 * Schimbă doar ecranul: un copil vede o singură cifră, nu un plan salarial.
 */
export type FamilyMember = { id: string; name: string; color?: string; kind?: "adult" | "child"; /** Ultima redenumire, ca numele nou să ajungă și pe celălalt telefon. */ updatedAt?: string };

/**
 * Registrul are o singură monedă de bază: leul. O sursă poate ține însă altă valută,
 * iar cursul este introdus manual, cu data lui — aplicația nu întreabă niciun serviciu
 * extern de cursuri și nu recalculează retroactiv istoricul.
 */

/** Mișcările fără câmp sunt tratate ca shared — sync-safe, fără migrare forțată. */
export const transactionShareScope = (item: Pick<Transaction, "shareScope"> | undefined): ShareScope =>
  item?.shareScope === "personal" ? "personal" : "shared";
export const BASE_CURRENCY = "RON";
export const supportedCurrencies = ["RON", "EUR", "USD", "GBP", "CHF", "MDL", "HUF"];
/** `rate` este câți lei face o unitate din valuta respectivă. */
export type ExchangeRate = { currency: string; rate: number; updatedAt: string };
export type PaymentSource = { id: string; name: string; kind: PaymentKind; memberId?: string; /** Sold la momentul configurării sursei, în valuta sursei. */ openingBalance: number; /** Implicit RON. */ currency?: string; /** Ultima editare a soldului. Fără el, un telefon nou cu 0 implicit nu trebuie să șteargă soldul familiei. */ updatedAt?: string };
/**
 * Completare dintr-o a doua sursă. O familie ține banii în mai multe locuri, iar un plic de
 * 1.900 poate să nu încapă în cei 1.800 din cash: restul vine din cashul partenerei, spus
 * explicit, nu ghicit. Sursa principală rămâne `sourceId`; aici stau doar completările.
 */
export type AllocationFunding = { sourceId: string; amount: number };
export type BudgetAllocation = { id: string; label: string; amount: number; memberId?: string; category?: string; sourceId?: string; funding?: AllocationFunding[]; /** Alte categorii pe care le acoperă plicul: „Cumpărături” = Alimente + Dulciuri + Băuturi + Apă. */ categories?: string[]; /** Plicul e doar o limită: scade din el plata făcută cu orice card, bonuri sau cash. */ anySource?: boolean; /** Prag local de atenție; depășirea rămâne la 100%. */ alertThreshold?: number; /** Detaliu liber, de exemplu „Taxi până la salariu”. */ note?: string; /** Implicit adevărat: arată tranșa săptămânii active. Fals pentru plicuri fără ritm fix, unde contează doar totalul ciclului. */ weeklyPace?: boolean; /** Suma pe o săptămână întreagă („600”), când plicul vine dintr-o cheltuială săptămânală: tranșele sunt exact atât. */ weeklyAmount?: number; updatedAt?: string };
export type BudgetTransfer = { id: string; fromAllocationId: string; toAllocationId: string; amount: number; note?: string; createdAt: string };
/** Mută bani între tranșele săptămânale ale aceluiași plic, de exemplu când săptămâna curentă s-a epuizat. */
export type WeekTransfer = { id: string; allocationId: string; fromWeekIndex: number; toWeekIndex: number; amount: number; note?: string; createdAt: string };
/** Regulă de planificare: repartizează o valoare sau un procent dintr-un venit confirmat către un plic compatibil. */
export type SalaryAllocationRule = { id: string; label: string; allocationId: string; mode: "fixed" | "percent"; value: number; active: boolean; updatedAt?: string };
/** Jurnal de planificare, nu mișcare bancară: blochează aplicarea aceleiași repartizări de două ori. */
export type SalaryAllocationApplication = { id: string; incomeId: string; incomeTitle: string; incomeAmount: number; sourceId?: string; memberId?: string; appliedAt: string; allocations: Array<{ ruleId: string; allocationId: string; amount: number; /** Suma plicului dinainte, când repartizarea o stabilește (nu o adună): anularea o pune la loc. */ previousAmount?: number; /** Suma plicului imediat după aplicare: dacă a rămas neatinsă, anularea pune la loc `previousAmount`; altfel scade doar partea acestui venit. */ afterAmount?: number; /** Plicul a fost creat de repartizare: anularea îl scoate, dacă n-are cheltuieli. */ created?: boolean }>; /** „needs” = repartizarea după cheltuielile lunare declarate. */ origin?: "rules" | "needs"; /** Anulată: rămâne în listă (ca sincronizarea să n-o readucă), dar nu mai contează nicăieri. */ revertedAt?: string; updatedAt?: string; /** Bani de trimis celuilalt, care plătește de pe cardul lui (grădinița plătită de soție din salariul meu). */ transfers?: SplitTransfer[]; /** Ciclul de dinainte, când repartizarea a deschis unul nou: anularea îl pune la loc, cu mutările lui. */ previousCycle?: { periodStart: string; nextPayday: string; earliestPayday?: string; paydayFlexDays?: number; transfers: BudgetTransfer[]; weekTransfers: WeekTransfer[]; openedPeriodStart: string } };
export type SplitTransfer = { toMemberId: string; amount: number; labels: string[]; done?: boolean };
/**
 * O cheltuială pe care familia o știe dinainte: „mâncare 600 pe săptămână”, „lumină 300–400”.
 * Din ea, la fiecare salariu, aplicația propune cât merge în plicul ei.
 */
export type MonthlyNeed = { id: string; label: string; category: string; cadence: "monthly" | "weekly"; min: number; max: number; /** Cât se rezervă din interval. Implicit maximul (prudent). */ reserve?: "max" | "avg" | "min"; /** Doar din venitul acestui membru; lipsă = din oricare. */ payerId?: string; /** Cine o plătește efectiv, de pe cardul lui; dacă banii vin din alt salariu, se propune un transfer. */ paidById?: string; /** „fixed” (rate, facturi) se acoperă înaintea celor „flex” (mâncare, taxi); „buffer” (neprevăzute) doar din ce rămâne liber. */ priority?: "fixed" | "flex" | "buffer"; allocationId?: string; /** Ziua din lună în care se plătește (1–31), ca Calendarul și Obligațiile s-o scadă la data ei. */ dueDay?: number; /** Luna („2026-10”) în care propunerea de ajustare a fost pusă sau lăsată; nu se mai cere până luna viitoare. */ reviewedMonth?: string; archived?: boolean; updatedAt?: string };
/** Un venit care vine lunar, într-o zi știută: „salariul meu, 4.700, pe 10”. */
export type ExpectedIncome = { id: string; memberId: string; label: string; amount: number; day: number; /** Suma se schimbă de la lună la lună (comisioane, ore, PFA): `amount` e o medie, iar repartizarea se face pe suma care intră. */ variable?: boolean; archived?: boolean; updatedAt?: string };
export type AllocationHistoryKind = "created" | "updated" | "deleted" | "income-applied" | "income-reverted" | "envelope-transfer" | "week-transfer";
export type AllocationHistoryEntry = { id: string; referenceId?: string; kind: AllocationHistoryKind; allocationId?: string; allocationLabel?: string; fromAllocationId?: string; fromAllocationLabel?: string; toAllocationId?: string; toAllocationLabel?: string; amount?: number; previousAmount?: number; newAmount?: number; incomeId?: string; incomeTitle?: string; fromWeekIndex?: number; toWeekIndex?: number; note?: string; createdAt: string };
/** Preferință de viteză locală: păstrează suma și durata, nu fixează datele calendaristice ale următorului ciclu. */
export type SalaryCycleTemplate = { id: string; label: string; amount: number; durationDays: number; updatedAt?: string };
/** Un ciclu închis, păstrat ca să se vadă dacă ați rămas în plicuri. */
export type CycleMemory = { periodStart: string; periodEnd: string; spent: number; leftInEnvelopes: number; over: string[] };
export type SalaryPlan = { periodStart: string; nextPayday: string; /** Prima zi în care venitul poate intra; planul folosește această dată prudentă. */ earliestPayday?: string; /** Câte zile poate varia salariul față de data obișnuită. Implicit 3. */ paydayFlexDays?: number; sourceIds: string[]; totalLimit: number; weeklyLimit: number; allocations: BudgetAllocation[]; transfers: BudgetTransfer[]; weekTransfers?: WeekTransfer[]; salaryAllocationRules?: SalaryAllocationRule[]; salaryAllocationApplications?: SalaryAllocationApplication[]; allocationHistory?: AllocationHistoryEntry[]; /** Ultimele cicluri închise. */ cycleMemory?: CycleMemory[]; /** Cine cui dă: lipsă = părți egale; „income” = după salariul declarat. */ settleShare?: "equal" | "income"; /** Cheltuielile lunare declarate de familie (repartizarea la salariu). */ needs?: MonthlyNeed[]; /** Veniturile așteptate, cu ziua lor. */ incomes?: ExpectedIncome[]; /** Păstrat din configurarea inițială (bani deja în casă). Nerepartizații scad tot plicul, nu doar săptămâna curentă. */ joinedMidCycle?: boolean; /** Venit neregulat (PFA, freelancer): banii trebuie să ajungă atâtea zile de azi încolo; perioada se mută zilnic. */ horizonDays?: number; /** Ce rămâne (sau se depășește) într-o săptămână încheiată trece în următoarea. */ weekCarryOver?: boolean; /** Data salariului („nextPayday”) pentru care raportul de final de ciclu a fost rezolvat. */ cycleReportDone?: string; updatedAt?: string; /** Ultima schimbare a datei salariului, perioadei sau a altui câmp simplu al planului. `updatedAt` crește și la editarea unui plic, deci nu poate decide singur. */ scalarsUpdatedAt?: string };
/** Preferință locală pentru completarea rapidă; nu este o mișcare financiară până la confirmare. */
export type QuickTransactionTemplate = { id: string; label: string; kind: TransactionKind; category: string; amount: number; memberId?: string; sourceId?: string; updatedAt?: string };
export type ArchivedQuickTransactionTemplate = QuickTransactionTemplate & { archivedAt: string };
export type SavedJournalFilter = { id: string; label: string; kind: "all" | TransactionKind; memberId?: string; sourceId?: string; shareScope?: "all" | ShareScope; query?: string; fromDate?: string; toDate?: string; updatedAt: string };
/** Rezumatul unui an închis: ce rămâne în registru după ce mișcările anului trec în arhivă. */
export type YearSummary = { year: string; closedAt: string; count: number; income: number; expense: number; months: Array<{ month: string; income: number; expense: number; categories: Record<string, number> }> };
export type FamilySettings = { /** „Închide anul”: mișcările până la data asta (inclusiv) stau în arhivă, nu în registru și nici în pachetul de sync. */ archivedThrough?: string; /** Suma mișcărilor arhivate, pe sursă (lei), ca soldurile să rămână aceleași. */ archivedNet?: Record<string, number>; /** Aceeași sumă, în valuta sursei (EUR, GBP), ca soldul valutar să nu se schimbe după curs. */ archivedNetCurrency?: Record<string, number>; /** Amprentele (8 hex) mișcărilor arhivate: o mișcare cu dată veche care nu e printre ele a venit după închidere și rămâne în registru. */ archivedIds?: string; yearSummaries?: YearSummary[]; familyName: string; memberName: string; familyCode: string; members: FamilyMember[]; paymentSources: PaymentSource[]; customCategories: string[]; /** Sărbători, aniversări și alte cheltuieli anunțate de calendar, cu costul lor estimat. */ plannedEvents: PlannedEvent[]; quickTemplates: QuickTransactionTemplate[]; archivedQuickTemplates: ArchivedQuickTransactionTemplate[]; savedJournalFilters: SavedJournalFilter[]; salaryCycleTemplates: SalaryCycleTemplate[]; exchangeRates: ExchangeRate[]; seenWeeklyPlanTranches: string[]; /** Cheile produselor alese pentru coșul etalon; preferință locală, calculată din bonuri. */ basketProducts: string[]; /** Telefoane văzute în camera de sync (în pachetul criptat). */ syncDevices: SyncDevice[]; /** Reguli locale comerciant → categorie/plic (doar propuneri). */ merchantRules: MerchantRule[]; /** Lista de cumpărături a familiei (se sincronizează). */ shoppingList?: ShoppingItem[]; /** Călătoria în curs sau ultima încheiată (modul vacanță; se sincronizează). */ trip?: Trip; /** Bunurile familiei (casă, mașină, investiții) pentru averea familiei; se sincronizează. */ assets?: Asset[]; /** Garanțiile și termenele de retur ale produselor cumpărate; se sincronizează. */ warranties?: Warranty[]; salaryPlan: SalaryPlan; /** Când s-a emis un cod de recuperare. Codul însuși nu se salvează. */ syncRecoveryIssuedAt?: string; /** Membrul care folosește acest telefon. Rămâne pe telefon: nu se ia din pachetul familiei. */ selfMemberId?: string; /** Pus doar în camera veche, cu parolă, după mutarea familiei pe invitație. */ syncRoomMovedAt?: string; /** Telefonul administrator al camerei: doar el trimite invitații și scoate telefoane. */ syncAdminDeviceId?: string; /** Când s-a ales administratorul; alegerea mai nouă câștigă la unire. */ syncAdminSetAt?: string; /** Fusul orar după care se socotește „azi” pe toate telefoanele familiei. */ familyTimeZone?: string; /** Când a fost ales fusul de mână; o alegere mai nouă câștigă la sincronizare. */ familyTimeZoneSetAt?: string; /** Categoria ștearsă și creată din nou: când, ca să treacă de piatra de mormânt venită de la partener. */ categoryRevivedAt?: Record<string, string>; /** Când a fost redenumită familia; numele mai nou câștigă la sincronizare. */ familyNameSetAt?: string };
/** Colecțiile care lasă „piatră de mormânt” la ștergere, ca sincronizarea să nu le readucă. */
export const TOMBSTONE_ENTITIES = ["transactions", "debts", "savings", "receipts", "recurring", "allocations", "transfers", "weekTransfers", "salaryRules", "plannedEvents", "members", "categories", "paymentSources", "exchangeRates", "eventContributions"] as const;
export type DeletedRecord = { entity: (typeof TOMBSTONE_ENTITIES)[number]; id: string; deletedAt: string };
/** De unde vine o mișcare propusă. Determină explicația arătată lângă ea în centrul de revizuire. */
export type ReviewOrigin = "import" | "bon" | "asistent" | "notificare";
/**
 * O mișcare propusă, nu una înregistrată. Stă într-o listă separată tocmai pentru ca
 * soldurile, plicurile și prognozele să rămână neatinse până la confirmarea explicită.
 */
export type ReviewDraft = { id: string; origin: ReviewOrigin; reason: string; createdAt: string; transaction: Transaction };
/** Conflict de sumă pe același plic, după sync pe două telefoane — nu se rezolvă silent LWW. */
export type AllocationAmountConflict = {
  id: string;
  allocationId: string;
  label: string;
  localAmount: number;
  remoteAmount: number;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  detectedAt: string;
  /** Suma înainte de ultima rezolvare, pentru Anulare. */
  previousAmount?: number;
  /** Dacă utilizatorul a rezolvat recent și poate anula. */
  resolvedChoice?: "local" | "remote";
  /** Când s-a ales: o rezolvare mai nouă decât detectarea închide conflictul pe toate telefoanele. */
  resolvedAt?: string;
};
/**
 * Conflict pe aceeași mișcare (același id) editată pe două telefoane.
 * Păstrăm varianta locală în registru până la alegere explicită — nu corupe ledgerul.
 */
export type TransactionConflict = {
  id: string;
  transactionId: string;
  label: string;
  localAmount: number;
  remoteAmount: number;
  localKind: TransactionKind;
  remoteKind: TransactionKind;
  localDate: string;
  remoteDate: string;
  localTitle: string;
  remoteTitle: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  /** Snapshot remote pentru aplicarea „Păstrează remote”. */
  remoteSnapshot: Transaction;
  detectedAt: string;
  previousSnapshot?: Transaction;
  resolvedChoice?: "local" | "remote";
  resolvedAt?: string;
};
/**
 * Rezumat partajabil al cozii „De verificat” — fără imagini de bon.
 * Ciornele complete rămân pe telefonul care le-a creat; partenerul vede doar meta.
 */
export type PendingReviewMeta = {
  id: string;
  origin: ReviewOrigin;
  reason: string;
  createdAt: string;
  amount: number;
  title: string;
  date: string;
  kind: TransactionKind;
  deviceLabel?: string;
};
/** Telefon conectat la camera de familie (în pachetul criptat). */
export type SyncDevice = {
  id: string;
  label: string;
  lastSeenAt: string;
  revokedAt?: string;
  /** Versiunea aplicației la ultima sincronizare (din 1.1.195). Lipsa ei înseamnă o versiune mai veche. */
  appVersion?: string;
};
export type AppData = { version: 9; transactions: Transaction[]; debts: Debt[]; savings: SavingsGoal[]; receipts: Receipt[]; recurring: RecurringPayment[]; deleted: DeletedRecord[]; pendingReview: ReviewDraft[]; pendingReviewMeta: PendingReviewMeta[]; allocationConflicts: AllocationAmountConflict[]; transactionConflicts: TransactionConflict[]; settings: FamilySettings };

/** „SGR și sacoșe” (1.1.184–1.1.186) s-a despărțit în două: sacoșa merge la Sacoșe, restul la SGR. */
export const splitLegacySgrCategory = (category: string, text = "") => category === "SGR și sacoșe" ? (/sacos|sacoș|pung/i.test(text) ? "Sacoșe" : "SGR") : category;
export const expenseCategories = ["Alimente", "Consumabile copil", "Abonamente", "Băuturi", "Apă", "Dulciuri", "Transport", "Casă & facturi", "Sănătate", "Educație", "Timp liber", "Haine", "Credite", "Rate produse", "SGR", "Sacoșe", "Altele"];
/**
 * Culorile categoriilor: nuanțe separate (înainte Alimente, Casă și Sănătate erau trei verzi
 * aproape identici). Verificate pe fundal deschis și închis, inclusiv pentru daltonism; „Altele”
 * rămâne gri, ca rest.
 */
export const categoryColors: Record<string, string> = { SGR: "#7A8B5C", "Sacoșe": "#9C7B4F", Haine: "#B5577F", Alimente: "#2E8B57", "Casă & facturi": "#3B6FB6", Transport: "#D0782F", "Timp liber": "#8A5CC2", Sănătate: "#C8506E", Abonamente: "#A8862A", "Consumabile copil": "#1E9AA8", Educație: "#5561C9", "Rate produse": "#A0522D", Credite: "#6B8E23", Altele: "#7A8580" };

/**
 * Data calendaristică a telefonului, nu cea UTC. `toISOString()` ar întoarce ziua
 * precedentă între miezul nopții și ora 03:00 în România (UTC+2/+3), iar mișcarea
 * ar ajunge în ziua, săptămâna sau chiar perioada salarială greșită.
 */
export const isoDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
/**
 * „Azi” al familiei. Un telefon plecat în altă țară (sau cu fusul greșit) vedea altă zi
 * decât partenerul și intra în altă tranșă a plicului (testare cu utilizatori, #10).
 * Ziua se socotește în fusul familiei, sincronizat; fără el, în fusul telefonului.
 */
let familyTimeZone: string | undefined;
export const isValidTimeZone = (zone: unknown): zone is string => {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};
export const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};
export const getFamilyTimeZone = () => familyTimeZone;
export const setFamilyTimeZone = (zone: string | undefined) => { familyTimeZone = isValidTimeZone(zone) ? zone : undefined; };
/** Data calendaristică a unui moment într-un fus orar dat (yyyy-mm-dd). */
/** Un formatter pe fus: construirea lui costă de ~100 de ori mai mult decât folosirea, iar isoToday() e chemat în bucle. */
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
export const isoDateInZone = (value: Date, zone: string) => {
  let formatter = zoneFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    zoneFormatters.set(zone, formatter);
  }
  const parts = formatter.formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};
export const isoToday = () => (familyTimeZone ? isoDateInZone(new Date(), familyTimeZone) : isoDate(new Date()));
export const createFamilyCode = () => { const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(""); };

/** UUID v4 criptografic; evită coliziunile de ID când două telefoane creează înregistrări simultan, înainte de sincronizare. */
const randomUUID = () => {
  const cryptoRef = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  if (cryptoRef?.getRandomValues) {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const newId = (prefix: string) => `${prefix}-${randomUUID()}`;

/** Amprentă scurtă (FNV-1a, 8 hex) a id-ului unei mișcări arhivate de „Închide anul”. */
export const archivedIdHash = (id: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) { hash ^= id.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
const archivedSetCache = new Map<string, Set<string>>();
const archivedSet = (ids: string) => {
  let set = archivedSetCache.get(ids);
  if (!set) { set = new Set(ids.match(/.{8}/g) || []); if (archivedSetCache.size > 8) archivedSetCache.clear(); archivedSetCache.set(ids, set); }
  return set;
};
/**
 * Mișcarea e deja în arhiva unui an închis. Una cu dată din anul închis care nu e în arhivă
 * (notată offline de partener, importată din extras după închidere) rămâne în registru și
 * intră la sold: nu dispare tăcut. Arhivele vechi, fără amprente, se comportă ca înainte.
 */
export const isArchivedTransaction = (settings: Pick<FamilySettings, "archivedThrough" | "archivedIds">, item: Pick<Transaction, "id" | "date">) => {
  if (!settings.archivedThrough || item.date > settings.archivedThrough) return false;
  if (settings.archivedIds === undefined) return true;
  return archivedSet(settings.archivedIds).has(archivedIdHash(item.id));
};

export const parseRomanianAmount = (raw: string | number | null | undefined) => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  // Un backup poate să nu aibă deloc câmpul; fără paza asta, o singură linie stricată
  // arunca o excepție și pierdea tot importul.
  if (typeof raw !== "string") return 0;
  // „12,99 lei”, „RON 50”: moneda se scoate; orice altă literă („1e5”) face suma neclară, nu 15.
  const compact = raw.replace(/[\s\u00A0]/g, "").replace(/^(?:ron|lei)/i, "").replace(/(?:ron|lei|l)\.?$/i, "").replace(/^\+/, "");
  if (!/^-?[\d.,]+$/.test(compact) || !/\d/.test(compact)) return 0;
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let clean: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Ambele semne: ultimul e zecimala. „1.500,50” (RO) și „1,500.50” (EN) dau 1500,5.
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    clean = compact.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    // „1,5” e zecimală; „1,500,000” are doar separatori de mii.
    clean = compact.indexOf(",") === lastComma ? compact.replace(",", ".") : compact.split(",").join("");
  } else {
    clean = compact.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  }
  const value = Number(clean);
  return Number.isFinite(value) ? value : 0;
};

/** Mesajul pentru o sumă greșită: „format neclar” când s-a scris ceva, nu „mai mare decât zero”. */
export const amountError = (raw: string) => {
  const value = parseRomanianAmount(raw);
  if (value >= 0.005) return undefined;
  if (value > 0) return t("Suma e mai mică de un ban.");
  return /\d/.test(raw) && value === 0 && !/^[\s0.,]*(?:lei|ron)?$/i.test(raw)
    ? t("Format neclar. Scrie suma cu cifre, de exemplu 1.500,50.")
    : t("Introdu o sumă mai mare decât zero.");
};

/** Un bon se salvează și fără poze: dacă nu există linii cu sumă, totalul devine un singur produs. */
/** Marca, gramajul și unitatea unui rând scanat trec de curățarea la încărcare, doar cu valori plauzibile. */
const SIZE_UNITS_OK = new Set(["g", "kg", "ml", "l", "buc"]);
function receiptLineFacts(line: Partial<ReceiptLine>): Partial<ReceiptLine> {
  const out: Partial<ReceiptLine> = {};
  if (typeof line.brand === "string" && line.brand.trim()) out.brand = line.brand.trim().slice(0, 40);
  if (typeof line.size === "number" && line.size > 0 && line.size < 100_000 && typeof line.sizeUnit === "string" && SIZE_UNITS_OK.has(line.sizeUnit)) { out.size = line.size; out.sizeUnit = line.sizeUnit; }
  if (typeof line.qty === "number" && line.qty > 0 && line.qty < 10_000) out.qty = line.qty;
  if (line.unit === "buc" || line.unit === "kg" || line.unit === "l") out.unit = line.unit;
  if (typeof line.unitPrice === "number" && line.unitPrice > 0 && line.unitPrice < 100_000) out.unitPrice = line.unitPrice;
  if (typeof line.vatRate === "number" && [0, 5, 9, 11, 19, 21].includes(line.vatRate)) out.vatRate = line.vatRate;
  return out;
}

export function resolveReceiptLines(
  lines: Array<{ id?: string; category?: string; amount?: string | number; label?: string; discount?: number }>,
  total: number,
): ReceiptLine[] {
  const normalized: ReceiptLine[] = lines
    .map((line, index) => ({
      id: line.id || `receipt-line-${index}`,
      category: line.category || "Alimente",
      amount: parseRomanianAmount(line.amount ?? 0),
      label: String(line.label || "").trim() || undefined,
      ...(line.discount && line.discount > 0 ? { discount: line.discount } : {}),
    }))
    .filter((line) => line.amount > 0);
  if (!normalized.length && total > 0) {
    const first = lines[0];
    normalized.push({
      id: first?.id || "whole",
      category: first?.category || "Alimente",
      amount: total,
      label: String(first?.label || "").trim() || undefined,
    });
  }
  return normalized;
}

/** Eticheta internă a diferenței. Pe ecran se vede „Diferență neînregistrată”, nu numele ăsta. */
export const RECEIPT_GAP_LABEL = "Rest bon";
export const isReceiptGapLabel = (label?: string) => label === RECEIPT_GAP_LABEL || label === "Diferență neînregistrată";

/** Liniile pot fi sub total: restul intră ca o linie, fără să fie un produs. Peste total rămâne eroare. */
export function closeReceiptGap(lines: ReceiptLine[], total: number): { lines: ReceiptLine[]; remainder: number; over: boolean } {
  const sum = Math.round(lines.reduce((totalSoFar, line) => totalSoFar + line.amount, 0) * 100) / 100;
  const gap = Math.round((total - sum) * 100) / 100;
  if (gap > 0.009 && lines.length > 0) {
    return {
      lines: [...lines, { id: newId("receipt-rest"), category: "Altele", amount: gap, label: RECEIPT_GAP_LABEL }],
      remainder: gap,
      over: false,
    };
  }
  return { lines, remainder: 0, over: gap < -0.009 };
}

/** P2-7: un Intl.DateTimeFormat nou la fiecare dată costa zeci de ms pe Plicuri; se refolosește pe limbă + opțiuni. */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
export const formatDate = (iso?: string, options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS) => {
  if (!iso) return "Nespecificat";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return iso;
  const locale = getLocale();
  const key = `${locale}|${options === DEFAULT_DATE_OPTIONS ? "" : JSON.stringify(options)}`;
  let format = dateFormatters.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, format);
  }
  return format.format(date);
};

/**
 * Forma corectă nu înseamnă și dată existentă: „2026-13-45” trecea de un simplu tipar
 * și ajungea în registru, unde orice calcul cu ea dădea „Invalid Date”. Verificăm deci
 * că ziua, luna și anul chiar formează o zi din calendar.
 */
/**
 * Un fișier trunchiat sau editat de mână poate avea `null` în mijlocul unei liste.
 * Filtrul se aplică peste tot unde vine o listă din afară — și la mișcări, și la plicuri,
 * membri, surse, reguli sau istoric. Până acum acoperea doar listele de la rădăcină, iar
 * un backup cu un rând gol în plan arunca la import: exact în clipa în care omul avea cea
 * mai mare nevoie de recuperare, aplicația refuza fișierul în loc să sară rândul stricat.
 * Rândurile care nu sunt obiecte nu au ce salva: păstrate, deveneau mișcări fantomă
 * „Mișcare — 0 RON” în registrul omului.
 */
const realRows = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter((item) => item !== null && typeof item === "object") as T[]) : [];

const safeDate = (value?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return isoToday();
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12 || day < 1) return isoToday();
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return isoToday();
  return String(value);
};

export const createEmptyAppData = (): AppData => ({
  version: 9,
  transactions: [], debts: [], savings: [], receipts: [], recurring: [], deleted: [], pendingReview: [], pendingReviewMeta: [], allocationConflicts: [], transactionConflicts: [],
  settings: {
    familyName: "Familia mea", memberName: "Eu", familyCode: createFamilyCode(),
    members: [{ id: "member-me", name: "Eu", color: "#256B5B" }],
    paymentSources: [
      { id: "source-debit", name: "Card debit", kind: "card", memberId: "member-me", openingBalance: 0 },
      { id: "source-cash", name: "Cash", kind: "cash", memberId: "member-me", openingBalance: 0 },
      { id: "source-meal", name: "Bonuri de masă", kind: "meal", memberId: "member-me", openingBalance: 0 },
      { id: "source-transfer", name: "Transfer comun", kind: "transfer", openingBalance: 0 },
    ],
    customCategories: [], plannedEvents: [], quickTemplates: [], archivedQuickTemplates: [], savedJournalFilters: [], salaryCycleTemplates: [], exchangeRates: [], seenWeeklyPlanTranches: [], basketProducts: [], syncDevices: [], merchantRules: [],
    salaryPlan: { periodStart: isoToday(), nextPayday: "", sourceIds: [], totalLimit: 0, weeklyLimit: 0, allocations: [], transfers: [], weekTransfers: [], salaryAllocationRules: [], salaryAllocationApplications: [], allocationHistory: [] },
  },
});

/** Migrare defensivă a exporturilor locale din versiunile anterioare. */
/** Cheltuielile lunare declarate: sume pozitive, min ≤ max, cel mult 40 de rânduri. */
const normalizeNeeds = (value: unknown): MonthlyNeed[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return activeFirst(value.filter((item): item is MonthlyNeed => Boolean(item) && typeof item === "object" && typeof (item as MonthlyNeed).id === "string").map((item) => {
    const min = Math.max(0, parseRomanianAmount(item.min));
    const max = Math.max(min, parseRomanianAmount(item.max));
    return {
      id: item.id,
      label: String(item.label || item.category || "Cheltuială").trim().slice(0, 60),
      category: String(item.category || "Altele"),
      cadence: item.cadence === "weekly" ? "weekly" as const : "monthly" as const,
      min,
      max,
      reserve: item.reserve === "avg" || item.reserve === "min" ? item.reserve : "max" as const,
      payerId: typeof item.payerId === "string" && item.payerId ? item.payerId : undefined,
      paidById: typeof item.paidById === "string" && item.paidById ? item.paidById : undefined,
      priority: item.priority === "flex" ? "flex" as const : item.priority === "buffer" ? "buffer" as const : "fixed" as const,
      allocationId: typeof item.allocationId === "string" && item.allocationId ? item.allocationId : undefined,
      dueDay: Number.isInteger(item.dueDay) && Number(item.dueDay) >= 1 && Number(item.dueDay) <= 31 ? Number(item.dueDay) : undefined,
      reviewedMonth: typeof item.reviewedMonth === "string" && /^\d{4}-\d{2}$/.test(item.reviewedMonth) ? item.reviewedMonth : undefined,
      archived: item.archived === true ? true : undefined,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
    };
  }), 40);
};

/**
 * Plafonul se aplică întâi rândurilor active: „Șterge” doar arhivează, iar cu 40 de rânduri
 * arhivate un rând nou (adăugat la coadă) dispărea la prima normalizare.
 */
const activeFirst = <T extends { archived?: boolean }>(list: T[], cap: number): T[] => {
  if (list.length <= cap) return list;
  const keep = new Set([...list.filter((item) => !item.archived), ...list.filter((item) => item.archived)].slice(0, cap));
  return list.filter((item) => keep.has(item));
};

/** Veniturile așteptate: sumă pozitivă, zi între 1 și 31, membru obligatoriu. */
const normalizeIncomes = (value: unknown): ExpectedIncome[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return activeFirst(value.filter((item): item is ExpectedIncome => Boolean(item) && typeof item === "object" && typeof (item as ExpectedIncome).id === "string").map((item) => ({
    id: item.id,
    memberId: String(item.memberId || ""),
    label: String(item.label || "Salariu").trim().slice(0, 40),
    amount: Math.max(0, parseRomanianAmount(item.amount)),
    day: Math.min(31, Math.max(1, Math.round(Number(item.day)) || 1)),
    variable: item.variable === true ? true : undefined,
    archived: item.archived === true ? true : undefined,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
  })).filter((item) => item.memberId), 12);
};

/** Un text din date venite din afară (backup editat, alt telefon): doar șir nevid, altfel valoarea implicită. */
const textOr = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : typeof value === "number" ? String(value) : fallback;

/** `{ nume: marcaj ISO }`, fără intrări stricate; undefined dacă e gol. */
function cleanStamps(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entries = Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^\d{4}-\d{2}-\d{2}T/.test(entry[1])).slice(-200);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

const foldReceiptName = (value: string) => value.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/** Cheltuieli notate de mână, în aceeași zi, la care un bon poate fi doar detaliu. */
export function receiptAttachCandidates(data: AppData, vendor: string, amount: number, date: string): Transaction[] {
  const name = foldReceiptName(vendor);
  return data.transactions.filter((tx) => {
    if (tx.kind !== "expense" || tx.date !== date) return false;
    if (tx.receiptId || tx.id.startsWith("receipt-tx-") || tx.title.startsWith("Bon — ")) return false;
    const title = foldReceiptName(tx.title);
    const nameHit = Boolean(name) && (title === name || title.includes(name) || name.includes(title));
    const amountHit = amount > 0 && Math.abs(tx.amount - amount) <= 1;
    return nameHit || amountHit;
  }).sort((left, right) => {
    const score = (tx: Transaction) => (foldReceiptName(tx.title) === name ? 2 : 0) + (amount > 0 && Math.abs(tx.amount - amount) <= 1 ? 1 : 0);
    return score(right) - score(left);
  }).slice(0, 5);
}

/**
 * Un bon confirmat pe produse nu mai stă ca N mișcări.
 * Dacă există deja cheltuiala (Exflor 64,95), liniile se leagă de ea și duplicatele ies.
 * Altfel rămâne o singură mișcare cu totalul.
 */
export function collapseSplitReceipts(data: AppData): AppData {
  let transactions = data.transactions;
  let receipts = data.receipts;
  let pendingReview = data.pendingReview;
  const removed: string[] = [];
  const now = new Date().toISOString();
  let changed = false;
  for (const receipt of data.receipts) {
    // Rulează la fiecare pornire și sincronizare: atinge doar bonurile vechi, sparte pe produse.
    // Un bon cu o singură mișcare sau atașat de o cheltuială notată rămâne cum e (altfel se ștergeau cheltuieli reale).
    const generated = transactions.filter((tx) => tx.id === `receipt-tx-${receipt.id}` || tx.id.startsWith(`receipt-tx-${receipt.id}-`));
    if (generated.length < 2 || transactions.some((tx) => tx.receiptId === receipt.id && !generated.includes(tx))) continue;
    const vendorName = foldReceiptName(receipt.vendor);
    const manual = receiptAttachCandidates({ ...data, transactions }, receipt.vendor, receipt.amount, receipt.date)
      .find((tx) => { const title = foldReceiptName(tx.title); return Boolean(vendorName) && (title.includes(vendorName) || vendorName.includes(title)) && Math.abs(tx.amount - receipt.amount) <= 1; });
    if (manual) {
      changed = true;
      for (const tx of generated) if (tx.id !== manual.id) removed.push(tx.id);
      transactions = transactions.filter((tx) => !generated.some((item) => item.id === tx.id)).map((tx) => tx.id === manual.id ? { ...tx, receiptId: receipt.id } : tx);
      receipts = receipts.map((item) => item.id === receipt.id ? { ...item, linkedTransactionId: manual.id, linkedTransactionIds: [manual.id] } : item);
      pendingReview = pendingReview.filter((draft) => draft.transaction.receiptId !== receipt.id && !generated.some((item) => item.id === draft.transaction.id));
      continue;
    }
    {
      changed = true;
      const sample = generated[0];
      const keeper: Transaction = { ...sample, id: `receipt-tx-${receipt.id}`, receiptId: receipt.id, title: `Bon — ${receipt.vendor}`, amount: receipt.amount, category: receipt.category || sample.category, date: receipt.date, updatedAt: now };
      for (const tx of generated) if (tx.id !== keeper.id) removed.push(tx.id);
      transactions = [keeper, ...transactions.filter((tx) => !generated.some((item) => item.id === tx.id))];
      receipts = receipts.map((item) => item.id === receipt.id ? { ...item, linkedTransactionId: keeper.id, linkedTransactionIds: [keeper.id] } : item);
      pendingReview = pendingReview.filter((draft) => draft.transaction.receiptId !== receipt.id);
    }
  }
  if (!changed) return data;
  return { ...data, transactions, receipts, pendingReview, deleted: pruneTombstones([...data.deleted, ...removed.map((id) => ({ entity: "transactions" as const, id, deletedAt: now }))]) };
}

export const normalizeAppData = (input: unknown): AppData => {
  if (!input || typeof input !== "object") return createEmptyAppData();
  const old = input as Partial<AppData> & { settings?: Partial<FamilySettings> & { paymentSources?: Array<Partial<PaymentSource> & { balance?: number }> }; recurring?: Array<Partial<RecurringPayment>> };
  const fallback = createEmptyAppData();
  const oldSettings = (old.settings || {}) as Partial<FamilySettings> & { paymentSources?: Array<Partial<PaymentSource> & { balance?: number }> };
  const memberName = oldSettings.memberName || fallback.settings.memberName;
  const members = realRows<FamilyMember>(oldSettings.members).length ? realRows<FamilyMember>(oldSettings.members).map((member, index) => ({ id: member.id || `member-${index}`, name: textOr(member.name, `Membru ${index + 1}`), color: member.color, kind: member.kind === "child" ? "child" as const : undefined, updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(member.updatedAt || "")) ? String(member.updatedAt) : undefined })) : [{ id: "member-me", name: memberName, color: "#256B5B" }];
  const sources = realRows<PaymentSource>(oldSettings.paymentSources).length ? realRows<PaymentSource & { balance?: number }>(oldSettings.paymentSources).map((source, index) => ({
    id: source.id || `source-${index}`,
    name: textOr(source.name, `Sursă ${index + 1}`),
    kind: (["card", "cash", "meal", "voucher", "transfer"].includes(String(source.kind)) ? source.kind : "card") as PaymentKind,
    memberId: source.memberId,
    openingBalance: Math.max(0, parseRomanianAmount(source.openingBalance ?? (source as Partial<PaymentSource> & { balance?: number }).balance ?? 0)),
    currency: typeof source.currency === "string" && source.currency.trim() && source.currency.toUpperCase() !== BASE_CURRENCY ? source.currency.trim().toUpperCase().slice(0, 3) : undefined,
    updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(source.updatedAt || "")) ? String(source.updatedAt) : undefined,
  })) : fallback.settings.paymentSources;
  const sourceByName = new Map(sources.map((source) => [source.name.toLowerCase(), source]));
  const memberByName = new Map(members.map((member) => [member.name.toLowerCase(), member]));
  const normalizeTransaction = (entry: unknown, index: number, prefix: string): Transaction => {
    // „splitParts” e doar pentru afișarea bonului unit; ajunsese în date dintr-o corectură (1.1.185).
    const { splitParts: _parts, ...item } = (entry || {}) as Transaction & { splitParts?: unknown };
    const rawSource = (item.source || "").toLowerCase();
    const source = sources.find((value) => value.id === item.sourceId) || sourceByName.get(rawSource) || (rawSource.includes("bon") ? sources.find((value) => value.kind === "meal") : undefined) || sources[0];
    const member = members.find((value) => value.id === item.memberId) || memberByName.get((item.person || "").toLowerCase());
    const originalCurrency = typeof item.originalCurrency === "string" && item.originalCurrency.trim().toUpperCase() !== BASE_CURRENCY ? item.originalCurrency.trim().toUpperCase().slice(0, 3) : undefined;
    const originalAmount = originalCurrency ? Math.max(0, parseRomanianAmount(item.originalAmount ?? 0)) || undefined : undefined;
    const shareScope: ShareScope | undefined = item.shareScope === "personal" ? "personal" : item.shareScope === "shared" ? "shared" : undefined;
    const day = safeDate(item.date);
    // Un rând fără marcaj de timp îl primește din ziua lui, nu din clipa normalizării:
    // altfel un rând vechi venit de pe celălalt telefon s-ar naște „acum”, ar învinge
    // urma ștergerii și ar reapărea în registru după ce a fost șters.
    return { ...item, id: item.id || `${prefix}-${index}`, title: String(item.title || "Mișcare"), kind: item.kind === "income" ? "income" : "expense", category: item.kind !== "income" && item.category === "Venit" ? guessCategoryFromText(String(item.title || "")) || "Altele" : splitLegacySgrCategory(String(item.category || "Altele"), `${item.title || ""} ${item.note || ""}`), amount: money2(Math.min(MAX_AMOUNT, Math.max(0, parseRomanianAmount(item.amount)))), date: day, sourceId: source?.id, source: source?.name || item.source || "Necunoscut", memberId: member?.id, person: member?.name || item.person || memberName, createdAt: item.createdAt || `${day}T00:00:00.000Z`, originalCurrency: originalAmount ? originalCurrency : undefined, originalAmount, exchangeRate: originalAmount ? Math.max(0, parseRomanianAmount(item.exchangeRate ?? 0)) || undefined : undefined, shareScope, deviceId: typeof item.deviceId === "string" && /^[\w:-]{4,80}$/.test(item.deviceId) ? item.deviceId : undefined, spreadAmount: item.kind !== "income" && Number(item.spreadAmount) > 0 ? money2(Number(item.spreadAmount)) : undefined, tag: typeof item.tag === "string" && item.tag.trim() ? item.tag.trim().replace(/\s+/g, " ").slice(0, 24) : undefined };
  };
  const transactions = realRows<Partial<Transaction>>(old.transactions).map((entry, index) => normalizeTransaction(entry, index, "legacy-tx"));
  const transactionIds = new Set(transactions.map((item) => item.id));
  const reviewOrigins: ReviewOrigin[] = ["import", "bon", "asistent", "notificare"];
  /** O propunere confirmată pe celălalt telefon există deja în registru; nu o mai cerem a doua oară. */
  const pendingReview: ReviewDraft[] = Array.isArray((old as Partial<AppData>).pendingReview)
    ? (old as Partial<AppData>).pendingReview!.map((entry, index) => {
        const item = (entry || {}) as Partial<ReviewDraft>;
        return {
          id: String(item.id || `review-${index}`),
          origin: reviewOrigins.includes(item.origin as ReviewOrigin) ? (item.origin as ReviewOrigin) : "import",
          reason: String(item.reason || "Propunere de verificat").slice(0, 160),
          createdAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item.createdAt || "")) ? String(item.createdAt) : new Date().toISOString(),
          transaction: normalizeTransaction(item.transaction, index, "review-tx"),
        };
      }).filter((item) => item.transaction.amount > 0 && !transactionIds.has(item.transaction.id)).slice(0, 300)
    : [];
  const receipts = realRows<Receipt>(old.receipts).map((entry, index) => { const { ocrText: _ocr, ...item } = entry as Receipt; const linked = transactions.find((transaction) => transaction.id === item.linkedTransactionId || transaction.receiptId === item.id || transaction.id === `receipt-tx-${item.id}`); const lines = Array.isArray(item.lines) ? item.lines.map((line, lineIndex) => ({ id: line.id || `receipt-line-${index}-${lineIndex}`, category: splitLegacySgrCategory(line.category || "Altele", line.label || ""), amount: Math.max(0, parseRomanianAmount(line.amount)), label: line.label || undefined, ...(typeof line.discount === "number" && line.discount > 0 ? { discount: line.discount } : {}), ...receiptLineFacts(line) })).filter((line) => line.amount > 0) : undefined; const imageKeys = Array.isArray(item.imageKeys) ? item.imageKeys.filter((key): key is string => typeof key === "string" && key.length > 0).slice(0, 2) : undefined; return { ...item, id: item.id || `legacy-receipt-${index}`, amount: Math.max(0, parseRomanianAmount(item.amount)), date: safeDate(item.date), lines, imageKeys, linkedTransactionId: linked?.id || item.linkedTransactionId, linkedTransactionIds: item.linkedTransactionIds?.length ? item.linkedTransactionIds : linked?.id ? [linked.id] : undefined }; });
  const oldPlan = oldSettings.salaryPlan || fallback.settings.salaryPlan;
  const periodStart = safeDate(oldPlan.periodStart);
  const nextPayday = /^\d{4}-\d{2}-\d{2}$/.test(oldPlan.nextPayday || "") ? oldPlan.nextPayday : "";
  const earliestCandidate = (oldPlan as Partial<SalaryPlan>).earliestPayday;
  const earliestPayday = /^\d{4}-\d{2}-\d{2}$/.test(earliestCandidate || "") && String(earliestCandidate) >= periodStart && (!nextPayday || String(earliestCandidate) <= nextPayday) ? earliestCandidate : undefined;
  const normalizeQuickTemplate = (item: Partial<QuickTransactionTemplate>, index: number) => ({ id: item.id || `quick-template-${index}`, label: String(item.label || item.category || "Șablon rapid").trim(), kind: item.kind === "income" ? "income" as const : "expense" as const, category: item.kind === "income" ? "Venit" : String(item.category || "Alimente"), amount: Math.max(0, parseRomanianAmount(item.amount ?? 0)), memberId: members.some((member) => member.id === item.memberId) ? item.memberId : undefined, sourceId: sources.some((source) => source.id === item.sourceId) ? item.sourceId : undefined, updatedAt: item.updatedAt || undefined });
  const quickTemplates = Array.isArray(oldSettings.quickTemplates) ? realRows<QuickTransactionTemplate>(oldSettings.quickTemplates).map(normalizeQuickTemplate).filter((item) => item.label).slice(0, 12) : [];
  const archivedQuickTemplates = Array.isArray(oldSettings.archivedQuickTemplates) ? realRows<ArchivedQuickTransactionTemplate>(oldSettings.archivedQuickTemplates).map((item, index) => ({ ...normalizeQuickTemplate(item, index), archivedAt: /^\d{4}-\d{2}-\d{2}/.test(String(item.archivedAt || "")) ? String(item.archivedAt) : new Date().toISOString() })).filter((item) => item.label).slice(0, 60) : [];
  const savedJournalFilters = (Array.isArray(oldSettings.savedJournalFilters) ? realRows<SavedJournalFilter>(oldSettings.savedJournalFilters).map((item, index) => ({ id: item.id || `saved-filter-${index}`, label: String(item.label || "Filtru salvat").trim(), kind: item.kind === "income" || item.kind === "expense" ? item.kind : "all" as const, memberId: members.some((member) => member.id === item.memberId) ? item.memberId : undefined, sourceId: sources.some((source) => source.id === item.sourceId) ? item.sourceId : undefined, shareScope: (item.shareScope === "personal" || item.shareScope === "shared" || item.shareScope === "all" ? item.shareScope : undefined) as SavedJournalFilter["shareScope"], query: String(item.query || "").trim() || undefined, fromDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item.fromDate || "")) ? String(item.fromDate) : undefined, toDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item.toDate || "")) ? String(item.toDate) : undefined, updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item.updatedAt || "")) ? String(item.updatedAt) : new Date().toISOString() })).filter((item) => item.label && (!item.fromDate || !item.toDate || item.fromDate <= item.toDate)) : []).reduce<typeof fallback.settings.savedJournalFilters>((all, item) => all.some((saved) => saved.id === item.id || saved.label.toLocaleLowerCase("ro-RO") === item.label.toLocaleLowerCase("ro-RO")) ? all : [...all, item], []).slice(0, 8);
  const salaryCycleTemplates = (Array.isArray(oldSettings.salaryCycleTemplates) ? realRows<SalaryCycleTemplate>(oldSettings.salaryCycleTemplates).map((item, index) => ({ id: String(item.id || `salary-cycle-${index}`), label: String(item.label || "Ciclu salarial").trim().slice(0, 42), amount: Math.max(0, parseRomanianAmount(item.amount)), durationDays: Math.min(93, Math.max(7, Math.round(parseRomanianAmount(item.durationDays || 28)))), updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item.updatedAt || "")) ? String(item.updatedAt) : undefined })).filter((item) => item.label && item.amount > 0) : []).reduce<typeof fallback.settings.salaryCycleTemplates>((all, item) => all.some((saved) => saved.id === item.id || saved.label.toLocaleLowerCase("ro-RO") === item.label.toLocaleLowerCase("ro-RO")) ? all : [...all, item], []).slice(0, 12);
  const exchangeRates = (Array.isArray(oldSettings.exchangeRates) ? realRows<ExchangeRate>(oldSettings.exchangeRates).map((item) => ({
    currency: String(item.currency || "").trim().toUpperCase().slice(0, 3),
    rate: Math.max(0, parseRomanianAmount(item.rate)),
    updatedAt: /^\d{4}-\d{2}-\d{2}/.test(String(item.updatedAt || "")) ? String(item.updatedAt) : new Date().toISOString(),
  })).filter((item) => item.currency && item.currency !== BASE_CURRENCY && item.rate > 0) : [])
    .reduce<ExchangeRate[]>((all, item) => all.some((saved) => saved.currency === item.currency) ? all : [...all, item], [])
    .slice(0, 12);
  const basketProducts = Array.isArray(oldSettings.basketProducts) ? Array.from(new Set(oldSettings.basketProducts.filter((item): item is string => typeof item === "string" && item.trim().length > 1))).slice(0, 30) : [];
  const merchantRules: MerchantRule[] = (Array.isArray((oldSettings as Partial<FamilySettings>).merchantRules) ? (oldSettings as Partial<FamilySettings>).merchantRules! : [])
    .map((item, index) => ({
      id: String(item?.id || `merchant-rule-${index}`),
      match: String(item?.match || "").trim().slice(0, 80),
      category: item?.category ? String(item.category).slice(0, 60) : undefined,
      allocationId: item?.allocationId ? String(item.allocationId) : undefined,
      updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.updatedAt || "")) ? String(item.updatedAt) : undefined,
    }))
    .filter((item) => item.match.length >= 2 && (item.category || item.allocationId))
    .slice(0, 80);
  /**
   * Evenimentele viitoare vin dintr-un backup sau de pe celălalt telefon, deci pot fi
   * orice. O dată imposibilă nu e adusă la ziua de azi ca la tranzacții: un „Crăciun”
   * mutat tăcut pe 18 septembrie ar fi mai rău decât un rând lipsă, așa că rândul cade.
   */
  const plannedEventKinds: PlannedEventKind[] = ["anniversary", "holiday", "trip", "school", "other"];
  const plannedEvents: PlannedEvent[] = (Array.isArray((oldSettings as Partial<FamilySettings>).plannedEvents) ? (oldSettings as Partial<FamilySettings>).plannedEvents! : [])
    .map((item, index) => {
      const entry = (item || {}) as Partial<PlannedEvent>;
      const contributions = Array.isArray(entry.contributions)
        ? entry.contributions
          .map((line, lineIndex) => ({ id: String(line?.id || `event-put-${index}-${lineIndex}`), amount: Math.max(0, parseRomanianAmount(line?.amount)), date: safeDate(line?.date), note: line?.note ? String(line.note).slice(0, 120) : undefined }))
          .filter((line) => line.amount > 0)
          .slice(0, 120)
        : [];
      return {
        id: String(entry.id || `planned-event-${index}`),
        name: String(entry.name || "Eveniment").trim().slice(0, 60),
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || "")) ? String(entry.date) : "",
        estimate: Math.max(0, parseRomanianAmount(entry.estimate)),
        kind: plannedEventKinds.includes(entry.kind as PlannedEventKind) ? (entry.kind as PlannedEventKind) : "other",
        repeat: (entry.repeat === "yearly" ? "yearly" : "once") as PlannedEventRepeat,
        anchor: entry.anchor === "easter" ? "easter" as const : undefined,
        note: entry.note ? String(entry.note).slice(0, 200) : undefined,
        memberId: members.some((member) => member.id === entry.memberId) ? entry.memberId : undefined,
        contributions: contributions.length ? contributions : undefined,
        updatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(entry.updatedAt || "")) ? String(entry.updatedAt) : undefined,
      };
    })
    .filter((item) => item.name && item.date)
    .reduce<PlannedEvent[]>((all, item) => all.some((saved) => saved.id === item.id) ? all : [...all, item], [])
    .slice(0, 80);
  const seenWeeklyPlanTranches = Array.isArray(oldSettings.seenWeeklyPlanTranches) ? oldSettings.seenWeeklyPlanTranches.filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}:\d+$/.test(item)).slice(-80) : [];
  const allocationHistory = Array.isArray((oldPlan as Partial<SalaryPlan>).allocationHistory) ? realRows<AllocationHistoryEntry>((oldPlan as Partial<SalaryPlan>).allocationHistory).map((item, index) => ({ id: String(item.id || `allocation-history-${index}`), referenceId: item.referenceId || undefined, kind: ["created", "updated", "deleted", "income-applied", "income-reverted", "envelope-transfer", "week-transfer"].includes(String(item.kind)) ? String(item.kind) as AllocationHistoryKind : "updated" as const, allocationId: item.allocationId || undefined, allocationLabel: item.allocationLabel || undefined, fromAllocationId: item.fromAllocationId || undefined, fromAllocationLabel: item.fromAllocationLabel || undefined, toAllocationId: item.toAllocationId || undefined, toAllocationLabel: item.toAllocationLabel || undefined, amount: item.amount === undefined ? undefined : Math.max(0, parseRomanianAmount(item.amount)), previousAmount: item.previousAmount === undefined ? undefined : Math.max(0, parseRomanianAmount(item.previousAmount)), newAmount: item.newAmount === undefined ? undefined : Math.max(0, parseRomanianAmount(item.newAmount)), incomeId: item.incomeId || undefined, incomeTitle: item.incomeTitle || undefined, fromWeekIndex: Number.isFinite(item.fromWeekIndex) ? Math.max(1, Math.round(item.fromWeekIndex as number)) : undefined, toWeekIndex: Number.isFinite(item.toWeekIndex) ? Math.max(1, Math.round(item.toWeekIndex as number)) : undefined, note: item.note || undefined, createdAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item.createdAt || "")) ? String(item.createdAt) : new Date().toISOString() })).slice(0, 400) : [];
  const syncDevices = Array.isArray(oldSettings.syncDevices) ? oldSettings.syncDevices.map((item, index) => ({
    id: String(item?.id || `device-${index}`),
    label: String(item?.label || `Telefon ${index + 1}`).slice(0, 48),
    lastSeenAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.lastSeenAt || "")) ? String(item.lastSeenAt) : new Date().toISOString(),
    revokedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.revokedAt || "")) ? String(item.revokedAt) : undefined,
    ...(typeof item?.appVersion === "string" && /^\d+\.\d+\.\d+$/.test(item.appVersion) ? { appVersion: item.appVersion } : {}),
  })).filter((item) => item.id).slice(0, 20) : [];
  const selfMemberId = typeof oldSettings.selfMemberId === "string" && members.some((member) => member.id === oldSettings.selfMemberId) ? oldSettings.selfMemberId : undefined;
  const syncRecoveryIssuedAt = /^\d{4}-\d{2}-\d{2}T/.test(String(oldSettings.syncRecoveryIssuedAt || "")) ? String(oldSettings.syncRecoveryIssuedAt) : undefined;
  const allocationConflicts = Array.isArray((old as Partial<AppData>).allocationConflicts)
    ? (old as Partial<AppData>).allocationConflicts!.map((item, index) => ({
      id: String(item?.id || `conflict-${index}`),
      allocationId: String(item?.allocationId || ""),
      label: String(item?.label || "Plic"),
      localAmount: Math.max(0, parseRomanianAmount(item?.localAmount)),
      remoteAmount: Math.max(0, parseRomanianAmount(item?.remoteAmount)),
      localUpdatedAt: item?.localUpdatedAt,
      remoteUpdatedAt: item?.remoteUpdatedAt,
      detectedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.detectedAt || "")) ? String(item.detectedAt) : new Date().toISOString(),
      previousAmount: item?.previousAmount === undefined ? undefined : Math.max(0, parseRomanianAmount(item.previousAmount)),
      resolvedChoice: item?.resolvedChoice === "local" || item?.resolvedChoice === "remote" ? item.resolvedChoice : undefined,
      resolvedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.resolvedAt || "")) ? String(item!.resolvedAt) : undefined,
    })).filter((item) => item.allocationId && item.localAmount !== item.remoteAmount).slice(0, 40)
    : [];
  const pendingReviewMeta: PendingReviewMeta[] = Array.isArray((old as Partial<AppData>).pendingReviewMeta)
    ? (old as Partial<AppData>).pendingReviewMeta!.map((item, index) => {
        const origin = reviewOrigins.includes(item?.origin as ReviewOrigin) ? (item!.origin as ReviewOrigin) : "import";
        return {
          id: String(item?.id || `review-meta-${index}`),
          origin,
          reason: String(item?.reason || "Propunere").slice(0, 160),
          createdAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.createdAt || "")) ? String(item!.createdAt) : new Date().toISOString(),
          amount: Math.max(0, parseRomanianAmount(item?.amount)),
          title: String(item?.title || "Propunere").slice(0, 120),
          date: safeDate(item?.date),
          kind: item?.kind === "income" ? "income" as const : "expense" as const,
          deviceLabel: item?.deviceLabel ? String(item.deviceLabel).slice(0, 48) : undefined,
        };
      }).filter((item) => item.amount > 0).slice(0, 120)
    : [];
  const transactionConflicts: TransactionConflict[] = Array.isArray((old as Partial<AppData>).transactionConflicts)
    ? (old as Partial<AppData>).transactionConflicts!.map((item, index) => {
        const remoteSnapshot = normalizeTransaction(item?.remoteSnapshot || {
          id: item?.transactionId,
          title: item?.remoteTitle,
          amount: item?.remoteAmount,
          kind: item?.remoteKind,
          date: item?.remoteDate,
          category: "Altele",
          source: "",
          person: "",
        }, index, "conflict-remote");
        const previousSnapshot = item?.previousSnapshot ? normalizeTransaction(item.previousSnapshot, index, "conflict-prev") : undefined;
        return {
          id: String(item?.id || `tx-conflict-${index}`),
          transactionId: String(item?.transactionId || remoteSnapshot.id),
          label: String(item?.label || remoteSnapshot.title || "Mișcare"),
          localAmount: Math.max(0, parseRomanianAmount(item?.localAmount)),
          remoteAmount: Math.max(0, parseRomanianAmount(item?.remoteAmount ?? remoteSnapshot.amount)),
          localKind: item?.localKind === "income" ? "income" as const : "expense" as const,
          remoteKind: item?.remoteKind === "income" ? "income" as const : remoteSnapshot.kind,
          localDate: safeDate(item?.localDate),
          remoteDate: safeDate(item?.remoteDate || remoteSnapshot.date),
          localTitle: String(item?.localTitle || "Mișcare").slice(0, 120),
          remoteTitle: String(item?.remoteTitle || remoteSnapshot.title).slice(0, 120),
          localUpdatedAt: item?.localUpdatedAt,
          remoteUpdatedAt: item?.remoteUpdatedAt,
          remoteSnapshot,
          detectedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.detectedAt || "")) ? String(item!.detectedAt) : new Date().toISOString(),
          previousSnapshot,
          resolvedChoice: item?.resolvedChoice === "local" || item?.resolvedChoice === "remote" ? item.resolvedChoice : undefined,
          resolvedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item?.resolvedAt || "")) ? String(item!.resolvedAt) : undefined,
        };
      }).filter((item) => item.transactionId).slice(0, 40)
    : [];
  // „Închide anul”: ce e până la data arhivată nu mai stă în registru (nici când vine dintr-un pachet vechi).
  const archivedThrough = /^\d{4}-12-31$/.test(String(oldSettings.archivedThrough || "")) ? String(oldSettings.archivedThrough) : undefined;
  const archivedNet = archivedThrough && oldSettings.archivedNet && typeof oldSettings.archivedNet === "object"
    ? Object.fromEntries(Object.entries(oldSettings.archivedNet as Record<string, unknown>).map(([key, value]) => [key, Math.round(Number(value) * 100) / 100]).filter(([, value]) => Number.isFinite(value as number)))
    : undefined;
  const yearSummaries = Array.isArray(oldSettings.yearSummaries)
    ? (oldSettings.yearSummaries as YearSummary[]).filter((item) => item && /^\d{4}$/.test(String(item.year))).slice(0, 30)
    : undefined;
  const archivedIds = archivedThrough && typeof oldSettings.archivedIds === "string" && /^(?:[0-9a-f]{8})*$/.test(oldSettings.archivedIds) ? oldSettings.archivedIds : undefined;
  const archivedNetCurrency = archivedThrough && oldSettings.archivedNetCurrency && typeof oldSettings.archivedNetCurrency === "object"
    ? Object.fromEntries(Object.entries(oldSettings.archivedNetCurrency as Record<string, unknown>).map(([key, value]) => [key, Math.round(Number(value) * 100) / 100]).filter(([, value]) => Number.isFinite(value as number)))
    : undefined;
  const keptTransactions = archivedThrough ? transactions.filter((item) => !isArchivedTransaction({ archivedThrough, archivedIds }, item)) : transactions;
  const normalized: AppData = {
    version: 9, transactions: keptTransactions, receipts, pendingReview, pendingReviewMeta, allocationConflicts, transactionConflicts,
    debts: realRows<Debt>(old.debts).map((item) => ({ ...item, remaining: Math.max(0, parseRomanianAmount(item.remaining)), monthly: Math.max(0, parseRomanianAmount(item.monthly)), annualRate: (() => { const rate = parseRomanianAmount(item.annualRate ?? 0); return rate > 0 && rate <= 500 ? rate : undefined; })(), kind: item.kind === "credit" || item.kind === "card" || item.kind === "ifn" || item.kind === "persoane" ? item.kind : undefined, endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(item.endDate || "")) ? item.endDate : undefined })),
    savings: realRows<SavingsGoal>(old.savings).map((item) => ({ ...item, current: Math.max(0, parseRomanianAmount(item.current)), target: Math.max(0, parseRomanianAmount(item.target)) })),
    recurring: realRows<RecurringPayment>(old.recurring).map((item, index) => ({ id: item.id || `recurring-${index}`, name: textOr(item.name, `Plată recurentă ${index + 1}`), amount: Math.max(0, parseRomanianAmount(item.amount)), category: item.category || "Casă & facturi", sourceId: sources.some((source) => source.id === item.sourceId) ? String(item.sourceId) : sources[0]?.id || "", memberId: members.some((member) => member.id === item.memberId) ? String(item.memberId) : members[0]?.id || "", dueDay: Math.min(31, Math.max(1, Math.round(parseRomanianAmount(item.dueDay || 1)))), active: item.active !== false, frequency: item.frequency === "quarterly" || item.frequency === "yearly" ? item.frequency : undefined, month: Number.isInteger(item.month) && Number(item.month) >= 1 && Number(item.month) <= 12 ? Number(item.month) : undefined, variable: item.variable === true ? true : undefined, autoPost: item.autoPost === true && item.variable !== true, note: item.note || undefined, updatedAt: item.updatedAt || undefined })),
    deleted: pruneTombstones(Array.isArray(old.deleted) ? old.deleted.filter((item): item is DeletedRecord => Boolean(item && typeof item.id === "string" && typeof item.deletedAt === "string" && (TOMBSTONE_ENTITIES as readonly string[]).includes(item.entity))) : []),
    settings: { ...(archivedThrough ? { archivedThrough, archivedNet: archivedNet || {}, yearSummaries: yearSummaries || [], ...(archivedIds !== undefined ? { archivedIds } : {}), ...(archivedNetCurrency ? { archivedNetCurrency } : {}) } : {}), familyName: oldSettings.familyName || fallback.settings.familyName, memberName, familyCode: oldSettings.familyCode || createFamilyCode(), members, paymentSources: sources, // O categorie proprie care a devenit între timp a aplicației („Haine”) nu se mai arată de două ori.
      customCategories: (oldSettings.customCategories || []).filter((item) => !expenseCategories.includes(item)), categoryRevivedAt: cleanStamps(oldSettings.categoryRevivedAt), familyNameSetAt: /^\d{4}-\d{2}-\d{2}T/.test(String(oldSettings.familyNameSetAt || "")) ? String(oldSettings.familyNameSetAt) : undefined, plannedEvents, quickTemplates, archivedQuickTemplates, savedJournalFilters, salaryCycleTemplates, exchangeRates, seenWeeklyPlanTranches, basketProducts, syncDevices, merchantRules, shoppingList: normalizeShoppingList((oldSettings as Partial<FamilySettings>).shoppingList), trip: normalizeTrip((oldSettings as Partial<FamilySettings>).trip), assets: normalizeAssets((oldSettings as Partial<FamilySettings>).assets), warranties: normalizeWarranties((oldSettings as Partial<FamilySettings>).warranties), syncRecoveryIssuedAt, selfMemberId, familyTimeZone: isValidTimeZone(oldSettings.familyTimeZone) ? oldSettings.familyTimeZone : undefined, familyTimeZoneSetAt: /^\d{4}-\d{2}-\d{2}T/.test(String(oldSettings.familyTimeZoneSetAt || "")) ? String(oldSettings.familyTimeZoneSetAt) : undefined, syncRoomMovedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(oldSettings.syncRoomMovedAt || "")) ? String(oldSettings.syncRoomMovedAt) : undefined, ...(typeof oldSettings.syncAdminDeviceId === "string" && oldSettings.syncAdminDeviceId && /^\d{4}-\d{2}-\d{2}T/.test(String(oldSettings.syncAdminSetAt || "")) ? { syncAdminDeviceId: oldSettings.syncAdminDeviceId, syncAdminSetAt: String(oldSettings.syncAdminSetAt) } : {}), salaryPlan: { periodStart, nextPayday, earliestPayday, paydayFlexDays: Number.isFinite((oldPlan as Partial<SalaryPlan>).paydayFlexDays) ? Math.min(5, Math.max(0, Math.round(Number((oldPlan as Partial<SalaryPlan>).paydayFlexDays)))) : undefined, sourceIds: oldPlan.sourceIds || [], totalLimit: Math.max(0, parseRomanianAmount(oldPlan.totalLimit)), weeklyLimit: Math.max(0, parseRomanianAmount(oldPlan.weeklyLimit)), allocations: Array.isArray(oldPlan.allocations) ? realRows<BudgetAllocation>(oldPlan.allocations).map((item, index) => ({ ...item, id: item.id || `allocation-${index}`, label: item.label || item.category || `Plic ${index + 1}`, amount: Math.round(Math.max(0, parseRomanianAmount(item.amount)) * 100) / 100, weeklyPace: item.weeklyPace === false ? false : item.weeklyPace === true ? true : (nextPayday ? true : undefined), ...(Number(item.weeklyAmount) > 0 ? { weeklyAmount: Math.round(Number(item.weeklyAmount) * 100) / 100 } : {}), alertThreshold: Math.min(95, Math.max(50, Math.round(parseRomanianAmount(item.alertThreshold ?? 80)))), ...(Array.isArray((item as Partial<BudgetAllocation>).categories) ? { categories: Array.from(new Set((item as BudgetAllocation).categories!.map((entry) => String(entry || "").trim()).filter(Boolean))).slice(0, 20) } : {}), ...((item as Partial<BudgetAllocation>).anySource === true ? { anySource: true } : {}), funding: Array.isArray((item as Partial<BudgetAllocation>).funding) ? (item as BudgetAllocation).funding!.map((entry) => ({ sourceId: String(entry?.sourceId || ""), amount: Math.max(0, parseRomanianAmount(entry?.amount)) })).filter((entry) => entry.sourceId && entry.amount > 0).slice(0, 6) : undefined })) : [], transfers: Array.isArray((oldPlan as Partial<SalaryPlan>).transfers) ? (oldPlan as Partial<SalaryPlan>).transfers!.filter((item) => item && typeof item.id === "string" && typeof item.fromAllocationId === "string" && typeof item.toAllocationId === "string" && item.fromAllocationId !== item.toAllocationId).map((item) => ({ id: item.id, fromAllocationId: item.fromAllocationId, toAllocationId: item.toAllocationId, amount: Math.max(0, parseRomanianAmount(item.amount)), note: item.note || undefined, createdAt: item.createdAt || new Date().toISOString() })).filter((item) => item.amount > 0) : [], weekTransfers: Array.isArray((oldPlan as Partial<SalaryPlan>).weekTransfers) ? (oldPlan as Partial<SalaryPlan>).weekTransfers!.filter((item) => item && typeof item.id === "string" && typeof item.allocationId === "string" && Number.isFinite(item.fromWeekIndex) && Number.isFinite(item.toWeekIndex) && item.fromWeekIndex !== item.toWeekIndex).map((item) => ({ id: item.id, allocationId: item.allocationId, fromWeekIndex: Math.max(1, Math.round(item.fromWeekIndex)), toWeekIndex: Math.max(1, Math.round(item.toWeekIndex)), amount: Math.max(0, parseRomanianAmount(item.amount)), note: item.note || undefined, createdAt: item.createdAt || new Date().toISOString() })).filter((item) => item.amount > 0) : [], salaryAllocationRules: Array.isArray((oldPlan as Partial<SalaryPlan>).salaryAllocationRules) ? realRows<SalaryAllocationRule>((oldPlan as Partial<SalaryPlan>).salaryAllocationRules).map((item, index) => ({ id: item.id || `salary-rule-${index}`, label: String(item.label || "Repartizare venit").trim(), allocationId: String(item.allocationId || ""), mode: item.mode === "percent" ? "percent" as const : "fixed" as const, value: Math.max(0, item.mode === "percent" ? Math.min(100, parseRomanianAmount(item.value)) : parseRomanianAmount(item.value)), active: item.active !== false, updatedAt: item.updatedAt || undefined })).filter((item) => item.label && item.allocationId && item.value > 0).slice(0, 24) : [], salaryAllocationApplications: Array.isArray((oldPlan as Partial<SalaryPlan>).salaryAllocationApplications) ? realRows<SalaryAllocationApplication>((oldPlan as Partial<SalaryPlan>).salaryAllocationApplications).map((item, index) => ({ id: item.id || `salary-application-${index}`, incomeId: String(item.incomeId || ""), incomeTitle: String(item.incomeTitle || "Venit"), incomeAmount: Math.max(0, parseRomanianAmount(item.incomeAmount)), sourceId: item.sourceId || undefined, memberId: item.memberId || undefined, appliedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(item.appliedAt || "")) ? String(item.appliedAt) : new Date().toISOString(), allocations: Array.isArray(item.allocations) ? item.allocations.map((entry) => ({ ruleId: String(entry.ruleId || ""), allocationId: String(entry.allocationId || ""), amount: Math.max(0, parseRomanianAmount(entry.amount)), ...(Number.isFinite(Number(entry.previousAmount)) ? { previousAmount: Math.max(0, Number(entry.previousAmount)) } : {}), ...(Number.isFinite(Number(entry.afterAmount)) ? { afterAmount: Math.max(0, Number(entry.afterAmount)) } : {}), ...(entry.created === true ? { created: true } : {}) })).filter((entry) => entry.ruleId && entry.allocationId && (entry.amount > 0 || entry.previousAmount !== undefined)) : [], ...(item.origin === "needs" || item.origin === "rules" ? { origin: item.origin } : {}), ...(typeof item.revertedAt === "string" && item.revertedAt ? { revertedAt: item.revertedAt } : {}), ...(typeof item.updatedAt === "string" && item.updatedAt ? { updatedAt: item.updatedAt } : {}), ...(Array.isArray(item.transfers) ? { transfers: item.transfers.filter((entry) => entry && typeof entry.toMemberId === "string" && Number(entry.amount) > 0).map((entry) => ({ toMemberId: entry.toMemberId, amount: Math.max(0, parseRomanianAmount(entry.amount)), labels: Array.isArray(entry.labels) ? entry.labels.map(String).slice(0, 12) : [], ...(entry.done === true ? { done: true } : {}) })).slice(0, 6) } : {}), ...(item.previousCycle && /^\d{4}-\d{2}-\d{2}$/.test(String(item.previousCycle.openedPeriodStart || "")) ? { previousCycle: { periodStart: String(item.previousCycle.periodStart || ""), nextPayday: String(item.previousCycle.nextPayday || ""), earliestPayday: item.previousCycle.earliestPayday || undefined, paydayFlexDays: Number.isFinite(item.previousCycle.paydayFlexDays) ? item.previousCycle.paydayFlexDays : undefined, transfers: Array.isArray(item.previousCycle.transfers) ? item.previousCycle.transfers.slice(0, 200) : [], weekTransfers: Array.isArray(item.previousCycle.weekTransfers) ? item.previousCycle.weekTransfers.slice(0, 200) : [], openedPeriodStart: item.previousCycle.openedPeriodStart } } : {}) })).filter((item) => item.incomeId && item.allocations.length).slice(0, 80) : [], allocationHistory, cycleMemory: Array.isArray((oldPlan as Partial<SalaryPlan>).cycleMemory) ? (oldPlan as Partial<SalaryPlan>).cycleMemory!.filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.periodStart) && /^\d{4}-\d{2}-\d{2}$/.test(item.periodEnd)).slice(0, 6).map((item) => ({ periodStart: item.periodStart, periodEnd: item.periodEnd, spent: Math.max(0, Number(item.spent) || 0), leftInEnvelopes: Number(item.leftInEnvelopes) || 0, over: Array.isArray(item.over) ? item.over.filter((name) => typeof name === "string").slice(0, 12) : [] })) : undefined, settleShare: (oldPlan as Partial<SalaryPlan>).settleShare === "income" ? "income" as const : undefined, needs: normalizeNeeds((oldPlan as Partial<SalaryPlan>).needs), incomes: normalizeIncomes((oldPlan as Partial<SalaryPlan>).incomes), joinedMidCycle: (oldPlan as Partial<SalaryPlan>).joinedMidCycle === true, horizonDays: (() => { const days = Math.round(Number((oldPlan as Partial<SalaryPlan>).horizonDays)); return days >= 3 && days <= 180 ? days : undefined; })(), weekCarryOver: (oldPlan as Partial<SalaryPlan>).weekCarryOver === true ? true : undefined, cycleReportDone: /^\d{4}-\d{2}-\d{2}$/.test(String((oldPlan as Partial<SalaryPlan>).cycleReportDone || "")) ? (oldPlan as Partial<SalaryPlan>).cycleReportDone : undefined, updatedAt: oldPlan.updatedAt || undefined, scalarsUpdatedAt: /^\d{4}-\d{2}-\d{2}T/.test(String((oldPlan as Partial<SalaryPlan>).scalarsUpdatedAt || "")) ? (oldPlan as Partial<SalaryPlan>).scalarsUpdatedAt : undefined } },
  };
  return collapseSplitReceipts(normalized);
};

/**
 * Centrul de revizuire. Propunerile stau separat de registru: nu ating soldurile,
 * plicurile sau prognozele până când utilizatorul le confirmă. Ignorarea unei propuneri
 * nu lasă urmă în registru, pentru că mișcarea nu a existat niciodată acolo.
 */

/** Rezumat ușor de sincronizat: fără imagini, fără ciorna completă. */
export const buildPendingReviewMeta = (data: AppData, deviceLabel?: string): PendingReviewMeta[] =>
  data.pendingReview.map((draft) => ({
    id: draft.id,
    origin: draft.origin,
    reason: draft.reason,
    createdAt: draft.createdAt,
    amount: draft.transaction.amount,
    title: draft.transaction.title,
    date: draft.transaction.date,
    kind: draft.transaction.kind,
    deviceLabel,
  })).slice(0, 120);

export const addReviewDrafts = (data: AppData, drafts: ReviewDraft[]): AppData => {
  if (!drafts.length) return data;
  const known = new Set([...data.pendingReview.map((item) => item.transaction.id), ...data.transactions.map((item) => item.id)]);
  const fresh = drafts.filter((draft) => !known.has(draft.transaction.id));
  if (!fresh.length) return data;
  return { ...data, pendingReview: [...fresh, ...data.pendingReview].slice(0, 300) };
};

export const confirmReviewDraft = (data: AppData, draftId: string): AppData | undefined => {
  const draft = data.pendingReview.find((item) => item.id === draftId);
  if (!draft || data.transactions.some((item) => item.id === draft.transaction.id)) return undefined;
  const now = new Date().toISOString();
  const transaction = draft.transaction.kind === "expense"
    ? { ...draft.transaction, allocationId: resolveExpenseAllocationId(data, draft.transaction), updatedAt: now }
    : { ...draft.transaction, updatedAt: now };
  let receipts = data.receipts;
  const receiptId = transaction.receiptId;
  if (receiptId) {
    receipts = data.receipts.map((receipt) => {
      if (receipt.id !== receiptId) return receipt;
      const linked = Array.from(new Set([...(receipt.linkedTransactionIds || []), ...(receipt.linkedTransactionId ? [receipt.linkedTransactionId] : []), transaction.id]));
      return { ...receipt, linkedTransactionId: linked[0], linkedTransactionIds: linked, updatedAt: now };
    });
  }
  return commitLedgerEntry({
    ...data,
    receipts,
    pendingReview: data.pendingReview.filter((item) => item.id !== draftId),
  }, transaction);
};

export const confirmAllReviewDrafts = (data: AppData): AppData => data.pendingReview.reduce<AppData>((all, draft) => confirmReviewDraft(all, draft.id) || all, data);

/** Ignorarea scoate propunerea din listă; registrul rămâne neatins, deci nu e nevoie de piatră funerară. */
export const dismissReviewDraft = (data: AppData, draftId: string): AppData => ({ ...data, pendingReview: data.pendingReview.filter((item) => item.id !== draftId) });

export const updateReviewDraft = (data: AppData, draftId: string, patch: Partial<Transaction>): AppData => ({
  ...data,
  pendingReview: data.pendingReview.map((item) => item.id === draftId ? { ...item, transaction: { ...item.transaction, ...patch } } : item),
});

/**
 * O mișcare deja cunoscută: aceeași sursă, aceeași zi, aceeași sumă și același sens.
 * Extrasele de cont se descarcă adesea suprapus, iar reimportarea aceleiași perioade
 * nu trebuie să dubleze nimic.
 */
export const isKnownTransaction = (data: AppData, candidate: Pick<Transaction, "date" | "amount" | "kind" | "sourceId">) => {
  const same = (item: Pick<Transaction, "date" | "amount" | "kind" | "sourceId">) =>
    item.date === candidate.date && item.kind === candidate.kind && item.sourceId === candidate.sourceId && Math.abs(item.amount - candidate.amount) < 0.005;
  return data.transactions.some(same) || data.pendingReview.some((draft) => same(draft.transaction));
};

/** Textele de sistem din istoric („Plic eliminat”, „Plăți rare”) se salvează netraduse; se traduc la afișare, în limba fiecărui telefon. */
export const appendAllocationHistory = (data: AppData, entry: Omit<AllocationHistoryEntry, "id" | "createdAt">): AppData => {
  const plan = data.settings.salaryPlan;
  const history: AllocationHistoryEntry = { ...entry, id: newId("allocation-history"), createdAt: new Date().toISOString() };
  return { ...data, settings: { ...data.settings, salaryPlan: { ...plan, allocationHistory: [history, ...(plan.allocationHistory || [])].slice(0, 400), updatedAt: history.createdAt } } };
};

/** Rotunjire unică la 2 zecimale pentru ledger (semnat). */
/** Peste un miliard de lei e o greșeală de tastare, nu o cheltuială. */
export const MAX_AMOUNT = 999_999_999;
/** Suma pusă într-un câmp de editare: cu virgulă, ca „12.345” să nu fie citit drept douăsprezece mii. */
export const amountInput = (value: number) => String(money2(value)).replace(".", ",");
export const money2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
/** Alias istoric: rotunjire non-negativă la 2 zecimale. */
const roundedMoney = (value: number) => money2(Math.max(0, value));

/** Reguli eligibile pentru un venit: plicul trebuie să accepte aceeași sursă și, când este personal, același membru. */
export const eligibleSalaryAllocationRules = (data: AppData, income: Transaction) => (data.settings.salaryPlan.salaryAllocationRules || []).filter((rule) => {
  const allocation = data.settings.salaryPlan.allocations.find((item) => item.id === rule.allocationId);
  return income.kind === "income" && rule.active && Boolean(allocation) && (!allocation?.sourceId || allocation.sourceId === income.sourceId) && (!allocation?.memberId || allocation.memberId === income.memberId);
});

/** Repartizările care contează: cele anulate rămân doar ca urmă pentru sincronizare. */
export const activeSalaryApplications = (plan: Pick<SalaryPlan, "salaryAllocationApplications">) => (plan.salaryAllocationApplications || []).filter((item) => !item.revertedAt);

/** Aplică o singură dată reguli explicite unui venit deja înregistrat; crește numai limitele plicurilor și nu mută bani între surse. */
export const applySalaryAllocationRules = (data: AppData, incomeId: string) => {
  const income = data.transactions.find((item) => item.id === incomeId);
  const plan = data.settings.salaryPlan;
  const previous = activeSalaryApplications(plan).find((item) => item.incomeId === incomeId);
  if (!income || income.kind !== "income") return { data, applied: [], total: 0, remaining: 0, error: t("Alege un venit înregistrat.") };
  if (previous) return { data, applied: [], total: 0, remaining: income.amount, error: t("Acest venit a fost deja repartizat prin reguli.") };
  const rules = eligibleSalaryAllocationRules(data, income);
  /**
   * Procentele se împart la ban cu metoda celui mai mare rest: fiecare parte în jos, apoi banii
   * rămași la părțile cu restul cel mai mare. 1.000,01 lei cu 50/50% dă 500,01 + 500,00, nu
   * 500,01 + 500,01 (refuzat ca „depășește venitul”).
   */
  const incomeCents = Math.round(income.amount * 100);
  const exactCents = rules.map((rule) => rule.mode === "percent" ? incomeCents * rule.value / 100 : Math.round(rule.value * 100));
  const cents = exactCents.map((value, index) => rules[index].mode === "percent" ? Math.floor(value + 1e-9) : value);
  const percentExact = exactCents.reduce((sum, value, index) => sum + (rules[index].mode === "percent" ? value : 0), 0);
  let spare = Math.min(Math.round(percentExact) - cents.reduce((sum, value, index) => sum + (rules[index].mode === "percent" ? value : 0), 0), incomeCents - cents.reduce((sum, value) => sum + value, 0));
  rules.map((rule, index) => ({ index, rest: rule.mode === "percent" ? exactCents[index] - cents[index] : -1 })).filter((item) => item.rest > 1e-9).sort((left, right) => right.rest - left.rest).forEach((item) => { if (spare > 0) { cents[item.index] += 1; spare -= 1; } });
  const applied = rules.map((rule, index) => ({ ruleId: rule.id, allocationId: rule.allocationId, amount: cents[index] / 100 })).filter((item) => item.amount > 0);
  if (!applied.length) return { data, applied: [], total: 0, remaining: income.amount, error: t("Nu există reguli active compatibile cu acest venit și sursa sa.") };
  const total = roundedMoney(applied.reduce((sum, item) => sum + item.amount, 0));
  if (total - income.amount > 0.005) return { data, applied: [], total, remaining: income.amount, error: t("Regulile active depășesc suma venitului. Revizuiește valorile înainte de aplicare.") };
  const appliedAt = new Date().toISOString();
  const application: SalaryAllocationApplication = { id: newId("salary-application"), incomeId: income.id, incomeTitle: income.title, incomeAmount: income.amount, sourceId: income.sourceId, memberId: income.memberId, appliedAt, allocations: applied };
  const amounts = applied.reduce((all, item) => all.set(item.allocationId, roundedMoney((all.get(item.allocationId) || 0) + item.amount)), new Map<string, number>());
  const nextData = { ...data, settings: { ...data.settings, salaryPlan: { ...plan, allocations: plan.allocations.map((item) => amounts.has(item.id) ? { ...item, amount: roundedMoney(item.amount + (amounts.get(item.id) || 0)) } : item), salaryAllocationApplications: [application, ...(plan.salaryAllocationApplications || [])].slice(0, 80), updatedAt: appliedAt } } };
  return { data: appendAllocationHistory(nextData, { kind: "income-applied", referenceId: application.id, allocationLabel: applied.map((item) => plan.allocations.find((allocation) => allocation.id === item.allocationId)?.label || "Plic eliminat").join(", "), amount: total, incomeId: income.id, incomeTitle: income.title }), applied, total, remaining: roundedMoney(income.amount - total) };
};

/**
 * Anulează o repartizare. Scade din fiecare plic doar partea acestui venit: dacă plicul a rămas
 * exact cum l-a lăsat repartizarea, revine la suma de dinainte; dacă între timp a mai primit
 * bani (al doilea salariu, o editare), pleacă doar contribuția anulată, nu tot plicul.
 * Un plic creat de repartizare pleacă doar dacă nu mai are bani, cheltuieli sau altă
 * repartizare activă. Repartizarea rămâne în listă, marcată anulată: o a doua anulare
 * nu mai scade nimic, iar sincronizarea nu o readuce.
 */
export const revertSalaryAllocationApplication = (data: AppData, applicationId: string): AppData => {
  const plan = data.settings.salaryPlan;
  const application = (plan.salaryAllocationApplications || []).find((item) => item.id === applicationId);
  if (!application || application.revertedAt) return data;
  const now = new Date().toISOString();
  const envelopeLines = application.allocations.filter((item) => !item.ruleId.startsWith("event:"));
  const otherActive = activeSalaryApplications(plan).filter((item) => item.id !== applicationId);
  const referencedElsewhere = new Set(otherActive.flatMap((item) => item.allocations.map((line) => line.allocationId)));
  const used = (id: string) => data.transactions.some((tx) => tx.allocationId === id);
  const nextAmount = new Map<string, number>();
  for (const line of envelopeLines) {
    const envelope = plan.allocations.find((item) => item.id === line.allocationId);
    if (!envelope) continue;
    const current = nextAmount.get(envelope.id) ?? envelope.amount;
    const untouched = line.afterAmount !== undefined && Math.abs(current - line.afterAmount) < 0.005;
    const restored = untouched && line.previousAmount !== undefined ? line.previousAmount : current - line.amount;
    nextAmount.set(envelope.id, roundedMoney(restored));
  }
  const removable = new Set(envelopeLines.filter((line) => line.created && (nextAmount.get(line.allocationId) ?? 0) <= 0 && !used(line.allocationId) && !referencedElsewhere.has(line.allocationId)).map((line) => line.allocationId));
  // Banii puși deoparte pentru plățile rare (evenimente) se scot înapoi din jurnalul fiecăruia.
  const eventPuts = application.allocations.filter((item) => item.ruleId.startsWith("event:")).map((item) => item.ruleId.split(":"));
  const plannedEvents = eventPuts.length ? data.settings.plannedEvents.map((event) => {
    const drop = new Set(eventPuts.filter(([, eventId]) => eventId === event.id).map(([, , contributionId]) => contributionId));
    if (!drop.size) return event;
    const contributions = (event.contributions || []).filter((item) => !drop.has(item.id));
    return { ...event, contributions: contributions.length ? contributions : undefined, updatedAt: now };
  }) : data.settings.plannedEvents;
  const allocations = plan.allocations
    .filter((item) => !removable.has(item.id))
    .map((item) => nextAmount.has(item.id) ? { ...item, amount: nextAmount.get(item.id)!, updatedAt: now } : item);
  const applications = (plan.salaryAllocationApplications || []).map((item) => item.id === applicationId ? { ...item, revertedAt: now, updatedAt: now } : item);
  // Repartizarea a deschis ciclul în care suntem: anularea se întoarce la ciclul vechi, cu mutările lui.
  const back = application.previousCycle && plan.periodStart === application.previousCycle.openedPeriodStart ? application.previousCycle : undefined;
  const cycle = back ? { periodStart: back.periodStart, nextPayday: back.nextPayday, earliestPayday: back.earliestPayday, paydayFlexDays: back.paydayFlexDays, transfers: back.transfers, weekTransfers: back.weekTransfers } : {};
  const nextData = { ...data, settings: { ...data.settings, plannedEvents, salaryPlan: { ...plan, ...cycle, allocations, salaryAllocationApplications: applications, updatedAt: now } } };
  return appendAllocationHistory(nextData, { kind: "income-reverted", referenceId: application.id, allocationLabel: Array.from(new Set(application.allocations.map((item) => item.ruleId.startsWith("event:") ? "Plăți rare" : plan.allocations.find((allocation) => allocation.id === item.allocationId)?.label || "Plic eliminat"))).join(", "), amount: application.allocations.reduce((sum, item) => sum + item.amount, 0), incomeId: application.incomeId, incomeTitle: application.incomeTitle, note: "Repartizarea a fost anulată." });
};

/** Valuta unei surse; absența ei înseamnă lei. */
export const sourceCurrency = (data: AppData, sourceId?: string) =>
  data.settings.paymentSources.find((item) => item.id === sourceId)?.currency || BASE_CURRENCY;

/** Cursul salvat manual pentru o valută, în lei per unitate. Leul are mereu cursul 1. */
export const exchangeRateFor = (data: AppData, currency?: string): number | undefined => {
  const code = (currency || BASE_CURRENCY).toUpperCase();
  if (code === BASE_CURRENCY) return 1;
  return data.settings.exchangeRates.find((item) => item.currency === code)?.rate;
};

/** Transformă o sumă în lei folosind cursul dat. Fără curs nu inventăm unul. */
export const toBaseAmount = (amount: number, rate?: number) =>
  rate && rate > 0 ? Math.round(amount * rate * 100) / 100 : undefined;

/**
 * Soldul unei surse, în lei. Mișcările poartă deja suma în lei, deci singurul lucru de
 * convertit este soldul inițial, tastat în valuta sursei. Fără un curs salvat soldul
 * inițial valutar nu este presupus, ci lăsat la zero — o cifră inventată ar strica
 * marja, prognoza și scorul.
 */
export const sourceBalance = (data: AppData, sourceId: string) => {
  const source = data.settings.paymentSources.find((item) => item.id === sourceId);
  if (!source) return 0;
  const opening = source.currency ? toBaseAmount(source.openingBalance, exchangeRateFor(data, source.currency)) ?? 0 : source.openingBalance;
  return opening + (data.settings.archivedNet?.[sourceId] || 0) + data.transactions.filter((item) => item.sourceId === sourceId).reduce((total, item) => total + (item.kind === "income" ? item.amount : -item.amount), 0);
};

/**
 * Soldul unei surse valutare, în propria ei valută — ce vede utilizatorul în extrasul
 * băncii. Mișcările fără sumă originală au fost introduse în lei; le convertim înapoi
 * cu cursul curent, iar faptul că este o aproximare se spune în interfață.
 */
export const sourceBalanceInCurrency = (data: AppData, sourceId: string) => {
  const source = data.settings.paymentSources.find((item) => item.id === sourceId);
  const currency = source?.currency;
  if (!source || !currency) return undefined;
  const rate = exchangeRateFor(data, currency);
  const total = data.transactions
    .filter((item) => item.sourceId === sourceId)
    .reduce((sum, item) => {
      const own = item.originalCurrency === currency && item.originalAmount ? item.originalAmount : rate && rate > 0 ? item.amount / rate : 0;
      return sum + (item.kind === "income" ? own : -own);
    }, 0);
  const archived = data.settings.archivedNetCurrency?.[sourceId] ?? (data.settings.archivedNet?.[sourceId] ? (rate && rate > 0 ? data.settings.archivedNet[sourceId] / rate : 0) : 0);
  return { currency, amount: Math.round((source.openingBalance + archived + total) * 100) / 100, exact: data.transactions.every((item) => item.sourceId !== sourceId || item.originalCurrency === currency) };
};

/** Valutele folosite efectiv de surse, fără leu. */
export const activeCurrencies = (data: AppData) =>
  Array.from(new Set(data.settings.paymentSources.map((item) => item.currency).filter((item): item is string => Boolean(item))));

/** Valutele folosite de surse pentru care lipsește cursul; fără el soldul nu poate fi calculat. */
export const currenciesMissingRate = (data: AppData) =>
  activeCurrencies(data).filter((currency) => !exchangeRateFor(data, currency));

export const planEndDate = (plan: SalaryPlan) => paydayWindow(plan).typical || plan.nextPayday || plan.earliestPayday || "";

/**
 * Plicul are ritm săptămânal doar dacă nu e marcat lunar și există o dată de venit.
 * `weeklyPace` lipsă rămâne „implicit săptămânal” când data există — așa îl salvează Planul.
 * Fără salariu nu există tranșe, iar ecranul nu trebuie să inventeze „rămas pe zi”.
 */
export const isWeeklyPaced = (allocation: Pick<BudgetAllocation, "weeklyPace">, plan: SalaryPlan) =>
  allocation.weeklyPace !== false && Boolean(planEndDate(plan));

export const planCoverEndDate = (plan: SalaryPlan) => paydayWindow(plan).latest || planEndDate(plan) || addIsoDays(plan.periodStart, 31);
export const prudentPlanEndDate = (plan: SalaryPlan) => paydayWindow(plan).earliest || planEndDate(plan);
const addIsoDaysCache = new Map<string, string>();
export const addIsoDays = (iso: string, days: number) => {
  const key = `${iso}|${days}`;
  const hit = addIsoDaysCache.get(key);
  if (hit !== undefined) return hit;
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const result = isoDate(date);
  if (addIsoDaysCache.size >= 20_000) addIsoDaysCache.clear();
  addIsoDaysCache.set(key, result);
  return result;
};
export const paydayFlexDays = (plan: SalaryPlan) => Math.min(5, Math.max(0, Math.round(plan.paydayFlexDays ?? 0)));
export const paydayWindow = (plan: SalaryPlan) => {
  const flex = paydayFlexDays(plan);
  if (!plan.nextPayday) return { typical: "", earliest: plan.earliestPayday || "", latest: "", flex };
  const typical = plan.nextPayday;
  const computedEarliest = addIsoDays(typical, -flex);
  const earliest = plan.earliestPayday && plan.earliestPayday <= typical
    ? (plan.earliestPayday < plan.periodStart ? plan.periodStart : plan.earliestPayday)
    : (computedEarliest < plan.periodStart ? plan.periodStart : computedEarliest);
  return { typical, earliest, latest: addIsoDays(typical, flex), flex };
};
/**
 * Ciclul s-a încheiat și nu a fost reînnoit.
 *
 * Starea prin care trece fiecare familie în fiecare lună: salariul a intrat (sau a
 * întârziat), iar planul vechi a rămas în urmă. Până acum aplicația răspundea cu cifre
 * calculate pe o fereastră trecută — „poți cheltui 1.900 pe zi până pe 14 sept.”, adică
 * exact invers decât trebuie — în timp ce fișa zilei zicea că ritmul sigur e zero.
 * Amândouă porneau de la aceeași perioadă expirată; de aceea se citește într-un loc.
 */
/**
 * Pietrele de mormânt: urma pe care o lasă o ștergere, ca sincronizarea să nu readucă
 * rândul de pe celălalt telefon.
 *
 * Erau tăiate la ultimele 500. O familie care curăță odată câteva sute de mișcări vechi
 * împingea afară ștergerile dinainte — iar un telefon care nu se sincronizase de atunci
 * le învia tăcut la prima unire. Acum regula e vârsta, nu numărul: șase luni acoperă cu
 * mult orice telefon care se mai sincronizează, iar plafonul rămâne doar ca plasă.
 */
export const TOMBSTONE_DAYS = 180;
export const TOMBSTONE_MAX = 2000;

export const pruneTombstones = (deleted: DeletedRecord[], asOf = isoToday()): DeletedRecord[] => {
  const limita = new Date(`${asOf}T12:00:00`);
  limita.setDate(limita.getDate() - TOMBSTONE_DAYS);
  const prag = limita.toISOString();
  const recente = deleted.filter((item) => item.deletedAt >= prag);
  // O ștergere mai veche de prag se păstrează doar cât timp mai e loc sub plafon.
  const vechi = deleted.filter((item) => item.deletedAt < prag);
  const pastrate = recente.length >= TOMBSTONE_MAX ? recente.slice(-TOMBSTONE_MAX) : [...vechi.slice(-(TOMBSTONE_MAX - recente.length)), ...recente];
  return pastrate.sort((left, right) => left.deletedAt.localeCompare(right.deletedAt));
};

export const planExpired = (plan: SalaryPlan, asOf = isoToday()) => {
  // Data obișnuită a venitului nu închide ciclul cât timp fereastra de întârziere
  // mai e deschisă: cheltuielile încă intră în plicuri, deci și cifra zilei trebuie să stea.
  const end = plan.nextPayday ? planCoverEndDate(plan) : planEndDate(plan);
  return Boolean(end) && asOf > end;
};

export const inPlanPeriod = (iso: string, plan: SalaryPlan) => {
  const end = planCoverEndDate(plan);
  return iso >= plan.periodStart && iso <= end;
};

/**
 * Cât s-a consumat dintr-un plic, într-o singură trecere.
 *
 * Varianta dinainte chema `inPlanPeriod` pentru fiecare mișcare, iar acela chema
 * `planCoverEndDate`, care construiește obiecte `Date`. Cu trei ani de registru și
 * șase plicuri, o singură randare ajungea la zeci de mii de construcții de dată:
 * ecranul Analiză pornea în 2,3 secunde. Marginile perioadei se calculează acum o
 * dată, înainte de buclă, și nu mai facem liste intermediare.
 *
 * Un rezultat păstrat între apeluri ar fi fost și mai rapid, dar nu se poate ține
 * pe identitatea listei: registrul chiar este modificat pe loc pe alocuri, deci o
 * referință egală nu garantează date egale. Trecerea unică este destul de ieftină
 * și nu poate rămâne în urmă.
 */
/** Plicul acoperă categoria: cea principală sau una dintre cele adăugate („Cumpărături”). */
export const allocationCovers = (allocation: Pick<BudgetAllocation, "category" | "categories">, category: string) =>
  allocation.category === category || Boolean(allocation.categories?.includes(category));
/** Plicul primește plata din sursa asta: fără sursă, „din orice card”, sau una dintre sursele lui. */
export const allocationTakesSource = (allocation: BudgetAllocation, sourceId?: string) =>
  Boolean(allocation.anySource) || !allocation.sourceId || !sourceId || allocationSourceIds(allocation).includes(sourceId);

/** Potrivirea veche, după membru, categorie și sursă, pentru cheltuielile fără plic ales. */
const legacyFits = (item: Pick<Transaction, "memberId" | "category" | "sourceId">, allocation: BudgetAllocation) =>
  (!allocation.memberId || item.memberId === allocation.memberId)
  && (!allocation.category || allocationCovers(allocation, item.category))
  && allocationTakesSource(allocation, item.sourceId);

/**
 * O cheltuială aparține plicului: cel ales, sau — fără plic ales (date vechi) — plicul care i
 * se potrivește, dar numai dacă e singurul. Lumină și Apă, ambele pe „Casă & facturi”,
 * scădeau amândouă aceeași factură de 380. Aceeași regulă peste tot: plic, tranșe, notificări.
 */
export const expenseBelongsTo = (plan: Pick<SalaryPlan, "allocations">, item: Transaction, allocation: BudgetAllocation) => {
  if (item.kind !== "expense") return false;
  // Corecția de sold și transferurile potrivesc cardul, nu consumă din plic.
  if (isBalanceAdjustment(item)) return false;
  if (item.allocationId) return item.allocationId === allocation.id;
  if (!legacyFits(item, allocation)) return false;
  return !plan.allocations.some((other) => other.id !== allocation.id && legacyFits(item, other));
};

export const allocationSpent = (data: AppData, allocation: BudgetAllocation) => {
  const plan = data.settings.salaryPlan;
  const start = plan.periodStart;
  const end = planCoverEndDate(plan);
  let total = 0;
  for (const item of data.transactions) {
    if (item.kind !== "expense") continue;
    if (item.date < start || (end && item.date > end)) continue;
    if (expenseBelongsTo(plan, item, allocation)) total += item.amount;
  }
  // La bani: 126,33 + 155,77 + 83,18 nu trebuie să dea 365,28000000000003 și un plic „depășit”.
  return money2(total);
};

export const allocationBudget = (data: AppData, allocation: BudgetAllocation) => allocation.amount + data.settings.salaryPlan.transfers.reduce((sum, transfer) => sum + (transfer.toAllocationId === allocation.id ? transfer.amount : 0) - (transfer.fromAllocationId === allocation.id ? transfer.amount : 0), 0);
/** Categoriile care, într-un plic lunar, înseamnă o plată fixă: se plătește o dată, nu se cheltuie pe zile. */
const FIXED_CATEGORIES = new Set(["Casă & facturi", "Rate produse", "Credite", "Abonamente", "Educație"]);

/**
 * Plicul unei plăți fixe (factură, rată, chirie, abonament): lunar, fără ritm pe săptămâni,
 * legat de o cheltuială „fixă” din „Ce plătim lunar” sau dintr-o categorie de facturi.
 * Rata de 1.400 plătită pe 5 nu „merge prea repede”: e plătită. Ritmul pe zile, pragul de
 * atenție și „se termină înainte de salariu” nu au sens pentru el.
 */
export const isFixedEnvelope = (plan: SalaryPlan, allocation: BudgetAllocation) => {
  if (isWeeklyPaced(allocation, plan)) return false;
  const need = (plan.needs || []).find((item) => item.allocationId === allocation.id && !item.archived);
  if (need?.priority) return need.priority === "fixed";
  return FIXED_CATEGORIES.has(need?.category || allocation.category || "");
};

export const allocationStatus = (data: AppData, allocation: BudgetAllocation) => {
  const budget = allocationBudget(data, allocation);
  const spent = allocationSpent(data, allocation);
  const remaining = money2(budget - spent);
  const usage = budget > 0 ? spent / budget : 0;
  const alertThreshold = Math.min(95, Math.max(50, allocation.alertThreshold ?? 80));
  const fixed = isFixedEnvelope(data.settings.salaryPlan, allocation);
  // Plătit: s-a dat toată suma (cu o toleranță de un leu, pentru bănuții facturii).
  const paid = fixed && spent > 0 && remaining <= 1 && remaining >= 0;
  const state = remaining < 0 ? "over" as const : !fixed && usage >= alertThreshold / 100 ? "watch" as const : "healthy" as const;
  return { budget, spent, remaining, usage, alertThreshold, state, fixed, paid };
};

/**
 * Cifrele de repartizare, aceleași pe Plan, Astăzi și în teste.
 * `allocated` e suma limitelor; `reservedInEnvelopes` e ce a mai rămas de cheltuit
 * din plicuri; `unrepartized` e soldul minus rezervă minus scadențe.
 *
 * Un plic de 1.850 rezervă 1.850, chiar dacă perioada e începută și tranșa de azi
 * ține doar zilele rămase. Altfel „nerepartizați” ar arăta doar restul săptămânii
 * și familia ar putea pune a doua oară aceiași lei în alt plic.
 */
const allocationPlanSlice = (data: AppData, item: BudgetAllocation) => {
  return { budget: allocationBudget(data, item), remaining: Math.max(0, allocationStatus(data, item).remaining) };
};

export const planAllocationMath = (data: AppData) => {
  const plan = data.settings.salaryPlan;
  // Tichetele de masă nu se pun în plicuri: fără surse alese, ele nu intră în „nerepartizați”.
  const untracked = untrackedSourceIds(data);
  const sourceIds = (plan.sourceIds.length ? plan.sourceIds : data.settings.paymentSources.filter((source) => source.kind !== "meal").map((source) => source.id)).filter((id) => !untracked.has(id));
  const availableSources = data.settings.paymentSources
    .filter((source) => sourceIds.includes(source.id))
    .reduce((sum, source) => sum + sourceBalance(data, source.id), 0);
  const slice = (item: BudgetAllocation) => allocationPlanSlice(data, item);
  const allocated = plan.allocations.reduce((sum, item) => sum + slice(item).budget, 0);
  /**
   * Doar partea plicului finanțată din sursele planului: completarea din tichete (Mâncare 1.500
   * din card + 600 din tichete) nu se scade din banii de pe card, ca în „liber pe sursă”.
   */
  const reservedInEnvelopes = plan.allocations.reduce((sum, item) => {
    const shares = allocationFundingShares(item);
    if (!shares.length || shares.every((entry) => sourceIds.includes(entry.sourceId))) return sum + slice(item).remaining;
    const cap = slice(item).remaining;
    const fromPlan = shares.filter((entry) => sourceIds.includes(entry.sourceId)).reduce((total, entry) => total + Math.max(0, entry.amount - allocationSpentFromSource(data, item, entry.sourceId)), 0);
    return sum + Math.min(cap, fromPlan);
  }, 0);
  /**
   * O scadență din categoria unui plic se plătește din plicul acela (întreținerea din
   * „Casă & facturi”): banii ei sunt deja în plic, nu se mai rezervă a doua oară.
   * Doar partea care nu încape în plic rămâne rezervată separat.
   */
  const envelopeLeft = new Map<string, number>();
  plan.allocations.forEach((item) => {
    const key = item.category || item.label;
    envelopeLeft.set(key, (envelopeLeft.get(key) || 0) + Math.max(0, slice(item).remaining));
  });
  const dues = [
    ...pendingRecurringInPlan(data).map((item) => ({ category: item.category, amount: item.amount })),
    ...reservedDebtsInPlan(data).map((item) => ({ category: "Rate produse", amount: item.amount })),
  ];
  const scheduledInEnvelopes = dues.reduce((sum, due) => {
    const left = envelopeLeft.get(due.category) || 0;
    const take = Math.min(left, due.amount);
    envelopeLeft.set(due.category, left - take);
    return sum + take;
  }, 0);
  /** Scadențe rezervate în afara plicurilor. */
  const scheduled = scheduledInPlan(data) - scheduledInEnvelopes;
  const unrepartized = availableSources - reservedInEnvelopes - scheduled;
  return { sourceIds, availableSources, scheduled, scheduledInEnvelopes, allocated, reservedInEnvelopes, unrepartized };
};

/**
 * Cât mai poate fi repartizat dintr-o sursă: soldul ei, minus ce ține deja rezervat în
 * plicurile plătite din ea și în scadențele care o vor goli. Fără scăderea asta, banii
 * puși deja într-un plic apar a doua oară ca disponibili când deschizi un plic nou.
 */
/** Toate sursele din care se plătește un plic: cea principală plus completările. */
export const allocationSourceIds = (item: BudgetAllocation) =>
  [item.sourceId, ...(item.funding || []).map((entry) => entry.sourceId)].filter((id): id is string => Boolean(id));

/**
 * Cât ține fiecare sursă din plic. Completările își scriu suma, iar sursa principală duce
 * restul — așa, un plic de 1.900 cu 100 de la partener rezervă 1.800 din cashul propriu.
 */
export const allocationFundingShares = (item: BudgetAllocation): AllocationFunding[] => {
  const extras = (item.funding || []).filter((entry) => entry.sourceId && entry.amount > 0);
  const fromExtras = extras.reduce((sum, entry) => sum + entry.amount, 0);
  const primary = money2(Math.max(0, item.amount - fromExtras));
  return item.sourceId ? [{ sourceId: item.sourceId, amount: primary }, ...extras] : extras;
};

/** Cât din plic s-a plătit chiar din sursa asta, în perioada planului. */
export const allocationSpentFromSource = (data: AppData, allocation: BudgetAllocation, sourceId: string) => {
  const plan = data.settings.salaryPlan;
  const start = plan.periodStart;
  const end = planCoverEndDate(plan);
  let total = 0;
  for (const item of data.transactions) {
    if (item.kind !== "expense" || item.sourceId !== sourceId) continue;
    if (start && item.date < start) continue;
    if (end && item.date > end) continue;
    if (expenseBelongsTo(plan, item, allocation)) total += item.amount;
  }
  return total;
};

/**
 * Cât mai e din plic pe fiecare sursă: partea pusă din ea, minus ce s-a plătit chiar din ea.
 * Un plic de 2.744 cu 600 din cardul de bonuri arată „bonuri: 452 din 600”, nu tot soldul cardului.
 */
export const allocationSourceParts = (data: AppData, allocation: BudgetAllocation) => {
  // Plicul „din orice card” e doar o limită: nu mai are părți pe surse de urmărit.
  if (allocation.anySource) return [];
  const shares = new Map<string, number>();
  for (const entry of allocationFundingShares(allocation)) shares.set(entry.sourceId, (shares.get(entry.sourceId) || 0) + entry.amount);
  return Array.from(shares, ([sourceId, share]) => {
    const spent = money2(allocationSpentFromSource(data, allocation, sourceId));
    return { sourceId, share: money2(share), spent, left: money2(share - spent) };
  });
};

export const sourceFreeBalance = (data: AppData, sourceId: string, ignoreAllocationId?: string) => {
  const balance = sourceBalance(data, sourceId);
  const reservedInEnvelopes = data.settings.salaryPlan.allocations
    .filter((item) => item.id !== ignoreAllocationId && allocationSourceIds(item).includes(sourceId))
    .reduce((sum, item) => {
      /* Rezervarea urmează banii reali: fiecare sursă ține partea ei din plic, mai puțin ce
         s-a cheltuit chiar din ea. Împărțirea proporțională ar scădea de două ori aceeași
         cheltuială — o dată din soldul sursei, o dată din rezervă — și ar scoate sursa pe minus. */
      const shares = allocationFundingShares(item);
      const mine = shares.filter((entry) => entry.sourceId === sourceId).reduce((total, entry) => total + entry.amount, 0);
      if (mine <= 0) return sum;
      const spentHere = allocationSpentFromSource(data, item, sourceId);
      const cap = allocationPlanSlice(data, item).remaining;
      return sum + Math.min(cap, Math.max(0, mine - spentHere));
    }, 0);
  const scheduled = pendingRecurringInPlan(data)
    .filter((item) => item.sourceId === sourceId)
    .reduce((sum, item) => sum + item.amount, 0);
  return {
    balance: money2(balance),
    reserved: money2(reservedInEnvelopes + scheduled),
    free: money2(balance - reservedInEnvelopes - scheduled),
  };
};

/** Ce rămâne rezervat în plicuri după o modificare de limite, ținând cont de ce s-a cheltuit deja. */
export const plannedEnvelopeReserved = (allocations: BudgetAllocation[], remainingById: Record<string, number>, draft: Record<string, number>) =>
  allocations.reduce((sum, item) => {
    const original = item.amount;
    const next = draft[item.id] ?? original;
    const remaining = remainingById[item.id] ?? original;
    // `remaining` e deja limita plus transferuri, minus cheltuieli. Diferența de limită
    // se adaugă peste rest, nu peste suma scrisă — altfel transferul care a mărit plicul
    // dispare din restul ghidului și apar „bani fără plic” care sunt deja într-un plic.
    return sum + Math.max(0, remaining + next - original);
  }, 0);

const roundSigned = money2;

/** Partea „pentru toată luna” a unei cheltuieli, cel mult cât cheltuiala. */
export const spreadPart = (item: Pick<Transaction, "amount" | "spreadAmount">) => Math.max(0, Math.min(item.amount, item.spreadAmount || 0));

/** Situația fiecărei tranșe calendaristice a unui plic, cu ajustările din transferurile între săptămâni. */
const allocationWeeksStatusUncached = (data: AppData, allocation: BudgetAllocation) => {
  const plan = data.settings.salaryPlan;
  const end = planEndDate(plan);
  const budget = allocationBudget(data, allocation);
  const calendar = end ? calendarBudget(budget, plan.periodStart, end, allocation.weeklyAmount) : undefined;
  if (!calendar) return [];
  const weekTransfers = (plan.weekTransfers || []).filter((item) => item.allocationId === allocation.id);
  /**
   * Limita se împarte pe zile până la data obișnuită a venitului, dar plicul numără
   * cheltuielile până la data cea mai târzie a ferestrei. Fără prelungirea ultimei tranșe,
   * o cheltuială din zilele de flexibilitate scădea din totalul plicului fără să apară
   * în nicio săptămână. Sumele rămân neschimbate; se lărgește doar intervalul acoperit.
   */
  const cover = planCoverEndDate(plan);
  const lastIndex = calendar.weeks.length - 1;
  const today = isoToday();
  /* O singură trecere prin jurnal: mișcările plicului, apoi fiecare tranșă își ia intervalul.
     Înainte, fiecare săptămână filtra tot jurnalul (5 × 5.000 de rânduri pe plic, la fiecare randare). */
  const first = calendar.weeks[0]?.start || "";
  const last = cover > (calendar.weeks[lastIndex]?.end || "") ? cover : calendar.weeks[lastIndex]?.end || "";
  const mine = data.transactions.filter((item) => item.kind === "expense" && item.date >= first && item.date <= last && expenseBelongsTo(plan, item, allocation));
  /**
   * Cumpărătura pentru toată luna: partea ei se împarte egal pe săptămâna cumpărării și pe cele
   * rămase. Detergentul de 102 lei nu mai golește o singură săptămână de alimente.
   */
  const weekOf = (date: string) => { const found = calendar.weeks.findIndex((week, index) => date >= week.start && date <= (index === lastIndex && cover > week.end ? cover : week.end)); return found < 0 ? lastIndex : found; };
  const spreadExtra = new Array(calendar.weeks.length).fill(0) as number[];
  for (const item of mine) {
    const spread = spreadPart(item);
    if (spread <= 0) continue;
    const from = weekOf(item.date);
    // Pe măsura săptămânii: una întreagă ia mai mult, ultima zi dinaintea salariului aproape nimic.
    const weight = calendar.weeks.slice(from).reduce((sum, week) => sum + Math.max(0, week.amount), 0);
    // La bani: fiecare felie rotunjită la bani, iar ultima ia restul, ca suma să dea fix partea bonului.
    let given = 0;
    for (let position = from; position <= lastIndex; position += 1) {
      const slice = position === lastIndex ? money2(spread - given) : money2(weight > 0 ? spread * Math.max(0, calendar.weeks[position].amount) / weight : spread / (lastIndex - from + 1));
      spreadExtra[position] += slice;
      given = money2(given + slice);
    }
  }
  let carryNext = 0;
  return calendar.weeks.map((week, index) => {
    const adjustment = weekTransfers.reduce((sum, item) => sum + (item.toWeekIndex === week.index ? item.amount : 0) - (item.fromWeekIndex === week.index ? item.amount : 0), 0);
    // Reportul: doar dintr-o săptămână încheiată; cea în curs își păstrează banii până la capăt.
    const carry = plan.weekCarryOver ? carryNext : 0;
    const weekBudget = roundSigned(week.amount + adjustment + carry);
    const weekEnd = index === lastIndex && cover > week.end ? cover : week.end;
    let spent = 0;
    for (const item of mine) if (item.date >= week.start && item.date <= weekEnd) spent += item.amount - spreadPart(item);
    spent += spreadExtra[index];
    const remaining = roundSigned(weekBudget - spent);
    const days = weekEnd === week.end ? week.days : periodDays(week.start, weekEnd);
    carryNext = weekEnd < today ? remaining : 0;
    return { ...week, end: weekEnd, days, plannedEnd: week.end, plannedDays: week.days, budget: weekBudget, carry: roundSigned(carry), spent: roundedMoney(spent), remaining, usage: weekBudget > 0 ? spent / weekBudget : 0, state: remaining < 0 ? "over" as const : "healthy" as const };
  });
};

/**
 * Tranșele de pe Plan, după transferurile „de azi”. calendarBudget pe suma plicurilor
 * ignoră echilibrarea și arată 480 pe S1 inclusiv zilele deja trecute.
 */
const planWeeklyCycleUncached = (data: AppData): CalendarBudget | undefined => {
  const plan = data.settings.salaryPlan;
  const end = planEndDate(plan);
  const paced = plan.allocations.filter((item) => isWeeklyPaced(item, plan));
  if (!end || !plan.periodStart || !paced.length) return undefined;
  const byIndex = new Map<number, CalendarBudget["weeks"][number]>();
  for (const item of paced) {
    for (const week of allocationWeeksStatus(data, item)) {
      const prev = byIndex.get(week.index);
      // Tranșa se afișează până la data obișnuită a salariului; zilele de toleranță sunt separat
      // („+3 zile dacă salariul întârzie”), nu o „săptămână de 9 zile”.
      const graceDays = periodDays(week.plannedEnd, week.end) - 1;
      if (!prev) {
        byIndex.set(week.index, { index: week.index, start: week.start, end: week.plannedEnd, days: week.plannedDays, amount: week.budget, ...(graceDays > 0 ? { graceDays } : {}) });
      } else {
        prev.amount = money2(prev.amount + week.budget);
        if (week.plannedEnd > prev.end) {
          prev.end = week.plannedEnd;
          prev.days = week.plannedDays;
        }
        if (graceDays > (prev.graceDays || 0)) prev.graceDays = graceDays;
      }
    }
  }
  const weeks = Array.from(byIndex.values()).sort((left, right) => left.index - right.index);
  if (!weeks.length) return undefined;
  const total = money2(weeks.reduce((sum, week) => sum + week.amount, 0));
  const fullWeek = weeks.find((week) => week.days === 7) || weeks.find((week) => week.days >= 7);
  return {
    total,
    start: plan.periodStart,
    end,
    days: periodDays(plan.periodStart, end),
    exactWeeks: periodDays(plan.periodStart, end) / 7,
    weeklyAmount: fullWeek?.amount ?? weeks[0].amount,
    weeks,
  };
};

/** Situația unui plic în tranșa calendaristică ce conține data verificată. */
export const allocationWeekStatus = (data: AppData, allocation: BudgetAllocation, date = isoToday()) => {
  return allocationWeeksStatus(data, allocation).find((week) => date >= week.start && date <= week.end);
};

/**
 * Cifra de decizie a plicului: tranșa săptămânii active, sau tot ciclul dacă plicul e lunar/fix.
 * Astăzi, masa de lucru și alertele trebuie să citească aceeași valoare — altfel același plic arată 200 și 800.
 */
export const envelopeDecisionStatus = (data: AppData, allocation: BudgetAllocation, date = isoToday()) => {
  const cycle = allocationStatus(data, allocation);
  const week = isWeeklyPaced(allocation, data.settings.salaryPlan) ? allocationWeekStatus(data, allocation, date) : undefined;
  if (!week) return { ...cycle, scope: "cycle" as const, weekIndex: undefined as number | undefined };
  const usage = week.budget > 0 ? week.spent / week.budget : 0;
  const remaining = week.remaining;
  return {
    budget: week.budget,
    spent: week.spent,
    remaining,
    usage,
    alertThreshold: cycle.alertThreshold,
    state: remaining < 0 ? "over" as const : usage >= cycle.alertThreshold / 100 ? "watch" as const : "healthy" as const,
    fixed: false,
    paid: false,
    scope: "week" as const,
    weekIndex: week.index as number | undefined,
  };
};

/** Mută bani dintr-o tranșă săptămânală în alta, în interiorul aceluiași plic; nu poate lua mai mult decât e disponibil în tranșa sursă. */
export const transferBetweenWeeks = (data: AppData, input: { allocationId: string; fromWeekIndex: number; toWeekIndex: number; amount: number; note?: string }): AppData | undefined => {
  const plan = data.settings.salaryPlan;
  const allocation = plan.allocations.find((item) => item.id === input.allocationId);
  const amount = Math.round(Math.max(0, input.amount) * 100) / 100;
  if (!allocation || amount <= 0 || input.fromWeekIndex === input.toWeekIndex) return undefined;
  const weeks = allocationWeeksStatus(data, allocation);
  const fromWeek = weeks.find((week) => week.index === input.fromWeekIndex);
  if (!fromWeek || amount > fromWeek.remaining) return undefined;
  const transfer: WeekTransfer = { id: newId("week-transfer"), allocationId: allocation.id, fromWeekIndex: input.fromWeekIndex, toWeekIndex: input.toWeekIndex, amount, note: input.note?.trim() || undefined, createdAt: new Date().toISOString() };
  return { ...data, settings: { ...data.settings, salaryPlan: { ...plan, weekTransfers: [transfer, ...(plan.weekTransfers || [])], updatedAt: new Date().toISOString() } } };
};

/** Mută o limită între două plicuri; nu poate lua mai mult decât a rămas în plicul sursă și nu mișcă bani din surse. */
export const transferBetweenEnvelopes = (data: AppData, input: { fromAllocationId: string; toAllocationId: string; amount: number; note?: string }): AppData | undefined => {
  const plan = data.settings.salaryPlan;
  const from = plan.allocations.find((item) => item.id === input.fromAllocationId);
  const to = plan.allocations.find((item) => item.id === input.toAllocationId);
  const amount = roundedMoney(input.amount);
  if (!from || !to || from.id === to.id || amount <= 0) return undefined;
  if (amount > allocationStatus(data, from).remaining) return undefined;
  const transfer: BudgetTransfer = { id: newId("transfer"), fromAllocationId: from.id, toAllocationId: to.id, amount, note: input.note?.trim() || undefined, createdAt: new Date().toISOString() };
  return { ...data, settings: { ...data.settings, salaryPlan: { ...plan, transfers: [transfer, ...plan.transfers], updatedAt: transfer.createdAt } } };
};

/** Anulează o mutare între plicuri. Nu atinge sursele și nici registrul. */
export const dropEnvelopeTransfer = (data: AppData, transferId: string): AppData | undefined => {
  const plan = data.settings.salaryPlan;
  if (!plan.transfers.some((item) => item.id === transferId)) return undefined;
  return { ...data, settings: { ...data.settings, salaryPlan: { ...plan, transfers: plan.transfers.filter((item) => item.id !== transferId), updatedAt: new Date().toISOString() } } };
};

/** Corecția de sold („Bani disponibili” / „Corecție de sold”): contează la soldul sursei, nu la venituri și cheltuieli. */
export const isBalanceAdjustment = (item: Pick<Transaction, "id" | "adjustment" | "transferId">) => item.adjustment === true || Boolean(item.transferId) || item.id.startsWith("balance-check");

/**
 * Bani mutați între două surse ale familiei (retragere de la ATM, alimentare Revolut, plata
 * cardului de credit): o ieșire din prima și o intrare în a doua, legate prin transferId.
 * Soldurile se mută; veniturile, cheltuielile și plicurile nu se schimbă.
 */
export const sourceTransferPair = (data: AppData, input: { fromId: string; toId: string; amount: number; date: string; memberId?: string; note?: string }): Transaction[] => {
  const from = data.settings.paymentSources.find((item) => item.id === input.fromId);
  const to = data.settings.paymentSources.find((item) => item.id === input.toId);
  if (!from || !to || from.id === to.id) throw new Error(t("Alege două surse diferite."));
  const amount = money2(input.amount);
  if (!(amount > 0)) throw new Error(t("Introdu o sumă mai mare decât zero."));
  const member = data.settings.members.find((item) => item.id === input.memberId) || data.settings.members.find((item) => item.id === from.memberId) || data.settings.members[0];
  const pair = newId("transfer");
  const createdAt = new Date().toISOString();
  const common = { amount, date: input.date, memberId: member?.id, person: member?.name || "", transferId: pair, createdAt, ...(input.note ? { note: input.note } : {}) };
  return [
    { ...common, id: `${pair}-out`, title: t("Mutat în {name}", { name: to.name }), kind: "expense", category: "Transfer", sourceId: from.id, source: from.name, allocationId: "outside", outsideChosen: true },
    { ...common, id: `${pair}-in`, title: t("Mutat din {name}", { name: from.name }), kind: "income", category: "Transfer", sourceId: to.id, source: to.name },
  ];
};

/** Venituri încă nerepartizate prin ritualul de salariu. */
export const unappliedSalaryIncomes = (data: AppData) => {
  const applied = new Set(activeSalaryApplications(data.settings.salaryPlan).map((item) => item.incomeId));
  return data.transactions
    .filter((item) => item.kind === "income" && !applied.has(item.id) && !isBalanceAdjustment(item))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
};

export type DebtSnowballStep = {
  debt: Debt;
  rank: number;
  remaining: number;
  monthly: number;
  monthsAtMinimum: number | null;
  recommended: number;
  isNext: boolean;
};

/** Ordine tip minge de zăpadă: cea mai mică datorie rămasă întâi. Nu estimează dobândă. */
export const debtSnowball = (data: AppData) => {
  const open = [...data.debts.filter((item) => item.remaining > 0)].sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name, "ro-RO"));
  const order: DebtSnowballStep[] = open.map((debt, index) => ({
    debt,
    rank: index + 1,
    remaining: debt.remaining,
    monthly: debt.monthly,
    monthsAtMinimum: debt.monthly > 0 ? Math.ceil(debt.remaining / debt.monthly) : null,
    recommended: Math.min(debt.remaining, debt.monthly > 0 ? debt.monthly : debt.remaining),
    isNext: index === 0,
  }));
  return {
    order,
    next: order[0],
    totalRemaining: roundedMoney(open.reduce((sum, item) => sum + item.remaining, 0)),
    count: open.length,
  };
};

/** Plicuri compatibile pentru o cheltuială reală, cu prioritate pentru potrivirea exactă membru + sursă. */
const RELATED_ENVELOPE_CATEGORIES: Record<string, string[]> = {
  Dulciuri: ["Alimente"],
  Băuturi: ["Alimente"],
  Apă: ["Alimente", "Casă & facturi"],
  Alimente: ["Dulciuri", "Băuturi"],
  "Casă & facturi": ["Apă"],
};

const envelopeFitsSourceAndMember = (data: AppData, allocation: BudgetAllocation, input: { memberId?: string; sourceId?: string }, sourceFit: BudgetAllocation[]) => {
  if (!allocationTakesSource(allocation, input.sourceId)) return false;
  if (!allocation.memberId || allocation.memberId === input.memberId) return true;
  const exactMemberMatchExists = sourceFit.some((item) => item.memberId === input.memberId);
  const sourceOwnerId = data.settings.paymentSources.find((source) => source.id === input.sourceId)?.memberId;
  return !exactMemberMatchExists && allocation.memberId === sourceOwnerId;
};

const rankEnvelope = (data: AppData, item: BudgetAllocation) => (item.memberId ? 2 : 0) + (item.sourceId ? 2 : 0) + (allocationBudget(data, item) - allocationSpent(data, item) > 0 ? 1 : 0);

/**
 * Tichetele de masă nu consumă plicurile din salariu: cumpărătura de 150 pe tichete scădea
 * Mâncarea finanțată din salariu, deși pornirea spunea „tichetele nu intră”. Plată cu
 * tichete merge doar într-un plic care are tichetele printre surse; altfel, în afara plicurilor.
 */
const sourceCompatibleAllocations = (data: AppData, input: { sourceId?: string }) => {
  const meal = Boolean(input.sourceId && data.settings.paymentSources.find((item) => item.id === input.sourceId)?.kind === "meal");
  return data.settings.salaryPlan.allocations.filter((allocation) => meal
    ? Boolean(allocation.anySource) || allocationSourceIds(allocation).includes(input.sourceId!)
    : allocationTakesSource(allocation, input.sourceId));
};

export const matchingAllocationsForExpense = (data: AppData, input: { category: string; memberId?: string; sourceId?: string }) => {
  const pool = data.settings.salaryPlan.allocations;
  const sourceFit = sourceCompatibleAllocations(data, input);
  const fits = (allocation: BudgetAllocation) => envelopeFitsSourceAndMember(data, allocation, input, sourceFit);
  const sort = (list: BudgetAllocation[]) => [...list].sort((left, right) => rankEnvelope(data, right) - rankEnvelope(data, left));
  const exact = sort(sourceFit.filter((allocation) => allocationCovers(allocation, input.category) && fits(allocation)));
  if (exact.length) return exact;
  const related = RELATED_ENVELOPE_CATEGORIES[input.category] || [];
  const kin = sort(sourceFit.filter((allocation) => related.includes(allocation.category || "") && fits(allocation)));
  if (kin.length) return kin;
  if (pool.length === 1 && sourceFit.includes(pool[0]) && fits(pool[0])) return pool;
  return [];
};

/** Plicurile din care poți alege la captură, nu doar cel pe categorie. */
export const pickerAllocationsForExpense = (data: AppData, input: { category: string; memberId?: string; sourceId?: string }) => {
  const matched = matchingAllocationsForExpense(data, input);
  const sourceFit = sourceCompatibleAllocations(data, input);
  const extras = sourceFit.filter((allocation) =>
    envelopeFitsSourceAndMember(data, allocation, input, sourceFit)
    && !matched.some((item) => item.id === allocation.id));
  return [...matched, ...extras];
};

/** Plicul real al unei cheltuieli: cel ales, dacă încă există, altfel primul potrivit. */
export const resolveExpenseAllocationId = (
  data: AppData,
  input: { category: string; memberId?: string; sourceId?: string; allocationId?: string },
) => {
  if (input.allocationId && input.allocationId !== "outside") {
    if (data.settings.salaryPlan.allocations.some((item) => item.id === input.allocationId)) return input.allocationId;
  }
  return matchingAllocationsForExpense(data, input)[0]?.id || "outside";
};

/**
 * Scrie o mișcare în registru. Dacă e cheltuială dintr-o altă săptămână a plicului,
 * mută întâi tranșa — același drum ca ghidul. Dacă tranșa aleasă nu acoperă suma,
 * nu scriem cheltuiala pe săptămâna curentă: utilizatorul a ales explicit sursa.
 */
export const commitLedgerEntry = (data: AppData, entry: Transaction, fromWeekIndex?: number): AppData => {
  let ledger = data;
  if (entry.kind === "expense" && entry.allocationId && entry.allocationId !== "outside" && fromWeekIndex) {
    const allocation = data.settings.salaryPlan.allocations.find((item) => item.id === entry.allocationId);
    const currentWeek = allocation && isWeeklyPaced(allocation, data.settings.salaryPlan) ? allocationWeekStatus(data, allocation, entry.date) : undefined;
    if (allocation && currentWeek && fromWeekIndex !== currentWeek.index) {
      const transferred = transferBetweenWeeks(data, {
        allocationId: allocation.id,
        fromWeekIndex,
        toWeekIndex: currentWeek.index,
        amount: entry.amount,
        note: t("Mutare la înregistrare ca să acoperi cheltuiala"),
      });
      if (!transferred) {
        throw new Error(t("Săptămâna aleasă nu are destui bani rămași în plic. Alege altă tranșă sau o sumă mai mică."));
      }
      ledger = appendAllocationHistory(transferred, {
        kind: "week-transfer",
        referenceId: transferred.settings.salaryPlan.weekTransfers?.[0]?.id,
        allocationId: allocation.id,
        allocationLabel: allocation.label,
        amount: entry.amount,
        fromWeekIndex,
        toWeekIndex: currentWeek.index,
        note: t("Mutare la înregistrare ca să acoperi cheltuiala"),
      });
    }
  }
  // La bani: „12,345” ar fi reapărut la corectură ca „12.345”, adică 12.345 lei.
  const stamped = { ...entry, amount: money2(Math.min(MAX_AMOUNT, Math.max(0, entry.amount))), updatedAt: new Date().toISOString() };
  const transactions = ledger.transactions.some((row) => row.id === stamped.id)
    ? ledger.transactions.map((row) => row.id === stamped.id ? stamped : row)
    : [stamped, ...ledger.transactions];
  return { ...ledger, transactions };
};

/**
 * Cheltuielile rămase „în afara plicurilor” când tot banul e deja așezat.
 * Dacă există un plic pe categorie, îl folosim; dacă e un singur plic în plan,
 * scoatem din el — nu lăsăm o gaură de 20 lei care arată ca depășire.
 */
export const adoptOutsideExpenses = (data: AppData): AppData => {
  const allocations = data.settings.salaryPlan.allocations;
  if (!allocations.length) return data;
  let changed = false;
  const stamp = new Date().toISOString();
  const transactions = data.transactions.map((item) => {
    if (item.kind !== "expense") return item;
    if (item.note === "decontare-intre-membri") return item;
    if (isBalanceAdjustment(item)) return item;
    if (item.allocationId && item.allocationId !== "outside") return item;
    if (item.outsideChosen) return item;
    if (!inPlanPeriod(item.date, data.settings.salaryPlan)) return item;
    const matched = matchingAllocationsForExpense(data, { category: item.category, memberId: item.memberId, sourceId: item.sourceId })[0];
    // Tichetele rămân în afara plicurilor din salariu, și când e un singur plic.
    const paidWithMeal = data.settings.paymentSources.find((source) => source.id === item.sourceId)?.kind === "meal";
    const target = matched || (allocations.length === 1 && !paidWithMeal ? allocations[0] : undefined);
    if (!target) return item;
    changed = true;
    return { ...item, allocationId: target.id, updatedAt: stamp };
  });
  return changed ? { ...data, transactions } : data;
};

/**
 * Propune sume pe plicuri pentru următoarele 7 zile, din cheltuielile reale ale
 * ultimelor 7 zile. Nu modifică planul — e doar o sugestie editabilă.
 */
export const suggestWeeklyAllocationsFromCashflow = (data: AppData, asOf = isoToday()) => {
  const start = addIsoDays(asOf, -6);
  const horizonEnd = addIsoDays(asOf, 6);
  const spentByCategory = new Map<string, number>();
  for (const item of data.transactions) {
    if (item.kind !== "expense" || item.date < start || item.date > asOf) continue;
    const key = item.category || "Altele";
    spentByCategory.set(key, (spentByCategory.get(key) || 0) + item.amount);
  }
  // Scadențe din următoarele 7 zile — se adaugă pe categoria plicului potrivit.
  const dueByCategory = new Map<string, number>();
  for (const item of pendingRecurringInPlan(data)) {
    if (item.dueDate < asOf || item.dueDate > horizonEnd) continue;
    const key = item.category || "Casă & facturi";
    dueByCategory.set(key, (dueByCategory.get(key) || 0) + item.amount);
  }
  for (const debt of data.debts) {
    if (!debt.dueDate || debt.dueDate < asOf || debt.dueDate > horizonEnd) continue;
    const key = "Rate produse";
    dueByCategory.set(key, (dueByCategory.get(key) || 0) + (debt.monthly || 0));
  }
  // Obiective cu termen în orizont: ritm săptămânal necesar pe un plic „Economii” sau Altele.
  let goalsWeekly = 0;
  for (const goal of data.savings) {
    if (!goal.dueDate || goal.dueDate < asOf) continue;
    const remaining = Math.max(0, goal.target - goal.current);
    if (remaining <= 0) continue;
    const daysLeft = Math.max(1, Math.round((new Date(`${goal.dueDate}T12:00:00`).valueOf() - new Date(`${asOf}T12:00:00`).valueOf()) / 86_400_000));
    goalsWeekly += remaining / daysLeft * 7;
  }
  goalsWeekly = Math.round(goalsWeekly * 100) / 100;

  const suggestions = data.settings.salaryPlan.allocations.map((allocation) => {
    const category = allocation.category || allocation.label;
    const spent = spentByCategory.get(category) || 0;
    const dues = dueByCategory.get(category) || 0;
    const goalPart = /econom/i.test(category) || /econom/i.test(allocation.label) ? goalsWeekly : 0;
    const suggestedAmount = Math.round((spent + dues + goalPart) * 100) / 100;
    return {
      allocationId: allocation.id,
      label: allocation.label,
      category,
      currentAmount: allocation.amount,
      suggestedAmount,
      fromSpend: Math.round(spent * 100) / 100,
      fromDues: Math.round(dues * 100) / 100,
      fromGoals: Math.round(goalPart * 100) / 100,
      delta: Math.round((suggestedAmount - allocation.amount) * 100) / 100,
    };
  }).filter((item) => item.suggestedAmount > 0 || item.currentAmount > 0);
  const unallocated = Array.from(spentByCategory.entries())
    .filter(([category]) => !data.settings.salaryPlan.allocations.some((item) => (item.category || item.label) === category))
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
    .filter((item) => item.amount > 0);
  // Scadențe fără plic + obiective fără plic de economii
  for (const [category, amount] of Array.from(dueByCategory.entries())) {
    if (data.settings.salaryPlan.allocations.some((item) => (item.category || item.label) === category)) continue;
    if (amount > 0) unallocated.push({ category, amount: Math.round(amount * 100) / 100 });
  }
  if (goalsWeekly > 0 && !data.settings.salaryPlan.allocations.some((item) => /econom/i.test(item.category || "") || /econom/i.test(item.label))) {
    unallocated.push({ category: t("Economii / obiective"), amount: goalsWeekly });
  }
  return {
    asOf,
    start,
    end: horizonEnd,
    suggestions,
    unallocated,
    totalSuggested: suggestions.reduce((sum, item) => sum + item.suggestedAmount, 0),
    goalsWeekly,
  };
};

export const financialBalance = (data: AppData, start?: string, end?: string, memberId?: string) => { const entries = data.transactions.filter((item) => !isBalanceAdjustment(item) && (!start || item.date >= start) && (!end || item.date <= end) && (!memberId || item.memberId === memberId)); const income = entries.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0); const expense = entries.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0); const scopedDebts = data.debts.filter((item) => !memberId || !item.memberId || item.memberId === memberId); const scopedSavings = data.savings.filter((item) => !memberId || !item.memberId || item.memberId === memberId); const monthlyRates = scopedDebts.reduce((sum, item) => sum + item.monthly, 0); const debtRemaining = scopedDebts.reduce((sum, item) => sum + item.remaining, 0); const savingsCurrent = scopedSavings.reduce((sum, item) => sum + item.current, 0); const sources = data.settings.paymentSources.filter((source) => !memberId || !source.memberId || source.memberId === memberId); const liquidFunds = sources.reduce((sum, source) => sum + sourceBalance(data, source.id), 0); return { income, expense, cashflow: income - expense, monthlyRates, debtRemaining, savingsCurrent, liquidFunds, netLiquidPosition: liquidFunds - debtRemaining, memberId }; };

/** Recapitulare locală luni–duminică. Perspectiva unui membru include numai mișcările lui. */
export const weeklySummary = (data: AppData, asOf = isoToday(), memberId?: string) => {
  const basis = new Date(`${safeDate(asOf)}T12:00:00`); const shift = (basis.getDay() + 6) % 7; const start = new Date(basis); start.setDate(basis.getDate() - shift); const end = new Date(start); end.setDate(start.getDate() + 6); const startIso = isoDate(start); const endIso = isoDate(end);
  const transactions = data.transactions.filter((item) => !isBalanceAdjustment(item) && item.date >= startIso && item.date <= endIso && (!memberId || item.memberId === memberId)); const income = transactions.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0); const expense = transactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0); const categories = Object.entries(transactions.filter((item) => item.kind === "expense").reduce<Record<string, number>>((all, item) => ({ ...all, [item.category]: (all[item.category] || 0) + item.amount }), {})).sort(([, left], [, right]) => right - left).slice(0, 3);
  return { start: startIso, end: endIso, income, expense, cashflow: income - expense, categories, transactionCount: transactions.length, memberId };
};

/** Confirmă o plată reală de rată: scade doar datoria aleasă și înregistrează ieșirea din sursa aleasă. */
export const debtPaymentHistory = (data: AppData, debtId: string) => data.transactions.filter((item) => item.debtId === debtId).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));

export const recordDebtPayment = (data: AppData, input: { debtId: string; amount: number; sourceId: string; memberId: string; date?: string; note?: string }) => {
  const debt = data.debts.find((item) => item.id === input.debtId); const source = data.settings.paymentSources.find((item) => item.id === input.sourceId); const member = data.settings.members.find((item) => item.id === input.memberId); const amount = roundedMoney(input.amount);
  if (!debt || !source || !member || (source.memberId && source.memberId !== member.id) || amount <= 0 || (!debt.openEnded && amount > debt.remaining)) return undefined;
  const now = new Date().toISOString(); const remainingAfter = debt.openEnded ? debt.remaining : roundedMoney(debt.remaining - amount); const transaction: Transaction = { id: newId("debt-payment"), debtId: debt.id, debtRemainingAfter: remainingAfter, title: debt.openEnded ? t("Dobândă — {name}", { name: debt.name }) : remainingAfter === 0 ? t("Rată achitată integral — {name}", { name: debt.name }) : t("Rată — {name}", { name: debt.name }), amount, kind: "expense", category: "Rate produse", sourceId: source.id, source: source.name, memberId: member.id, person: member.name, date: input.date || isoToday(), note: input.note?.trim() || (debt.openEnded ? t("Plată lunară, fără dată de final.") : remainingAfter === 0 ? t("Datoria e achitată integral.") : t("Din datorie mai rămân {amount} RON.", { amount: remainingAfter.toFixed(2) })), allocationId: resolveExpenseAllocationId(data, { category: "Rate produse", memberId: member.id, sourceId: source.id }), createdAt: now, updatedAt: now };
  const next = commitLedgerEntry(data, transaction);
  if (debt.openEnded) return next;
  return { ...next, debts: next.debts.map((item) => item.id === debt.id ? { ...item, remaining: remainingAfter, updatedAt: now } : item) };
};

/**
 * Plata unei rate corectată sau ștearsă din Mișcări (sau readusă cu Anulează) mută și soldul
 * datoriei cu diferența. Plata nouă, din „Plătește rata”, schimbă singură soldul în același pas;
 * atunci nu mai atingem nimic. Doar pentru schimbările făcute pe acest telefon, nu la sync.
 */
export const adjustDebtsForLedgerEdits = (previous: AppData, next: AppData): AppData => {
  if (previous.transactions === next.transactions || !next.debts.length) return next;
  const paid = (data: AppData) => {
    const byId = new Map<string, Transaction>();
    data.transactions.forEach((item) => { if (item.debtId && item.kind === "expense") byId.set(item.id, item); });
    return byId;
  };
  const before = paid(previous);
  const after = paid(next);
  if (!before.size && !after.size) return next;
  const delta = new Map<string, number>();
  const add = (debtId: string, value: number) => delta.set(debtId, (delta.get(debtId) || 0) + value);
  before.forEach((item, id) => {
    const now = after.get(id);
    if (!now) add(item.debtId!, item.amount);
    else if (now.amount !== item.amount || now.debtId !== item.debtId) { add(item.debtId!, item.amount); add(now.debtId!, -now.amount); }
  });
  after.forEach((item, id) => { if (!before.has(id)) add(item.debtId!, -item.amount); });
  if (!Array.from(delta.values()).some((value) => Math.abs(value) >= 0.005)) return next;
  const now = new Date().toISOString();
  const previousDebt = new Map(previous.debts.map((item) => [item.id, item]));
  return {
    ...next,
    debts: next.debts.map((debt) => {
      const change = delta.get(debt.id) || 0;
      const old = previousDebt.get(debt.id);
      if (Math.abs(change) < 0.005 || !old || old.remaining !== debt.remaining || debt.openEnded) return debt;
      return { ...debt, remaining: money2(Math.max(0, debt.remaining + change)), updatedAt: now };
    }),
  };
};

/**
 * Venit neregulat (testare cu utilizatori, M6): „vreau ca banii să-mi ajungă N zile”.
 * Perioada pornește azi și ține N zile, mutându-se în fiecare zi, ca cifra zilei să fie
 * banii de acum împărțiți pe N zile, fără o dată de salariu care nu există.
 */
export const rollIncomeHorizon = (data: AppData, asOf = isoToday()): AppData => {
  const plan = data.settings.salaryPlan;
  const days = plan.horizonDays;
  if (!days) return data;
  const end = addIsoDays(asOf, days - 1);
  if (plan.periodStart === asOf && plan.nextPayday === end && !plan.earliestPayday && !plan.paydayFlexDays) return data;
  return { ...data, settings: { ...data.settings, salaryPlan: { ...plan, periodStart: asOf, nextPayday: end, earliestPayday: undefined, paydayFlexDays: 0 } } };
};

/** Prima scadență lunară care intră în perioada curentă de plan, dacă există. */
/** Prima zi `dueDay` din lună care cade în perioada activă, până la venitul tipic. */
const monthDayDueInPlan = (dueDay: number, plan: SalaryPlan, inMonth: (month: number) => boolean = () => true) => {
  const planEnd = planEndDate(plan); if (!planEnd || !(dueDay >= 1)) return undefined;
  const start = new Date(`${plan.periodStart}T12:00:00`); const end = new Date(`${planEnd}T12:00:00`);
  for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    if (!inMonth(cursor.getMonth() + 1)) continue;
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const due = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(dueDay, lastDay), 12);
    if (due >= start && due <= end) return isoDate(due);
  }
  return undefined;
};

/** Scadența cade în luna dată (1–12)? Lunar: mereu; trimestrial: din 3 în 3 luni; anual: o dată. */
export const recurringOccursInMonth = (item: Pick<RecurringPayment, "frequency" | "month">, month: number) => {
  const step = item.frequency === "quarterly" ? 3 : item.frequency === "yearly" ? 12 : 1;
  if (step === 1) return true;
  const anchor = item.month || 1;
  return (((month - anchor) % step) + step) % step === 0;
};

/** Următoarea scadență de azi încolo (până la un an), pentru plățile care nu vin lunar. */
export const recurringNextDue = (item: Pick<RecurringPayment, "dueDay" | "frequency" | "month">, asOf = isoToday()): string | undefined => {
  const today = new Date(`${asOf}T12:00:00`);
  for (let offset = 0; offset <= 12; offset += 1) {
    const cursor = new Date(today.getFullYear(), today.getMonth() + offset, 1, 12);
    if (!recurringOccursInMonth(item, cursor.getMonth() + 1)) continue;
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const due = isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(item.dueDay, lastDay), 12));
    if (due >= asOf) return due;
  }
  return undefined;
};

export const recurringDueInPlan = (item: RecurringPayment, plan: SalaryPlan) => item.active ? monthDayDueInPlan(item.dueDay, plan, (month) => recurringOccursInMonth(item, month)) : undefined;

/**
 * Scadența e plătită în perioadă: confirmată din Obligații (`recurringId`) sau notată de mână
 * („Chirie 1.800” în Notează), cu numele scadenței în titlu și suma la ±10%. Altfel aceeași
 * chirie era „Plătit” în Plicuri și „Întârziată” pe Astăzi și în Obligații.
 */
/**
 * Mișcările din perioada planului, filtrate o singură dată pe registru și perioadă. Scadențele
 * și ratele chemau `inPlanPeriod` (cu data de sfârșit refăcută) pentru fiecare mișcare, la
 * fiecare scadență: cu 5.000 de mișcări, sute de milisecunde la pornire și la „Gata”.
 */
const planWindowKey = (plan: SalaryPlan) => `${plan.periodStart}|${plan.nextPayday}|${plan.earliestPayday || ""}|${plan.paydayFlexDays ?? ""}`;
export const planPeriodTransactions = (data: AppData): Transaction[] => {
  const plan = data.settings.salaryPlan;
  return tickMemo([data.transactions], `period:${planWindowKey(plan)}`, () => {
    const start = plan.periodStart;
    const end = planCoverEndDate(plan);
    return data.transactions.filter((item) => item.date >= start && item.date <= end);
  });
};

export const recurringPaidInPlan = (data: AppData, item: RecurringPayment) => {
  const name = foldRomanian(item.name.trim());
  return planPeriodTransactions(data).some((transaction) => {
    if (transaction.recurringId) return transaction.recurringId === item.id;
    if (transaction.kind !== "expense" || transaction.debtId || name.length < 3) return false;
    const title = foldRomanian(transaction.title || "");
    const close = item.variable || item.amount <= 0 || Math.abs(transaction.amount - item.amount) <= item.amount * 0.1;
    return close && (title.includes(name) || (title.length >= 3 && name.includes(title)));
  });
};

/** Plățile programate care trebuie încă rezervate, fără a număra de două ori mișcările deja înregistrate. */
export const pendingRecurringInPlan = (data: AppData) => data.recurring.flatMap((item) => {
  const dueDate = recurringDueInPlan(item, data.settings.salaryPlan);
  const paid = recurringPaidInPlan(data, item);
  return dueDate && !paid ? [{ ...item, dueDate }] : [];
});

/**
 * Ratele la datorii care cad înainte de următorul venit și încă nu au fost plătite în perioadă.
 * Data ratei nu avansează singură după plată, așa că o dată rămasă în urmă se reia lunar pe
 * aceeași zi; o primă rată de după venit nu se rezervă acum. Fără rezerva asta, „Poți folosi azi”
 * și ghidul socoteau banii ratei drept liberi.
 */
export const pendingDebtsInPlan = (data: AppData) => {
  const plan = data.settings.salaryPlan;
  const planEnd = planEndDate(plan);
  if (!planEnd) return [];
  return data.debts.flatMap((debt) => {
    const amount = roundedMoney(Math.min(debt.monthly, debt.remaining));
    if (amount <= 0 || !debt.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(debt.dueDate) || debt.dueDate > planEnd) return [];
    const dueDate = debt.dueDate >= plan.periodStart ? debt.dueDate : monthDayDueInPlan(Number(debt.dueDate.slice(8)), plan);
    const paid = planPeriodTransactions(data).some((transaction) => transaction.debtId === debt.id);
    return dueDate && !paid ? [{ ...debt, amount, dueDate }] : [];
  });
};

/** Aceeași zi, cu `months` luni mai târziu; ziua 31 devine ultima zi a unei luni scurte. */
const shiftMonths = (iso: string, months: number) => {
  const [year, month, day] = iso.split("-").map(Number);
  const target = new Date(year, month - 1 + months, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return isoDate(new Date(target.getFullYear(), target.getMonth(), Math.min(day, last), 12));
};

/**
 * Următoarea scadență a unei rate, după plăți. `dueDate` e o zi fixă din lună care nu avansează
 * singură: fără asta, o rată confirmată rămânea „Întârziată” în Obligații pentru totdeauna.
 * Rata scadentă (cea mai recentă zi trecută, sau prima, dacă e încă în viitor) e socotită plătită
 * dacă există o plată a ei cel mult cu 20 de zile înainte; atunci urmează luna următoare.
 */
export const nextDebtDue = (data: AppData, debt: Pick<Debt, "id" | "dueDate">, today = isoToday()) => {
  if (!debt.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(debt.dueDate)) return "";
  let due = debt.dueDate;
  for (let guard = 0; guard < 600 && shiftMonths(due, 1) <= today; guard += 1) due = shiftMonths(due, 1);
  const payments = data.transactions.filter((item) => item.debtId === debt.id && item.kind === "expense");
  for (let guard = 0; guard < 24 && payments.some((item) => item.date >= addIsoDays(due, -20)); guard += 1) {
    const next = shiftMonths(due, 1);
    // O plată acoperă o singură scadență: după ea, următoarea cere o plată nouă.
    if (!payments.some((item) => item.date >= addIsoDays(next, -20))) return next;
    due = next;
  }
  return due;
};

/**
 * Membrul ale cărui bani nu sunt în aplicație: are surse proprii, dar pe ele nu s-a notat niciodată
 * nimic (sold inițial 0, nicio mișcare), iar nicio rată de-a lui n-a fost confirmată. Ratele lui nu se
 * scad din banii celorlalți: Angi nu nota, iar cei 925 de lei ai ei apăreau ca lipsă în cifra lui Alin.
 * Prima rată confirmată (din orice sursă) sau prima mișcare pe sursele lui le aduce înapoi la socoteală.
 */
export const untrackedDebtOwner = (data: AppData, memberId?: string) => {
  if (!memberId || !data.settings.members.some((member) => member.id === memberId)) return false;
  const own = data.settings.paymentSources.filter((source) => source.memberId === memberId);
  if (!own.length || own.some((source) => Math.abs(source.openingBalance || 0) >= 0.005)) return false;
  const ids = new Set(own.map((source) => source.id));
  const debtIds = new Set(data.debts.filter((debt) => debt.memberId === memberId).map((debt) => debt.id));
  return !data.transactions.some((item) => {
    // Rata ei confirmată (de oricine) din sursa ei: plătită din banii ei, tot nenotați. Nu schimbă nimic.
    if (item.debtId && item.sourceId && ids.has(item.sourceId)) return false;
    // Altă mișcare pe sursele ei: își notează banii. O rată de-a ei plătită din altă sursă: se plătește din banii comuni.
    return (item.sourceId && ids.has(item.sourceId)) || (item.debtId && debtIds.has(item.debtId));
  });
};
/** Sursele unui membru fără bani notați: soldul lor (doar rate plătite, deci minus) nu scade banii celorlalți. */
export const untrackedSourceIds = (data: AppData) => new Set(data.settings.paymentSources.filter((source) => source.memberId && untrackedDebtOwner(data, source.memberId)).map((source) => source.id));
/** Ratele ținute deoparte din banii notați; cele ale unui membru fără bani în aplicație stau separat. */
export const reservedDebtsInPlan = (data: AppData) => pendingDebtsInPlan(data).filter((debt) => !untrackedDebtOwner(data, debt.memberId));
export const debtsOutsideTrackedMoney = (data: AppData) => pendingDebtsInPlan(data).filter((debt) => untrackedDebtOwner(data, debt.memberId));

/** Tot ce trebuie ținut deoparte până la venit: scadențe recurente plus rate la datorii. */
export const scheduledInPlan = (data: AppData) =>
  pendingRecurringInPlan(data).reduce((sum, item) => sum + item.amount, 0)
  + reservedDebtsInPlan(data).reduce((sum, item) => sum + item.amount, 0);

/** Confirmă o scadență rezervată în perioada activă: adaugă mișcarea reală o singură dată, fără s-o poată dubla. */
export const confirmRecurringPayment = (data: AppData, recurringId: string, paidAmount?: number): AppData | undefined => {
  const pending = pendingRecurringInPlan(data).find((item) => item.id === recurringId);
  const item = data.recurring.find((entry) => entry.id === recurringId);
  const source = item && data.settings.paymentSources.find((entry) => entry.id === item.sourceId);
  const member = item && data.settings.members.find((entry) => entry.id === item.memberId);
  /** Fără scadență în așteptare plata este deja înregistrată în perioada activă; o a doua apăsare nu trebuie s-o dubleze. */
  if (!pending || !item || !source || !member) return undefined;
  const now = new Date().toISOString();
  // Factura merge doar în plicul care o are drept categorie principală, nu în „Cumpărături” care doar o acoperă.
  const matched = matchingAllocationsForExpense(data, { category: item.category, memberId: item.memberId, sourceId: item.sourceId }).find((allocation) => allocation.category === item.category);
  // La o sumă variabilă se înregistrează valoarea reală de pe factură, nu estimarea.
  const amount = paidAmount && paidAmount > 0 ? roundedMoney(paidAmount) : item.amount;
  const transaction: Transaction = { id: newId("recurring-tx"), recurringId: item.id, title: item.name, amount, kind: "expense", category: item.category, sourceId: source.id, source: source.name, memberId: member.id, person: member.name, date: pending.dueDate, note: t("Plată recurentă confirmată"), allocationId: matched?.id || "outside", createdAt: now, updatedAt: now };
  return commitLedgerEntry(data, transaction);
};

/** Ziua reală a scadenței într-o lună; ziua 31 devine ultima zi din februarie sau dintr-o lună scurtă. */
export const recurringDueForMonth = (item: RecurringPayment, asOf = isoToday()): string | undefined => {
  const basis = new Date(`${asOf}T12:00:00`);
  if (!recurringOccursInMonth(item, basis.getMonth() + 1)) return undefined;
  const lastDay = new Date(basis.getFullYear(), basis.getMonth() + 1, 0).getDate();
  return isoDate(new Date(basis.getFullYear(), basis.getMonth(), Math.min(item.dueDay, lastDay), 12));
};

/**
 * Generează numai plata scadentă din luna curentă, când aplicația este deschisă.
 * ID-ul determinist și verificarea recurringId+dată împiedică dublarea după reload sau sincronizare.
 */
export const autoPostDueRecurring = (data: AppData, asOf = isoToday()): AppData => {
  const additions: Transaction[] = [];
  const planEnd = planEndDate(data.settings.salaryPlan);
  data.recurring.forEach((item) => {
    if (!item.active || !item.autoPost || item.variable || item.amount <= 0) return;
    const dueDate = recurringDueInPlan(item, data.settings.salaryPlan) || (!planEnd ? recurringDueForMonth(item, asOf) : undefined);
    if (!dueDate || dueDate > asOf) return;
    if (recurringPaidInPlan(data, item)) return;
    const source = data.settings.paymentSources.find((entry) => entry.id === item.sourceId);
    const member = data.settings.members.find((entry) => entry.id === item.memberId);
    if (!source || !member) return;
    const id = `recurring-auto-${item.id}-${dueDate}`;
    const exists = data.transactions.some((transaction) => transaction.id === id || (transaction.recurringId === item.id && transaction.date === dueDate));
    // Ștearsă de om: luna asta n-a plătit-o așa. Nu o readucem la fiecare pornire.
    if (exists || data.deleted.some((entry) => entry.entity === "transactions" && entry.id === id)) return;
    const matched = matchingAllocationsForExpense(data, { category: item.category, memberId: item.memberId, sourceId: item.sourceId })[0];
    additions.push({ id, recurringId: item.id, title: item.name, amount: item.amount, kind: "expense", category: item.category, sourceId: source.id, source: source.name, memberId: member.id, person: member.name, date: dueDate, note: t("Adăugată automat din scadență recurentă"), allocationId: matched?.id || "outside", createdAt: `${asOf}T12:00:00.000Z` });
  });
  return additions.length ? additions.reduce((ledger, entry) => commitLedgerEntry(ledger, entry), data) : data;
};

/**
 * O proiecție transparentă pentru perioada activă. Nu presupune venituri viitoare
 * și nu schimbă bugetul; estimează doar efectul păstrării ritmului deja observat.
 */
export const planForecast = (data: AppData, asOf = isoToday()) => {
  const plan = data.settings.salaryPlan;
  const sourceIds = plan.sourceIds.length ? plan.sourceIds : data.settings.paymentSources.map((source) => source.id);
  const availableSources = data.settings.paymentSources.filter((source) => sourceIds.includes(source.id)).reduce((sum, source) => sum + sourceBalance(data, source.id), 0);
  const scheduled = scheduledInPlan(data);
  const prudentEnd = prudentPlanEndDate(plan);
  const endIso = prudentEnd || addIsoDays(plan.periodStart, 6);
  const clamped = asOf < plan.periodStart ? plan.periodStart : asOf > endIso ? endIso : asOf;
  const elapsedDays = Math.max(1, periodDays(plan.periodStart, clamped));
  const remainingDays = Math.max(1, periodDays(clamped, endIso));
  const spentToDate = data.transactions.filter((item) => item.kind === "expense" && item.date >= plan.periodStart && item.date <= asOf && inPlanPeriod(item.date, plan)).reduce((sum, item) => sum + item.amount, 0);
  /** Reface soldul de la începutul perioadei: cheltuielile deja înregistrate nu trebuie scăzute de două ori, o dată din sold și o dată din proiecție. */
  const budget = Math.max(0, availableSources + spentToDate);
  const paceDaily = spentToDate / elapsedDays;
  /**
   * Ritmul de zi cu zi: fără rate, facturi și scadențe confirmate. Media cu chiria inclusă
   * iese 350 lei/zi în prima săptămână și face ghidul să „certe” o familie care stă în plan.
   */
  const fixedIds = new Set(plan.allocations.filter((item) => isFixedEnvelope(plan, item)).map((item) => item.id));
  const fixedSpent = data.transactions.filter((item) => item.kind === "expense" && item.date >= plan.periodStart && item.date <= asOf && inPlanPeriod(item.date, plan) && (item.recurringId || item.debtId || (item.allocationId && fixedIds.has(item.allocationId)))).reduce((sum, item) => sum + item.amount, 0);
  const dayToDayPace = Math.max(0, spentToDate - fixedSpent) / elapsedDays;
  const projectedExpenses = paceDaily * (elapsedDays + remainingDays - 1);
  const projectedRemaining = budget - scheduled - projectedExpenses;
  const safeDaily = Math.max(0, (budget - scheduled - spentToDate) / remainingDays);
  return { budget, scheduled, spentToDate, elapsedDays, remainingDays, paceDaily, dayToDayPace, safeDaily, projectedExpenses, projectedRemaining };
};

export type NaturalSpendScenario = { raw: string; amount: number; category?: string; timing: "azi" | "mâine" | "viitor" | "nespecificat"; title: string; understood: boolean };
export type SavingSuggestion = { id: string; tone: "good" | "watch" | "risk"; title: string; detail: string; potential?: number; basis?: string; nextStep?: string };
export type BudgetQuestionAnswer = { kind: "daily-average" | "weekly-average" | "remaining-daily"; amount: number; days: number; result: number; category?: string; source: "declared" | "envelope" | "plan" };

export const foldRomanian = memoString((value: string) => value.toLocaleLowerCase("ro-RO").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

/** O singură listă de indicii, folosită și de simulatorul de scenarii, și de importul de extras. */
/** Regula de vocabular care a recunoscut textul („haine” → regula hainelor), ca să caute după ea și în titluri. */
export const categoryAliasFor = (folded: string): RegExp | undefined => categoryAliases.find(([pattern]) => pattern.test(folded))?.[0];

const categoryAliases: Array<[RegExp, string]> = [
  // Biletele de teatru, film sau concert sunt timp liber, nu transport.
  [/\bbilet\w* (la|de|pentru) (teatru|cinema|film|concert|meci|spectacol|opera)\b/, "Timp liber"],
  [/\b(taxi\w*|uber|bolt|transport|metrou|stb|ratb|cfr|benzin\w*|motorin\w*|combustibil|carburant\w*|alimentat|am alimentat|omv|mol|petrom|rompetrol|lukoil|socar|parcar\w*|bilet\w*|tren\w*|autobuz\w*|rovinet\w*|rovinie\w*|peaj\w*|autostrad\w*|itp|vulcaniz\w*|service auto|revizi\w*|spalatori\w* auto|benzinari\w*|blueair|wizz|tarom)\b/, "Transport"],
  [/\b(mancare\w*|restaurant\w*|lunch|pranz|cina|aliment\w*|cumparaturi\w*|supermarket|lidl|kaufland|carrefour|profi|auchan|penny|mega image|selgros|glovo|tazz|bolt food|patiserie|paine\w*|covrig\w*|piat[ai]|la piata|legume|fructe|carne|macelari\w*|brutari\w*|oua|pizza|shaorma|burger\w*|mcdonald\w*|kfc|comanda\w*)\b/, "Alimente"],
  // Apa de la robinet e o factură, nu o sticlă de apă: „apă canal 95” nu e Băuturi.
  [/\b(apa canal|apa si canal|apa rece|apa calda|apa nova|apavital|aquatim|intretinere\w*|internet\w*|curent\w*|gaz\w*|factur\w*)\b/, "Casă & facturi"],
  // Apa îmbuteliată are categoria ei.
  [/\b(apa minerala|apa plata|apa carbogazoasa|apa necarbogazoasa|aqua|carpatica|borsec|dorna|perla harghitei|izvorul\w*|bucovina|zizin|bilbor)\b/, "Apă"],
  [/\b(apa|suc\w*|cafea|cafele|ceai|bere|starbucks|5 to go)\b/, "Băuturi"],
  // Băuturile tari nu sunt mâncare, chiar dacă vin de la magazin: „vodca 34,88” nu intră la Alimente.
  [/\b(vodc\w*|vodk\w*|vin rosu|vin alb|vinuri|whisk\w*|coniac\w*|brandy|palinc\w*|tuic\w*|rachiu|lichior\w*|gin|rom|sampani\w*|spumant\w*|prosecco|alcool\w*|tarie|tarii|cidru)\b/, "Băuturi"],
  // Haine și încălțăminte, după articol sau după magazin.
  [/\b(haine|imbracaminte|incaltaminte|tricou\w*|bluz\w*|camas\w*|pantalon\w*|blug\w*|jeans|rochi\w*|fust\w*|geac\w*|palton\w*|hanorac\w*|pulover\w*|ciorap\w*|sosete|chilot\w*|lenjerie intima|pijama\w*|pantof\w*|tenisi|adidasi|sandal\w*|papuci|ghete|cizme|sinsay|h&m|zara|lc waikiki|reserved|deichmann|ccc|kik|takko|new yorker)\b/, "Haine"],
  // Sacoșele și garanția de ambalaj (SGR): bani mărunți la fiecare bon, ținuți separat de mâncare și separat între ele.
  [/\b(sacos\w*|punga|pungi)\b/, "Sacoșe"],
  // „…PET 2L SGR” arată doar că sticla intră în sistem; garanția e rândul cu „garanție” sau un „SGR” singur.
  [/\b(garantie\w*|ambalaj sgr)\b|^\s*sgr\s*$/, "SGR"],
  [/\b(kinder|ciocolat\w*|napolitan\w*|biscuit\w*|bomboan\w*|inghetat\w*|croissant\w*)\b/, "Dulciuri"],
  [/\b(dulce|ciocolata|prajitura|snack)\b/, "Dulciuri"],
  [/\b(factura|internet|curent|gaz|chirie|detergent|casa|enel|electrica|engie|digi|rcs|orange|vodafone|telekom|apa nova|salubr)\b/, "Casă & facturi"],
  [/\b(medic\w*|farmac\w*|doctor\w*|dentist\w*|stomatolog\w*|analize|laborator\w*|spital\w*|clinic\w*|ochelari|pastile|vitamine|sanatate|catena|help ?net|dona|sensiblu|regina maria|medlife|sanador|synevo|bioclinica)\b/, "Sănătate"],
  // Streamingul e abonament, chiar dacă e și timp liber: se plătește lunar, ca o factură.
  [/\b(abonament\w*|subscription|netflix|spotify|hbo|max|disney|youtube premium|icloud|google one|apple music)\b/, "Abonamente"],
  [/\b(film\w*|joc\w*|iesire|am iesit|in oras|concert\w*|timp liber|cinema|teatru|steam|playstation|xbox)\b/, "Timp liber"],
  // Magazinele mari care nu sunt de mâncare: „Decathlon 150” și un cadou mâncau săptămâna de mâncare.
  // Lucrurile copilului, spuse cu numele lor, nu doar cu magazinul: „10 lei jucării” nu e mâncare.
  [/\b(pepco|smyk|noriel|jumbo|scutec\w*|pampers|huggies|lapte praf|servetele umede|biberon\w*|jucari\w*|jucarie|lego|papus\w*|plusu\w*|carucior\w*|suzet\w*|hainut\w*|body bebe|pentru (copil|copii|bebe|bebelus)|la copii)\b/, "Consumabile copil"],
  [/\b(dedeman|jysk|ikea|leroy|brico\w*|hornbach|mobexpert|praktiker)\b/, "Casă & facturi"],
  [/\b(decathlon|intersport|sportisimo|piscina|sala|fitness|carti|carturesti|elefant)\b/, "Timp liber"],
  [/\b(tigar|tutun|vape)\b/, "Altele"],
  // Grădinița și școala nu sunt „consumabile copil”, iar rata la bancă nu e o „rată de produs”.
  [/\b(gradinit\w*|scoal\w*|creșa|cresa|after ?school|meditati\w*|rechizit\w*|universitat\w*|taxa scolara)\b/, "Educație"],
  [/\b(rata (la )?banca|credit|imprumut|ipotecar|bcr|brd|bt|ing|raiffeisen|cec|unicredit|garanti|leasing)\b/, "Credite"],
  [/\b(rata|rate)\b/, "Rate produse"],
  [/\b(cadou\w*|aniversar\w*|emag|altex|flanco|haine|imbracaminte|pantofi|h&m|zara|reserved|deichmann)\b/, "Altele"],
];

/** Prima regulă locală al cărei text apare în titlu/descriere (fără autosave). */
export const matchMerchantRule = (raw: string, rules: MerchantRule[] = []) => {
  const folded = foldRomanian(raw);
  return rules.find((rule) => {
    const needle = foldRomanian(rule.match || "");
    return needle.length >= 2 && folded.includes(needle);
  });
};

/** Propune o categorie dintr-o descriere liberă. Rămâne o propunere: nimic nu se salvează fără confirmare. */
export const guessCategoryFromText = (raw: string, categories: string[] = expenseCategories, rules: MerchantRule[] = []) => {
  const fromRule = matchMerchantRule(raw, rules)?.category;
  if (fromRule && (categories.includes(fromRule) || expenseCategories.includes(fromRule))) return fromRule;
  const folded = foldRomanian(raw);
  // „Apă canal” conține numele categoriei „Apă”, dar e o factură: tiparele precise vin primele.
  const precise = categoryAliases.find(([pattern]) => pattern.test(folded))?.[1];
  if (precise && (categories.includes(precise) || expenseCategories.includes(precise)) && /\bapa\b/.test(folded)) return precise;
  // „SGR” apare pe orice sticlă din sistem („Apă plată PET 2L SGR”): doar regula „garanție” o face categorie.
  return categories.find((item) => item !== "SGR" && folded.includes(foldRomanian(item))) || precise || fuzzyCategory(folded);
};

/**
 * Cuvintele scrise cu o literă greșită sau cu două inversate („benzna”, „farmaice”):
 * aceeași categorie ca scrise corect. Doar cuvinte de cel puțin 5 litere, ca „apa” să nu
 * devină „ață” și invers.
 */
const FUZZY_WORDS: Array<[string, string]> = [
  ["benzina", "Transport"], ["motorina", "Transport"], ["parcare", "Transport"], ["combustibil", "Transport"],
  ["farmacie", "Sănătate"], ["farmacia", "Sănătate"], ["medicamente", "Sănătate"], ["dentist", "Sănătate"],
  ["alimente", "Alimente"], ["mancare", "Alimente"], ["cumparaturi", "Alimente"], ["kaufland", "Alimente"], ["carrefour", "Alimente"],
  ["factura", "Casă & facturi"], ["internet", "Casă & facturi"], ["intretinere", "Casă & facturi"],
  ["abonament", "Abonamente"], ["netflix", "Abonamente"], ["spotify", "Abonamente"],
  ["scutece", "Consumabile copil"], ["pampers", "Consumabile copil"], ["jucarii", "Consumabile copil"], ["jucarie", "Consumabile copil"], ["meditatii", "Educație"], ["rechizite", "Educație"],
  ["restaurant", "Alimente"], ["cinema", "Timp liber"], ["ciocolata", "Dulciuri"],
];

/** Distanța de editare cu inversări (două litere schimbate între ele = o greșeală). */
function typoDistance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export function fuzzyCategory(folded: string) {
  for (const word of folded.split(/[^a-z]+/)) {
    if (word.length < 5) continue;
    const hit = FUZZY_WORDS.find(([known]) => Math.abs(known.length - word.length) <= 1 && typoDistance(word, known) === 1);
    if (hit) return hit[1];
  }
  return undefined;
}

/**
 * Cuvintele după care recunoaștem plicurile obișnuite, dincolo de numele lor. Categoria nu
 * ajunge: Lumină și Apă sunt amândouă „Casă & facturi”, ratele la bancă și cele fără dobândă
 * sunt amândouă „Rate produse”. Primul șablon e pe numele plicului, al doilea pe textul plății.
 */
const ENVELOPE_HINTS: Array<[RegExp, RegExp]> = [
  [/lumin|curent|electric|energie/, /\b(lumin\w*|curent\w*|enel|electrica|e\.?on energie|cez|ppc|hidroelectrica|energie)\b/],
  [/\bapa\b|apa rece|canal/, /\b(apa|apa nova|apavital|aquatim|compania de apa|raja|canal)\b/],
  [/\bgaz/, /\b(gaz|engie|distrigaz|e\.?on gaz)\b/],
  [/gradinit|cresa|scoal|after/, /\b(gradinit\w*|cresa|after ?school|scoal\w*|bona)\b/],
  [/benzin|carburant|motorin|masin|auto\b/, /\b(benzin\w*|motorin\w*|carburant\w*|omv|petrom|rompetrol|mol|lukoil|socar|gazprom|full tank)\b/],
  [/taxi|transport/, /\b(taxi|uber|bolt(?! food)|clever|star taxi|speed taxi|benzin\w*|motorin\w*|carburant\w*|omv|petrom|rompetrol|mol|lukoil|socar|gazprom)\b/],
  [/abonament|streaming/, /\b(abonament\w*|netflix|spotify|hbo|disney|youtube|icloud|google one|apple\.com)\b/],
  [/telefon|internet|mobil/, /\b(digi|rcs|orange|vodafone|telekom|internet|telefon)\b/],
  [/abonament/, /\b(digi|rcs|orange|vodafone|telekom)\b/],
  [/fara dobanda|rate magazin|rate produse/, /\b(fara dobanda|tbi|mokka|paypo|rate emag|emag rate)\b/],
  [/rate banc|credit|imprumut|\brata\b/, /\b(rata|rate banca|credit\w*|imprumut|bcr|brd|ing bank|raiffeisen|cec|garanti|unicredit)\b/],
  [/chirie/, /\bchirie\b/],
  [/neprevazut|urgent/, /\b(farmaci\w*|catena|dona|help net|sensiblu|reparat\w*|urgent\w*)\b/],
  [/mancare|aliment|cumparatur/, /\b(lidl|kaufland|carrefour|mega image|profi|penny|auchan|selgros|mancare|cumparaturi)\b/],
];

/**
 * Plicul spus de textul cheltuielii: numele plicului („taxi”, „grădiniță”) sau un furnizor
 * știut („Enel” → Lumină, „Bolt” → Taxi). Doar printre plicurile potrivite sursei și membrului.
 */
export const allocationFromText = (data: AppData, raw: string, input: { memberId?: string; sourceId?: string } = {}): BudgetAllocation | undefined => {
  const text = foldRomanian(raw || "");
  if (text.trim().length < 3) return undefined;
  const sourceFit = sourceCompatibleAllocations(data, input);
  const pool = sourceFit.filter((allocation) => envelopeFitsSourceAndMember(data, allocation, input, sourceFit));
  // Cuvinte prea generale ca să aleagă singure un plic („rate” e și la bancă, și la magazin).
  const generic = new Set(["rate", "rata", "plata", "plati", "cont", "card", "familie", "casa", "alte", "altele"]);
  const words = (value: string) => foldRomanian(value).split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !generic.has(word));
  const scored = pool
    .map((allocation) => ({ allocation, score: words(allocation.label).filter((word) => new RegExp(`\\b${word}`).test(text)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) return scored[0].allocation;
  for (const [labelPattern, textPattern] of ENVELOPE_HINTS) {
    if (!textPattern.test(text)) continue;
    const found = pool.find((allocation) => labelPattern.test(foldRomanian(allocation.label)));
    if (found) return found;
  }
  return scored[0]?.allocation;
};

/**
 * Omul a mutat plicul de mână la notare („Engie” → Gaz, nu Chirie): data viitoare aplicația
 * propune singură același plic. O regulă mai nouă pentru același text o înlocuiește pe cea veche.
 */
export const learnMerchantRule = (data: AppData, input: { match: string; category: string; allocationId?: string }): AppData => {
  const match = input.match.trim().slice(0, 80);
  if (match.length < 3) return data;
  const key = foldRomanian(match);
  const rules = data.settings.merchantRules || [];
  const same = rules.find((item) => foldRomanian(item.match) === key);
  if (same && same.allocationId === input.allocationId && same.category === input.category) return data;
  const rule: MerchantRule = { id: same?.id || newId("merchant-rule"), match, category: input.category, allocationId: input.allocationId, updatedAt: new Date().toISOString() };
  return { ...data, settings: { ...data.settings, merchantRules: [rule, ...rules.filter((item) => foldRomanian(item.match) !== key)].slice(0, 80) } };
};

/** Propune plic din reguli locale, dacă există și e încă în plan; altfel din textul plății. */
export const guessAllocationFromText = (data: AppData, raw: string) => {
  const rule = matchMerchantRule(raw, data.settings.merchantRules || []);
  if (rule?.allocationId && data.settings.salaryPlan.allocations.some((item) => item.id === rule.allocationId)) return rule.allocationId;
  return allocationFromText(data, raw)?.id;
};

/**
 * Unde cade o cheltuială din text, înainte ca omul să aleagă el.
 * „Lidl” și „Enel” își găsesc plicul. „Florăria” nu are de unde să știe, și nu mănâncă
 * săptămâna de mâncare doar fiindcă formularul pornește pe Alimente.
 */
export type SpendTarget =
  | { kind: "keep" }
  | { kind: "outside" }
  | { kind: "category"; category: string }
  | { kind: "envelope"; allocationId: string; category?: string };

export const spendTargetFromText = (data: AppData, raw: string, ctx: { memberId?: string; sourceId?: string } = {}): SpendTarget => {
  const text = raw.trim();
  if (text.length < 3) return { kind: "keep" };
  const rules = data.settings.merchantRules || [];
  const rule = matchMerchantRule(text, rules);
  const ruled = rule?.allocationId ? data.settings.salaryPlan.allocations.find((item) => item.id === rule.allocationId) : undefined;
  if (ruled) return { kind: "envelope", allocationId: ruled.id, category: ruled.category || rule?.category };
  const fromText = allocationFromText(data, text, ctx);
  if (fromText) return { kind: "envelope", allocationId: fromText.id, category: fromText.category };
  const guessed = guessCategoryFromText(text, [...expenseCategories, ...data.settings.customCategories], rules);
  if (guessed) return { kind: "category", category: guessed };
  return { kind: "outside" };
};

/**
 * Interpretează local expresii românești scurte, fără un model extern. Rezultatul
 * este doar o previzualizare de simulator; nu creează nicio tranzacție.
 */
export const parseNaturalSpendScenario = (raw: string, categories: string[] = expenseCategories): NaturalSpendScenario => {
  const folded = foldRomanian(raw.trim());
  const amountMatch = raw.match(/(?:^|\s)(\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?=\s*(?:de\s+)?(?:lei|ron|leu|pe|pentru|$))/i);
  const amount = amountMatch ? parseRomanianAmount(amountMatch[1]) : 0;
  // Aceeași alegere ca peste tot: tiparele precise, apoi numele categoriilor, apoi greșelile de tastare.
  const category = guessCategoryFromText(raw, categories);
  const timing: NaturalSpendScenario["timing"] = /\bmaine\b/.test(folded) ? "mâine" : /\b(azi|astazi)\b/.test(folded) ? "azi" : /\b(saptamana viitoare|luna viitoare|vineri|sambata|duminica|luni|marti|miercuri|joi)\b/.test(folded) ? "viitor" : "nespecificat";
  const title = category ? `cheltuială pentru ${category.toLocaleLowerCase("ro-RO")}` : "cheltuială propusă";
  return { raw, amount, category, timing, title, understood: amount > 0 };
};

/**
 * Înțelege întrebări matematice de buget înainte de simularea unei cheltuieli.
 * Nu modifică datele și nu estimează venituri sau investiții: explică strict
 * împărțirea unei limite declarate, a unui plic sau a planului deja salvat.
 */
export const answerBudgetQuestion = (raw: string, data: AppData, asOf = isoToday()): BudgetQuestionAnswer | undefined => {
  const folded = foldRomanian(raw);
  const categories = [...expenseCategories, ...data.settings.customCategories];
  const category = categories.find((item) => folded.includes(foldRomanian(item)));
  const asksDaily = /\b(pe\s+zi|zilnic|media\s+(?:pe\s+)?zi|cat[^?]{0,26}\bzi)\b/.test(folded);
  const asksWeekly = /\b(pe\s+saptamana|saptamanal|media\s+(?:pe\s+)?saptamana)\b/.test(folded);
  const asksRemaining = /\b(pana\s+la\s+(?:venit|salariu)|ramas(?:e)?\s+zile|zile\s+ramase)\b/.test(folded);
  if (!asksDaily && !asksWeekly && !asksRemaining) return undefined;
  const values = Array.from(raw.matchAll(/\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?/g)).map((match) => parseRomanianAmount(match[0])).filter((value) => value > 0);
  const matchingEnvelope = category ? data.settings.salaryPlan.allocations.filter((item) => item.category === category).sort((a, b) => allocationBudget(data, b) - allocationBudget(data, a))[0] : undefined;
  const statedAmount = values[0]; const amount = statedAmount || (matchingEnvelope ? allocationBudget(data, matchingEnvelope) : 0);
  if (asksRemaining) { const forecast = planForecast(data, asOf); const days = forecast.remainingDays; return amount > 0 ? { kind: "remaining-daily", amount, days, result: amount / Math.max(1, days), category, source: statedAmount ? "declared" : matchingEnvelope ? "envelope" : "plan" } : { kind: "remaining-daily", amount: Math.max(0, forecast.budget - forecast.spentToDate - forecast.scheduled), days, result: forecast.safeDaily, category, source: "plan" }; }
  if (!amount) return undefined;
  if (asksWeekly && !asksDaily) return { kind: "weekly-average", amount, days: 7, result: amount, category, source: statedAmount ? "declared" : "envelope" };
  const weekly = /\b(pe\s+saptamana|saptamanal|saptamana)\b/.test(folded); const monthly = /\b(pe\s+luna|lunar|luna)\b/.test(folded);
  const days = weekly ? 7 : monthly ? 30 : 1;
  return { kind: "daily-average", amount, days, result: amount / days, category, source: statedAmount ? "declared" : "envelope" };
};

/** Sugestii observabile și calculate din registru; nu recomandă investiții și nu modifică datele. */
const daysBefore = (iso: string, days: number) => { const value = new Date(`${iso}T12:00:00`); value.setDate(value.getDate() - days); return isoDate(value); };

export const savingSuggestions = (data: AppData, asOf = isoToday()): SavingSuggestion[] => {
  const forecast = planForecast(data, asOf); const plan = data.settings.salaryPlan; const balance = financialBalance(data);
  const currentExpenses = data.transactions.filter((item) => item.kind === "expense" && item.date >= plan.periodStart && item.date <= asOf && inPlanPeriod(item.date, plan));
  const spendingByCategory = Object.entries(currentExpenses.reduce<Record<string, number>>((all, item) => ({ ...all, [item.category]: (all[item.category] || 0) + item.amount }), {})).sort((a, b) => b[1] - a[1]);
  const suggestions: SavingSuggestion[] = [];
  if (balance.debtRemaining > 0 && balance.netLiquidPosition < 0) suggestions.push({ id: "net-position", tone: "risk", title: t("Datoria depășește lichiditatea actuală"), detail: t("Poziția lichidă netă este {amount} RON. Nu presupune că economiile urmărite sunt disponibile pentru cheltuieli; verifică planul și obligațiile apropiate.", { amount: Math.round(balance.netLiquidPosition) }), potential: Math.abs(balance.netLiquidPosition), basis: t("Solduri utilizabile {funds} RON − datorii rămase {debts} RON", { funds: Math.round(balance.liquidFunds), debts: Math.round(balance.debtRemaining) }), nextStep: t("Revizuiește ratele și planul") });
  const incomeLast30 = data.transactions.filter((item) => item.kind === "income" && !isBalanceAdjustment(item) && item.date >= daysBefore(asOf, 29) && item.date <= asOf).reduce((sum, item) => sum + item.amount, 0);
  if (balance.monthlyRates > 0 && incomeLast30 > 0 && balance.monthlyRates / incomeLast30 >= 0.35) { const share = Math.round(balance.monthlyRates / incomeLast30 * 100); suggestions.push({ id: "rate-pressure", tone: "watch", title: t("Ratele apasă vizibil în veniturile recente"), detail: t("Ratele declarate reprezintă {share}% din veniturile înregistrate în ultimele 30 de zile. Include-le în limita planului înainte de cheltuielile flexibile.", { share }), potential: balance.monthlyRates, basis: t("{rates} RON rate/lună din {income} RON venituri în 30 zile", { rates: Math.round(balance.monthlyRates), income: Math.round(incomeLast30) }), nextStep: t("Deschide scadențele") }); }
  if (plan.nextPayday && forecast.projectedRemaining < 0) suggestions.push({ id: "pace", tone: "risk", title: t("Ritmul actual depășește planul"), detail: t("Estimarea indică un minus de {amount} RON până la următorul venit. Orice reducere a cheltuielilor flexibile micșorează direct această diferență.", { amount: Math.round(Math.abs(forecast.projectedRemaining)) }), potential: Math.abs(forecast.projectedRemaining), basis: t("{spent} RON cheltuiți în {elapsed} zile; orizont {remaining} zile", { spent: Math.round(forecast.spentToDate), elapsed: forecast.elapsedDays, remaining: forecast.remainingDays }), nextStep: t("Compară ritmul cu planul") });
  const recentStart = daysBefore(asOf, 6); const previousStart = daysBefore(asOf, 13); const previousEnd = daysBefore(asOf, 7);
  const totalsFor = (start: string, end: string) => data.transactions.filter((item) => item.kind === "expense" && item.date >= start && item.date <= end).reduce<Record<string, number>>((all, item) => ({ ...all, [item.category]: (all[item.category] || 0) + item.amount }), {});
  const recentByCategory = totalsFor(recentStart, asOf); const previousByCategory = totalsFor(previousStart, previousEnd);
  const trend = Object.entries(recentByCategory).map(([category, amount]) => ({ category, amount, previous: previousByCategory[category] || 0 })).filter((item) => item.previous > 0 && item.amount >= item.previous * 1.25 && item.amount - item.previous >= 40).sort((a, b) => (b.amount - b.previous) - (a.amount - a.previous))[0];
  if (trend) { const increase = Math.round(trend.amount - trend.previous); suggestions.push({ id: "history-trend", tone: "watch", title: t("{category} crește față de săptămâna anterioară", { category: t(trend.category) }), detail: t("În ultimele 7 zile sunt {amount} RON, cu {increase} RON peste cele 7 zile anterioare. Compară intrările înainte de a decide dacă este un vârf punctual sau un nou ritm.", { amount: Math.round(trend.amount), increase }), potential: increase, basis: t("{from}–{to} comparat cu {previousFrom}–{previousTo}", { from: recentStart, to: asOf, previousFrom: previousStart, previousTo: previousEnd }), nextStep: t("Vezi mișcările categoriei") }); }
  const envelope = plan.allocations.filter((item) => Boolean(item.category)).map((item) => ({ item, ...allocationStatus(data, item) })).filter((item) => item.state !== "healthy").sort((a, b) => b.usage - a.usage)[0];
  if (envelope) suggestions.push({ id: "envelope", tone: envelope.state === "over" ? "risk" : "watch", title: envelope.state === "over" ? t("{label} a depășit limita", { label: envelope.item.label }) : t("{label} se apropie de limită", { label: envelope.item.label }), detail: t("{spent} RON au fost cheltuiți din limita ajustată de {budget} RON. O realocare nu mută bani între surse; schimbă numai limitele plicurilor.", { spent: Math.round(envelope.spent), budget: Math.round(envelope.budget) }), potential: Math.abs(envelope.remaining), basis: t("{percent}% utilizat în perioada planului", { percent: Math.round(envelope.usage * 100) }), nextStep: t("Vezi plicul și realocările") });
  const top = spendingByCategory[0];
  if (top && top[1] > 0) { const potential = Math.max(1, Math.round(top[1] * 0.1)); suggestions.push({ id: "category", tone: "watch", title: t("Revizuiește {category}", { category: t(top[0]) }), detail: t("Aceasta este categoria principală în perioada curentă ({amount} RON). O reducere orientativă de 10% ar păstra aproximativ {potential} RON, fără să modifice nimic automat.", { amount: Math.round(top[1]), potential }), potential, basis: t("{amount} RON din {count} cheltuieli ale planului", { amount: Math.round(top[1]), count: currentExpenses.length }), nextStep: t("Deschide jurnalul") }); }
  if (forecast.scheduled > 0) suggestions.push({ id: "reserve", tone: "watch", title: t("Păstrează rezerva pentru scadențe"), detail: t("{amount} RON sunt deja rezervați pentru scadențe și rate din acest plan. Tratează suma ca indisponibilă înainte de a face o cheltuială nouă.", { amount: Math.round(forecast.scheduled) }), potential: forecast.scheduled, basis: t("{count} scadențe active înregistrate", { count: pendingRecurringInPlan(data).length + pendingDebtsInPlan(data).length }), nextStep: t("Verifică scadențele") });
  const goal = data.savings.find((item) => item.target > item.current);
  if (goal && forecast.projectedRemaining > 0) suggestions.push({ id: "goal", tone: "good", title: t("Protejează obiectivul „{name}”", { name: goal.name }), detail: t("Planul proiectează o marjă de {amount} RON. Poți compara această marjă cu deficitul obiectivului, fără ca aplicația să mute bani automat.", { amount: Math.round(forecast.projectedRemaining) }), potential: Math.min(forecast.projectedRemaining, goal.target - goal.current), basis: t("{current} RON din ținta de {target} RON", { current: Math.round(goal.current), target: Math.round(goal.target) }), nextStep: t("Vezi obiectivul") });
  if (!suggestions.length) suggestions.push({ id: "history", tone: "good", title: t("Construiește un profil financiar observabil"), detail: t("Înregistrează câteva venituri și cheltuieli, apoi stabilește data următorului venit. Asistentul va compara istoricul, bilanțul și ritmul real fără să trimită datele către un serviciu extern."), basis: t("Încă nu există suficiente mișcări pentru o comparație personală"), nextStep: t("Adaugă prima mișcare") });
  return suggestions.slice(0, 4);
};

export type HealthScoreBreakdown = {
  /** `null` înseamnă „încă nu am din ce calcula”, nu „zero”. */
  score: number | null;
  tone: "good" | "watch" | "risk" | "unknown";
  factors: Array<{
    id: string;
    label: string;
    value: number;
    weight: number;
    detail: string;
    /** Fals când factorul nu are pe ce se sprijini; atunci nu intră în scor. */
    known: boolean;
  }>;
  /** Ce îi lipsește registrului ca scorul să însemne ceva. */
  missing: string[];
};

/**
 * Scor local 0–100 pentru ecranul Astăzi.
 * Combină marja, starea plicurilor, scadențele apropiate și ritmul de cheltuire.
 * Nu estimează venituri viitoare și nu modifică datele.
 *
 * Un factor intră în scor doar dacă are pe ce se sprijini. Altfel un registru gol
 * primea 80 din 100 și eticheta „calm”: „toate plicurile sunt în limite” și „nicio
 * scadență” sunt adevărate fără să însemne nimic atunci când nu există nici plicuri,
 * nici scadențe. Când datele cunoscute cântăresc prea puțin, scorul este `null` și
 * spunem ce lipsește, în loc să inventăm o notă de trecere.
 */
export const calculateHealthScore = (data: AppData, asOf = isoToday()): HealthScoreBreakdown => {
  const plan = data.settings.salaryPlan;
  const forecast = planForecast(data, asOf);
  const sourceIds = plan.sourceIds.length ? plan.sourceIds : data.settings.paymentSources.map((s) => s.id);
  const availableSources = data.settings.paymentSources
    .filter((s) => sourceIds.includes(s.id))
    .reduce((sum, s) => sum + sourceBalance(data, s.id), 0);

  const reserved = plan.allocations.reduce((sum, a) => sum + Math.max(0, allocationStatus(data, a).remaining), 0);
  const scheduled = scheduledInPlan(data);
  const remaining = availableSources - reserved - scheduled;
  const marginRatio = availableSources > 0 ? Math.max(0, Math.min(1, remaining / availableSources)) : (remaining >= 0 ? 0.6 : 0);
  // Marja are sens doar dacă știm ce bani există: o mișcare înregistrată sau un sold de pornire.
  const marginKnown = data.transactions.length > 0 || data.settings.paymentSources.some((item) => item.openingBalance > 0) || Object.values(data.settings.archivedNet || {}).some((value) => Math.abs(value) >= 0.005);
  const marginDetail = remaining >= 0
    ? t("{remaining} RON nerepartizați din {available} RON", { remaining: Math.round(remaining), available: Math.round(availableSources) })
    : t("Planul este peste limită cu {amount} RON", { amount: Math.round(Math.abs(remaining)) });

  const envelopes = plan.allocations.map((a) => allocationStatus(data, a));
  let envelopeScore = 1;
  if (envelopes.length) {
    const avgHealth = envelopes.reduce((sum, e) => sum + Math.max(0, 1 - e.usage), 0) / envelopes.length;
    const overPenalty = envelopes.some((e) => e.state === "over") ? 0.35 : envelopes.some((e) => e.state === "watch") ? 0.15 : 0;
    envelopeScore = Math.max(0, avgHealth - overPenalty);
  }
  const overCount = envelopes.filter((e) => e.state === "over").length;
  const watchCount = envelopes.filter((e) => e.state === "watch").length;
  const envelopeDetail = envelopes.length
    ? overCount
      ? t(overCount > 1 ? "{count} plicuri depășite" : "{count} plic depășit", { count: overCount })
      : watchCount
        ? t(watchCount > 1 ? "{count} plicuri aproape de limită" : "{count} plic aproape de limită", { count: watchCount })
        : t("Toate plicurile sunt în limite")
    : t("Nu există încă plicuri");

  const in7Days = new Date(`${asOf}T12:00:00`);
  in7Days.setDate(in7Days.getDate() + 7);
  const horizon = isoDate(in7Days);
  const upcomingRecurring = pendingRecurringInPlan(data).filter((i) => i.dueDate <= horizon);
  const upcomingDebts = data.debts.filter((d) => d.dueDate && d.dueDate >= asOf && d.dueDate <= horizon);
  const upcomingAmount = upcomingRecurring.reduce((sum, i) => sum + i.amount, 0) +
    upcomingDebts.reduce((sum, d) => sum + (d.monthly || 0), 0);
  const dueScore = upcomingAmount === 0 ? 1 : Math.max(0, 1 - Math.min(1, upcomingAmount / Math.max(1, availableSources * 0.4)));
  const upcomingCount = upcomingRecurring.length + upcomingDebts.length;
  const dueDetail = upcomingCount
    ? t(upcomingCount > 1 ? "{count} scadențe în 7 zile ({amount} RON)" : "{count} scadență în 7 zile ({amount} RON)", { count: upcomingCount, amount: Math.round(upcomingAmount) })
    : t("Nicio scadență în următoarele 7 zile");

  let paceScore = 0.7;
  let paceKnown = false;
  let paceDetail = t("Setează următorul venit pentru a calcula ritmul");
  if (plan.nextPayday || plan.earliestPayday) {
    paceKnown = true;
    if (forecast.spentToDate <= 0) {
      paceScore = 0.85;
      paceDetail = t("Încă nu există cheltuieli în perioada curentă");
    } else if (forecast.safeDaily <= 0) {
      paceScore = 0.2;
      paceDetail = t("Ritmul sigur este zero sau negativ");
    } else {
      const ratio = forecast.paceDaily / forecast.safeDaily;
      paceScore = ratio <= 0.85 ? 1 : ratio <= 1.05 ? 0.75 : ratio <= 1.3 ? 0.4 : 0.15;
      paceDetail = t("Ritm actual {pace} RON/zi vs sigur {safe} RON/zi", { pace: Math.round(forecast.paceDaily), safe: Math.round(forecast.safeDaily) });
    }
  }

  const duesKnown = data.recurring.some((item) => item.active) || data.debts.length > 0;

  const factors = [
    { id: "margin", label: t("Marjă până la venit"), value: marginRatio, weight: 0.35, known: marginKnown, detail: marginKnown ? marginDetail : t("Încă nu există mișcări sau solduri de pornire") },
    { id: "envelopes", label: t("Starea plicurilor"), value: envelopeScore, weight: 0.25, known: envelopes.length > 0, detail: envelopeDetail },
    { id: "dues", label: t("Scadențe apropiate"), value: dueScore, weight: 0.20, known: duesKnown, detail: duesKnown ? dueDetail : t("Nu urmărești încă scadențe sau datorii") },
    { id: "pace", label: t("Ritm de cheltuire"), value: paceScore, weight: 0.20, known: paceKnown, detail: paceDetail },
  ];

  const missing = [
    marginKnown ? "" : t("Adaugă o mișcare sau soldul unei surse"),
    envelopes.length ? "" : t("Creează primul plic"),
    duesKnown ? "" : t("Treci scadențele lunare sau o datorie"),
    paceKnown ? "" : t("Stabilește data următorului venit"),
  ].filter(Boolean);

  // Sub jumătate din pondere cunoscută, orice număr ar fi o presupunere.
  const knownWeight = factors.reduce((sum, f) => sum + (f.known ? f.weight : 0), 0);
  if (knownWeight < 0.5) return { score: null, tone: "unknown", factors, missing };

  const raw = factors.reduce((sum, f) => sum + (f.known ? f.value * f.weight : 0), 0) / knownWeight;
  const score = Math.round(Math.max(0, Math.min(100, raw * 100)));
  const tone: HealthScoreBreakdown["tone"] = score >= 75 ? "good" : score >= 45 ? "watch" : "risk";

  return { score, tone, factors, missing };
};
export type HealthScoreCyclePoint = {
  end: string;
  start: string;
  score: number | null;
  tone: HealthScoreBreakdown["tone"];
  label: string;
};

export type HealthScoreStory = {
  current: HealthScoreBreakdown;
  series: HealthScoreCyclePoint[];
  moved: Array<{ id: string; label: string; delta: number; detail: string }>;
};

/**
 * Povestea scorului pe cicluri salariale anterioare: serie + ce a mișcat nota.
 * Folosește lungimea ciclului curent (periodStart → nextPayday) ca pas înapoi.
 */
export const healthScoreStory = (data: AppData, asOf = isoToday(), cycles = 3): HealthScoreStory => {
  const current = calculateHealthScore(data, asOf);
  const plan = data.settings.salaryPlan;
  const payday = plan.nextPayday || plan.earliestPayday || asOf;
  const start = plan.periodStart || asOf;
  const lengthDays = Math.max(7, Math.round((new Date(`${payday}T12:00:00`).valueOf() - new Date(`${start}T12:00:00`).valueOf()) / 86_400_000)) || 28;
  const series: HealthScoreCyclePoint[] = [];
  for (let i = cycles - 1; i >= 0; i -= 1) {
    const end = addIsoDays(asOf, -i * lengthDays);
    const cycleStart = addIsoDays(end, -(lengthDays - 1));
    const snapshot: AppData = {
      ...data,
      settings: {
        ...data.settings,
        salaryPlan: {
          ...plan,
          periodStart: cycleStart,
          nextPayday: addIsoDays(end, 1),
          earliestPayday: addIsoDays(end, 1),
        },
      },
    };
    const health = calculateHealthScore(snapshot, end);
    series.push({
      end,
      start: cycleStart,
      score: health.score,
      tone: health.tone,
      label: i === 0 ? t("Ciclu curent") : t("Ciclu −{n}", { n: i }),
    });
  }
  const previous = series.length >= 2 ? series[series.length - 2] : undefined;
  const moved: HealthScoreStory["moved"] = [];
  if (previous && previous.score !== null && current.score !== null) {
    const prevHealth = calculateHealthScore({
      ...data,
      settings: {
        ...data.settings,
        salaryPlan: {
          ...plan,
          periodStart: previous.start,
          nextPayday: addIsoDays(previous.end, 1),
          earliestPayday: addIsoDays(previous.end, 1),
        },
      },
    }, previous.end);
    for (const factor of current.factors) {
      const before = prevHealth.factors.find((item) => item.id === factor.id);
      if (!before || !factor.known || !before.known) continue;
      const delta = Math.round((factor.value - before.value) * 100);
      if (Math.abs(delta) < 4) continue;
      moved.push({
        id: factor.id,
        label: factor.label,
        delta,
        detail: delta > 0
          ? t("{label} a crescut cu {delta} puncte față de ciclul anterior.", { label: factor.label, delta })
          : t("{label} a scăzut cu {delta} puncte față de ciclul anterior.", { label: factor.label, delta: Math.abs(delta) }),
      });
    }
    moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  return { current, series, moved: moved.slice(0, 3) };
};


/** Tranșele unui plic și ciclul pe săptămâni: chemate din multe locuri în aceeași randare, socotite o dată. */
export const allocationWeeksStatus = (data: AppData, allocation: BudgetAllocation): ReturnType<typeof allocationWeeksStatusUncached> =>
  tickMemo([data, allocation], `weeks:${isoToday()}`, () => allocationWeeksStatusUncached(data, allocation));

/**
 * Cât din cheltuială cade în ziua ei, într-un plic cu ritm săptămânal: tot, minus partea pentru
 * toată luna, plus felia acelei părți care revine săptămânii cumpărării. Aceeași socoteală ca tranșele.
 */
export const envelopeDayAmount = (data: AppData, item: Transaction, allocation: BudgetAllocation) => {
  const spread = spreadPart(item);
  if (spread <= 0) return item.amount;
  const weeks = allocationWeeksStatus(data, allocation);
  const index = weeks.findIndex((week) => item.date >= week.start && item.date <= week.end);
  if (index < 0) return item.amount;
  // Aceeași felie ca în tranșe: pe măsura săptămânii cumpărării.
  const weight = weeks.slice(index).reduce((sum, week) => sum + Math.max(0, week.amount), 0);
  return money2(item.amount - spread + (weight > 0 ? spread * Math.max(0, weeks[index].amount) / weight : spread / (weeks.length - index)));
};
export const planWeeklyCycle = (data: AppData): CalendarBudget | undefined => tickMemo([data], `planWeeklyCycle:${isoToday()}`, () => planWeeklyCycleUncached(data));
