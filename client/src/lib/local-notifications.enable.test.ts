/**
 * Activarea alertelor pe Android nu depinde de Notification API (lipsește în WebView)
 * și nu trebuie să rămână oprită după un tap eșuat.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData } from "./finance-data";


vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => { throw new Error("plugin absent"); }),
    requestPermissions: vi.fn(async () => { throw new Error("plugin absent"); }),
    schedule: vi.fn(),
    cancel: vi.fn(),
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

describe("activarea reamintirilor pe Android", () => {
  it("vede telefonul după puntea nativă, nu după Notification API", async () => {
    stubWindow({ native: true, permission: false });
    const { isNativeNotifications, getNotificationPermission } = await import("./local-notifications");
    expect(isNativeNotifications()).toBe(true);
    expect(await getNotificationPermission()).toBe("unknown");
  });

  it("nu trece pe unsupported doar pentru că WebView-ul nu are Notification", async () => {
    stubWindow({ native: true, permission: false });
    const { getNotificationPermission } = await import("./local-notifications");
    expect(await getNotificationPermission()).not.toBe("unsupported");
  });

  it("după permisiune: salvează preferința, programează WorkManager și trimite confirmarea", async () => {
    const harness = stubWindow({ native: true, permission: false });
    bridge.requestPermission.mockImplementation(() => {
      bridge.hasPermission.mockReturnValue(true);
      harness.fireGranted();
    });
    const { enableLocalAlerts, isNotificationsEnabled } = await import("./local-notifications");
    const status = await enableLocalAlerts(createEmptyAppData());
    expect(status).toBe("granted");
    expect(isNotificationsEnabled()).toBe(true);
    expect(bridge.notifyNow).toHaveBeenCalled();
    expect(String(bridge.notifyNow.mock.calls[0][0])).toMatch(/Reamintiri/);
  });

  it("un tap eșuat nu scrie preferința pe oprit", async () => {
    stubWindow({ native: true, permission: false });
    delete (bridge as { requestPermission?: unknown }).requestPermission;
    const { requestNotificationPermission, isNotificationsEnabled, setNotificationsEnabled } = await import("./local-notifications");
    setNotificationsEnabled(true);
    const status = await requestNotificationPermission();
    expect(status).toBe("unknown");
    expect(isNotificationsEnabled()).toBe(true);
  });

  it("oprirea anulează job-urile native", async () => {
    stubWindow({ native: true, permission: true });
    const { disableLocalAlerts, isNotificationsEnabled } = await import("./local-notifications");
    disableLocalAlerts();
    expect(isNotificationsEnabled()).toBe(false);
    expect(bridge.cancelAll).toHaveBeenCalled();
  });

  it("programează WorkManager și fără plugin Capacitor, dacă permisiunea e acordată", async () => {
    stubWindow({ native: true, permission: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T08:00:00"));
    const { scheduleFinancialReminders } = await import("./local-notifications");
    const data = createEmptyAppData();
    data.debts = [{ id: "d1", name: "eMAG telefon", creditor: "eMAG", remaining: 100, monthly: 50, dueDay: 15, due: "", tone: "coral" }];
    await scheduleFinancialReminders(data);
    expect(bridge.schedule).toHaveBeenCalled();
    const payload = JSON.parse(String(bridge.schedule.mock.calls[0][0])) as Array<{ title: string }>;
    expect(payload[0].title.length).toBeGreaterThan(3);
  });
});
