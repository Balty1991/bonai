/**
 * Ecranul Setări. Scos din home-secondary. Comportamentul e același.
 */


import "../monthly-needs.css";
import "../pocket.css";
import { lazy, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { warmLazy } from "@/lib/lazy-safe";
import { Check, ClipboardPaste, Download, LockKeyhole, Search, Share2, Upload } from "lucide-react";
import { foldRomanian, normalizeAppData, type AppData } from "@/lib/finance-data";
import { downloadBackup, isNativeApp, parseBackup, type BackupIntent } from "@/lib/app-storage";
import { AutoBackupToggle } from "@/components/AutoBackupToggle";

import { BACKUP_SAVE_FALLBACK, BACKUP_SAVE_HELPER } from "@/lib/backup-ui-copy";
import { disableLocalAlerts, enableLocalAlerts, getNotificationPermission, isNotificationsArmed, isNotificationsEnabled, scheduleFinancialReminders, sendTestAlert, type NotificationPref } from "@/lib/local-notifications";
import { NOTIFY_KINDS, readNotifyPrefs, writeNotifyPrefs, type NotifyKind, type NotifyPrefs } from "@/lib/notify-prefs";
import { isOfflineOnly } from "@/lib/ui-prefs";
import { errorReportsAvailable, readErrorReports, saveErrorReports } from "@/lib/error-reports";
import { disableAppLock, hasAppLockPin, isAppLockEnabled, isValidPin, setAppLockPin } from "@/lib/app-lock";
import { Field } from "@/pages/home-kit";
import { readSecureScreen, saveSecureScreen } from "@/lib/secure-screen";

import { getLocale, languages, t } from "@/lib/i18n";


import { useLanguage } from "@/hooks/use-language";
import { askConfirm, showNotice } from "@/lib/confirm-dialog";
import { getActiveFamilyRoom } from "@/lib/billing";
import { writeAutoBackup } from "@/lib/auto-backup";

import { APP_PRIVACY_PATH, APP_TERMS_PATH, APP_VERSION, publicLegalUrl } from "@/lib/app-version";
import { buildLegacyArchive, hasLegacyData } from "@/lib/legacy-archive";
import { saveExport } from "@/lib/save-export";
import { isoToday as todayIso } from "@/lib/finance-data";


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
/** Selectorul de limbă. Schimbarea are efect imediat, fără reîncărcarea aplicației. */
function LanguageSection() {
  const [lang, setLang] = useLanguage();
  return <section><p className="bf-kicker">{t("LIMBĂ")}</p><h2>{t("Limba aplicației")}</h2><p>{t("Se schimbă doar afișarea. Datele, categoriile și notele rămân exact cum le-ai scris.")}</p><div className="bf-language-switch" role="group" aria-label={t("Limba aplicației")}>{languages.map((item) => <button key={item.id} type="button" aria-pressed={lang === item.id} className={lang === item.id ? "active" : ""} onClick={() => setLang(item.id)}>{item.label}</button>)}</div></section>;
}

function LocalAlertsSettings({ data, shop = false }: { data: AppData; shop?: boolean }) {
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
    bills: shop ? [t("Abonamente, facturi și rate"), t("Cu câte zile alegi la fiecare.")] : [t("Scadențe și rate"), t("Cu 3 zile înainte și în ziua plății.")],
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
        {(shop ? NOTIFY_KINDS.filter((kind) => kind === "bills" || kind === "backup" || kind === "warranty") : NOTIFY_KINDS).map((kind) => <label key={kind} className="bf-alert-kind"><span><b>{kindText[kind][0]}</b><small>{kindText[kind][1]}</small></span><input type="checkbox" checked={!notifyPrefs.off.includes(kind)} onChange={(event) => updatePrefs({ ...notifyPrefs, off: event.target.checked ? notifyPrefs.off.filter((item) => item !== kind) : [...notifyPrefs.off, kind] })} /></label>)}
        {!shop && <label className="bf-alert-kind"><span><b>{t("Ora amintirii de seară")}</b><small>{t("Doar dacă tu n-ai notat azi.")}</small></span><select value={notifyPrefs.eveningHour} disabled={notifyPrefs.off.includes("checkin")} onChange={(event) => updatePrefs({ ...notifyPrefs, eveningHour: Number(event.target.value) })}>{[18, 19, 20, 21, 22].map((hour) => <option key={hour} value={hour}>{`${hour}:00`}</option>)}</select></label>}
      </div>
      {!shop && <p className="bf-helper">{t("Cheltuielile adăugate de alt membru te anunță când telefoanele sunt sincronizate.")}</p>}
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
  const settings = data.settings; const change = (patch: Partial<typeof settings>) => onChange({ ...data, settings: { ...settings, ...patch } });
  const [, setSimpleModeState] = useState(() => { try { return window.localStorage.getItem("buget-familie:simple-mode") === "1"; } catch { return false; } });
  const [, setOfflineOnlyState] = useState(() => isOfflineOnly());
  useEffect(() => {
    const onPrefs = (event: Event) => {
      const detail = (event as CustomEvent<{ simpleMode?: boolean; offlineOnly?: boolean }>).detail;
      if (typeof detail?.simpleMode === "boolean") setSimpleModeState(detail.simpleMode);
      if (typeof detail?.offlineOnly === "boolean") setOfflineOnlyState(detail.offlineOnly);
    };
    window.addEventListener("buget-familie:ui-prefs", onPrefs);
    return () => window.removeEventListener("buget-familie:ui-prefs", onPrefs);
  }, []);
  const [settingsQuery, setSettingsQuery] = useState("");
  return <div className="bf-settings bn-settings"><label className="bf-settings-search"><Search size={17} aria-hidden="true" /><input type="search" value={settingsQuery} onChange={(event) => setSettingsQuery(event.target.value)} placeholder={t("Caută în setări")} aria-label={t("Caută în setări")} /></label>
    <SettingsGroup id="general" title={t("General")} hint={t("Limba aplicației, numele familiei")} keywords="limba english familie nume" query={settingsQuery}><LanguageSection /><section><p className="bf-kicker">{t("FAMILIE")}</p><Field label={t("Numele familiei")}><input value={settings.familyName} onChange={(event) => change({ familyName: event.target.value })} /></Field></section></SettingsGroup>
    <SettingsGroup id="alerts" title={t("Notificări și siguranță")} hint={t("Scadențe, garanții, copie de siguranță, PIN")} keywords="notificari alerte amintire pin blocare" query={settingsQuery}><LocalAlertsSettings data={data} shop /><AppLockSettings /></SettingsGroup>
    <SettingsGroup id="backup" title={t("Copii de siguranță")} hint={t("Salvează sau mută datele pe alt telefon")} keywords="backup copie import export restaurare" query={settingsQuery}><section><p className="bf-kicker">{t("BACKUP ȘI RECUPERARE")}</p><h2>{t("Protejează registrul local")}</h2><p>{t("Backup-ul este un fișier local JSON. Nu este trimis automat în rețea și poate fi importat pe un alt dispozitiv.")}</p><p className="bf-helper">{t(BACKUP_SAVE_HELPER)}</p><div className="bf-backup-actions"><button type="button" className="bf-primary" disabled={saving} onClick={() => void exportBackup("save")}><Download size={16} /> {saving ? t("Se salvează…") : t("Salvează pe telefon")}</button><button type="button" onClick={() => void exportBackup("share")}><Share2 size={16} /> {t("Trimite o copie")}</button><label className="bf-file-button"><Upload size={16} /> {t("Alege backup")}<input type="file" accept=".json,application/json,text/plain,application/octet-stream" onChange={importBackup} /></label><button type="button" onClick={() => setPasteOpen((value) => !value)}><ClipboardPaste size={16} /> {t("Lipește text")}</button></div>{lastSaved && <p className="bf-backup-saved" role="status">{lastSaved}</p>}<AutoBackupToggle />{pasteOpen && <div className="bf-backup-paste"><label htmlFor="backup-paste">{t("Dacă selectorul de fișiere nu se deschide, deschide backupul cu orice aplicație de fișiere, copiază tot textul și lipește-l aici.")}</label><textarea id="backup-paste" value={pasted} onChange={(event) => setPasted(event.target.value)} rows={5} placeholder={`{"kind":"buget-familie-backup",…`} /><div className="bf-backup-paste-actions"><button type="button" onClick={() => { setPasteOpen(false); setPasted(""); }}>{t("Anulează")}</button><button type="button" className="bf-primary" disabled={!pasted.trim()} onClick={() => acceptBackupText(pasted.trim(), t("text lipit"))}>{t("Citește textul")}</button></div></div>}{backupPreview && <div className="bf-backup-preview" role="alert" aria-live="polite"><div><p className="bf-kicker">{t("PREVIZUALIZARE ÎNAINTE DE IMPORT")}</p><h3>{backupPreview.fileName}</h3><p>{t("Exportat la {when}.", { when: new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(backupPreview.exportedAt)) })}</p><div className="bf-backup-preview-stats"><span><b>{backupPreview.data.transactions.length}</b><small>{t("mișcări")}</small></span><span><b>{backupPreview.data.receipts.length}</b><small>{t("bonuri")}</small></span><span><b>{backupPreview.data.settings.members.length}</b><small>{t("membri")}</small></span></div></div><p className="bf-backup-warning">{t("Importul va înlocui datele locale actuale. Nimic nu se schimbă până nu confirmi.")}</p><div className="bf-backup-preview-actions"><button type="button" onClick={() => setBackupPreview(null)}>{t("Anulează")}</button><button type="button" className="bf-primary" onClick={() => void confirmBackupImport()}><Check size={16} /> {t("Confirmă importul")}</button></div></div>}</section></SettingsGroup>
    <SettingsGroup id="privacy" title={t("Date și confidențialitate")} hint={t("Datele vechi, export, unde stau datele")} keywords="date confidentialitate arhiva veche buget export json privacy" query={settingsQuery}><section><p className="bf-kicker">{t("DATE ȘI CONFIDENȚIALITATE")}</p><h2>{t("Datele din versiunea veche")}</h2><p>{t("Cheltuielile vechi sunt deja în Toate costurile. Restul (plicuri, conturi, venituri) se poate descărca o dată, ca fișier JSON. Bonurile și prețurile stau pe telefoanele familiei, criptate.")}</p><div className="bf-settings-actions">{hasLegacyData(data) && <button type="button" className="bf-secondary" onClick={() => void saveExport(`bonai-arhiva-${todayIso()}.json`, new Blob([JSON.stringify(buildLegacyArchive(data), null, 2)], { type: "application/json" }))}>{t("Descarcă datele vechi")}</button>}</div></section></SettingsGroup>
    <SettingsGroup id="about" title={t("Despre BonAI")} hint={t("Versiune, confidențialitate, termeni")} keywords="despre versiune legal termeni confidentialitate" query={settingsQuery}><section><p className="bf-kicker">{t("DESPRE")}</p><h2>BonAI {APP_VERSION}</h2><p>{t("Scanare inteligentă a bonurilor. Datele familiei stau pe telefoanele voastre, criptate.")}</p><div className="bf-settings-actions"><a className="bf-secondary" href={publicLegalUrl(APP_PRIVACY_PATH)} target="_blank" rel="noopener">{t("Politica de confidențialitate")}</a><a className="bf-secondary" href={publicLegalUrl(APP_TERMS_PATH)} target="_blank" rel="noopener">{t("Termeni")}</a></div>
      <p className="bf-kicker">{t("DATE DESCHISE")}</p>
      <p className="bf-settings-attrib">{t("Numele produselor după codul de bare vin din Open Food Facts, Open Pet Food Facts, Open Products Facts și Open Beauty Facts (© contribuitorii, licența ODbL 1.0) și din Wikidata (CC0). Telefonul trimite doar codul de bare.")} <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a> · <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a></p>
    </section></SettingsGroup>
    <section className="bf-danger-zone"><button type="button" className="bf-danger" onClick={onReset}>{t("Șterge toate datele de pe acest telefon")}</button></section>
  </div>;
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
