// ── Table Lens: paste a block of values (clipboard / paste dialog) into the grid ──

import type { Row } from './tableLensUtils';
import type { TableSnapshot } from './tableLensColumns';

/**
 * Parse clipboard text into rows × cells. Handles TSV as Excel / Google Sheets copy it:
 * tab-separated cells, quoted cells containing tabs/newlines ("" = literal quote),
 * CRLF or LF line endings, and the trailing newline they append.
 */
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else inQuotes = false;
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop blank lines at the end (trailing newlines from editors), keep blanks in the middle
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

/** Format one cell for the clipboard so spreadsheets read it back as a single cell */
export function toClipboardCell(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface PastePlan {
  /** Data row index for each grid line that will be written */
  rowTargets: number[];
  /** Column name for each grid cell position that will be written */
  colTargets: string[];
  /** How many of `rowTargets` are new rows appended to the table */
  newRows: number;
  /** Grid lines that didn't fit (no rows left and adding rows is off) */
  skippedRows: number;
  /** Grid cells per line that didn't fit (ran out of columns to the right) */
  skippedCols: number;
}

/**
 * Map a pasted grid onto the table, starting at on-screen row `startPos` and column `startColIdx`.
 * `displayRows` are data indices in on-screen order (so paste follows the current sort/filter);
 * lines past the last row become new rows only when `addRows` is set.
 */
export function planPaste(
  grid: string[][],
  displayRows: number[],
  startPos: number,
  visibleCols: string[],
  startColIdx: number,
  dataLength: number,
  addRows: boolean
): PastePlan {
  const height = grid.length;
  const width = grid.reduce((max, line) => Math.max(max, line.length), 0);
  const existing = displayRows.slice(Math.max(0, startPos), Math.max(0, startPos) + height);
  const missing = height - existing.length;
  const newRows = addRows ? missing : 0;
  const added = Array.from({ length: newRows }, (_, k) => dataLength + k);
  const colTargets = startColIdx < 0 ? [] : visibleCols.slice(startColIdx, startColIdx + width);
  return {
    rowTargets: [...existing, ...added],
    colTargets,
    newRows,
    skippedRows: missing - newRows,
    skippedCols: width - colTargets.length,
  };
}

/** Write the grid into the snapshot per `plan`. New rows start blank in both data and baseline. */
export function applyPaste(s: TableSnapshot, grid: string[][], plan: PastePlan): TableSnapshot {
  let { rows, raw } = s;
  if (plan.newRows > 0) {
    const blank = (): Row => Object.fromEntries(s.columns.map((c) => [c, '']));
    rows = [...rows, ...Array.from({ length: plan.newRows }, blank)];
    raw = [...raw, ...Array.from({ length: plan.newRows }, blank)];
  }
  const lineByRow = new Map(plan.rowTargets.map((rowIdx, line) => [rowIdx, line]));
  rows = rows.map((row, i) => {
    const line = lineByRow.get(i);
    if (line === undefined) return row;
    const cells = grid[line];
    let next = row;
    plan.colTargets.forEach((col, c) => {
      const value = cells[c];
      if (value === undefined || next[col] === value) return;
      if (next === row) next = { ...row };
      next[col] = value;
    });
    return next;
  });
  return { rows, raw, columns: s.columns };
}
