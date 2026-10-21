/**
 * Alerta trimisă când, după sincronizare, altcineva din familie a adăugat o cheltuială.
 * Testăm decizia, nu transportul: ce declanșează o notificare și ce nu.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type Transaction } from "./finance-data";

type Sent = { title: string; body: string; tag: string };

const sent: Sent[] = [];
let store: Record<string, string> = {};

class FakeNotification {
  static permission = "granted";
  constructor(title: string, options: { body: string; tag: string }) {
    sent.push({ title, body: options.body, tag: options.tag });
  }
}

beforeEach(() => {
  sent.length = 0;
  store = {};
  const localStorage = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  };
  Object.assign(globalThis, {
    window: { localStorage, Notification: FakeNotification },
    Notification: FakeNotification,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "Notification");
});

const expense = (id: string, memberId: string, person: string, amount: number, date: string): Transaction => ({
  id, title: "Cumpărături", amount, kind: "expense", category: "Alimente",
  source: "Card debit", sourceId: "source-debit", memberId, person, date,
});

const household = (): AppData => {
  const data = createEmptyAppData();
  data.settings.memberName = "Eu";
  data.settings.members = [{ id: "member-me", name: "Eu" }, { id: "member-doi", name: "Ana" }];
  return data;
};

const load = async () => (await import("./local-notifications")).notifyFamilyExpenses;

describe("cheltuielile noi din familie, după sincronizare", () => {
  it("nu anunță pentru propriile cheltuieli", async () => {
    const notify = await load();
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-me", "Eu", 1200, "2026-09-08")] };
    await notify(previous, next);
    expect(sent).toEqual([]);
  });

  it("anunță cheltuiala altui membru", async () => {
    const notify = await load();
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-doi", "Ana", 100, "2026-09-08")] };
    await notify(previous, next);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toContain("Cheltuială nouă");
    expect(sent[0].body).toContain("Ana");
  });

  it("nu repetă aceeași cheltuială la următoarea sincronizare", async () => {
    const notify = await load();
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-doi", "Ana", 100, "2026-09-08")] };
    await notify(previous, next);
    await notify(previous, next);
    expect(sent).toHaveLength(1);
  });

  it("nu anunță nimic dacă nu a sosit nicio mișcare nouă", async () => {
    const notify = await load();
    const previous = { ...household(), transactions: [expense("t1", "member-doi", "Ana", 1200, "2026-09-08")] };
    await notify(previous, previous);
    expect(sent).toEqual([]);
  });

  it("tace când notificările sunt oprite din setări", async () => {
    const notify = await load();
    store["buget-familie:notifications-enabled"] = "false";
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-doi", "Ana", 1200, "2026-09-08")] };
    await notify(previous, next);
    expect(sent).toEqual([]);
  });
});
