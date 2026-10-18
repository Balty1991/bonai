/**
 * Scanarea offline, gratuită și nelimitată: Tesseract pe telefon + regulile din receipt-text-parse.
 * Poza nu pleacă nicăieri. Rezultatul e marcat „citit pe telefon” și se verifică înainte de salvare.
 */
import { getWorker } from "./receipt-orientation-ocr";
import { parseReceiptText } from "./receipt-text-parse";
import type { ScannedReceipt } from "./receipt-scan";

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("imagine")); img.src = src; });

/** Copie gri, contrastată, cu latura mare ~2200 px: Tesseract citește mult mai bine cifrele mici ale bonului. */
export type OcrPrep = { maxSide: number; filter: string; binarize?: boolean };
/** Ales pe pozele din e2e/receipts (offline-accuracy): mai mult contrast strică cifrele subțiri. */
export const OCR_PREP: OcrPrep = { maxSide: 2000, filter: "grayscale(1)" };
/** Întinde nivelurile de gri (percentila 2 → negru, 98 → alb): bonul decolorat redevine negru pe alb. */
function stretch(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height); const px = image.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) hist[(px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8]++;
  const n = px.length / 4; let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.004) break; }
  acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.2) break; }
  if (hi - lo < 8 || (lo < 12 && hi > 243)) return;
  const k = 255 / (hi - lo);
  for (let i = 0; i < px.length; i += 4) { const g = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8; const v = Math.max(0, Math.min(255, (g - lo) * k)); px[i] = px[i + 1] = px[i + 2] = v; }
  context.putImageData(image, 0, 0);
}

/**
 * Prag adaptiv (media locală pe o fereastră, prin imagine integrală): textul decolorat sau umbrit
 * iese negru pe alb chiar dacă fundalul pozei e închis. Pixelul e negru dacă e cu `bias` sub media locală.
 */
export function adaptiveThreshold(gray: Uint8ClampedArray | Uint8Array, width: number, height: number, window = Math.max(15, Math.round(width / 24)), bias = 12): Uint8Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) { let row = 0; for (let x = 0; x < width; x++) { row += gray[y * width + x]; integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row; } }
  const out = new Uint8Array(width * height); const r = window >> 1;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(width, x + r + 1);
      const sum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
      out[y * width + x] = gray[y * width + x] < sum / ((x1 - x0) * (y1 - y0)) - bias ? 0 : 255;
    }
  }
  return out;
}

function binarize(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height); const px = image.data;
  const gray = new Uint8Array(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
  const bw = adaptiveThreshold(gray, canvas.width, canvas.height);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) px[i] = px[i + 1] = px[i + 2] = bw[j];
  context.putImageData(image, 0, 0);
}

function rotate(source: HTMLCanvasElement, degrees: 90 | 270): HTMLCanvasElement {
  const canvas = document.createElement("canvas"); canvas.width = source.height; canvas.height = source.width;
  const context = canvas.getContext("2d");
  if (context) { context.translate(canvas.width / 2, canvas.height / 2); context.rotate((degrees * Math.PI) / 180); context.drawImage(source, -source.width / 2, -source.height / 2); }
  return canvas;
}

async function prepared(photo: { data: string; mimeType: string }, prep: OcrPrep): Promise<HTMLCanvasElement> {
  const img = await loadImage(`data:${photo.mimeType};base64,${photo.data}`);
  const scale = Math.min(2.5, prep.maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (context) { context.filter = prep.filter; context.drawImage(img, 0, 0, canvas.width, canvas.height); }
  if (prep.binarize) binarize(canvas); else stretch(canvas);
  return canvas;
}

/** Textul tuturor capturilor; rândurile repetate la îmbinarea a două capturi se păstrează o singură dată. */
export async function offlineText(photos: ReadonlyArray<{ data: string; mimeType: string }>, prep: OcrPrep = OCR_PREP): Promise<string> {
  const worker = await getWorker();
  const pages: string[][] = [];
  for (const photo of photos) {
    const canvas = await prepared(photo, prep);
    let best = (await worker.recognize(canvas)).data;
    // O bucată de bon lung pare „culcată” și e întoarsă greșit: dacă textul iese slab, încearcă și culcat.
    if (best.confidence < 55) for (const degrees of [90, 270] as const) {
      const turned = rotate(canvas, degrees);
      const { data } = await worker.recognize(turned);
      turned.width = 0; turned.height = 0;
      if (data.confidence > best.confidence + 10) best = data;
    }
    canvas.width = 0; canvas.height = 0;
    pages.push(best.text.split(/\r?\n/));
  }
  return joinPages(pages).join("\n");
}

/** Lipește capturile: dacă începutul paginii următoare repetă sfârșitul celei de dinainte, suprapunerea se taie. */
export function joinPages(pages: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const out: string[] = [];
  const key = (line: string) => line.replace(/[^a-z0-9]/gi, "").toLowerCase();
  // Aceeași linie citită de două ori nu iese identic: ajunge să semene (bigrame comune ≥ 75%).
  const similar = (a: string, b: string) => {
    if (a === b) return true; if (a.length < 4 || b.length < 4) return false;
    const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
    const ga = grams(a), gb = grams(b); let common = 0;
    ga.forEach((c, g) => { common += Math.min(c, gb.get(g) || 0); });
    return (2 * common) / (a.length + b.length - 2) >= 0.75;
  };
  for (const raw of pages) {
    const page = raw.filter((line) => key(line));
    let skip = 0;
    for (let overlap = Math.min(page.length, out.length, 15); overlap > 0; overlap--) {
      const tail = out.slice(-overlap).map(key); const head = page.slice(0, overlap).map(key);
      if (tail.every((line, i) => similar(line, head[i]))) { skip = overlap; break; }
    }
    out.push(...page.slice(skip));
  }
  return out;
}

const consistent = (r: ScannedReceipt) => r.total > 0 && Math.abs(r.items.reduce((s, i) => s + i.amount, 0) - r.total) < 0.011;

/** Prima citire cu nivelurile întinse; dacă totalul nu iese din rânduri, încă una cu prag adaptiv (bon decolorat, umbrit). */
export async function offlineReadReceipt(photos: ReadonlyArray<{ data: string; mimeType: string }>, categories?: string[], prep?: OcrPrep): Promise<ScannedReceipt & { text: string }> {
  const text = await offlineText(photos, prep);
  const first = { ...parseReceiptText(text, categories), text };
  if (prep || consistent(first)) return first;
  const textB = await offlineText(photos, { ...OCR_PREP, binarize: true });
  const second = { ...parseReceiptText(textB, categories), text: textB };
  if (consistent(second)) return second;
  if (!first.total && second.total) return second;
  return first;
}
