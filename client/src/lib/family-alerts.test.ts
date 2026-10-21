/**
 * Alerta trimisă când o actualizare de la un alt telefon împinge un plic peste prag.
 * Testăm decizia, nu transportul: ce declanșează o notificare și ce nu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData, type AppData, type Transaction } from "./finance-data";

// Alertele bugetului vechi (plicuri, mâncare, salariu, seara) mai există doar în arhivă: testele le pornesc explicit.
vi.mock("./app-mode", async (original) => ({ ...(await original<typeof import("./app-mode")>()), legacyBudgetOn: () => true }));

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
  source: "Card debit", sourceId: "source-debit", memberId, person, date, allocationId: "alloc-1",
});

const household = (): AppData => {
  const data = createEmptyAppData();
  data.settings.memberName = "Eu";
  data.settings.members = [{ id: "member-me", name: "Eu" }, { id: "member-doi", name: "Ana" }];
  data.settings.salaryPlan = {
    ...data.settings.salaryPlan,
    periodStart: "2026-09-01",
    nextPayday: "2026-09-30",
    allocations: [{ id: "alloc-1", label: "Alimente", category: "Alimente", amount: 1000, alertThreshold: 80 }],
  };
  return data;
};

const load = async () => (await import("./local-notifications")).notifyFamilyEnvelopeChanges;

describe("alerta de plic din sincronizare", () => {
  it("anunță când altcineva din familie trece plicul peste prag", async () => {
    const notify = await load();
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-doi", "Ana", 850, "2026-09-08")] };
    await notify(previous, next);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toContain("aproape de limită");
    expect(sent[0].body).toContain("Ana");
  });

  it("spune clar când plicul a fost depășit", async () => {
    const notify = await load();
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-doi", "Ana", 1200, "2026-09-08")] };
    await notify(previous, next);
    expect(sent[0].title).toContain("Plic depășit");
  });

  it("nu anunță pentru propriile cheltuieli", async () => {
    const notify = await load();
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-me", "Eu", 1200, "2026-09-08")] };
    await notify(previous, next);
    expect(sent).toEqual([]);
  });

  it("anunță cheltuiala altui membru chiar dacă plicul rămâne în limite", async () => {
    const notify = await load();
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-doi", "Ana", 100, "2026-09-08")] };
    await notify(previous, next);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toContain("Cheltuială nouă");
    expect(sent[0].body).toContain("Ana");
  });

  it("nu repetă aceeași alertă de plic la fiecare sincronizare din aceeași zi", async () => {
    const notify = await load();
    const previous = household();
    const next = { ...previous, transactions: [expense("t1", "member-doi", "Ana", 850, "2026-09-08")] };
    await notify(previous, next);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toContain("aproape de limită");
    const later = { ...next, transactions: [...next.transactions, expense("t2", "member-doi", "Ana", 20, "2026-09-09")] };
    await notify(next, later);
    expect(sent.filter((item) => item.title.includes("aproape de limită") || item.title.includes("depășit"))).toHaveLength(1);
  });

  it("anunță separat trecerea de la avertisment la depășire", async () => {
    const notify = await load();
    const previous = { ...household(), transactions: [expense("t1", "member-doi", "Ana", 850, "2026-09-08")] };
    const next = { ...previous, transactions: [...previous.transactions, expense("t2", "member-doi", "Ana", 300, "2026-09-09")] };
    await notify(previous, next);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toContain("Plic depășit");
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
