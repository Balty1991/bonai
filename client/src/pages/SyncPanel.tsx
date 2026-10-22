import { readAppMode } from "@/lib/app-mode";
/**
 * Ecranul Sync. Scos din home-secondary. Conectarea rămâne aceeași.
 * Starea live trăiește în Home, ca să reziste la schimbarea de tab.
 */
import { useEffect, useState } from "react";
import { Check, Cloud, Copy, KeyRound, RotateCcw, Send, ShieldAlert, Smartphone, UserRound, Users, X } from "lucide-react";
import { checkFamilyPassword, LEGACY_PASSWORD_UNTIL } from "@/lib/family-password";
import { inviteLink, inviteMessage, parseInvite } from "@/lib/family-invite";
import { InviteQr } from "@/components/InviteQr";
import { isNativeApp } from "@/lib/app-storage";
import { formatDate } from "@/lib/finance-data";
import { Field, type SyncPanelProps } from "@/pages/home-kit";
import { getLocale, t } from "@/lib/i18n";
import { canUseFamilySync, BILLING_LIVE } from "@/lib/entitlements";
import { hasActiveFamilie } from "@/lib/billing-store";
import { gateSecondPhone } from "@/lib/launch-offer";
import { BONUT_PRICES } from "@/lib/bonut-plans";
import { showNotice } from "@/lib/confirm-dialog";

/**
 * Cât de greu e de ghicit parola de familie, spus pe loc.
 * Din ea se derivă identificatorul camerei de sincronizare, deci o parolă slabă
 * nu înseamnă doar „cineva citește”, ci „cineva poate suprascrie”.
 */
function PasswordMeter({ value }: { value: string }) {
  const verdict = checkFamilyPassword(value);
  return (
    <div className={`bf-password-meter s${verdict.score}`} role="status" aria-live="polite">
      <div className="bf-password-bars" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => <i key={index} className={index < verdict.score ? "on" : ""} />)}
      </div>
      <b>{verdict.label}</b>
      {verdict.advice.length > 0 && <small>{verdict.advice[0]}</small>}
    </div>
  );
}

/**
 * Linkul invitației deschis din camera telefonului ajunge în browser. Pe Android, acest link
 * `intent://` pornește aplicația instalată cu invitația (schema `bugetfamilie`, AndroidManifest);
 * fără aplicație, Chrome rămâne pe site.
 */
const androidInviteIntent = (raw: string) => {
  const invite = parseInvite(raw);
  if (!invite) return "#";
  const code = `bf1.${invite.roomId}.${invite.key}`;
  return `intent://alatura?cod=${code}#Intent;scheme=bugetfamilie;package=ro.balty1991.bugetfamilie;end`;
};

/** Trimite invitația prin foaia de partajare a telefonului (WhatsApp, SMS…); fără ea, doar copiem. */
async function shareInvite(code: string): Promise<boolean> {
  const invite = parseInvite(code);
  if (!invite) return false;
  const text = inviteMessage(invite);
  try {
    if (isNativeApp()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: t("Invitație BonAI"), text });
      return true;
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ title: t("Invitație BonAI"), text });
      return true;
    }
  } catch {
    // Anulat sau indisponibil: rămâne butonul de copiere.
  }
  return false;
}

/**
 * „Cine ești pe acest telefon?” — fiecare telefon notează pe membrul lui.
 * Alegerea rămâne pe telefon; numele membrilor se sincronizează.
 */
function SelfMemberPicker({ members, selfMemberId, needsChoice, onChoose, onAdd }: { members: SyncPanelProps["members"]; selfMemberId: string; needsChoice: boolean; onChoose: (id: string) => void; onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const add = () => {
    if (!name.trim()) return;
    onAdd(name);
    setName("");
    setAdding(false);
  };
  return (
    <section className={`bf-sync-self${needsChoice ? " is-needed" : ""}`} aria-labelledby="sync-self-title">
      <p className="bf-kicker">{t("PE ACEST TELEFON")}</p>
      <h3 id="sync-self-title"><UserRound size={16} aria-hidden="true" /> {t("Cine ești pe acest telefon?")}</h3>
      <p className="bf-helper">{needsChoice
        ? t("Alege-ți numele, ca tot ce notezi de aici să apară pe tine, nu pe celălalt telefon.")
        : t("Ce notezi de aici apare pe acest membru. Celălalt telefon își alege singur membrul lui.")}</p>
      <div className="bf-sync-self-options" role="radiogroup" aria-labelledby="sync-self-title">
        {members.map((member) => (
          <button key={member.id} type="button" role="radio" aria-checked={member.id === selfMemberId && !needsChoice} className={member.id === selfMemberId && !needsChoice ? "active" : ""} onClick={() => onChoose(member.id)}>
            {member.name}
          </button>
        ))}
        <button type="button" className={adding ? "active" : ""} onClick={() => setAdding((value) => !value)}>{t("Altcineva")}</button>
      </div>
      {adding && (
        <div className="bf-sync-self-add">
          <Field label={t("Numele tău")}>
            <input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} maxLength={40} placeholder="ex. Ioana" />
          </Field>
          <button type="button" className="bf-secondary" disabled={!name.trim()} onClick={add}>{t("Sunt eu")}</button>
        </div>
      )}
    </section>
  );
}

export function SyncPanel({ connected, busy, online, password, setPassword, notice, lastSync, journal, devices, thisDeviceId, onConnect, onDisconnect, onClearJournal, onRevokeDevice, onRestoreDevice, isAdmin, adminDeviceId, onMakeAdmin, passwordRevealOnce, clearPasswordReveal, recoveryRevealOnce, clearRecoveryReveal, recoveryIssued, onRecoverPassword, onIssueRecovery, sessionRemembered, invite, inviteRoom, inviteDraft, setInviteDraft, onCreateRoom, onJoinInvite, onMoveToInvite, members, selfMemberId, needsSelfChoice, onChooseSelf, onAddSelf, otherPhoneLogged = false }: SyncPanelProps) {
  const [showGenerated, setShowGenerated] = useState(Boolean(passwordRevealOnce));
  const [generatedOnce, setGeneratedOnce] = useState(passwordRevealOnce || "");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(Boolean(passwordRevealOnce));
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryShown, setRecoveryShown] = useState(recoveryRevealOnce || "");
  const [showSessionPassword, setShowSessionPassword] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState("");
  const [phoneBlocked, setPhoneBlocked] = useState(false);
  const openSecondPhone = (run: () => void) => {
    const gate = gateSecondPhone({ billingLive: BILLING_LIVE, hasPaidFamilie: hasActiveFamilie(), otherPhoneLogged });
    if (gate === "blocked") {
      setPhoneBlocked(true);
      return;
    }
    setPhoneBlocked(false);
    run();
  };
  useEffect(() => {
    if (!passwordRevealOnce) return;
    setPassword(passwordRevealOnce);
    setGeneratedOnce(passwordRevealOnce);
    setShowGenerated(true);
    setLegacyOpen(true);
    clearPasswordReveal?.();
  }, [passwordRevealOnce, setPassword, clearPasswordReveal]);
  useEffect(() => {
    if (!recoveryRevealOnce) return;
    setRecoveryShown(recoveryRevealOnce);
    clearRecoveryReveal?.();
  }, [recoveryRevealOnce, clearRecoveryReveal]);
  const latest = journal[0];
  const pendingMerge = connected && latest?.status === "detected";
  const failedMerge = connected && latest?.status === "failed";
  const stateLabel = busy
    ? t("Se conectează…")
    : !online
      ? (connected ? t("Offline — sesiune activă, fără rețea") : t("Fără conexiune"))
    : !connected
      ? t("Nu este conectat")
      : pendingMerge
        ? t("Conectat — unire în așteptare")
        : failedMerge
          ? t("Conectat — ultima unire a eșuat")
          : lastSync
            ? t("Conectat — sincronizat")
            : t("Conectat — așteptăm prima confirmare");
  const stateClass = busy ? "busy" : !online ? "offline" : !connected ? "idle" : pendingMerge || failedMerge ? "busy" : "connected";
  const stateDetail = !online
    ? t("Rețeaua lipsește. Registrul local rămâne intact; sync-ul se reia automat la reconectare.")
    : lastSync
    ? t("Ultima confirmare: {time}", { time: new Intl.DateTimeFormat(getLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(lastSync)) })
    : connected
      ? t("Așteptăm prima confirmare de la spațiul familiei.")
      : t("Conectează acest telefon pentru a vedea actualizările celorlalte dispozitive.");

  const copySecret = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedSecret(value);
      window.setTimeout(() => setCopiedSecret((current) => current === value ? "" : current), 2500);
      return;
    } catch { /* fallback below */ }
    try {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.left = "-9999px";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      if (!ok) throw new Error("copy");
      setCopiedSecret(value);
      window.setTimeout(() => setCopiedSecret((current) => current === value ? "" : current), 2500);
    } catch {
      void showNotice(t("Nu am putut copia. Selectează codul și copiază-l tu."));
    }
  };

  return <div className="bf-sync">
    {/* Al doilea telefon e în BonAI Familie: prețurile vin din planurile BonAI, nu din vechiul plan „Familia” al bugetului. */}
    {!canUseFamilySync() || phoneBlocked ? <aside className="bf-sync-local-only" role="note">
      <p className="bf-kicker">{t("BONAI FAMILIE")}</p>
      <p>{t("Al doilea telefon intră în BonAI Familie: {year} lei/an sau {month} lei/lună. Pe un singur telefon, totul rămâne gratuit.", { year: BONUT_PRICES.familie.year.toLocaleString("ro-RO", { minimumFractionDigits: 2 }), month: BONUT_PRICES.familie.month.toLocaleString("ro-RO", { minimumFractionDigits: 2 }) })}</p>
    </aside> : null}
    <div className="bf-sync-hero"><Users size={25} /><p className="bf-kicker">{connected ? t("FAMILIE CONECTATĂ") : t("SINCRONIZARE")}</p><h2>{connected ? t("Sesiunea familiei este activă.") : t("Sincronizare criptată, în timp real, între telefoane.")}</h2><p>{t("Datele se criptează pe telefon. Serverul vede doar un pachet pe care nu-l poate citi.")}</p></div>
    {readAppMode() === "shop" ? <aside className="bf-sync-local-only" role="note">
      <p className="bf-kicker">{t("CE SE SINCRONIZEAZĂ")}</p>
      <ul>
        <li>{t("Bonurile, produsele și prețurile")}</li>
        <li>{t("Lista de cumpărături, stocul și meniul")}</li>
        <li>{t("Abonamentele, facturile, datoriile și garanțiile")}</li>
      </ul>
      <p className="bf-kicker">{t("CE NU SE SINCRONIZEAZĂ")}</p>
      <ul>
        <li>{t("Codul PIN și setările acestui telefon")}</li>
        <li>{t("Pozele bonurilor (nu se păstrează)")}</li>
      </ul>
      <p>{t("Dacă același lucru e schimbat diferit pe două telefoane, te întrebăm care variantă rămâne — nu alegem noi în locul tău.")}</p>
    </aside> : <aside className="bf-sync-local-only" role="note">
      <p className="bf-kicker">{t("CE SE SINCRONIZEAZĂ")}</p>
      <ul>
        <li>{t("Mișcări, plicuri, scadențe, datorii, economii")}</li>
        <li>{t("Membri, surse și planul până la salariu")}</li>
        <li>{t("Rezumatul cozii De verificat (titlu, sumă, dată)")}</li>
      </ul>
      <p className="bf-kicker">{t("CE NU SE SINCRONIZEAZĂ")}</p>
      <p>{t("Rămân doar pe acest telefon — partenerul nu le vede automat:")}</p>
      <ul>
        <li>{t("Confirmarea din De verificat (doar pe telefonul care a creat propunerea)")}</li>
        <li>{t("Regulile de comerciant")}</li>
        <li>{t("Șabloanele rapide")}</li>
        <li>{t("Cursurile valutare salvate")}</li>
      </ul>
      <p>{t("Dacă aceeași sumă (un plic sau o mișcare) e schimbată diferit pe două telefoane, te întrebăm care variantă rămâne — nu alegem noi în locul tău. La notițe și etichete rămâne ultima modificare.")}</p>
    </aside>}
    <div className={`bf-sync-state ${stateClass}`} role="status"><span aria-hidden="true">{connected && !busy && !pendingMerge && !failedMerge ? <Check size={15} /> : busy || pendingMerge ? <RotateCcw size={15} /> : <Cloud size={15} />}</span><div><b>{stateLabel}</b><small>{stateDetail}</small></div></div>

    <section className="bf-sync-session">
      <p className="bf-kicker">{connected ? t("CONECTAT") : t("CONECTEAZĂ FAMILIA")}</p>
      {connected ? <>
        <p><b>{t("Actualizare live, fără reîmprospătare manuală")}</b><br />{readAppMode() === "shop" ? t("Cât aplicația rămâne deschisă pe orice telefon din familie, bonurile și lista apar automat pe toate celelalte în câteva secunde.") : t("Cât aplicația rămâne deschisă pe orice telefon din familie, mișcările apar automat pe toate celelalte în câteva secunde.")}</p>
        {sessionRemembered && <p className="bf-helper">{invite ? t("Telefonul se reconectează singur când redeschizi aplicația.") : t("Telefonul se reconectează singur când redeschizi aplicația. Parola nu e păstrată, doar o cheie făcută din ea.")}</p>}
        {!isAdmin ? (
          <div className="bf-sync-invite" role="note">
            <p className="bf-kicker">{t("INVITĂ UN TELEFON")}</p>
            <p>{t("Invitațiile le trimite administratorul camerei: {device}. Tot el poate scoate sau reactiva un telefon.", { device: devices.find((device) => device.id === adminDeviceId)?.label || t("telefonul care a creat camera") })}</p>
          </div>
        ) : invite ? (
          <div className="bf-sync-invite">
            <p className="bf-kicker">{t("INVITĂ UN TELEFON")}</p>
            <p>{t("Trimite invitația partenerului. Pe telefonul lui: Sync → „Am primit o invitație” → lipește mesajul.")}</p>
            <div className="bf-sync-invite-actions">
              <button type="button" className="bf-primary" onClick={() => openSecondPhone(() => void shareInvite(invite).then((shared) => { if (!shared) void copySecret(inviteMessage(parseInvite(invite)!)); }))}><Send size={16} /> {t("Trimite invitația")}</button>
              <button type="button" className="bf-secondary" onClick={() => openSecondPhone(() => void copySecret(inviteMessage(parseInvite(invite)!)))}><Copy size={16} /> {copiedSecret === inviteMessage(parseInvite(invite)!) ? t("Copiat în clipboard") : t("Copiază invitația")}</button>
            </div>
            <button type="button" className="bf-link-button" aria-expanded={qrOpen} onClick={() => openSecondPhone(() => setQrOpen((value) => !value))}>{qrOpen ? t("Ascunde codul QR") : t("Arată codul QR")}</button>
            {qrOpen && <InviteQr link={inviteLink(parseInvite(invite)!)} />}
            <p className="bf-helper">{t("Cine are invitația intră în familie. Trimite-o doar oamenilor din casă.")}</p>
            {/* Invitația nu expiră singură; dacă a ajuns unde nu trebuia, o schimbi aici. */}
            {moveConfirm ? (
              <div className="bf-sync-invite-actions" role="note">
                <p className="bf-helper">{t("Se face o cameră nouă, cu invitație nouă, iar cea veche se golește. Celelalte telefoane se opresc până primesc invitația nouă; datele lor nu se pierd.")}</p>
                <button type="button" className="bf-primary" disabled={busy || !online} onClick={() => { setMoveConfirm(false); onMoveToInvite(); }}>{t("Da, schimbă invitația")}</button>
                <button type="button" className="bf-secondary" onClick={() => setMoveConfirm(false)}>{t("Anulează")}</button>
              </div>
            ) : (
              <button type="button" className="bf-link-button" disabled={busy || !online} onClick={() => setMoveConfirm(true)}>{t("Invitația a ajuns unde nu trebuia? Schimb-o")}</button>
            )}
          </div>
        ) : inviteRoom ? (
          <div className="bf-sync-invite" role="note">
            <p className="bf-kicker">{t("INVITĂ UN TELEFON")}</p>
            <p>{t("Pe web nu păstrăm codul invitației după repornire: e chiar cheia familiei. Trimite invitația de pe un telefon cu aplicația Android sau lipește codul mai jos.")}</p>
            <div className="bf-sync-invite-actions">
              <input className="bf-sync-invite-paste" aria-label={t("Codul invitației")} value={inviteDraft} onChange={(event) => setInviteDraft(event.target.value)} placeholder="bf1.…" />
              <button type="button" className="bf-secondary" disabled={!parseInvite(inviteDraft)} onClick={() => openSecondPhone(() => void shareInvite(inviteDraft).then((shared) => { if (!shared) void copySecret(inviteMessage(parseInvite(inviteDraft)!)); }))}><Send size={16} /> {t("Trimite invitația")}</button>
            </div>
            {moveConfirm ? (
              <div className="bf-sync-invite-actions">
                <button type="button" className="bf-primary" disabled={busy || !online} onClick={() => { setMoveConfirm(false); onMoveToInvite(); }}>{t("Da, schimbă invitația")}</button>
                <button type="button" className="bf-secondary" onClick={() => setMoveConfirm(false)}>{t("Anulează")}</button>
              </div>
            ) : (
              <button type="button" className="bf-link-button" disabled={busy || !online} onClick={() => setMoveConfirm(true)}>{t("Nu mai ai codul? Fă o invitație nouă")}</button>
            )}
          </div>
        ) : (
          <div className="bf-sync-move" role="note">
            <p className="bf-kicker">{t("CAMERĂ CU PAROLĂ")}</p>
            <p>{t("Familia folosește încă o cameră făcută din parolă. Două familii cu aceeași parolă ajung în aceeași cameră, iar o parolă ghicită deschide datele. Mută familia într-o cameră nouă, cu invitație.")}</p>
            {moveConfirm ? (
              <div className="bf-sync-invite-actions">
                <button type="button" className="bf-primary" disabled={busy || !online} onClick={() => { setMoveConfirm(false); onMoveToInvite(); }}>{t("Da, mută familia")}</button>
                <button type="button" className="bf-secondary" onClick={() => setMoveConfirm(false)}>{t("Anulează")}</button>
                <p className="bf-helper">{t("Celelalte telefoane se opresc până primesc invitația nouă. Datele lor nu se pierd: se unesc când intră.")}</p>
              </div>
            ) : (
              <button type="button" className="bf-secondary" disabled={busy || !online} onClick={() => setMoveConfirm(true)}>{t("Mută familia")}</button>
            )}
          </div>
        )}
        {recoveryShown && (
          <div className="bf-notice bf-sync-secret" role="status">
            <p><KeyRound size={14} /> {t("Notează acest cod o dată, pe hârtie, nu în telefon. Cu el intri din nou în familie dacă pierzi telefonul sau ștergi aplicația.")}</p>
            <code className="bf-sync-password-once">{recoveryShown}</code>
            <button type="button" className="bf-secondary" onClick={() => void copySecret(recoveryShown)}>
              <Copy size={16} /> {copiedSecret === recoveryShown ? t("Copiat în clipboard") : t("Copiază codul")}
            </button>
          </div>
        )}
        <div className="bf-sync-recovery-actions">
          {!invite && !inviteRoom && <button type="button" className="bf-link-button" onClick={() => setShowSessionPassword((value) => !value)}>
            {showSessionPassword ? t("Ascunde parola acestei sesiuni") : t("Arată parola acestei sesiuni")}
          </button>}
          <button type="button" className="bf-link-button" onClick={onIssueRecovery} disabled={busy}>
            {recoveryIssued ? t("Cod nou de recuperare") : t("Creează cod de recuperare")}
          </button>
        </div>
        {showSessionPassword && !password && (
          <p className="bf-helper" role="status">{t("Sesiunea s-a reluat singură, iar parola nu e păstrată pe telefon. Dacă ai uitat-o, folosește codul de recuperare.")}</p>
        )}
        {showSessionPassword && password && (
          <div className="bf-notice bf-sync-secret" role="status">
            <p>{t("Parola acestei sesiuni (doar cât ești conectat):")}</p>
            <code className="bf-sync-password-once">{password}</code>
            <button type="button" className="bf-secondary" onClick={() => void copySecret(password)}>
              <Copy size={16} /> {copiedSecret === password ? t("Copiat în clipboard") : t("Copiază parola")}
            </button>
          </div>
        )}
        {recoveryIssued && !recoveryShown && (
          <p className="bf-helper">{invite
            ? t("Un cod de recuperare există deja. E cel notat la crearea camerei. Poți emite altul — cel vechi rămâne valabil până mutați familia într-o cameră nouă.")
            : t("Un cod de recuperare există deja. E cel notat la prima conectare. Poți emite altul — cel vechi rămâne valabil până schimbați parola.")}</p>
        )}
        <button className="bf-link-button" onClick={onDisconnect}>{t("Închide sesiunea acestui telefon")}</button>
      </> : <>
        <div className="bf-sync-backup-reminder" role="note">
          <ShieldAlert size={16} aria-hidden="true" />
          <p>{t("Înainte de reinstalare sau de schimbarea telefonului: exportă un backup din Setări și păstrează codul de recuperare.")}</p>
        </div>
        <div className="bf-sync-start">
          <p><b>{t("Primul telefon din familie")}</b><br />{t("Creează camera familiei, apoi trimite invitația celorlalte telefoane. Nu ai nevoie de cont sau de parolă.")}</p>
          <button className="bf-primary full" disabled={busy || !online} onClick={() => openSecondPhone(onCreateRoom)}><Users size={17} /> {t("Creează camera")}</button>
        </div>
        <div className={`bf-sync-start${inviteDraft ? " is-offered" : ""}`}>
          <p><b>{t("Am primit o invitație")}</b><br />{t("Lipește mesajul sau linkul primit de la partener.")}</p>
          {/* Linkul din WhatsApp se deschide în browser: de aici, o atingere duce invitația în aplicație. */}
          {parseInvite(inviteDraft) && !isNativeApp() && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) && <>
            <a className="bf-primary full bf-open-in-app" href={androidInviteIntent(inviteDraft)}><Smartphone size={17} /> {t("Deschide în aplicație")}</a>
            <p className="bf-helper">{t("Ai aplicația instalată? Intră din ea, nu din browser: altfel familia vede două telefoane.")}</p>
          </>}
          <Field label={t("Invitația")}>
            <textarea value={inviteDraft} onChange={(event) => setInviteDraft(event.target.value)} rows={3} placeholder={t("Lipește invitația aici")} autoComplete="off" spellCheck={false} />
          </Field>
          <button className="bf-primary full" disabled={busy || !online || !parseInvite(inviteDraft)} onClick={() => openSecondPhone(() => onJoinInvite(inviteDraft))}><Users size={17} /> {t("Intră în familie")}</button>
          {/* Răspunsul apare lângă buton: mai jos, sub istoric, nu se vedea și părea că nu se întâmplă nimic. */}
          {notice && !busy && <p className="bf-notice" role="status">{notice}</p>}
          {!online && <p className="bf-helper" role="note">{t("Fără internet nu se poate intra în familie. Butonul pornește singur când revine conexiunea.")}</p>}
          {inviteDraft.trim() && !parseInvite(inviteDraft) && <p className="bf-form-error">{t("Codul nu arată ca o invitație. Lipește tot mesajul primit sau tot linkul.")}</p>}
        </div>
        <button type="button" className="bf-link-button" aria-expanded={legacyOpen} onClick={() => setLegacyOpen((value) => !value)}>{t("Am o parolă de familie")}</button>
        {legacyOpen && <>
        <p className="bf-helper">{t("Doar pentru camerele create înainte de invitații. Trebuie să fie identică, literă cu literă, cu cea de pe celelalte telefoane.")}</p>
        <p className="bf-form-error" role="note">{t("Intrarea cu parolă se închide pe {date}. După ce intri, mută familia pe invitație (buton „Mută familia”).", { date: formatDate(LEGACY_PASSWORD_UNTIL, { day: "numeric", month: "long", year: "numeric" }) })}</p>
        <Field label={t("Parola familiei")}>
          <input type={showGenerated ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setShowGenerated(false); }} placeholder={t("12+ caractere")} autoComplete="current-password" />
          {password.length > 0 && <PasswordMeter value={password} />}
        </Field>
        {showGenerated && generatedOnce && (
          <div className="bf-notice bf-sync-secret" role="status">
            <p><KeyRound size={14} /> {t("Parola găsită cu codul de recuperare. Noteaz-o în afara telefonului:")}</p>
            <code className="bf-sync-password-once">{generatedOnce}</code>
          </div>
        )}
        <p className="bf-helper">{t("Parola nu se salvează pe telefon și nu este trimisă niciodată necriptată. Telefonul ține minte doar o cheie făcută din ea, ca să se reconecteze singur.")}</p>
        <button className="bf-secondary full" disabled={busy || !online} onClick={onConnect}><KeyRound size={17} /> {t("Conectează cu parola")}</button>
        </>}
        <button type="button" className="bf-link-button" onClick={() => setForgotOpen((value) => !value)}>{t("Am un cod de recuperare")}</button>
        {forgotOpen && (
          <div className="bf-sync-forgot">
            <p className="bf-kicker">{t("RECUPERARE")}</p>
            <p className="bf-helper">{t("Introdu codul notat pe hârtie când s-a creat camera (sau la prima conectare, la camerele vechi). Arată așa: XXXX-XXXX-XXXX-XXXX.")}</p>
            <Field label={t("Cod de recuperare")}>
              <input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value.toUpperCase())} placeholder={t("Codul notat")} autoComplete="off" spellCheck={false} />
            </Field>
            <button type="button" className="bf-secondary" disabled={busy || !online || recoveryInput.replace(/[^A-Z0-9]/gi, "").length < 16} onClick={() => onRecoverPassword(recoveryInput)}>
              {t("Recuperează accesul")}
            </button>
          </div>
        )}
      </>}
    </section>

    {connected && members.length > 0 && <SelfMemberPicker members={members} selfMemberId={selfMemberId} needsChoice={needsSelfChoice} onChoose={onChooseSelf} onAdd={onAddSelf} />}

    {/* Doar cât ești în cameră: după „Închide sesiunea” lista rămânea și îndemna la o revocare fără rost. */}
    {connected && (
      <section className="bf-sync-devices" aria-labelledby="sync-devices-title">
        <div className="bf-sync-journal-heading">
          <div>
            <p className="bf-kicker">{t("DISPOZITIVE")}</p>
            <h3 id="sync-devices-title">{t("Telefoane în cameră")}</h3>
          </div>
        </div>
        {isAdmin && <p className="bf-helper">{t("Revocarea scoate sesiunea de pe acel telefon. Dacă un telefon e pierdut, revocă-l aici, apoi mutați familia într-o cameră nouă („Mută familia”): invitația veche nu mai deschide nimic.")}</p>}
        {devices.length ? (
          <ul className="bf-sync-device-list">
            {devices.map((device) => (
              <li key={device.id} className={device.revokedAt ? "is-revoked" : undefined}>
                <Smartphone size={16} aria-hidden="true" />
                <div>
                  <b>{device.label}{device.id === thisDeviceId ? ` · ${t("acest telefon")}` : ""}{device.id === adminDeviceId ? ` · ${t("administrator")}` : ""}{device.revokedAt ? ` · ${t("revocat")}` : ""}</b>
                  <small>{t("Ultima dată văzut")}: {new Intl.DateTimeFormat(getLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(device.lastSeenAt))}</small>
                </div>
                {!isAdmin ? null : device.revokedAt ? (
                  <button type="button" className="bf-link-button" onClick={() => onRestoreDevice(device.id)}>
                    {t("Reactivează")}
                  </button>
                ) : device.id === thisDeviceId ? null : (
                  // Pentru telefonul tău există „Închide sesiunea acestui telefon”, mai jos.
                  <span className="bf-sync-device-actions">
                    <button type="button" className="bf-link-button" onClick={() => onRevokeDevice(device.id)}>
                      {t("Revocă")}
                    </button>
                    <button type="button" className="bf-link-button" onClick={() => onMakeAdmin(device.id)}>
                      {t("Fă-l administrator")}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="bf-helper">{t("După conectare, telefoanele apar aici cu ultima dată văzută.")}</p>
        )}
      </section>
    )}

    {lastSync && <p className="bf-helper">Ultima actualizare: {new Intl.DateTimeFormat(getLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(lastSync))}</p>}
    {notice && connected && <p className="bf-notice" role="status"><Check size={15} /> {notice}</p>}
    <section className="bf-sync-journal" aria-labelledby="sync-journal-title">
      <div className="bf-sync-journal-heading">
        <div>
          <p className="bf-kicker">{t("ISTORIC DE ACTUALIZĂRI")}</p>
          <h3 id="sync-journal-title">{t("Ce s-a întâmplat la sincronizare")}</h3>
        </div>
        {journal.length > 0 && <button className="bf-link-button" onClick={onClearJournal}>{t("Curăță istoricul")}</button>}
      </div>
      {journal.length ? (
        <div className="bf-sync-journal-list">
          {journal.map((entry) => (
            <article key={entry.id} className={`bf-sync-journal-entry ${entry.status}`}>
              <div className="bf-sync-journal-icon" aria-hidden="true">{entry.status === "resolved" ? <Check size={15} /> : entry.status === "failed" ? <X size={15} /> : <RotateCcw size={15} />}</div>
              <div>
                <strong>{entry.status === "resolved" ? t("Actualizare reunită") : entry.status === "failed" ? t("Actualizare eșuată") : t("Actualizare detectată")}</strong>
                <p>{entry.message}</p>
                <small>{new Intl.DateTimeFormat(getLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))} · {entry.action}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="bf-helper">{t("Nu există actualizări înregistrate pe acest dispozitiv. Când un alt telefon trimite mișcări noi, aici vei vedea ce a fost reunit automat.")}</p>
      )}
    </section>
  </div>;
}
