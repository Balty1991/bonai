/**
 * Scanarea bonului: poza (sau capturile unui bon digital lung) pleacă o singură dată la funcția `readReceipt` (Gemini, cu Claude ca rezervă), care
 * întoarce articolele pe categorii. Nimic nu se salvează singur: rezultatul umple
 * formularul „Adaugă mișcare”, iar omul verifică și apasă Salvează.
 */
import { consistentName, consistentStore, knownNames } from "./name-consistency";
import { storeBrand } from "./store-brand";
import { syncAiQuota, type ServerAiQuota } from "./bonut-plans";
import { expenseCategories, isoToday, type AppData, type PaymentKind } from "./finance-data";
import { t } from "./i18n";
import { pickRotation, type Rotation } from "./receipt-orientation";
import { detectRotationByText } from "./receipt-orientation-ocr";
import { productFactsOf, storeFactsOf, type ProductFacts, type StoreFacts } from "./receipt-products";

const ENDPOINT = "https://europe-central2-buget-familie-a6a0d.cloudfunctions.net/readReceipt";
const CONSENT_KEY = "buget-familie:receipt-scan-consent";

export type ScannedReceipt = {
  store: string;
  date: string | null;
  total: number;
  items: Array<{ name: string; rawName?: string; quantity: number; amount: number; discount?: number; category: string } & ProductFacts>;
  payments: Array<{ method: "cash" | "card" | "meal" | "voucher" | "other"; amount: number }>;
  confidence: "high" | "medium" | "low";
  /** Modelul care a citit bonul (Gemini sau, ca rezervă, Claude). */
  model?: string;
} & StoreFacts;

export type ScanPrefill = {
  /** Cine a citit: „gemini” de obicei, „claude” când Gemini era aglomerat. */
  readBy?: "gemini" | "claude" | "offline";
  title: string;
  amount: number;
  date?: string;
  category: string;
  /** „discount”: cât s-a scăzut pe rând; suma e deja cea plătită. */
  lines: Array<{ label: string; amount: number; category: string; discount?: number; /** Cantitatea și faptele produsului, lipite de bon la salvare. */ qty?: number; product?: ProductFacts }>;
  /** Antetul magazinului citit de pe bon. */
  store?: StoreFacts;
  /** Prima sursă (cea cu suma mai mare), dacă familia are una de felul plății. */
  sourceId?: string;
  /** A doua sursă, când bonul e plătit din două (ex. voucher SGR + numerar). */
  second?: { sourceId: string; amount: number };
  /** Reducerile de pe bon, adunate (ce s-a scăzut din prețul de raft). */
  discount: number;
  /** Ce trebuie verificat cu ochii: suma articolelor nu bate cu totalul sau poza a fost greu de citit. */
  warning?: string;
  count: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

const PAYMENT_KIND: Record<ScannedReceipt["payments"][number]["method"], PaymentKind | undefined> = {
  cash: "cash",
  card: "card",
  meal: "meal",
  voucher: "voucher",
  other: undefined,
};

/** Data de pe bon, doar dacă e plauzibilă: nu în viitor și nu mai veche de 60 de zile. */
function plausibleDate(date: string | null, today: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return undefined;
  const age = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000;
  return Number.isFinite(age) && age <= 60 ? date : undefined;
}

/**
 * Reducerile tipărite pe rând separat („Reducere -4,00”, „Discount K-Card -6,60”) vin de la model ca
 * articole cu sumă negativă. Le lipim de articolul pozitiv de deasupra (suma scade, reducerea crește),
 * ca rândurile să dea totalul și reducerea să se vadă. O reducere fără articol deasupra rămâne pe dinafară.
 */
export function foldDiscountLines<T extends { amount: number; discount?: number }>(items: ReadonlyArray<T>): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (item.amount < 0) {
      const target = out.length ? out[out.length - 1] : undefined;
      if (target && target.amount + item.amount >= -0.005) {
        // Reducerea deja trecută pe articol, dar nescăzută din sumă: o scădem, fără s-o mai adunăm o dată.
        const already = Math.abs((target.discount || 0) + item.amount) < 0.005;
        out[out.length - 1] = { ...target, amount: round(target.amount + item.amount), discount: already ? target.discount : round((target.discount || 0) - item.amount) };
      }
      continue;
    }
    out.push(item);
  }
  return out;
}

/** Ce citește modelul devine ce vede omul în formular: titlu, total, data, articolele și sursele. */
/** Rânduri de reducere după nume (REDUCERE, DISCOUNT, CUPON, PROMO, Lidl Plus, My Mega, card de fidelitate…). */
export const DISCOUNT_NAME = /^\s*(reducere|discount|disc\.?|cupon|voucher reducere|promo(ție|tie)?|ofert[aă]|economie|lidl plus|my mega|mega image card|kaufland card|carrefour card|card fidelitate|pret redus|preț redus|rabat)\b/i;

/** Un rând de reducere citit cu plus (ca un produs) devine minus: reducerea nu se plătește, se scade. */
export function signDiscountLines<T extends { name: string; amount: number }>(items: ReadonlyArray<T>): T[] {
  return items.map((item) => (item.amount > 0 && DISCOUNT_NAME.test(item.name) ? { ...item, amount: -item.amount } : item));
}

export function scanToPrefill(raw: ScannedReceipt, data: AppData, memberId?: string, today = isoToday()): ScanPrefill {
  const receipt: ScannedReceipt = { ...raw, items: signDiscountLines(raw.items) };
  const known = new Set<string>([...data.settings.customCategories, ...receiptCategories(data)]);
  const fallback = "Altele";
  // Rândurile de reducere se lipesc de articol doar dacă așa suma se apropie de total: altfel modelul
  // pusese deja reducerea pe articol și am scădea-o de două ori (regresia din 2.0.2).
  const positive = receipt.items.filter((item) => item.amount > 0);
  const folded = foldDiscountLines(receipt.items).filter((item) => item.amount > 0);
  const sumOf = (list: ReadonlyArray<{ amount: number }>) => list.reduce((sum, item) => sum + item.amount, 0);
  const useFolded = receipt.total > 0 && folded.length > 0 && Math.abs(sumOf(folded) - receipt.total) + 0.005 < Math.abs(sumOf(positive) - receipt.total);
  const names = knownNames(data);
  const lines = (useFolded ? folded : positive)
    .map((item) => ({ ...item, name: consistentName(item.name, names) }))
    .map((item) => ({
      // Cantitatea rămâne în nume („× 2”, „× 0,456 kg”), ca istoricul de prețuri să compare pe bucată sau pe kg.
      // Reducerea stă separat: suma e cea plătită, iar numele rămâne curat pentru sugestii.
      label: item.quantity && Math.abs(item.quantity - 1) > 0.0001 ? `${item.name} × ${item.quantity.toLocaleString("ro-RO", { maximumFractionDigits: 3 })}${Number.isInteger(item.quantity) ? "" : " kg"}` : item.name,
      amount: round(item.amount),
      category: known.has(item.category) ? item.category : fallback,
      ...((item.discount || 0) > 0.004 ? { discount: round(item.discount || 0) } : {}),
      ...(item.quantity && item.quantity > 0 ? { qty: item.quantity } : {}),
      ...(Object.keys(productFactsOf(item)).length ? { product: productFactsOf(item) } : {}),
    }));
  let itemsSum = round(lines.reduce((sum, line) => sum + line.amount, 0));
  const total = receipt.total > 0 ? round(receipt.total) : itemsSum;
  const spread = spreadReceiptDiscount(lines, itemsSum, total);
  if (spread) { lines.splice(0, lines.length, ...spread); itemsSum = total; }
  const byCategory = new Map<string, number>();
  for (const line of lines) byCategory.set(line.category, (byCategory.get(line.category) || 0) + line.amount);
  const category = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "Alimente";

  const sources = data.settings.paymentSources.filter((source) => source.kind !== "transfer" && !source.currency);
  const sourceFor = (method: ScannedReceipt["payments"][number]["method"], skip?: string) => {
    const kind = PAYMENT_KIND[method];
    if (!kind) return undefined;
    // Mulți își fac sursa „Voucher SGR” ca tip card: după nume e tot voucher.
    const isVoucherByName = (source: (typeof sources)[number]) => /voucher|\bsgr\b|tichet/i.test(source.name);
    const fitting = sources.filter((source) => source.id !== skip && (kind === "voucher" ? source.kind === "voucher" || isVoucherByName(source) : source.kind === kind && !(kind === "card" && isVoucherByName(source))));
    return fitting.find((source) => source.memberId === memberId) || fitting.find((source) => !source.memberId) || fitting[0];
  };
  const payments = [...receipt.payments].filter((payment) => payment.amount > 0).sort((a, b) => b.amount - a.amount);
  const first = payments[0] ? sourceFor(payments[0].method) : undefined;
  const secondSource = first && payments[1] ? sourceFor(payments[1].method, first.id) : undefined;
  const secondAmount = secondSource && payments[1] ? round(Math.min(payments[1].amount, total)) : 0;

  let warning: string | undefined;
  if (lines.length && Math.abs(itemsSum - total) > 0.05) {
    warning = t("Articolele fac {items} lei, iar totalul bonului e {total} lei. Verifică rândurile înainte să salvezi.", { items: itemsSum.toLocaleString("ro-RO", { minimumFractionDigits: 2 }), total: total.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) });
  } else if (receipt.confidence === "low") {
    warning = t("Poza a fost greu de citit. Verifică sumele cu bonul în mână.");
  }

  // Marca (Familiaro, Lidl) în locul firmei operatoare (Sales Consulting, Lidl Discount).
  const store = consistentStore(storeBrand(receipt.store.trim(), { cui: receipt.storeCui, items: receipt.items.map((item) => item.rawName || item.name || "") }).trim(), data);
  return {
    title: store ? t("Cumpărături {store}", { store }) : t("Cumpărături"),
    amount: total,
    date: plausibleDate(receipt.date, today),
    category,
    lines,
    sourceId: first?.id,
    second: secondSource && secondAmount > 0 && secondAmount < total ? { sourceId: secondSource.id, amount: secondAmount } : undefined,
    warning,
    ...(receipt.model ? { readBy: receipt.model === "offline" ? "offline" as const : receipt.model.startsWith("claude") ? "claude" as const : "gemini" as const } : {}),
    discount: round(lines.reduce((sum, line) => sum + (line.discount || 0), 0)),
    count: lines.length,
    ...(Object.keys(storeFactsOf(receipt)).length ? { store: storeFactsOf(receipt) } : {}),
  };
}

/**
 * Reducerea pe tot bonul („Reducere pentru angajați 25%”, „DISCOUNT 23,23” sub SUBTOTAL) nu ține de
 * un articol: modelul o lasă uneori pe dinafară, iar rândurile fac mai mult decât totalul (Pepco:
 * 92,90 față de 69,67). Când diferența e un procent rotund din tot bonul (5%, 10%, … 50%), o împărțim
 * pe articole, proporțional; când e exact un rând (produs gratuit), îl scade din el; altfel e mai
 * probabil un rând citit greșit și rămâne avertizarea.
 */
export function spreadReceiptDiscount<T extends { amount: number; discount?: number }>(lines: T[], itemsSum: number, total: number): T[] | undefined {
  const gap = round(itemsSum - total);
  if (!lines.length || gap <= 0.05 || total <= 0) return undefined;
  // Reducerea unui singur articol, citită dar nescăzută din preț, sau un produs dat gratis
  // („Reducere Lidl Plus / DISCOUNT 25,99” sub un Prosecco de 25,99): diferența e chiar acel rând.
  const same = (value: number) => Math.abs(value - gap) <= 0.01;
  const unsubtracted = lines.findIndex((line) => same(line.discount || 0) && line.amount >= gap - 0.01);
  const free = unsubtracted >= 0 ? unsubtracted : lines.map((line) => same(line.amount)).lastIndexOf(true);
  if (free >= 0) return lines.map((line, index) => index !== free ? line : { ...line, amount: round(Math.max(0, line.amount - gap)), discount: round(Math.max(line.discount || 0, gap)) });
  const percent = (gap / itemsSum) * 100;
  const nearest = Math.round(percent / 5) * 5;
  if (nearest < 5 || nearest > 50 || Math.abs(percent - nearest) > 0.15) return undefined;
  const spread = lines.map((line) => {
    const cut = round((line.amount * gap) / itemsSum);
    return { ...line, amount: round(line.amount - cut), discount: round((line.discount || 0) + cut) };
  });
  // Bănuții din rotunjire merg pe rândul cel mai mare, ca rândurile să dea exact totalul.
  const drift = round(total - spread.reduce((sum, line) => sum + line.amount, 0));
  if (Math.abs(drift) >= 0.005) {
    const biggest = spread.reduce((best, line, index) => line.amount > spread[best].amount ? index : best, 0);
    spread[biggest] = { ...spread[biggest], amount: round(spread[biggest].amount + drift), discount: round((spread[biggest].discount || 0) - drift) };
  }
  return spread;
}

/** Categoriile pe care le primește modelul: ale aplicației și cele create de familie. */
export function receiptCategories(data: AppData): string[] {
  // Ratele și creditele nu apar pe bonuri de cumpărături.
  const base = expenseCategories.filter((item) => item !== "Credite" && item !== "Rate produse" && item !== "Comisioane bancare");
  return Array.from(new Set([...base, ...data.settings.customCategories])).slice(0, 40);
}

/** Poza decodată cu orientarea EXIF aplicată (telefonul salvează des poza „culcată” plus o etichetă). */
async function decodeReceiptPhoto(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* format necunoscut pentru createImageBitmap: încercăm cu <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(t("Poza nu s-a putut deschide.")));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rotația care pune bonul drept, după o mostră mică în tonuri de gri (câteva milisecunde). */
function detectRotation(source: CanvasImageSource, width: number, height: number): Rotation {
  try {
    const scale = Math.min(1, 240 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return width > height ? 90 : 0;
    context.drawImage(source, 0, 0, w, h);
    const rgba = context.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
    canvas.width = 0;
    canvas.height = 0;
    return pickRotation(gray, w, h);
  } catch {
    return width > height ? 90 : 0;
  }
}

const yieldToFrame = () => new Promise<void>((resolve) => { if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(resolve, 0)); else setTimeout(resolve, 0); });

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") { resolve(canvas.toDataURL("image/jpeg", quality)); return; }
    canvas.toBlob((blob) => {
      if (!blob) { resolve(canvas.toDataURL("image/jpeg", quality)); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error(t("Poza nu s-a putut pregăti.")));
      reader.readAsDataURL(blob);
    }, "image/jpeg", quality);
  });
}

/** Poza micșorată pe telefon și pusă drept: bonul rămâne lizibil, dar pleacă repede și costă puțin. */
export async function compressReceiptPhoto(file: File, maxSide = 2000, orient: "fast" | "ocr" = "fast"): Promise<{ data: string; mimeType: string; rotation: Rotation; preview?: string }> {
  const image = await decodeReceiptPhoto(file);
  try {
    // „ocr” (scanarea pe telefon): orientarea după text, Tesseract cere bonul drept. „fast” (AI): fără OCR —
    // modelul citește și bonul răsturnat (verificat pe bonurile de test la 180°), iar OCR-ul costa 2–3 s pe telefon.
    // Poza culcată se îndreaptă tot după pixeli, în câteva milisecunde.
    const byText = orient === "ocr" ? await detectRotationByText(image.source, image.width, image.height) : undefined;
    await yieldToFrame();
    const rotation = byText ?? (image.width > image.height ? detectRotation(image.source, image.width, image.height) : 0);
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const w = Math.max(1, Math.round(image.width * scale));
    const h = Math.max(1, Math.round(image.height * scale));
    const sideways = rotation === 90 || rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = sideways ? h : w;
    canvas.height = sideways ? w : h;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t("Poza nu s-a putut pregăti."));
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(image.source, -w / 2, -h / 2, w, h);
    // Codarea JPEG asincronă (toBlob + FileReader), nu toDataURL: firul principal rămâne liber, animația nu sacadează.
    await yieldToFrame();
    const dataUrl = await canvasToJpegDataUrl(canvas, 0.85);
    canvas.width = 0;
    canvas.height = 0;
    return { data: dataUrl.replace(/^data:[^,]+,/, ""), mimeType: "image/jpeg", rotation };
  } finally {
    image.close();
  }
}

/** Câte capturi primește un singur bon digital (lung, cu ecranul derulat). */
export const RECEIPT_SHOTS_MAX = 6;

let warmed = 0;
/**
 * La deschiderea centrului de scanare: trezește funcția (un OPTIONS de 204, fără AI, fără cost) și
 * pregătește identitatea și App Check, ca poza să nu aștepte pornirea la rece (~4 s) și tokenii.
 */
export function warmReceiptScan() {
  if (Date.now() - warmed < 5 * 60_000 || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
  warmed = Date.now();
  // GET fără CORS: trezește instanța fără preflight (OPTIONS cerut din fetch dădea eroare CORS în consolă).
  void fetch(ENDPOINT, { method: "GET", mode: "no-cors" }).catch(() => undefined);
  void import("./realtime-sync").then(({ appCheckHeader, authHeader }) => Promise.all([appCheckHeader(), authHeader()])).catch(() => undefined);
}

/** O poză sau capturile aceluiași bon, în ordinea în care le-a ales omul. */
export class AiQuotaError extends Error { readonly code = "ai_quota"; }

/** Eroarea scanării, cu codul serverului (ex. „quota”, „app_check”), ca ecranul să ofere drumul potrivit. */
export class ReceiptScanError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "ReceiptScanError"; }
}

/** Mesajul pentru om, mereu în română: unele răspunsuri tehnice ale serverului sunt în engleză. */
export function receiptErrorText(error: string | undefined, code: string | undefined, status: number): string {
  if (code === "app_check") return t("Telefonul nu a putut fi verificat de server. Închide aplicația, deschide-o din nou și mai încearcă.");
  if (code === "quota" && error) return error;
  if (status === 403) return t("Serverul a refuzat cererea de la această adresă. Deschide aplicația din nou și mai încearcă.");
  if (status === 405) return t("Cerere greșită către server. Actualizează aplicația și mai încearcă.");
  if (error && /[ăâîșțşţĂÂÎȘȚ]/.test(error)) return error;
  if (status === 429) return t("Ai scanat multe bonuri azi. Mâine poți scana din nou; până atunci folosește „Offline”.");
  return t("Nu am putut citi bonul acum. Mai încearcă o dată.");
}

export async function requestReceiptScan(images: Array<{ data: string; mimeType: string }>, categories: string[], context: { receiptCount?: number; roomId?: string } = {}): Promise<ScannedReceipt> {
  // Firebase se încarcă abia la prima scanare, nu odată cu formularul.
  const { appCheckHeader, authHeader, freshAuthHeader } = await import("./realtime-sync");
  // Verificarea aplicației poate rămâne agățată fără rețea bună; după 8 s cererea pleacă oricum.
  const capped = <T,>(work: Promise<T>) => Promise.race([work, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 8_000))]);
  const t0 = performance.now();
  const [token, quick] = await Promise.all([capped(appCheckHeader()), capped(authHeader())]);
  // Scanarea cere identitatea anonimă: la primul pornit al aplicației o așteptăm, nu trimitem fără ea.
  const identity = quick || await freshAuthHeader();
  const t1 = performance.now();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["X-Firebase-AppCheck"] = token;
  if (identity) headers.Authorization = identity;
  const body = JSON.stringify({ ...(images.length === 1 ? { image: images[0].data, mimeType: images[0].mimeType } : { images }), categories, receiptCount: context.receiptCount ?? 0, ...(context.roomId ? { roomId: context.roomId } : {}) });
  const send = (limit = images.length > 1 ? 120_000 : 95_000) => fetch(ENDPOINT, { method: "POST", headers, body, signal: AbortSignal.timeout(limit) });
  let response: Response;
  try {
    // Un bon se citește de obicei în 3–6 s; serverul pornește singur a doua cale după câteva secunde.
    // Nu mai retrimitem poza după 15 s: prima citire continua pe server degeaba, iar a doua o lua de la
    // zero, așa că 18 s deveneau 35–40. O singură retrimitere doar dacă cererea chiar a atârnat (ex.
    // funcția tocmai se republica).
    const hang = images.length > 1 ? 75_000 : 60_000;
    try {
      response = await send(hang);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "TimeoutError")) throw error;
      console.info("[BonAI] scanare: fără răspuns în", hang, "ms, reîncerc o dată");
      response = await send();
    }
    // În fereastra de publicare a funcției, Cloud Run poate răspunde 502/503/504 fără corp: o reîncercare, după o clipă.
    if ([502, 503, 504].includes(response.status) && !(await response.clone().json().catch(() => ({})) as { code?: string }).code) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      response = await send();
    }
    // Token expirat sau identitate încă neconfirmată: o singură reîncercare automată, cu token proaspăt.
    if (response.status === 401 && (await response.clone().json().catch(() => ({})) as { code?: string }).code === "identity") {
      const again = await freshAuthHeader(true);
      if (again) {
        headers.Authorization = again;
        response = await send();
      }
    }
  } catch {
    throw new Error(t("Nu am putut trimite poza. Verifică internetul și mai încearcă o dată."));
  }
  const payload = await response.json().catch(() => ({})) as { receipt?: ScannedReceipt & { trail?: string; usage?: { in: number; out: number } }; error?: string; reason?: string; code?: string; quota?: ServerAiQuota };
  if (payload.quota) syncAiQuota(payload.quota);
  if (payload.code === "ai_quota") throw new AiQuotaError(payload.error || t("Ai folosit scanările AI ale lunii. Scanează gratuit cu „Offline”."));
  // Unde se duce timpul: tokenii pe telefon, apoi drumul + modelul (fără conținutul bonului).
  console.info("[BonAI] scanare", JSON.stringify({ tokensMs: Math.round(t1 - t0), serverMs: Math.round(performance.now() - t1), trail: payload.receipt?.trail, usage: payload.receipt?.usage }));
  if (!response.ok || !payload.receipt) {
    // Codul tehnic, scurt, ca omul să-l poată trimite când citirea nu merge.
    const code = payload.reason ? ` (${payload.reason})` : !response.ok ? ` (HTTP ${response.status})` : "";
    throw new ReceiptScanError(`${receiptErrorText(payload.error, payload.code, response.status)}${code}`, payload.code || `http_${response.status}`);
  }
  return payload.receipt;
}

export function receiptScanConsented(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; }
}

export function rememberReceiptScanConsent() {
  try { localStorage.setItem(CONSENT_KEY, "1"); } catch { /* fără stocare: întrebăm din nou data viitoare */ }
}
