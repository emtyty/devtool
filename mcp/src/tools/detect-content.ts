import { z } from "zod";
import { detectAll } from "../../../utils/smartDetect.js";
import type { Tool, ToolResult } from "../registry.js";

const TOOL_MAP: Record<string, string> = {
  jwtdecode: "decode_jwt",
  queryplan: "analyze_sql_plan",
  cron: "parse_cron",
  epoch: "convert_epoch",
  color: "convert_color",
  jsontools: "repair_json",
  stacktrace: "parse_stack_trace",
  sqlformatter: "format_sql",
  logs: "analyze_log",
  markdown: "format_markdown",
  dataformatter: "format_list",
  listcleaner: "clean_list",
  diagram: "generate_diagram",
  texttools: "detect_content",
};

export const tool: Tool = {
  name: "detect_content",
  description:
    "Auto-detect the type of pasted content and suggest the appropriate DevToolKit tool. Call this tool when the user pastes data without specifying what it is and you are uncertain whether it is JWT, JSON, SQL, a stack trace, cron expression, epoch timestamp, color value, list, log, markdown, or mermaid. Returns the detected type with confidence score and the name of the suggested tool to call next. Use this as a first step before routing to a specific tool.",
  schema: z.object({
    input: z.string().describe("The data to analyze and detect type"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input }): Promise<ToolResult> => {
    const t = (input as string).trim();
    if (!t) return { success: false, error: "Empty input" };

    const results = detectAll(t);

    if (results.length === 0) {
      return {
        success: true,
        data: { type: "unknown", confidence: 0, detections: [] },
        summary: "Could not detect data type.",
      };
    }

    const best = results[0];
    const suggestedTool = TOOL_MAP[best.tool] ?? null;

    return {
      success: true,
      data: {
        type: best.tool,
        label: best.label,
        confidence: best.confidence,
        suggestedTool,
        allDetections: results.map((r) => ({
          type: r.tool,
          label: r.label,
          confidence: r.confidence,
          suggestedTool: TOOL_MAP[r.tool] ?? null,
        })),
      },
      summary: [
        `Detected: ${best.label} (${best.confidence}% confidence)`,
        suggestedTool ? `Suggested tool: ${suggestedTool}` : "",
        results.length > 1
          ? `\nOther matches:\n${results
              .slice(1)
              .map((r) => `  ${r.label}: ${r.confidence}%`)
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
};
