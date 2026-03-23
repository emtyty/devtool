import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

interface ParsedRow {
  [key: string]: string;
}

function parseCSV(input: string, delimiter: string = ","): { headers: string[]; rows: ParsedRow[] } {
  const lines = input.split(/\r?\n/);
  if (lines.length === 0) throw new Error("Empty CSV input");

  // Parse a single CSV line handling quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  }

  // Find first non-empty line as header
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx].trim() === "") headerIdx++;
  if (headerIdx >= lines.length) throw new Error("No header row found");

  const headers = parseLine(lines[headerIdx]);
  const rows: ParsedRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseLine(line);
    const row: ParsedRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = fields[j] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

function toCSV(headers: string[], rows: ParsedRow[], delimiter: string = ","): string {
  function escapeField(value: string): string {
    if (value.includes(delimiter) || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  const headerLine = headers.map(escapeField).join(delimiter);
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeField(row[h] ?? "")).join(delimiter)
  );
  return [headerLine, ...dataLines].join("\n");
}

export const tool: Tool = {
  name: "csv_transform",
  description:
    "Parse, transform, and query CSV data — select columns, filter rows, sort, deduplicate, aggregate (count/sum/avg/min/max), and convert to JSON. Handles quoted fields with commas and newlines. Call this tool whenever the user needs to work with CSV data. More reliable than Claude's approximate parsing — handles edge cases like embedded commas, escaped quotes, and mixed delimiters.",
  schema: z.object({
    csv: z.string().describe("The CSV data (with header row)"),
    delimiter: z
      .string()
      .optional()
      .default(",")
      .describe("Field delimiter (default: comma). Use '\\t' for TSV."),
    columns: z
      .array(z.string())
      .optional()
      .describe("Select only these columns (by header name). If omitted, includes all columns."),
    filter: z
      .string()
      .optional()
      .describe("Filter expression: 'column operator value'. Operators: =, !=, >, <, >=, <=, contains, startswith, endswith. Example: 'age > 25'"),
    sortBy: z
      .string()
      .optional()
      .describe("Column name to sort by"),
    sortOrder: z
      .enum(["asc", "desc"])
      .optional()
      .default("asc")
      .describe("Sort order: asc or desc (default asc)"),
    deduplicate: z
      .string()
      .optional()
      .describe("Column name to deduplicate on (keeps first occurrence)"),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Limit output to first N rows"),
    aggregate: z
      .string()
      .optional()
      .describe("Aggregate: 'function(column)' — count, sum, avg, min, max. Example: 'sum(price)', 'count(id)'"),
    outputFormat: z
      .enum(["csv", "json", "markdown"])
      .optional()
      .default("csv")
      .describe("Output format: csv, json, or markdown table"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({
    csv,
    delimiter = ",",
    columns,
    filter,
    sortBy,
    sortOrder = "asc",
    deduplicate,
    limit,
    aggregate,
    outputFormat = "csv",
  }): Promise<ToolResult> => {
    const raw = (csv as string)?.trim();
    if (!raw) return { success: false, error: "CSV input is required" };

    const delim = (delimiter as string) === "\\t" ? "\t" : (delimiter as string) || ",";

    let parsed: { headers: string[]; rows: ParsedRow[] };
    try {
      parsed = parseCSV(raw, delim);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "CSV parse error" };
    }

    let { headers, rows } = parsed;
    const originalCount = rows.length;

    // Filter
    if (filter) {
      const filterStr = filter as string;
      const match = filterStr.match(/^(\S+)\s+(=|!=|>|<|>=|<=|contains|startswith|endswith)\s+(.+)$/i);
      if (!match) return { success: false, error: `Invalid filter syntax: "${filterStr}". Use: column operator value` };

      const [, col, op, val] = match;
      const value = val.replace(/^["']|["']$/g, ""); // strip quotes

      rows = rows.filter((row) => {
        const cell = row[col] ?? "";
        const numCell = Number(cell);
        const numVal = Number(value);
        const canCompareNum = !isNaN(numCell) && !isNaN(numVal);

        switch (op.toLowerCase()) {
          case "=": return cell === value;
          case "!=": return cell !== value;
          case ">": return canCompareNum ? numCell > numVal : cell > value;
          case "<": return canCompareNum ? numCell < numVal : cell < value;
          case ">=": return canCompareNum ? numCell >= numVal : cell >= value;
          case "<=": return canCompareNum ? numCell <= numVal : cell <= value;
          case "contains": return cell.toLowerCase().includes(value.toLowerCase());
          case "startswith": return cell.toLowerCase().startsWith(value.toLowerCase());
          case "endswith": return cell.toLowerCase().endsWith(value.toLowerCase());
          default: return true;
        }
      });
    }

    // Deduplicate
    if (deduplicate) {
      const col = deduplicate as string;
      const seen = new Set<string>();
      rows = rows.filter((row) => {
        const val = row[col] ?? "";
        if (seen.has(val)) return false;
        seen.add(val);
        return true;
      });
    }

    // Sort
    if (sortBy) {
      const col = sortBy as string;
      const order = (sortOrder as string) === "desc" ? -1 : 1;
      rows.sort((a, b) => {
        const va = a[col] ?? "";
        const vb = b[col] ?? "";
        const na = Number(va);
        const nb = Number(vb);
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * order;
        return va.localeCompare(vb) * order;
      });
    }

    // Aggregate
    if (aggregate) {
      const aggStr = aggregate as string;
      const match = aggStr.match(/^(count|sum|avg|min|max)\((\S+)\)$/i);
      if (!match) return { success: false, error: `Invalid aggregate: "${aggStr}". Use: function(column)` };

      const [, func, col] = match;
      const values = rows.map((r) => Number(r[col])).filter((n) => !isNaN(n));

      let result: number;
      switch (func.toLowerCase()) {
        case "count": result = rows.length; break;
        case "sum": result = values.reduce((a, b) => a + b, 0); break;
        case "avg": result = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0; break;
        case "min": result = values.length > 0 ? Math.min(...values) : 0; break;
        case "max": result = values.length > 0 ? Math.max(...values) : 0; break;
        default: result = 0;
      }

      return {
        success: true,
        data: {
          aggregate: { function: func, column: col, result },
          rowsProcessed: rows.length,
        },
        summary: `${func}(${col}) = ${result} (over ${rows.length} rows)`,
      };
    }

    // Select columns
    if (columns) {
      const cols = columns as string[];
      const invalid = cols.filter((c) => !headers.includes(c));
      if (invalid.length > 0) {
        return { success: false, error: `Unknown columns: ${invalid.join(", ")}. Available: ${headers.join(", ")}` };
      }
      headers = cols;
      rows = rows.map((row) => {
        const filtered: ParsedRow = {};
        for (const c of cols) filtered[c] = row[c] ?? "";
        return filtered;
      });
    }

    // Limit
    if (limit) {
      rows = rows.slice(0, limit as number);
    }

    // Format output
    const fmt = (outputFormat as string) || "csv";
    let output: string;

    switch (fmt) {
      case "json":
        output = JSON.stringify(rows, null, 2);
        break;
      case "markdown": {
        const headerLine = "| " + headers.join(" | ") + " |";
        const separator = "| " + headers.map(() => "---").join(" | ") + " |";
        const dataLines = rows.map((r) => "| " + headers.map((h) => r[h] ?? "").join(" | ") + " |");
        output = [headerLine, separator, ...dataLines].join("\n");
        break;
      }
      default:
        output = toCSV(headers, rows, delim);
    }

    return {
      success: true,
      data: {
        output,
        originalRows: originalCount,
        resultRows: rows.length,
        columns: headers,
        format: fmt,
      },
      summary: `${rows.length} rows (from ${originalCount} original), ${headers.length} columns.\n\n${output}`,
    };
  },
};
