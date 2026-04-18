import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

// ── Types ────────────────────────────────────────────────────────────────────

type FileStatus = "added" | "deleted" | "modified" | "renamed" | "binary";
type LineType = "add" | "del" | "context";

interface DiffLine {
  type: LineType;
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

interface DiffFile {
  oldPath: string;
  newPath: string;
  status: FileStatus;
  isBinary: boolean;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

// ── Parser ───────────────────────────────────────────────────────────────────

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseGitDiff(input: string): { files: DiffFile[]; totalAdditions: number; totalDeletions: number } {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const files: DiffFile[] = [];

  let current: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldLineNo = 0;
  let newLineNo = 0;

  const pushFile = () => {
    if (current) {
      if (hunk) current.hunks.push(hunk);
      files.push(current);
    }
    current = null;
    hunk = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushFile();
      const m = /diff --git "?a\/(.+?)"? "?b\/(.+?)"?\s*$/.exec(line);
      current = {
        oldPath: m?.[1] ?? "",
        newPath: m?.[2] ?? "",
        status: "modified",
        isBinary: false,
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("new file mode")) { current.status = "added"; continue; }
    if (line.startsWith("deleted file mode")) { current.status = "deleted"; continue; }
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      current.oldPath = line.slice("rename from ".length);
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.newPath = line.slice("rename to ".length);
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      current.isBinary = true;
      current.status = "binary";
      continue;
    }
    if (line.startsWith("index ") || line.startsWith("similarity index ") ||
        line.startsWith("---") || line.startsWith("+++") ||
        line.startsWith("old mode") || line.startsWith("new mode")) {
      if (line.startsWith("--- ") && !current.oldPath) {
        current.oldPath = line.replace(/^--- (?:a\/)?/, "").trim();
      }
      if (line.startsWith("+++ ") && !current.newPath) {
        current.newPath = line.replace(/^\+\+\+ (?:b\/)?/, "").trim();
      }
      continue;
    }

    if (line.startsWith("@@")) {
      if (hunk) current.hunks.push(hunk);
      const m = HUNK_RE.exec(line);
      if (m) {
        hunk = {
          header: line,
          oldStart: parseInt(m[1], 10),
          oldLines: m[2] ? parseInt(m[2], 10) : 1,
          newStart: parseInt(m[3], 10),
          newLines: m[4] ? parseInt(m[4], 10) : 1,
          lines: [],
        };
        oldLineNo = hunk.oldStart;
        newLineNo = hunk.newStart;
      }
      continue;
    }

    if (line.startsWith("\\ ")) continue;
    if (!hunk) continue;

    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === "+") {
      hunk.lines.push({ type: "add", content, newLineNo });
      newLineNo++;
      current.additions++;
    } else if (prefix === "-") {
      hunk.lines.push({ type: "del", content, oldLineNo });
      oldLineNo++;
      current.deletions++;
    } else {
      hunk.lines.push({
        type: "context",
        content: line.startsWith(" ") ? content : line,
        oldLineNo,
        newLineNo,
      });
      oldLineNo++;
      newLineNo++;
    }
  }

  pushFile();

  return {
    files,
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
  };
}

// ── Tool export ──────────────────────────────────────────────────────────────

export const tool: Tool = {
  name: "parse_git_diff",
  description:
    "Parse the output of `git diff`, `git show`, or a unified-format .patch file into a structured JSON representation. Returns per-file metadata (path, status: added/deleted/modified/renamed/binary), per-hunk headers with line ranges, and every changed line with old/new line numbers. Call this whenever the user provides a git diff / patch and wants to analyze what changed, count modifications, or process changes programmatically. Claude approximates diff parsing and mislabels renames/binary files — this tool uses the canonical unified-diff grammar for exact results.",
  schema: z.object({
    diff: z
      .string()
      .min(1)
      .describe("The raw unified diff output (from `git diff`, `git show`, or a .patch file)."),
    includeLines: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to include every changed line in the output. Set to false for a compact file-level summary only (default true)."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ diff, includeLines = true }): Promise<ToolResult> => {
    const text = diff as string;
    const withLines = (includeLines as boolean) ?? true;

    const parsed = parseGitDiff(text);

    if (parsed.files.length === 0) {
      return {
        success: false,
        error: "No diff files detected. Input should start with `diff --git` or `---`/`+++` file headers.",
      };
    }

    const summary =
      `Parsed ${parsed.files.length} file(s) — ` +
      `+${parsed.totalAdditions} / -${parsed.totalDeletions}.\n` +
      parsed.files
        .map((f) => {
          const path = f.status === "renamed" ? `${f.oldPath} → ${f.newPath}` : f.newPath || f.oldPath;
          return `  [${f.status}] ${path}  +${f.additions} -${f.deletions}${f.isBinary ? "  (binary)" : ""}`;
        })
        .join("\n");

    const files = withLines
      ? parsed.files
      : parsed.files.map((f) => ({
          oldPath: f.oldPath,
          newPath: f.newPath,
          status: f.status,
          isBinary: f.isBinary,
          additions: f.additions,
          deletions: f.deletions,
          hunkCount: f.hunks.length,
        }));

    return {
      success: true,
      data: {
        fileCount: parsed.files.length,
        totalAdditions: parsed.totalAdditions,
        totalDeletions: parsed.totalDeletions,
        files,
      },
      summary,
    };
  },
};
