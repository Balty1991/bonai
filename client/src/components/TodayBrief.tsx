import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { answerReviewPrompt, requestInAppReview, reviewPromptDue } from "@/lib/review-prompt";
import { applySalaryAllocationRules, activeSalaryApplications, revertSalaryAllocationApplication, autoPostDueRecurring, confirmRecurringPayment, eligibleSalaryAllocationRules, isoToday, parseRomanianAmount, unappliedSalaryIncomes, type AppData } from "@/lib/finance-data";
import { applyDeclaredBalance, balanceCheckDue, markBalanceChecked, readLastBalanceCheck, retireIgnoredBalanceCheck, type BalanceCheckRow, type BalanceMeaning } from "@/lib/balance-check";
import { cycleClose } from "@/lib/cycle-close";
import { pendingSplitIncome } from "@/lib/monthly-needs";
import { IncomeSplitCard } from "@/components/IncomeSplitCard";
import { activeNeeds, markTransferDone, pendingTransfers } from "@/lib/monthly-needs";
import { CycleEndCard } from "@/components/CycleEndCard";
import { AutoBackupCard, autoBackupCardVisible, useAutoBackupPrefs } from "@/components/AutoBackupCard";
import { cycleEndReport, recurringFromDetection, todayBrief, weeklyCheckIn, type SubscriptionDetection } from "@/lib/household-insights";
import { t } from "@/lib/i18n";
import { lei } from "@/lib/money-format";

type Go = (view: "plan" | "obligations" | "insights") => void;

const money = lei;

const dueLabel = (daysLeft: number) => {
  if (daysLeft < 0) return t("Întârziată");
  if (daysLeft === 0) return t("Azi");
  if (daysLeft === 1) return t("Mâine");
  return t("în {days} zile", { days: daysLeft });
};

/**
 * Briefing de dimineață: cât poți cheltui azi, scadențe din 7 zile, abonamente detectate, ritual de salariu.
 * Scrie în registru doar la confirmare explicită — aceeași formă sincronizată.
 */
export function TodayBrief({ data, onGo, onChange, onOpenWeek, onOpenRecurring, hideSpendStamp = false, simpleMode = false }: { data: AppData; onGo: Go; onChange: (next: AppData) => void; onOpenWeek?: () => void; onOpenRecurring?: () => void; hideSpendStamp?: boolean; simpleMode?: boolean }) {
  const brief = todayBrief(data);
  const week = weeklyCheckIn(data);
  const rules = data.settings.salaryPlan.salaryAllocationRules || [];
  const pendingIncome = unappliedSalaryIncomes(data).find((item) => eligibleSalaryAllocationRules(data, item).length > 0);
  const needsRitual = !rules.length && unappliedSalaryIncomes(data).length > 0 && data.settings.salaryPlan.allocations.length > 0;
  const [pendingHunt, setPendingHunt] = useState<SubscriptionDetection | null>(null);
  // Cu cheltuielile lunare declarate, salariul primește propunerea completă, nu doar regulile.
  const splitIncome = pendingSplitIncome(data, isoToday());
  const [splitDismissed, setSplitDismissed] = useState(false);
  /** Repartizarea abia aplicată: rămâne un rând cu „Anulează”, în caz că te răzgândești. */
  const [justSplit, setJustSplit] = useState("");
  const [cycleEndDone, setCycleEndDone] = useState("");
  /**
   * „Am împărțit salariul · Anulează” rămâne pe Astăzi o zi, nu doar până la repornire: cine
   * închide aplicația imediat după împărțire nu mai găsea anularea decât adânc în Plan.
   */
  const [splitNoteClosed, setSplitNoteClosed] = useState(() => { try { return window.localStorage.getItem("buget-familie:split-note-closed") || ""; } catch { return ""; } });
  const recentSplit = activeSalaryApplications(data.settings.salaryPlan).find((item) => item.origin === "needs" && Date.now() - Date.parse(item.appliedAt) < 24 * 3_600_000);
  const justApplied = justSplit
    ? activeSalaryApplications(data.settings.salaryPlan).find((item) => item.id === justSplit && item.origin === "needs")
    : recentSplit && recentSplit.id !== splitNoteClosed ? recentSplit : undefined;
  const closeSplitNote = (id: string) => {
    setJustSplit("");
    setSplitNoteClosed(id);
    try { window.localStorage.setItem("buget-familie:split-note-closed", id); } catch { /* doar pe sesiunea asta */ }
  };
  const pay = (id: string) => {
    // Suma variabilă (curent, gaz) se confirmă cu valoarea de pe factură, în Scadențe.
    if (data.recurring.find((item) => item.id === id)?.variable && onOpenRecurring) return onOpenRecurring();
    const next = confirmRecurringPayment(data, id);
    if (next) onChange(next);
  };
  const confirmHunt = () => {
    if (!pendingHunt) return;
    const draft = recurringFromDetection(data, pendingHunt);
    if (!draft) return;
    onChange(autoPostDueRecurring({ ...data, recurring: [...data.recurring, draft] }));
    setPendingHunt(null);
  };
  const fillEnvelopes = () => {
    if (!pendingIncome) return;
    const result = applySalaryAllocationRules(data, pendingIncome.id);
    if (!result.error) onChange(result.data);
  };

  /**
   * Verificarea soldului. Se întreabă pe rând, o sursă o dată, fiindcă răspunsul cere
   * omului să se uite în bancă sau în portofel — o listă lungă ar fi închisă din prima.
   */
  const [lastCheck, setLastCheck] = useState<string | null>(() => {
    const last = readLastBalanceCheck();
    // Întrebarea lăsată fără răspuns 3 zile se retrage singură (ca „Mai târziu”).
    return balanceCheckDue(data, last).due && retireIgnoredBalanceCheck() ? isoToday() : last;
  });
  const [checkedNow, setCheckedNow] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [confirmat, setConfirmat] = useState<{ name: string; amount: number } | null>(null);
  const check = balanceCheckDue(data, lastCheck);
  const deVerificat = check.rows.filter((item) => !checkedNow.includes(item.id));
  const acum = deVerificat[0];
  const inchideVerificarea = () => {
    markBalanceChecked();
    setLastCheck(isoToday());
    setCheckedNow([]);
    setDraft("");
  };
  const raspunde = (row: BalanceCheckRow, spus: string, meaning: BalanceMeaning = "correction") => {
    const valoare = spus.trim() ? parseRomanianAmount(spus) : row.balance;
    const amount = valoare !== undefined && Number.isFinite(valoare) && valoare >= 0 ? valoare : row.balance;
    if (spus.trim() && Number.isFinite(valoare) && valoare >= 0) onChange(applyDeclaredBalance(data, row.id, valoare, isoToday(), meaning));
    setConfirmat({ name: row.name, amount });
    setDraft("");
    if (deVerificat.length <= 1) inchideVerificarea();
    else setCheckedNow((current) => [...current, row.id]);
  };

  const closed = cycleClose(data);
  const showStamp = !hideSpendStamp;
  const showIncome = Boolean(pendingIncome);
  // Cu „Ce plătim lunar”, propunerea vine de acolo: îndemnul spre regulile vechi ar fi a doua propunere.
  const usesNeeds = activeNeeds(data).length > 0;
  const showRitual = needsRitual && !pendingIncome && !simpleMode && !usesNeeds;
  const showCheck = Boolean(check.due && acum && !simpleMode);
  const showCheckOk = Boolean(confirmat && !showCheck);
  const showDues = brief.dues.length > 0;
  const showHunts = brief.hunts.length > 0 || Boolean(pendingHunt);
  const showWeek = Boolean(week.shouldPrompt && !simpleMode && onOpenWeek);
  // Raportul de final de lună spune deja „ce a rămas”; butonul vechi ar fi al doilea.
  const cycleEndHandled = data.settings.salaryPlan.cycleReportDone === data.settings.salaryPlan.nextPayday || Boolean(cycleEndReport(data));
  // Fără niciun plic nu există încă un ciclu de închis (imediat după pornire).
  const hasEnvelopes = data.settings.salaryPlan.allocations.length > 0;
  const showClose = Boolean(closed || (brief.closeSoon && hasEnvelopes && !simpleMode && !closed && !cycleEndHandled));
  const showCycleEnd = !splitIncome && Boolean(cycleEndReport(data));
  const transfers = data.settings.members.length > 1 ? pendingTransfers(data, isoToday()) : [];
  const backupPrefs = useAutoBackupPrefs();
  const showBackup = !simpleMode && autoBackupCardVisible(backupPrefs, data);
  // Produs #5: fereastra de recenzie a Play, chiar după a doua repartizare reușită; fără cartonaș care întreabă.
  const successes = (data.settings.salaryPlan.salaryAllocationApplications || []).filter((item) => !item.revertedAt).length;
  const appliedNow = justApplied?.id || "";
  useEffect(() => {
    if (!appliedNow) return;
    try {
      if (!reviewPromptDue(window.localStorage, successes, Capacitor.isNativePlatform())) return;
      answerReviewPrompt(window.localStorage, "done");
    } catch { return; }
    void requestInAppReview();
  }, [appliedNow, successes]);
  if (!showBackup && !transfers.length && !showStamp && !showIncome && !(splitIncome && !splitDismissed) && !showCycleEnd && !cycleEndDone && !justApplied && !showRitual && !showCheck && !showCheckOk && !showDues && !showHunts && !showWeek && !showClose) return null;

  return (
    <section className="bf-today-brief" aria-labelledby="bf-today-brief-title">
      <p className="bf-kicker bf-today-brief-title" id="bf-today-brief-title">{t("DE REZOLVAT")}</p>
      {!hideSpendStamp && (
        <button type="button" className={`bf-spend-stamp ${brief.hasPayday ? "" : "empty"} ${brief.spendable <= 0 && brief.hasPayday ? "tight" : ""}`} onClick={() => onGo("plan")}>
          <span className="bf-spend-stamp-top">
            <p className="bf-kicker">{t("REPER PENTRU AZI")}</p>
            <strong>{brief.hasPayday ? money(brief.spendable) : t("Setează venitul")}</strong>
          </span>
          <p>{brief.hasPayday && !brief.expired ? t("{reason} E o cifră din plan, nu un sold separat.", { reason: brief.reason }) : brief.reason}</p>
        </button>
      )}

      {showCycleEnd && <CycleEndCard data={data} onChange={onChange} onDone={setCycleEndDone} />}
      {cycleEndDone && !showCycleEnd && <aside className="bf-income-split-done" role="status"><span>{cycleEndDone}</span></aside>}
      {splitIncome && !splitDismissed && <IncomeSplitCard data={data} incomeId={splitIncome.id} onChange={(next) => { onChange(next); setJustSplit(next.settings.salaryPlan.salaryAllocationApplications?.[0]?.id || ""); }} onDismiss={() => setSplitDismissed(true)} />}
      {justApplied && (
        <aside className="bf-income-split-done" role="status" tabIndex={-1} ref={(node) => { if (node && justSplit && document.activeElement === document.body) node.focus(); }}>
          <span>{t("Am împărțit {title} în {count} plicuri.", { title: justApplied.incomeTitle, count: justApplied.allocations.length })}</span>
          <button type="button" className="bf-secondary" onClick={() => { onChange(revertSalaryAllocationApplication(data, justApplied.id)); closeSplitNote(justApplied.id); }}>{t("Anulează")}</button>
          <button type="button" className="bf-brief-check-later" onClick={() => closeSplitNote(justApplied.id)}>{t("E bine așa")}</button>
        </aside>
      )}
      {showBackup && <AutoBackupCard data={data} />}
      {transfers.map((entry) => (
        <aside key={`${entry.applicationId}-${entry.toMemberId}`} className="bf-income-split-done" role="status">
          <span>{t("De trimis: {amount} către {name}, pentru {labels} (din {title}).", { amount: money(entry.amount), name: data.settings.members.find((item) => item.id === entry.toMemberId)?.name || t("celălalt"), labels: entry.labels.join(", "), title: entry.incomeTitle })}</span>
          <button type="button" className="bf-secondary" onClick={() => onChange(markTransferDone(data, entry.applicationId, entry.toMemberId))}>{t("Am trimis")}</button>
        </aside>
      ))}
      {pendingIncome && !splitIncome && (
        <button type="button" className="bf-brief-salary" onClick={fillEnvelopes}>
          <b>{t("A venit {title}", { title: pendingIncome.title })}</b>
          <small>{money(pendingIncome.amount)} — umple plicurile după regulile tale.</small>
        </button>
      )}

      {showRitual && (
        <button type="button" className="bf-brief-salary setup" onClick={() => onGo("plan")}>
          <b>{t("Setează ritualul de salariu")}</b>
          <small>{t("Când înregistrezi venitul, plicurile se umplu după regulile tale.")}</small>
        </button>
      )}

      {check.due && acum && !simpleMode && (
        <div className="bf-brief-check">
          {confirmat && (
            <p className="bf-brief-check-ok" role="status">{t("{name} e acum {amount}, ca în portofel.", { name: confirmat.name, amount: money(confirmat.amount) })}</p>
          )}
          <b>{t("Cât ai de fapt pe „{name}”?", { name: acum.name })}</b>
          <small>{t("Eu zic {amount}. {why}", { amount: money(acum.balance), why: check.why })}</small>
          <div className="bf-brief-check-row">
            <input
              inputMode="decimal"
              aria-label={t("Soldul real de pe „{name}”", { name: acum.name })}
              placeholder={String(acum.balance)}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            {!draft.trim() && <button type="button" className="bf-primary" onClick={() => raspunde(acum, draft)}>{t("Așa e")}</button>}
          </div>
          {draft.trim() && (() => {
            // Ce înseamnă diferența: cumpărături nenotate, sold de pornire greșit sau doar o corecție.
            const spus = parseRomanianAmount(draft);
            if (!Number.isFinite(spus) || spus < 0 || Math.abs(spus - acum.balance) < 0.005) return <div className="bf-brief-check-row"><button type="button" className="bf-primary" onClick={() => raspunde(acum, "")}>{t("Așa e")}</button></div>;
            const less = spus < acum.balance;
            return (
              <div style={{ display: "grid", gap: 8 }}>
                <small>{less ? t("Lipsesc {amount}. De unde?", { amount: money(acum.balance - spus) }) : t("Sunt cu {amount} mai mulți. De unde?", { amount: money(spus - acum.balance) })}</small>
                {less && <button type="button" className="bf-primary" onClick={() => raspunde(acum, draft, "unlogged")}>{t("Am cheltuit fără să notez")}</button>}
                <button type="button" className={less ? "bf-secondary" : "bf-primary"} onClick={() => raspunde(acum, draft, "opening")}>{t("Soldul de pornire era greșit")}</button>
                <button type="button" className="bf-brief-check-later" onClick={() => raspunde(acum, draft, "correction")}>{t("Doar corectez soldul")}</button>
              </div>
            );
          })()}
          <button type="button" className="bf-brief-check-later" onClick={inchideVerificarea}>{t("Mai târziu")}</button>
        </div>
      )}

      {confirmat && !(check.due && acum && !simpleMode) && (
        <p className="bf-brief-check-ok" role="status">{t("{name} e acum {amount}, ca în portofel.", { name: confirmat.name, amount: money(confirmat.amount) })}</p>
      )}

      {brief.dues.length > 0 && (
        <ul className="bf-brief-dues">
          {brief.dues.map((due) => (
            <li key={`${due.kind}-${due.id}`}>
              <div>
                <b>{due.name}</b>
                <small>{dueLabel(due.daysLeft)} · {money(due.amount)}</small>
              </div>
              {due.confirmable ? (
                <button type="button" onClick={() => pay(due.id)}>{t("Confirmă")}</button>
              ) : (
                <button type="button" onClick={() => onGo("obligations")}>{t("Vezi")}</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {brief.hunts.map((hunt) => (
        <button key={hunt.key} type="button" className="bf-brief-hunt" onClick={() => setPendingHunt(hunt)}>
          <b>{t("Pare abonament · {name}", { name: hunt.name })}</b>
          <small>{money(hunt.amount)} · {hunt.reason} {t("Confirmă înainte de a adăuga la scadențe.")}</small>
        </button>
      ))}

      {pendingHunt && (
        <div className="bf-brief-hunt-confirm" role="dialog" aria-labelledby="bf-hunt-confirm-title">
          <b id="bf-hunt-confirm-title">{t("Adaugi „{name}” la scadențe?", { name: pendingHunt.name })}</b>
          <p>
            {money(pendingHunt.amount)} · {pendingHunt.reason}{" "}
            {t("Se creează o scadență locală pe confirmare manuală — nu se plătește automat.")}
          </p>
          <footer>
            <button type="button" onClick={() => setPendingHunt(null)}>{t("Nu acum")}</button>
            <button type="button" className="bf-primary" onClick={confirmHunt}>{t("Adaugă la scadențe")}</button>
          </footer>
        </div>
      )}

      {week.shouldPrompt && !simpleMode && onOpenWeek && (
        <button type="button" className="bf-brief-week" onClick={() => onOpenWeek?.()}>
          <b>{t("Bilanțul săptămânii")}</b>
          <small>{week.nextStep}</small>
        </button>
      )}

      {closed && (
        <button type="button" className="bf-brief-close" onClick={() => onGo("plan")}>
          {t("Ciclul s-a încheiat — vezi ce a rămas")}
        </button>
      )}

      {brief.closeSoon && hasEnvelopes && !simpleMode && !closed && !cycleEndHandled && (
        <button type="button" className="bf-brief-close" onClick={() => onGo("plan")}>
          {t("Ciclul se închide. Uită-te ce a rămas.")}
        </button>
      )}
    </section>
  );
}
