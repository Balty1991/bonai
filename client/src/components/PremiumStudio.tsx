import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { BILLING_LIVE, isFamilie, familieYearGiftMonths, formatPlanPriceRon, PLANS, TRIAL_DAYS } from "@/lib/entitlements";
import { t } from "@/lib/i18n";

export function PremiumStudio() {
  const gift = familieYearGiftMonths();
  return (
    <section className="bf-premium-catalog" id="bf-familie-plan">
      <p className="bf-kicker">{t("UN SINGUR PLAN PENTRU CASĂ")}</p>
      <h2>{formatPlanPriceRon("familie", "year")}</h2>
      <p>{t("Primul bilanț pe WhatsApp e gratuit. Următoarele, și al doilea telefon, sunt Familia: {year}. Luna, {month}, e varianta scumpă. Proba de {days} de zile pornește când trimiți al doilea bilanț sau inviți celălalt telefon, nu la instalare.", { year: formatPlanPriceRon("familie", "year"), month: formatPlanPriceRon("familie", "month"), days: String(TRIAL_DAYS) })}</p>
      {/* Limitele Casei nu se aplică încă: fără fraza asta, „Până la 10 plicuri” părea o regulă încălcată. */}
      {!BILLING_LIVE && <p className="bf-premium-now" role="note"><b>{t("Acum:")}</b> {t("totul e deblocat gratuit, fără limită de plicuri sau membri. Limitele de mai jos pornesc abia când abonamentul apare în Google Play.")}</p>}
      <div className="bf-premium-plans">
        <article>
          <p className="bf-kicker">{t("CASA")}</p>
          <h3>{t("Gratuit")}</h3>
          <p>{t("Pentru tine și partener, pe un telefon.")}</p>
          <ul>
            <li><Check size={14} /> {t("Plicuri fără limită")}</li>
            <li><Check size={14} /> {t("Doi oameni, un telefon")}</li>
            <li><Check size={14} /> {t("Astăzi, Mișcări, Plicuri, scadențe")}</li>
            <li><Check size={14} /> {t("Ghid local + {n} mesaje online pe zi", { n: String(PLANS.casa.aiOnlinePerDay) })}</li>
            <li><Check size={14} /> {t("Export CSV și backup pe telefon")}</li>
          </ul>
        </article>
        <article className="is-featured">
          <p className="bf-kicker">{t("FAMILIA")}</p>
          <h3>
            {formatPlanPriceRon("familie", "year")}
            <small>
              {gift > 0 ? t("{n} luni cadou față de lună", { n: String(gift) }) : formatPlanPriceRon("familie", "month")}
            </small>
          </h3>
          <p>{t("Un abonament pentru până la {n} persoane. Nu per cap.", { n: String(PLANS.familie.members) })}</p>
          <ul>
            <li><Check size={14} /> {t("{days} zile de probă, apoi {month} sau {year}", { days: String(TRIAL_DAYS), month: formatPlanPriceRon("familie", "month"), year: formatPlanPriceRon("familie", "year") })}</li>
            <li><Check size={14} /> {t("Până la {n} telefoane, sincronizate criptat", { n: String(PLANS.familie.devices) })}</li>
            <li><Check size={14} /> {t("Decontare: cine cui datorează")}</li>
            <li><Check size={14} /> {t("Închiderea ciclului, cu ce a rămas în plicuri")}</li>
            <li><Check size={14} /> {t("Ghid online {n} mesaje pe zi", { n: String(PLANS.familie.aiOnlinePerDay) })}</li>
          </ul>
        </article>
      </div>
      <BillingActions />
      <p className="bf-premium-promise"><Sparkles size={14} /> {t("Dacă anulezi, registrul rămâne pe telefon. Nu luăm ostatic datele.")}</p>
      <small className="bf-helper">
        {BILLING_LIVE
          ? t("Plata trece prin Google Play. Poți anula oricând din abonamentele contului Google.")
          : t("Plata trece prin Google Play, când listarea e live. Până atunci casa ta e deblocată — registrul nu se ține ostatic.")}
        {" · "}
        {t("BonAI nu e sfat financiar, credit sau investiție. Este un registru de familie.")}
      </small>
    </section>
  );
}

/** Cumpărare lunar/anual și „Restaurează abonamentul” (obligatoriu pentru Google Play). */
function BillingActions() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [, refresh] = useState(0);
  const run = async (work: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    try {
      const result = await work();
      setMessage(result.message);
      refresh((value) => value + 1);
    } finally {
      setBusy(false);
    }
  };
  const active = BILLING_LIVE && isFamilie();
  return (
    <div className="bf-billing-actions">
      {BILLING_LIVE && !active && (
        <div className="bf-billing-buy">
          <button type="button" className="bf-primary" disabled={busy} onClick={() => void run(async () => (await import("@/lib/billing")).buyFamilie("year"))}>{t("Familia anual · {price}", { price: formatPlanPriceRon("familie", "year") })}</button>
          <button type="button" className="bf-secondary" disabled={busy} onClick={() => void run(async () => (await import("@/lib/billing")).buyFamilie("month"))}>{t("Familia lunar · {price}", { price: formatPlanPriceRon("familie", "month") })}</button>
        </div>
      )}
      {active && <p className="bf-billing-active"><Check size={14} /> {t("Familia e activă pe acest telefon.")}</p>}
      <button type="button" className="bf-link-button" disabled={busy} onClick={() => void run(async () => (await import("@/lib/billing")).restoreFamilie())}>{t("Restaurează abonamentul")}</button>
      {message && <p className="bf-notice" role="status">{message}</p>}
    </div>
  );
}
