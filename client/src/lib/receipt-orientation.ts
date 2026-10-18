/**
 * Bonul pus drept înainte de citire și de animație.
 * 1) Orientarea EXIF (createImageBitmap cu imageOrientation „from-image”).
 * 2) Direcția rândurilor de text: pe un bon drept, rândurile sunt orizontale, deci profilul pe
 *    rânduri (cerneală pe fiecare linie de pixeli) alternează puternic text/spațiu, iar cel pe
 *    coloane e mult mai neted. Comparăm cele două profiluri; dacă textul curge vertical, rotim 90°.
 * 3) Între 90° și 270° (și 0° vs 180°) decide asimetria: rândurile de bon încep la marginea din
 *    stânga (nume de produs) și sunt aliniate la dreapta doar pentru preț; în plus, antetul
 *    centrat și blocul de articole stau sus, iar spațiul gol (după TOTAL) stă jos. Când semnalul e
 *    slab rămâne alegerea implicită (90° în sensul acelor de ceasornic pentru poze culcate),
 *    iar modelul primește în prompt că poza poate fi întoarsă.
 */
export type Rotation = 0 | 90 | 180 | 270;

/** Pixelii întunecați (cerneală) dintr-o imagine în tonuri de gri, prag adaptiv pe medie. */
export function inkMask(gray: ArrayLike<number>, width: number, height: number): Uint8Array {
  let sum = 0;
  for (let i = 0; i < width * height; i++) sum += gray[i];
  const threshold = (sum / Math.max(1, width * height)) * 0.72;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) mask[i] = gray[i] < threshold ? 1 : 0;
  return mask;
}

/** Cât de „în dungi” e profilul: variația medie între vecini, raportată la medie. */
function stripeScore(profile: number[]): number {
  const mean = profile.reduce((a, b) => a + b, 0) / Math.max(1, profile.length);
  if (mean <= 0) return 0;
  let diff = 0;
  for (let i = 1; i < profile.length; i++) diff += Math.abs(profile[i] - profile[i - 1]);
  return diff / Math.max(1, profile.length - 1) / mean;
}

/** Rotește masca cu 90° în sensul acelor de ceasornic. */
export function rotateMask90(mask: Uint8Array, width: number, height: number): { mask: Uint8Array; width: number; height: number } {
  const out = new Uint8Array(width * height);
  // (x, y) → (height - 1 - y, x) în imaginea nouă de lățime `height`.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[x * height + (height - 1 - y)] = mask[y * width + x];
  return { mask: out, width: height, height: width };
}

/** Semnalul „bon drept”: rânduri orizontale, text pornit din stânga, conținut mai mult sus. */
export function uprightScore(mask: Uint8Array, width: number, height: number): number {
  const rows = new Array(height).fill(0);
  const cols = new Array(width).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) { rows[y]++; cols[x]++; }
  const lines = stripeScore(rows) - stripeScore(cols);
  // Unde începe fiecare rând de text față de unde se termină: aliniere la stânga = drept.
  let starts = 0;
  let ends = 0;
  let textRows = 0;
  for (let y = 0; y < height; y++) {
    if (rows[y] < 2) continue;
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) if (mask[y * width + x]) { if (first < 0) first = x; last = x; }
    starts += first / width;
    ends += (width - 1 - last) / width;
    textRows++;
  }
  const leftAligned = textRows ? (ends - starts) / textRows : 0;
  let top = 0;
  let bottom = 0;
  for (let y = 0; y < height; y++) { if (y < height / 2) top += rows[y]; else bottom += rows[y]; }
  const topHeavy = (top - bottom) / Math.max(1, top + bottom);
  return lines * 2 + leftAligned * 0.6 + topHeavy * 0.2;
}

/** Rotația (în sensul acelor de ceasornic) care pune bonul drept. */
export function pickRotation(gray: ArrayLike<number>, width: number, height: number): Rotation {
  let current = { mask: inkMask(gray, width, height), width, height };
  const scores: Array<[Rotation, number]> = [];
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    scores.push([rotation, uprightScore(current.mask, current.width, current.height)]);
    current = rotateMask90(current.mask, current.width, current.height);
  }
  const [best] = [...scores].sort((a, b) => b[1] - a[1]);
  const base = scores[0][1];
  // Rotim doar la un semnal clar, altfel o poză deja dreaptă ar putea fi stricată.
  if (best[0] !== 0 && best[1] - base > 0.08) return best[0];
  // Poză culcată fără semnal clar: implicit 90°, ca bonul să fie măcar în portret.
  return width > height * 1.15 ? 90 : 0;
}
