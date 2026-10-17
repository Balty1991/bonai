/** Verifică un produs în magazin după codul de bare, față de prețurile din bonurile tale. */
import { useMemo, useState } from "react";
import { Barcode, Check, Plus } from "lucide-react";
import { newId, isoToday, type AppData } from "@/lib/finance-data";
import { productObservations } from "@/lib/personal-inflation";
import { isValidEan, openFoodFactsName, readBarcodeLinks, scanBarcodeNative, suggestProducts, verdictFor } from "@/lib/barcode-check";
import { lei } from "@/lib/money-format";
import { withBarcodeLink } from "@/lib/barcode-links";
import { OFFICIAL_ATTRIBUTION, OFFICIAL_PRICES_ENABLED, lookupOfficialPrice, type OfficialResult } from "@/lib/official-prices";
import { t } from "@/lib/i18n";

const perText = (per: string) => (per === "buc" ? t("bucata") : per);
const dayText = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });

export function BarcodeCheck({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const [code, setCode] = useState("");
  const [ean, setEan] = useState<string>();
  const [offName, setOffName] = useState<string>();
  const [linked, setLinked] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [official, setOfficial] = useState<OfficialResult | null>();
  const city = useMemo(() => [...data.receipts].sort((a, b) => b.date.localeCompare(a.date)).find((r) => r.city)?.city || "", [data.receipts]);
  const observations = useMemo(() => productObservations(data), [data]);
  const products = useMemo(() => { const seen = new Map<string, string>(); for (const o of observations) if (!seen.has(o.key)) seen.set(o.key, o.label); return Array.from(seen, ([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label, "ro")); }, [observations]);
  const today = isoToday();
  const verdict = linked ? verdictFor(linked, observations, today) : undefined;
  const suggestions = offName ? suggestProducts(offName, observations) : [];

  const check = async (value: string) => {
    const clean = value.replace(/\D/g, "");
    setAdded(false); setOffName(undefined); setLinked(undefined);
    if (!isValidEan(clean)) { setEan(undefined); return; }
    setEan(clean);
    const known = data.settings.barcodeLinks?.[clean]?.key || readBarcodeLinks()[clean];
    if (known) { setLinked(known); return; }
    setBusy(true);
    setOffName(await openFoodFactsName(clean));
    setBusy(false);
  };
  const scan = async () => { const value = await scanBarcodeNative().catch(() => undefined); if (value) { setCode(value); void check(value); } };
  const pick = (key: string) => { if (!ean) return; onChange(withBarcodeLink(data, ean, key)); setLinked(key); };
  const addToList = () => {
    const text = verdict?.label || offName;
    if (!text) return;
    onChange({ ...data, settings: { ...data.settings, shoppingList: [...(data.settings.shoppingList || []), { id: newId("shop"), text, updatedAt: new Date().toISOString() }] } });
    setAdded(true);
  };

  return <section className="sh-card">
    <p className="sh-kicker">{t("VERIFICĂ ÎN MAGAZIN")}</p>
    <button type="button" className="sh-scan" onClick={() => void scan()}><Barcode size={20} aria-hidden="true" /> {t("Scanează codul de bare")}</button>
    <form className="sh-row-form" onSubmit={(event) => { event.preventDefault(); void check(code); }}>
      <input inputMode="numeric" aria-label={t("Codul de bare")} placeholder={t("sau scrie cifrele de sub cod")} value={code} onChange={(event) => setCode(event.target.value)} />
      <button type="submit" className="sh-link">{t("Verifică")}</button>
    </form>
    {code && !ean && !busy && code.replace(/\D/g, "").length >= 8 && <p className="sh-muted">{t("Codul nu pare corect. Verifică cifrele.")}</p>}
    {busy && <p className="sh-muted">{t("Caut produsul…")}</p>}
    {ean && !linked && !busy && <div className="sh-rows">
      <p className="sh-muted">{offName ? t("Pare să fie: {name}. Care e, din ce ai cumpărat?", { name: offName }) : t("Nu-l găsesc după cod. Care e, din ce ai cumpărat?")}</p>
      {suggestions.map((item) => <button key={item.key} type="button" className="sh-row" onClick={() => pick(item.key)}><span className="sh-row-copy"><b>{item.label}</b></span><Check size={18} aria-hidden="true" /></button>)}
      {products.length > 0 ? <select aria-label={t("Alege produsul")} defaultValue="" onChange={(event) => event.target.value && pick(event.target.value)}><option value="">{t("Alege din toate produsele tale")}</option>{products.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
        : <p className="sh-muted">{t("Încă nu ai bonuri cu produse. Scanează un bon și data viitoare îți spun dacă prețul e bun.")}</p>}
    </div>}
    {verdict && <div className="sh-rows">
      <p><b>{verdict.label}</b></p>
      <p>{t("Ultima dată ai dat {price} pe {per}, la {vendor} ({date}).", { price: lei(verdict.last.price), per: perText(verdict.last.per), vendor: verdict.last.vendor, date: dayText(verdict.last.date) })}</p>
      {verdict.cheapest && <p className="sh-down">{t("Cel mai mic preț la tine: {price} pe {per}, la {vendor} ({date}).", { price: lei(verdict.cheapest.price), per: perText(verdict.cheapest.per), vendor: verdict.cheapest.vendor, date: dayText(verdict.cheapest.date) })}</p>}
      <p className="sh-muted">{t("Compară cu prețul de pe raft. Prețurile vin doar din bonurile tale.")}</p>
    </div>}
    {OFFICIAL_PRICES_ENABLED && city && (verdict || offName) && (official === undefined
      ? <button type="button" className="sh-link" onClick={() => { setOfficial(null); void lookupOfficialPrice(verdict?.label || offName || "", city).then((result) => setOfficial(result || null)); }}>{t("Prețul oficial în {city}", { city })}</button>
      : official && official.offers.length > 0 ? <div className="sh-rows"><ul className="sh-list">{official.offers.slice(0, 3).map((offer) => <li key={`${offer.store}-${offer.price}`}><span><b>{offer.network || offer.store}</b><small>{offer.address || offer.store}</small></span><b>{lei(offer.price)}</b></li>)}</ul><p className="sh-muted sh-note">{OFFICIAL_ATTRIBUTION}</p></div>
      : official === null ? <p className="sh-muted">{t("Caut produsul…")}</p> : null)}
    {(verdict || offName) && <button type="button" className="sh-link" onClick={addToList} disabled={added}>{added ? <><Check size={16} aria-hidden="true" /> {t("Adăugat în listă")}</> : <><Plus size={16} aria-hidden="true" /> {t("Adaugă în listă")}</>}</button>}
  </section>;
}
