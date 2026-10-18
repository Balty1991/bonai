import { candidateRotations, chooseByText, ocrScore, type Rotation } from "./receipt-orientation";

/**
 * OCR rapid pe o copie mică, în fiecare orientare candidată, ca să aflăm din text dacă bonul e
 * drept, cu capul în jos sau culcat. Motorul (Tesseract) se încarcă doar la nevoie; dacă nu
 * pornește la timp, întoarce undefined și poza rămâne cum e.
 */
type Worker = { recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> };
let workerPromise: Promise<Worker> | undefined;

function getWorker(): Promise<Worker> {
  workerPromise ??= import("tesseract.js").then(({ createWorker }) => createWorker("eng") as unknown as Promise<Worker>).catch((error) => { workerPromise = undefined; throw error; });
  return workerPromise;
}

function rotatedCopy(source: CanvasImageSource, width: number, height: number, rotation: Rotation, maxSide = 900): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const sideways = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.filter = "grayscale(1) contrast(1.4)";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(source, -w / 2, -h / 2, w, h);
  return canvas;
}

export async function detectRotationByText(source: CanvasImageSource, width: number, height: number, timeoutMs = 7000): Promise<Rotation | undefined> {
  const work = (async () => {
    const worker = await getWorker();
    const scores: Array<{ rotation: Rotation; score: number }> = [];
    for (const rotation of candidateRotations(width, height)) {
      const canvas = rotatedCopy(source, width, height, rotation);
      const { data } = await worker.recognize(canvas);
      canvas.width = 0;
      canvas.height = 0;
      scores.push({ rotation, score: ocrScore(data.text, data.confidence) });
    }
    return chooseByText(scores);
  })();
  const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs));
  try { return await Promise.race([work, timeout]); } catch { return undefined; }
}
