// ── Table Lens: structural (column/row) changes on an immutable table snapshot ──

import type { Row } from './tableLensUtils';

/**
 * Everything one undo step restores. `raw` is the as-loaded baseline (index-aligned with `rows`)
 * used to highlight modified cells, so structural changes must keep it in step.
 */
export interface TableSnapshot {
  rows: Row[];
  raw: Row[];
  columns: string[];
}

export type InsertSide = 'left' | 'right';

/** Error message for an invalid column name, or null when `name` is usable */
export function validateColumnName(name: string, columns: string[], current?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Column name cannot be empty';
  if (trimmed !== current && columns.includes(trimmed)) return `A column named "${trimmed}" already exists`;
  return null;
}

/** "Column 7"-style name for a new column, skipping names already taken */
export function nextColumnName(columns: string[]): string {
  const taken = new Set(columns);
  let n = columns.length + 1;
  while (taken.has(`Column ${n}`)) n++;
  return `Column ${n}`;
}

/** `base`, or `base_2`, `base_3`… if taken */
export function dedupeColumnName(columns: string[], base: string): string {
  const taken = new Set(columns);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function renameRowKey(row: Row, from: string, to: string): Row {
  if (!(from in row)) return row;
  const { [from]: value, ...rest } = row;
  return { ...rest, [to]: value };
}

export function renameColumn(s: TableSnapshot, from: string, to: string): TableSnapshot {
  if (from === to) return s;
  return {
    rows: s.rows.map((r) => renameRowKey(r, from, to)),
    raw: s.raw.map((r) => renameRowKey(r, from, to)),
    columns: s.columns.map((c) => (c === from ? to : c)),
  };
}

/** Rename a key in a column-keyed record; returns the same object when the key is absent */
export function renameRecordKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  if (!(from in record) || from === to) return record;
  const { [from]: value, ...rest } = record;
  return { ...rest, [to]: value };
}

/**
 * Insert column `name` at `index`. Cells are empty, or copied from `source` when duplicating.
 * The baseline gets the same values so a new column doesn't count as modified until edited.
 */
export function insertColumn(s: TableSnapshot, name: string, index: number, source?: string): TableSnapshot {
  const columns = [...s.columns];
  columns.splice(Math.max(0, Math.min(index, columns.length)), 0, name);
  const add = (r: Row): Row => ({ ...r, [name]: source ? (r[source] ?? '') : '' });
  return { rows: s.rows.map(add), raw: s.raw.map(add), columns };
}

export function removeColumn(s: TableSnapshot, name: string): TableSnapshot {
  const omit = (r: Row): Row => {
    const rest = { ...r };
    delete rest[name];
    return rest;
  };
  return { rows: s.rows.map(omit), raw: s.raw.map(omit), columns: s.columns.filter((c) => c !== name) };
}

/** Place `name` beside `anchor` in a display-order list (appended when the anchor isn't in it) */
export function insertNextTo(list: string[], name: string, anchor: string, side: InsertSide): string[] {
  const i = list.indexOf(anchor);
  if (i < 0) return [...list, name];
  const next = [...list];
  next.splice(side === 'left' ? i : i + 1, 0, name);
  return next;
}

/** Display order: the user's drag order first, then any columns it doesn't mention (e.g. newly added) */
export function orderColumns(columns: string[], colOrder: string[]): string[] {
  if (colOrder.length === 0) return columns;
  const colSet = new Set(columns);
  const ordered = colOrder.filter((c) => colSet.has(c));
  const orderedSet = new Set(ordered);
  return [...ordered, ...columns.filter((c) => !orderedSet.has(c))];
}

export function removeRows(s: TableSnapshot, rowIdx: Set<number>): TableSnapshot {
  const keep = (_r: Row, i: number) => !rowIdx.has(i);
  return { rows: s.rows.filter(keep), raw: s.raw.filter(keep), columns: s.columns };
}

/** Copies of the given rows, inserted right after the last of them */
export function duplicateRows(s: TableSnapshot, rowIdx: number[]): TableSnapshot {
  if (rowIdx.length === 0) return s;
  const sorted = [...rowIdx].sort((a, b) => a - b);
  const insertAt = sorted[sorted.length - 1] + 1;
  const dup = (list: Row[]) => {
    const next = [...list];
    next.splice(insertAt, 0, ...sorted.map((i) => ({ ...list[i] })));
    return next;
  };
  return { rows: dup(s.rows), raw: dup(s.raw), columns: s.columns };
}

/** Set every row index in `ids` selected (or deselected), e.g. for a Shift+click range */
export function selectRange(selected: Set<number>, ids: number[], select: boolean): Set<number> {
  const next = new Set(selected);
  for (const id of ids) {
    if (select) next.add(id);
    else next.delete(id);
  }
  return next;
}
