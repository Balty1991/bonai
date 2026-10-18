import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, RotateCcw, Scale } from "lucide-react";
import { formatDate, newId, parseRomanianAmount, sourceBalance, type AppData, type Transaction } from "@/lib/finance-data";
import { applyDeclaredBalance } from "@/lib/balance-check";
import { outdatedSyncDevices } from "@/lib/sync-devices";
import { brokenSplits, isSplitPartner } from "@/lib/split-payment";
import { forgetRemoved, readRemovedBin, repairSplit, restoreRemoved } from "@/lib/removed-bin";
import { askConfirm } from "@/lib/confirm-dialog";
import { t } from "@/lib/i18n";
import { fmtExact, Modal } from "@/pages/home-kit";

const money = (value: number) => fmtExact.format(value);
/** Linkurile lungi se rup pe rânduri: pe 360 px, cu fontul mare, ieșeau din ecran. */
const TOOLS = { order: 99, display: "grid", gap: 6, margin: "16px 0 8px", padding: "12px 14px", border: "1px solid var(--cf-line)", borderRadius: 16, background: "var(--cf-surface)" } as const;
const WRAP = { whiteSpace: "normal", textAlign: "left", overflowWrap: "anywhere", maxWidth: "100%", minWidth: 0, justifySelf: "start" } as const;

/**
 * Siguranța registrului, în Mișcări:
 * - bonul plătit din două surse din care a rămas o singură parte apare cu roșu, cu „Repară”;
 * - „Șterse recent” arată tot ce a dispărut în ultimele 60 de zile, cu „Pune înapoi”.
 */
export function LedgerSafety({ data, onChange, onEdit, part = "alerts" }: { data: AppData; onChange: (next: AppData) => void; onEdit: (item: Transaction) => void; part?: "alerts" | "tools" }) {
  const [binVersion, setBinVersion] = useState(0);
  const [binOpen, setBinOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const pockets = data.settings.paymentSources.filter((source) => source.kind !== "transfer");
  const [matchSource, setMatchSource] = useState(pockets[0]?.id || "");
  const [matchAmount, setMatchAmount] = useState("");
  useEffect(() => {
    const refresh = () => setBinVersion((value) => value + 1);
    window.addEventListener("buget-familie:removed-bin", refresh);
    return () => window.removeEventListener("buget-familie:removed-bin", refresh);
  }, []);
  const broken = useMemo(() => brokenSplits(data.transactions), [data.transactions]);
  // binVersion reîncarcă lista când se schimbă coșul.
  const bin = useMemo(() => readRemovedBin().filter((entry) => entry.entity === "receipts" ? !data.receipts.some((item) => item.id === entry.row.id) : !data.transactions.some((item) => item.id === entry.row.id)).reverse(), [binVersion, data.transactions, data.receipts]);

  const repair = (item: (typeof broken)[number]) => {
    const fixed = repairSplit(data, item, isSplitPartner, () => newId("tx"));
    if (fixed) onChange(fixed);
    else onEdit(item.kept);
  };
  const restore = async (key: string, label: string) => {
    if (!await askConfirm(t("Pui înapoi „{label}” în registru?", { label }), { confirmLabel: t("Pune înapoi") })) return;
    onChange(restoreRemoved(data, [key]));
  };

  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("buget-familie:outdated-hidden") || "[]") as string[]; } catch { return []; } });
  // Un telefon vechi la care omul nu mai are acces (dat, resetat) se poate ascunde; revine dacă se sincronizează din nou.
  const outdated = outdatedSyncDevices(data).filter((item) => !hidden.includes(`${item.id}:${item.lastSeenAt}`));
  const hideDevice = (key: string) => { const next = [...hidden, key].slice(-20); setHidden(next); try { localStorage.setItem("buget-familie:outdated-hidden", JSON.stringify(next)); } catch { /* fără stocare */ } };
  // Avertismentele stau sus, peste listă; uneltele de corectură, jos, după mișcări.
  if (part === "alerts") return <>
    {outdated.length > 0 && <section className="bf-envelope-conflicts bf-movement-conflicts" aria-live="polite">
      <div className="bf-envelope-conflicts-heading">
        <AlertTriangle size={18} aria-hidden="true" />
        <div>
          <p className="bf-kicker">{t("TELEFON CU APLICAȚIE VECHE")}</p>
          <h2>{t("Actualizează aplicația pe celălalt telefon")}</h2>
          <p>{t("{device}, văzut ultima dată {when}, are o versiune veche. Versiunile vechi pot șterge din greșeală o parte din bonurile plătite din două surse, iar ștergerea ajunge prin sincronizare și aici. Actualizează BonAI din Magazin Play pe acel telefon.", { device: outdated[0].label, when: new Date(outdated[0].lastSeenAt).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p>
        </div>
      </div>
      <button type="button" className="bf-link-button" style={WRAP} onClick={() => hideDevice(`${outdated[0].id}:${outdated[0].lastSeenAt}`)}>{t("Nu mai folosesc acel telefon")}</button>
    </section>}
    {broken.length > 0 && <section className="bf-envelope-conflicts bf-movement-conflicts" aria-live="polite">
      <div className="bf-envelope-conflicts-heading">
        <AlertTriangle size={18} aria-hidden="true" />
        <div>
          <p className="bf-kicker">{t("BON INCOMPLET")}</p>
          <h2>{t("Un bon plătit din două surse are doar o parte în registru")}</h2>
          <p>{t("Suma rămasă nu dă totalul bonului, iar soldurile surselor nu mai sunt corecte.")}</p>
        </div>
      </div>
      <ul className="bf-envelope-conflicts-list">
        {broken.map((item) => <li key={item.kept.id}>
          <div>
            <b>{item.kept.title} · {formatDate(item.kept.date, { day: "numeric", month: "long" })}</b>
            <small>{t("Bon de {total}, în registru {kept}. Lipsesc {missing}{source}.", { total: money(item.total), kept: money(item.total - item.missing), missing: money(item.missing), source: item.missingSource ? ` ${t("din {source}", { source: item.missingSource })}` : "" })}</small>
          </div>
          <div className="bf-envelope-conflicts-actions">
            <button type="button" className="bf-primary" onClick={() => repair(item)}>{t("Repară")}</button>
            <button type="button" className="bf-secondary" onClick={() => onEdit(item.kept)}>{t("Deschide")}</button>
          </div>
        </li>)}
      </ul>
    </section>}
  </>;
  return <section className="bf-ledger-tools" aria-labelledby="bf-ledger-tools-title" style={TOOLS}>
    <p className="bf-kicker" id="bf-ledger-tools-title">{t("CEVA NU SE POTRIVEȘTE?")}</p>
    <button type="button" className="bf-link-button" style={{ ...WRAP, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setMatchOpen(true)}><Scale size={15} aria-hidden="true" /> {t("Potrivește soldul cu banii reali")}</button>
    {matchOpen && <Modal title={t("Potrivește soldul")} onClose={() => setMatchOpen(false)}>
      <p className="bf-helper">{t("Scrie câți bani ai de fapt. Diferența intră în Mișcări ca „Corecție de sold”, cu ziua de azi: soldul devine cel real, iar diferența nu apare ca cheltuială pe o categorie și nu strică analiza.")}</p>
      <label className="bf-field"><span>{t("Sursa")}</span><select value={matchSource} onChange={(event) => setMatchSource(event.target.value)}>{pockets.map((source) => <option key={source.id} value={source.id}>{source.name} · {t("în aplicație")} {money(sourceBalance(data, source.id))}</option>)}</select></label>
      <label className="bf-field"><span>{t("Cât ai de fapt (lei)")}</span><input inputMode="decimal" value={matchAmount} onChange={(event) => setMatchAmount(event.target.value)} placeholder="0,00" /></label>
      {matchAmount.trim() !== "" && <p className="bf-helper">{(() => { const diff = Math.round((parseRomanianAmount(matchAmount) - sourceBalance(data, matchSource)) * 100) / 100; return Math.abs(diff) < 0.005 ? t("Se potrivește deja.") : diff < 0 ? t("Lipsesc {amount} față de aplicație: intră ca ieșire.", { amount: money(-diff) }) : t("Ai cu {amount} mai mult decât arată aplicația: intră ca intrare.", { amount: money(diff) }); })()}</p>}
      <button type="button" className="bf-primary full" disabled={matchAmount.trim() === ""} onClick={() => { onChange(applyDeclaredBalance(data, matchSource, parseRomanianAmount(matchAmount))); setMatchOpen(false); setMatchAmount(""); }}>{t("Potrivește")}</button>
    </Modal>}
    {bin.length > 0 && <button type="button" className="bf-link-button" style={{ ...WRAP, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setBinOpen(true)}><History size={15} aria-hidden="true" /> {t("Șterse recent ({count})", { count: bin.length })}</button>}
    {binOpen && <Modal title={t("Șterse recent")} onClose={() => setBinOpen(false)}>
      <p className="bf-helper">{t("Tot ce a ieșit din registru în ultimele 60 de zile, pe telefonul acesta: șters de tine, la o corectură sau la sincronizare. Pune înapoi ce nu trebuia să plece.")}</p>
      <ul className="bf-envelope-conflicts-list">
        {bin.map((entry) => {
          const label = entry.entity === "transactions" ? entry.row.title : t("Bon {vendor}", { vendor: entry.row.vendor });
          const amount = entry.row.amount;
          const detail = entry.entity === "transactions"
            ? `${money(amount)} · ${entry.row.source} · ${formatDate(entry.row.date, { day: "numeric", month: "short" })}`
            : `${money(amount)} · ${t("{count} articole", { count: entry.row.lines?.length || 0 })}`;
          return <li key={entry.key}>
            <div><b>{label}</b><small>{detail} · {t("scos {when}", { when: new Date(entry.removedAt).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</small></div>
            <div className="bf-envelope-conflicts-actions">
              <button type="button" className="bf-secondary" onClick={() => void restore(entry.key, label)}><RotateCcw size={15} aria-hidden="true" /> {t("Pune înapoi")}</button>
            </div>
          </li>;
        })}
      </ul>
      <button type="button" className="bf-link-button" style={WRAP} onClick={() => { forgetRemoved(bin.map((entry) => entry.key)); setBinOpen(false); }}>{t("Golește lista")}</button>
    </Modal>}
  </section>;
}
