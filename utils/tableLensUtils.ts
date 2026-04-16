// ── Table Lens — shared types & utilities ────────────────────────

export type Row = Record<string, string>;

export type CFRule = { id: string; col: string; op: string; value: string; color: string };

export type SortKey = { col: string; dir: 'asc' | 'desc' };

export const CF_COLORS = [
  { label: 'Red',    swatch: '#ef4444', cell: 'rgba(239,68,68,0.15)' },
  { label: 'Orange', swatch: '#f97316', cell: 'rgba(249,115,22,0.15)' },
  { label: 'Yellow', swatch: '#eab308', cell: 'rgba(234,179,8,0.22)' },
  { label: 'Green',  swatch: '#22c55e', cell: 'rgba(34,197,94,0.15)' },
  { label: 'Blue',   swatch: '#3b82f6', cell: 'rgba(59,130,246,0.15)' },
  { label: 'Purple', swatch: '#a855f7', cell: 'rgba(168,85,247,0.15)' },
  { label: 'Pink',   swatch: '#ec4899', cell: 'rgba(236,72,153,0.15)' },
  { label: 'Teal',   swatch: '#14b8a6', cell: 'rgba(20,184,166,0.15)' },
];

export const CF_OPS = [
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'equals',       label: '= equals' },
  { value: 'not_equals',   label: '≠ not equals' },
  { value: 'starts_with',  label: 'starts with' },
  { value: 'ends_with',    label: 'ends with' },
  { value: 'gt',           label: '> greater than' },
  { value: 'lt',           label: '< less than' },
  { value: 'gte',          label: '≥ greater or equal' },
  { value: 'lte',          label: '≤ less or equal' },
  { value: 'is_empty',     label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

export function matchCFRule(cellVal: string, op: string, ruleVal: string): boolean {
  const cv = cellVal.toLowerCase(), rv = ruleVal.toLowerCase();
  const num = Number(cellVal), rnum = Number(ruleVal);
  const isNum = !isNaN(num) && cellVal !== '', rIsNum = !isNaN(rnum) && ruleVal !== '';
  switch (op) {
    case 'contains':     return cv.includes(rv);
    case 'not_contains': return !cv.includes(rv);
    case 'equals':       return cv === rv;
    case 'not_equals':   return cv !== rv;
    case 'starts_with':  return cv.startsWith(rv);
    case 'ends_with':    return cv.endsWith(rv);
    case 'gt':           return isNum && rIsNum && num > rnum;
    case 'lt':           return isNum && rIsNum && num < rnum;
    case 'gte':          return isNum && rIsNum && num >= rnum;
    case 'lte':          return isNum && rIsNum && num <= rnum;
    case 'is_empty':     return cellVal === '';
    case 'is_not_empty': return cellVal !== '';
    default:             return false;
  }
}

export function toCSV(cols: string[], rows: Row[]): string {
  const e = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.map(e).join(','), ...rows.map(r => cols.map(c => e(r[c])).join(','))].join('\n');
}

export function toTSV(cols: string[], rows: Row[]): string {
  const e = (v: string) => String(v ?? '').replace(/\t/g, ' ');
  return [cols.map(e).join('\t'), ...rows.map(r => cols.map(c => e(r[c])).join('\t'))].join('\n');
}

export function toJSON(cols: string[], rows: Row[]): string {
  const filtered = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? ''])));
  return JSON.stringify(filtered, null, 2);
}

export type ExportFormat = 'csv' | 'tsv' | 'json';

export function downloadFile(name: string, content: string, format: ExportFormat) {
  const mimeMap: Record<ExportFormat, string> = {
    csv: 'text/csv;charset=utf-8;',
    tsv: 'text/tab-separated-values;charset=utf-8;',
    json: 'application/json;charset=utf-8;',
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mimeMap[format] }));
  a.download = name;
  a.click();
}

export function exportData(cols: string[], rows: Row[], baseName: string, suffix: string, format: ExportFormat) {
  const ext = format === 'json' ? 'json' : format === 'tsv' ? 'tsv' : 'csv';
  const content = format === 'json' ? toJSON(cols, rows) : format === 'tsv' ? toTSV(cols, rows) : toCSV(cols, rows);
  downloadFile(`${baseName}${suffix}.${ext}`, content, format);
}

/** Parse a JSON array of objects into columns + rows */
export function parseJSON(text: string): { columns: string[]; rows: Row[] } | null {
  try {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : null;
    if (!arr || arr.length === 0 || typeof arr[0] !== 'object') return null;
    const columns = Object.keys(arr[0]);
    const rows: Row[] = arr.map((item: Record<string, unknown>) =>
      Object.fromEntries(columns.map(c => [c, String(item[c] ?? '')])) as Row
    );
    return { columns, rows };
  } catch {
    return null;
  }
}

// ── Summary / Aggregation ────────────────────────────────────────

export interface ColumnSummary {
  count: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  isNumeric: boolean;
}

export function computeSummary(col: string, rows: Row[]): ColumnSummary {
  let count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let numericCount = 0;

  for (const row of rows) {
    const v = row[col];
    if (v !== undefined && v !== '') {
      count++;
      const n = Number(v);
      if (!isNaN(n)) {
        numericCount++;
        sum += n;
        if (n < min) min = n;
        if (n > max) max = n;
      }
    }
  }

  const isNumeric = numericCount > 0 && numericCount >= count * 0.5;
  return {
    count,
    sum: isNumeric ? sum : null,
    avg: isNumeric && numericCount > 0 ? sum / numericCount : null,
    min: isNumeric && min !== Infinity ? min : null,
    max: isNumeric && max !== -Infinity ? max : null,
    isNumeric,
  };
}

// ── Find & Replace ───────────────────────────────────────────────

export interface FindOptions {
  isRegex: boolean;
  caseSensitive: boolean;
  columnScope?: string; // empty = all columns
}

/** Returns a Set of "rowIdx:col" keys for cells that match the query */
export function findMatches(
  rows: Row[],
  columns: string[],
  query: string,
  opts: FindOptions,
): Set<string> {
  const matches = new Set<string>();
  if (!query) return matches;

  const cols = opts.columnScope ? [opts.columnScope] : columns;
  let regex: RegExp | null = null;

  if (opts.isRegex) {
    try {
      regex = new RegExp(query, opts.caseSensitive ? 'g' : 'gi');
    } catch {
      return matches; // invalid regex — no matches
    }
  }

  const lowerQuery = opts.caseSensitive ? query : query.toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    for (const col of cols) {
      const cell = String(rows[i][col] ?? '');
      const hit = regex
        ? regex.test(cell)
        : (opts.caseSensitive ? cell : cell.toLowerCase()).includes(lowerQuery);
      if (hit) matches.add(`${i}:${col}`);
      if (regex) regex.lastIndex = 0; // reset stateful regex
    }
  }

  return matches;
}

/** Replace all matches in data, returns new data array */
export function replaceAll(
  data: Row[],
  columns: string[],
  query: string,
  replacement: string,
  opts: FindOptions,
): Row[] {
  if (!query) return data;

  const cols = opts.columnScope ? [opts.columnScope] : columns;
  let regex: RegExp;

  if (opts.isRegex) {
    try {
      regex = new RegExp(query, opts.caseSensitive ? 'g' : 'gi');
    } catch {
      return data;
    }
  } else {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, opts.caseSensitive ? 'g' : 'gi');
  }

  return data.map(row => {
    let changed = false;
    const newRow = { ...row };
    for (const col of cols) {
      const val = String(row[col] ?? '');
      const replaced = val.replace(regex, replacement);
      if (replaced !== val) {
        newRow[col] = replaced;
        changed = true;
      }
    }
    return changed ? newRow : row;
  });
}

// ── Multi-column sort ────────────────────────────────────────────

export function multiSort<T extends { row: Row }>(items: T[], sortKeys: SortKey[]): T[] {
  if (sortKeys.length === 0) return items;
  return [...items].sort((a, b) => {
    for (const { col, dir } of sortKeys) {
      const av = String(a.row[col] ?? '');
      const bv = String(b.row[col] ?? '');
      const an = Number(av), bn = Number(bv);
      const cmp = !isNaN(an) && !isNaN(bn) && av !== '' && bv !== ''
        ? an - bn
        : av.localeCompare(bv);
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}
