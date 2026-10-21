/**
 * Alerte locale BonAI: scadențe (abonamente, facturi, rate, dobânzi), copia de siguranță,
 * garanții, „Unde e mai ieftin” și cheltuielile noi din familie.
 * Pe Android: permisiunea sistemului + WorkManager (și Capacitor, dacă plugin-ul răspunde).
 * Pe web/PWA: Notification API + service worker. Nu trimite date pe server.
 */

import { formatDate, isoDate, isoToday, type AppData } from "@/lib/finance-data";
import { getLocale, t } from "./i18n";
import { lei } from "@/lib/money-format";
import { isAppLockEnabled } from "@/lib/app-lock";
import { notifyKindOf, readNotifyPrefs } from "@/lib/notify-prefs";
import { warrantyReminders } from "@/lib/warranties";
import { savingsOpportunity } from "@/lib/shop-insights";
import { debtNextDue, isBankCost, isOpenCost, paidThisCycle } from "@/lib/debts-tracker";
import { nextDue } from "./house-costs";
const daysBetweenIso = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
import { readAutoBackup } from "@/lib/auto-backup";

/** Cu PIN pe aplicație, notificarea spune doar ce s-a întâmplat, fără sume sau nume. */
const lockSafeBody = (body: string) => isAppLockEnabled() ? t("Deschide aplicația ca să vezi detaliile.") : body;

const PREF_KEY = "buget-familie:notifications-enabled";
const ARMED_KEY = "buget-familie:notifications-armed";
const LAST_SCHEDULE_KEY = "buget-familie:notifications-last-schedule";

export type NotificationPref = "unknown" | "granted" | "denied" | "unsupported";

type NativeReminderBridge = {
  schedule?: (payload: string) => void;
  cancelAll?: () => void;
  hasPermission?: () => boolean;
  requestPermission?: () => void;
  notifyNow?: (title: string, body: string) => void;
};

function nativeReminders(): NativeReminderBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BugetFamilieReminders?: NativeReminderBridge }).BugetFamilieReminders;
}

const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

/** addJavascriptInterface poate întârzia un tick față de first paint. */
async function waitForNativeBridge(): Promise<NativeReminderBridge | undefined> {
  for (let i = 0; i < 12; i += 1) {
    const bridge = nativeReminders();
    if (bridge && (typeof bridge.requestPermission === "function" || typeof bridge.hasPermission === "function")) return bridge;
    await sleep(80);
  }
  return nativeReminders();
}

/**
 * WebView-ul Android nu expune Notification API. Semnalul adevărat pe telefon:
 * puntea Java (`BugetFamilieReminders`), clasa `capacitor-android`, sau Capacitor.
 */
export function isNativeNotifications(): boolean {
  if (typeof window === "undefined") return false;
  if (nativeReminders()) return true;
  try {
    if (document.documentElement?.classList?.contains("capacitor-android")) return true;
  } catch {
    /* ignore */
  }
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.() || cap?.getPlatform?.() === "android");
}

const isNative = isNativeNotifications;

export function isNotificationsEnabled(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setNotificationsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(PREF_KEY, enabled ? "true" : "false");
    if (!enabled) window.localStorage.removeItem(ARMED_KEY);
  } catch {
    /* ignore */
  }
}

export function isNotificationsArmed(): boolean {
  try {
    return window.localStorage.getItem(ARMED_KEY) === "true";
  } catch {
    return false;
  }
}

function setNotificationsArmed(armed: boolean) {
  try {
    if (armed) window.localStorage.setItem(ARMED_KEY, "true");
    else window.localStorage.removeItem(ARMED_KEY);
  } catch {
    /* ignore */
  }
}

/*
 * Pluginul Capacitor e un Proxy care răspunde la orice nume, și la „then”: întors direct dintr-o
 * promisiune, JS îl lua drept promisiune, chema LocalNotifications.then() (neimplementat pe Android),
 * iar apelul rămânea agățat și raporta eroarea (Sentry #89). Îl întoarcem într-o cutie.
 */
const loadNativeNotifications = () => import("@capacitor/local-notifications").then((module) => ({ plugin: module.LocalNotifications }));

const nativePermissionFromBridge = (): NotificationPref | undefined => {
  const bridge = nativeReminders();
  if (!bridge) return undefined;
  if (typeof bridge.hasPermission === "function") return bridge.hasPermission() ? "granted" : "unknown";
  return "unknown";
};

function readWebPermission(): NotificationPref {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "unknown";
}

async function readPermissionsApi(): Promise<NotificationPref | undefined> {
  try {
    const permissions = navigator.permissions;
    if (!permissions?.query) return undefined;
    const status = await permissions.query({ name: "notifications" as PermissionName });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "unknown";
  } catch {
    return undefined;
  }
}

export async function getNotificationPermission(): Promise<NotificationPref> {
  if (isNative()) {
    try {
      const { plugin } = await loadNativeNotifications();
      const status = await plugin.checkPermissions();
      if (status.display === "granted") return "granted";
      if (status.display === "denied") {
        const viaBridge = nativePermissionFromBridge();
        return viaBridge === "granted" ? "granted" : "denied";
      }
    } catch {
      /* pluginul Capacitor lipsește sau nu e înregistrat — puntea nativă */
    }
    const viaBridge = nativePermissionFromBridge();
    if (viaBridge === "granted") return "granted";
    return viaBridge ?? "unknown";
  }
  const fromApi = readWebPermission();
  if (fromApi === "granted" || fromApi === "denied" || fromApi === "unsupported") return fromApi;
  const queried = await readPermissionsApi();
  return queried ?? fromApi;
}

function waitForNativePermission(bridge: NativeReminderBridge): Promise<"granted" | "denied" | "unknown"> {
  return new Promise((resolve) => {
    if (bridge.hasPermission?.()) {
      resolve("granted");
      return;
    }
    let settled = false;
    let poll = 0;
    let sawExplicitDeny = false;
    const finish = (status: "granted" | "denied" | "unknown") => {
      if (settled) return;
      settled = true;
      try { window.clearInterval(poll); } catch { /* ignore */ }
      window.removeEventListener("buget-familie:notify-permission", onEvent);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      resolve(status);
    };
    const read = (): "granted" | "denied" | "unknown" => {
      if (bridge.hasPermission?.()) return "granted";
      if (sawExplicitDeny) return "denied";
      return "unknown";
    };
    const onEvent = (event: Event) => {
      const granted = (event as CustomEvent<{ granted?: boolean }>).detail?.granted;
      if (granted === true || bridge.hasPermission?.()) {
        finish("granted");
        return;
      }
      if (granted === false) {
        sawExplicitDeny = true;
        window.setTimeout(() => finish(read()), 300);
      }
    };
    const onResume = () => {
      window.setTimeout(() => {
        const status = read();
        if (status !== "unknown") finish(status);
      }, 200);
    };
    window.addEventListener("buget-familie:notify-permission", onEvent);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    try {
      bridge.requestPermission?.();
    } catch {
      finish("unknown");
      return;
    }
    try {
      poll = window.setInterval(() => {
        if (bridge.hasPermission?.()) finish("granted");
      }, 400);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => finish(read()), 8_000);
  });
}

/**
 * Chrome/Huawei: dialogul e un overlay (fără visibilitychange), promise-ul poate
 * să nu se rezolve niciodată, iar `Notification.permission` rămâne `"default"`
 * după Permite. Nu combinăm callback + promise (blochează unii fork-uri) și
 * nu așteptăm 25s pe un buton înghețat.
 */
async function requestWebNotificationPermission(): Promise<NotificationPref> {
  const current = readWebPermission();
  if (current === "granted" || current === "denied" || current === "unsupported") return current;

  const fromDialog = await new Promise<string>((resolve) => {
    let settled = false;
    const finish = (value?: string) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
      resolve(value || Notification.permission || "default");
    };
    const onResume = () => {
      window.setTimeout(() => {
        if (Notification.permission === "granted" || Notification.permission === "denied") {
          finish(Notification.permission);
        }
      }, 200);
    };
    try {
      const returned: unknown = Notification.requestPermission();
      if (returned && typeof (returned as Promise<string>).then === "function") {
        void (returned as Promise<string>).then(
          (permission) => finish(permission),
          () => finish(Notification.permission),
        );
      } else {
        Notification.requestPermission((permission) => finish(permission));
      }
    } catch {
      try {
        Notification.requestPermission((permission) => finish(permission));
      } catch {
        finish(Notification.permission);
      }
    }
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    const started = Date.now();
    const poll = () => {
      if (settled) return;
      if (Notification.permission === "granted" || Notification.permission === "denied") {
        finish(Notification.permission);
        return;
      }
      if (Date.now() - started > 4_000) {
        finish(Notification.permission);
        return;
      }
      window.setTimeout(poll, 200);
    };
    window.setTimeout(poll, 150);
  });

  if (fromDialog === "granted" || Notification.permission === "granted") return "granted";
  if (fromDialog === "denied" || Notification.permission === "denied") return "denied";
  const queried = await readPermissionsApi();
  if (queried === "granted" || queried === "denied") return queried;
  return "unknown";
}

export async function requestNotificationPermission(): Promise<NotificationPref> {
  if (isNative()) {
    const bridge = await waitForNativeBridge();
    if (bridge?.hasPermission?.()) return "granted";
    if (bridge?.requestPermission) {
      const status = await waitForNativePermission(bridge);
      if (status === "granted") return "granted";
      if (status === "denied") return "denied";
      return bridge.hasPermission?.() ? "granted" : "unknown";
    }
    try {
      const { plugin } = await loadNativeNotifications();
      const current = await plugin.checkPermissions();
      const status = current.display === "granted" ? current : await plugin.requestPermissions();
      if (status.display === "granted") return "granted";
      if (status.display === "denied") return "denied";
    } catch {
      /* pluginul Capacitor e opțional */
    }
    return "unknown";
  }
  return requestWebNotificationPermission();
}

type PlannedAlert = {
  id: number;
  title: string;
  body: string;
  at: Date;
  tag: string;
};

const money = lei;


function atLocalHour(daysFromToday: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, minute, 0, 0);
  return date;
}

/**
 * Alertele BonAI, toate calculate pe telefon:
 * - abonamente și facturi cu amintire aleasă (N zile înainte, la 9:00);
 * - rate, credite, dobânzi și comisioane din Datorii: cu 3 zile înainte și în ziua plății, dacă nu e bifată;
 * - copia de siguranță mai veche de 30 de zile;
 * - garanții: ultima zi de retur și garanția care expiră;
 * - „Unde e mai ieftin”, sâmbătă dimineața.
 */
function buildAlerts(data: AppData): PlannedAlert[] {
  const alerts: PlannedAlert[] = [];
  const today = isoToday();
  const prefs = readNotifyPrefs();
  let id = 4100;

  for (const item of data.recurring) {
    if (item.active === false || !item.remindDays) continue;
    const due = nextDue(item, today);
    const ahead = daysBetweenIso(today, due) - item.remindDays;
    if (ahead < 0 || ahead > 30) continue;
    const at = atLocalHour(ahead, 9, 0);
    if (at.getTime() <= Date.now()) continue;
    alerts.push({ id: id++, title: t("Scadență: {name}", { name: item.name }), body: item.amount > 0 ? t("{amount}, pe {date}.", { amount: money(item.amount), date: due.split("-").reverse().join(".") }) : t("Pe {date}.", { date: due.split("-").reverse().join(".") }), at, tag: `cost-${item.id}-${due}` });
  }

  // Rate și costuri bancare: seara cu 1–3 zile înainte și dimineața zilei, ca banii să fie pe card.
  for (const debt of data.debts || []) {
    if (!(debt.monthly > 0) || !(debt.remaining > 0 || isOpenCost(debt)) || paidThisCycle(debt, today, data)) continue;
    const due = debtNextDue(debt, today);
    const days = daysBetweenIso(today, due);
    if (days < 0 || days > 3) continue;
    const when = days === 0 ? atLocalHour(0, 9, 0) : atLocalHour(0, 18, 30);
    if (when.getTime() <= Date.now() - 60_000) continue;
    const amount = isOpenCost(debt) ? debt.monthly : Math.min(debt.monthly, debt.remaining);
    const bank = isBankCost(debt);
    alerts.push({
      id: id++,
      title: days === 0 ? (bank ? t("Comision / dobândă azi") : t("Rată azi")) : t("Rată în {days} zile", { days }),
      body: `${debt.creditor || debt.name} · ${money(amount)} · ${formatDate(due)}`,
      at: when,
      tag: `debt-${debt.id}-${due}`,
    });
  }

  // Copia de siguranță mai veche de 30 de zile (sau niciuna, după o lună de bonuri): duminică seara,
  // o dată pe săptămână până se face una. Un telefon pierdut fără copie înseamnă bonurile pierdute.
  const backup = readAutoBackup();
  const copies = [backup.lastAt, backup.live && !backup.liveError ? backup.liveAt : undefined].map((value) => (value ? Date.parse(value) : NaN)).filter(Number.isFinite);
  const lastCopy = copies.length ? Math.max(...copies) : NaN;
  const firstDay = [...(data.receipts || []), ...(data.transactions || [])].reduce((min, item) => (item.date < min ? item.date : min), today);
  const usingFor = (Date.parse(`${today}T12:00:00`) - Date.parse(`${firstDay}T12:00:00`)) / 86_400_000;
  const copyAge = Number.isFinite(lastCopy) ? (Date.now() - lastCopy) / 86_400_000 : Infinity;
  if (copyAge > 30 && usingFor >= 30) {
    const sunday = atLocalHour((7 - new Date().getDay()) % 7, 18, 30);
    const at = sunday.getTime() > Date.now() ? sunday : atLocalHour(7, 18, 30);
    alerts.push({
      id: id++,
      title: t("Fă o copie de siguranță"),
      body: Number.isFinite(lastCopy)
        ? t("Ultima copie e de acum {days} zile. Dacă pierzi telefonul, bonurile se pierd cu el: Cont → Export și copii de siguranță.", { days: Math.floor(copyAge) })
        : t("N-ai încă nicio copie. Dacă pierzi telefonul, bonurile se pierd cu el: Cont → Export și copii de siguranță."),
      at,
      tag: `backup-old-${isoDate(at)}`,
    });
  }

  // Garanții: ultima zi de retur (seara dinainte, 18:30) și garanția care expiră peste 30 de zile (10:00).
  for (const reminder of warrantyReminders(data, today)) {
    const offset = Math.round((Date.parse(`${reminder.day}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000);
    const lastDay = reminder.kind === "return" && reminder.day === reminder.target;
    const at = reminder.kind === "return" ? atLocalHour(offset, lastDay ? 9 : 18, lastDay ? 0 : 30) : atLocalHour(offset, 10, 0);
    if (at.getTime() <= Date.now() - 60_000) continue;
    alerts.push({
      id: id++,
      title: reminder.kind === "return" ? (lastDay ? t("Azi e ultima zi de retur") : t("Mâine e ultima zi de retur")) : t("Garanția expiră în 30 de zile"),
      body: reminder.kind === "return"
        ? t("{name}: dacă nu-l păstrezi, returnează-l până pe {date}.", { name: reminder.name, date: formatDate(reminder.target) })
        : t("{name}: garanția ține până pe {date}. Dacă ceva nu merge, du-l acum la service, cu bonul.", { name: reminder.name, date: formatDate(reminder.target) }),
      at,
      tag: `warranty-${reminder.kind}-${reminder.id}`,
    });
  }

  // Prețuri: sâmbătă la 10:00, înainte de cumpărăturile mari, produsul tău cu cea mai mare diferență
  // de preț între magazine din ultima lună. Doar din bonurile tale; fără diferență, nicio notificare.
  const best = savingsOpportunity(data, today, 30).items[0];
  if (best && best.saved >= 2) {
    const toSaturday = (6 - new Date().getDay() + 7) % 7;
    let at = atLocalHour(toSaturday, 10, 0);
    if (at.getTime() <= Date.now()) at = atLocalHour(toSaturday + 7, 10, 0);
    alerts.push({
      id: id++,
      title: t("{label} e mai ieftin la {vendor}", { label: best.label, vendor: best.cheaperVendor }),
      body: t("Din bonurile tale: luna asta l-ai luat de la {was} și puteai da cu {amount} mai puțin.", { was: best.vendor, amount: money(best.saved) }),
      at,
      tag: `price-week-${isoDate(at)}`,
    });
  }

  // Ce a oprit omul din Setări nu se programează; cele mai apropiate întâi.
  return alerts.filter((alert) => !prefs.off.includes(notifyKindOf(alert.tag))).sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 12);
}

/** Expus pentru teste: aceleași alerte ca programarea locală. */
export function buildLocalAlerts(data: AppData) {
  return buildAlerts(data).map((item) => ({ id: item.id, title: item.title, body: item.body, tag: item.tag, at: item.at.toISOString() }));
}

/** Culoarea siluetei din bara de stare (aceeași cu R.color.colorPrimary din ReminderWorker). */
const NOTIFY_ICON_COLOR = "#1B4F42";

async function tryCapacitorSchedule(alerts: PlannedAlert[]): Promise<boolean> {
  try {
    if (!isNative()) return false;
    const { plugin: LocalNotifications } = await loadNativeNotifications();
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return false;
    // Tot ce era programat înainte pleacă: o alertă care nu mai e în listă nu mai e adevărată.
    const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] as Array<{ id: number }> }));
    const stale = [...pending.notifications.map((item) => ({ id: item.id })), ...alerts.map((a) => ({ id: a.id }))];
    if (stale.length) await LocalNotifications.cancel({ notifications: stale }).catch(() => undefined);
    if (!alerts.length) return true;
    await LocalNotifications.schedule({
      notifications: alerts.map((alert) => ({
        id: alert.id,
        title: alert.title,
        body: alert.body,
        schedule: { at: alert.at, allowWhileIdle: true },
        // Inexact: fără el, pe Android 14 fiecare programare deschidea setarea „Alarme și mementouri”.
        isExactNotification: false,
        smallIcon: "ic_stat_notify",
        iconColor: NOTIFY_ICON_COLOR,
        extra: { tag: alert.tag },
      })),
    });
    return true;
  } catch {
    return false;
  }
}

async function scheduleWeb(alerts: PlannedAlert[]) {
  const permission = await getNotificationPermission();
  if (permission !== "granted" && readWebPermission() !== "granted") return;
  const now = Date.now();
  for (const alert of alerts) {
    const delta = alert.at.getTime() - now;
    if (delta < -5 * 60_000 || delta > 14 * 60 * 60_000) continue;
    try {
      window.setTimeout(() => {
        // Chrome îngheață cronometrele filelor din fundal: „Check-in de seară” sosea la 1:07 noaptea.
        // Mai târziu de jumătate de oră față de ora ei, reamintirea nu mai are rost.
        if (Date.now() - alert.at.getTime() > 30 * 60_000) return;
        void showNow(alert.title, alert.body, alert.tag);
      }, Math.max(0, delta));
    } catch {
      /* ignore */
    }
  }
}

const FAMILY_TX_ALERT_KEY = "buget-familie:family-tx-alerts";

const readFamilyTxLog = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAMILY_TX_ALERT_KEY) || "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
};

const writeFamilyTxLog = (log: Record<string, string>) => {
  try {
    const entries = Object.entries(log).slice(-80);
    window.localStorage.setItem(FAMILY_TX_ALERT_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
};

function notificationAssetUrl(file: string): string {
  const base = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : "/";
  const path = `${base}icons/${file}`.replace(/\/{2,}/g, "/");
  try {
    const origin = typeof window !== "undefined" ? window.location?.origin : "";
    if (origin) return new URL(path, origin).href;
  } catch {
    /* ignore */
  }
  return path;
}

async function showViaServiceWorker(title: string, body: string, tag: string): Promise<boolean> {
  try {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker) return false;
    const registration = (await serviceWorker.getRegistration()) || (await serviceWorker.ready.catch(() => undefined));
    if (!registration?.showNotification) return false;
    await registration.showNotification(title, {
      body,
      tag,
      icon: notificationAssetUrl("icon-192.png"),
      badge: notificationAssetUrl("notify-badge.png"),
      lang: getLocale(),
    });
    return true;
  } catch {
    return false;
  }
}

async function showNow(title: string, rawBody: string, tag: string) {
  const body = lockSafeBody(rawBody);
  const bridge = nativeReminders();
  if (bridge?.notifyNow) {
    try {
      bridge.notifyNow(title, body);
      return;
    } catch {
      /* cădem pe Capacitor / Notification API */
    }
  }
  if (isNative()) {
    try {
      const { plugin: LocalNotifications } = await loadNativeNotifications();
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") return;
      await LocalNotifications.schedule({ notifications: [{ id: Math.floor(Math.random() * 100000) + 5000, title, body, isExactNotification: false, smallIcon: "ic_stat_notify", iconColor: NOTIFY_ICON_COLOR, extra: { tag } }] });
      return;
    } catch {
      /* cădem pe Notification API */
    }
  }
  if (await showViaServiceWorker(title, body, tag)) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      tag,
      icon: notificationAssetUrl("icon-192.png"),
      badge: notificationAssetUrl("notify-badge.png"),
    });
  } catch {
    /* ignore */
  }
}

/**
 * Anunță imediat când altcineva din familie a adăugat o cheltuială (bon sau notată), după
 * sincronizare. Nu anunță propriile tale înregistrări — le vezi deja pe ecran.
 */
export async function notifyFamilyExpenses(previous: AppData, next: AppData): Promise<void> {
  if (!isNotificationsEnabled()) return;
  const permission = await getNotificationPermission();
  if (permission === "denied" || permission === "unsupported") return;

  const me = next.settings.members.find((member) => member.name === next.settings.memberName);
  const knownIds = new Set(previous.transactions.map((item) => item.id));
  const incoming = next.transactions.filter((item) => !knownIds.has(item.id) && item.kind === "expense" && (!me || item.memberId !== me.id));
  if (!incoming.length) return;

  const day = isoToday();
  const txLog = readFamilyTxLog();
  const fresh = incoming.filter((item) => !txLog[item.id]);
  if (!fresh.length) return;
  for (const item of fresh) txLog[item.id] = day;
  writeFamilyTxLog(txLog);

  const names = Array.from(new Set(fresh.map((item) => item.person).filter(Boolean)));
  const who = names.length === 1 ? names[0] : names.length ? t("{first} și {last}", { first: names.slice(0, -1).join(", "), last: names[names.length - 1] }) : t("Un membru");
  const spent = fresh.reduce((sum, item) => sum + item.amount, 0);
  const firstTitle = fresh[0]?.title?.trim();
  if (fresh.length === 1) {
    await showNow(
      t("Cheltuială nouă în familie"),
      firstTitle
        ? t("{who} a înregistrat {spent} · {title}.", { who, spent: money(spent), title: firstTitle })
        : t("{who} a înregistrat {spent}.", { who, spent: money(spent) }),
      `family-tx-${fresh[0].id}`,
    );
    return;
  }
  await showNow(
    t("Cheltuieli noi în familie"),
    t("{who} a înregistrat {count} cheltuieli · {spent}.", { who, count: fresh.length, spent: money(spent) }),
    `family-tx-batch-${day}-${fresh[0].id}`,
  );
}

function scheduleWorkManager(alerts: PlannedAlert[]): boolean {
  if (!isNative()) return false;
  try {
    const bridge = nativeReminders();
    if (!bridge?.schedule) return false;
    // Și din JS, pentru versiunile native mai vechi: întâi pleacă tot, apoi lista de acum.
    bridge.cancelAll?.();
    const payload = JSON.stringify(
      alerts.slice(0, 12).map((alert) => ({
        id: alert.id,
        title: alert.title,
        body: alert.body,
        tag: alert.tag,
        at: alert.at.getTime(),
      })),
    );
    bridge.schedule(payload);
    return true;
  } catch {
    return false;
  }
}

export async function scheduleFinancialReminders(data: AppData): Promise<void> {
  // Oprite sau fără permisiune: lista salvată de o versiune veche (cu plicuri) nu mai rămâne pe telefon.
  if (!isNotificationsEnabled()) { try { nativeReminders()?.cancelAll?.(); } catch { /* fără punte nativă */ } return; }
  const permission = await getNotificationPermission();
  if (permission === "denied") { try { nativeReminders()?.cancelAll?.(); } catch { /* fără punte nativă */ } return; }

  const alerts = buildAlerts(data).map((alert) => ({ ...alert, body: lockSafeBody(alert.body) }));

  if (isNative()) {
    // Un singur canal: cu puntea nativă (WorkManager) nu mai programăm și prin Capacitor,
    // altfel fiecare reamintire apărea de două ori. Lista se trimite și goală, ca să anuleze.
    if (!scheduleWorkManager(alerts) && permission === "granted") await tryCapacitorSchedule(alerts);
  } else if (alerts.length) {
    await scheduleWeb(alerts);
  }

  try {
    window.localStorage.setItem(LAST_SCHEDULE_KEY, isoToday());
  } catch {
    /* ignore */
  }
}

async function pingAlertsOn() {
  await showNow(
    t("Reamintiri active"),
    t("Îți spun pe telefon când vine o rată, un abonament sau o factură, când expiră o garanție și unde e mai ieftin."),
    "alerts-on",
  );
}

/** Activează: cere permisiunea sistemului, programează, trimite o notificare de confirmare. */
export async function enableLocalAlerts(data: AppData): Promise<NotificationPref> {
  const status = await requestNotificationPermission();
  if (status === "denied") {
    setNotificationsEnabled(false);
    setNotificationsArmed(false);
    return status;
  }
  if (status === "unsupported") {
    return status;
  }

  setNotificationsEnabled(true);
  setNotificationsArmed(true);
  await scheduleFinancialReminders(data);
  await pingAlertsOn();
  if (status === "granted") return "granted";
  const again = await getNotificationPermission();
  if (again === "granted") return "granted";
  if (again === "denied") {
    setNotificationsEnabled(false);
    setNotificationsArmed(false);
    return "denied";
  }
  return "unknown";
}

export async function sendTestAlert(): Promise<boolean> {
  if (!isNotificationsEnabled()) return false;
  await showNow(
    t("Notificare de test"),
    t("Dacă vezi asta, alertele ajung pe telefon."),
    "alerts-test",
  );
  return true;
}

/** Oprește preferința locală și anulează job-urile WorkManager / Capacitor. */
export function disableLocalAlerts(): void {
  setNotificationsEnabled(false);
  setNotificationsArmed(false);
  try {
    nativeReminders()?.cancelAll?.();
  } catch {
    /* ignore */
  }
  if (!isNative()) return;
  void loadNativeNotifications()
    .then(({ plugin }) => plugin.cancel({ notifications: [{ id: 4090 }] }))
    .catch(() => undefined);
}

export type ReminderHealth = { ignoringBatteryOptimizations: boolean; manufacturer: string; lastFiredAt: number; missed: number[] };
type HealthPlugin = { reminderHealth: () => Promise<ReminderHealth>; openBatterySettings: () => Promise<{ opened: string }> };

/** Pe telefon: dacă reamintirile ajung la timp sau telefonul oprește aplicația în fundal. */
export async function reminderHealth(): Promise<ReminderHealth | undefined> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return undefined;
    const result = await registerPlugin<HealthPlugin>("BugetFamilieNative").reminderHealth();
    return { ...result, missed: Array.isArray(result.missed) ? result.missed.map(Number).filter((value) => value > 0) : [] };
  } catch {
    return undefined;
  }
}

/** Deschide setarea „Pornire automată / Baterie” a producătorului, ca reamintirile să sune la oră. */
export async function openBatterySettings(): Promise<boolean> {
  try {
    const { registerPlugin } = await import("@capacitor/core");
    await registerPlugin<HealthPlugin>("BugetFamilieNative").openBatterySettings();
    return true;
  } catch {
    return false;
  }
}
