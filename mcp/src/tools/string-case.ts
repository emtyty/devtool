import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

type CaseType = "camel" | "pascal" | "snake" | "kebab" | "constant" | "dot" | "title" | "sentence";

/**
 * Split a string into words by detecting boundaries:
 * - camelCase/PascalCase boundaries
 * - separators: _, -, ., space, tab
 * - consecutive uppercase (e.g., "XMLParser" → ["XML", "Parser"])
 */
function splitWords(input: string): string[] {
  // Replace separators with space
  let normalized = input.replace(/[_\-.\s\t]+/g, " ").trim();

  // Insert space before uppercase letters that follow lowercase
  normalized = normalized.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Insert space between consecutive uppercase and following lowercase
  // e.g., "XMLParser" → "XML Parser"
  normalized = normalized.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  return normalized.split(/\s+/).filter(Boolean);
}

function convertCase(words: string[], target: CaseType): string {
  if (words.length === 0) return "";

  switch (target) {
    case "camel":
      return words[0].toLowerCase() +
        words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
    case "pascal":
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
    case "snake":
      return words.map((w) => w.toLowerCase()).join("_");
    case "kebab":
      return words.map((w) => w.toLowerCase()).join("-");
    case "constant":
      return words.map((w) => w.toUpperCase()).join("_");
    case "dot":
      return words.map((w) => w.toLowerCase()).join(".");
    case "title":
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    case "sentence":
      return words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase() +
        (words.length > 1 ? " " + words.slice(1).map((w) => w.toLowerCase()).join(" ") : "");
    default:
      return words.join(" ");
  }
}

function detectCase(input: string): string {
  if (/^[a-z][a-zA-Z0-9]*$/.test(input) && /[A-Z]/.test(input)) return "camelCase";
  if (/^[A-Z][a-zA-Z0-9]*$/.test(input) && input.length > 1) return "PascalCase";
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(input)) return "snake_case";
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(input)) return "kebab-case";
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(input)) return "CONSTANT_CASE";
  if (/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/.test(input)) return "dot.case";
  return "unknown";
}

export const tool: Tool = {
  name: "string_case",
  description:
    "Convert strings between naming conventions: camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, dot.case, Title Case, and Sentence case. Handles bulk conversion (multiple lines). Auto-detects source case. Call this tool for variable/function/class renaming across conventions. Deterministic and handles edge cases like acronyms (XMLParser, getHTTPClient).",
  schema: z.object({
    input: z
      .string()
      .describe("The string(s) to convert. Multiple strings can be separated by newlines for bulk conversion."),
    to: z
      .enum(["camel", "pascal", "snake", "kebab", "constant", "dot", "title", "sentence", "all"])
      .describe("Target case. Use 'all' to see all conversions at once."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input, to }): Promise<ToolResult> => {
    const raw = (input as string)?.trim();
    if (!raw) return { success: false, error: "Input is required" };

    const target = to as string;
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

    if (target === "all") {
      // Show all conversions for each input
      const allCases: CaseType[] = ["camel", "pascal", "snake", "kebab", "constant", "dot", "title", "sentence"];
      const results = lines.map((line) => {
        const words = splitWords(line);
        const detected = detectCase(line);
        const conversions: Record<string, string> = {};
        for (const c of allCases) {
          conversions[c] = convertCase(words, c);
        }
        return { input: line, detected, conversions };
      });

      const summaryLines = results.map((r) => {
        const header = `"${r.input}" (detected: ${r.detected}):`;
        const convLines = Object.entries(r.conversions).map(([c, v]) => `  ${c.padEnd(10)}: ${v}`);
        return [header, ...convLines].join("\n");
      });

      return {
        success: true,
        data: { results, target: "all" },
        summary: summaryLines.join("\n\n"),
      };
    }

    const results = lines.map((line) => {
      const words = splitWords(line);
      const detected = detectCase(line);
      const converted = convertCase(words, target as CaseType);
      return { input: line, detected, converted };
    });

    const summaryLines = results.map((r) =>
      r.input === r.converted
        ? `"${r.input}" → (already ${target})`
        : `"${r.input}" → "${r.converted}"`
    );

    return {
      success: true,
      data: {
        results: results.length === 1 ? results[0] : results,
        target,
      },
      summary: summaryLines.join("\n"),
    };
  },
};
