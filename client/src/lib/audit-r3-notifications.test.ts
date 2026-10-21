/**
 * Activarea alertelor pe Android nu depinde de Notification API (lipsește în WebView)
 * și nu trebuie să rămână oprită după un tap eșuat.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData, type Transaction } from "@/lib/finance-data";

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

// Alertele bugetului vechi (plicuri, mâncare, salariu, seara) mai există doar în arhivă: testele le pornesc explicit.
vi.mock("./app-mode", async (original) => ({ ...(await original<typeof import("./app-mode")>()), legacyBudgetOn: () => true }));

const overData = (spent: number) => {
  const data = createEmptyAppData();
  data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-01", nextPayday: "2026-09-30", allocations: [{ id: "alloc-1", label: "Alimente", category: "Alimente", amount: 100, alertThreshold: 80 }] };
  data.transactions = spent ? [{ id: "t1", title: "Lidl", amount: spent, kind: "expense", category: "Alimente", source: "Card debit", sourceId: "source-debit", date: "2026-09-14", allocationId: "alloc-1" } as Transaction] : [];
  return data;
};

describe("N: reamintiri pe Android", () => {
  it("N1: o reamintire e programată pe un singur canal (nu WorkManager + Capacitor)", async () => {
    stubWindow({ native: true, permission: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T08:00:00"));
    const { scheduleFinancialReminders, setNotificationsEnabled } = await import("@/lib/local-notifications");
    setNotificationsEnabled(true);
    await scheduleFinancialReminders(overData(150));
    const viaWorkManager = bridge.schedule.mock.calls.length > 0;
    const viaCapacitor = (LocalNotifications.schedule as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0;
    expect(viaWorkManager && viaCapacitor).toBe(false); // primit: true => aceeași alertă apare de două ori
  });

  it("N2: alerta „plic depășit” programată se anulează când plicul nu mai e depășit", async () => {
    stubWindow({ native: true, permission: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T08:00:00"));
    const { scheduleFinancialReminders, setNotificationsEnabled } = await import("@/lib/local-notifications");
    setNotificationsEnabled(true);
    await scheduleFinancialReminders(overData(150));
    const first = JSON.parse(String(bridge.schedule.mock.calls[0][0])) as Array<{ tag: string }>;
    expect(first.some((item) => item.tag.startsWith("env-over"))).toBe(true);
    // Cheltuiala greșită e ștearsă: plicul nu mai e depășit.
    await scheduleFinancialReminders(overData(0));
    const later = bridge.schedule.mock.calls.slice(1).map((call) => JSON.parse(String(call[0])) as Array<{ tag: string }>);
    const stillPlanned = !bridge.cancelAll.mock.calls.length && !later.some((payload) => payload.some((item) => item.tag.startsWith("env-over")));
    expect(stillPlanned).toBe(false); // (reprogramarea cu același tag ar fi înlocuit jobul; altfel doar cancelAll îl scoate) primit: true => jobul WorkManager „env-over-alloc-1” rămâne și sună
  });
});
