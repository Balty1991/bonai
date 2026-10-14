/**
 * „Plicuri mai simple”, deasupra listei de plicuri: ce se schimbă, cu sumele pentru Copil și
 * Altele de completat, și un singur buton. Dispare după ce plicurile sunt „din orice card”.
 */
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { parseRomanianAmount, type AppData } from "@/lib/finance-data";
import { applySimpleEnvelopes, CHILD_CATEGORIES, isSimplified, OTHER_CATEGORIES, proposeSimpleEnvelopes, SHOPPING_CATEGORIES, spentThisCycle } from "@/lib/simple-envelopes";
import { lei } from "@/lib/money-format";
import { t } from "@/lib/i18n";

const list = (items: string[]) => items.map((item) => t(item)).join(", ");

export function SimpleEnvelopesCard({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const [child, setChild] = useState("500");
  const [other, setOther] = useState("150");
  const [done, setDone] = useState(false);
  if (done) return <p className="bf-helper" role="status">{t("Gata: plicurile iau plata din orice card. Notezi cheltuiala și te uiți doar la cât mai ai.")}</p>;
  // Doar pentru familiile care au deja plicuri; cele noi le fac din „+ Plic” sau la salariu.
  if (!data.settings.salaryPlan.allocations.length || isSimplified(data)) return null;
  const proposal = proposeSimpleEnvelopes(data);
  const allocations = data.settings.salaryPlan.allocations;
  const shopping = allocations.find((item) => item.id === proposal.shoppingId);
  const childEnvelope = allocations.find((item) => item.id === proposal.childId);
  const otherEnvelope = allocations.find((item) => item.id === proposal.otherId);
  const rest = allocations.filter((item) => ![proposal.shoppingId, proposal.childId, proposal.otherId].includes(item.id));
  const apply = () => {
    onChange(applySimpleEnvelopes(data, proposal, { child: parseRomanianAmount(child), other: parseRomanianAmount(other) }));
    setDone(true);
  };
  const spentNote = (categories: string[]) => { const spent = spentThisCycle(data, categories); return spent > 0 ? <small style={{ color: "var(--cf-muted)" }}>{t("Din ciclul ăsta ai cheltuit deja {amount} pe acestea; intră în plic.", { amount: lei(spent) })}</small> : null; };
  const row: React.CSSProperties = { display: "grid", gap: 2, padding: "10px 0", borderTop: "1px solid var(--cf-line)" };
  return (
    <section className="bf-sub-board" aria-labelledby="bf-simple-envelopes-title" style={{ marginBottom: 12 }}>
      <div className="bf-section-heading">
        <div>
          <p className="bf-kicker">{t("PLICURI MAI SIMPLE")}</p>
          <h2 id="bf-simple-envelopes-title">{t("Câteva plicuri care acoperă tot")}</h2>
        </div>
        <Sparkles size={20} aria-hidden="true" />
      </div>
      <p className="bf-helper">{t("Plătești cu orice card, bonuri sau cash: cheltuiala intră singură în plicul ei, fără „din plic sau din nerepartizat”. Cardul arată unde sunt banii, plicul arată pentru ce.")}</p>
      <div style={row}><b>{shopping ? t("{name} devine Cumpărături", { name: shopping.label }) : t("Cumpărături (nou)")}</b><small>{list(SHOPPING_CATEGORIES)} · {shopping ? t("suma rămâne") : t("suma o pui tu")}</small></div>
      <label className="bf-field" style={{ ...row, gap: 6 }}><span>{childEnvelope ? t("{name}, pe lună", { name: childEnvelope.label }) : t("Copil (nou), pe lună")} · <small>{list(CHILD_CATEGORIES)}</small></span><input value={child} onChange={(event) => setChild(event.target.value)} inputMode="decimal" />{spentNote(CHILD_CATEGORIES)}</label>
      <label className="bf-field" style={{ ...row, gap: 6 }}><span>{otherEnvelope ? t("{name}, pe lună", { name: otherEnvelope.label }) : t("Altele (nou), pe lună")} · <small>{list(OTHER_CATEGORIES)}</small></span><input value={other} onChange={(event) => setOther(event.target.value)} inputMode="decimal" />{spentNote(OTHER_CATEGORIES)}</label>
      {rest.length > 0 && <div style={row}><b>{rest.map((item) => item.label).join(", ")}</b><small>{rest.length === 1 ? t("rămâne cum e, doar din orice card") : t("rămân cum sunt, doar din orice card")}</small></div>}
      {proposal.fixes.length > 0 && <div style={row}><b>{t("Bonurile, pe tipul lor")}</b><small>{proposal.fixes.map((fix) => t("{name} devine {kind}", { name: fix.source.name, kind: fix.kind === "meal" ? t("card de tichete") : t("voucher") })).join(" · ")}. {t("Tichetele nu mai apar ca bani liberi.")}</small></div>}
      <p className="bf-helper">{t("Facturile și ratele nu au plic: se pun deoparte singure, la Scadențe. Nimic nu se șterge.")}</p>
      <button type="button" className="bf-primary" onClick={apply}><Check size={16} aria-hidden="true" /> {t("Fă plicurile mai simple")}</button>
    </section>
  );
}
