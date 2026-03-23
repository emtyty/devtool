import { z } from "zod";
import { describeCron, validateCron, getNextRuns } from "../../../utils/cronParser.js";
import type { Tool, ToolResult } from "../registry.js";

export const tool: Tool = {
  name: "parse_cron",
  description:
    "Parse a cron expression into a human-readable schedule description with validation and next run times. Call this tool whenever the user provides a cron expression (5 space-separated fields like '0 9 * * 1-5'), asks what a cron means, or wants to verify cron syntax. Returns plain-English description (e.g. 'Every weekday at 9:00 AM'), validation result, and the next N scheduled run timestamps. More reliable than manual interpretation because it correctly handles ranges, steps, combined expressions, and edge cases.",
  schema: z.object({
    expression: z.string().describe("Cron expression (5 fields: minute hour day month weekday). Examples: '0 9 * * 1-5', '*/5 * * * *'"),
    nextRuns: z.number().int().min(1).max(20).default(5).describe("Number of next run times to show"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ expression, nextRuns }): Promise<ToolResult> => {
    const expr = (expression as string).trim();
    const count = (nextRuns as number) || 5;

    const error = validateCron(expr);
    if (error) {
      return { success: false, error: `Invalid cron: ${error}` };
    }

    const description = describeCron(expr);
    const runs = getNextRuns(expr, count);

    return {
      success: true,
      data: {
        expression: expr,
        description,
        isValid: true,
        nextRuns: runs.map((d) => d.toISOString()),
      },
      summary: [
        `Expression: ${expr}`,
        `Schedule: ${description}`,
        ``,
        `Next ${runs.length} runs:`,
        ...runs.map((d, i) => `  ${i + 1}. ${d.toISOString()}`),
      ].join("\n"),
    };
  },
};
