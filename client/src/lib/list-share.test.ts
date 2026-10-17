import { describe, expect, it } from "vitest";
import { idsFromTickReply, decodeSharedList, encodeSharedList, listShareLink, listShareText, whatsappShareUrl } from "./list-share";

describe("lista pe WhatsApp", () => {
  it("pune fiecare produs pe rândul lui, cu căsuță", () => {
    const text = listShareText([{ text: "Lapte" }, { text: " Pâine " }], "Lista noastră:", "Bonuț");
    expect(text).toBe("Lista noastră:\n\n☐ Lapte\n☐ Pâine\n\nBonuț");
  });
  it("codifică diacriticele și rândurile noi în link", () => {
    expect(whatsappShareUrl("Pâine\nouă")).toBe("https://wa.me/?text=P%C3%A2ine%0Aou%C4%83");
  });
});

describe("linkul web al listei", () => {
  it("dus-întors cu diacritice, fără server", () => {
    const code = encodeSharedList([{ text: "Pâine" }, { text: "Ouă de țară" }], "Familia Popescu");
    expect(code).not.toMatch(/[+/=]/);
    expect(decodeSharedList(code)).toEqual({ v: 1, title: "Familia Popescu", items: ["Pâine", "Ouă de țară"] });
    expect(listShareLink([{ text: "Lapte" }], undefined, "https://x/l.html")).toMatch(/^https:\/\/x\/l\.html#/);
  });
  it("respinge gunoiul", () => {
    expect(decodeSharedList("nu-e-baza64!!")).toBeUndefined();
  });
});

describe("răspunsul cu bife", () => {
  it("bifează doar produsele recunoscute, fără diacritice sau majuscule", () => {
    const todo = [{ id: "1", text: "Pâine" }, { id: "2", text: "Ouă de țară" }, { id: "3", text: "Lapte" }];
    expect(idsFromTickReply("Am luat:\n✓ paine\n✓ OUA DE TARA\n✓ Mere", todo)).toEqual(["1", "2"]);
  });
});
