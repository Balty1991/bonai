import { describe, expect, it } from "vitest";
import { createEmptyAppData, type AppData, type Transaction } from "./finance-data";
import { mergeFamilyData } from "./family-crypto";
import { outdatedSyncDevices } from "./sync-devices";

/** Incidentul din 8 octombrie, cu datele din backup: Exflor 39,76 = 28,50 Voucher SGR + 11,26 Cash. */
const part = (id: string, amount: number, sourceId: string, extra: Partial<Transaction> = {}): Transaction => ({
  id, title: "Exflor", amount, kind: "expense", category: "Alimente", sourceId, source: sourceId, person: "Alin", date: "2026-10-06",
  splitId: "split-d4ce", note: "Bon de 39,76 RON: 28,50 RON din Voucher SGR și 11,26 RON din Cash Alin.", createdAt: "2026-10-07T16:19:27.827Z", updatedAt: "2026-10-07T19:52:19.426Z", ...extra,
});

const ledger = (transactions: Transaction[], deleted: AppData["deleted"] = []): AppData => ({
  ...createEmptyAppData(),
  transactions,
  receipts: [{ id: "detail-tx-c1bc", vendor: "Exflor", amount: 39.76, category: "Alimente", date: "2026-10-06", linkedTransactionId: "tx-c1bc", updatedAt: "2026-10-07T19:52:19.426Z", lines: [{ id: "l1", category: "Băuturi", amount: 34.88, label: "Vodka" }] }],
  deleted,
});

describe("ștergerea unei jumătăți de bon venită de pe un telefon vechi", () => {
  it("partea de voucher (cu bonul ei) rămâne, iar piatra de mormânt se ridică", () => {
    const voucher = part("tx-c1bc", 28.5, "voucher", { receiptId: "detail-tx-c1bc" });
    const cash = part("tx-34f3", 11.26, "cash");
    const mine = ledger([voucher, cash]);
    // Telefonul vechi a scos partea de voucher la 18:07 și a trimis piatra de mormânt.
    const theirs = ledger([cash], [{ entity: "transactions", id: "tx-c1bc", deletedAt: "2026-10-08T18:07:46.285Z" }]);
    const merged = mergeFamilyData(mine, theirs);
    expect(merged.transactions.map((item) => `${item.id}:${item.amount}`).sort()).toEqual(["tx-34f3:11.26", "tx-c1bc:28.5"]);
    expect(merged.receipts[0].lines).toHaveLength(1);
    expect(merged.deleted.some((item) => item.id === "tx-c1bc")).toBe(false);
  });

  it("ștergerea bonului întreg (ambele părți) trece mai departe", () => {
    const mine = ledger([part("tx-c1bc", 28.5, "voucher", { receiptId: "detail-tx-c1bc" }), part("tx-34f3", 11.26, "cash")]);
    const theirs = { ...ledger([], [
      { entity: "transactions", id: "tx-c1bc", deletedAt: "2026-10-08T18:07:46.285Z" },
      { entity: "transactions", id: "tx-34f3", deletedAt: "2026-10-08T18:07:46.285Z" },
      { entity: "receipts", id: "detail-tx-c1bc", deletedAt: "2026-10-08T18:07:46.285Z" },
    ]), receipts: [] };
    expect(mergeFamilyData(mine, theirs).transactions).toEqual([]);
  });

  it("o mișcare obișnuită ștearsă pe celălalt telefon rămâne ștearsă", () => {
    const taxi: Transaction = { id: "t", title: "Taxi", amount: 10, kind: "expense", category: "Transport", source: "Cash", person: "Alin", date: "2026-10-06", updatedAt: "2026-10-06T06:48:42.954Z" };
    const merged = mergeFamilyData({ ...createEmptyAppData(), transactions: [taxi] }, { ...createEmptyAppData(), deleted: [{ entity: "transactions", id: "t", deletedAt: "2026-10-08T18:00:00.000Z" }] });
    expect(merged.transactions).toEqual([]);
  });
});

describe("telefonul cu o versiune veche", () => {
  it("e semnalat când a fost văzut în ultimele 30 de zile fără versiune nouă", () => {
    const data = createEmptyAppData();
    data.settings.syncDevices = [
      { id: "me", label: "Aplicația pe Android", lastSeenAt: "2026-10-08T21:00:00.000Z", appVersion: "1.1.195" },
      { id: "old", label: "Aplicația pe Android", lastSeenAt: "2026-10-08T18:08:13.090Z" },
      { id: "new", label: "Aplicația pe Android", lastSeenAt: "2026-10-08T18:08:13.090Z", appVersion: "1.1.196" },
      { id: "gone", label: "Android", lastSeenAt: "2026-08-01T12:44:00.678Z" },
    ];
    expect(outdatedSyncDevices(data, Date.parse("2026-10-09T00:00:00Z"), "me").map((item) => item.id)).toEqual(["old"]);
  });
});

describe("transferul între surse", () => {


  it("o jumătate ștearsă de pe alt telefon rămâne", () => {
    const out: Transaction = { id: "t-out", title: "Mutat în Card", amount: 14, kind: "expense", category: "Transfer", source: "Cash", person: "Alin", date: "2026-10-09", transferId: "tr", updatedAt: "2026-10-08T21:56:13.771Z" };
    const into: Transaction = { ...out, id: "t-in", kind: "income", title: "Mutat din Cash", source: "Card" };
    const merged = mergeFamilyData({ ...createEmptyAppData(), transactions: [out, into] }, { ...createEmptyAppData(), transactions: [out], deleted: [{ entity: "transactions", id: "t-in", deletedAt: "2026-10-08T22:00:00.000Z" }] });
    expect(merged.transactions.map((item) => item.id).sort()).toEqual(["t-in", "t-out"]);
  });
});
