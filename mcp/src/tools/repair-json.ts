import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import type { Tool, ToolResult } from "../registry.js";

export const tool: Tool = {
  name: "repair_json",
  description:
    "Repair malformed JSON automatically — fixes missing quotes, trailing commas, single quotes, unquoted keys, comments, and truncated structures. Call this tool whenever the user provides broken or invalid JSON, asks to fix/repair/validate JSON, or pastes something that looks like JSON but fails to parse. Returns the repaired JSON with proper formatting. More reliable than manual fixes because it uses the jsonrepair engine which handles edge cases like nested errors and mixed quote styles.",
  schema: z.object({
    input: z
      .string()
      .describe("The malformed JSON string to repair"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input }): Promise<ToolResult> => {
    const trimmed = (input as string).trim();
    if (!trimmed) {
      return { success: false, error: "Empty input" };
    }

    // Check if already valid
    try {
      JSON.parse(trimmed);
      return {
        success: true,
        data: {
          repaired: trimmed,
          wasValid: true,
          parsed: JSON.parse(trimmed),
        },
        summary: "JSON is already valid — no repairs needed.",
      };
    } catch {
      // needs repair
    }

    try {
      const repaired = jsonrepair(trimmed);
      const parsed = JSON.parse(repaired);
      const formatted = JSON.stringify(parsed, null, 2);

      return {
        success: true,
        data: {
          repaired: formatted,
          wasValid: false,
          parsed,
        },
        summary: `JSON repaired successfully. Output: ${formatted.split("\n").length} lines.`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Unable to repair JSON: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  },
};
