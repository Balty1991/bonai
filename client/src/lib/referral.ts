/**
 * „Recomandă BonAI”: un mesaj scurt pentru prieteni, cu cifra adevărată din bonurile omului
 * când există (economisit de la început), altfel doar ce face aplicația. Linkul e cel din Play.
 */
import { isoToday, type AppData } from "./finance-data";
import { savedWithBonAI } from "./saved-with-bonai";
import { PLAY_STORE_URL } from "./review-prompt";
import { t } from "./i18n";

export function referralText(data: AppData, today = isoToday(), link = PLAY_STORE_URL): string {
  const saved = savedWithBonAI(data, today).allTime;
  const amount = saved.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return saved >= 10
    ? t("Folosesc BonAI: fac poză la bon și îmi arată cât s-a scumpit fiecare produs și unde e mai ieftin. Până acum am economisit {amount} lei. Încearcă și tu: {link}", { amount, link })
    : t("Folosesc BonAI: fac poză la bon și îmi arată cât s-a scumpit fiecare produs și unde e mai ieftin. Încearcă și tu: {link}", { link });
}
