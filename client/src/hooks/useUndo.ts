/**
 * Anulare locală după ștergere: ține rândurile scoase câteva secunde,
 * ca o greșeală dintr-o atingere să se corecteze tot dintr-o atingere.
 */
import { haptic } from "@/lib/native-feel";
import { useEffect, useRef, useState } from "react";
import { buildUndo, type UndoAction } from "@/lib/undo-delete";
import type { AppData } from "@/lib/finance-data";

export function useUndo(data: AppData, setData: (value: AppData | ((current: AppData) => AppData)) => void) {
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  const offerUndo = (action: UndoAction | undefined, ms = 9000) => {
    window.clearTimeout(undoTimer.current);
    if (!action) return;
    setUndo(action);
    undoTimer.current = window.setTimeout(() => setUndo(null), ms);
  };

  const runUndo = () => {
    window.clearTimeout(undoTimer.current);
    if (undo) setData((current) => undo.apply(current));
    setUndo(null);
  };

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const deleteWithUndo = (
    label: string,
    pick: (current: AppData) => { next: AppData; removed: Parameters<typeof buildUndo>[1] },
    ms?: number,
  ) => {
    const { next, removed } = pick(data);
    setData(next);
    haptic("reject");
    offerUndo(buildUndo(label, removed), ms);
  };

  return { undo, setUndo, runUndo, deleteWithUndo, offerUndo };
}
