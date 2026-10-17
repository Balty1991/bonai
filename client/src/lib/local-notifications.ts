/**
 * Alerte locale pentru plicuri, scadențe și ritm.
 * Pe Android: permisiunea sistemului + WorkManager (și Capacitor, dacă plugin-ul răspunde).
 * Pe web/PWA: Notification API + service worker. Nu trimite date pe server.
 */

import {
  allocationStatus,
  expenseBelongsTo,
  formatDate,
  isoDate,
  isoToday,
  isWeeklyPaced,
  pendingDebtsInPlan,
  pendingRecurringInPlan,
  planEndDate,
  planForecast,
  type AppData,
} from "@/lib/finance-data";
import { calendarBudget } from "@/lib/calendar-budget";
import { daysLabel, getLocale, t } from "./i18n";
import { envelopeUntilPayday, monthTitle, weekDayCap, weekTooFast } from "./household-insights";
import { proposePayday } from "./payday";
import { lei } from "@/lib/money-format";
import { isAppLockEnabled } from "@/lib/app-lock";
import { loggingStreak } from "@/lib/logging-habits";
import { partnersLoggedToday, selfLoggedToday } from "@/lib/habit-hold";
import { notifyKindOf, readNotifyPrefs } from "@/lib/notify-prefs";
import { warrantyReminders } from "@/lib/warranties";
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

const addIsoDaysLocal = (iso: string, days: number) => { const date = new Date(`${iso}T12:00:00`); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };

function atLocalHour(daysFromToday: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function buildAlerts(data: AppData): PlannedAlert[] {
  const alerts: PlannedAlert[] = [];
  const today = isoToday();
  let id = 4100;

  // Cifra de mâncare, gratuită, și cu aplicația închisă: WorkManager o ține după ce a fost programată.
  const food = (data.settings.salaryPlan.allocations || []).find((item) => `${item.category || ""} ${item.label}`.toLocaleLowerCase("ro-RO").includes("aliment"));
  if (food) {
    // După 8:30 notificarea pleacă mâine dimineață: suma se socotește pentru ziua aceea, nu pentru azi.
    const morning = atLocalHour(0, 8, 30);
    const tomorrow = morning.getTime() <= Date.now() + 60_000;
    const day = tomorrow ? addIsoDaysLocal(today, 1) : today;
    const week = weekDayCap(data, food, day);
    const until = envelopeUntilPayday(data, food, day);
    const left = week?.todayLeft ?? until?.perDay;
    if (left !== undefined) {
      const at = tomorrow ? atLocalHour(1, 8, 30) : morning;
      alerts.push({
        id: id++,
        title: t("Azi la mâncare"),
        body: left > 0.009 ? t("Azi mai ai {amount} la mâncare.", { amount: money(left) }) : t("Plicul de mâncare e gol pentru azi. Ce cumperi se ia din altă parte."),
        at,
        // Ziua locală, nu cea UTC: la est de Greenwich, 8:30 cade încă în ziua de ieri după UTC.
        tag: `food-day-${day}`,
      });
    }
  }

  // Scadențe în următoarele 3 zile
  const pending = pendingRecurringInPlan(data)
    .filter((item) => item.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  for (const item of pending) {
    const due = new Date(`${item.dueDate}T12:00:00`);
    const todayNoon = new Date(`${today}T12:00:00`);
    const days = Math.round((due.valueOf() - todayNoon.valueOf()) / 86_400_000);
    if (days < 0 || days > 3) continue;
    const when = days === 0 ? atLocalHour(0, 9, 30) : atLocalHour(Math.max(0, days - 1), 18, 0);
    if (when.getTime() <= Date.now() - 60_000) continue;
    alerts.push({
      id: id++,
      title: days === 0 ? t("Scadență azi") : t("Scadență aproape"),
      body: `${item.name || t("Obligație")} · ${money(item.amount)} · ${formatDate(item.dueDate)}`,
      at: when,
      tag: `due-${item.id || item.dueDate}`,
    });
  }

  // Rate la datorii: aviz cu 3 zile înainte și în ziua ratei, ca banii să fie pe card (testare, M4).
  for (const debt of pendingDebtsInPlan(data).filter((item) => item.dueDate >= today).slice(0, 5)) {
    const due = new Date(`${debt.dueDate}T12:00:00`);
    const todayNoon = new Date(`${today}T12:00:00`);
    const days = Math.round((due.valueOf() - todayNoon.valueOf()) / 86_400_000);
    if (days < 0 || days > 3) continue;
    const when = days === 0 ? atLocalHour(0, 9, 0) : atLocalHour(0, 18, 30);
    if (when.getTime() <= Date.now() - 60_000) continue;
    alerts.push({
      id: id++,
      title: days === 0 ? t("Rată azi") : t("Rată în {days} zile", { days }),
      body: `${debt.name} · ${money(debt.amount)} · ${formatDate(debt.dueDate)}`,
      at: when,
      tag: `debt-${debt.id}-${debt.dueDate}`,
    });
  }

  // Plicuri aproape de prag sau depășite
  const plan = data.settings.salaryPlan;
  for (const alloc of plan.allocations || []) {
    const status = allocationStatus(data, alloc);
    if (!status) continue;
    const usage = status.usage;
    const threshold = (alloc.alertThreshold ?? 80) / 100;
    // Factura plătită exact nu e „plic epuizat”; doar plata peste sumă merită o notificare.
    if (status.fixed && status.remaining >= 0) continue;
    if (usage >= 1) {
      alerts.push({
        id: id++,
        title: t("Plic epuizat"),
        body: t("{label}: {spent} din {budget}. Ajustează sau mută bani.", { label: alloc.label, spent: money(status.spent), budget: money(status.budget) }),
        at: atLocalHour(0, 10, 0),
        tag: `env-over-${alloc.id}`,
      });
    } else if (usage >= threshold) {
      alerts.push({
        id: id++,
        title: t("Plic aproape de limită"),
        body: t("{label}: {percent}% folosit · mai ai {remaining}.", { label: alloc.label, percent: Math.round(usage * 100), remaining: money(status.remaining) }),
        at: atLocalHour(0, 10, 15),
        tag: `env-warn-${alloc.id}`,
      });
    }
  }

  // Tranșa săptămânii se duce prea repede: o dată pe zi, seara, pentru plicul cel mai apăsat.
  const fast = weekTooFast(data, today)[0];
  const evening = atLocalHour(0, 19, 0);
  if (fast && evening.getTime() > Date.now()) {
    alerts.push({
      id: id++,
      title: fast.over ? t("Săptămâna e depășită") : t("Săptămâna merge repede"),
      body: fast.over
        ? t("{label}: {spent} din {budget} în S{index}, peste cu {amount}.", { label: fast.label, spent: money(fast.spent), budget: money(fast.budget), index: fast.weekIndex, amount: money(-fast.remaining) })
        : t("{label}: {spent} din {budget}, mai sunt {days}. Azi cel mult {today}, apoi cam {future} pe zi.", { label: fast.label, spent: money(fast.spent), budget: money(fast.budget), days: daysLabel(fast.daysLeft), today: money(fast.todayLeft), future: money(fast.futureShare) }),
      at: evening,
      tag: `week-fast-${fast.allocationId}-${fast.weekIndex}`,
    });
  }

  // Duminică seara: bilanțul săptămânii, de trimis familiei.
  const sunday = (7 - new Date(`${today}T12:00:00`).getDay()) % 7;
  const summaryAt = atLocalHour(sunday, 19, 30);
  if (summaryAt.getTime() > Date.now() && data.transactions.some((item) => item.kind === "expense" && item.date >= addIsoDaysLocal(today, -7))) {
    alerts.push({ id: id++, title: t("Bilanțul săptămânii e gata"), body: t("Vezi cât ați cheltuit și trimite-l familiei."), at: summaryAt, tag: `weekly-summary-${addIsoDaysLocal(today, sunday)}` });
  }

  // Cu 5 zile înainte de salariu, seara: asistentul de sfârșit de lună de pe Astăzi.
  const cycleEnd = planEndDate(data.settings.salaryPlan);
  if (cycleEnd && plan.allocations.length) {
    const lead = Math.round((new Date(`${cycleEnd}T12:00:00`).valueOf() - new Date(`${today}T12:00:00`).valueOf()) / 86_400_000) - 5;
    const monthEndAt = lead >= 0 && lead <= 14 ? atLocalHour(lead, 18, 45) : undefined;
    if (monthEndAt && monthEndAt.getTime() > Date.now()) {
      alerts.push({ id: id++, title: t("Mai sunt 5 zile până la salariu"), body: t("Vezi ce mai e de plătit și unde pot merge banii care rămân."), at: monthEndAt, tag: `month-end-${cycleEnd}` });
    }
  }

  // Ritmul zilnic: dacă proiecția arată că plicurile rămase nu ajung până la salariu
  const forecast = planForecast(data);
  if (forecast.remainingDays > 0 && forecast.spentToDate > 0 && forecast.projectedRemaining < 0) {
    alerts.push({
      id: id++,
      title: t("Ritm peste plan"),
      body: t("Cu ritmul actual, planul ar ieși în minus cu {amount} până la salariu. Sigur pe zi: {safe}.", { amount: money(Math.abs(forecast.projectedRemaining)), safe: money(forecast.safeDaily) }),
      at: atLocalHour(0, 10, 30),
      tag: "pace-over-plan",
    });
  }

  // Tranșă săptămânală: reamintire în dimineața zilei de start (WorkManager pe Android).
  const planEnd = planEndDate(plan);
  const weeklyPacedTotal = (plan.allocations || []).filter((item) => isWeeklyPaced(item, plan)).reduce((sum, item) => sum + item.amount, 0);
  if (plan.periodStart && planEnd && weeklyPacedTotal > 0) {
    const weeks = calendarBudget(weeklyPacedTotal, plan.periodStart, planEnd)?.weeks || [];
    for (const week of weeks) {
      if (week.start < today) continue;
      const start = new Date(`${week.start}T12:00:00`);
      const todayNoon = new Date(`${today}T12:00:00`);
      const days = Math.round((start.valueOf() - todayNoon.valueOf()) / 86_400_000);
      if (days < 0 || days > 7) continue;
      const when = atLocalHour(days, 9, 0);
      if (when.getTime() <= Date.now() - 60_000) continue;
      alerts.push({
        id: id++,
        title: days === 0 ? t("Tranșă nouă azi") : t("Tranșă săptămânală aproape"),
        body: t("S{index}: {amount} pentru {days} zile ({start} – {end}).", {
          index: week.index,
          amount: money(week.amount),
          days: week.days,
          start: formatDate(week.start),
          end: formatDate(week.end),
        }),
        at: when,
        tag: `tranche-${week.start}-${week.index}`,
      });
      break; // o singură tranșă viitoare — nu spamăm tot ciclul
    }
  }

  // Salariu / următorul venit: cu o zi înainte seara și în dimineața zilei tipice.
  const payday = plan.nextPayday || plan.earliestPayday;
  if (payday && payday >= today) {
    const due = new Date(`${payday}T12:00:00`);
    const todayNoon = new Date(`${today}T12:00:00`);
    const days = Math.round((due.valueOf() - todayNoon.valueOf()) / 86_400_000);
    if (days === 1) {
      const when = atLocalHour(0, 18, 30);
      if (when.getTime() > Date.now() - 60_000) {
        alerts.push({
          id: id++,
          title: t("Venit mâine"),
          body: t("Următorul venit este planificat pe {date}. Pregătește repartizarea în Plicuri.", { date: formatDate(payday) }),
          at: when,
          tag: `payday-eve-${payday}`,
        });
      }
    } else if (days === 0) {
      const when = atLocalHour(0, 9, 15);
      if (when.getTime() > Date.now() - 60_000) {
        alerts.push({
          id: id++,
          title: t("Ziua venitului"),
          body: paydayBody(data, payday),
          at: when,
          tag: `payday-day-${payday}`,
        });
      }
    }
  }

  // Obiective de economisire cu termen (dueDate ISO sau text due când e datat)
  for (const goal of data.savings || []) {
    const dueIso = goal.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(goal.dueDate) ? goal.dueDate : undefined;
    if (!dueIso || dueIso < today) continue;
    const due = new Date(`${dueIso}T12:00:00`);
    const todayNoon = new Date(`${today}T12:00:00`);
    const days = Math.round((due.valueOf() - todayNoon.valueOf()) / 86_400_000);
    if (days < 0 || days > 7) continue;
    const remaining = Math.max(0, goal.target - goal.current);
    if (remaining <= 0) continue;
    const when = days === 0 ? atLocalHour(0, 9, 45) : atLocalHour(Math.max(0, days - 1), 18, 15);
    if (when.getTime() <= Date.now() - 60_000) continue;
    alerts.push({
      id: id++,
      title: days === 0 ? t("Termen obiectiv azi") : t("Obiectiv aproape de termen"),
      body: t("{name}: mai ai {remaining} până la {date}.", { name: goal.name, remaining: money(remaining), date: formatDate(dueIso) }),
      at: when,
      tag: `goal-due-${goal.id}-${dueIso}`,
    });
  }

  // Pe 1 ale lunii, la 10: luna trecută într-o imagine (Astăzi o arată în primele 7 zile).
  const nextFirst = `${addIsoDaysLocal(`${today.slice(0, 7)}-28`, 4).slice(0, 7)}-01`;
  const toFirst = Math.round((new Date(`${nextFirst}T12:00:00`).valueOf() - new Date(`${today}T12:00:00`).valueOf()) / 86_400_000);
  if (toFirst >= 1 && toFirst <= 7 && (data.transactions || []).some((item) => item.kind === "expense" && item.date.startsWith(today.slice(0, 7)))) {
    const title = monthTitle(today.slice(0, 7));
    alerts.push({
      id: id++,
      title: t("{month} s-a încheiat", { month: title.charAt(0).toLocaleUpperCase() + title.slice(1) }),
      body: t("Vezi luna într-o imagine și trimite-o familiei."),
      at: atLocalHour(toFirst, 10, 0),
      tag: `month-card-${today.slice(0, 7)}`,
    });
  }

  // Check-in de seară pe telefonul celui care n-a notat. Dacă partenerul a notat, tot îi amintim:
  // altfel cifra zilei rămâne mincinoasă și nimeni nu e întrebat.
  const prefs = readNotifyPrefs();
  if (!selfLoggedToday(data, today)) {
    const others = partnersLoggedToday(data, today);
    const streak = loggingStreak(data.transactions || [], today);
    const when = atLocalHour(0, prefs.eveningHour, 0);
    const title = others.length
      ? t("Tu n-ai notat azi")
      : streak >= 3
        ? t("Nu pierde seria de {days} zile", { days: streak })
        : t("Check-in de seară");
    const body = others.length === 1
      ? t("{name} a notat. Cifra zilei e incompletă până notezi și tu.", { name: others[0] })
      : others.length > 1
        ? t("{names} au notat. Cifra zilei e incompletă până notezi și tu.", { names: others.join(", ") })
        : streak >= 3
          ? t("Notează ce s-a cheltuit azi. Dacă n-a fost nimic, e o zi fără cheltuieli — și asta contează.")
          : t("Nicio cheltuială înregistrată azi. Un minut de ordine e de ajuns.");
    if (when.getTime() > Date.now() - 60_000) {
      alerts.push({ id: id++, title, body, at: when, tag: `checkin-${today}` });
    } else {
      alerts.push({
        id: id++,
        title: t("Check-in de seară"),
        body: t("Dacă ziua trece fără nicio mișcare, îți amintesc seara — fără grabă."),
        at: atLocalHour(1, prefs.eveningHour, 0),
        tag: "checkin-next",
      });
    }
  }

  // Copia de siguranță mai veche de 30 de zile (sau niciuna, după o lună de notat): duminică seara, o dată pe săptămână
  // până se face una. Un telefon pierdut fără copie înseamnă registrul pierdut.
  const backup = readAutoBackup();
  const copies = [backup.lastAt, backup.live && !backup.liveError ? backup.liveAt : undefined].map((value) => (value ? Date.parse(value) : NaN)).filter(Number.isFinite);
  const lastCopy = copies.length ? Math.max(...copies) : NaN;
  const firstDay = (data.transactions || []).reduce((min, item) => (item.date < min ? item.date : min), today);
  const loggingFor = (Date.parse(`${today}T12:00:00`) - Date.parse(`${firstDay}T12:00:00`)) / 86_400_000;
  const copyAge = Number.isFinite(lastCopy) ? (Date.now() - lastCopy) / 86_400_000 : Infinity;
  if (copyAge > 30 && loggingFor >= 30) {
    const sunday = atLocalHour((7 - new Date().getDay()) % 7, 18, 30);
    const at = sunday.getTime() > Date.now() ? sunday : atLocalHour(7, 18, 30);
    alerts.push({
      id: id++,
      title: t("Fă o copie de siguranță"),
      body: Number.isFinite(lastCopy)
        ? t("Ultima copie e de acum {days} zile. Dacă pierzi telefonul, registrul se pierde cu el: Mai mult → Setări → Copii de siguranță.", { days: Math.floor(copyAge) })
        : t("N-ai încă nicio copie a registrului. Dacă pierzi telefonul, se pierde și el: Mai mult → Setări → Copii de siguranță."),
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

  // Ce a oprit omul din Setări nu se programează deloc.
  // Cele mai apropiate întâi: check-inul de seară era pus ultimul și cădea la tăierea listei,
  // așa că amintirea de la 20:00 nu mai venea în zilele cu multe alerte.
  return alerts.filter((alert) => !prefs.off.includes(notifyKindOf(alert.tag))).sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 12);
}

/** Expus pentru teste: aceleași alerte ca programarea locală. */
/**
 * Notificarea din ziua salariului spune deja sumele de luna trecută („Alin 4.270, Angi 2.868,
 * tichete 1.790”), ca „A intrat salariul” să fie doar o verificare și o atingere.
 */
function paydayBody(data: AppData, payday: string) {
  const fallback = t("Astăzi e data tipică a venitului ({date}). Confirmă încasarea când ajung banii.", { date: formatDate(payday) });
  try {
    const incomes = proposePayday(data, payday).incomes.filter((item) => !item.notedId && item.amount > 0).slice(0, 4);
    if (!incomes.length) return fallback;
    const list = incomes.map((item) => `${item.title} ${money(item.amount)}`).join(", ");
    return t("Pe ce a venit luna trecută: {list}. Deschide „A intrat salariul” și confirmi dintr-o atingere.", { list });
  } catch {
    return fallback;
  }
}

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

const FAMILY_ALERT_KEY = "buget-familie:family-envelope-alerts";
const FAMILY_TX_ALERT_KEY = "buget-familie:family-tx-alerts";

const readFamilyAlertLog = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAMILY_ALERT_KEY) || "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
};

const writeFamilyAlertLog = (log: Record<string, string>) => {
  try {
    const entries = Object.entries(log).slice(-60);
    window.localStorage.setItem(FAMILY_ALERT_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* jurnalul de alerte nu trebuie să blocheze datele financiare */
  }
};

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
 * Anunță imediat când o actualizare primită de la un alt telefon împinge un plic
 * peste pragul lui sau când altcineva din familie a adăugat o cheltuială.
 * Nu anunță propriile tale înregistrări — le vezi deja pe ecran.
 */
export async function notifyFamilyEnvelopeChanges(previous: AppData, next: AppData): Promise<void> {
  if (!isNotificationsEnabled()) return;
  const permission = await getNotificationPermission();
  if (permission === "denied" || permission === "unsupported") return;

  const me = next.settings.members.find((member) => member.name === next.settings.memberName);
  const knownIds = new Set(previous.transactions.map((item) => item.id));
  const incoming = next.transactions.filter((item) => !knownIds.has(item.id) && item.kind === "expense" && (!me || item.memberId !== me.id));
  if (!incoming.length) return;

  const day = isoToday();
  const log = readFamilyAlertLog();
  let changed = false;
  let envelopeAlerted = false;

  for (const allocation of next.settings.salaryPlan.allocations || []) {
    const before = previous.settings.salaryPlan.allocations.find((item) => item.id === allocation.id);
    const beforeState = before ? allocationStatus(previous, before).state : "healthy";
    const after = allocationStatus(next, allocation);
    // Doar trecerea în sus contează: „încă sănătos” sau o revenire nu merită o notificare.
    if (after.state === "healthy" || after.state === beforeState) continue;
    if (beforeState === "over") continue;

    const responsible = incoming.filter((item) => expenseBelongsTo(next.settings.salaryPlan, item, allocation));
    if (!responsible.length) continue;

    const key = `${allocation.id}:${after.state}`;
    if (log[key] === day) continue;
    log[key] = day;
    changed = true;
    envelopeAlerted = true;

    const names = Array.from(new Set(responsible.map((item) => item.person).filter(Boolean)));
    const who = names.length === 1 ? names[0] : names.length ? t("{first} și {last}", { first: names.slice(0, -1).join(", "), last: names[names.length - 1] }) : t("Un membru");
    const spent = responsible.reduce((sum, item) => sum + item.amount, 0);
    await showNow(
      after.state === "over" ? t("Plic depășit: {label}", { label: allocation.label }) : t("Plic aproape de limită: {label}", { label: allocation.label }),
      after.state === "over"
        ? t("{who} a înregistrat {spent}. Plicul este la {used} din {budget}.", { who, spent: money(spent), used: money(after.spent), budget: money(after.budget) })
        : t("{who} a înregistrat {spent}. Mai rămân {remaining} din {budget}.", { who, spent: money(spent), remaining: money(after.remaining), budget: money(after.budget) }),
      `family-env-${key}`,
    );
  }

  if (changed) writeFamilyAlertLog(log);

  const txLog = readFamilyTxLog();
  const fresh = incoming.filter((item) => !txLog[item.id]);
  if (!fresh.length) return;
  for (const item of fresh) txLog[item.id] = day;
  writeFamilyTxLog(txLog);

  /* Dacă plicul a fost deja anunțat, rezumatul de cheltuială e redundant. */
  if (envelopeAlerted) return;

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
  if (!isNotificationsEnabled()) return;
  const permission = await getNotificationPermission();
  if (permission === "denied") return;

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
    t("Îți spun pe telefon când e o scadență, un plic aproape de limită sau o cheltuială adăugată de familie."),
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
