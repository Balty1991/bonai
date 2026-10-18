/**
 * Lista de cumpărături a familiei: scrii „lapte, pâine, ouă”, bifezi în magazin, iar la final
 * „Notează plata” golește ce ai luat și deschide formularul rapid pe Alimente. Lista se
 * sincronizează cu partenerul ca restul datelor familiei.
 */
import "../shopping-list.css";
import { lazy, Suspense, useMemo, useState } from "react";
import { Barcode, Check, ListChecks, Plus, ReceiptText, X } from "lucide-react";
import { nameScore, openFoodFactsName, readBarcodeLinks } from "@/lib/barcode-check";
import { productObservations } from "@/lib/personal-inflation";
const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner").then((module) => ({ default: module.BarcodeScanner })));
import { isoToday, newId, type AppData } from "@/lib/finance-data";
import { lei } from "@/lib/money-format";
import { estimateShopping } from "@/lib/shopping-price";
import { t } from "@/lib/i18n";
import { selfMemberIdOf } from "@/lib/member-identity";
import { SHOPPING_LIMIT, splitShoppingText, visibleShopping, type ShoppingItem } from "@/lib/shopping-list";

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("ro-RO", { day: "numeric", month: "short" });

export function ShoppingListPanel({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const [draft, setDraft] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string>();
  const list = data.settings.shoppingList || [];
  const { todo, done } = visibleShopping(list);
  const me = selfMemberIdOf(data);
  const estimate = useMemo(() => estimateShopping(visibleShopping(list).todo, data.receipts, isoToday()), [list, data.receipts]);
  const nameOf = (id?: string) => (data.settings.members.length > 1 && id && id !== me ? data.settings.members.find((member) => member.id === id)?.name : undefined);
  const save = (next: ShoppingItem[]) => onChange({ ...data, settings: { ...data.settings, shoppingList: next.slice(0, SHOPPING_LIMIT) } });
  const touch = (id: string, patch: Partial<ShoppingItem>) => save(list.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));

  const add = () => {
    const names = splitShoppingText(draft);
    if (!names.length) return;
    const now = Date.now();
    // Același produs încă de luat nu se dublează; unul golit demult revine ca nou.
    const open = new Set(todo.map((item) => item.text.toLocaleLowerCase("ro-RO")));
    const fresh = names.filter((name) => !open.has(name.toLocaleLowerCase("ro-RO"))).map((text, index) => ({ id: newId("shop"), text, by: me, updatedAt: new Date(now + index).toISOString() }));
    if (fresh.length) save([...fresh, ...list]);
    setDraft("");
  };
  /** Codul scanat devine numele produsului tău (legătura salvată) sau numele din Open Food Facts; altfel îl scrii tu. */
  const scanned = async (code: string) => {
    setScanning(false);
    const key = data.settings.barcodeLinks?.[code]?.key || readBarcodeLinks()[code];
    const mine = key ? productObservations(data).find((o) => o.key === key)?.label : undefined;
    setScanNote(t("Caut produsul…"));
    const name = mine || await openFoodFactsName(code);
    // Produsul e deja pe listă: îl bifezi, nu-l mai adaugi o dată.
    const onList = name ? todo.map((item) => ({ item, score: nameScore(name, item.text) })).filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score)[0]?.item : undefined;
    if (onList) { touch(onList.id, { done: true }); setScanNote(t("Bifat în coș: {name}.", { name: onList.text })); return; }
    if (name) { setDraft(name); setScanNote(t("Am găsit: {name}. Apasă Adaugă.", { name })); }
    else setScanNote(t("Nu găsesc codul {code}. Scrie numele produsului.", { code }));
  };
  const finish = () => {
    const stamp = new Date().toISOString();
    save(list.map((item) => item.done && !item.cleared ? { ...item, cleared: true, updatedAt: stamp } : item));
    window.dispatchEvent(new Event("buget-familie:open-expense"));
  };

  const row = (item: ShoppingItem) => <li key={item.id} className={item.done ? "is-done" : ""}>
    <button type="button" className="bf-shop-check" aria-pressed={Boolean(item.done)} aria-label={item.done ? t("Scoate bifa de la {item}", { item: item.text }) : t("Bifează {item}", { item: item.text })} onClick={() => touch(item.id, { done: !item.done })}>{item.done ? <Check size={16} aria-hidden="true" /> : null}</button>
    <span><b>{item.text}</b>{nameOf(item.by) && <small>{t("adăugat de {name}", { name: nameOf(item.by)! })}</small>}{!item.done && estimate.prices[item.id] && <small>{t("ultima dată la {vendor}, {date}", { vendor: estimate.prices[item.id].vendor, date: shortDay(estimate.prices[item.id].date) })}</small>}{!item.done && estimate.prices[item.id]?.cheapest && <small className="is-tip">{t("mai ieftin la {vendor}: {price}", { vendor: estimate.prices[item.id].cheapest!.vendor, price: lei(estimate.prices[item.id].cheapest!.price) })}</small>}</span>
    {!item.done && estimate.prices[item.id] && <em className="bf-shop-price" title={t("ultimul preț, {vendor}", { vendor: estimate.prices[item.id].vendor })}>~{lei(estimate.prices[item.id].price)}</em>}
    <button type="button" className="bf-shop-remove" aria-label={t("Scoate {item} din listă", { item: item.text })} onClick={() => touch(item.id, { cleared: true })}><X size={16} aria-hidden="true" /></button>
  </li>;

  return <section className="bf-shopping" aria-labelledby="bf-shopping-title">
    <header>
      <p className="bf-kicker">{t("CUMPĂRĂTURI")}</p>
      <h2 id="bf-shopping-title">{t("Lista familiei")}</h2>
      <p>{data.settings.members.length > 1 ? t("Ce scrie unul apare și pe telefonul celuilalt, la sincronizare.") : t("Scrie ce trebuie luat; bifezi în magazin.")}</p>
    </header>
    <form className="bf-shop-add" onSubmit={(event) => { event.preventDefault(); add(); }}>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("lapte, pâine, ouă…")} aria-label={t("Ce trebuie luat")} enterKeyHint="done" />
      <button type="button" className="bf-shop-barcode" aria-label={t("Scanează codul de bare")} onClick={() => { setScanNote(undefined); setScanning(true); }}><Barcode size={20} aria-hidden="true" /></button>
      <button type="submit" className="bf-primary" disabled={!draft.trim()}><Plus size={18} aria-hidden="true" /> {t("Adaugă")}</button>
    </form>
    {scanNote && <p className="bf-helper" role="status">{scanNote}</p>}
    {scanning && <Suspense fallback={null}><BarcodeScanner onCode={(code) => void scanned(code)} onClose={() => setScanning(false)} /></Suspense>}
    {estimate.known > 0 && <div className="bf-shop-estimate">
      <p><small className="bf-kicker">{t("COȘ ESTIMAT")}</small><b>~{lei(estimate.total)}</b></p>
      <span>{estimate.known === todo.length ? t("după prețurile de pe bonurile voastre") : t("pentru {known} din {count} produse, după bonurile voastre", { known: estimate.known, count: todo.length })}</span>
      {estimate.bestVendor && <span className="is-tip">{t("La {vendor} ar ieși ~{total}, cu {saves} mai puțin.", { vendor: estimate.bestVendor.vendor, total: lei(estimate.bestVendor.total), saves: lei(estimate.bestVendor.saves) })}</span>}
    </div>}
    {todo.length > 0 ? <ul className="bf-shop-list">{todo.map(row)}</ul> : <div className="bf-shop-empty"><ListChecks size={22} aria-hidden="true" /><p>{done.length ? t("Ai luat tot de pe listă.") : t("Lista e goală. Scrie mai multe deodată, despărțite prin virgulă.")}</p></div>}
    {done.length > 0 && <>
      <p className="bf-kicker bf-shop-done-title">{t("ÎN COȘ · {count}", { count: done.length })}</p>
      <ul className="bf-shop-list is-done">{done.map(row)}</ul>
      <button type="button" className="bf-primary bf-shop-finish" onClick={finish}><ReceiptText size={18} aria-hidden="true" /> {t("Am terminat — notează plata")}</button>
      <p className="bf-helper">{t("Scoate din listă ce ai luat și deschide Notează pe Alimente, cu plicul lui.")}</p>
    </>}
  </section>;
}
