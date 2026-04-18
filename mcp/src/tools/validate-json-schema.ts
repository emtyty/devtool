import { z } from "zod";
import AjvCtor from "ajv";
import addFormatsFn from "ajv-formats";
import type { Tool, ToolResult } from "../registry.js";

// CJS/ESM interop: ajv ships a CommonJS default export; Node16 module resolution
// wraps it behind `.default` when imported from ESM. Accept either shape.
const Ajv: any = (AjvCtor as any).default ?? AjvCtor;
const addFormats: any = (addFormatsFn as any).default ?? addFormatsFn;

interface SchemaError {
  path: string;
  message: string;
  keyword: string;
  schemaPath: string;
}

export const tool: Tool = {
  name: "validate_json_schema",
  description:
    "Validate a JSON payload against a JSON Schema (any draft) or an OpenAPI 3.x / Swagger 2.x spec. For OpenAPI input, specify which schema in `components.schemas` (3.x) or `definitions` (2.x) to validate against via the `schemaName` parameter. Returns precise per-field errors with the failing path (e.g. `/user/age`), the failing keyword (e.g. `minimum`, `required`, `enum`, `format`), and a human-readable message. Supports all common formats (email, uuid, date, date-time, ipv4, uri, etc.) via ajv-formats. Call this whenever the user provides a JSON payload and a schema and wants to verify conformance. Claude often misses required fields, enum mismatches, or format failures — this tool uses ajv for exact validation.",
  schema: z.object({
    payload: z
      .string()
      .min(1)
      .describe("The JSON payload to validate, as a string."),
    schema: z
      .string()
      .min(1)
      .describe("The JSON Schema or full OpenAPI / Swagger spec, as a string."),
    schemaName: z
      .string()
      .optional()
      .describe(
        "When validating against an OpenAPI/Swagger spec, the name of the schema under `components.schemas` (OpenAPI 3.x) or `definitions` (Swagger 2.x) to use. Defaults to the first schema if omitted."
      ),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ payload, schema, schemaName }): Promise<ToolResult> => {
    // Parse JSON inputs
    let payloadObj: unknown;
    try {
      payloadObj = JSON.parse(payload as string);
    } catch (err) {
      return {
        success: false,
        error: `Payload is not valid JSON: ${err instanceof Error ? err.message : "parse error"}`,
      };
    }

    let schemaObj: any;
    try {
      schemaObj = JSON.parse(schema as string);
    } catch (err) {
      return {
        success: false,
        error: `Schema is not valid JSON: ${err instanceof Error ? err.message : "parse error"}`,
      };
    }

    // Detect OpenAPI / Swagger
    const isOpenApi = !!(schemaObj.openapi || schemaObj.swagger);
    const availableSchemas: string[] = [];
    let resolvedSchema: any = schemaObj;
    let selectedName: string | undefined;

    if (isOpenApi) {
      const defs = schemaObj.components?.schemas ?? schemaObj.definitions ?? {};
      availableSchemas.push(...Object.keys(defs));

      const requested = (schemaName as string | undefined) ?? availableSchemas[0];
      if (!requested) {
        return {
          success: false,
          error: "No schemas found in components.schemas / definitions.",
          data: { availableSchemas },
        };
      }
      if (!defs[requested]) {
        return {
          success: false,
          error: `Schema "${requested}" not found in the spec. Available: ${availableSchemas.join(", ") || "(none)"}`,
          data: { availableSchemas },
        };
      }
      selectedName = requested;
      resolvedSchema = {
        ...defs[requested],
        components: schemaObj.components,
        definitions: schemaObj.definitions,
      };
    }

    // Compile & validate
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    try {
      const validate = ajv.compile(resolvedSchema);
      const valid = validate(payloadObj) as boolean;

      if (valid) {
        return {
          success: true,
          data: {
            valid: true,
            errors: [],
            schemaType: isOpenApi ? "openapi" : "json-schema",
            selectedSchema: selectedName,
            availableSchemas: isOpenApi ? availableSchemas : undefined,
          },
          summary:
            `Payload is valid${isOpenApi ? ` against OpenAPI schema "${selectedName}"` : ""}.`,
        };
      }

      const errors: SchemaError[] = (validate.errors ?? []).map((e: any) => ({
        path: e.instancePath || "(root)",
        message: e.message ?? "Unknown error",
        keyword: e.keyword,
        schemaPath: e.schemaPath,
      }));

      const summary =
        `Payload is INVALID — ${errors.length} error(s) found${
          isOpenApi ? ` (against "${selectedName}")` : ""
        }:\n` +
        errors
          .map((e, i) => `  ${i + 1}. [${e.keyword}] ${e.path} — ${e.message}`)
          .join("\n");

      return {
        success: true,
        data: {
          valid: false,
          errors,
          schemaType: isOpenApi ? "openapi" : "json-schema",
          selectedSchema: selectedName,
          availableSchemas: isOpenApi ? availableSchemas : undefined,
        },
        summary,
      };
    } catch (err) {
      return {
        success: false,
        error: `Schema compilation failed: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  },
};
