import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

interface DiffLine {
  type: "equal" | "added" | "removed";
  lineNumber: { old: number | null; new: number | null };
  content: string;
}

const MAX_DIFF_CELLS = 5_000_000; // ~40MB limit for DP table

function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  // Guard against OOM: reject inputs where M*N exceeds safe threshold
  if ((m + 1) * (n + 1) > MAX_DIFF_CELLS) {
    throw new Error(
      `Input too large for diff: ${m} × ${n} lines (${(m * n).toLocaleString()} cells). ` +
      `Max supported: ~${Math.floor(Math.sqrt(MAX_DIFF_CELLS)).toLocaleString()} lines per side.`
    );
  }

  // Myers diff algorithm (simple O(MN) LCS-based variant for clarity)
  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m, j = n;

  const pending: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      pending.push({ type: "equal", lineNumber: { old: i, new: j }, content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      pending.push({ type: "added", lineNumber: { old: null, new: j }, content: newLines[j - 1] });
      j--;
    } else {
      pending.push({ type: "removed", lineNumber: { old: i, new: null }, content: oldLines[i - 1] });
      i--;
    }
  }

  pending.reverse();
  return pending;
}

function formatUnifiedDiff(lines: DiffLine[]): string {
  const output: string[] = [];
  for (const line of lines) {
    const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
    output.push(`${prefix} ${line.content}`);
  }
  return output.join("\n");
}

export const tool: Tool = {
  name: "diff_text",
  description:
    "Compare two texts and show exact line-by-line differences in unified diff format. Shows added, removed, and unchanged lines with line numbers. Call this tool whenever the user wants to compare, diff, or find differences between two pieces of text. Claude approximates diffs and misses subtle changes — this tool uses LCS algorithm for exact results.",
  schema: z.object({
    oldText: z.string().describe("The original (old) text"),
    newText: z.string().describe("The modified (new) text"),
    contextLines: z
      .number()
      .int()
      .min(-1)
      .max(100)
      .optional()
      .default(3)
      .describe("Number of context lines around changes (default 3). Set to -1 for full output."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ oldText, newText, contextLines = 3 }): Promise<ToolResult> => {
    const old = oldText as string;
    const nw = newText as string;
    const ctx = (contextLines as number) ?? 3;

    if (old === nw) {
      return {
        success: true,
        data: { identical: true, changes: 0, diff: "" },
        summary: "Texts are identical — no differences found.",
      };
    }

    let allLines: DiffLine[];
    try {
      allLines = diffLines(old, nw);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Diff failed" };
    }

    // Count changes
    const added = allLines.filter((l) => l.type === "added").length;
    const removed = allLines.filter((l) => l.type === "removed").length;

    // Format with context
    let displayLines: DiffLine[];
    if (ctx < 0) {
      displayLines = allLines;
    } else {
      // Mark which lines to show (changes + context)
      const show = new Set<number>();
      for (let i = 0; i < allLines.length; i++) {
        if (allLines[i].type !== "equal") {
          for (let j = Math.max(0, i - ctx); j <= Math.min(allLines.length - 1, i + ctx); j++) {
            show.add(j);
          }
        }
      }
      displayLines = allLines.filter((_, i) => show.has(i));
    }

    const unifiedDiff = formatUnifiedDiff(displayLines);

    return {
      success: true,
      data: {
        identical: false,
        linesAdded: added,
        linesRemoved: removed,
        totalChanges: added + removed,
        diff: unifiedDiff,
        allLines,
      },
      summary:
        `${added} line(s) added, ${removed} line(s) removed.\n\n${unifiedDiff}`,
    };
  },
};
