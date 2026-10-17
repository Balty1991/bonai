/**
 * Prețuri și coșul etalon. Totul este calculat din liniile bonurilor deja salvate,
 * fără nicio sursă externă de prețuri. Este o observație asupra propriilor cumpărături,
 * nu un adevăr de piață: gramajul, promoția sau lotul pot explica o diferență.
 */
import "../price-watch.css";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, ShoppingBasket, ShoppingCart, Store } from "lucide-react";
import { isoToday, type AppData } from "@/lib/finance-data";
import { sgrBalance } from "@/lib/sgr-balance";
import { ProductInsights } from "@/components/ProductInsights";
import { basketCandidates, productPriceHistories, referenceBasket } from "@/lib/price-history";
import { fmtExact, dateText } from "@/pages/home-kit";
import { t } from "@/lib/i18n";

const WINDOWS = [30, 90, 180] as const;

const Trend = ({ percent }: { percent: number }) => {
  if (Math.abs(percent) < 0.05) return <span className="bf-price-trend flat"><Minus size={13} /> neschimbat</span>;
  const up = percent > 0;
  return (
    <span className={`bf-price-trend ${up ? "up" : "down"}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {up ? "+" : ""}{percent.toFixed(1)}%
    </span>
  );
};

export function PriceWatchPanel({ data, onChange }: { data: AppData; onChange: (value: AppData) => void }) {
  const [windowDays, setWindowDays] = useState<(typeof WINDOWS)[number]>(90);
  const histories = useMemo(() => productPriceHistories(data), [data.receipts]);
  const candidates = useMemo(() => basketCandidates(data, 24), [data.receipts]);
  const selected = data.settings.basketProducts;
  const basket = useMemo(() => referenceBasket(data, selected, { windowDays }), [data.receipts, selected, windowDays]);

  const toggle = (key: string) => {
    const next = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key].slice(0, 30);
    onChange({ ...data, settings: { ...data.settings, basketProducts: next } });
  };

  const sgr = <SgrCard data={data} />;
  if (!histories.length) {
    return (
      <><ProductInsights data={data} />{sgr}<div className="bf-empty-state slim">
        <ShoppingBasket size={23} />
        <h2>{t("Încă nu există istoric de prețuri")}</h2>
        <p>{t("Notează produsele pe bonuri. După ce același produs apare pe două bonuri, aici vei vedea cum i-a evoluat prețul și în ce magazin a fost mai ieftin.")}</p>
      </div></>
    );
  }

  return (
    <div className="bf-price-workspace">
      <ProductInsights data={data} />
      {sgr}
      <section className="bf-price-basket" aria-labelledby="basket-title">
        <div className="bf-section-heading">
          <div>
            <p className="bf-kicker">{t("COȘUL ETALON")}</p>
            <h2 id="basket-title">{t("Inflația coșului tău")}</h2>
          </div>
          <ShoppingCart size={19} />
        </div>
        <p className="bf-price-intro">{t("Alege produsele pe care le cumperi constant. Comparăm cât costau împreună acum, față de ultimul preț de dinaintea ferestrei alese. Este indicele gospodăriei tale, calculat din bonurile tale.")}</p>
        <div className="bf-price-window" role="group" aria-label={t("Fereastra de comparație")}>
          {WINDOWS.map((item) => (
            <button key={item} className={windowDays === item ? "active" : ""} onClick={() => setWindowDays(item)}>
              {item} zile
            </button>
          ))}
        </div>

        {basket.lines.length > 0 ? (
          <>
            <div className="bf-price-basket-total">
              <div>
                <span>Acum</span>
                <strong>{fmtExact.format(basket.currentTotal)}</strong>
              </div>
              <div>
                <span>Acum {basket.windowDays} de zile</span>
                <strong>{fmtExact.format(basket.baselineTotal)}</strong>
              </div>
              <div>
                <span>{t("Diferență")}</span>
                <strong>{basket.change > 0 ? "+" : ""}{fmtExact.format(basket.change)}</strong>
                <Trend percent={basket.changePercent} />
              </div>
            </div>
            <div className="bf-price-basket-lines">
              {basket.lines.map((line) => (
                <article key={line.key}>
                  <div>
                    <b>{line.label}</b>
                    <small>{dateText(line.baselineDate)} → {dateText(line.currentDate)} · {line.vendor}</small>
                  </div>
                  <span>{fmtExact.format(line.baseline)} → {fmtExact.format(line.current)}</span>
                  <Trend percent={line.changePercent} />
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="bf-price-empty">
            {selected.length
              ? t("Produsele alese nu au încă un preț mai vechi decât fereastra selectată. Încearcă o fereastră mai scurtă sau mai adaugă bonuri.")
              : t("Bifează mai jos produsele pe care vrei să le urmărești.")}
          </p>
        )}
        {basket.pending.length > 0 && (
          <p className="bf-price-pending">{t("În așteptarea unui al doilea preț: {items}", { items: basket.pending.slice(0, 6).join(", ") })}</p>
        )}

        <div className="bf-price-picker">
          <p className="bf-kicker">{t("PRODUSE DE URMĂRIT")}</p>
          <div className="bf-price-chips">
            {candidates.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected.includes(item.key)}
                className={selected.includes(item.key) ? "active" : ""}
                onClick={() => toggle(item.key)}
              >
                {item.label} <small>{item.observations.length}×</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bf-price-history" aria-labelledby="price-history-title">
        <div className="bf-section-heading">
          <div>
            <p className="bf-kicker">{t("ISTORIC PE PRODUS")}</p>
            <h2 id="price-history-title">{t("Unde a fost mai ieftin")}</h2>
          </div>
          <Store size={19} />
        </div>
        <div className="bf-price-list">
          {histories.slice(0, 30).map((item) => (
            <article key={item.key}>
              <header>
                <div>
                  <b>{item.label}</b>
                  <small>{t("{count} cumpărături · ultima {date}", { count: item.observations.length, date: dateText(item.latest.date) })}</small>
                </div>
                <strong>{fmtExact.format(item.latest.amount)}</strong>
              </header>
              <div className="bf-price-vendors">
                {item.byVendor.map((vendor) => (
                  <span key={vendor.vendor} className={item.byVendor.length > 1 && vendor.vendor === item.cheapest?.vendor ? "cheapest" : ""}>
                    {vendor.vendor} <b>{fmtExact.format(vendor.amount)}</b>
                  </span>
                ))}
              </div>
              <footer>
                <Trend percent={item.changePercent} />
                <small>{t("de la {amount} pe {date}", { amount: fmtExact.format(item.earliest.amount), date: dateText(item.earliest.date) })}</small>
              </footer>
            </article>
          ))}
        </div>
        <p className="bf-price-privacy">{t("Prețurile se potrivesc după denumirea citită de pe bon. Un gramaj diferit sau o promoție pot explica o diferență, așa că tratează comparația ca pe un indiciu, nu ca pe o concluzie.")}</p>
      </section>
    </div>
  );
}

/** Garanția SGR: plătită pe bonuri față de recuperată la reciclare, luna asta și anul acesta. */
function SgrCard({ data }: { data: AppData }) {
  const today = isoToday();
  const month = useMemo(() => sgrBalance(data, `${today.slice(0, 7)}-01`), [data.transactions, data.receipts, today]);
  const year = useMemo(() => sgrBalance(data, `${today.slice(0, 4)}-01-01`), [data.transactions, data.receipts, today]);
  if (!year.paid && !year.recovered) return null;
  const line = (value: { paid: number; recovered: number; net: number }) => value.net > 0.004
    ? t("ai plătit {paid} garanție, ai recuperat {recovered}: te-au costat {net}", { paid: fmtExact.format(value.paid), recovered: fmtExact.format(value.recovered), net: fmtExact.format(value.net) })
    : t("ai plătit {paid} garanție, ai recuperat {recovered}: ești pe plus cu {net}", { paid: fmtExact.format(value.paid), recovered: fmtExact.format(value.recovered), net: fmtExact.format(-value.net) });
  return (
    <section className="bf-price-basket" aria-labelledby="sgr-title">
      <div className="bf-section-heading"><div><p className="bf-kicker">{t("GARANȚIA SGR")}</p><h2 id="sgr-title">{t("Ambalaje plătite și returnate")}</h2></div></div>
      <p className="bf-price-intro"><b>{t("Luna asta")}:</b> {line(month)}.<br /><b>{t("Anul acesta")}:</b> {line(year)}.</p>
      <p className="bf-price-intro">{t("Voucherele de la automat le notezi ca venit (ex. „Voucher SGR”), pe sursa de tip voucher.")}</p>
    </section>
  );
}
