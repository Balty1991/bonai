/** Fereastra scanerului de cod de bare: camera live pe web, ML Kit pe Android; arată mereu de ce nu merge. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { BarcodeScanError, SCAN_FAILURE_TEXT, isNative, scanNative, startWebScanner, type ScanFailure } from "@/lib/barcode-scanner";
import { t } from "@/lib/i18n";

export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: (failure?: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<ScanFailure>();
  const [native, setNative] = useState<boolean>();
  const [attempt, setAttempt] = useState(0);
  /** „Scriu cifrele”: câmp pentru cele 8–14 cifre de sub codul de bare, oriunde e deschis scanerul. */
  const [typing, setTyping] = useState(false);
  const [digits, setDigits] = useState("");
  const clean = digits.replace(/\D/g, "");
  const valid = clean.length >= 8 && clean.length <= 14;
  useEffect(() => {
    let stop: (() => void) | undefined; let live = true;
    setError(undefined);
    const fail = (e: unknown) => { if (!live) return; const reason = e instanceof BarcodeScanError ? e.reason : "failed"; if (reason === "cancelled") onClose(); else setError(reason); };
    void (async () => {
      const onPhone = await isNative().catch(() => false);
      if (!live) return; setNative(onPhone);
      if (onPhone) { try { const code = await scanNative(); if (!live) return; if (code) onCode(code); else onClose(); } catch (e) { fail(e); } return; }
      if (!video.current) return;
      try { stop = await startWebScanner(video.current, (code) => live && onCode(code)); if (!live) stop(); } catch (e) { fail(e); }
    })();
    return () => { live = false; stop?.(); };
  }, [attempt]);
  // Pe body: un părinte cu backdrop-filter ar prinde fereastra fixă în el.
  return createPortal(<div className="bn-barcode" role="dialog" aria-modal="true" aria-label={t("Scanează codul de bare")}>
    <div className="bn-barcode-top"><b>{t("Scanează codul de bare")}</b><button type="button" className="bn-barcode-x" aria-label={t("Închide")} onClick={() => onClose()}><X size={22} aria-hidden="true" /></button></div>
    {native !== true && <video ref={video} className="bn-barcode-video" playsInline muted />}
    {native !== true && !error && <div className="bn-barcode-frame" aria-hidden="true" />}
    {error ? <div className="bn-barcode-msg" role="alert"><p>{t(SCAN_FAILURE_TEXT[error])}</p><div><button type="button" className="sh-scan" onClick={() => setAttempt((n) => n + 1)}>{t("Încearcă din nou")}</button><button type="button" className="sh-link" onClick={() => setTyping(true)}>{t("Scriu cifrele")}</button></div>
      {typing && <form className="bn-barcode-digits" onSubmit={(event) => { event.preventDefault(); if (valid) onCode(clean); }}>
        <label htmlFor="bn-barcode-digits">{t("Cifrele de sub codul de bare")}</label>
        <input id="bn-barcode-digits" inputMode="numeric" autoComplete="off" autoFocus maxLength={18} placeholder="5941234567890" value={digits} onChange={(event) => setDigits(event.target.value)} />
        <button type="submit" className="sh-scan" disabled={!valid}>{t("Caută produsul")}</button>
      </form>}</div>
      : <p className="bn-barcode-hint">{native ? t("Se deschide camera…") : t("Ține codul de bare în cadru. Îl citesc singur.")}</p>}
  </div>, document.body);
}
