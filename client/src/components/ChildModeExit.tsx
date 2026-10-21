/**
 * Telefon rămas în modul copil al bugetului vechi: modul nu mai există, dar datele familiei nu se
 * deschid fără codul adultului. Fără cod salvat, telefonul iese singur.
 */
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { hasMemberModePin, memberModeWaitSeconds, takePreviousSelf, verifyMemberModePin, writeMemberMode } from "@/lib/member-mode";
import { t } from "@/lib/i18n";

const leave = () => {
  const previous = takePreviousSelf();
  window.dispatchEvent(new CustomEvent("buget-familie:local-settings", { detail: { selfMemberId: previous || undefined } }));
  writeMemberMode("");
};

export function ChildModeExit() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (!hasMemberModePin()) leave(); }, []);
  const tryExit = async () => {
    const wait = memberModeWaitSeconds();
    if (wait > 0) return setError(t("Prea multe încercări. Mai așteaptă {seconds} secunde.", { seconds: wait }));
    if (!await verifyMemberModePin(pin)) { setPin(""); return setError(t("Cod greșit.")); }
    leave();
  };
  return <section className="sh-page" aria-labelledby="bf-child-exit-title">
    <div className="sh-card">
      <p className="sh-kicker"><Lock size={14} aria-hidden="true" /> {t("TELEFON BLOCAT")}</p>
      <h1 id="bf-child-exit-title" className="sh-title">{t("Introdu codul adultului ca să deschizi BonAI")}</h1>
      <p className="sh-muted">{t("Telefonul era pus în „Modul copil”, care nu mai există. După cod, aplicația se deschide normal.")}</p>
      <form className="bn-review-details" onSubmit={(event) => { event.preventDefault(); void tryExit(); }}>
        <label style={{ gridColumn: "1 / -1" }}><span>{t("Codul adultului")}</span><input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} /></label>
        {error && <p className="bf-form-error" role="alert" style={{ gridColumn: "1 / -1" }}>{error}</p>}
        <button type="submit" className="bn-btn is-primary" disabled={pin.length !== 4}>{t("Deschide BonAI")}</button>
      </form>
    </div>
  </section>;
}
