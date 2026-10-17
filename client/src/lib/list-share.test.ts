import { describe, expect, it } from "vitest";
import { listShareText, whatsappShareUrl } from "./list-share";

describe("lista pe WhatsApp", () => {
  it("pune fiecare produs pe rândul lui, cu căsuță", () => {
    const text = listShareText([{ text: "Lapte" }, { text: " Pâine " }], "Lista noastră:", "Bonuț");
    expect(text).toBe("Lista noastră:\n\n☐ Lapte\n☐ Pâine\n\nBonuț");
  });
  it("codifică diacriticele și rândurile noi în link", () => {
    expect(whatsappShareUrl("Pâine\nouă")).toBe("https://wa.me/?text=P%C3%A2ine%0Aou%C4%83");
  });
});
