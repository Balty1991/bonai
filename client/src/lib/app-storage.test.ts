import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyAppData, type AppData } from "./finance-data";
import { chooseFresherAppData, downloadBackup, hashAppPayload, localSnapshotText, makeBackup, parseBackup } from "./app-storage";

/** Plugin-urile Capacitor nu există în Node; le înlocuim o singură dată, controlabil. */
const native = vi.hoisted(() => ({
  writeFile: vi.fn(),
  stat: vi.fn(),
  share: vi.fn(),
  saveBackupToDownloads: vi.fn(),
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: native.writeFile, stat: native.stat },
  Directory: { Documents: "DOCUMENTS", Cache: "CACHE", Data: "DATA" },
  Encoding: { UTF8: "utf8" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: native.share } }));
// Ca pluginul adevărat: un Proxy care răspunde la orice nume, inclusiv „then”, cu o metodă nativă.
// O metodă pe care Android n-o are nu răspunde; un `await` pe pluginul gol s-ar agăța aici ca pe telefon.
vi.mock("@capacitor/core", () => ({
  registerPlugin: () => new Proxy({}, {
    get: (_, prop) => prop === "saveBackupToDownloads" ? native.saveBackupToDownloads : () => new Promise(() => undefined),
  }),
}));

const data = () => {
  const value = createEmptyAppData();
  value.settings.familyName = "Familia Test";
  value.transactions = [{ id: "tx-1", title: "Salariu", amount: 2500, kind: "income", category: "Venit", source: "Card", person: "Eu", date: "2026-09-01" }];
  return value;
};

/**
 * Spionii se curăță înaintea fiecărui test, nu doar în blocul nativ: „pe web” verifică
 * prin `not.toHaveBeenCalled()` că plugin-ul nu e atins, iar fără curățare vedea apelurile
 * rămase de la testele de pe telefon și pica pe un cod corect.
 */
beforeEach(() => {
  native.writeFile.mockReset();
  native.stat.mockReset();
  native.share.mockReset();
  native.saveBackupToDownloads.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("backup Buget Familie", () => {
  it("creează un backup cu metadatele și datele aplicației", () => {
    const backup = makeBackup(data());
    expect(backup).toMatchObject({ kind: "buget-familie-backup", version: 1, data: { version: 9 } });
    expect(backup.exportedAt).toMatch(/^20\d\d-\d\d-\d\dT/);
    expect(backup.data.settings.familyName).toBe("Familia Test");
  });

  it("face round-trip export JSON → import fără pierderea datelor", () => {
    const original = data();
    const restored = parseBackup(JSON.stringify(makeBackup(original)));
    expect(restored.kind).toBe("buget-familie-backup");
    expect(restored.data).toEqual(original);
  });

  it("respinge JSON valid care nu este backup Buget Familie", () => {
    expect(() => parseBackup(JSON.stringify({ kind: "alt-format", version: 1, data: {} }))).toThrow("backup BonAI valid");
    expect(() => parseBackup(JSON.stringify({ kind: "buget-familie-backup", version: 99, data: {} }))).toThrow("backup BonAI valid");
    expect(() => parseBackup("nu este JSON")).toThrow();
  });

  describe("pe telefon (Capacitor)", () => {
    beforeEach(() => {
      vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => true } });
      native.writeFile.mockReset().mockResolvedValue({ uri: "file:///cache/backup.json" });
      native.stat.mockReset().mockResolvedValue({ size: 120, uri: "file:///cache/backup.json" });
      native.share.mockReset().mockResolvedValue({ activityType: "com.google.android.apps.docs" });
      native.saveBackupToDownloads.mockReset().mockImplementation(async ({ name, data }) => {
        JSON.parse(data);
        return { path: `Download/${name}` };
      });
    });

    /**
     * Bug raportat: succes „Documents/…” fără fișier vizibil în Fișiere.
     * Salvare = MediaStore Descărcări, fără foaie de partajare.
     */
    it("salvează în Descărcări prin MediaStore, fără lista de aplicații", async () => {
      const result = await downloadBackup(data());

      expect(result.how).toBe("saved");
      expect(result.how === "saved" && result.path).toMatch(/^Download\/buget-familie-backup/);
      expect(native.saveBackupToDownloads).toHaveBeenCalledOnce();
      const call = native.saveBackupToDownloads.mock.calls[0][0];
      expect(call.name).toMatch(/^buget-familie-backup-20\d\d-\d\d-\d\d-\d{4}\.json$/);
      expect(JSON.parse(call.data).data.settings.familyName).toBe("Familia Test");
      expect(native.share).not.toHaveBeenCalled();
      expect(native.writeFile).not.toHaveBeenCalled();
    });

    it("deschide foaia de partajare doar când asta s-a cerut", async () => {
      await expect(downloadBackup(data(), "share")).resolves.toEqual({ how: "shared" });
      expect(native.share).toHaveBeenCalledOnce();
      expect(native.saveBackupToDownloads).not.toHaveBeenCalled();
      expect(native.writeFile).toHaveBeenCalledOnce();
      expect(native.writeFile.mock.calls[0][0].directory).toBe("CACHE");
      expect(native.share.mock.calls[0][0].url).toBe("file:///cache/backup.json");
    });

    it("la salvare, dacă MediaStore eșuează, deschide partajarea cu fallback sincer", async () => {
      native.saveBackupToDownloads.mockRejectedValueOnce(new Error("MediaStore denied"));

      await expect(downloadBackup(data())).resolves.toEqual({ how: "shared", fallback: true });
      expect(native.share).toHaveBeenCalledOnce();
      expect(native.writeFile.mock.calls[0][0].directory).toBe("CACHE");
    });

    it("nu pretinde Documents când partajarea e anulată după eșec MediaStore", async () => {
      native.saveBackupToDownloads.mockRejectedValueOnce(new Error("MediaStore denied"));
      native.share.mockRejectedValue(Object.assign(new Error("Share canceled"), { name: "AbortError" }));

      await expect(downloadBackup(data())).resolves.toEqual({ how: "cancelled" });
    });

    it("la trimite, anularea partajării nu e prezentată ca salvare în Documents", async () => {
      native.share.mockRejectedValue(Object.assign(new Error("Share canceled"), { name: "AbortError" }));

      await expect(downloadBackup(data(), "share")).resolves.toEqual({ how: "cancelled" });
    });

    it("raportează eroarea când cache-ul e gol după eșec MediaStore", async () => {
      native.saveBackupToDownloads.mockRejectedValueOnce(new Error("MediaStore denied"));
      native.stat.mockResolvedValueOnce({ size: 0, uri: "file:///cache/backup.json" });

      await expect(downloadBackup(data())).resolves.toEqual({ how: "failed", reason: "Fișierul a rămas gol." });
    });

    it("raportează eroarea reală când scrierea în cache eșuează după MediaStore", async () => {
      native.saveBackupToDownloads.mockRejectedValueOnce(new Error("MediaStore denied"));
      native.writeFile.mockRejectedValue(new Error("Nu există spațiu"));

      await expect(downloadBackup(data())).resolves.toEqual({ how: "failed", reason: "Nu există spațiu" });
    });
  });

  describe("pe web", () => {
    const webWindow = () => vi.stubGlobal("window", { setTimeout: vi.fn() });

    it("folosește foaia de partajare a browserului când asta s-a cerut", async () => {
      webWindow();
      const share = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { share, canShare: () => true });
      vi.stubGlobal("File", class { constructor(public parts: unknown[], public name: string, public options: unknown) {} });
      vi.stubGlobal("Blob", class { constructor(public parts: unknown[]) {} });

      await expect(downloadBackup(data(), "share")).resolves.toEqual({ how: "shared" });
      expect(share).toHaveBeenCalledOnce();
      expect(native.saveBackupToDownloads).not.toHaveBeenCalled();
    });

    it("la salvare descarcă fișierul, chiar dacă browserul știe să partajeze", async () => {
      const click = vi.fn();
      const anchor = { href: "", download: "", rel: "", click, remove: vi.fn() } as unknown as HTMLAnchorElement;
      webWindow();
      const share = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { share, canShare: () => true });
      vi.stubGlobal("File", class { constructor(public parts: unknown[], public name: string) {} });
      vi.stubGlobal("Blob", class { constructor(public parts: unknown[]) {} });
      vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() });
      vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } });

      await expect(downloadBackup(data())).resolves.toEqual({ how: "downloaded" });
      expect(share).not.toHaveBeenCalled();
      expect(click).toHaveBeenCalledOnce();
      expect(native.saveBackupToDownloads).not.toHaveBeenCalled();
    });

    it("cade pe descărcarea clasică atunci când partajarea nu este disponibilă", async () => {
      const click = vi.fn();
      const anchor = { href: "", download: "", rel: "", click, remove: vi.fn() } as unknown as HTMLAnchorElement;
      webWindow();
      vi.stubGlobal("navigator", {});
      vi.stubGlobal("Blob", class { constructor(public parts: unknown[]) {} });
      vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() });
      vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } });

      await expect(downloadBackup(data())).resolves.toEqual({ how: "downloaded" });
      expect(anchor.download).toMatch(/^buget-familie-backup-20\d\d-\d\d-\d\d-\d{4}\.json$/);
      expect(click).toHaveBeenCalledOnce();
    });

    it("nu raportează nici succes, nici eroare când utilizatorul închide foaia de partajare", async () => {
      webWindow();
      const abort = Object.assign(new Error("abort"), { name: "AbortError" });
      vi.stubGlobal("navigator", { share: vi.fn(async () => { throw abort; }), canShare: () => true });
      vi.stubGlobal("File", class { constructor(public parts: unknown[], public name: string) {} });
      vi.stubGlobal("Blob", class { constructor(public parts: unknown[]) {} });

      await expect(downloadBackup(data(), "share")).resolves.toEqual({ how: "cancelled" });
    });
  });
});


import { normalizeSavedAt, resolveHydrateMerge } from "./app-storage";

describe("stocare LS ↔ IndexedDB", () => {
  const sample = (familyName: string) => {
    const value = createEmptyAppData();
    value.settings.familyName = familyName;
    return value;
  };

  it("păstrează IDB când hash-urile coincid", () => {
    const local = sample("Local");
    const indexed = sample("Indexed");
    const hash = hashAppPayload("same");
    expect(chooseFresherAppData(
      { data: local, savedAt: "2026-09-12T10:00:00.000Z", hash },
      { data: indexed, savedAt: "2026-09-12T10:00:00.000Z", hash },
    )).toBe(indexed);
  });

  it("alege copia cu savedAt mai nou, nu „IDB dacă există”", () => {
    const local = sample("Local-nou");
    const indexed = sample("Indexed-vechi");
    expect(chooseFresherAppData(
      { data: local, savedAt: "2026-09-12T12:00:00.000Z", hash: "aaa" },
      { data: indexed, savedAt: "2026-09-12T11:00:00.000Z", hash: "bbb" },
    )).toBe(local);
    expect(chooseFresherAppData(
      { data: local, savedAt: "2026-09-12T10:00:00.000Z", hash: "aaa" },
      { data: indexed, savedAt: "2026-09-12T11:00:00.000Z", hash: "bbb" },
    )).toBe(indexed);
  });

  it("fără meta, preferă LS când hash-urile diferă (debounce IDB)", () => {
    const local = sample("Taste-recente");
    const indexed = sample("IDB-în-urmă");
    expect(chooseFresherAppData(
      { data: local, savedAt: null, hash: "1" },
      { data: indexed, savedAt: null, hash: "2" },
    )).toBe(local);
  });

  it("stampă invalidă e tratată ca lipsă", () => {
    expect(normalizeSavedAt("nu-e-dată")).toBeNull();
    expect(normalizeSavedAt("")).toBeNull();
    expect(normalizeSavedAt("2026-09-12T12:00:00.000Z")).toBe("2026-09-12T12:00:00.000Z");
  });

  it("la același savedAt cu hash diferit preferă LS (debounce IDB)", () => {
    const local = sample("Taste");
    const indexed = sample("IDB");
    const stamp = "2026-09-12T12:00:00.000Z";
    expect(chooseFresherAppData(
      { data: local, savedAt: stamp, hash: "aaa" },
      { data: indexed, savedAt: stamp, hash: "bbb" },
    )).toBe(local);
  });

  it("savedAt invalid pe IDB nu bate LS cu stampă validă", () => {
    const local = sample("Local");
    const indexed = sample("Indexed");
    expect(chooseFresherAppData(
      { data: local, savedAt: "2026-09-12T12:00:00.000Z", hash: "a" },
      { data: indexed, savedAt: "ieri", hash: "b" },
    )).toBe(local);
  });

  it("hydrate: editarea din memorie înainte de IDB nu e rescrisă de IDB mai vechi", () => {
    const memory = sample("Editat-acum");
    const indexed = sample("IDB-vechi");
    const picked = resolveHydrateMerge({
      local: { data: sample("LS-vechi"), savedAt: "2026-09-12T10:00:00.000Z", hash: "ls" },
      indexed: { data: indexed, savedAt: "2026-09-12T11:00:00.000Z", hash: "idb" },
      memory,
      editedBeforeHydrate: true,
    });
    expect(picked?.settings.familyName).toBe("Editat-acum");
  });

  it("hydrate: fără editări, IDB mai nou înlocuiește LS", () => {
    const memory = sample("LS-vechi");
    const picked = resolveHydrateMerge({
      local: { data: memory, savedAt: "2026-09-12T10:00:00.000Z", hash: "ls" },
      indexed: { data: sample("IDB-nou"), savedAt: "2026-09-12T12:00:00.000Z", hash: "idb" },
      memory,
      editedBeforeHydrate: false,
    });
    expect(picked?.settings.familyName).toBe("IDB-nou");
  });
});

describe("backup cap-coadă, cu registru bogat", () => {
  it("salvarea, citirea și normalizarea nu pierd și nu schimbă nimic", async () => {
    const { createEmptyAppData, normalizeAppData } = await import("./finance-data");
    const data = createEmptyAppData();
    data.settings.familyName = "Familia Pop";
    data.settings.members = [{ id: "m1", name: "Ana" }, { id: "m2", name: "Mihai" }];
    data.settings.exchangeRates = [{ code: "EUR", rate: 4.97, updatedAt: "2026-09-01T10:00:00.000Z" }] as unknown as typeof data.settings.exchangeRates;
    data.settings.merchantRules = [{ id: "r1", match: "decathlon", category: "Timp liber", updatedAt: "2026-09-02T10:00:00.000Z" }];
    data.settings.salaryPlan = { ...data.settings.salaryPlan, periodStart: "2026-09-10", nextPayday: "2026-10-10", allocations: [{ id: "a1", label: "Alimente", amount: 1500, category: "Alimente", weeklyPace: true, alertThreshold: 80 }] };
    data.transactions = [
      { id: "t1", title: "Lidl", amount: 184.5, kind: "expense", category: "Alimente", source: "Card", person: "Ana", date: "2026-09-21", sourceId: "source-debit", memberId: "m1", allocationId: "a1", note: "Import din bt.xlsx, rândul 5", shareScope: "shared", createdAt: "2026-09-21T10:00:00.000Z" },
      { id: "t2", title: "Hotel", amount: 497, originalAmount: 100, originalCurrency: "EUR", exchangeRate: 4.97, kind: "expense", category: "Timp liber", source: "Card", person: "Mihai", date: "2026-09-22", sourceId: "source-debit", memberId: "m2", shareScope: "personal" },
      { id: "t3", title: "Salariu", amount: 9200, kind: "income", category: "Venit", source: "Card", person: "Ana", date: "2026-09-10", sourceId: "source-debit", memberId: "m1" },
    ];
    data.recurring = [
      { id: "rc1", name: "Netflix", amount: 59.99, category: "Abonamente", sourceId: "source-debit", memberId: "m1", dueDay: 8, active: true },
      { id: "rc2", name: "RCA", amount: 1200, category: "Transport", sourceId: "source-debit", memberId: "m2", dueDay: 15, active: true, frequency: "yearly", month: 3 },
      { id: "rc3", name: "Enel", amount: 220, category: "Casă & facturi", sourceId: "source-debit", memberId: "m1", dueDay: 12, active: true, variable: true, autoPost: false },
    ];
    data.debts = [{ id: "d1", name: "Credit", remaining: 18500, monthly: 620, annualRate: 18, kind: "credit", due: "", tone: "coral", dueDate: "2026-10-03" }] as typeof data.debts;
    data.savings = [{ id: "s1", name: "Vacanță", current: 1200, target: 5000, due: "", tone: "forest", dueDate: "2027-06-01" }] as typeof data.savings;
    const once = normalizeAppData(data);
    const restored = normalizeAppData(parseBackup(JSON.stringify(makeBackup(once))).data);
    expect(restored).toEqual(once);
    expect(normalizeAppData(restored)).toEqual(restored);
    expect(restored.transactions.find((item) => item.id === "t2")).toMatchObject({ originalAmount: 100, originalCurrency: "EUR", exchangeRate: 4.97, shareScope: "personal" });
    expect(restored.recurring.find((item) => item.id === "rc2")).toMatchObject({ frequency: "yearly", month: 3 });
    expect(restored.recurring.find((item) => item.id === "rc3")).toMatchObject({ variable: true });
    expect(restored.settings.merchantRules).toHaveLength(1);
  });
});

describe("copia din localStorage și bonurile", () => {
  it("păstrează imageKeys și are același hash ca IndexedDB", () => {
    const data = createEmptyAppData();
    data.receipts = [{ id: "r1", vendor: "Lidl", date: "2026-09-26", total: 10, imageKeys: ["receipt-img-r1-0"], imageData: "data:image/jpeg;base64,AAAA" } as unknown as AppData["receipts"][number]];
    const text = localSnapshotText(data);
    expect(JSON.parse(text).receipts[0].imageKeys).toEqual(["receipt-img-r1-0"]);
    expect(JSON.parse(text).receipts[0].imageData).toBeUndefined();
    const saved = "2026-09-26T10:00:00.000Z";
    const chosen = chooseFresherAppData(
      { data: JSON.parse(text) as AppData, savedAt: saved, hash: hashAppPayload(text) },
      { data, savedAt: saved, hash: hashAppPayload(localSnapshotText(data)) },
    );
    expect(chosen).toBe(data);
  });
});
