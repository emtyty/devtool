import { z } from "zod";
import { generateValue, generateData, FIELD_TYPES } from "../../../utils/mockDataGenerator.js";
import type { Tool, ToolResult } from "../registry.js";

const FIELD_TYPE_VALUES = FIELD_TYPES.map((f) => f.value);

export const tool: Tool = {
  name: "generate_mock_data",
  description:
    `Generate realistic mock data using Faker.js with ${FIELD_TYPES.length}+ field types, output as JSON, CSV, or SQL INSERT. Call this tool whenever the user asks to generate test data, fake data, sample datasets, seed data, or dummy records. Supports 1-1000 rows with custom field names. Available field types: ${FIELD_TYPE_VALUES.join(", ")}. Returns ready-to-use output — more consistent than manually inventing test data.`,
  schema: z.object({
    fields: z
      .array(
        z.object({
          name: z.string().describe("Column/field name"),
          type: z.string().describe(`Data type. Available: ${FIELD_TYPE_VALUES.join(", ")}`),
        })
      )
      .describe("List of fields to generate. Each has a name and type."),
    rows: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .default(10)
      .describe("Number of rows to generate (1-1000)"),
    format: z
      .enum(["JSON", "CSV", "SQL"])
      .default("JSON")
      .describe("Output format"),
    tableName: z
      .string()
      .default("mock_data")
      .describe("Table name for SQL output"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ fields, rows, format, tableName }): Promise<ToolResult> => {
    const fieldDefs = fields as { name: string; type: string }[];
    const rowCount = (rows as number) || 10;
    const outputFormat = ((format as string) || "JSON") as "JSON" | "CSV" | "SQL";
    const table = (tableName as string) || "mock_data";

    // Convert simple field defs to MockField format
    const mockFields = fieldDefs.map((f, i) => ({
      id: `field_${i}`,
      name: f.name,
      type: f.type as any,
    }));

    const output = generateData(mockFields, rowCount, outputFormat, table);

    return {
      success: true,
      data: {
        output,
        rowCount,
        fieldCount: fieldDefs.length,
        format: outputFormat,
      },
      summary: `Generated ${rowCount} rows with ${fieldDefs.length} fields as ${outputFormat}.\n\n${output.length > 2000 ? output.slice(0, 2000) + "\n...(truncated)" : output}`,
    };
  },
};
