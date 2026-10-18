import { findDuplicateReceipt } from "@/lib/receipt-duplicates";
import "../receipt-scan.css";
import { ReceiptScanAnimation, type RevealItem } from "@/components/ReceiptScanAnimation";
import { useEffect, useRef, useState } from "react";
import { Camera, FileText, ImagePlus, Info, Loader2, PenLine } from "lucide-react";
import { currentBonutPlan } from "@/lib/bonut-plan-current";
import { FREE_SCANS_PER_MONTH } from "@/lib/bonut-plans";
import { isoToday } from "@/lib/finance-data";
import type { AppData } from "@/lib/finance-data";
import { t } from "@/lib/i18n";
import { askConfirm } from "@/lib/confirm-dialog";
import { canScanReceipt } from "@/lib/entitlements";
import { isOfflineOnly } from "@/lib/ui-prefs";
import { warmOcr } from "@/lib/receipt-orientation-ocr";
import { signDiscountLines, compressReceiptPhoto, RECEIPT_SHOTS_MAX, receiptCategories, receiptScanConsented, rememberReceiptScanConsent, requestReceiptScan, scanToPrefill, type ScanPrefill } from "@/lib/receipt-scan";

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
  const [seconds, setSeconds] = useState(0);
  const [shots, setShots] = useState(1);
  /** Pozele făcute cu camera până acum: un bon de hârtie lung se fotografiază pe bucăți, apoi se citesc împreună. */
  const [pending, setPending] = useState<File[]>([]);
  const [photo, setPhoto] = useState<string>();
  const [textLines, setTextLines] = useState<string[]>();
  useEffect(() => { const id = window.setTimeout(warmOcr, 600); return () => window.clearTimeout(id); }, []);
  const [reveal, setReveal] = useState<{ items: RevealItem[]; total: number; prefill: ScanPrefill }>();
  useEffect(() => () => { if (photo?.startsWith("blob:")) URL.revokeObjectURL(photo); }, [photo]);
  // Cronometrul citirii: omul vede că se lucrează și, când durează, de ce.
  useEffect(() => {
    if (!busy) { setSeconds(0); return; }
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  if (!canScanReceipt() || isOfflineOnly()) return null;
  const busyText = seconds < 12
    ? (shots > 1 ? t("Citesc bonul din {count} capturi… {seconds} s", { count: shots, seconds }) : t("Citesc bonul… {seconds} s", { seconds }))
    : seconds < 30
      ? t("Durează mai mult ca de obicei, serverul e aglomerat… {seconds} s", { seconds })
      : t("Serverul principal nu răspunde, citește rezerva (Claude)… {seconds} s", { seconds });

  const pick = async (which: "camera" | "gallery") => {
    if (busy) return;
    if (!receiptScanConsented()) {
      const ok = await askConfirm(t("Ca să citească bonul, poza pleacă la un serviciu AI (Google Gemini sau Anthropic Claude), care scoate din ea produsele și sumele. Poza nu se păstrează: nici pe telefon, nici pe serverul nostru. Restul bugetului rămâne pe telefon."), { title: t("Scanarea bonului"), confirmLabel: t("Am înțeles, scanez") });
      if (!ok) return;
      rememberReceiptScanConsent();
    }
    setError("");
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
    setShots(files.length);
    // Poza apare imediat (EXIF aplicat de browser), apoi se înlocuiește lin cu cea pusă drept.
    const raw = URL.createObjectURL(files[0]);
    setPhoto(raw);
    setTextLines(undefined);
    setBusy(true);
    setError("");
    try {
      const images = [];
      for (const file of files) {
        const { preview, data: photoData, mimeType, textLines: lines } = await compressReceiptPhoto(file, files.length > 1 ? 1800 : 2000);
        if (!images.length && preview) { setPhoto(preview); window.setTimeout(() => URL.revokeObjectURL(raw), 1000); if (lines?.length) setTextLines(lines); }
        images.push({ data: photoData, mimeType });
      }
      const receipt = await requestReceiptScan(images, receiptCategories(data));
      const prefill = scanToPrefill(receipt, data, memberId);
      // Bonul scanat de două ori: doar avertizare, omul decide.
      const twin = findDuplicateReceipt(data.receipts, { vendor: receipt.store, date: prefill.date, amount: prefill.amount, time: receipt.time, storeCui: receipt.storeCui });
      const dupe = twin ? t("Pare același bon cu cel din {date} ({amount} lei). Dacă e o dublură, nu-l salva.", { date: twin.date.split("-").reverse().join("."), amount: twin.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) }) : undefined;
      const final = dupe ? { ...prefill, warning: prefill.warning ? `${dupe} ${prefill.warning}` : dupe } : prefill;
      setReveal({ items: signDiscountLines(receipt.items).filter((item) => item.amount > 0).map((item) => ({ name: item.name, amount: item.amount })), total: prefill.amount, prefill: final });
    } catch (reason) {
      setPhoto(undefined);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setError(offline ? t("Nu ai internet acum. Păstrează bonul și scanează-l din nou când revii online.") : reason instanceof Error ? reason.message : t("Nu am putut citi bonul acum. Mai încearcă o dată."));
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

  return <section className="bf-scan-receipt" aria-busy={busy}>
    {!busy && pending.length > 0 ? <div className="bf-scan-note" role="status">
      <p>{pending.length === 1 ? t("Poza e gata. Bonul e lung? Fă și o poză cu partea următoare, apoi citește-le împreună.") : t("{count} poze ale aceluiași bon. Se citesc împreună, ca un singur bon.", { count: pending.length })}</p>
      <div className="bf-scan-check-actions">
        <button type="button" className="bf-primary" onClick={() => void read(pending)}>{pending.length === 1 ? t("Citește bonul") : t("Citește bonul ({count} poze)", { count: pending.length })}</button>
        {pending.length < RECEIPT_SHOTS_MAX && <button type="button" className="bf-secondary" onClick={() => cameraRef.current?.click()}><Camera size={16} aria-hidden="true" /> {t("Mai fă o poză")}</button>}
        <button type="button" className="bf-link-button" onClick={() => setPending([])}>{t("Renunță")}</button>
      </div>
    </div> : (busy || reveal) ? <>
      {/* O singură animație montată de la poză până la rezultat: raza nu repornește la fiecare secundă. */}
      <ReceiptScanAnimation key="scan-anim" photo={photo} textLines={textLines} seconds={seconds} items={reveal?.items} total={reveal?.total} onDone={reveal ? () => { const done = reveal.prefill; setReveal(undefined); setPhoto(undefined); onResult(done); } : undefined} />
      {busy && !reveal && <p className="bf-scan-receipt-busy" role="status"><Loader2 size={18} className="bf-spin" aria-hidden="true" /> {busyText}</p>}
    </> : hub ? (() => {
      const month = isoToday().slice(0, 7);
      const used = data.receipts.filter((receipt) => receipt.date.startsWith(month)).length;
      const free = currentBonutPlan(data, isoToday()) === "free";
      return <div className="bn-hub">
        <span className="bn-hub-pill">{free ? t("{used}/{limit} luna asta", { used, limit: FREE_SCANS_PER_MONTH }) : t("{used} bonuri luna asta", { used })}</span>
        <button type="button" className="bn-viewfinder" onClick={() => void pick("camera")}>
          <span className="bn-vf-corner is-tl" /><span className="bn-vf-corner is-tr" /><span className="bn-vf-corner is-bl" /><span className="bn-vf-corner is-br" />
          <span className="bn-vf-beam" aria-hidden="true" />
          <span className="bn-vf-copy"><Camera size={30} aria-hidden="true" /><b>{t("Scanează bonul")}</b><small>{t("Toate produsele, pe categorii")}</small></span>
        </button>
        <div className="bn-hub-tiles">
          <button type="button" className="bn-tile" onClick={() => void pick("gallery")}><ImagePlus size={22} aria-hidden="true" /><b>{t("Galerie")}</b><small>{t("una sau mai multe")}</small></button>
          <button type="button" className="bn-tile" onClick={() => void pick("gallery")}><FileText size={22} aria-hidden="true" /><b>{t("E-bon")}</b><small>{t("captură din e-mail")}</small></button>
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
    {error && <p className="bf-form-error" role="alert">{error}</p>}
    <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => addShot(event.target.files)} />
    <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(event) => void read(event.target.files)} />
  </section>;
}
