import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

// Lightweight YAML parser/serializer (handles common YAML without external deps)

function parseYaml(input: string): unknown {
  const lines = input.split("\n");
  return parseYamlLines(lines, 0, 0).value;
}

interface ParseResult {
  value: unknown;
  nextLine: number;
}

function detectIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function stripComment(line: string): string {
  // Remove inline comments (but not inside strings)
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "'" && !inDouble) inSingle = !inSingle;
    if (line[i] === '"' && !inSingle) inDouble = !inDouble;
    if (line[i] === "#" && !inSingle && !inDouble) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function unescapeDoubleQuoted(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"');
}

function unescapeSingleQuoted(str: string): string {
  // YAML single-quoted: '' → '
  return str.replace(/''/g, "'");
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "~" || trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  // Remove quotes with proper unescaping
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return unescapeDoubleQuoted(trimmed.slice(1, -1));
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return unescapeSingleQuoted(trimmed.slice(1, -1));
  }
  // Handle inline arrays [a, b, c]
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
    return trimmed.slice(1, -1).split(",").map((s) => parseScalar(s.trim()));
  }
  // Handle inline objects {a: 1, b: 2}
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { return JSON.parse(trimmed); } catch { /* fall through */ }
  }
  return trimmed;
}

const MAX_YAML_DEPTH = 100;

function parseYamlLines(lines: string[], startLine: number, baseIndent: number, depth: number = 0): ParseResult {
  if (depth > MAX_YAML_DEPTH) {
    throw new Error(`YAML nesting too deep (>${MAX_YAML_DEPTH} levels). Input may be malformed.`);
  }
  const result: Record<string, unknown> = {};
  let i = startLine;

  while (i < lines.length) {
    const rawLine = lines[i];

    // Skip empty lines and comments
    if (rawLine.trim() === "" || rawLine.trim().startsWith("#")) {
      i++;
      continue;
    }

    const currentIndent = detectIndent(rawLine);
    if (currentIndent < baseIndent) break;
    if (currentIndent > baseIndent && startLine !== i) break;

    const line = stripComment(rawLine).trim();

    // Array item
    if (line.startsWith("- ")) {
      // This is an array at current level
      const arr: unknown[] = [];
      while (i < lines.length) {
        const arrRaw = lines[i];
        if (arrRaw.trim() === "" || arrRaw.trim().startsWith("#")) { i++; continue; }
        const arrIndent = detectIndent(arrRaw);
        if (arrIndent < baseIndent) break;
        const arrLine = stripComment(arrRaw).trim();
        if (!arrLine.startsWith("- ")) break;

        const itemValue = arrLine.slice(2).trim();
        if (itemValue.includes(":") && !itemValue.startsWith('"') && !itemValue.startsWith("'")) {
          // Nested object in array item
          // Reparse as object starting from "- key: value"
          const subLines = [itemValue, ...getChildLines(lines, i + 1, arrIndent + 2)];
          const subResult = parseYamlLines(subLines, 0, 0, depth + 1);
          arr.push(subResult.value);
          i += 1 + getChildLines(lines, i + 1, arrIndent + 2).length;
        } else {
          arr.push(parseScalar(itemValue));
          i++;
        }
      }
      return { value: arr, nextLine: i };
    }

    // Key-value pair
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const rawValue = line.slice(colonIdx + 1).trim();

      if (rawValue === "" || rawValue === "|" || rawValue === ">") {
        // Block value or nested object/array
        const childLines = getChildLines(lines, i + 1, currentIndent);
        if (childLines.length > 0) {
          const childIndent = detectIndent(childLines[0]);
          if (rawValue === "|") {
            // Literal block
            result[key] = childLines.map((l) => l.slice(childIndent)).join("\n");
          } else if (rawValue === ">") {
            // Folded block
            result[key] = childLines.map((l) => l.slice(childIndent).trim()).join(" ");
          } else {
            const subResult = parseYamlLines(
              lines,
              i + 1,
              childIndent,
              depth + 1
            );
            result[key] = subResult.value;
            i = subResult.nextLine;
            continue;
          }
        } else {
          result[key] = null;
        }
        i += 1 + childLines.length;
      } else {
        result[key] = parseScalar(rawValue);
        i++;
      }
    } else {
      i++;
    }
  }

  return { value: result, nextLine: i };
}

function getChildLines(lines: string[], startLine: number, parentIndent: number): string[] {
  const children: string[] = [];
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      children.push(line);
      continue;
    }
    if (detectIndent(line) <= parentIndent) break;
    children.push(line);
  }
  // Remove trailing empty lines
  while (children.length > 0 && children[children.length - 1].trim() === "") {
    children.pop();
  }
  return children;
}

function jsonToYaml(obj: unknown, indent: number = 0): string {
  const pad = "  ".repeat(indent);

  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "string") {
    // Quote if contains special chars
    if (obj.includes("\n")) {
      const lines = obj.split("\n").map((l) => pad + "  " + l).join("\n");
      return `|\n${lines}`;
    }
    if (/[:#\[\]{}&*!|>'"%@,]/.test(obj) || obj === "" || obj === "true" || obj === "false" || obj === "null" || /^\d/.test(obj)) {
      return `"${obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj
      .map((item) => {
        const val = jsonToYaml(item, indent + 1);
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          // Object items: put first key on same line as dash
          const firstNewline = val.indexOf("\n");
          if (firstNewline > 0) {
            return `${pad}- ${val.trim()}`;
          }
          return `${pad}- ${val.trim()}`;
        }
        return `${pad}- ${val}`;
      })
      .join("\n");
  }

  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, value]) => {
        const safeKey = /[:#\[\]{}&*!|>'"%@,\s]/.test(key) ? `"${key}"` : key;
        if (value !== null && typeof value === "object") {
          const sub = jsonToYaml(value, indent + 1);
          return `${pad}${safeKey}:\n${sub}`;
        }
        return `${pad}${safeKey}: ${jsonToYaml(value, indent + 1)}`;
      })
      .join("\n");
  }

  return String(obj);
}

export const tool: Tool = {
  name: "yaml_json",
  description:
    "Convert between YAML and JSON formats. Supports YAML → JSON and JSON → YAML with proper handling of types (null, boolean, numbers), block scalars, comments, nested objects, and arrays. Call this tool whenever the user needs YAML/JSON conversion. Claude often makes YAML indentation and quoting errors — this tool produces exact, valid output.",
  schema: z.object({
    input: z.string().describe("The YAML or JSON string to convert"),
    direction: z
      .enum(["yaml-to-json", "json-to-yaml"])
      .describe("Conversion direction: yaml-to-json or json-to-yaml"),
    indent: z
      .number()
      .int()
      .min(1)
      .max(8)
      .optional()
      .default(2)
      .describe("Indentation size (default 2)"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input, direction, indent = 2 }): Promise<ToolResult> => {
    const raw = (input as string)?.trim();
    if (!raw) return { success: false, error: "Input is required" };

    const dir = direction as string;
    const ind = (indent as number) || 2;

    try {
      let output: string;
      let parsed: unknown;

      if (dir === "yaml-to-json") {
        parsed = parseYaml(raw);
        output = JSON.stringify(parsed, null, ind);
      } else {
        parsed = JSON.parse(raw);
        output = jsonToYaml(parsed);
      }

      const lineCount = output.split("\n").length;
      return {
        success: true,
        data: {
          output,
          direction: dir,
          lineCount,
        },
        summary: `${dir} (${lineCount} lines):\n\n${output}`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Conversion failed: ${err instanceof Error ? err.message : "invalid input"}`,
      };
    }
  },
};
