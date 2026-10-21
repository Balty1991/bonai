/**
 * După un bon salvat: unde au plătit alții din oraș mai puțin pentru produsele de pe el, sau, pentru
 * cine nu participă încă, invitația la prețurile comunității (o singură dată, cu ce se trimite spus clar).
 */
import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import type { AppData } from "@/lib/finance-data";
import { basketKeys } from "@/lib/basket-compare";
import { cheaperInCity, communityInviteDue, dismissCommunityInvite, readCommunity, readCommunityCache, refreshCommunity, sharedObservation, suggestedCity, writeCommunity } from "@/lib/community-prices";
import type { ProductObservation } from "@/lib/personal-inflation";
import { lei as leiRon } from "@/lib/money-format";
import { t } from "@/lib/i18n";

const lei = (value: number) => leiRon(value).replace(/\s?RON/, " lei");
const unit = (per: string) => per === "kg" ? "/kg" : per === "l" ? "/l" : t("/buc");
/** Invitația vine după ce omul a văzut aplicația cu câteva bonuri ale lui, nu la primul. */
const INVITE_AFTER = 3;

export function CommunityAfterReceipt({ data, items, city: receiptCity }: { data: AppData; items: ReadonlyArray<ProductObservation>; city?: string }) {
  const [pref, setPref] = useState(readCommunity);
  const [cache, setCache] = useState(readCommunityCache);
  const [invite] = useState(() => communityInviteDue() && data.receipts.length >= INVITE_AFTER && items.some(sharedObservation));
  const [answer, setAnswer] = useState<"joined" | "no">();
  const [city, setCity] = useState(() => pref.city || receiptCity?.trim() || suggestedCity(data));
  useEffect(() => {
    if (!pref.on) return;
    let alive = true;
    const keys = [...items.filter(sharedObservation).map((item) => ({ k: item.key, per: item.per })), ...basketKeys(data)];
    void refreshCommunity(data, keys).then((next) => { if (alive && next) setCache(next); });
    return () => { alive = false; };
  }, [pref.on, pref.city, items, data]);
  const deals = useMemo(() => (pref.on && cache?.city === pref.city ? cheaperInCity(items, cache) : []), [pref.on, pref.city, cache, items]);

  if (deals.length) return <section className="bn-city-offer" aria-label={t("Mai ieftin în oraș")}>
    <p className="sh-kicker"><Users size={15} aria-hidden="true" /> {t("MAI IEFTIN ÎN {city}", { city: pref.city.toLocaleUpperCase("ro-RO") })}</p>
    <ul>{deals.map((deal) => <li key={`${deal.label}|${deal.per}`}><span>
      <b>{deal.label}</b>
      <small>{t("{price}{unit} la {vendor} · tu ai dat {mine}", { price: lei(deal.price), unit: unit(deal.per), vendor: deal.vendor, mine: lei(deal.mine) })}</small>
    </span></li>)}</ul>
    <p className="sh-muted sh-note">{t("Prețuri medii din bonurile altor oameni din oraș, luna asta și luna trecută, trimise de cel puțin 3 ori.")}</p>
  </section>;

  if (!invite || answer === "no") return null;
  if (answer === "joined") return <p className="bn-aha-save" role="status"><Users size={16} aria-hidden="true" /> {t("Participi din {city}. Prețurile din oraș apar aici și în Magazine.", { city: pref.city })}</p>;
  const join = () => {
    const next = { on: true, city: city.trim().slice(0, 40) };
    if (next.city.length < 2) return;
    writeCommunity(next);
    dismissCommunityInvite();
    setPref(next);
    setAnswer("joined");
  };
  return <section className="bn-city-offer" aria-label={t("Prețurile din orașul tău")}>
    <p className="sh-kicker"><Users size={15} aria-hidden="true" /> {t("PREȚURILE DIN ORAȘUL TĂU")}</p>
    <p><b>{t("Vrei să afli unde sunt mai ieftine produsele tale?")}</b></p>
    <p className="sh-muted">{t("Dai anonim prețurile din bonuri (doar produsul, prețul, magazinul, orașul și luna) și vezi ce plătesc alții din oraș. Nu pleacă bonul, ziua sau numele tău.")}</p>
    <label className="bn-community-city"><span>{t("Orașul")}</span><input value={city} maxLength={40} autoComplete="address-level2" placeholder={t("ex. București")} onChange={(event) => setCity(event.target.value)} /></label>
    <span className="bn-warranty-offer-actions">
      <button type="button" className="bn-btn is-primary" disabled={city.trim().length < 2} onClick={join}>{t("Particip")}</button>
      <button type="button" className="bn-btn" onClick={() => { dismissCommunityInvite(); setAnswer("no"); }}>{t("Nu acum")}</button>
    </span>
  </section>;
}

export default CommunityAfterReceipt;
