// ── Table Lens: serialize the table back into the format it was opened from ──

import type { Row } from './tableLensUtils';

export type SaveFormat = 'csv' | 'tsv' | 'json' | 'xlsx' | 'xls';

/** What we remember about the opened file so saving can match it */
export interface SaveSource {
  /** Delimiter detected when the CSV was parsed (e.g. ";" in many European exports) */
  delimiter?: string;
  /** The original workbook — re-used so sheets other than the first are kept */
  workbook?: ArrayBuffer;
  /** Name of the sheet Table Lens loaded */
  sheetName?: string;
}

export const SAVE_MIME: Record<SaveFormat, string> = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

/** Format implied by the file extension (unknown extensions save as CSV) */
export function getSaveFormat(fileName: string): SaveFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'tsv' || ext === 'tab') return 'tsv';
  if (ext === 'json' || ext === 'xlsx' || ext === 'xls') return ext;
  return 'csv';
}

/** Warning to confirm before overwriting a file whose format Table Lens can't round-trip exactly */
export function getSaveWarning(format: SaveFormat): string | null {
  if (format === 'json') {
    return 'Table Lens edits JSON as text. Saving writes every value as a string — numbers, true/false, null and nested objects will not keep their type. Continue?';
  }
  if (format === 'xlsx' || format === 'xls') {
    return 'Saving rewrites the first sheet with the table values. Cell formatting, formulas and column widths on that sheet will be lost (other sheets are kept). Continue?';
  }
  return null;
}

const PLAIN_NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** Spreadsheet cell value: real numbers stay numbers; codes like "007" stay text */
function toSheetValue(value: string): string | number {
  return PLAIN_NUMBER_RE.test(value) && value.length <= 15 ? Number(value) : value;
}

function toMatrix(columns: string[], rows: Row[]): string[][] {
  return rows.map((r) => columns.map((c) => r[c] ?? ''));
}

async function toDelimited(columns: string[], rows: Row[], delimiter: string): Promise<string> {
  const Papa = await import('papaparse');
  // Minimal quoting (only cells that need it) so the saved file diffs cleanly against the original
  return Papa.default.unparse({ fields: columns, data: toMatrix(columns, rows) }, { delimiter, newline: '\r\n' });
}

async function toWorkbook(
  columns: string[],
  rows: Row[],
  format: 'xlsx' | 'xls',
  source: SaveSource
): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => columns.map((c) => toSheetValue(r[c] ?? '')))]);
  const wb = source.workbook ? XLSX.read(source.workbook, { type: 'array' }) : XLSX.utils.book_new();
  const sheetName = source.sheetName ?? wb.SheetNames[0] ?? 'Sheet1';
  if (wb.SheetNames.includes(sheetName)) wb.Sheets[sheetName] = sheet;
  else XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  return XLSX.write(wb, { bookType: format === 'xls' ? 'biff8' : 'xlsx', type: 'array' });
}

/** Serialize all rows, in `columns` order, as a file of the given format */
export async function serializeTable(
  columns: string[],
  rows: Row[],
  format: SaveFormat,
  source: SaveSource = {}
): Promise<Blob> {
  const type = SAVE_MIME[format];
  if (format === 'xlsx' || format === 'xls')
    return new Blob([await toWorkbook(columns, rows, format, source)], { type });
  if (format === 'json') {
    const objects = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? ''])));
    return new Blob([JSON.stringify(objects, null, 2)], { type });
  }
  const delimiter = format === 'tsv' ? '\t' : (source.delimiter ?? ',');
  return new Blob([await toDelimited(columns, rows, delimiter)], { type });
}
