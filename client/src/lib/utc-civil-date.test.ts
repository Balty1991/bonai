/**
 * Datele civile trebuie să rămână pe fusul local: toISOString().slice(0,10)
 * mută seara locală în ziua UTC greșită ori de câte ori offset-ul nu e zero.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { addIsoDays, isoDate, isoToday } from "./finance-data";

describe("date civile locale, nu UTC", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isoDate folosește getterele locale, nu UTC", () => {
    const evening = new Date(2026, 8, 12, 23, 30, 0);
    expect(isoDate(evening)).toBe(
      `${evening.getFullYear()}-${String(evening.getMonth() + 1).padStart(2, "0")}-${String(evening.getDate()).padStart(2, "0")}`,
    );
    // Seara locală cade în ziua UTC următoare doar la vest de Greenwich.
    // La est (Auckland, România) 23:30 e încă aceeași zi UTC, deci comparația
    // nu poate fi „mereu diferit” doar pentru că offset-ul nu e zero.
    if (evening.getTimezoneOffset() > 30) {
      expect(evening.toISOString().slice(0, 10)).not.toBe(isoDate(evening));
    }
  });

  it("isoToday urmează calendarul local", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 12, 23, 45, 0));
    const now = new Date();
    expect(isoToday()).toBe(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    );
  });

  it("addIsoDays nu sare zile prin UTC", () => {
    expect(addIsoDays("2026-09-12", -13)).toBe("2026-08-30");
    expect(addIsoDays("2026-09-12", 6)).toBe("2026-09-18");
    // Construit la amiază locală, ca setDate să nu treacă prin miezul nopții UTC.
    const noon = new Date("2026-09-12T12:00:00");
    noon.setDate(noon.getDate() - 13);
    expect(isoDate(noon)).toBe("2026-08-30");
    expect(noon.toISOString().slice(0, 10) === isoDate(noon) || noon.getTimezoneOffset() !== 0).toBe(true);
  });

});
