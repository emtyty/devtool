import { describe, it, expect } from 'vitest';
import { applyPaste, parseClipboardGrid, planPaste, toClipboardCell } from '../utils/tableLensPaste';
import type { TableSnapshot } from '../utils/tableLensColumns';

describe('parseClipboardGrid', () => {
  it('splits a plain list into one cell per line', () => {
    expect(parseClipboardGrid('a\nb\nc')).toEqual([['a'], ['b'], ['c']]);
  });

  it('handles CRLF and drops the trailing newline spreadsheets add', () => {
    expect(parseClipboardGrid('a\r\nb\r\n')).toEqual([['a'], ['b']]);
  });

  it('drops trailing blank lines but keeps blank lines in the middle', () => {
    expect(parseClipboardGrid('a\n\nb\n\n\n')).toEqual([['a'], [''], ['b']]);
  });

  it('splits tab-separated cells', () => {
    expect(parseClipboardGrid('1\tx\n2\ty\n')).toEqual([
      ['1', 'x'],
      ['2', 'y'],
    ]);
  });

  it('keeps empty cells between tabs', () => {
    expect(parseClipboardGrid('a\t\tc')).toEqual([['a', '', 'c']]);
  });

  it('reads quoted cells with newlines, tabs and escaped quotes', () => {
    expect(parseClipboardGrid('"line 1\nline 2"\tb\n"say ""hi"""\t"x\ty"')).toEqual([
      ['line 1\nline 2', 'b'],
      ['say "hi"', 'x\ty'],
    ]);
  });

  it('keeps quotes that are not at the start of a cell', () => {
    expect(parseClipboardGrid('5" screen')).toEqual([['5" screen']]);
  });

  it('returns nothing for empty text', () => {
    expect(parseClipboardGrid('')).toEqual([]);
    expect(parseClipboardGrid('\n\n')).toEqual([]);
  });
});

describe('toClipboardCell', () => {
  it('leaves simple values as-is', () => {
    expect(toClipboardCell('hello')).toBe('hello');
  });

  it('quotes values a spreadsheet would otherwise split', () => {
    expect(toClipboardCell('a\nb')).toBe('"a\nb"');
    expect(toClipboardCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('round-trips through parseClipboardGrid', () => {
    const value = 'multi\nline "quoted"\ttab';
    expect(parseClipboardGrid(toClipboardCell(value))).toEqual([[value]]);
  });
});

describe('planPaste', () => {
  const displayRows = [4, 2, 0, 1, 3]; // on-screen order after sorting

  it('targets rows in on-screen order from the start position', () => {
    const plan = planPaste([['a'], ['b']], displayRows, 1, ['x', 'y'], 0, 5, false);
    expect(plan.rowTargets).toEqual([2, 0]);
    expect(plan.colTargets).toEqual(['x']);
    expect(plan.newRows).toBe(0);
  });

  it('skips lines past the end when adding rows is off', () => {
    const plan = planPaste([['a'], ['b'], ['c']], displayRows, 3, ['x'], 0, 5, false);
    expect(plan.rowTargets).toEqual([1, 3]);
    expect(plan.skippedRows).toBe(1);
  });

  it('appends new rows past the end when adding rows is on', () => {
    const plan = planPaste([['a'], ['b'], ['c']], displayRows, 3, ['x'], 0, 5, true);
    expect(plan.rowTargets).toEqual([1, 3, 5]);
    expect(plan.newRows).toBe(1);
    expect(plan.skippedRows).toBe(0);
  });

  it('spreads tab-separated cells to the right and reports what does not fit', () => {
    const plan = planPaste([['1', '2', '3']], displayRows, 0, ['x', 'y'], 1, 5, false);
    expect(plan.colTargets).toEqual(['y']);
    expect(plan.skippedCols).toBe(2);
  });
});

describe('applyPaste', () => {
  const snap = (): TableSnapshot => ({
    rows: [
      { x: '1', y: 'a' },
      { x: '2', y: 'b' },
    ],
    raw: [
      { x: '1', y: 'a' },
      { x: '2', y: 'b' },
    ],
    columns: ['x', 'y'],
  });

  it('writes values into the planned cells', () => {
    const grid = [
      ['9', 'z'],
      ['8', 'w'],
    ];
    const plan = planPaste(grid, [0, 1], 0, ['x', 'y'], 0, 2, false);
    const result = applyPaste(snap(), grid, plan);
    expect(result.rows).toEqual([
      { x: '9', y: 'z' },
      { x: '8', y: 'w' },
    ]);
  });

  it('appends blank rows to data and baseline before filling them', () => {
    const grid = [['a'], ['b'], ['new']];
    const plan = planPaste(grid, [0, 1], 0, ['y'], 0, 2, true);
    const result = applyPaste(snap(), grid, plan);
    expect(result.rows[2]).toEqual({ x: '', y: 'new' });
    expect(result.raw[2]).toEqual({ x: '', y: '' });
  });

  it('keeps untouched rows and short lines intact', () => {
    const s = snap();
    const grid = [['only-x']];
    const plan = planPaste(grid, [1, 0], 0, ['x', 'y'], 0, 2, false);
    const result = applyPaste(s, grid, plan);
    expect(result.rows[0]).toBe(s.rows[0]);
    expect(result.rows[1]).toEqual({ x: 'only-x', y: 'b' });
  });
});
