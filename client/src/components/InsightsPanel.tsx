/**
 * Secțiunea asistentului: toate observațiile despre obiceiuri, plăți și datorii, într-un singur loc.
 * Pe Acasă rămâne doar un rând cu cea mai importantă; restul se deschid aici, când vrei.
 */
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import type { Insight, InsightAction } from "@/lib/habit-insights";
import { t } from "@/lib/i18n";

export function InsightsPanel({ insights, onClose, onAct }: { insights: ReadonlyArray<Insight>; onClose: () => void; onAct: (action?: InsightAction) => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  return createPortal(<div ref={trapRef} tabIndex={-1} className="bn-costs" role="dialog" aria-modal="true" aria-label={t("Asistentul tău")}>
    <header className="bn-costs-head"><button type="button" className="bn-icon-btn" aria-label={t("Înapoi")} onClick={onClose}><ArrowLeft size={20} /></button><b>{t("Asistentul tău")}</b><span /></header>
    <div className="bn-costs-body">
      <section className="bn-costs-hero">
        <small>{t("OBSERVAȚII · {count}", { count: insights.length })}</small>
        <strong>{insights.length === 1 ? t("Un lucru de știut") : t("{count} lucruri de știut", { count: insights.length })}</strong>
        <span>{t("Calculat pe telefon din bonurile și plățile tale. Nu pleacă nimic din aplicație.")}</span>
      </section>
      {insights.length ? <ul className="bn-insights">{insights.map((item) => <li key={item.id}><button type="button" onClick={() => { onClose(); onAct(item.action); }}>
        <span className="bn-insight-icon" aria-hidden="true">{item.icon}</span><span><b>{item.title}</b><small>{item.body}</small></span><ChevronRight size={16} aria-hidden="true" />
      </button></li>)}</ul>
        : <p className="sh-muted">{t("Încă nimic sigur de spus. Cu fiecare bon și plată notată, observațiile apar aici.")}</p>}
    </div>
  </div>, document.body);
}

export default InsightsPanel;
