/**
 * Ecranul Setări. Scos din home-secondary. Comportamentul e același.
 */
import { BILLING_LIVE } from "@/lib/entitlements";
import { YearCloseSection } from "@/components/YearCloseSection";
import "../monthly-needs.css";
import "../pocket.css";
import { lazy, Suspense, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { warmLazy } from "@/lib/lazy-safe";
import { Check, ChevronRight, ClipboardPaste, Download, LockKeyhole, RotateCcw, Search, Share2, Trash2, Upload, X } from "lucide-react";
import { deviceTimeZone, foldRomanian, BASE_CURRENCY, activeCurrencies, createFamilyCode, currenciesMissingRate, expenseCategories, newId, normalizeAppData, parseRomanianAmount, sourceBalance, sourceBalanceInCurrency, supportedCurrencies, type AppData, type PaymentKind } from "@/lib/finance-data";
import { downloadBackup, isNativeApp, parseBackup, type BackupIntent } from "@/lib/app-storage";
import { AutoBackupToggle } from "@/components/AutoBackupToggle";
import { MemberModeSetup } from "@/components/MemberModeSetup";
import { BACKUP_SAVE_FALLBACK, BACKUP_SAVE_HELPER } from "@/lib/backup-ui-copy";
import { disableLocalAlerts, enableLocalAlerts, getNotificationPermission, isNotificationsArmed, isNotificationsEnabled, scheduleFinancialReminders, sendTestAlert, type NotificationPref } from "@/lib/local-notifications";
import { NOTIFY_KINDS, readNotifyPrefs, writeNotifyPrefs, type NotifyKind, type NotifyPrefs } from "@/lib/notify-prefs";
import { isOfflineOnly, setOfflineOnly, setSimpleMode } from "@/lib/ui-prefs";
import { errorReportsAvailable, readErrorReports, saveErrorReports } from "@/lib/error-reports";
import { disableAppLock, hasAppLockPin, isAppLockEnabled, isValidPin, setAppLockPin } from "@/lib/app-lock";
import { Field, dateText, money, sourceKindName } from "@/pages/home-kit";
import { readSecureScreen, saveSecureScreen } from "@/lib/secure-screen";
import { memberColor, memberColorName, nextMemberColor } from "@/lib/member-color";
import { getLocale, languages, t } from "@/lib/i18n";
import { canAddMember } from "@/lib/entitlements";
import { FamilieUpgrade } from "@/components/FamilieUpgrade";
import { useLanguage } from "@/hooks/use-language";
import { askConfirm, showNotice } from "@/lib/confirm-dialog";
import { getActiveFamilyRoom } from "@/lib/billing";
import { writeAutoBackup } from "@/lib/auto-backup";
import { buildLegacyArchive, hasLegacyData } from "@/lib/legacy-archive";
import { saveExport } from "@/lib/save-export";
import { isoToday as todayIso } from "@/lib/finance-data";
import { chooseSelfMember, selfMemberIdOf } from "@/lib/member-identity";

const TrustCenter = lazy(() => import("@/components/TrustCenter").then((module) => ({ default: module.TrustCenter })));
const PremiumStudio = lazy(() => import("@/components/PremiumStudio").then((module) => ({ default: module.PremiumStudio })));
/** Încălzite odată cu setările: altfel apăreau cu o clipă mai târziu și împingeau pagina. */
export const preloadSettingsParts = () => Promise.all([warmLazy(TrustCenter), warmLazy(PremiumStudio)]);

/**
 * Cursurile sunt introduse manual, cu data la care au fost puse. Aplicația nu întreabă
 * niciun serviciu extern și nu recalculează retroactiv mișcările deja salvate: fiecare
 * mișcare valutară păstrează cursul cu care a fost înregistrată.
 */
/**
 * Un rând de sursă, editabil complet. Soldul inițial se ține într-un câmp liber până
 * la ieșirea din el: dacă l-am fi trecut prin parser la fiecare tastă, virgula
 * zecimală ar fi dispărut imediat, iar ștergerea ultimei cifre ar fi resetat la zero —
 * exact motivul pentru care câmpul părea că nu se poate edita.
 */
function SourceRow({ data, source, settings, change }: { data: AppData; source: AppData["settings"]["paymentSources"][number]; settings: AppData["settings"]; change: (patch: Partial<AppData["settings"]>) => void }) {
  const [name, setName] = useState(source.name);
  const [balance, setBalance] = useState(String(source.openingBalance));
  useEffect(() => { setName(source.name); }, [source.name]);
  useEffect(() => { setBalance(String(source.openingBalance)); }, [source.openingBalance]);
  const own = sourceBalanceInCurrency(data, source.id);
  const patchSource = (patch: Partial<typeof source>) => change({ paymentSources: settings.paymentSources.map((item) => item.id === source.id ? { ...item, ...patch, ...("openingBalance" in patch ? { updatedAt: new Date().toISOString() } : {}) } : item) });
  const used = data.transactions.filter((item) => item.sourceId === source.id).length;
  const remove = async () => {
    if (settings.paymentSources.length <= 1) { void showNotice(t("Păstrează cel puțin o sursă de plată.")); return; }
    const question = used
      ? t("Ștergi sursa „{name}”? Cele {count} mișcări înregistrate pe ea rămân în registru, dar nu vor mai avea o sursă.", { name: source.name, count: used })
      : t("Ștergi sursa „{name}”?", { name: source.name });
    if (!await askConfirm(question)) return;
    change({
      paymentSources: settings.paymentSources.filter((item) => item.id !== source.id),
      salaryPlan: { ...settings.salaryPlan, sourceIds: settings.salaryPlan.sourceIds.filter((id) => id !== source.id), allocations: settings.salaryPlan.allocations.map((item) => item.sourceId === source.id ? { ...item, sourceId: undefined } : item) },
    });
  };
  return <div className="bf-source-edit rich">
    <label className="bf-source-name"><small>{t("Denumire")}</small><input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { const clean = name.trim(); if (clean && clean !== source.name) patchSource({ name: clean }); else setName(source.name); }} /></label>
    <label><small>{t("Sold inițial")} ({source.currency || t("lei")})</small><input inputMode="decimal" value={balance} onChange={(event) => setBalance(event.target.value)} onBlur={() => { const next = Math.max(0, parseRomanianAmount(balance)); if (next !== source.openingBalance) patchSource({ openingBalance: next }); else setBalance(String(source.openingBalance)); }} /></label>
    <label><small>{t("Valută")}</small><select value={source.currency || BASE_CURRENCY} onChange={(event) => patchSource({ currency: event.target.value === BASE_CURRENCY ? undefined : event.target.value })}>{supportedCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
    <label><small>{t("Aparține de")}</small><select value={source.memberId || ""} onChange={(event) => patchSource({ memberId: event.target.value || undefined })}><option value="">{t("Familie / comun")}</option>{settings.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
    <div className="bf-source-edit-foot">
      <span><b>{money(sourceBalance(data, source.id))}</b><small>{sourceKindName[source.kind]}{own ? <> · {own.amount.toLocaleString(getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {own.currency}{own.exact ? null : <em className="bf-fx-approx">{t("aproximativ")}</em>}</> : null} · {t("{count} mișcări", { count: used })}</small></span>
      <button type="button" aria-label={t("Șterge sursa {name}", { name: source.name })} onClick={remove}><Trash2 size={15} /></button>
    </div>
  </div>;
}

/** Selectorul de limbă. Schimbarea are efect imediat, fără reîncărcarea aplicației. */
function LanguageSection() {
  const [lang, setLang] = useLanguage();
  return <section><p className="bf-kicker">{t("LIMBĂ")}</p><h2>{t("Limba aplicației")}</h2><p>{t("Se schimbă doar afișarea. Datele, categoriile și notele rămân exact cum le-ai scris.")}</p><div className="bf-language-switch" role="group" aria-label={t("Limba aplicației")}>{languages.map((item) => <button key={item.id} type="button" aria-pressed={lang === item.id} className={lang === item.id ? "active" : ""} onClick={() => setLang(item.id)}>{item.label}</button>)}</div></section>;
}

function ExchangeRatesSection({ data, settings, change }: { data: AppData; settings: AppData["settings"]; change: (patch: Partial<AppData["settings"]>) => void }) {
  const used = activeCurrencies(data);
  const missing = currenciesMissingRate(data);
  const [code, setCode] = useState(missing[0] || supportedCurrencies.find((item) => item !== BASE_CURRENCY) || "EUR");
  const [rate, setRate] = useState("");
  if (!used.length && !settings.exchangeRates.length) return null;
  const save = () => {
    const value = parseRomanianAmount(rate);
    if (!value || value <= 0) return;
    const next = [...settings.exchangeRates.filter((item) => item.currency !== code), { currency: code, rate: value, updatedAt: new Date().toISOString() }];
    change({ exchangeRates: next });
    setRate("");
  };
  return <section><p className="bf-kicker">{t("CURSURI VALUTARE")}</p><h2>{t("Cât face un leu")}</h2><p>{t("Se folosesc doar la înregistrarea unei mișcări noi și la soldul inițial al unei surse valutare. Mișcările deja salvate păstrează cursul cu care au fost introduse.")}</p>
    {missing.length > 0 && <p className="bf-form-error" role="alert">{t("Lipsește cursul pentru {codes}. Până îl adaugi, soldul inițial al acestor surse este socotit zero, ca să nu apară o cifră inventată.", { codes: missing.join(", ") })}</p>}
    {settings.exchangeRates.map((item) => <div className="bf-source-edit" key={item.currency}><span><b>1 {item.currency}</b><small>{t("pus pe {date}", { date: dateText(String(item.updatedAt).slice(0, 10), true) })}{used.includes(item.currency) ? "" : t(" · nefolosit de nicio sursă")}</small></span><label><small>Lei</small><input inputMode="decimal" value={String(item.rate)} onChange={(event) => change({ exchangeRates: settings.exchangeRates.map((entry) => entry.currency === item.currency ? { ...entry, rate: Math.max(0, parseRomanianAmount(event.target.value)), updatedAt: new Date().toISOString() } : entry) })} /></label><button aria-label={t("Șterge cursul pentru {currency}", { currency: item.currency })} onClick={() => change({ exchangeRates: settings.exchangeRates.filter((entry) => entry.currency !== item.currency) })}><X size={14} /></button></div>)}
    <div className="bf-source-builder"><select value={code} onChange={(event) => setCode(event.target.value)} aria-label="Valuta">{supportedCurrencies.filter((item) => item !== BASE_CURRENCY).map((item) => <option key={item} value={item}>{item}</option>)}</select><input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" placeholder="ex. 4,97" aria-label={t("Lei per unitate")} /><button onClick={save}>{t("Salvează cursul")}</button></div>
  </section>;
}

function LocalAlertsSettings({ data }: { data: AppData }) {
  const [pref, setPref] = useState<NotificationPref>("unknown");
  const [enabled, setEnabled] = useState(() => isNotificationsEnabled());
  const [armed, setArmed] = useState(() => isNotificationsArmed());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const refresh = () => {
      void getNotificationPermission().then((status) => {
        setPref(status);
        setEnabled(isNotificationsEnabled());
        setArmed(isNotificationsArmed());
      });
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("buget-familie:notify-permission", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("buget-familie:notify-permission", refresh);
    };
  }, []);

  const active = pref === "granted" || (armed && enabled && pref !== "denied" && pref !== "unsupported");

  const turnOn = () => {
    setBusy(true);
    setNotice("");
    let finished = false;
    const apply = (status: NotificationPref) => {
      if (finished) return;
      finished = true;
      setPref(status === "unsupported" ? status : status === "denied" ? "denied" : (status === "granted" ? "granted" : "unknown"));
      setEnabled(isNotificationsEnabled() && status !== "denied");
      setArmed(isNotificationsArmed());
      if (status === "granted") setNotice(t("Alertele sunt active pe acest dispozitiv. Urmează și o notificare de confirmare."));
      else if (status === "denied") setNotice(isNativeApp() ? t("Permisiunea a fost refuzată. O poți reactiva din setările telefonului.") : t("Browserul a refuzat notificările. Le pornești din lacătul de lângă adresă → Notificări → Permite, apoi apeși din nou aici."));
      else if (status === "unsupported") setNotice(t("Notificările nu sunt disponibile în acest browser."));
      else setNotice(t("Am înregistrat Permite pe acest telefon. Dacă nu vezi o notificare, apasă „Trimite o notificare de test”."));
      setBusy(false);
    };
    const watchdog = window.setTimeout(() => apply("unknown"), 5000);
    void enableLocalAlerts(data)
      .then((status) => {
        window.clearTimeout(watchdog);
        apply(status);
      })
      .catch(() => {
        window.clearTimeout(watchdog);
        apply("unknown");
      });
  };

  const turnOff = async () => {
    disableLocalAlerts();
    setEnabled(false);
    setArmed(false);
    setNotice(t("Alertele au fost oprite pe acest dispozitiv."));
  };

  const [notifyPrefs, setNotifyPrefs] = useState(() => readNotifyPrefs());
  const updatePrefs = (next: NotifyPrefs) => {
    setNotifyPrefs(next);
    writeNotifyPrefs(next);
    if (active) void scheduleFinancialReminders(data);
  };
  const kindText: Record<NotifyKind, [string, string]> = {
    bills: [t("Scadențe și rate"), t("Cu 3 zile înainte și în ziua plății.")],
    envelopes: [t("Plicuri și ritm"), t("Plic aproape de limită, săptămână care merge prea repede.")],
    income: [t("Venitul"), t("Seara dinainte și dimineața zilei de salariu.")],
    goals: [t("Obiective"), t("Când se apropie termenul unui obiectiv.")],
    summaries: [t("Bilanțuri"), t("Duminică seara săptămâna, pe 1 ale lunii luna trecută.")],
    checkin: [t("Amintirea de seară"), t("Dacă tu n-ai notat azi, chiar dacă partenerul a notat.")],
    backup: [t("Copia de siguranță"), t("Dacă n-ai mai salvat o copie de peste 30 de zile.")],
    warranty: [t("Garanții și retururi"), t("Cu o zi înainte de ultima zi de retur și cu 30 de zile înainte să expire garanția.")],
  };

  const ping = () => {
    void sendTestAlert().then(() => setNotice(t("Am trimis o notificare de test pe acest telefon.")));
  };

  return (
    <section className={"bf-settings-notifications" + (active ? " is-on" : "")} aria-labelledby="bf-alerts-title">
      <p className="bf-kicker">{t("ALERTE LOCALE")}</p>
      <h2 id="bf-alerts-title">{t("Reamintiri pe telefon")}</h2>
      <p>{t("Rămân pe dispozitiv; nu se trimit pe server. Nu te anunț când tu însuți adaugi o cheltuială — o vezi deja pe ecran.")}</p>
      <div className="bf-alert-kinds" role="group" aria-label={t("Ce vrei să primești")}>
        {NOTIFY_KINDS.map((kind) => <label key={kind} className="bf-alert-kind"><span><b>{kindText[kind][0]}</b><small>{kindText[kind][1]}</small></span><input type="checkbox" checked={!notifyPrefs.off.includes(kind)} onChange={(event) => updatePrefs({ ...notifyPrefs, off: event.target.checked ? notifyPrefs.off.filter((item) => item !== kind) : [...notifyPrefs.off, kind] })} /></label>)}
        <label className="bf-alert-kind"><span><b>{t("Ora amintirii de seară")}</b><small>{t("Doar dacă tu n-ai notat azi.")}</small></span><select value={notifyPrefs.eveningHour} disabled={notifyPrefs.off.includes("checkin")} onChange={(event) => updatePrefs({ ...notifyPrefs, eveningHour: Number(event.target.value) })}>{[18, 19, 20, 21, 22].map((hour) => <option key={hour} value={hour}>{`${hour}:00`}</option>)}</select></label>
      </div>
      <p className="bf-helper">{t("Cheltuielile adăugate de alt membru te anunță când telefoanele sunt sincronizate.")}</p>
      {active ? (
        <div className="bf-notification-actions">
          <button type="button" className="bf-secondary" onClick={turnOff}>{t("Oprește alertele")}</button>
          <button type="button" className="bf-ghost" onClick={ping}>{t("Trimite o notificare de test")}</button>
        </div>
      ) : (
        <div className="bf-notification-actions">
          <button type="button" className="bf-primary" disabled={busy} onClick={turnOn}>{busy ? t("Se cere permisiunea…") : t("Activează alertele")}</button>
        </div>
      )}
      <p className="bf-helper">{active ? t("Active pe acest telefon.") : t("Oprite pe acest telefon.")}</p>
      {active && <ReminderHealthNote />}
      {notice && <p className="bf-notice" role="status">{notice}</p>}
    </section>
  );
}

/** Un grup de setări pliabil. Cu text în căutare, grupurile potrivite se deschid, restul se ascund. */
function SettingsGroup({ id, title, hint, keywords, query, children }: { id: string; title: string; hint: string; keywords: string; query: string; children: ReactNode }) {
  const needle = foldRomanian(query.trim());
  const match = !needle || foldRomanian(`${title} ${hint} ${keywords}`).includes(needle);
  if (!match) return null;
  return <details id={id} className="bf-settings-group" data-group={id} {...(needle ? { open: true } : {})}><summary><span><b>{title}</b><small>{hint}</small></span></summary>{children}</details>;
}

function AppLockSettings() {
  const [enabled, setEnabled] = useState(() => isAppLockEnabled() && hasAppLockPin());
  const [mode, setMode] = useState<"idle" | "create" | "confirm">("idle");
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState("");
  const [secureScreen, setSecureScreen] = useState(() => readSecureScreen());
  const [errorReports, setErrorReports] = useState(() => readErrorReports());

  const startCreate = () => { setMode("create"); setPin(""); setFirstPin(""); setNotice(""); };
  const cancel = () => { setMode("idle"); setPin(""); setFirstPin(""); };

  const submitFirst = () => {
    if (!isValidPin(pin)) return setNotice(t("PIN-ul trebuie să aibă exact 4 cifre."));
    setFirstPin(pin);
    setPin("");
    setMode("confirm");
    setNotice("");
  };

  const submitConfirm = () => {
    if (pin !== firstPin) {
      setNotice(t("PIN-urile nu coincid. Încearcă din nou."));
      setPin("");
      setFirstPin("");
      setMode("create");
      return;
    }
    void setAppLockPin(pin).then(() => {
      setEnabled(true);
      setMode("idle");
      setPin("");
      setFirstPin("");
      setNotice(t("Blocarea cu PIN este activă pe acest telefon."));
    });
  };

  const turnOff = async () => {
    if (!await askConfirm(t("Dezactivezi blocarea cu PIN pe acest telefon?"))) return;
    disableAppLock();
    setEnabled(false);
    setNotice(t("Blocarea a fost dezactivată."));
  };

  return (
    <section className="bf-settings-lock">
      <p className="bf-kicker">{t("SECURITATE")}</p>
      <h2>{t("Blocare cu PIN")}</h2>
      <p>{t("Un PIN de 4 cifre, doar pe acest telefon. Nu se salvează în clar, nu intră în backup și nu se sincronizează cu celelalte telefoane.")}</p>
      {isNativeApp() && <label className="bf-settings-switch"><input type="checkbox" checked={secureScreen} onChange={(event) => { setSecureScreen(event.target.checked); void saveSecureScreen(event.target.checked); }} /><span><b>{t("Ascunde ecranul în capturi")}</b><small>{t("Fără capturi de ecran și fără previzualizare în aplicațiile recente, ca sumele să nu rămână în galerie sau să fie văzute peste umăr.")}</small></span></label>}
      {errorReportsAvailable() && <label className="bf-settings-switch"><input type="checkbox" checked={errorReports} onChange={(event) => { setErrorReports(event.target.checked); saveErrorReports(event.target.checked, isNativeApp() ? "android" : "web"); }} /><span><b>{t("Trimite rapoarte de erori")}</b><small>{t("Când aplicația dă o eroare, pleacă doar tipul ei, locul din cod și versiunea, ca s-o putem repara. Fără sume, nume, magazine sau bonuri.")}</small></span></label>}
      {mode === "idle" && (
        enabled ? (
          <div className="bf-notification-actions">
            <button type="button" onClick={startCreate}>{t("Schimbă PIN-ul")}</button>
            <button type="button" onClick={turnOff}>{t("Dezactivează")}</button>
          </div>
        ) : (
          <button type="button" className="bf-primary" onClick={startCreate}><LockKeyhole size={16} /> {t("Activează blocarea")}</button>
        )
      )}
      {(mode === "create" || mode === "confirm") && (
        <div className="bf-app-lock-setup">
          <Field label={mode === "create" ? "PIN nou (4 cifre)" : t("Confirmă PIN-ul")}>
            <input inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" autoFocus />
          </Field>
          <div className="bf-notification-actions">
            <button type="button" onClick={cancel}>{t("Anulează")}</button>
            <button type="button" className="bf-primary" disabled={pin.length !== 4} onClick={mode === "create" ? submitFirst : submitConfirm}>{mode === "create" ? t("Continuă") : t("Confirmă")}</button>
          </div>
        </div>
      )}
      {notice && <p className="bf-notice" role="status">{notice}</p>}
    </section>
  );
}

function MerchantRulesSection({ data, onChange }: { data: AppData; onChange: (value: AppData) => void }) {
  const rules = data.settings.merchantRules || [];
  const [match, setMatch] = useState("");
  const [category, setCategory] = useState("Alimente");
  const [allocationId, setAllocationId] = useState("");
  const categories = [...expenseCategories, ...data.settings.customCategories];
  const add = () => {
    const needle = match.trim();
    if (needle.length < 2) return;
    const rule = {
      id: newId("merchant-rule"),
      match: needle.slice(0, 80),
      category: category || undefined,
      allocationId: allocationId || undefined,
      updatedAt: new Date().toISOString(),
    };
    onChange({
      ...data,
      settings: {
        ...data.settings,
        merchantRules: [rule, ...rules.filter((item) => item.match.toLocaleLowerCase("ro-RO") !== needle.toLocaleLowerCase("ro-RO"))].slice(0, 80),
      },
    });
    setMatch("");
    setAllocationId("");
  };
  const remove = (id: string) => onChange({
    ...data,
    settings: { ...data.settings, merchantRules: rules.filter((item) => item.id !== id) },
  });
  return (
    <section id="bf-merchant-rules" className="bf-merchant-rules">
      <p className="bf-kicker">{t("REGULI COMERCIANT")}</p>
      <h2>{t("Dacă titlul conține…")}</h2>
      <p>{t("Propune categorie sau plic la import și la asistent. Nu salvează nimic fără confirmarea ta.")}</p>
      <div className="bf-merchant-rule-form">
        <Field label={t("Text în titlu")}><input value={match} onChange={(event) => setMatch(event.target.value)} placeholder={t("ex. Glovo, ENEL, Starbucks")} /></Field>
        <Field label={t("Categorie propusă")}><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></Field>
        <Field label={t("Plic propus (opțional)")}><select value={allocationId} onChange={(event) => setAllocationId(event.target.value)}><option value="">{t("Fără plic preferat")}</option>{data.settings.salaryPlan.allocations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <button type="button" className="bf-primary" onClick={add}>{t("Adaugă regula")}</button>
      </div>
      <ul className="bf-merchant-rule-list">
        {rules.map((rule) => {
          const envelope = data.settings.salaryPlan.allocations.find((item) => item.id === rule.allocationId);
          return (
            <li key={rule.id}>
              <div>
                <b>„{rule.match}”</b>
                <small>{rule.category ? t(rule.category) : t("fără categorie")}{envelope ? ` → ${envelope.label}` : ""}</small>
              </div>
              <button type="button" aria-label={t("Șterge regula {match}", { match: rule.match })} onClick={() => remove(rule.id)}><X size={14} /></button>
            </li>
          );
        })}
      </ul>
      {!rules.length && <small className="bf-helper">{t("Nicio regulă încă. Exemplu: „detergent” → Casă & facturi.")}</small>}
    </section>
  );
}

export function SettingsPanel({ data, onChange, onReset }: { data: AppData; onChange: (value: AppData) => void; onReset: () => void }) {
  const [backupPreview, setBackupPreview] = useState<{ data: AppData; exportedAt: string; fileName: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false); const [pasted, setPasted] = useState("");
  const importBackup = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((raw) => { acceptBackupText(raw, file.name); }).catch(() => void showNotice(t("Nu am putut citi fișierul ales. Încearcă „Lipește text”."))); event.target.value = ""; };
  /**
   * Un singur drum pentru ambele butoane; diferă doar intenția și, la final, ce-i spunem
   * omului. „Salvat” trebuie să spună unde, altfel butonul pare că n-a făcut nimic.
   */
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const exportBackup = (intent: BackupIntent) => { if (intent === "save") setSaving(true); return downloadBackup(data, intent).then((result) => {
    // Orice copie reușită ține loc de copia săptămânii: mementoul de pe Astăzi nu mai rămâne.
    if (result.how === "shared" || result.how === "saved" || result.how === "downloaded") writeAutoBackup({ lastAt: new Date().toISOString(), lastError: undefined });
    // Confirmarea rămâne sub butoane: fereastra singură trecea neobservată și butonul părea mort.
    const time = new Date().toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });
    if (result.how === "saved") setLastSaved(t("✓ Salvat la {time} în {path}.", { time, path: result.path }));
    else if (result.how === "downloaded") setLastSaved(t("✓ Salvat la {time} în Descărcări.", { time }));
    else if (result.how === "shared") setLastSaved(t("✓ Trimis la {time} către aplicația aleasă.", { time }));
    else if (result.how === "failed") setLastSaved(t("✗ Nu s-a salvat: {reason}", { reason: result.reason || t("motiv necunoscut") }));
    if (result.how === "shared") void showNotice(result.fallback ? t(BACKUP_SAVE_FALLBACK) : t("Backupul a fost trimis către aplicația aleasă."));
    else if (result.how === "saved") void showNotice(t("Backupul a fost scris în {path}. Îl găsești cu aplicația Fișiere.", { path: result.path }));
    else if (result.how === "downloaded") void showNotice(t("Backupul a fost salvat în descărcări."));
    else if (result.how === "failed") void showNotice(t("Nu am putut salva fișierul: {reason}", { reason: result.reason || t("motiv necunoscut") }));
  }).finally(() => setSaving(false)); };
  const acceptBackupText = (raw: string, fileName: string) => { try { const backup = parseBackup(raw); setBackupPreview({ data: normalizeAppData(backup.data), exportedAt: backup.exportedAt, fileName }); setPasteOpen(false); setPasted(""); return true; } catch (reason) { void showNotice(reason instanceof Error ? reason.message : t("Backup-ul nu a putut fi importat.")); return false; } };
  const confirmBackupImport = async () => {
    if (!backupPreview) return;
    const backup = backupPreview.data;
    setBackupPreview(null);
    const restored = t("Backup restaurat: {moves} mișcări, {envelopes} plicuri, {members} membri.", { moves: String(backup.transactions.length), envelopes: String(backup.settings.salaryPlan.allocations.length), members: String(backup.settings.members.length) });
    if (!getActiveFamilyRoom()) {
      // Înainte să înlocuim tot registrul, o copie a celui de acum: un backup vechi ales din greșeală nu mai pierde nimic.
      let before = "";
      if (isNativeApp() && data.transactions.length) {
        try {
          const { saveBackupSilently } = await import("@/lib/app-storage");
          const stamp = new Date();
          before = await saveBackupSilently(data, `buget-familie-inainte-de-restaurare-${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}.json`);
        } catch { /* fără copie: omul a confirmat deja înlocuirea */ }
      }
      onChange(backup);
      void showNotice(before ? `${restored} ${t("Registrul de dinainte e păstrat în {path}.", { path: before })}` : restored);
      return;
    }
    /**
     * Conectat la familie: un backup vechi ar întoarce sumele și ar șterge pe toate telefoanele
     * plicurile făcute de atunci. Îl unim doar: aduce înapoi ce lipsește, nu schimbă nimic din ce există.
     */
    if (!(await askConfirm(t("Telefonul e conectat la familie, deci backup-ul nu înlocuiește datele: adaugă doar ce nu există acum (mișcări, plicuri, datorii). Ce există rămâne cum e, pe toate telefoanele. Ca să înlocuiești tot, închide întâi sesiunea din Sync."), { title: t("Unești backup-ul cu familia?"), confirmLabel: t("Da, unește") }))) return;
    const { mergeFamilyData, syncBaseOf } = await import("@/lib/family-crypto");
    onChange(mergeFamilyData(data, backup, syncBaseOf(backup)));
    void showNotice(t("Backup unit cu familia. Ce lipsea a fost adăugat."));
  };
  const [member, setMember] = useState(""); const [source, setSource] = useState(""); const [kind, setKind] = useState<PaymentKind>("card"); const [owner, setOwner] = useState(data.settings.members[0]?.id || ""); const [category, setCategory] = useState("");
  const settings = data.settings; const change = (patch: Partial<typeof settings>) => onChange({ ...data, settings: { ...settings, ...patch } });
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const addMember = () => { if (!member.trim()) return; if (settings.members.some((item) => item.name.toLowerCase() === member.trim().toLowerCase())) return; if (!canAddMember(settings.members.length)) { window.dispatchEvent(new Event("buget-familie:open-familie")); return; } change({ members: [...settings.members, { id: newId("member"), name: member.trim() }] }); setMember(""); };
  const addSource = () => { if (!source.trim()) return; change({ paymentSources: [...settings.paymentSources, { id: newId("source"), name: source.trim(), kind, memberId: kind === "transfer" || !owner ? undefined : owner, openingBalance: 0, currency: currency === BASE_CURRENCY ? undefined : currency }] }); setSource(""); setCurrency(BASE_CURRENCY); };
  const [simpleMode, setSimpleModeState] = useState(() => { try { return window.localStorage.getItem("buget-familie:simple-mode") === "1"; } catch { return false; } });
  const [offlineOnly, setOfflineOnlyState] = useState(() => isOfflineOnly());
  useEffect(() => {
    const onPrefs = (event: Event) => {
      const detail = (event as CustomEvent<{ simpleMode?: boolean; offlineOnly?: boolean }>).detail;
      if (typeof detail?.simpleMode === "boolean") setSimpleModeState(detail.simpleMode);
      if (typeof detail?.offlineOnly === "boolean") setOfflineOnlyState(detail.offlineOnly);
    };
    window.addEventListener("buget-familie:ui-prefs", onPrefs);
    return () => window.removeEventListener("buget-familie:ui-prefs", onPrefs);
  }, []);
  const toggleSimple = () => {
    const next = !simpleMode;
    setSimpleMode(next);
    setSimpleModeState(next);
  };
  const [settingsQuery, setSettingsQuery] = useState("");
  const toggleOfflineOnly = async () => {
    const next = !offlineOnly;
    if (next && !await askConfirm(t("Oprești sincronizarea cloud pe acest telefon? Firebase nu se mai încarcă până reactivezi. Datele rămân locale."))) return;
    setOfflineOnly(next);
    setOfflineOnlyState(next);
  };
  return <div className="bf-settings"><label className="bf-settings-search"><Search size={17} aria-hidden="true" /><input type="search" value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder={t("Caută: notificări, backup, card…")} aria-label={t("Caută în setări")} /></label><SettingsGroup id="basics" title={t("Limbă și mod de lucru")} hint={t("Limba, modul simplu, doar offline, tutorialul")} keywords="limba english mod simplu offline firebase tutorial plic reper membru" query={settingsQuery}><LanguageSection /><section className="bf-guide-glossary compact" aria-labelledby="bf-settings-glossary"><p className="bf-kicker">{t("PE SCURT")}</p><h2 id="bf-settings-glossary">{t("Plic ≠ cont · Reper ≠ sold")}</h2><p>{t("Plicul e o limită pe categorie, nu un cont. Reperul e ritmul zilei din plan, nu soldul din bancă.")}</p><button type="button" className="bf-usage-jump" onClick={() => window.dispatchEvent(new Event("buget-familie:open-usage-tutorial"))}>{t("Deschide tutorialul de folosire")} <ChevronRight size={16} /></button></section><section className={"bf-simple-mode-card" + (simpleMode ? " is-on" : "")} aria-labelledby="bf-simple-mode-title"><p className="bf-kicker">{t("MOD SIMPLU")}</p><h2 id="bf-simple-mode-title">{t("Doar jurnal și esențialul")}</h2><p>{t("Astăzi arată un număr + captură; dock-ul rămâne Astăzi / Plicuri / Notează / Mișcări; Mai mult păstrează Setări, Sync, De verificat, Scadențe, Backup și Ghid.")}</p><button type="button" className={simpleMode ? "bf-primary" : "bf-secondary"} onClick={toggleSimple}>{simpleMode ? t("Mod simplu activ — arată tot") : t("Activează modul simplu")}</button></section><MemberModeSetup data={data} /><section className="bf-offline-only-card" aria-labelledby="bf-offline-only-title"><p className="bf-kicker">{t("DOAR OFFLINE")}</p><h2 id="bf-offline-only-title">{t("Fără Firebase pe acest telefon")}</h2><p>{t("Registrul rămâne local. Sync cloud nu se încarcă deloc până reactivezi.")}</p><button type="button" className={offlineOnly ? "bf-primary" : "bf-secondary"} onClick={toggleOfflineOnly}>{offlineOnly ? t("Doar offline activ — reactivează sync") : t("Activează doar offline")}</button></section></SettingsGroup><SettingsGroup id="family" title={t("Familie și membri")} hint={t("Numele familiei, cine folosește telefonul, copii")} keywords="familie membri nume copil telefon fus orar cod" query={settingsQuery}><section><p className="bf-kicker">{t("FAMILIE")}</p><Field label={t("Numele familiei")}><input value={settings.familyName} onChange={(event) => change({ familyName: event.target.value, familyNameSetAt: new Date().toISOString() })} /></Field><Field label={t("Acest telefon e al")} hint={t("Ce notezi aici apare pe numele acestei persoane.")}><select value={selfMemberIdOf(data)} onChange={(event) => onChange(chooseSelfMember(data, event.target.value))}>{settings.members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><div className="bf-family-timezone"><p className="bf-helper">{t("Ziua se schimbă la miezul nopții, la fel pe toate telefoanele familiei ({zone}).", { zone: settings.familyTimeZone || deviceTimeZone() || "—" })}</p>{deviceTimeZone() && deviceTimeZone() !== settings.familyTimeZone && <button type="button" className="bf-link-button" onClick={() => change({ familyTimeZone: deviceTimeZone(), familyTimeZoneSetAt: new Date().toISOString() })}>{t("Folosește fusul acestui telefon ({zone})", { zone: deviceTimeZone() || "" })}</button>}</div><Field label={t("Cod local de familie")} hint={t("Nu leagă telefoanele. E doar un semn în backup-ul exportat, ca să recunoști fișierul. Conectarea se face din Sync, cu invitația familiei.")}><input value={settings.familyCode} onChange={(event) => change({ familyCode: event.target.value.toUpperCase() })} /><button className="bf-link-button" onClick={() => change({ familyCode: createFamilyCode() })}><RotateCcw size={14} /> {t("Cod nou")}</button></Field></section><section><p className="bf-kicker">{t("MEMBRI")}</p>{settings.members.filter((item) => item.kind !== "child").length < 2 && <FamilieUpgrade reason="member" />}<div className="bf-member-rows">{settings.members.map((item) => { const color = memberColor(settings.members, item.id); return <div className="bf-member-row" key={item.id}><button type="button" className="bf-member-color" style={{ background: color }} aria-label={t("Culoarea lui {name}: {color}. Atinge pentru alta.", { name: item.name, color: memberColorName(color) ? t(memberColorName(color)) : t("culoare automată") })} onClick={() => change({ members: settings.members.map((memberItem) => memberItem.id === item.id ? { ...memberItem, color: nextMemberColor(color), updatedAt: new Date().toISOString() } : memberItem) })} /><b>{item.name}</b><label><input type="checkbox" checked={item.kind === "child"} onChange={(event) => change({ members: settings.members.map((memberItem) => memberItem.id === item.id ? { ...memberItem, kind: event.target.checked ? "child" as const : undefined, updatedAt: new Date().toISOString() } : memberItem) })} /> {t("Copil")}</label>{settings.members.length > 1 && <button aria-label={t("Șterge membrul {name}", { name: item.name })} onClick={() => change({ members: settings.members.filter((memberItem) => memberItem.id !== item.id) })}><X size={14} /></button>}</div>; })}</div><small className="bf-helper">{t("Un membru marcat drept copil primește un ecran simplu de buzunar. Dă-i un plic pe numele lui, din Plicuri.")}</small><div className="bf-mini-form"><input value={member} onChange={(event) => setMember(event.target.value)} placeholder={t("ex. Soția")} /><button onClick={addMember}>{t("Adaugă")}</button></div></section></SettingsGroup><SettingsGroup id="sources" title={t("Surse, solduri și valută")} hint={t("Carduri, cash, sold inițial, euro și curs")} keywords="surse card cash sold valuta euro curs bani" query={settingsQuery}><section><p className="bf-kicker">{t("SURSE ȘI SOLD INIȚIAL")}</p>{settings.paymentSources.map((item) => <SourceRow key={item.id} data={data} source={item} settings={settings} change={change} />)}<div className="bf-source-builder"><input value={source} onChange={(event) => setSource(event.target.value)} placeholder={t("ex. Card soție")} aria-label={t("Numele sursei")} /><select value={kind} onChange={(event) => setKind(event.target.value as PaymentKind)} aria-label={t("Tipul sursei")}>{Object.entries(sourceKindName).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select value={owner} disabled={kind === "transfer"} onChange={(event) => setOwner(event.target.value)} aria-label={t("Al cui este")}><option value="">{t("Familie / comun")}</option>{settings.members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Valuta sursei">{supportedCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}</select><button onClick={addSource}>{t("Adaugă")}</button></div></section><ExchangeRatesSection data={data} settings={settings} change={change} /></SettingsGroup><SettingsGroup id="categories" title={t("Categorii și reguli")} hint={t("Categorii proprii și magazinele învățate")} keywords="categorii reguli magazin comerciant" query={settingsQuery}><section><p className="bf-kicker">{t("CATEGORII PROPRII")}</p><div className="bf-chip-list">{settings.customCategories.map((item) => <span key={item}>{item}<button onClick={() => change({ customCategories: settings.customCategories.filter((categoryItem) => categoryItem !== item) })}><X size={14} /></button></span>)}</div><div className="bf-mini-form"><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="ex. Taxi" /><button onClick={() => { if (category.trim() && !settings.customCategories.includes(category.trim())) { change({ customCategories: [...settings.customCategories, category.trim()] }); setCategory(""); } }}>{t("Adaugă")}</button></div></section><MerchantRulesSection data={data} onChange={onChange} /></SettingsGroup><SettingsGroup id="alerts" title={t("Mementouri și siguranță")} hint={t("Notificări, ora de seară, PIN")} keywords="notificari alerte mementouri amintire seara pin blocare siguranta" query={settingsQuery}><LocalAlertsSettings data={data} /><AppLockSettings /></SettingsGroup><SettingsGroup id="privacy" title={t("Date și confidențialitate")} hint={t("Datele vechi, export, unde stau datele")} keywords="date confidentialitate arhiva veche buget export json privacy" query={settingsQuery}><section><p className="bf-kicker">{t("DATE ȘI CONFIDENȚIALITATE")}</p><h2>{t("Datele din versiunea veche")}</h2><p>{t("Cheltuielile vechi sunt deja în Toate costurile. Restul (plicuri, conturi, venituri) se poate descărca o dată, ca fișier JSON. Bonurile și prețurile stau pe telefoanele familiei, criptate.")}</p><div className="bf-settings-actions">{hasLegacyData(data) && <button type="button" className="bf-secondary" onClick={() => void saveExport(`bonai-arhiva-${todayIso()}.json`, new Blob([JSON.stringify(buildLegacyArchive(data), null, 2)], { type: "application/json" }))}>{t("Descarcă datele vechi")}</button>}</div></section></SettingsGroup><SettingsGroup id="backup" title={t("Copii de siguranță")} hint={t("Backup, import, închiderea anului")} keywords="backup copie import export restaurare an inchide" query={settingsQuery}><YearCloseSection data={data} onChange={onChange} /><section><p className="bf-kicker">{t("BACKUP ȘI RECUPERARE")}</p><h2>{t("Protejează registrul local")}</h2><p>{t("Backup-ul este un fișier local JSON. Nu este trimis automat în rețea și poate fi importat pe un alt dispozitiv.")}</p><p className="bf-helper">{t(BACKUP_SAVE_HELPER)}</p><div className="bf-backup-actions"><button type="button" className="bf-primary" disabled={saving} onClick={() => void exportBackup("save")}><Download size={16} /> {saving ? t("Se salvează…") : t("Salvează pe telefon")}</button><button type="button" onClick={() => void exportBackup("share")}><Share2 size={16} /> {t("Trimite o copie")}</button><label className="bf-file-button"><Upload size={16} /> {t("Alege backup")}<input type="file" accept=".json,application/json,text/plain,application/octet-stream" onChange={importBackup} /></label><button type="button" onClick={() => setPasteOpen((value) => !value)}><ClipboardPaste size={16} /> {t("Lipește text")}</button></div>{lastSaved && <p className="bf-backup-saved" role="status">{lastSaved}</p>}<AutoBackupToggle />{pasteOpen && <div className="bf-backup-paste"><label htmlFor="backup-paste">{t("Dacă selectorul de fișiere nu se deschide, deschide backupul cu orice aplicație de fișiere, copiază tot textul și lipește-l aici.")}</label><textarea id="backup-paste" value={pasted} onChange={(event) => setPasted(event.target.value)} rows={5} placeholder={`{"kind":"buget-familie-backup",…`} /><div className="bf-backup-paste-actions"><button type="button" onClick={() => { setPasteOpen(false); setPasted(""); }}>{t("Anulează")}</button><button type="button" className="bf-primary" disabled={!pasted.trim()} onClick={() => acceptBackupText(pasted.trim(), t("text lipit"))}>{t("Citește textul")}</button></div></div>}{backupPreview && <div className="bf-backup-preview" role="alert" aria-live="polite"><div><p className="bf-kicker">{t("PREVIZUALIZARE ÎNAINTE DE IMPORT")}</p><h3>{backupPreview.fileName}</h3><p>{t("Exportat la {when}.", { when: new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(backupPreview.exportedAt)) })}</p><div className="bf-backup-preview-stats"><span><b>{backupPreview.data.transactions.length}</b><small>{t("mișcări")}</small></span><span><b>{backupPreview.data.receipts.length}</b><small>{t("bonuri")}</small></span><span><b>{backupPreview.data.settings.members.length}</b><small>{t("membri")}</small></span></div></div><p className="bf-backup-warning">{t("Importul va înlocui datele locale actuale. Nimic nu se schimbă până nu confirmi.")}</p><div className="bf-backup-preview-actions"><button type="button" onClick={() => setBackupPreview(null)}>{t("Anulează")}</button><button type="button" className="bf-primary" onClick={() => void confirmBackupImport()}><Check size={16} /> {t("Confirmă importul")}</button></div></div>}</section></SettingsGroup><SettingsGroup id="privacy" title={(BILLING_LIVE ? t("Confidențialitate și planuri") : t("Confidențialitate"))} hint={(BILLING_LIVE ? t("Unde stau datele, abonamentul Familia") : t("Unde stau datele și ce trimite aplicația"))} keywords="confidentialitate date planuri abonament premium familia" query={settingsQuery}><Suspense fallback={null}><TrustCenter /></Suspense><Suspense fallback={null}><PremiumStudio /></Suspense></SettingsGroup><section className="bf-danger"><p className="bf-kicker">{t("RESETARE")}</p><h2>{t("Începe curat pe acest dispozitiv")}</h2><p>{t("Șterge numai datele locale. O copie sincronizată sau exportată nu este afectată.")}</p><button onClick={onReset}><Trash2 size={16} /> {t("Resetează datele locale")}</button></section></div>;
}

/**
 * Reamintirile pe Android: unele telefoane (Huawei, Honor, Xiaomi, Oppo…) opresc aplicațiile în fundal și
 * le anulează alarmele, iar testul merge (aplicația e deschisă) dar ora de seară nu vine. Aici omul vede
 * dacă s-a pierdut vreo reamintire și deschide direct setarea care o repară.
 */
function ReminderHealthNote() {
  const [health, setHealth] = useState<Awaited<ReturnType<typeof import("@/lib/local-notifications").reminderHealth>>>();
  useEffect(() => {
    let alive = true;
    void import("@/lib/local-notifications").then(({ reminderHealth }) => reminderHealth()).then((value) => { if (alive) setHealth(value); });
    return () => { alive = false; };
  }, []);
  if (!health) return null;
  const strict = /huawei|honor|xiaomi|redmi|poco|oppo|realme|oneplus|vivo|meizu|asus/i.test(health.manufacturer);
  const missed = health.missed.length;
  if (!missed && health.ignoringBatteryOptimizations && !strict) return null;
  const last = health.missed[health.missed.length - 1];
  return <div className="bf-scan-note is-warning" role="status">
    <p>{missed
      ? t("Reamintirea de {when} nu a sosit: telefonul a oprit aplicația în fundal.", { when: new Date(last).toLocaleString(getLocale(), { weekday: "long", hour: "2-digit", minute: "2-digit" }) })
      : t("Pe acest telefon, reamintirile pot întârzia sau lipsi dacă aplicația nu are voie să ruleze în fundal.")}</p>
    <p>{strict
      ? t("Pe {maker}: Setări → Baterie / Lansare aplicații → BonAI → Gestionare manuală, cu „Lansare automată” și „Rulare în fundal” pornite.", { maker: health.manufacturer })
      : t("Setări → Aplicații → BonAI → Baterie → „Fără restricții”.")}</p>
    <button type="button" className="bf-secondary" onClick={() => void import("@/lib/local-notifications").then(({ openBatterySettings }) => openBatterySettings())}>{t("Deschide setarea")}</button>
  </div>;
}
