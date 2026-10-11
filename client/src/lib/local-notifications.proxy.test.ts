/**
 * Pluginul Capacitor răspunde la orice nume, și la „then”, cu o promisiune respinsă
 * („LocalNotifications.then() is not implemented on android”, Sentry #89). Întors direct
 * dintr-o promisiune, citirea permisiunii rămânea agățată.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/local-notifications", () => {
  const methods: Record<string, unknown> = {
    checkPermissions: async () => ({ display: "granted" }),
  };
  const LocalNotifications = new Proxy({}, {
    get: (_, prop) => methods[String(prop)] ?? (() => Promise.reject(new Error(`"LocalNotifications.${String(prop)}()" is not implemented on android`))),
  });
  return { LocalNotifications };
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

describe("pluginul de notificări ca Proxy Capacitor", () => {
  it("citește permisiunea fără să cheme LocalNotifications.then()", async () => {
    const store: Record<string, string> = {};
    Object.assign(globalThis, {
      window: {
        localStorage: {
          getItem: (key: string) => (key in store ? store[key] : null),
          setItem: (key: string, value: string) => { store[key] = value; },
          removeItem: (key: string) => { delete store[key]; },
        },
        BugetFamilieReminders: { hasPermission: () => false },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
      document: {
        documentElement: { classList: { contains: (name: string) => name === "capacitor-android" } },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { getNotificationPermission } = await import("./local-notifications");
      const result = await Promise.race([
        getNotificationPermission(),
        new Promise((resolve) => setTimeout(() => resolve("agățat"), 500)),
      ]);
      expect(result).toBe("granted");
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
