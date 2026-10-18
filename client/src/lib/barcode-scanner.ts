/**
 * Scanerul de coduri de bare: ML Kit pe Android (Capacitor), camera din browser pe web
 * (BarcodeDetector unde există, altfel ZXing). Nu tace niciodată: orice eșec întoarce un motiv
 * pe care ecranul îl arată omului.
 */
import { isValidEan } from "./barcode-check";

export type ScanFailure = "denied" | "nocamera" | "unsupported" | "cancelled" | "failed";
export class BarcodeScanError extends Error { constructor(public reason: ScanFailure, message: string = reason) { super(message); } }

export const SCAN_FAILURE_TEXT: Record<ScanFailure, string> = {
  denied: "Nu am acces la cameră. Permite camera pentru BonAI din setările telefonului sau ale browserului, apoi încearcă din nou.",
  nocamera: "Nu găsesc nicio cameră pe acest dispozitiv. Scrie cifrele de sub cod.",
  unsupported: "Camera nu poate fi folosită aici. Scrie cifrele de sub cod.",
  cancelled: "",
  failed: "Scanerul nu a pornit. Încearcă din nou sau scrie cifrele de sub cod.",
};

/** Traduce o eroare getUserMedia într-un motiv. */
export function mediaFailure(error: unknown): ScanFailure {
  const name = (error as { name?: string })?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "nocamera";
  if (name === "TypeError" || name === "NotSupportedError") return "unsupported";
  return "failed";
}

/** Primul cod valid (EAN/UPC) dintr-o listă de citiri. */
export const firstValidCode = (values: ReadonlyArray<string | undefined>) => values.map((v) => (v || "").replace(/\D/g, "")).find((v) => isValidEan(v));

export async function isNative(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

/** Android: scanerul ML Kit, cu cererea de permisiune. Aruncă BarcodeScanError cu motivul. */
export async function scanNative(): Promise<string | undefined> {
  const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
  const supported = await BarcodeScanner.isSupported().then((r) => r.supported).catch(() => true);
  if (!supported) throw new BarcodeScanError("unsupported");
  let perm = await BarcodeScanner.checkPermissions().catch(() => ({ camera: "prompt" as const }));
  if (perm.camera !== "granted" && perm.camera !== "limited") perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== "granted" && perm.camera !== "limited") throw new BarcodeScanError("denied");
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE] });
    return firstValidCode(barcodes.map((b) => b.rawValue)) || barcodes[0]?.rawValue || undefined;
  } catch (error) {
    if (/cancel/i.test(String((error as Error)?.message || error))) throw new BarcodeScanError("cancelled");
    throw new BarcodeScanError("failed", String((error as Error)?.message || error));
  }
}

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };

/** Web: pornește camera în elementul video și citește coduri până la primul valid sau până la stop(). */
export async function startWebScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new BarcodeScanError("unsupported");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  } catch (error) { throw new BarcodeScanError(mediaFailure(error), String((error as Error)?.message || error)); }
  let stopped = false; let zxingStop: (() => void) | undefined;
  const stop = () => { stopped = true; zxingStop?.(); stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; };
  video.srcObject = stream; video.setAttribute("playsinline", "true"); video.muted = true;
  await video.play().catch(() => undefined);
  const found = (code: string) => { if (stopped) return; stop(); onCode(code); };
  const Native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  let detector: Detector | undefined;
  try { if (Native) detector = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }); } catch { detector = undefined; }
  if (detector) {
    const tick = async () => {
      if (stopped) return;
      try { const code = firstValidCode((await detector!.detect(video)).map((b) => b.rawValue)); if (code) return found(code); } catch { /* cadru gol */ }
      setTimeout(() => void tick(), 180);
    };
    void tick();
    return stop;
  }
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    const controls = await reader.decodeFromVideoElement(video, (result) => { const code = result && firstValidCode([result.getText()]); if (code) found(code); });
    zxingStop = () => controls.stop();
  } catch (error) { stop(); throw new BarcodeScanError("failed", String((error as Error)?.message || error)); }
  return stop;
}
