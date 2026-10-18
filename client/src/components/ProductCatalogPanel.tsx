/**
 * Rubrica Catalog: cauți articole (local + Open Food Facts) și le pui pe un
 * bon manual. Bonul se salvează ca cele fotografiate — apoi De verificat.
 */
import "../receipts-studio.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, ReceiptText, Search, Trash2 } from "lucide-react";
import { foldRomanian, isoToday, newId, parseRomanianAmount, type AppData, type Receipt } from "@/lib/finance-data";
import {
  CATALOG_STARTERS,
  classifyProductLabel,
  dominantReceiptCategory,
  searchOnlineProducts,
  searchProductCatalog,
  type ProductHit,
} from "@/lib/product-catalog";
import { isOfflineOnly } from "@/lib/ui-prefs";
import { fmtExact, money } from "@/pages/home-kit";
import { t } from "@/lib/i18n";
import { RoDateInput } from "@/components/RoDateInput";
import { selfMemberIdOf } from "@/lib/member-identity";

type Props = {
  data: AppData;
  onSaveReceipt: (item: Receipt) => void;
  onOpenReceiptForm: () => void;
};

type BasketLine = { id: string; name: string; category: string; amount: number };

const QUERY_KEY = "buget-familie:catalog-query";
const BASKET_KEY = "buget-familie:catalog-basket";

function readPrefill(): string {
  try {
    const value = sessionStorage.getItem(QUERY_KEY) || "";
    if (value) sessionStorage.removeItem(QUERY_KEY);
    return value;
  } catch {
    return "";
  }
}

function readBasket(): { vendor: string; date: string; lines: BasketLine[] } | undefined {
  try {
    const raw = sessionStorage.getItem(BASKET_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { vendor?: string; date?: string; lines?: BasketLine[] };
    if (!Array.isArray(parsed.lines)) return undefined;
    return { vendor: parsed.vendor || "", date: parsed.date || isoToday(), lines: parsed.lines.filter((line) => line?.name && line.amount > 0) };
  } catch {
    return undefined;
  }
}

export function ProductCatalogPanel({ data, onSaveReceipt, onOpenReceiptForm }: Props) {
  const saved = useMemo(() => readBasket(), []);
  const [query, setQuery] = useState(readPrefill);
  const [picked, setPicked] = useState<ProductHit | null>(null);
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState(saved?.vendor || "");
  const [date, setDate] = useState(saved?.date || isoToday());
  const [sourceId, setSourceId] = useState(data.settings.paymentSources[0]?.id || "");
  const [memberId, setMemberId] = useState(selfMemberIdOf(data));
  const [lines, setLines] = useState<BasketLine[]>(saved?.lines || []);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [onlineHits, setOnlineHits] = useState<ProductHit[]>([]);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const offline = isOfflineOnly();
  const hits = useMemo(() => searchProductCatalog(query, data.receipts, 18), [query, data.receipts]);
  const basketTotal = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;

  useEffect(() => {
    try { sessionStorage.setItem(BASKET_KEY, JSON.stringify({ vendor, date, lines })); } catch { /* ignore */ }
  }, [vendor, date, lines]);

  useEffect(() => {
    inputRef.current?.focus();
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<{ query?: string }>).detail?.query;
      if (typeof next === "string" && next.trim()) {
        setQuery(next.trim());
        setPicked(null);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("buget-familie:open-catalog", onOpen);
    return () => window.removeEventListener("buget-familie:open-catalog", onOpen);
  }, []);

  const [onlineQuery, setOnlineQuery] = useState("");
  useEffect(() => {
    const query = onlineQuery;
    if (offline || query.trim().length < 3) {
      setOnlineHits([]);
      setOnlineBusy(false);
      setOnlineError(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setOnlineBusy(true);
      setOnlineError(false);
      void searchOnlineProducts(query, { signal: controller.signal })
        .then((next) => { if (!controller.signal.aborted) setOnlineHits(next); })
        .catch(() => {
          if (controller.signal.aborted) return;
          setOnlineHits([]);
          setOnlineError(true);
        })
        .finally(() => { if (!controller.signal.aborted) setOnlineBusy(false); });
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [onlineQuery, offline]);
  useEffect(() => { if (onlineQuery && foldRomanian(onlineQuery) !== foldRomanian(query)) setOnlineQuery(""); }, [query]);

  const shownHits = useMemo(() => {
    const merged = [...hits];
    const seen = new Set(hits.map((item) => foldRomanian(item.name)));
    for (const hit of onlineHits) {
      const key = foldRomanian(hit.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(hit);
    }
    return merged.slice(0, 24);
  }, [hits, onlineHits]);

  const addToBasket = (hit: ProductHit, rawAmount: string) => {
    const value = parseRomanianAmount(rawAmount);
    if (!(value > 0)) {
      setError(t("Pune suma articolului, apoi îl pun pe bon."));
      return;
    }
    const category = hit.category || classifyProductLabel(hit.name);
    setLines((current) => [...current, { id: newId("line"), name: hit.name, category, amount: value }]);
    setPicked(null);
    setAmount("");
    setQuery("");
    setOnlineHits([]);
    setError("");
    setNotice("");
    window.setTimeout(() => inputRef.current?.focus(), 40);
  };

  const saveBon = () => {
    if (!lines.length) return setError(t("Adaugă cel puțin un articol pe bon."));
    if (!vendor.trim()) return setError(t("Scrie magazinul — e un bon, nu o listă rătăcită."));
    if (!sourceId || !memberId) return setError(t("Alege membrul și de unde s-au plătit."));
    const receipt: Receipt = {
      id: newId("receipt"),
      vendor: vendor.trim(),
      amount: basketTotal,
      category: dominantReceiptCategory(lines.map((line) => ({ category: line.category, amount: line.amount, label: line.name }))),
      date,
      sourceId,
      memberId,
      note: t("Bon creat din catalog."),
      lines: lines.map((line) => ({ id: line.id, category: line.category, amount: line.amount, label: line.name })),
      updatedAt: new Date().toISOString(),
    };
    onSaveReceipt(receipt);
    setLines([]);
    setVendor("");
    setNotice(t("Bonul e salvat. Îl vezi la Bonuri — confirmă-l la De verificat ca să intre în Mișcări."));
    setError("");
    try { sessionStorage.removeItem(BASKET_KEY); } catch { /* ignore */ }
  };

  const sourceLabel = (hit: ProductHit) =>
    hit.source === "bon" ? t("din bonurile tale") : hit.source === "online" ? t("din catalogul online") : t("din catalog");

  return (
    <div className="bf-receipts-studio bf-catalog-panel">
      <header className="bf-section-heading">
        <div>
          <p className="bf-kicker">{t("CATALOG")}</p>
          <h2>{t("Catalog de produse")}</h2>
        </div>
        <Search size={18} />
      </header>
      <p className="bf-helper bf-catalog-lead">{t("Cauți articolul, pui suma, salvezi bonul.")}</p>

      <section className="bf-receipts-search bf-catalog-search" aria-label={t("Caută un produs")}>
        <p className="bf-kicker">{t("CAUTĂ ȘI ADAUGĂ")}</p>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPicked(null); }}
          placeholder={t("ex. Napolact, lapte, Ariel")}
          autoComplete="off"
          aria-label={t("Caută un produs")}
        />
        {!query.trim() ? (
          <div className="bf-catalog-starters">
            {CATALOG_STARTERS.map((name) => (
              <button type="button" key={name} onClick={() => { setQuery(name); setPicked(null); }}>{name}</button>
            ))}
          </div>
        ) : null}

        {query.trim().length >= 2 ? (
          <div className="bf-receipts-hits">
            {shownHits.map((hit) => (
              <button type="button" key={`${hit.source}-${hit.name}`} onClick={() => { setPicked(hit); setAmount(""); setError(""); }}>
                <span>{hit.name}<small> · {sourceLabel(hit)} · {t(hit.category)}</small></span>
                <Plus size={14} />
              </button>
            ))}
            {!offline && query.trim().length >= 3 && onlineQuery !== query && <button type="button" className="bf-link-button" onClick={() => setOnlineQuery(query)}>{t("Caută și online")}</button>}
            {onlineBusy ? <p className="bf-helper">{t("Căutăm în catalogul online…")}</p> : null}
            {onlineError ? <p className="bf-helper">{t("Online n-a răspuns. Rămân rezultatele de pe telefon.")}</p> : null}
            {!shownHits.some((hit) => foldRomanian(hit.name) === foldRomanian(query)) ? (
              <button type="button" onClick={() => { setPicked({ name: query.trim(), category: classifyProductLabel(query), source: "catalog" }); setAmount(""); }}>
                <span>{t("Adaugă „{name}”", { name: query.trim() })}<small> · {t(classifyProductLabel(query))}</small></span>
                <Plus size={14} />
              </button>
            ) : null}
          </div>
        ) : (
          <p className="bf-helper">{offline ? t("Fără internet: căutăm doar pe telefon.") : t("Alege o sugestie sau scrie cel puțin 2 litere.")}</p>
        )}
      </section>

      {picked ? (
        <form className="bf-receipts-manual bf-catalog-amount" onSubmit={(event) => { event.preventDefault(); addToBasket(picked, amount); }}>
          <p className="bf-catalog-picked"><b>{picked.name}</b><small>{t(picked.category)} · {sourceLabel(picked)}</small></p>
          <label className="bf-field">
            <span>{t("Sumă")}</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0,00" autoFocus />
          </label>
          <div className="bf-receipts-actions bf-catalog-actions">
            <button type="submit" className="bf-primary" disabled={!(parseRomanianAmount(amount) > 0)}>{t("Pune pe bon")}</button>
            <button type="button" className="bf-ghost" onClick={() => setPicked(null)}>{t("Renunță")}</button>
          </div>
        </form>
      ) : null}

      <section className="bf-catalog-basket" aria-label={t("Bonul în lucru")}>
        <div className="bf-catalog-basket-head">
          <p className="bf-kicker">{t("BONUL ÎN LUCRU")}</p>
          {lines.length ? <strong>{fmtExact.format(basketTotal)} lei</strong> : <span>{t("Gol")}</span>}
        </div>
        <div className="bf-form-grid">
          <label className="bf-field">
            <span>{t("Magazin")}</span>
            <input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder={t("ex. Lidl")} />
          </label>
          <label className="bf-field">
            <span>{t("Data")}</span>
            <RoDateInput value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
          </label>
          <label className="bf-field">
            <span>{t("Membru")}</span>
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)}>{data.settings.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
          </label>
          <label className="bf-field">
            <span>{t("Plătit din")}</span>
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{data.settings.paymentSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
          </label>
        </div>
        {lines.length ? (
          <ul className="bf-catalog-lines">
            {lines.map((line) => (
              <li key={line.id}>
                <div>
                  <b>{line.name}</b>
                  <small>{t(line.category)}</small>
                </div>
                <strong>{money(line.amount)}</strong>
                <button type="button" aria-label={t("Elimină produsul")} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bf-helper">{t("Niciun articol. Caută mai sus.")}</p>
        )}
        <div className="bf-receipts-actions bf-catalog-actions">
          <button type="button" className="bf-primary" disabled={!lines.length} onClick={saveBon}>
            {lines.length ? `${t("Salvează bonul")} · ${fmtExact.format(basketTotal)}` : t("Salvează bonul")}
          </button>
          <button type="button" className="bf-ghost" onClick={onOpenReceiptForm}><ReceiptText size={16} /> {t("Adaugă bon")}</button>
        </div>
        {error ? <p className="bf-form-error" role="alert">{error}</p> : null}
        {notice ? <p className="bf-helper" role="status">{notice}</p> : null}
      </section>
    </div>
  );
}
