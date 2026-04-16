import { useState, useCallback, useRef } from 'react';
import type { Row } from './tableLensUtils';

interface HistoryEntry {
  data: Row[];
  label: string;
}

export function useHistory(maxSize = 50) {
  const [past, setPast] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const currentRef = useRef<Row[]>([]);
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);

  // Keep refs in sync
  pastRef.current = past;
  futureRef.current = future;

  const init = useCallback((data: Row[]) => {
    currentRef.current = data;
    setPast([]);
    setFuture([]);
    pastRef.current = [];
    futureRef.current = [];
  }, []);

  const push = useCallback((newData: Row[], label: string) => {
    const entry = { data: currentRef.current, label };
    const next = [...pastRef.current, entry];
    if (next.length > maxSize) next.shift();
    setPast(next);
    pastRef.current = next;
    setFuture([]);
    futureRef.current = [];
    currentRef.current = newData;
  }, [maxSize]);

  const undo = useCallback((): Row[] | null => {
    if (pastRef.current.length === 0) return null;
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

  const redo = useCallback((): Row[] | null => {
    if (futureRef.current.length === 0) return null;
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
    undo,
    redo,
    init,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoLabel: past.length > 0 ? past[past.length - 1].label : '',
    redoLabel: future.length > 0 ? future[future.length - 1].label : '',
  };
}
