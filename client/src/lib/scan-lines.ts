export type TextBand = { top: number; height: number; left: number; width: number };

/**
 * Rândurile de text ale bonului, din proiecția orizontală a unei copii mici în tonuri de gri:
 * rândurile cu mulți pixeli închiși la culoare sunt text. Totul în fracții 0..1 din poză.
 */
export function detectTextBands(gray: Uint8Array, w: number, h: number, max = 40): TextBand[] {
  if (!w || !h) return [];
  // Hârtia e partea luminoasă: coloanele mai deschise decât media; textul e ce e închis pe ea.
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  const cols = new Float32Array(w);
  for (let x = 0; x < w; x++) { let c = 0; for (let y = 0; y < h; y++) c += gray[y * w + x]; cols[x] = c / h; }
  let x0 = 0; let x1 = w - 1;
  while (x0 < w - 1 && cols[x0] < mean) x0++;
  while (x1 > x0 && cols[x1] < mean) x1--;
  if (x1 - x0 < w * 0.2) { x0 = 0; x1 = w - 1; }
  let paperSum = 0; let paperN = 0;
  for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x++) { const v = gray[y * w + x]; if (v >= mean) { paperSum += v; paperN++; } }
  const paper = paperN ? paperSum / paperN : mean;
  const threshold = paper * 0.72;
  const span = x1 - x0 + 1;
  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) { let dark = 0; for (let x = x0; x <= x1; x++) if (gray[y * w + x] < threshold) dark++; rows[y] = dark / span; }
  const on = (y: number) => rows[y] > 0.03 && rows[y] < 0.55;
  const bands: TextBand[] = [];
  let y = 0;
  while (y < h) {
    if (!on(y)) { y++; continue; }
    const runStart = y;
    while (y < h && on(y)) y++;
    for (const [start, end] of splitRun(rows, runStart, y, Math.max(3, h * 0.012))) {
    if (end - start < Math.max(2, h * 0.004)) continue;
    let minX = w; let maxX = 0;
    for (let yy = start; yy < end; yy++) for (let x = x0; x <= x1; x++) if (gray[yy * w + x] < threshold) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    if (maxX - minX < span * 0.08) continue;
    bands.push({ top: start / h, height: (end - start) / h, left: minX / w, width: (maxX - minX + 1) / w });
    }
  }
  if (bands.length <= max) return bands;
  const step = bands.length / max;
  return Array.from({ length: max }, (_, i) => bands[Math.floor(i * step)]);
}

/** Aceleași rânduri, citite dintr-o poză (copie de cel mult 220 px, câteva milisecunde). */
export async function textBandsFromImage(src: string): Promise<{ bands: TextBand[]; ratio: number }> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = reject; el.src = src; });
  const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(1, Math.round(image.naturalWidth * scale)); const h = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { bands: [], ratio };
  context.drawImage(image, 0, 0, w, h);
  const rgba = context.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
  canvas.width = 0; canvas.height = 0;
  return { bands: detectTextBands(gray, w, h), ratio };
}

/** Rândurile lipite (spațiu mic între ele) se despart la cel mai „gol” rând din interior. */
function splitRun(rows: Float32Array, start: number, end: number, lineHeight: number): Array<[number, number]> {
  if (end - start <= lineHeight * 2.2) return [[start, end]];
  let avg = 0;
  for (let y = start; y < end; y++) avg += rows[y];
  avg /= end - start;
  let best = -1; let bestValue = Infinity;
  const pad = Math.max(1, Math.floor(lineHeight * 0.6));
  for (let y = start + pad; y < end - pad; y++) if (rows[y] < bestValue) { bestValue = rows[y]; best = y; }
  if (best < 0 || bestValue > avg * 0.75) return [[start, end]];
  return [...splitRun(rows, start, best, lineHeight), ...splitRun(rows, best + 1, end, lineHeight)];
}
