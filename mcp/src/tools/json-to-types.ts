import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

type OutputFormat = "typescript" | "zod" | "json-schema";

function inferType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function toTypescriptInterface(
  obj: unknown,
  name: string,
  indent: number = 0,
  interfaces: string[] = [],
  seen: Set<string> = new Set()
): string {
  const pad = "  ".repeat(indent);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "unknown[]";
    const itemType = toTypescriptInterface(obj[0], name + "Item", 0, interfaces, seen);
    return `${itemType}[]`;
  }

  if (obj !== null && typeof obj === "object") {
    const ifaceName = name.charAt(0).toUpperCase() + name.slice(1);

    if (seen.has(ifaceName)) return ifaceName;
    seen.add(ifaceName);

    const lines: string[] = [];
    lines.push(`${pad}interface ${ifaceName} {`);

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
      const valueType = toTypescriptInterface(value, key, indent + 1, interfaces, seen);
      lines.push(`${pad}  ${safeKey}: ${valueType};`);
    }

    lines.push(`${pad}}`);
    interfaces.push(lines.join("\n"));
    return ifaceName;
  }

  if (typeof obj === "string") return "string";
  if (typeof obj === "number") return Number.isInteger(obj) ? "number" : "number";
  if (typeof obj === "boolean") return "boolean";
  if (obj === null) return "null";
  return "unknown";
}

function toZodSchema(obj: unknown, indent: number = 0): string {
  const pad = "  ".repeat(indent);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "z.array(z.unknown())";
    return `z.array(\n${pad}  ${toZodSchema(obj[0], indent + 1)}\n${pad})`;
  }

  if (obj !== null && typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "z.object({})";

    const lines = entries.map(([key, value]) => {
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
      return `${pad}  ${safeKey}: ${toZodSchema(value, indent + 1)},`;
    });
    return `z.object({\n${lines.join("\n")}\n${pad}})`;
  }

  if (typeof obj === "string") return "z.string()";
  if (typeof obj === "number") return Number.isInteger(obj) ? "z.number().int()" : "z.number()";
  if (typeof obj === "boolean") return "z.boolean()";
  if (obj === null) return "z.null()";
  return "z.unknown()";
}

function toJsonSchema(obj: unknown): Record<string, unknown> {
  if (Array.isArray(obj)) {
    return {
      type: "array",
      items: obj.length > 0 ? toJsonSchema(obj[0]) : {},
    };
  }

  if (obj !== null && typeof obj === "object") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      properties[key] = toJsonSchema(value);
      if (value !== null && value !== undefined) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (typeof obj === "string") return { type: "string" };
  if (typeof obj === "number") {
    return Number.isInteger(obj) ? { type: "integer" } : { type: "number" };
  }
  if (typeof obj === "boolean") return { type: "boolean" };
  if (obj === null) return { type: "null" };
  return {};
}

export const tool: Tool = {
  name: "json_to_types",
  description:
    "Convert a JSON sample into TypeScript interfaces, Zod schemas, or JSON Schema. Handles nested objects, arrays, nullable fields, and special key names. Call this tool whenever the user has JSON data and needs type definitions. More reliable than manual conversion — handles edge cases like optional fields, mixed arrays, and reserved characters in keys.",
  schema: z.object({
    json: z.string().describe("The JSON string to convert into types"),
    format: z
      .enum(["typescript", "zod", "json-schema"])
      .optional()
      .default("typescript")
      .describe("Output format: typescript (interfaces), zod (Zod schema), json-schema (JSON Schema draft-07)"),
    rootName: z
      .string()
      .optional()
      .default("Root")
      .describe("Name for the root type/interface (default: 'Root')"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ json, format = "typescript", rootName = "Root" }): Promise<ToolResult> => {
    const raw = (json as string)?.trim();
    if (!raw) return { success: false, error: "JSON input is required" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return {
        success: false,
        error: `Invalid JSON: ${err instanceof Error ? err.message : "parse error"}`,
      };
    }

    const name = (rootName as string) || "Root";
    const fmt = (format as string) || "typescript";
    let output: string;

    switch (fmt) {
      case "typescript": {
        const interfaces: string[] = [];
        const rootType = toTypescriptInterface(parsed, name, 0, interfaces, new Set());
        if (interfaces.length > 0) {
          output = interfaces.join("\n\n");
        } else {
          output = `type ${name} = ${rootType};`;
        }
        break;
      }
      case "zod": {
        const schema = toZodSchema(parsed);
        output = `import { z } from "zod";\n\nconst ${name}Schema = ${schema};\n\ntype ${name} = z.infer<typeof ${name}Schema>;`;
        break;
      }
      case "json-schema": {
        const schema = {
          $schema: "http://json-schema.org/draft-07/schema#",
          title: name,
          ...toJsonSchema(parsed),
        };
        output = JSON.stringify(schema, null, 2);
        break;
      }
      default:
        return { success: false, error: `Unknown format: ${fmt}` };
    }

    return {
      success: true,
      data: {
        output,
        format: fmt,
        rootName: name,
      },
      summary: `${fmt} output:\n\n${output}`,
    };
  },
};
