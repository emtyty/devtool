import { format as prettyPrintSql } from 'sql-formatter';

// ── EF Core / APM Log SQL Extractor ─────────────────────────────────────────

/**
 * Detect and parse EF Core / APM log output containing SQL with parameters.
 *
 * Expected format (from APM / Elasticsearch logs):
 *   [Parameters=["@p1='val1', @p2='guid' (Nullable = false) (DbType = Object)"],
 *    CommandType='"Text"', CommandTimeout='30']"\n""SELECT ... @p1 ..."
 *
 * Returns the clean SQL with parameter values inlined, or `null` if the input
 * doesn't match the EF Core log pattern.
 */
export function parseEfCoreLog(raw: string): string | null {
  const trimmed = raw.trim();

  // Must start with [Parameters=
  if (!trimmed.startsWith('[Parameters=')) return null;

  // Extract the parameter list between [" and "]
  const paramStart = trimmed.indexOf('["');
  const paramEnd = trimmed.indexOf('"]');
  if (paramStart === -1 || paramEnd === -1) return null;

  const paramString = trimmed.substring(paramStart + 2, paramEnd);

  // Parse each @name='value', ignoring trailing annotations like (Nullable = false)
  const params = new Map<string, string>();
  const paramRegex = /(@[\w]+)='([^']*)'/g;
  let m;
  while ((m = paramRegex.exec(paramString)) !== null) {
    params.set(m[1], m[2]);
  }

  // Locate the SQL query after the metadata block  "]...CommandTimeout='N']
  // Then strip leading/trailing quotes, \n literals, and whitespace
  const closingBracket = trimmed.indexOf(']', paramEnd + 2);
  if (closingBracket === -1) return null;

  let sqlPart = trimmed.substring(closingBracket + 1);
  // Strip wrapping quotes and literal \n prefix
  sqlPart = sqlPart.replace(/^["\\n\s]+/, '').replace(/["]+$/, '');
  // Convert literal \n sequences to real newlines
  sqlPart = sqlPart.replace(/\\n/g, '\n');

  if (!sqlPart.trim()) return null;

  // Inline parameter values — sort by name length DESC so longer names match first
  // (e.g. @__p_10 before @__p_1)
  const sorted = [...params.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [name, value] of sorted) {
    if (!value) continue; // skip empty / table-valued params
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isNumeric = /^\d+(\.\d+)?$/.test(value);
    const replacement = isNumeric ? value : `'${value}'`;
    sqlPart = sqlPart.replace(new RegExp(escaped, 'g'), replacement);
  }

  return sqlPart.trim();
}

export enum SqlFormat {
  IN_CLAUSE = 'IN_CLAUSE',
  VALUES_LIST = 'VALUES_LIST',
  UNION_SELECT = 'UNION_SELECT',
  JSON_ARRAY = 'JSON_ARRAY',
  RAW_CSV = 'RAW_CSV',
}

export interface FormatterOptions {
  quotes: 'single' | 'double' | 'none';
  delimiter: string;
  upperCase: boolean;
  removeHyphens: boolean;
  removeDoubleQuotes: boolean;
  prettyPrint: boolean;
}

export interface ListToolsOptions {
  removeDuplicates: boolean;
  sort: 'none' | 'asc' | 'desc';
  naturalSort: boolean;
  trim: boolean;
  removeEmpty: boolean;
  caseSensitive: boolean;
}

/**
 * Parses a raw string of items separated by newlines, commas, semicolons, or tabs.
 */
export function parseItems(input: string): string[] {
  if (!input) return [];
  const parts = input.split(/[\n\r,;\t]+/);
  const items: string[] = [];
  parts.forEach(p => {
    p.trim().split(/\s+/).forEach(sp => {
      const clean = sp.trim();
      if (clean) items.push(clean);
    });
  });
  return Array.from(new Set(items));
}

export function formatItems(items: string[], format: SqlFormat, options: FormatterOptions): string {
  if (!items || items.length === 0) return '';

  const processed = items.map(item => {
    let result = item;
    if (options.removeHyphens) result = result.replace(/-/g, '');
    if (options.removeDoubleQuotes) result = result.replace(/"/g, '');
    if (options.upperCase) result = result.toUpperCase();
    const quote = options.quotes === 'single' ? "'" : options.quotes === 'double' ? '"' : '';
    return `${quote}${result}${quote}`;
  });

  let output = '';

  switch (format) {
    case SqlFormat.IN_CLAUSE:
      output = `IN (${processed.join(', ')})`;
      break;
    case SqlFormat.VALUES_LIST:
      output = `VALUES ${processed.map(p => `(${p})`).join(',\n')}`;
      break;
    case SqlFormat.UNION_SELECT:
      output = processed.map((p, i) => `SELECT ${p} AS item${i === processed.length - 1 ? '' : ' UNION ALL'}`).join('\n');
      break;
    case SqlFormat.JSON_ARRAY:
      return `[${processed.join(', ')}]`;
    case SqlFormat.RAW_CSV:
    default:
      return processed.join(options.delimiter || ', ');
  }

  const isSqlFormat = [SqlFormat.IN_CLAUSE, SqlFormat.VALUES_LIST, SqlFormat.UNION_SELECT].includes(format);
  if (options.prettyPrint && isSqlFormat) {
    try {
      let sqlToFormat = output;
      if (format === SqlFormat.IN_CLAUSE) {
        sqlToFormat = `SELECT * FROM t WHERE c ${output}`;
      } else if (format === SqlFormat.VALUES_LIST) {
        sqlToFormat = `INSERT INTO t (col) ${output}`;
      }
      const formatted = prettyPrintSql(sqlToFormat, { language: 'tsql' });
      if (format === SqlFormat.IN_CLAUSE) {
        const index = formatted.toUpperCase().indexOf('IN (');
        return index !== -1 ? formatted.substring(index) : formatted;
      } else if (format === SqlFormat.VALUES_LIST) {
        const index = formatted.toUpperCase().indexOf('VALUES');
        return index !== -1 ? formatted.substring(index) : formatted;
      }
      return formatted;
    } catch {
      return output;
    }
  }

  return output;
}

export function processListItems(input: string, options: ListToolsOptions): string {
  if (!input.trim()) return '';

  let items = input.split(/\r?\n/);
  if (options.trim) items = items.map(i => i.trim());
  if (options.removeEmpty) items = items.filter(i => i.length > 0);

  if (options.removeDuplicates) {
    if (options.caseSensitive) {
      items = Array.from(new Set(items));
    } else {
      const seen = new Set<string>();
      items = items.filter(i => {
        const lower = i.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    }
  }

  if (options.sort !== 'none') {
    const localeOptions = {
      numeric: options.naturalSort,
      sensitivity: options.caseSensitive ? ('variant' as const) : ('base' as const),
    };
    if (options.sort === 'asc') {
      items.sort((a, b) => a.localeCompare(b, undefined, localeOptions));
    } else {
      items.sort((a, b) => b.localeCompare(a, undefined, localeOptions));
    }
  }

  return items.join('\n');
}
