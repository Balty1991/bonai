/**
 * Tipuri, tokeni și piese partajate de ecranul Astăzi și de ecranele încărcate la cerere.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { formatDate } from "@/lib/finance-data";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { type SyncJournalEntry } from "@/lib/app-storage";
import { moneyFormat, t } from "@/lib/i18n";
import { lei } from "@/lib/money-format";

export type MainView = "shop" | "products" | "stores" | "house" | "today" | "journal" | "plan" | "obligations" | "goals" | "habits" | "calendar" | "insights" | "utilities";
export type MoreView = "overview" | "review" | "shopping" | "trip" | "year-plan" | "net-worth" | "debt-exit" | "advisor" | "trends" | "invest" | "money-calendar" | "charts" | "prices" | "warranties" | "pocket" | "debts" | "savings" | "events" | "receipts" | "catalog" | "recurring" | "reports" | "assistant" | "learned" | "settings" | "sync" | "guide" | "feedback";
/** Uneltele de analiză din Mai mult se deschid din ecranul Analiză, nu ca cinci intrări separate. */
export const ANALYSIS_TOOLS: MoreView[] = ["advisor", "charts", "trends", "money-calendar", "year-plan"];
/** Aurora și Cyber au fost scoase; cine le avea trece pe Navy, respectiv Întunecat (theme-default). */
export type ThemeId = "white" | "dark" | "navy";
/** „system”: Alb sau Întunecat, după setarea telefonului (implicit pentru cei noi). */
export type ThemeSchedule = "manual" | "auto" | "system";
export type ThemeScheduleTimes = { dayStart: string; eveningStart: string; nightStart: string };
export type BackgroundId = "plain" | "paper" | "grid" | "aurora" | "dots";
export const LIGHT_THEMES: ThemeId[] = ["white"];

// Textele se citesc la afișare (getter), nu la încărcarea modulului: limba se alege după.
export const backgroundOptions: Array<{ id: BackgroundId; name: string; detail: string }> = [
  { id: "plain", get name() { return t("Lumină curată"); }, get detail() { return t("Halo-uri moi, fără grilă"); } },
  { id: "paper", get name() { return t("Hârtie de registru"); }, get detail() { return t("Fibre calde, ca o coală"); } },
  { id: "grid", get name() { return t("Hartă discretă"); }, get detail() { return t("Grilă largă, aproape invizibilă"); } },
  { id: "aurora", get name() { return t("Auroră profundă"); }, get detail() { return t("Trei pete de lumină"); } },
  { id: "dots", get name() { return t("Ceață fină"); }, get detail() { return t("Puncte moi, adâncime"); } },
];
export const themeOptions: Array<{ id: ThemeId; name: string; detail: string; mood: string }> = [
  { id: "white", get name() { return t("Alb"); }, get detail() { return t("Hârtie caldă, ușor de citit ziua. Implicit."); }, get mood() { return t("Zi"); } },
  { id: "dark", get name() { return t("Întunecat"); }, get detail() { return t("Noapte cu accent verde de pădure."); }, get mood() { return t("Noapte"); } },
  { id: "navy", get name() { return t("Bleumarin"); }, get detail() { return t("Bleumarin profund, auriu discret."); }, get mood() { return t("Seară"); } },
];
export const defaultScheduleTimes: ThemeScheduleTimes = { dayStart: "06:00", eveningStart: "17:00", nightStart: "21:00" };
export const timeToMinutes = (value: string, fallback: number) => { const [hours, minutes] = value.split(":").map(Number); return Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : fallback; };
export const currentLocalMinutes = () => { const now = new Date(); return now.getHours() * 60 + now.getMinutes(); };
export const visibleThemeOptions = themeOptions.filter((option) => option.id === "white" || option.id === "dark" || option.id === "navy");
export const automaticTheme = (minutes: number, times: ThemeScheduleTimes): ThemeId => { const dayStart = timeToMinutes(times.dayStart, 360); const eveningStart = timeToMinutes(times.eveningStart, 1020); const nightStart = timeToMinutes(times.nightStart, 1260); if (dayStart < eveningStart && eveningStart < nightStart) return minutes >= dayStart && minutes < eveningStart ? "white" : minutes >= eveningStart && minutes < nightStart ? "navy" : "dark"; return minutes >= 6 * 60 && minutes < 17 * 60 ? "white" : minutes >= 17 * 60 && minutes < 21 * 60 ? "navy" : "dark"; };
/**
 * Formatarea se face la fiecare apel, nu o dată la încărcarea modulului: altfel
 * schimbarea limbii nu s-ar vedea până la reîncărcarea aplicației. `.format()` rămâne
 * aceeași interfață, deci niciun apel existent nu se schimbă.
 */
export const fmt = { format: lei };
export const fmtExact = { format: (value: number) => moneyFormat(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
export const sourceKindName: Record<"card" | "cash" | "meal" | "voucher" | "transfer", string> = { get card() { return t("Card"); }, get cash() { return t("Cash"); }, get meal() { return t("Bonuri de masă"); }, get voucher() { return t("Voucher (SGR, cadou)"); }, get transfer() { return t("Transfer"); } };
export const money = (value: number) => fmt.format(Number.isFinite(value) ? value : 0);
export const dateText = (value: string, full = false) => formatDate(value, full ? { day: "2-digit", month: "long", year: "numeric" } : { day: "2-digit", month: "short" });

export type SyncPanelProps = {
  connected: boolean;
  /** A fost în cameră, nu a ieșit singur, dar acum nu sincronizează. */
  stopped: boolean;
  /** Cheia sesiunii e păstrată pe telefon; conectarea se reia singură. */
  sessionRemembered: boolean;
  /** Codul invitației camerei curente; gol la camerele vechi, cu parolă. */
  invite: string;
  /** Camera e cu invitație, chiar dacă pe web codul nu e păstrat după repornire (S5). */
  inviteRoom?: boolean;
  inviteDraft: string;
  setInviteDraft: (value: string) => void;
  onCreateRoom: () => void;
  onJoinInvite: (raw: string) => void;
  onMoveToInvite: () => void;
  members: import("@/lib/finance-data").FamilyMember[];
  selfMemberId: string;
  /** Telefonul are încă un membru provizoriu („Eu”) și trebuie întrebat cine e. */
  needsSelfChoice: boolean;
  onChooseSelf: (memberId: string) => void;
  onAddSelf: (name: string) => void;
  busy: boolean;
  online: boolean;
  password: string;
  setPassword: (value: string) => void;
  notice: string;
  lastSync: string;
  journal: SyncJournalEntry[];
  devices: import("@/lib/finance-data").SyncDevice[];
  thisDeviceId: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onClearJournal: () => void;
  onRevokeDevice: (deviceId: string) => void;
  onRestoreDevice: (deviceId: string) => void;
  /** Doar administratorul trimite invitații, scoate și reactivează telefoane. */
  isAdmin: boolean;
  adminDeviceId?: string;
  onMakeAdmin: (deviceId: string) => void;
  /** Parolă arătată o dată (ex. din FirstRun familie). */
  passwordRevealOnce?: string;
  clearPasswordReveal?: () => void;
  recoveryRevealOnce?: string;
  clearRecoveryReveal?: () => void;
  recoveryIssued?: boolean;
  onRecoverPassword: (code: string) => void;
  onIssueRecovery: () => void;
  /** Alt telefon a scris deja o mișcare. Până atunci invitația nu pornește abonamentul. */
  otherPhoneLogged?: boolean;
};

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useFocusTrap<HTMLElement>(onClose);
  const closeIfBackdrop = (event: { target: EventTarget | null; currentTarget: EventTarget }) => {
    if (event.target === event.currentTarget) onClose();
  };
  return <div className="bf-modal-backdrop" role="presentation" onPointerDown={closeIfBackdrop}><section ref={dialogRef} tabIndex={-1} className="bf-modal" role="dialog" aria-modal="true" aria-label={title} onPointerDown={(event) => event.stopPropagation()}><header><div><p className="bf-kicker">{t("ÎNREGISTRARE RAPIDĂ")}</p><h2>{title}</h2></div><button type="button" className="bf-icon-button" aria-label={t("Închide")} onClick={onClose}><X size={19} /></button></header>{children}</section></div>;
}

export function DeferBelowFold({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || ready) return;
    if (typeof IntersectionObserver !== "function") { setReady(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setReady(true); observer.disconnect(); }
    }, { rootMargin: "240px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);
  return <div ref={ref}>{ready ? children : <div className="bf-below-fold-slot" aria-hidden="true" />}</div>;
}


export function WhatsNewSheet({ onClose, onOpenTrip, onOpenMore }: { onClose: () => void; onOpenTrip: () => void; onOpenMore: () => void }) {
  const dialogRef = useFocusTrap<HTMLElement>(onClose);
  const closeIfBackdrop = (event: { target: EventTarget | null; currentTarget: EventTarget }) => {
    if (event.target === event.currentTarget) onClose();
  };
  return (
    <div className="bf-modal-backdrop bf-whats-new-backdrop" role="presentation" onPointerDown={closeIfBackdrop}>
      <section ref={dialogRef} tabIndex={-1} className="bf-modal bf-whats-new" role="dialog" aria-modal="true" aria-labelledby="bf-whats-new-title" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="bf-kicker">{t("ACTUALIZARE")}</p>
            <h2 id="bf-whats-new-title">{t("Ce e nou")}</h2>
          </div>
          <button type="button" className="bf-icon-button" aria-label={t("Închide")} onClick={onClose}><X size={19} /></button>
        </header>
        <p>{t("Mai puțin de scris, mai mult de văzut.")}</p>
        <ul className="bf-whats-new-list">
          <li>{t("Grafice: fluxul banilor, categoriile, ritmul lunii și harta anului, cu valori la atingere.")}</li>
          <li>{t("Asistentul răspunde și cu grafice: „cum au evoluat cheltuielile pe alimente?”")}</li>
          <li>{t("Tranziții line între ecrane, vibrație scurtă la notare și, pe Android 12+, culorile telefonului.")}</li>
          <li>{t("Widget nou: Săptămâna banilor, ultimele 7 zile pe ecranul principal.")}</li>
        </ul>
        <div className="bf-whats-new-actions">
          <button type="button" className="bf-primary" onClick={onClose}>{t("Am înțeles")}</button>
          <button type="button" className="bf-secondary" onClick={onOpenTrip}>{t("Deschide graficele")}</button>
          <button type="button" className="bf-link-button" onClick={onOpenMore}>{t("Deschide Mai mult")}</button>
        </div>
      </section>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="bf-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }

export function BudgetBar({ used, total, tone = "green" }: { used: number; total: number; tone?: "green" | "gold" | "coral" }) { const percent = total > 0 ? Math.min(100, Math.max(0, used / total * 100)) : 0; return <div className={`bf-progress ${tone}`} role="img" aria-label={`${Math.round(percent)}% utilizat`}><span style={{ width: `${percent}%` }} /></div>; }
