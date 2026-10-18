import { findDuplicateReceipt } from "@/lib/receipt-duplicates";
import "../receipt-scan.css";
import { ReceiptScanAnimation, type RevealItem } from "@/components/ReceiptScanAnimation";
import { useEffect, useRef, useState } from "react";
import { Camera, FileText, ImagePlus, Info, Loader2, PenLine, WifiOff } from "lucide-react";
import { currentBonutPlan } from "@/lib/bonut-plan-current";
import { getActiveFamilyRoom } from "@/lib/billing";
import { FREE_SCANS_PER_MONTH, readAiQuota, readAiScans, recordAiScan, scansLeft } from "@/lib/bonut-plans";
import { isoToday } from "@/lib/finance-data";
import type { AppData } from "@/lib/finance-data";
import { t } from "@/lib/i18n";
import { askConfirm } from "@/lib/confirm-dialog";
import { canScanReceipt } from "@/lib/entitlements";
import { isOfflineOnly } from "@/lib/ui-prefs";
import { warmOcr } from "@/lib/receipt-orientation-ocr";
import { compressReceiptPhoto, RECEIPT_SHOTS_MAX, receiptCategories, receiptScanConsented, rememberReceiptScanConsent, ReceiptScanError, requestReceiptScan, scanToPrefill, warmReceiptScan, type ScanPrefill } from "@/lib/receipt-scan";

/**
 * „Scanează bonul”: poza → articolele pe categorii, în formular. Poza pleacă la
 * Google Gemini (sau Anthropic Claude, ca rezervă) doar ca să fie citită; nu o păstrăm nici pe telefon, nici pe server.
 */
export function ReceiptScanButton({ data, memberId, onResult, hub, onManual }: { data: AppData; memberId?: string; onResult: (prefill: ScanPrefill) => void; hub?: boolean; onManual?: () => void }) {
  const [tipOpen, setTipOpen] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  // Eroarea nu are voie să rămână sub marginea ecranului: altfel scanarea pare că s-a închis singură.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" }); }, [error]);
  /** Pozele ultimei încercări eșuate: „Încearcă din nou” le retrimite, fără altă poză. */
  const lastFiles = useRef<File[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [shots, setShots] = useState(1);
  /** Pozele făcute cu camera până acum: un bon de hârtie lung se fotografiază pe bucăți, apoi se citesc împreună. */
  const [pending, setPending] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [processed, setProcessed] = useState(0);
  const [store, setStore] = useState<string>();
  /** „Offline”: Tesseract pe telefon, fără AI, gratuit și nelimitat. Ales de om, fără internet sau după cele 15 scanări AI. */
  const [offline, setOffline] = useState(false);
  const offlineRef = useRef(false);
  const today = isoToday();
  // Serverul ține cota (aplicată doar cu plățile pornite); telefonul o arată pe cea primită luna asta, altfel o estimează.
  const serverQuota = readAiQuota();
  const aiLeft = serverQuota?.enforced && serverQuota.month === today.slice(0, 7)
    ? serverQuota.remaining ?? Number.POSITIVE_INFINITY
    : scansLeft(currentBonutPlan(data, today), readAiScans(), today);
  // Motorul OCR (câțiva MB) se încarcă doar când e nevoie de el: altfel concura cu poza pe rețea.
  const needOcr = aiLeft <= 0 || (typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => { const id = window.setTimeout(() => { if (needOcr) warmOcr(); warmReceiptScan(); }, 600); return () => window.clearTimeout(id); }, [needOcr]);
  const [reveal, setReveal] = useState<{ items: RevealItem[]; total: number; prefill: ScanPrefill }>();
  const thumbsRef = useRef<string[]>([]);
  thumbsRef.current = thumbs;
  useEffect(() => () => thumbsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);
  // Cronometrul citirii: omul vede că se lucrează și, când durează, de ce.
  useEffect(() => {
    if (!busy) { setSeconds(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  if (!canScanReceipt() || isOfflineOnly()) return null;
  const busyText = seconds < 12
    ? offline ? t("Citesc bonul pe telefon, fără internet… {seconds} s", { seconds }) : (shots > 1 ? t("Citesc bonul din {count} capturi… {seconds} s", { count: shots, seconds }) : t("Citesc bonul… {seconds} s", { seconds }))
    : seconds < 30
      ? t("Durează mai mult ca de obicei, serverul e aglomerat… {seconds} s", { seconds })
      : t("Durează neobișnuit de mult, încă încerc… {seconds} s", { seconds });

  const pick = async (which: "camera" | "gallery", local = false) => {
    if (busy) return;
    const noNet = typeof navigator !== "undefined" && navigator.onLine === false;
    offlineRef.current = local || noNet || aiLeft <= 0;
    if (offlineRef.current) warmOcr();
    setOffline(offlineRef.current);
    if (!offlineRef.current && !receiptScanConsented()) {
      const ok = await askConfirm(t("Ca să citească bonul, poza pleacă la un serviciu AI (Google Gemini sau Anthropic Claude), care scoate din ea produsele și sumele. Poza nu se păstrează: nici pe telefon, nici pe serverul nostru. Restul bugetului rămâne pe telefon."), { title: t("Scanarea bonului"), confirmLabel: t("Am înțeles, scanez") });
      if (!ok) return;
      rememberReceiptScanConsent();
    }
    setError(""); setErrorCode("");
    (which === "camera" ? cameraRef : galleryRef).current?.click();
  };

  // Din galerie se pot alege mai multe capturi ale aceluiași bon digital: se citesc împreună, ca un singur bon.
  const read = async (list: FileList | File[] | null | undefined) => {
    const files = Array.from(list || []).filter((file) => !file.type || file.type.startsWith("image/"));
    setPending([]);
    if (!files.length) return;
    if (files.length > RECEIPT_SHOTS_MAX) {
      setError(t("Alege cel mult {count} capturi pentru un bon.", { count: RECEIPT_SHOTS_MAX }));
      if (galleryRef.current) galleryRef.current.value = "";
      return;
    }
    lastFiles.current = files;
    setShots(files.length);
    // Poza apare imediat (EXIF aplicat de browser), apoi se înlocuiește lin cu cea pusă drept.
    // Miniaturile apar imediat (EXIF aplicat de browser); bonul virtual se construiește lângă ele.
    setThumbs((old) => { old.forEach((url) => URL.revokeObjectURL(url)); return files.map((file) => URL.createObjectURL(file)); });
    setProcessed(0);
    setStore(undefined);
    setBusy(true);
    setError("");
    try {
      const images = [];
      for (const file of files) {
        const { data: photoData, mimeType } = await compressReceiptPhoto(file, files.length > 1 ? 1800 : 2000, offlineRef.current ? "ocr" : "fast");
        images.push({ data: photoData, mimeType });
        setProcessed(images.length);
      }
      const receipt = offlineRef.current
        ? await (await import("@/lib/receipt-offline")).offlineReadReceipt(images, receiptCategories(data))
        : await requestReceiptScan(images, receiptCategories(data), { receiptCount: data.receipts.length, roomId: getActiveFamilyRoom() });
      // Serverul trimite numărătoarea adevărată; local doar dacă un server vechi n-a trimis-o.
      if (!offlineRef.current && !readAiQuota()?.at) recordAiScan(isoToday());
      const scanned = scanToPrefill(receipt, data, memberId);
      const prefill = offlineRef.current ? { ...scanned, warning: [t("Citit pe telefon, fără AI: verifică produsele și totalul înainte să salvezi."), scanned.warning].filter(Boolean).join(" ") } : scanned;
      // Bonul scanat de două ori: doar avertizare, omul decide.
      const twin = findDuplicateReceipt(data.receipts, { vendor: receipt.store, date: prefill.date, amount: prefill.amount, time: receipt.time, storeCui: receipt.storeCui });
      const dupe = twin ? t("Pare același bon cu cel din {date} ({amount} lei). Dacă e o dublură, nu-l salva.", { date: twin.date.split("-").reverse().join("."), amount: twin.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) }) : undefined;
      const final = dupe ? { ...prefill, warning: prefill.warning ? `${dupe} ${prefill.warning}` : dupe } : prefill;
      lastFiles.current = [];
      setStore(receipt.store || undefined);
      setReveal({ items: final.lines.map((line) => ({ name: line.label, amount: line.amount })), total: prefill.amount, prefill: final });
    } catch (reason) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      console.warn("[BonAI] scanare eșuată", reason);
      setErrorCode(reason instanceof ReceiptScanError ? reason.code : "");
      setError(offline ? t("Nu ai internet acum. Păstrează bonul și scanează-l din nou când revii online.") : reason instanceof Error && reason.message ? (/[ăâîșțşţĂÂÎȘȚ]/.test(reason.message) ? reason.message : t("Nu am putut citi bonul: {reason}. Mai încearcă o dată.", { reason: reason.message.slice(0, 120) })) : t("Nu am putut citi bonul acum. Mai încearcă o dată."));
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  };

  // După fiecare poză cu camera omul alege: citește acum sau mai fă una cu partea următoare a bonului.
  const addShot = (list: FileList | null | undefined) => {
    const file = Array.from(list || []).find((item) => !item.type || item.type.startsWith("image/"));
    if (cameraRef.current) cameraRef.current.value = "";
    if (file) setPending((current) => [...current, file].slice(0, RECEIPT_SHOTS_MAX));
  };

  const errorBox = error && !busy ? <div ref={errorRef} className="bf-form-error bf-scan-error" role="alert" data-testid="scan-error"><p><b>{t("Scanarea nu a reușit.")}</b> {error}</p><div className="bf-scan-check-actions">
    {lastFiles.current.length > 0 && <button type="button" className="bf-secondary" onClick={() => void read(lastFiles.current)}>{t("Încearcă din nou")}</button>}
    {lastFiles.current.length > 0 && !offlineRef.current && <button type="button" className="bf-secondary" onClick={() => { offlineRef.current = true; setOffline(true); warmOcr(); void read(lastFiles.current); }}><WifiOff size={16} aria-hidden="true" /> {errorCode === "quota" ? t("Scanează offline") : t("Citește pe telefon")}</button>}
  </div></div> : null;
  return <section className="bf-scan-receipt" aria-busy={busy}>
    {errorBox}
    {!busy && pending.length > 0 ? <div className="bf-scan-note" role="status">
      <p>{pending.length === 1 ? t("Poza e gata. Bonul e lung? Fă și o poză cu partea următoare, apoi citește-le împreună.") : t("{count} poze ale aceluiași bon. Se citesc împreună, ca un singur bon.", { count: pending.length })}</p>
      <div className="bf-scan-check-actions">
        <button type="button" className="bf-primary" onClick={() => void read(pending)}>{pending.length === 1 ? t("Citește bonul") : t("Citește bonul ({count} poze)", { count: pending.length })}</button>
        {pending.length < RECEIPT_SHOTS_MAX && <button type="button" className="bf-secondary" onClick={() => cameraRef.current?.click()}><Camera size={16} aria-hidden="true" /> {t("Mai fă o poză")}</button>}
        <button type="button" className="bf-link-button" onClick={() => setPending([])}>{t("Renunță")}</button>
      </div>
    </div> : (busy || reveal) ? <>
      {/* O singură animație montată de la poză până la rezultat: raza nu repornește la fiecare secundă. */}
      <ReceiptScanAnimation key="scan-anim" thumbs={thumbs} processed={processed} store={store} seconds={seconds} items={reveal?.items} total={reveal?.total} onDone={reveal ? () => { const done = reveal.prefill; setReveal(undefined); onResult(done); } : undefined} />
      {busy && !reveal && <p className="bf-scan-receipt-busy" role="status"><Loader2 size={18} className="bf-spin" aria-hidden="true" /> {busyText}</p>}
    </> : hub ? (() => {
      const month = today.slice(0, 7);
      const used = data.receipts.filter((receipt) => receipt.date.startsWith(month)).length;
      const free = currentBonutPlan(data, today) === "free";
      const aiUsed = readAiScans().filter((d) => d.startsWith(month)).length;
      return <div className="bn-hub">
        <span className="bn-hub-pill">{free ? t("{used}/{limit} scanări AI luna asta", { used: Math.min(aiUsed, FREE_SCANS_PER_MONTH), limit: FREE_SCANS_PER_MONTH }) : t("{used} bonuri luna asta", { used })}</span>
        {free && aiLeft <= 0 && <p className="bn-hub-note" role="note">{t("Ai folosit cele {limit} scanări AI ale lunii. Scanez în continuare gratuit pe telefon, fără AI; verifici produsele înainte de salvare.", { limit: FREE_SCANS_PER_MONTH })}</p>}
        <button type="button" className="bn-viewfinder" onClick={() => void pick("camera")}>
          <span className="bn-vf-corner is-tl" /><span className="bn-vf-corner is-tr" /><span className="bn-vf-corner is-bl" /><span className="bn-vf-corner is-br" />
          <span className="bn-vf-beam" aria-hidden="true" />
          <span className="bn-vf-copy"><Camera size={30} aria-hidden="true" /><b>{t("Scanează bonul")}</b><small>{t("Toate produsele, pe categorii")}</small></span>
        </button>
        <div className="bn-hub-tiles">
          <button type="button" className="bn-tile" onClick={() => void pick("gallery")}><ImagePlus size={22} aria-hidden="true" /><b>{t("Galerie")}</b><small>{t("una sau mai multe")}</small></button>
          <button type="button" className="bn-tile" onClick={() => void pick("gallery")}><FileText size={22} aria-hidden="true" /><b>{t("E-bon")}</b><small>{t("captură din e-mail")}</small></button>
          <button type="button" className="bn-tile" onClick={() => void pick("camera", true)}><WifiOff size={22} aria-hidden="true" /><b>{t("Offline")}</b><small>{t("gratuit, fără AI")}</small></button>
          {onManual && <button type="button" className="bn-tile" onClick={onManual}><PenLine size={22} aria-hidden="true" /><b>{t("Fără bon")}</b><small>{t("notez de mână")}</small></button>}
        </div>
        <button type="button" className="bn-tip" aria-expanded={tipOpen} onClick={() => setTipOpen((open) => !open)}><Info size={15} aria-hidden="true" /> {t("Bon lung? Fă mai multe poze")}</button>
        {tipOpen && <p className="bn-tip-pop" role="note">{t("Bon lung? Pe hârtie: mai multe poze, una după alta. Digital: alege din galerie toate capturile.")}</p>}
      </div>;
    })() : <div className="bf-scan-receipt-actions">
      <button type="button" className="bf-scan-receipt-main" onClick={() => void pick("camera")}><Camera size={18} aria-hidden="true" /><span><b>{t("Scanează bonul")}</b><small>{t("Toate produsele, pe categorii")}</small></span></button>
      <button type="button" className="bf-scan-receipt-gallery" aria-label={t("Alege din galerie poza bonului sau mai multe capturi ale lui")} title={t("Din galerie: o poză sau mai multe capturi ale aceluiași bon")} onClick={() => void pick("gallery")}><ImagePlus size={18} aria-hidden="true" /></button>
    </div>}
    {!busy && !reveal && !hub && !pending.length && <small>{t("Bon lung? Pe hârtie: mai multe poze, una după alta. Digital: alege din galerie toate capturile.")}</small>}
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => addShot(event.target.files)} />
    <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(event) => void read(event.target.files)} />
  </section>;
}
