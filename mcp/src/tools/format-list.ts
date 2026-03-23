import { z } from "zod";
import { parseItems, formatItems, SqlFormat, type FormatterOptions } from "../../../utils/formatter.js";
import type { Tool, ToolResult } from "../registry.js";

const FORMAT_MAP: Record<string, SqlFormat> = {
  in_clause: SqlFormat.IN_CLAUSE,
  values: SqlFormat.VALUES_LIST,
  union: SqlFormat.UNION_SELECT,
  json_array: SqlFormat.JSON_ARRAY,
  csv: SqlFormat.RAW_CSV,
};

export const tool: Tool = {
  name: "format_list",
  description:
    "Convert a list of values into SQL IN clause, VALUES, UNION ALL, JSON array, or CSV. Call this tool whenever the user provides multiple values (IDs, names, emails — one per line, comma-separated, or space-separated) and needs them formatted for a SQL query, API payload, or data file. Returns the formatted output ready to paste. Handles quote styles (single/double/none) and auto-parses mixed delimiters.",
  schema: z.object({
    input: z
      .string()
      .describe(
        "List of values. Supports newline, comma, semicolon, tab, or space separation."
      ),
    format: z
      .enum(["in_clause", "values", "union", "json_array", "csv"])
      .default("in_clause")
      .describe("Output format"),
    quotes: z
      .enum(["single", "double", "none"])
      .default("single")
      .describe("Quote style for values"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input, format, quotes }): Promise<ToolResult> => {
    const items = parseItems(input as string);
    if (items.length === 0) {
      return { success: false, error: "No items found in input" };
    }

    const sqlFormat = FORMAT_MAP[(format as string) || "in_clause"] ?? SqlFormat.IN_CLAUSE;
    const opts: FormatterOptions = {
      quotes: (quotes as "single" | "double" | "none") || "single",
      delimiter: ", ",
      upperCase: false,
      removeHyphens: false,
      removeDoubleQuotes: false,
      prettyPrint: true,
    };

    const formatted = formatItems(items, sqlFormat, opts);

    return {
      success: true,
      data: {
        formatted,
        itemCount: items.length,
        items,
        format,
      },
      summary: `${items.length} items formatted as ${format}.\n\n${formatted}`,
    };
  },
};
