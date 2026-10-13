import { describe, it, expect } from 'vitest';
import { fillRangePositions, fillColumn, setColumnValues, moveCell, type Row } from '../utils/tableLensUtils';

describe('fillRangePositions', () => {
  it('returns null when the drag ends on the source', () => {
    expect(fillRangePositions(3, 3)).toBeNull();
  });

  it('excludes the source when dragging down', () => {
    expect(fillRangePositions(2, 5)).toEqual([3, 5]);
  });

  it('excludes the source when dragging up', () => {
    expect(fillRangePositions(5, 1)).toEqual([1, 4]);
  });
});

describe('fillColumn', () => {
  const data: Row[] = [
    { a: '1', b: 'x' },
    { a: '2', b: 'y' },
    { a: '3', b: 'z' },
  ];

  it('sets the column on target rows only', () => {
    const result = fillColumn(data, [0, 2], 'b', 'new');
    expect(result.map((r) => r.b)).toEqual(['new', 'y', 'new']);
    expect(result.map((r) => r.a)).toEqual(['1', '2', '3']);
  });

  it('keeps identity of untouched and already-equal rows', () => {
    const result = fillColumn(data, [0, 1], 'b', 'x');
    expect(result[0]).toBe(data[0]);
    expect(result[1]).not.toBe(data[1]);
    expect(result[2]).toBe(data[2]);
  });

  it('returns the same array when there are no targets', () => {
    expect(fillColumn(data, [], 'b', 'new')).toBe(data);
  });

  it('does not mutate the input', () => {
    fillColumn(data, [1], 'a', 'changed');
    expect(data[1].a).toBe('2');
  });
});

describe('setColumnValues', () => {
  const data: Row[] = [{ a: '1' }, { a: '2' }, { a: '3' }];

  it('writes each value to its target row, in target order', () => {
    const result = setColumnValues(data, [2, 0], 'a', ['x', 'y']);
    expect(result.map((r) => r.a)).toEqual(['y', '2', 'x']);
  });

  it('keeps identity of rows whose value is unchanged', () => {
    const result = setColumnValues(data, [0], 'a', ['1']);
    expect(result[0]).toBe(data[0]);
  });
});

describe('moveCell', () => {
  it('moves within bounds', () => {
    expect(moveCell(2, 1, 1, 1, 10, 5)).toEqual({ pos: 3, colIdx: 2 });
  });

  it('clamps at the top-left edge', () => {
    expect(moveCell(0, 0, -1, -1, 10, 5)).toEqual({ pos: 0, colIdx: 0 });
  });

  it('clamps at the bottom-right edge', () => {
    expect(moveCell(9, 4, 1, 1, 10, 5)).toEqual({ pos: 9, colIdx: 4 });
  });
});
