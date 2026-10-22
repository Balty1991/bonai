import { describe, expect, it } from "vitest";
import { defaultScheduleTimes, isNightMinutes } from "./home-kit";

describe("„Automat”: noaptea e închisă și cu telefonul pe luminos", () => {
  const at = (hh: number, mm = 0) => hh * 60 + mm;
  it("21:00–6:00 e noapte, ziua nu", () => {
    expect(isNightMinutes(at(21, 33), defaultScheduleTimes)).toBe(true);
    expect(isNightMinutes(at(2), defaultScheduleTimes)).toBe(true);
    expect(isNightMinutes(at(5, 59), defaultScheduleTimes)).toBe(true);
    expect(isNightMinutes(at(6), defaultScheduleTimes)).toBe(false);
    expect(isNightMinutes(at(14), defaultScheduleTimes)).toBe(false);
    expect(isNightMinutes(at(20, 59), defaultScheduleTimes)).toBe(false);
  });
  it("urmează orele alese de om", () => {
    const times = { dayStart: "07:30", eveningStart: "18:00", nightStart: "22:00" };
    expect(isNightMinutes(at(21, 30), times)).toBe(false);
    expect(isNightMinutes(at(7), times)).toBe(true);
  });
});
