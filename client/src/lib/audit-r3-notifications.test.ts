/**
 * Activarea alertelor pe Android nu depinde de Notification API (lipsește în WebView)
 * și nu trebuie să rămână oprită după un tap eșuat.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData } from "@/lib/finance-data";

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: "granted" })),
    requestPermissions: vi.fn(async () => { throw new Error("plugin absent"); }),
    schedule: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  },
}));

type Bridge = {
  schedule: ReturnType<typeof vi.fn>;
  cancelAll: ReturnType<typeof vi.fn>;
  hasPermission: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
  notifyNow: ReturnType<typeof vi.fn>;
};

let store: Record<string, string> = {};
let bridge: Bridge;

const stubWindow = (opts?: { native?: boolean; permission?: boolean }) => {
  store = {};
  bridge = {
    schedule: vi.fn(),
    cancelAll: vi.fn(),
    hasPermission: vi.fn(() => Boolean(opts?.permission)),
    requestPermission: vi.fn(),
    notifyNow: vi.fn(),
  };
  const listeners: Record<string, Array<(event: Event) => void>> = {};
  const localStorage = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  };
  const documentStub = {
    documentElement: { classList: { contains: (name: string) => Boolean(opts?.native) && name === "capacitor-android" } },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  Object.assign(globalThis, {
    window: {
      localStorage,
      BugetFamilieReminders: opts?.native === false ? undefined : bridge,
      addEventListener: (type: string, fn: (event: Event) => void) => {
        listeners[type] = [...(listeners[type] || []), fn];
      },
      removeEventListener: (type: string, fn: (event: Event) => void) => {
        listeners[type] = (listeners[type] || []).filter((item) => item !== fn);
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
      dispatchEvent: (event: Event) => {
        (listeners[event.type] || []).forEach((fn) => fn(event));
        return true;
      },
    },
    document: documentStub,
  });
  return {
    fireGranted: () => {
      const event = { type: "buget-familie:notify-permission", detail: { granted: true } } as unknown as Event;
      (listeners["buget-familie:notify-permission"] || []).forEach((fn) => fn(event));
    },
  };
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
  vi.useRealTimers();
});
import { LocalNotifications } from "@capacitor/local-notifications";


const rateData = (paid: boolean) => {
  const data = createEmptyAppData();
  // Rata de mâine (15 septembrie): avizul pleacă azi la 18:30; bifată, nu mai pleacă.
  data.debts = [{ id: "d1", name: "eMAG telefon", creditor: "eMAG", remaining: 100, monthly: 50, dueDay: 15, due: "", tone: "coral", ...(paid ? { lastPaid: "2026-09-14" } : {}) }];
  return data;
};

describe("N: reamintiri pe Android", () => {
  it("N1: o reamintire e programată pe un singur canal (nu WorkManager + Capacitor)", async () => {
    stubWindow({ native: true, permission: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T08:00:00"));
    const { scheduleFinancialReminders, setNotificationsEnabled } = await import("@/lib/local-notifications");
    setNotificationsEnabled(true);
    await scheduleFinancialReminders(rateData(false));
    const viaWorkManager = bridge.schedule.mock.calls.length > 0;
    const viaCapacitor = (LocalNotifications.schedule as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0;
    expect(viaWorkManager && viaCapacitor).toBe(false); // primit: true => aceeași alertă apare de două ori
  });

  it("N2: avizul unei rate se anulează când rata e bifată ca plătită", async () => {
    stubWindow({ native: true, permission: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T08:00:00"));
    const { scheduleFinancialReminders, setNotificationsEnabled } = await import("@/lib/local-notifications");
    setNotificationsEnabled(true);
    await scheduleFinancialReminders(rateData(false));
    const first = JSON.parse(String(bridge.schedule.mock.calls[0][0])) as Array<{ tag: string }>;
    expect(first.some((item) => item.tag.startsWith("debt-d1"))).toBe(true);
    await scheduleFinancialReminders(rateData(true));
    const later = JSON.parse(String(bridge.schedule.mock.calls.at(-1)![0])) as Array<{ tag: string }>;
    expect(bridge.cancelAll).toHaveBeenCalled();
    expect(later.some((item) => item.tag.startsWith("debt-d1"))).toBe(false);
  });
});
