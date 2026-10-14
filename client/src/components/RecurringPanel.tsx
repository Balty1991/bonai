/** Atelierul Financiar 2.0 — plăți recurente rezervate în planul până la salariu. */
import { setRecurringAmount } from "@/lib/monthly-bills";
import "../recurring.css";
import { useMemo, useState } from "react";
import { CalendarClock, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { recurringNextDue, recurringPaidInPlan, isoToday, TOMBSTONE_MAX, autoPostDueRecurring, confirmRecurringPayment, expenseCategories, newId, parseRomanianAmount, pendingRecurringInPlan, sourceBalance, type AppData, type RecurringFrequency, type RecurringPayment } from "@/lib/finance-data";
import { getLocale, t } from "@/lib/i18n";
import { dateText } from "@/pages/home-kit";
import { selfMemberIdOf } from "@/lib/member-identity";
import { askConfirm } from "@/lib/confirm-dialog";
import { lei } from "@/lib/money-format";
import { recurringPriceChanges, subscriptionSpend } from "@/lib/household-insights";

const monthName = (month: number) => new Intl.DateTimeFormat(getLocale(), { month: "long" }).format(new Date(2026, month - 1, 1));

/** „Ziua 5”, „Ziua 5 · trimestrial: ian., apr., iul., oct.”, „5 martie · anual”. */
export function recurringScheduleLabel(item: Pick<RecurringPayment, "dueDay" | "frequency" | "month">) {
  if (item.frequency === "yearly") return t("{day} {month} · anual", { day: item.dueDay, month: monthName(item.month || 1) });
  if (item.frequency === "quarterly") {
    const first = item.month || 1;
    const months = [0, 3, 6, 9].map((offset) => new Intl.DateTimeFormat(getLocale(), { month: "short" }).format(new Date(2026, ((first - 1 + offset) % 12), 1)));
    return t("Ziua {day} · trimestrial: {months}", { day: item.dueDay, months: months.join(", ") });
  }
  return t("Ziua {day}", { day: item.dueDay });
}

const money = lei;

export function RecurringPanel({ data, onChange }: { data: AppData; onChange: (next: AppData) => void }) {
  const rises = useMemo(() => recurringPriceChanges(data), [data]);
  const spend = useMemo(() => subscriptionSpend(data), [data]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Casă & facturi");
  const [sourceId, setSourceId] = useState(data.settings.paymentSources[0]?.id || "");
  const [memberId, setMemberId] = useState(selfMemberIdOf(data));
  const [dueDay, setDueDay] = useState("1");
  const [autoPost, setAutoPost] = useState(false);
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [variable, setVariable] = useState(false);
  /** Scadența variabilă confirmată acum: suma reală de pe factură. */
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const pending = pendingRecurringInPlan(data);
  const source = data.settings.paymentSources.find((item) => item.id === sourceId);
  const member = data.settings.members.find((item) => item.id === memberId);

  const resetForm = () => {
    setName("");
    setAmount("");
    setDueDay("1");
    setAutoPost(false);
    setFrequency("monthly");
    setVariable(false);
    setError("");
    setEditingId(null);
  };

  const startEdit = (item: RecurringPayment) => {
    setEditingId(item.id);
    setName(item.name);
    setAmount(String(item.amount).replace(".", ","));
    setCategory(item.category);
    setSourceId(item.sourceId);
    setMemberId(item.memberId);
    setDueDay(String(item.dueDay));
    setAutoPost(Boolean(item.autoPost));
    setFrequency(item.frequency || "monthly");
    setMonth(String(item.month || new Date().getMonth() + 1));
    setVariable(Boolean(item.variable));
    setError("");
  };

  const save = () => {
    const numeric = parseRomanianAmount(amount);
    const due = Math.round(parseRomanianAmount(dueDay));
    if (!name.trim() || numeric <= 0 || !source || !member || due < 1 || due > 31) {
      return setError(t("Completează denumirea, suma, ziua (1–31), membrul și sursa."));
    }
    const now = new Date().toISOString();
    const schedule = {
      frequency: frequency === "monthly" ? undefined : frequency,
      month: frequency === "monthly" ? undefined : Math.min(12, Math.max(1, Number(month) || 1)),
      variable: variable || undefined,
      autoPost: autoPost && !variable,
    };
    if (editingId) {
      const next: RecurringPayment[] = data.recurring.map((entry) => entry.id === editingId
        ? { ...entry, name: name.trim(), amount: numeric, category, sourceId, memberId, dueDay: due, ...schedule, updatedAt: now }
        : entry);
      onChange(autoPostDueRecurring({ ...data, recurring: next }));
      resetForm();
      return;
    }
    const item: RecurringPayment = { id: newId("recurring"), name: name.trim(), amount: numeric, category, sourceId, memberId, dueDay: due, active: true, ...schedule, updatedAt: now };
    onChange(autoPostDueRecurring({ ...data, recurring: [...data.recurring, item] }));
    resetForm();
  };

  const pay = (item: typeof pending[number]) => {
    if (item.variable && payingId !== item.id) {
      setPayingId(item.id);
      setPaidAmount(String(item.amount).replace(".", ","));
      return;
    }
    const real = item.variable ? parseRomanianAmount(paidAmount) : undefined;
    if (item.variable && !(real && real > 0)) return setError(t("Scrie suma de pe factură."));
    const next = confirmRecurringPayment(data, item.id, real);
    if (next) onChange(next);
    setPayingId(null);
    setPaidAmount("");
    setError("");
  };

  /**
   * Plățile anuale și trimestriale (RCA, impozit) nu trebuie să vină deodată: le propunem
   * un fond în „Evenimente viitoare”, unde se vede cât pui deoparte pe lună și cât ai strâns.
   */
  const fundFor = (item: RecurringPayment) => (data.settings.plannedEvents || []).find((event) => event.note === `recurring:${item.id}`);
  const createFund = (item: RecurringPayment) => {
    const date = recurringNextDue(item);
    if (!date || fundFor(item)) return;
    const now = new Date().toISOString();
    const event = { id: newId("event"), name: item.name, date, estimate: item.amount, kind: "other" as const, repeat: item.frequency === "yearly" ? "yearly" as const : "once" as const, note: `recurring:${item.id}`, memberId: item.memberId, updatedAt: now };
    onChange({ ...data, settings: { ...data.settings, plannedEvents: [...(data.settings.plannedEvents || []), event] } });
  };
  const today = isoToday();

  return (
    <div className="bf-recurring">
      <section className="bf-recurring-hero">
        <CalendarClock size={24} />
        <div>
          <p className="bf-kicker">{t("SCADENȚE CONTROLATE")}</p>
          <h2>{t("Chirie și abonamente, fără uitare")}</h2>
          <p>{spend.count > 0 && <><strong>{t("Abonamente: {monthly} pe lună · {yearly} pe an.", { monthly: money(spend.monthly), yearly: money(spend.yearly) })}</strong>{" "}</>}{t("La deschiderea aplicației, plățile automate scadente din luna curentă intră în registru o singură dată. Poți păstra orice scadență pe confirmare manuală.")}</p>
        </div>
      </section>
      {rises.length > 0 && (
        <section className="bf-recurring-card" aria-labelledby="bf-recurring-rises">
          <p className="bf-kicker" id="bf-recurring-rises">{t("S-AU SCUMPIT")}</p>
          <div className="bf-recurring-list">
            {rises.map((item) => (
              <article key={item.recurringId}>
                <div>
                  <b>{item.name}</b>
                  <small>{t("Ultima plată, pe {date}: {to} în loc de {from}.", { date: dateText(item.date), to: money(item.to), from: money(item.from) })}</small>
                </div>
                <strong>+{money(item.to - item.from)}</strong>
                <button type="button" className="bf-secondary" onClick={() => onChange({ ...data, recurring: data.recurring.map((entry) => entry.id === item.recurringId ? { ...entry, amount: item.to, updatedAt: new Date().toISOString() } : entry) })}>{t("Folosește {amount}", { amount: money(item.to) })}</button>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="bf-recurring-card">
        <p className="bf-kicker">{editingId ? t("MODIFICĂ SCADENȚA") : t("ADĂUGĂ O SCADENȚĂ")}</p>
        <div className="bf-recurring-form">
          <label>{t("Denumire")}<input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("ex. Chirie")} /></label>
          <label>{t("Sumă (lei)")}<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></label>
          <label>{t("Ziua lunii")}<input inputMode="numeric" value={dueDay} onChange={(event) => setDueDay(event.target.value)} placeholder={t("ex. 5")} /></label>
          <label>{t("Cât de des")}<select value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}><option value="monthly">{t("Lunar")}</option><option value="quarterly">{t("Trimestrial")}</option><option value="yearly">{t("Anual")}</option></select></label>
          {frequency !== "monthly" && <label>{frequency === "yearly" ? t("Luna") : t("Una dintre luni")}<select value={month} onChange={(event) => setMonth(event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{monthName(index + 1)}</option>)}</select></label>}
          <label>{t("Membru")}<select value={memberId} onChange={(event) => setMemberId(event.target.value)}>{data.settings.members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>{t("Plătit din")}<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>{data.settings.paymentSources.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(sourceBalance(data, item.id))}</option>)}</select></label>
          <label>{t("Categorie")}<select value={category} onChange={(event) => setCategory(event.target.value)}>{[...expenseCategories, ...data.settings.customCategories].map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></label>
        </div>
        <label className="bf-recurring-auto">
          <input type="checkbox" checked={variable} onChange={(event) => { setVariable(event.target.checked); if (event.target.checked) setAutoPost(false); }} />
          <span>
            <b>{t("Suma variază (curent, gaz)")}</b>
            <small>{t("Suma de mai sus e o estimare și se rezervă ca atare. La plată scrii valoarea de pe factură.")}</small>
          </span>
        </label>
        <label className="bf-recurring-auto">
          <input type="checkbox" checked={autoPost} disabled={variable} onChange={(event) => setAutoPost(event.target.checked)} />
          <span>
            <b>{t("Adaugă automat în registru")}</b>
            <small>{variable ? t("Nu merge cu sumă variabilă: suma exactă e cea de pe factură, așa că plata o confirmi tu, cu un singur buton.") : t("La prima deschidere din ziua scadenței sau după; nu poate dubla plata.")}</small>
          </span>
        </label>
        {error && <p className="bf-form-error" role="alert">{error}</p>}
        <div className="bf-recurring-form-actions">
          <button className="bf-primary" onClick={save}>{editingId ? <><Check size={17} /> {t("Actualizează scadența")}</> : <><Plus size={17} /> {t("Salvează scadența")}</>}</button>
          {editingId && <button type="button" className="bf-secondary" onClick={resetForm}><X size={16} /> {t("Anulează modificarea")}</button>}
        </div>
      </section>
      <section className="bf-recurring-card">
        <div className="bf-section-heading">
          <div>
            <p className="bf-kicker">{t("ÎN PERIOADA ACTIVĂ")}</p>
            <h2>{t("De rezervat până la venit")}</h2>
          </div>
          <strong>{money(pending.reduce((sum, item) => sum + item.amount, 0))}</strong>
        </div>
        <div className="bf-recurring-list">
          {pending.map((item) => (
            <article key={item.id}>
              <div>
                <b>{item.name}</b>
                <small>{t("Scadență: {date}", { date: dateText(item.dueDate, true) })} · {data.settings.paymentSources.find((entry) => entry.id === item.sourceId)?.name}{(() => { const balance = sourceBalance(data, item.sourceId); return ` · ${money(balance)}${balance < item.amount ? ` — ${t("nu acoperă")}` : ""}`; })()}</small>
              </div>
              <strong>{item.variable ? t("~{amount}", { amount: money(item.amount) }) : money(item.amount)}</strong>
              {payingId === item.id && (
                <label className="bf-recurring-paid-amount">{t("Suma de pe factură")}<input inputMode="decimal" autoFocus value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") pay(item); }} /></label>
              )}
              <div className="bf-recurring-actions">
                <button className="bf-secondary" onClick={() => pay(item)}><Check size={16} /> {payingId === item.id ? t("Confirmă plata") : t("Plătită")}</button>
                {/* Factura a venit, dar se plătește mai târziu: doar suma estimată devine cea reală. */}
                {item.variable && payingId === item.id && <button type="button" className="bf-link-button" onClick={() => { const real = parseRomanianAmount(paidAmount); if (!(real > 0)) return setError(t("Scrie suma de pe factură.")); onChange(setRecurringAmount(data, item.id, real)); setPayingId(null); setPaidAmount(""); setError(""); }}>{t("Doar actualizez suma (plătesc mai târziu)")}</button>}
                <button type="button" className="bf-recurring-edit" aria-label={t("Modifică {name}", { name: item.name })} onClick={() => startEdit(item)}><Pencil size={16} /></button>
              </div>
            </article>
          ))}
          {!pending.length && <p className="bf-empty-inline">{t("Nu ai plăți recurente de rezervat în intervalul ales sau toate au fost confirmate.")}</p>}
        </div>
      </section>
      <section className="bf-recurring-card">
        <p className="bf-kicker">{t("TOATE SCADENȚELE")}</p>
        <div className="bf-recurring-list">
          {data.recurring.map((item) => {
            const paid = recurringPaidInPlan(data, item);
            const toggleAuto = () => onChange(autoPostDueRecurring({ ...data, recurring: data.recurring.map((entry) => entry.id === item.id ? { ...entry, autoPost: !entry.autoPost, updatedAt: new Date().toISOString() } : entry) }));
            const remove = () => {
              const now = new Date().toISOString();
              onChange({ ...data, recurring: data.recurring.filter((entry) => entry.id !== item.id), deleted: [...data.deleted, { entity: "recurring" as const, id: item.id, deletedAt: now }].slice(-TOMBSTONE_MAX) });
              if (editingId === item.id) resetForm();
            };
            return (
              <article key={item.id} className={!item.active ? "muted" : editingId === item.id ? "is-editing" : ""}>
                <div>
                  <b>{item.name}</b>
                  <small>{recurringScheduleLabel(item)} · {t(item.category)}{item.variable ? ` · ${t("sumă estimată")}` : ""}</small>
                </div>
                <strong>{money(item.amount)}</strong>
                <span className={paid ? "done" : ""}>{paid ? t("Înregistrată") : item.autoPost ? t("Automată") : item.active ? t("Confirmare manuală") : t("Oprită")}</span>
                <div className="bf-recurring-actions">
                  <button className="bf-recurring-toggle" onClick={toggleAuto}>{item.autoPost ? t("Treci pe manual") : t("Treci pe automat")}</button>
                  <button type="button" className="bf-recurring-edit" aria-label={t("Modifică {name}", { name: item.name })} onClick={() => startEdit(item)}><Pencil size={16} /></button>
                  <button className="bf-recurring-delete" aria-label={t("Șterge {name}", { name: item.name })} onClick={async () => await askConfirm(t("Ștergi scadența „{name}”?", { name: item.name })) && remove()}><Trash2 size={16} /></button>
                </div>
                {item.active && item.frequency && (() => {
                  const next = recurringNextDue(item, today);
                  if (!next) return null;
                  const days = Math.max(1, Math.round((Date.parse(`${next}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000));
                  const perMonth = Math.ceil(item.amount * 30 / days / 5) * 5;
                  const fund = fundFor(item);
                  return <p className="bf-recurring-fund">{fund
                    ? t("Fond în Evenimente viitoare, până pe {date}.", { date: dateText(next, true) })
                    : days > 31
                      ? <>{t("Ca să nu vină deodată: ~{amount}/lună până pe {date}.", { amount: money(perMonth), date: dateText(next, true) })} <button type="button" className="bf-link-button" onClick={() => createFund(item)}>{t("Pune deoparte lunar")}</button></>
                      : t("Vine pe {date}: suma e deja rezervată până la venit.", { date: dateText(next, true) })}</p>;
                })()}
              </article>
            );
          })}
          {!data.recurring.length && <p className="bf-empty-inline">{t("Adaugă facturile, ratele și contribuțiile care trebuie rezervate înainte de salariu.")}</p>}
        </div>
      </section>
    </div>
  );
}
