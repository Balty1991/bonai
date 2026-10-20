/**
 * Magazine: coșul tău lunar pus la prețurile fiecărui magazin, și prețurile comunității
 * („unde e mai ieftin azi în orașul tău”), pornite doar cu acordul omului.
 */
import { useEffect, useMemo, useState } from "react";
import { Share2, Users } from "lucide-react";
import { isoToday, type AppData } from "@/lib/finance-data";
import { basketCompare, basketKeys } from "@/lib/basket-compare";
import { communityOutside, readCommunity, readCommunityCache, refreshCommunity, suggestedCity, writeCommunity } from "@/lib/community-prices";
import { lei as leiRon } from "@/lib/money-format";
import { PLAY_STORE_URL } from "@/lib/review-prompt";
import { t } from "@/lib/i18n";

const lei = (value: number) => leiRon(value).replace(/\s?RON/, " lei");

export function basketShareText(saving: number, vendor: string, link: string) {
  return t("Coșul meu lunar iese cu {amount} mai ieftin la {vendor}. Am aflat din bonurile mele, cu BonAI: {link}", { amount: lei(saving), vendor, link });
}

async function share(text: string) {
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* anulat */ }
  try { await navigator.clipboard.writeText(text); } catch { /* fără clipboard */ }
}

export function BasketCard({ data }: { data: AppData }) {
  const today = isoToday();
  const [pref, setPref] = useState(readCommunity);
  const [cache, setCache] = useState(readCommunityCache);
  const [city, setCity] = useState(() => pref.city || suggestedCity(data));
  const [details, setDetails] = useState(false);
  const keys = useMemo(() => basketKeys(data, today), [data, today]);
  useEffect(() => {
    if (!pref.on) return;
    let alive = true;
    void refreshCommunity(data, keys, today).then((next) => { if (alive && next) setCache(next); });
    return () => { alive = false; };
  }, [pref.on, pref.city, keys, data, today]);
  const community = useMemo(() => (pref.on && cache?.city === pref.city ? communityOutside(cache) : { vendors: [] as string[] }), [pref.on, pref.city, cache]);
  const basket = useMemo(() => basketCompare(data, today, community.outside, community.vendors), [data, today, community]);
  const join = () => {
    const next = { on: true, city: city.trim().slice(0, 40) };
    if (next.city.length < 2) return;
    writeCommunity(next);
    setPref(next);
  };
  const leave = () => {
    writeCommunity({ on: false, city: pref.city });
    setPref({ on: false, city: pref.city });
    setCache(undefined);
  };

  return <>
    {basket && basket.cheapest && <section className="sh-card is-accent bn-basket">
      <p className="sh-kicker">{t("COȘUL TĂU LA FIECARE MAGAZIN")}</p>
      <h2 className="sh-title">{basket.saving >= 1 ? t("La {vendor} ai da cu {amount} mai puțin pe lună", { vendor: basket.cheapest.vendor, amount: lei(basket.saving) }) : t("{vendor} iese cel mai ieftin pentru coșul tău", { vendor: basket.cheapest.vendor })}</h2>
      <p className="sh-muted">{t("{count} produse pe care le iei des, în cantitatea ta obișnuită: acum dai cam {amount} pe lună pe ele.", { count: basket.items.length, amount: lei(basket.now) })}</p>
      <ul className="sh-list"><li><span><b>{t("Acum, unde cumperi de obicei")}</b><small>{t("media ultimelor 3 luni")}</small></span><b>{lei(basket.now)}</b></li>{basket.stores.slice(0, 6).map((store) => <li key={store.vendor}>
        <span><b>{store.vendor}</b><small>{store.estimated ? t("{known} din {all} produse cu preț știut", { known: store.known, all: basket.items.length }) : t("toate produsele cu preț știut")}</small></span>
        <b className={store.diff > 0 ? "sh-up" : "sh-down"}>{lei(store.total)}{store.diff > 0 ? ` +${lei(store.diff)}` : ""}</b>
      </li>)}</ul>
      {basket.saving >= 1 && <button type="button" className="sh-link" onClick={() => void share(basketShareText(basket.saving, basket.cheapest!.vendor, PLAY_STORE_URL))}><Share2 size={16} aria-hidden="true" /> {t("Spune-le prietenilor")}</button>}
      <p className="sh-muted sh-note">{t("Prețul ultimei cumpărări din fiecare magazin; unde lipsește, prețul tău mediu.")}{pref.on ? ` ${t("Din comunitate: doar prețuri trimise de cel puțin 3 ori.")}` : ""}</p>
    </section>}

    <section className="sh-card bn-community">
      <p className="sh-kicker">{t("PREȚURILE DIN ORAȘUL TĂU")}</p>
      {pref.on ? <>
        <h2 className="sh-title">{t("Participi din {city}", { city: pref.city })}</h2>
        <p className="sh-muted">{community.vendors.length === 1 ? t("Știm prețuri de la un magazin din oraș pentru produsele tale.") : community.vendors.length ? t("Știm prețuri de la {count} magazine din oraș pentru produsele tale.", { count: community.vendors.length }) : t("Încă strângem prețuri din oraș. Cu cât trimit mai mulți, cu atât afli mai repede unde e mai ieftin.")}</p>
        <button type="button" className="sh-link" onClick={leave}>{t("Nu mai particip")}</button>
      </> : <>
        <h2 className="sh-title">{t("Află unde e mai ieftin coșul tău, și la magazinele unde n-ai fost")}</h2>
        <p className="sh-muted">{t("Dai prețurile din bonurile tale, anonim, și primești prețurile celorlalți din oraș.")}</p>
        <label className="bn-community-city"><span>{t("Orașul")}</span><input value={city} maxLength={40} autoComplete="address-level2" placeholder={t("ex. București")} onChange={(event) => setCity(event.target.value)} /></label>
        <button type="button" className="sh-scan bn-community-join" disabled={city.trim().length < 2} onClick={join}><Users size={20} aria-hidden="true" /> {t("Particip")}</button>
        <button type="button" className="sh-link" aria-expanded={details} onClick={() => setDetails(!details)}>{t("Ce se trimite")}</button>
        {details && <ul className="sh-muted bn-community-what">
          <li>{t("Se trimit, doar pentru alimente, băuturi și produse pentru casă: produsul, prețul pe kg, litru sau bucată, magazinul, orașul și luna.")}</li>
          <li>{t("Nu se trimit: bonul, ziua, totalul, numele tău sau al familiei, nimic din alte cheltuieli.")}</li>
          <li>{t("Pe server rămân doar medii pe oraș și lună, fără să se știe cine a trimis; se șterg după 100 de zile.")}</li>
          <li>{t("Poți opri oricând, de aici.")}</li>
        </ul>}
      </>}
    </section>
  </>;
}

export default BasketCard;
