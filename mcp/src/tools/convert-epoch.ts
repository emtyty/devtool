import { z } from "zod";
import { fmtDate, relativeTime } from "../../../utils/epochConverter.js";
import type { Tool, ToolResult } from "../registry.js";

export const tool: Tool = {
  name: "convert_epoch",
  description:
    "Convert between Unix epoch timestamps and human-readable dates with timezone support. Call this tool whenever the user provides a number that could be a timestamp (10-digit seconds or 13-digit milliseconds), asks to convert epoch/Unix time to a date, or wants to convert a date string to epoch. Auto-detects seconds vs milliseconds. Returns ISO 8601, UTC, local time in specified timezone, and relative time (e.g. '2 days ago'). More accurate than manual conversion because it handles timezone offsets and auto-detection correctly.",
  schema: z.object({
    input: z
      .string()
      .describe("Epoch timestamp (seconds or milliseconds) or date string (ISO 8601, etc.). Leave empty or 'now' for current time."),
    timezone: z
      .string()
      .default("UTC")
      .describe("Timezone for display (e.g. 'America/New_York', 'Asia/Ho_Chi_Minh', 'UTC')"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input, timezone }): Promise<ToolResult> => {
    const trimmed = (input as string).trim();
    const tz = (timezone as string) || "UTC";

    // Current time
    if (!trimmed || trimmed.toLowerCase() === "now") {
      const now = Date.now();
      const d = new Date(now);
      return {
        success: true,
        data: {
          epochSeconds: Math.floor(now / 1000),
          epochMilliseconds: now,
          iso8601: d.toISOString(),
          utc: fmtDate(d, "UTC"),
          local: fmtDate(d, tz),
        },
        summary: [
          `Current Time`,
          `Epoch (s):  ${Math.floor(now / 1000)}`,
          `Epoch (ms): ${now}`,
          `ISO 8601:   ${d.toISOString()}`,
          `UTC:        ${fmtDate(d, "UTC")}`,
          `${tz}:      ${fmtDate(d, tz)}`,
        ].join("\n"),
      };
    }

    // Try as epoch number
    const num = Number(trimmed);
    if (!isNaN(num) && /^\d{10,13}$/.test(trimmed)) {
      const ms = trimmed.length <= 10 ? num * 1000 : num;
      const d = new Date(ms);
      if (isNaN(d.getTime())) {
        return { success: false, error: "Invalid timestamp value" };
      }
      const unit = trimmed.length <= 10 ? "seconds" : "milliseconds";
      return {
        success: true,
        data: {
          input: trimmed,
          detectedUnit: unit,
          epochSeconds: Math.floor(ms / 1000),
          epochMilliseconds: ms,
          iso8601: d.toISOString(),
          utc: fmtDate(d, "UTC"),
          local: fmtDate(d, tz),
          relative: relativeTime(d),
        },
        summary: [
          `Input: ${trimmed} (detected: ${unit})`,
          `Epoch (s):  ${Math.floor(ms / 1000)}`,
          `Epoch (ms): ${ms}`,
          `ISO 8601:   ${d.toISOString()}`,
          `UTC:        ${fmtDate(d, "UTC")}`,
          `${tz}:      ${fmtDate(d, tz)}`,
          `Relative:   ${relativeTime(d)}`,
        ].join("\n"),
      };
    }

    // Try as date string
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const ms = d.getTime();
      return {
        success: true,
        data: {
          input: trimmed,
          parsed: d.toISOString(),
          epochSeconds: Math.floor(ms / 1000),
          epochMilliseconds: ms,
          utc: fmtDate(d, "UTC"),
          local: fmtDate(d, tz),
          relative: relativeTime(d),
        },
        summary: [
          `Input: ${trimmed}`,
          `Epoch (s):  ${Math.floor(ms / 1000)}`,
          `Epoch (ms): ${ms}`,
          `ISO 8601:   ${d.toISOString()}`,
          `UTC:        ${fmtDate(d, "UTC")}`,
          `${tz}:      ${fmtDate(d, tz)}`,
          `Relative:   ${relativeTime(d)}`,
        ].join("\n"),
      };
    }

    return { success: false, error: `Could not parse input: "${trimmed}"` };
  },
};
