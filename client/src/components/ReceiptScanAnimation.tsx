import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { linesLabel, productsLabel, t } from "@/lib/i18n";

export type RevealItem = { name: string; amount: number };

const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const lei = (value: number) => value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SHOWN = 9;
const SKELETON = [72, 54, 66, 48, 60, 40];

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reducedMotion()) { setShown(value); return; }
    let frame = 0; const start = performance.now();
    const step = (now: number) => { const k = Math.min(1, (now - start) / 380); setShown(value * (1 - Math.pow(1 - k, 3))); if (k < 1) frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <b>{lei(shown)}</b>;
}

/**
 * Bonul virtual: o hârtie digitală care se construiește singură. Cât timp serverul citește,
 * arătăm doar rânduri-schelet (nimic inventat); când vine răspunsul, magazinul, produsele reale,
 * reducerile și totalul apar unul câte unul, apoi verificăm totalul. Miniaturile pozelor stau
 * deasupra, fiecare cu bifa ei. Atingerea sare peste.
 */
export function ReceiptScanAnimation({ thumbs = [], processed = 0, store, seconds, items, total, onDone }: { thumbs?: string[]; processed?: number; store?: string; seconds: number; items?: RevealItem[]; total?: number; onDone?: () => void }) {
  const [count, setCount] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const shown = items ? Math.min(items.length, SHOWN) : 0;
  useEffect(() => {
    if (!items) return;
    if (reducedMotion() || !items.length) { setCount(shown + 1); const id = window.setTimeout(() => doneRef.current?.(), reducedMotion() ? 900 : 0); return () => window.clearTimeout(id); }
    let i = 0;
    const timer = window.setInterval(() => { i += 1; setCount(i); if (i > shown) { window.clearInterval(timer); window.setTimeout(() => doneRef.current?.(), 450); } }, 60);
    return () => window.clearInterval(timer);
  }, [items, shown]);
  const stage = items ? 2 : processed < Math.max(1, thumbs.length) ? 0 : 1;
  const stages = [t("Detectez bonul"), t("Citesc produsele"), t("Verific totalul")];
  const sum = items ? Math.round(items.reduce((acc, item) => acc + item.amount, 0) * 100) / 100 : 0;
  const totalShown = items && count > shown;
  const verified = totalShown && total !== undefined && Math.abs(sum - total) < 0.05 && items.length <= SHOWN * 10;
  const log = items
    ? [<li key="store" className="is-muted"><span>› {store ? t("magazin: {store}", { store }) : t("magazin necunoscut")}</span></li>, <li key="n" className="is-muted"><span>› {t("{lines} citite", { lines: linesLabel(items.length) })}</span></li>, ...(totalShown && total !== undefined ? [<li key="t"><span>{verified ? t("› suma rândurilor = totalul") : t("› total luat de pe bon")}</span><CountUp value={total} /></li>] : [])]
    : [t("› caut marginile bonului"), t("› îndrept și clarific poza"), t("› recunosc rândurile de text"), t("› potrivesc produsele cu prețurile")].slice(0, Math.min(4, 1 + Math.floor(seconds / 1.5))).slice(-3).map((line) => <li key={line} className="is-muted"><span>{line}</span></li>);
  return <div className="bn-scan" role="status" aria-live="polite" onClick={() => items && doneRef.current?.()}>
    <p className="bn-scan-title">{items ? <em>{t("Am citit {products}", { products: productsLabel(items.length) })}</em> : <>{t("Analizez bonul cu")} <em>AI</em></>}</p>
    {thumbs.length > 0 && <ul className="bn-scan-thumbs" aria-label={t("{count} poze", { count: thumbs.length })}>{thumbs.map((src, index) => <li key={src} className={index < processed ? "is-done" : index === processed ? "is-on" : ""}><img src={src} alt="" /><span>{index < processed ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : index + 1}</span></li>)}</ul>}
    <div className="bn-scan-stage" aria-hidden="true">
      <div className="bn-vr">
        <header className="bn-vr-head">{store ? <b className="bn-vr-store">{store}</b> : <i className="bn-vr-sk" style={{ width: "46%", height: 12 }} />}<i className="bn-vr-sk" style={{ width: "30%" }} /></header>
        <ul className="bn-vr-lines">
          {items
            ? items.slice(0, shown).map((item, index) => <li key={index} className={`${index < count ? "is-in" : ""}${item.amount < 0 ? " is-discount" : ""}`}><span>{item.name}</span><b>{item.amount < 0 ? "−" : ""}{lei(Math.abs(item.amount))}</b></li>)
            : SKELETON.map((width, index) => <li key={index} className="is-sk" style={{ animationDelay: `${index * 0.12}s` }}><i className="bn-vr-sk" style={{ width: `${width}%` }} /><i className="bn-vr-sk" style={{ width: "16%" }} /></li>)}
          {items && items.length > SHOWN && count > shown && <li className="is-in is-more"><span>{t("+ încă {count} rânduri", { count: items.length - SHOWN })}</span></li>}
        </ul>
        <footer className={`bn-vr-total${totalShown ? " is-in" : ""}`}><span>{t("TOTAL")}</span>{totalShown && total !== undefined ? <b>{lei(total)} lei</b> : <i className="bn-vr-sk" style={{ width: "26%", height: 12 }} />}{verified && <em className="bn-vr-check"><Check size={14} strokeWidth={3} aria-hidden="true" /></em>}</footer>
        <span className="bn-scan-sweep"><span className="bn-scan-beam" /></span>
      </div>
    </div>
    <ol className="bn-scan-stages">{stages.map((label, index) => <li key={label} className={index < stage ? "is-done" : index === stage ? "is-on" : ""}>{label}</li>)}</ol>
    <ul className="bn-scan-term">{log}</ul>
  </div>;
}
