import { z } from "zod";
import { processListItems, type ListToolsOptions } from "../../../utils/formatter.js";
import type { Tool, ToolResult } from "../registry.js";

export const tool: Tool = {
  name: "clean_list",
  description:
    "Deduplicate, sort, trim, and clean a list of items. Call this tool whenever the user provides a list with duplicates, messy whitespace, or unsorted items and wants it cleaned up. Supports ascending/descending/natural sort, case-sensitive or insensitive dedup, and empty line removal. Returns the cleaned list with a count of items removed.",
  schema: z.object({
    input: z
      .string()
      .describe("List of items, one per line"),
    removeDuplicates: z
      .boolean()
      .default(true)
      .describe("Remove duplicate entries"),
    sort: z
      .enum(["none", "asc", "desc"])
      .default("none")
      .describe("Sort order"),
    naturalSort: z
      .boolean()
      .default(true)
      .describe("Natural sort (e.g. item2 before item10)"),
    trim: z
      .boolean()
      .default(true)
      .describe("Trim whitespace from each line"),
    removeEmpty: z
      .boolean()
      .default(true)
      .describe("Remove empty lines"),
    caseSensitive: z
      .boolean()
      .default(false)
      .describe("Case-sensitive deduplication and sorting"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({
    input,
    removeDuplicates,
    sort,
    naturalSort,
    trim,
    removeEmpty,
    caseSensitive,
  }): Promise<ToolResult> => {
    const originalLines = (input as string).split(/\r?\n/).filter((l) => l.trim());

    const opts: ListToolsOptions = {
      removeDuplicates: removeDuplicates as boolean,
      sort: sort as "none" | "asc" | "desc",
      naturalSort: naturalSort as boolean,
      trim: trim as boolean,
      removeEmpty: removeEmpty as boolean,
      caseSensitive: caseSensitive as boolean,
    };

    const cleanedStr = processListItems(input as string, opts);
    const cleaned = cleanedStr ? cleanedStr.split("\n") : [];
    const removed = originalLines.length - cleaned.length;

    return {
      success: true,
      data: {
        cleaned: cleanedStr,
        originalCount: originalLines.length,
        cleanedCount: cleaned.length,
        removedCount: removed,
      },
      summary: `Cleaned: ${originalLines.length} → ${cleaned.length} items (${removed} removed).\n\n${cleanedStr}`,
    };
  },
};
