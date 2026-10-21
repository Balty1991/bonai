import { describe, expect, it } from "vitest";
import { notifyKindOf, readNotifyPrefs } from "./notify-prefs";

describe("preferințele notificărilor", () => {
  it("pune fiecare alertă la felul ei", () => {
    expect(notifyKindOf("cost-net-2026-10-10")).toBe("bills");
    expect(notifyKindOf("debt-d1-2026-10-10")).toBe("bills");
    expect(notifyKindOf("backup-old-2026-10-25")).toBe("backup");
    expect(notifyKindOf("warranty-return-w1")).toBe("warranty");
    expect(notifyKindOf("price-week-2026-10-24")).toBe("prices");
  });

  it("citește doar felurile cunoscute", () => {
    const store = (value: unknown) => ({ getItem: () => JSON.stringify(value) });
    // Preferințele vechi (plicuri, seara, ora amintirii) se ignoră.
    expect(readNotifyPrefs(store({ off: ["checkin", "prices", "spam"], eveningHour: 21 }))).toEqual({ off: ["prices"] });
    expect(readNotifyPrefs({ getItem: () => "{nu e json" })).toEqual({ off: [] });
  });
});
