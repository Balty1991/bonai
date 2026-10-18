/**
 * Hydrate LS↔IDB + persist debounce — extras din Home ca să rămână orchestrator.
 */
import { recordRemovals } from "@/lib/sync-removals";
import { stampPlanScalars } from "@/lib/plan-scalars";
import { stampLocalTransactions } from "@/lib/habit-hold";
import { getOrCreateDeviceId } from "@/lib/sync-devices";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { adjustDebtsForLedgerEdits, autoPostDueRecurring, adoptOutsideExpenses, createEmptyAppData, normalizeAppData, type AppData } from "@/lib/finance-data";
import {
  APP_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  hashAppPayload,
  localSnapshotText,
  readAppDataRecord,
  readLocalStorageSnapshot,
  resolveHydrateMerge,
  writeAppData,
  writeLocalStorageSnapshot,
} from "@/lib/app-storage";
import { readAppMode } from "@/lib/app-mode";
import { migrateRecurringToTracking } from "@/lib/house-costs";
import { t } from "@/lib/i18n";

export function readInitialAppData(): AppData {
  try {
    const raw = window.localStorage.getItem(APP_STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? adoptOutsideExpenses(normalizeAppData(JSON.parse(raw))) : createEmptyAppData();
  } catch {
    return createEmptyAppData();
  }
}

export function usePersistAppData(
  data: AppData,
  setData: Dispatch<SetStateAction<AppData>>,
) {
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const storageHydrated = useRef(false);
  const editedBeforeHydrate = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  /** Ultima copie comună cu celelalte file: baza unirii, ca o sumă schimbată într-o filă să nu devină conflict. */
  const sharedRef = useRef<AppData | null>(null);
  const lastSavedHash = useRef("");

  const applyData: typeof setData = (value) => {
    if (!storageHydrated.current) editedBeforeHydrate.current = true;
    // Ce dispare din plan sau din setări lasă piatră de mormânt, ca sincronizarea să nu-l readucă.
    setData((previous) => {
      const next = typeof value === "function" ? value(previous) : value;
      const edited = adjustDebtsForLedgerEdits(previous, next);
      const stamped = stampLocalTransactions(previous, edited, getOrCreateDeviceId());
      return stampPlanScalars(previous, recordRemovals(previous, stamped));
    });
  };

  useEffect(() => {
    let active = true;
    const localAtStart = readLocalStorageSnapshot();
    void readAppDataRecord()
      .then((indexed) => {
        if (!active) return;
        // Copia din localStorage (deja în memorie) e identică cu IndexedDB: nu mai normalizăm și nu
        // mai randăm tot o dată; altfel, cu registru mare, pornirea făcea de 2–3 ori lucrul greu.
        const lsNow = readLocalStorageSnapshot();
        const inlineImages = (indexed.data?.receipts || []).some((item) => item.imageData || item.imageData2);
        if (!editedBeforeHydrate.current && !inlineImages && indexed.hash && lsNow.data && lsNow.hash === indexed.hash) {
          lastSavedHash.current = indexed.hash;
          return;
        }
        setData((current) => {
          const local = readLocalStorageSnapshot();
          const picked = resolveHydrateMerge({
            local: local.data ? local : localAtStart,
            indexed,
            memory: current,
            editedBeforeHydrate: editedBeforeHydrate.current,
          });
          // O copie stricată nu blochează pornirea: încercăm cealaltă copie, apoi ce e în memorie.
          for (const candidate of [picked, indexed.data, local.data]) {
            if (!candidate) continue;
            try { return adoptOutsideExpenses(normalizeAppData(candidate)); } catch { /* următoarea copie */ }
          }
          return current;
        });
      })
      .catch(() => setStorageNotice(t("Stocarea modernă nu este disponibilă; folosim fallback-ul local al browserului.")))
      .finally(() => {
        storageHydrated.current = true;
        setStorageReady(true);
      });
    return () => {
      active = false;
    };
  }, [setData]);

  /**
   * Salvarea nu mai stă în cadrul clicului („Gata” la o cheltuială): textul, hash-ul și scrierea
   * de ~1 MB în localStorage costau ~100 ms pe un telefon slab, lipiți de atingere. Scriem imediat
   * după; dacă aplicația trece în fundal înainte, scriem pe loc. Un registru neschimbat nu se rescrie.
   */
  const pendingSave = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (!storageHydrated.current) return;
    const savedAt = new Date().toISOString();
    const save = () => {
      pendingSave.current = undefined;
      const serialized = localSnapshotText(data);
      const hash = hashAppPayload(serialized);
      if (hash === lastSavedHash.current) return;
      lastSavedHash.current = hash;
      const lsWrite = writeLocalStorageSnapshot(serialized, savedAt, hash);
      if (lsWrite.quotaExceeded || !lsWrite.wroteFull) {
        setStorageNotice(
          t("Spațiul local este aproape plin. Exportă un backup dacă problema continuă."),
        );
      }
      void writeAppData(data, savedAt, hash).then(() => { sharedRef.current = data; channelRef.current?.postMessage(savedAt); }).catch(() =>
        setStorageNotice(t("Datele sunt păstrate în fallback-ul browserului; stocarea modernă nu a confirmat salvarea.")),
      );
    };
    pendingSave.current = save;
    const timer = window.setTimeout(save, 120);
    return () => {
      window.clearTimeout(timer);
      // O schimbare nouă o înlocuiește pe asta; nu pierdem nimic, doar nu scriem de două ori.
      if (pendingSave.current === save) pendingSave.current = undefined;
    };
  }, [data]);
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") pendingSave.current?.(); };
    const flushNow = () => pendingSave.current?.();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flushNow);
    };
  }, []);

  /**
   * Aplicația deschisă în două file (web): fiecare scria starea ei întreagă și o cheltuială
   * notată în cealaltă filă se pierdea. Acum fila anunță salvarea, iar celelalte unesc registrul.
   */
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("buget-familie:data");
    channelRef.current = channel;
    channel.onmessage = () => {
      void (async () => {
        const record = await readAppDataRecord().catch(() => null);
        if (!record?.data) return;
        const { mergeFamilyData, syncBaseOf } = await import("@/lib/family-crypto");
        const other = normalizeAppData(record.data);
        setData((current) => {
          const merged = mergeFamilyData(current, other, sharedRef.current ? syncBaseOf(sharedRef.current) : undefined);
          sharedRef.current = merged;
          const images = new Map([...other.receipts, ...current.receipts].map((item) => [item.id, item]));
          const withImages = { ...merged, receipts: merged.receipts.map((item) => { const source = images.get(item.id); return source ? { ...item, imageData: source.imageData, imageData2: source.imageData2, imageKeys: source.imageKeys } : item; }) };
          return localSnapshotText(withImages) === localSnapshotText(current) ? current : withImages;
        });
      })();
    };
    return () => { channel.close(); channelRef.current = null; };
  }, [setData]);

  useEffect(() => {
    if (!storageReady) return;
    // BonAI doar urmărește abonamentele și facturile: nu mai adaugă plăți singur, le migrează.
    setData((current) => (readAppMode() === "shop" ? migrateRecurringToTracking(current) : autoPostDueRecurring(current)));
  }, [storageReady, setData]);

  return {
    storageNotice,
    setStorageNotice,
    storageReady,
    applyData,
    storageHydrated,
  };
}
