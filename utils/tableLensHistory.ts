import { useState, useCallback, useRef } from 'react';

interface HistoryEntry<T> {
  data: T;
  label: string;
}

/** Undo/redo stack of immutable snapshots. `T` must be replaced, never mutated. */
export function useHistory<T>(maxSize = 50) {
  const [past, setPast] = useState<HistoryEntry<T>[]>([]);
  const [future, setFuture] = useState<HistoryEntry<T>[]>([]);
  const currentRef = useRef<T | null>(null);
  const pastRef = useRef<HistoryEntry<T>[]>([]);
  const futureRef = useRef<HistoryEntry<T>[]>([]);

  // Keep refs in sync
  pastRef.current = past;
  futureRef.current = future;

  const init = useCallback((data: T) => {
    currentRef.current = data;
    setPast([]);
    setFuture([]);
    pastRef.current = [];
    futureRef.current = [];
  }, []);

  const push = useCallback(
    (newData: T, label: string) => {
      if (currentRef.current === null) {
        currentRef.current = newData;
        return;
      }
      const entry = { data: currentRef.current, label };
      const next = [...pastRef.current, entry];
      if (next.length > maxSize) next.shift();
      setPast(next);
      pastRef.current = next;
      setFuture([]);
      futureRef.current = [];
      currentRef.current = newData;
    },
    [maxSize]
  );

  /** Swap the latest state in place (no new undo step), e.g. switching a fill between copy and series */
  const replace = useCallback((newData: T, label: string) => {
    currentRef.current = newData;
    if (pastRef.current.length === 0) return;
    const next = [...pastRef.current];
    next[next.length - 1] = { ...next[next.length - 1], label };
    setPast(next);
    pastRef.current = next;
  }, []);

  const undo = useCallback((): T | null => {
    if (pastRef.current.length === 0 || currentRef.current === null) return null;
    const next = [...pastRef.current];
    const entry = next.pop()!;
    const futureNext = [...futureRef.current, { data: currentRef.current, label: entry.label }];
    setPast(next);
    pastRef.current = next;
    setFuture(futureNext);
    futureRef.current = futureNext;
    currentRef.current = entry.data;
    return entry.data;
  }, []);

  const redo = useCallback((): T | null => {
    if (futureRef.current.length === 0 || currentRef.current === null) return null;
    const next = [...futureRef.current];
    const entry = next.pop()!;
    const pastNext = [...pastRef.current, { data: currentRef.current, label: entry.label }];
    setFuture(next);
    futureRef.current = next;
    setPast(pastNext);
    pastRef.current = pastNext;
    currentRef.current = entry.data;
    return entry.data;
  }, []);

  return {
    push,
    replace,
    undo,
    redo,
    init,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past.length > 0 ? past[past.length - 1].label : '',
    redoLabel: future.length > 0 ? future[future.length - 1].label : '',
  };
}
