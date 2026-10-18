/**
 * Scanarea offline, gratuită și nelimitată: Tesseract pe telefon + regulile din receipt-text-parse.
 * Poza nu pleacă nicăieri. Rezultatul e marcat „citit pe telefon” și se verifică înainte de salvare.
 */
import { getWorker } from "./receipt-orientation-ocr";
import { parseReceiptText } from "./receipt-text-parse";
import type { ScannedReceipt } from "./receipt-scan";

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("imagine")); img.src = src; });

/** Copie gri, contrastată, cu latura mare ~2200 px: Tesseract citește mult mai bine cifrele mici ale bonului. */
export type OcrPrep = { maxSide: number; filter: string };
/** Ales pe pozele din e2e/receipts (offline-accuracy): mai mult contrast strică cifrele subțiri. */
export const OCR_PREP: OcrPrep = { maxSide: 2000, filter: "grayscale(1)" };
async function prepared(photo: { data: string; mimeType: string }, prep: OcrPrep): Promise<HTMLCanvasElement> {
  const img = await loadImage(`data:${photo.mimeType};base64,${photo.data}`);
  const scale = Math.min(2.5, prep.maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (context) { context.filter = prep.filter; context.drawImage(img, 0, 0, canvas.width, canvas.height); }
  return canvas;
}

/** Textul tuturor capturilor; rândurile repetate la îmbinarea a două capturi se păstrează o singură dată. */
export async function offlineText(photos: ReadonlyArray<{ data: string; mimeType: string }>, prep: OcrPrep = OCR_PREP): Promise<string> {
  const worker = await getWorker();
  const pages: string[][] = [];
  for (const photo of photos) {
    const canvas = await prepared(photo, prep);
    const { data } = await worker.recognize(canvas);
    canvas.width = 0; canvas.height = 0;
    pages.push(data.text.split(/\r?\n/));
  }
  return joinPages(pages).join("\n");
}

/** Lipește capturile: dacă începutul paginii următoare repetă sfârșitul celei de dinainte, suprapunerea se taie. */
export function joinPages(pages: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const out: string[] = [];
  const key = (line: string) => line.replace(/\s+/g, "").toLowerCase();
  for (const page of pages) {
    let skip = 0;
    for (let overlap = Math.min(page.length, out.length, 12); overlap > 0; overlap--) {
      const tail = out.slice(-overlap).map(key).join("|"); const head = page.slice(0, overlap).map(key).join("|");
      if (tail && tail === head) { skip = overlap; break; }
    }
    out.push(...page.slice(skip));
  }
  return out;
}

export async function offlineReadReceipt(photos: ReadonlyArray<{ data: string; mimeType: string }>, categories?: string[], prep?: OcrPrep): Promise<ScannedReceipt & { text: string }> {
  const text = await offlineText(photos, prep);
  return { ...parseReceiptText(text, categories), text };
}
