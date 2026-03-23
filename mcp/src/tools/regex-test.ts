import { z } from "zod";
import { Worker, isMainThread } from "node:worker_threads";
import type { Tool, ToolResult } from "../registry.js";

const MAX_INPUT_LENGTH = 100_000; // 100KB max input
const REGEX_TIMEOUT_MS = 3_000;   // 3 second timeout

interface MatchInfo {
  match: string;
  index: number;
  groups: Record<string, string> | null;
  captures: string[];
}

/**
 * Execute regex in a worker thread with timeout to prevent ReDoS.
 * If the regex takes longer than REGEX_TIMEOUT_MS, the worker is terminated.
 */
function execRegexSafe(
  pat: string,
  flg: string,
  str: string,
  replaceWith?: string
): Promise<{ matches: MatchInfo[]; replaced?: string }> {
  return new Promise((resolve, reject) => {
    const workerCode = `
      const { parentPort, workerData } = require('node:worker_threads');
      const { pat, flg, str, replaceWith } = workerData;
      try {
        const regex = new RegExp(pat, flg);
        const matches = [];
        const isGlobal = flg.includes('g');
        if (isGlobal) {
          let m;
          while ((m = regex.exec(str)) !== null) {
            matches.push({
              match: m[0],
              index: m.index,
              groups: m.groups ? { ...m.groups } : null,
              captures: m.slice(1),
            });
            if (!m[0].length) regex.lastIndex++;
            if (matches.length >= 10000) break;
          }
        } else {
          const m = regex.exec(str);
          if (m) {
            matches.push({
              match: m[0],
              index: m.index,
              groups: m.groups ? { ...m.groups } : null,
              captures: m.slice(1),
            });
          }
        }
        const result = { matches };
        if (replaceWith !== undefined && replaceWith !== null) {
          const regex2 = new RegExp(pat, flg);
          result.replaced = str.replace(regex2, replaceWith);
        }
        parentPort.postMessage(result);
      } catch (err) {
        parentPort.postMessage({ error: err.message || 'regex execution failed' });
      }
    `;

    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { pat, flg, str, replaceWith },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Regex execution timed out after ${REGEX_TIMEOUT_MS}ms — pattern may cause catastrophic backtracking`));
    }, REGEX_TIMEOUT_MS);

    worker.on("message", (msg: any) => {
      clearTimeout(timer);
      if (msg.error) {
        reject(new Error(msg.error));
      } else {
        resolve(msg);
      }
    });

    worker.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export const tool: Tool = {
  name: "regex_test",
  description:
    "Test a regular expression against a string — shows all matches, captured groups, named groups, and match positions. Call this tool whenever the user asks to test, validate, or debug a regex pattern. Claude frequently gets regex matching wrong — this tool executes the actual JS RegExp engine for exact results. Execution is sandboxed with a 3-second timeout to prevent catastrophic backtracking.",
  schema: z.object({
    pattern: z.string().describe("The regular expression pattern (without delimiters)"),
    flags: z
      .string()
      .optional()
      .default("g")
      .describe("Regex flags (default: 'g'). Common: g (global), i (case-insensitive), m (multiline), s (dotAll)"),
    testString: z.string().describe("The string to test against"),
    replaceWith: z
      .string()
      .optional()
      .describe("Optional replacement string. If provided, also returns the replaced result (supports $1, $<name>)."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ pattern, flags = "g", testString, replaceWith }): Promise<ToolResult> => {
    const pat = pattern as string;
    const flg = (flags as string) || "g";
    const str = testString as string;

    if (!pat) return { success: false, error: "Pattern is required" };
    if (str === undefined || str === null) return { success: false, error: "Test string is required" };

    if (str.length > MAX_INPUT_LENGTH) {
      return { success: false, error: `Test string too long (${str.length} chars). Max: ${MAX_INPUT_LENGTH}` };
    }

    // Validate regex syntax before spawning worker
    try {
      new RegExp(pat, flg);
    } catch (err) {
      return {
        success: false,
        error: `Invalid regex: ${err instanceof Error ? err.message : "syntax error"}`,
      };
    }

    let matches: MatchInfo[];
    let replaced: string | undefined;

    try {
      const result = await execRegexSafe(pat, flg, str, replaceWith as string | undefined);
      matches = result.matches;
      replaced = result.replaced;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Regex execution failed",
      };
    }

    const isMatch = matches.length > 0;

    const result: Record<string, unknown> = {
      isMatch,
      matchCount: matches.length,
      matches,
      pattern: pat,
      flags: flg,
    };

    if (replaced !== undefined) {
      result.replaced = replaced;
    }

    const summaryLines = [`Pattern: /${pat}/${flg}`, `Matches: ${matches.length}`];
    if (matches.length > 0) {
      const preview = matches.slice(0, 5);
      for (const m of preview) {
        let line = `  [${m.index}] "${m.match}"`;
        if (m.captures.length) line += ` captures: [${m.captures.map((c) => `"${c}"`).join(", ")}]`;
        if (m.groups) line += ` groups: ${JSON.stringify(m.groups)}`;
        summaryLines.push(line);
      }
      if (matches.length > 5) summaryLines.push(`  ... and ${matches.length - 5} more`);
    }
    if (result.replaced !== undefined) {
      const rep = result.replaced as string;
      summaryLines.push(`Replaced: "${rep.length > 100 ? rep.slice(0, 100) + "…" : rep}"`);
    }

    return {
      success: true,
      data: result,
      summary: summaryLines.join("\n"),
    };
  },
};
