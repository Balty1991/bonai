import { ExternalLink, ShieldCheck } from "lucide-react";
import { APP_SUPPORT_EMAIL, APP_VERSION, publicLegalUrl } from "@/lib/app-version";
import { t } from "@/lib/i18n";

export function TrustCenter() {
  const privacy = publicLegalUrl("privacy.html");
  const terms = publicLegalUrl("terms.html");
  const deletion = publicLegalUrl("delete-data.html");
  return (
    <section className="bf-trust">
      <p className="bf-kicker">{t("ÎNCREDERE ȘI CONFIDENȚIALITATE")}</p>
      <h2>{t("Ce face aplicația cu datele tale")}</h2>
      <p>{t("BonAI este un registru local. Nu avem conturi de utilizator, nu cerem login bancar și nu vindem date.")}</p>
      <p><b>{t("Nu e o aplicație de plăți și nici de monitorizare.")}</b> {t("Nu mută bani, nu se leagă de bancă și nu urmărește pe nimeni. E caietul de buget al familiei: vedeți doar ce notați voi.")}</p>
      <ul>
        <li><b>{t("Pe telefon:")}</b> {t("mișcări, plicuri, datorii, economii, teme și alerte.")}</li>
        <li><b>{t("Opțional, criptat:")}</b> {t("un pachet AES-GCM într-o cameră Firebase cu ID și cheie aleatoare, create pe telefon. Serverul nu vede lei, nume sau chei în clar.")}</li>
        <li><b>{t("Invitația e cheia:")}</b> {t("cine o are poate intra în cameră. Nu e un cont Google. Dacă un telefon e pierdut, revocă-l din Sync și mutați familia într-o cameră nouă.")}</li>
        <li><b>{t("Cod de recuperare:")}</b> {t("la crearea camerei îl notezi pe hârtie. Nu e un email de resetare: cine are codul poate intra în cameră.")}</li>
        <li><b>{t("Nu sincronizăm:")}</b> {t("șabloanele rapide, filtrele, tema, cursul valutar, regulile de comerciant și istoricul de sincronizare al acestui dispozitiv. Confirmarea din De verificat rămâne pe telefonul care a creat-o.")}</li>
        <li><b>{t("Ghidul AI:")}</b> {t("rămâne pe telefon. Dacă ghidul local n-a înțeles, pleacă la Google Gemini (sau Groq, ca rezervă) întrebarea, ultimele mesaje și un rezumat: plicuri, surse, scadențe, numele membrilor. Niciodată jurnalul de mișcări.")}</li>
        <li><b>{t("Fără cont de șters:")}</b> {t("nu există cont Play/Google al aplicației. Resetarea din Setări golește doar acest telefon. O copie criptată rămâne în cameră până o mutați sau o goliți.")}</li>
      </ul>
      <p>{t("Permisiuni Android: internet (sincronizare opțională), notificări locale, pornire după restart pentru reamintiri.")}</p>
      <p>{t("BonAI nu e sfat financiar, credit sau investiție. Este un registru de familie. Nu plătește facturi și nu înlocuiește un consultant.")}</p>
      <div className="bf-trust-links">
        <a href={privacy} target="_blank" rel="noreferrer"><ShieldCheck size={15} /> {t("Politică de confidențialitate")} <ExternalLink size={13} /></a>
        <a href={terms} target="_blank" rel="noreferrer">{t("Termeni de utilizare")} <ExternalLink size={13} /></a>
        <a href={deletion} target="_blank" rel="noreferrer">{t("Cum ștergi datele")} <ExternalLink size={13} /></a>
        <a href={`mailto:${APP_SUPPORT_EMAIL}`}>{t("Suport")} · {APP_SUPPORT_EMAIL}</a>
      </div>
      <small className="bf-helper">{t("Versiune {version} · pachet ro.balty1991.bugetfamilie.", { version: APP_VERSION })} {t("Ghidul e local, cu rezervă online doar când e nevoie.")}</small>
    </section>
  );
}
