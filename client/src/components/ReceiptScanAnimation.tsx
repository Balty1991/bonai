import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

export type RevealItem = { name: string; amount: number };

const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const lei = (value: number) => value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0; const start = performance.now();
    const step = (now: number) => { const k = Math.min(1, (now - start) / 380); setShown(value * (1 - Math.pow(1 - k, 3))); if (k < 1) frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <b>{lei(shown)}</b>;
}

/**
 * Doar vizual: cât timp serverul citește bonul arătăm poza cu raza de scanare și etapele;
 * când vine răspunsul, produsele reale apar unul câte unul (sub o secundă și jumătate), apoi formularul.
 * Nimic inventat: înainte de răspuns nu afișăm niciun produs sau preț. Atingerea sare peste.
 */
export function ReceiptScanAnimation({ photo, seconds, items, total, onDone }: { photo?: string; seconds: number; items?: RevealItem[]; total?: number; onDone?: () => void }) {
  const [count, setCount] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!items) return;
    if (reducedMotion() || !items.length) { doneRef.current?.(); return; }
    const shown = Math.min(items.length, 8);
    let i = 0;
    const timer = window.setInterval(() => { i += 1; setCount(i); if (i > shown) { window.clearInterval(timer); window.setTimeout(() => doneRef.current?.(), 450); } }, 110);
    return () => window.clearInterval(timer);
  }, [items]);
  const stage = items ? 2 : seconds < 2 ? 0 : 1;
  const stages = [t("Detectez bonul"), t("Citesc produsele"), t("Verific totalul")];
  const log = items
    ? items.slice(0, Math.min(count, 8)).map((item, index) => <li key={index}><span>{item.name}</span><CountUp value={item.amount} /></li>)
    : [t("› caut marginile bonului"), t("› îndrept și clarific poza"), t("› recunosc rândurile de text"), t("› potrivesc produsele cu prețurile")].slice(0, Math.min(4, 1 + Math.floor(seconds / 1.5))).map((line) => <li key={line} className="is-muted"><span>{line}</span></li>);
  return <div className="bn-scan" role="status" aria-live="polite" onClick={() => items && doneRef.current?.()}>
    <p className="bn-scan-title">{items ? <><em>{t("Am citit {count} produse", { count: items.length })}</em></> : <>{t("Analizez bonul cu")} <em>AI</em></>}</p>
    <div className="bn-scan-stage" aria-hidden="true">
      {photo && <img src={photo} alt="" />}
      <div className="bn-scan-grid" />
      {[18, 34, 50, 66].map((top, index) => <span key={top} className="bn-scan-box" style={{ top: `${top}%`, width: `${[62, 48, 70, 40][index]}%`, animationDelay: `${index * 0.45}s` }} />)}
      {[[12, 30], [80, 22], [64, 70], [28, 82], [90, 58], [46, 12]].map(([left, top], index) => <span key={index} className="bn-scan-dot" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${index * 0.4}s` }} />)}
      <span className="bn-scan-corner" style={{ left: 10, top: 10, borderRight: 0, borderBottom: 0 }} />
      <span className="bn-scan-corner" style={{ right: 10, top: 10, borderLeft: 0, borderBottom: 0 }} />
      <span className="bn-scan-corner" style={{ left: 10, bottom: 10, borderRight: 0, borderTop: 0 }} />
      <span className="bn-scan-corner" style={{ right: 10, bottom: 10, borderLeft: 0, borderTop: 0 }} />
      <span className="bn-scan-beam" />
    </div>
    <ol className="bn-scan-stages">{stages.map((label, index) => <li key={label} className={index < stage ? "is-done" : index === stage ? "is-on" : ""}>{label}</li>)}</ol>
    <ul className="bn-scan-term">{log}{items && count > Math.min(items.length, 8) && total !== undefined && <li><span>{t("Total")}</span><CountUp value={total} /></li>}</ul>
  </div>;
}
