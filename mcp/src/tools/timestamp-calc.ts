import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

const DURATION_UNITS: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1000,
  sec: 1000,
  second: 1000,
  seconds: 1000,
  m: 60_000,
  min: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
  mo: 2_592_000_000, // 30 days
  month: 2_592_000_000,
  months: 2_592_000_000,
  y: 31_536_000_000, // 365 days
  year: 31_536_000_000,
  years: 31_536_000_000,
};

function parseDuration(input: string): number {
  const trimmed = input.trim().toLowerCase();

  // Parse compound durations: "2h30m", "1d 12h", "90 days"
  const parts = trimmed.match(/(-?\d+\.?\d*)\s*([a-z]+)/gi);
  if (!parts || parts.length === 0) {
    throw new Error(`Cannot parse duration: "${input}"`);
  }

  let totalMs = 0;
  for (const part of parts) {
    const match = part.match(/(-?\d+\.?\d*)\s*([a-z]+)/i);
    if (!match) continue;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = DURATION_UNITS[unit];
    if (!multiplier) throw new Error(`Unknown unit: "${unit}"`);
    totalMs += value * multiplier;
  }
  return totalMs;
}

function parseDate(input: string): Date {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "now" || trimmed === "today") return new Date();

  // Try ISO / standard parse
  const d = new Date(input.trim());
  if (!isNaN(d.getTime())) return d;

  // Try epoch (seconds or ms)
  const num = Number(input.trim());
  if (!isNaN(num)) {
    return num > 1e12 ? new Date(num) : new Date(num * 1000);
  }

  throw new Error(`Cannot parse date: "${input}"`);
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const sign = ms < 0 ? "-" : "";

  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);
  const millis = abs % 1000;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  if (millis > 0 && days === 0) parts.push(`${millis}ms`);

  if (parts.length === 0) return "0s";
  return sign + parts.join(" ");
}

function formatDateFull(d: Date, tz?: string): Record<string, string> {
  const iso = d.toISOString();
  const epoch = Math.floor(d.getTime() / 1000);
  const epochMs = d.getTime();

  const result: Record<string, string> = {
    iso8601: iso,
    epochSeconds: String(epoch),
    epochMs: String(epochMs),
    utc: d.toUTCString(),
    local: d.toLocaleString("en-US", { timeZoneName: "short" }),
  };

  if (tz) {
    try {
      result[`tz_${tz}`] = d.toLocaleString("en-US", { timeZone: tz, timeZoneName: "short" });
    } catch {
      result.tzError = `Unknown timezone: ${tz}`;
    }
  }

  return result;
}

export const tool: Tool = {
  name: "timestamp_calc",
  description:
    "Date/time calculator: add/subtract durations from dates, calculate difference between two dates, or convert dates between formats and timezones. Supports compound durations (e.g., '2h30m', '90 days'), ISO dates, epoch timestamps, and timezone conversion. Call this tool for any date math or timezone conversion. Claude frequently makes date arithmetic errors — this tool uses exact millisecond calculations.",
  schema: z.object({
    operation: z
      .enum(["add", "subtract", "diff", "convert"])
      .describe("Operation: add (date + duration), subtract (date - duration), diff (date2 - date1), convert (reformat date)"),
    date: z
      .string()
      .describe("Date input: ISO string, epoch (seconds or ms), or 'now'. For diff: this is the start date."),
    date2: z
      .string()
      .optional()
      .describe("Second date for 'diff' operation (end date)"),
    duration: z
      .string()
      .optional()
      .describe("Duration for add/subtract: e.g., '90 days', '2h30m', '1 year 6 months', '3600 seconds'"),
    timezone: z
      .string()
      .optional()
      .describe("Optional timezone for output (e.g., 'America/New_York', 'Asia/Tokyo', 'UTC')"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ operation, date, date2, duration, timezone }): Promise<ToolResult> => {
    const op = operation as string;
    const dateStr = date as string;
    const tz = timezone as string | undefined;

    if (!dateStr) return { success: false, error: "Date is required" };

    try {
      switch (op) {
        case "add":
        case "subtract": {
          if (!duration) return { success: false, error: "Duration is required for add/subtract" };
          const d = parseDate(dateStr);
          const ms = parseDuration(duration as string);
          const result = new Date(d.getTime() + (op === "add" ? ms : -ms));
          const formatted = formatDateFull(result, tz);

          return {
            success: true,
            data: {
              original: formatDateFull(d, tz),
              operation: op,
              duration: duration as string,
              durationMs: op === "add" ? ms : -ms,
              result: formatted,
            },
            summary: `${d.toISOString()} ${op === "add" ? "+" : "-"} ${duration}\n= ${result.toISOString()}\n\nEpoch: ${formatted.epochSeconds}s | ${formatted.epochMs}ms${tz ? `\n${tz}: ${formatted[`tz_${tz}`] || "N/A"}` : ""}`,
          };
        }

        case "diff": {
          if (!date2) return { success: false, error: "date2 is required for diff operation" };
          const d1 = parseDate(dateStr);
          const d2 = parseDate(date2 as string);
          const diffMs = d2.getTime() - d1.getTime();
          const absDiff = Math.abs(diffMs);

          const totalSeconds = Math.floor(absDiff / 1000);
          const totalMinutes = Math.floor(absDiff / 60_000);
          const totalHours = Math.floor(absDiff / 3_600_000);
          const totalDays = Math.floor(absDiff / 86_400_000);
          const totalWeeks = Math.floor(totalDays / 7);

          return {
            success: true,
            data: {
              from: formatDateFull(d1, tz),
              to: formatDateFull(d2, tz),
              diffMs,
              formatted: formatDuration(diffMs),
              breakdown: {
                totalWeeks,
                totalDays,
                totalHours,
                totalMinutes,
                totalSeconds,
                totalMilliseconds: absDiff,
              },
            },
            summary: `${d1.toISOString()}\n→ ${d2.toISOString()}\n\nDifference: ${formatDuration(diffMs)}\n= ${totalDays} days | ${totalHours} hours | ${totalMinutes} minutes | ${totalSeconds} seconds`,
          };
        }

        case "convert": {
          const d = parseDate(dateStr);
          const formatted = formatDateFull(d, tz);

          return {
            success: true,
            data: { date: formatted },
            summary: Object.entries(formatted).map(([k, v]) => `${k}: ${v}`).join("\n"),
          };
        }

        default:
          return { success: false, error: `Unknown operation: ${op}` };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Invalid input",
      };
    }
  },
};
