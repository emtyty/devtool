import { describe, it, expect } from 'vitest';
import {
  dedupeColumnName,
  duplicateRows,
  insertColumn,
  insertNextTo,
  nextColumnName,
  orderColumns,
  removeColumn,
  removeRows,
  renameColumn,
  renameRecordKey,
  selectRange,
  validateColumnName,
  type TableSnapshot,
} from '../utils/tableLensColumns';

const snap = (): TableSnapshot => ({
  rows: [
    { id: '1', name: 'a' },
    { id: '2', name: 'b-edited' },
  ],
  raw: [
    { id: '1', name: 'a' },
    { id: '2', name: 'b' },
  ],
  columns: ['id', 'name'],
});

describe('validateColumnName', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(validateColumnName('', ['a'])).toMatch(/empty/);
    expect(validateColumnName('   ', ['a'])).toMatch(/empty/);
  });

  it('rejects a name used by another column', () => {
    expect(validateColumnName('a', ['a', 'b'], 'b')).toMatch(/already exists/);
    expect(validateColumnName(' a ', ['a', 'b'])).toMatch(/already exists/);
  });

  it('accepts keeping the current name and new unique names', () => {
    expect(validateColumnName('a', ['a', 'b'], 'a')).toBeNull();
    expect(validateColumnName('c', ['a', 'b'])).toBeNull();
  });
});

describe('column naming', () => {
  it('nextColumnName skips taken names', () => {
    expect(nextColumnName(['a', 'b'])).toBe('Column 3');
    expect(nextColumnName(['a', 'Column 2'])).toBe('Column 3');
    expect(nextColumnName(['Column 2', 'Column 3'])).toBe('Column 4');
  });

  it('dedupeColumnName adds a numeric suffix when needed', () => {
    expect(dedupeColumnName(['a'], 'a_copy')).toBe('a_copy');
    expect(dedupeColumnName(['a', 'a_copy'], 'a_copy')).toBe('a_copy_2');
    expect(dedupeColumnName(['a_copy', 'a_copy_2'], 'a_copy')).toBe('a_copy_3');
  });
});

describe('renameColumn', () => {
  it('renames the key in rows, baseline and column list', () => {
    const result = renameColumn(snap(), 'name', 'label');
    expect(result.columns).toEqual(['id', 'label']);
    expect(result.rows[1]).toEqual({ id: '2', label: 'b-edited' });
    expect(result.raw[1]).toEqual({ id: '2', label: 'b' });
  });

  it('returns the same snapshot for a no-op rename', () => {
    const s = snap();
    expect(renameColumn(s, 'id', 'id')).toBe(s);
  });
});

describe('renameRecordKey', () => {
  it('moves the value to the new key', () => {
    expect(renameRecordKey({ a: 1, b: 2 }, 'a', 'z')).toEqual({ b: 2, z: 1 });
  });

  it('returns the same object when the key is absent', () => {
    const rec = { a: 1 };
    expect(renameRecordKey(rec, 'x', 'y')).toBe(rec);
  });
});

describe('insertColumn / removeColumn', () => {
  it('inserts an empty column at the index in rows and baseline', () => {
    const result = insertColumn(snap(), 'new', 1);
    expect(result.columns).toEqual(['id', 'new', 'name']);
    expect(result.rows.every((r) => r.new === '')).toBe(true);
    expect(result.raw.every((r) => r.new === '')).toBe(true);
  });

  it('copies values from a source column (rows from rows, baseline from baseline)', () => {
    const result = insertColumn(snap(), 'name_copy', 2, 'name');
    expect(result.rows[1].name_copy).toBe('b-edited');
    expect(result.raw[1].name_copy).toBe('b');
  });

  it('clamps out-of-range indexes', () => {
    expect(insertColumn(snap(), 'x', 99).columns).toEqual(['id', 'name', 'x']);
  });

  it('removes a column everywhere', () => {
    const result = removeColumn(snap(), 'name');
    expect(result.columns).toEqual(['id']);
    expect(result.rows[0]).toEqual({ id: '1' });
    expect(result.raw[1]).toEqual({ id: '2' });
  });
});

describe('insertNextTo / orderColumns', () => {
  it('inserts beside the anchor', () => {
    expect(insertNextTo(['a', 'b', 'c'], 'x', 'b', 'left')).toEqual(['a', 'x', 'b', 'c']);
    expect(insertNextTo(['a', 'b', 'c'], 'x', 'b', 'right')).toEqual(['a', 'b', 'x', 'c']);
    expect(insertNextTo(['a'], 'x', 'missing', 'right')).toEqual(['a', 'x']);
  });

  it('keeps drag order and appends columns it does not mention', () => {
    expect(orderColumns(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
    expect(orderColumns(['a', 'b', 'c', 'd'], ['c', 'a', 'gone'])).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('row structure', () => {
  it('removes rows from data and baseline together', () => {
    const result = removeRows(snap(), new Set([0]));
    expect(result.rows).toHaveLength(1);
    expect(result.raw[0].id).toBe('2');
  });

  it('duplicates rows after the last selected one, in both data and baseline', () => {
    const result = duplicateRows(snap(), [0]);
    expect(result.rows.map((r) => r.id)).toEqual(['1', '1', '2']);
    expect(result.raw.map((r) => r.id)).toEqual(['1', '1', '2']);
  });
});

describe('selectRange', () => {
  it('selects or deselects every id in the range without touching others', () => {
    const start = new Set([1, 9]);
    expect([...selectRange(start, [3, 4, 5], true)].sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 9]);
    expect([...selectRange(new Set([3, 4, 9]), [3, 4], false)]).toEqual([9]);
    expect([...start]).toEqual([1, 9]);
  });
});
