import { z } from "zod";
import { format as formatSql } from "sql-formatter";
import type { Tool, ToolResult } from "../registry.js";

const DIALECTS = [
  "sql",
  "bigquery",
  "db2",
  "db2i",
  "hive",
  "mariadb",
  "mysql",
  "n1ql",
  "plsql",
  "postgresql",
  "redshift",
  "singlestoredb",
  "snowflake",
  "spark",
  "sqlite",
  "transactsql",
  "trino",
  "tsql",
] as const;

export const tool: Tool = {
  name: "format_sql",
  description:
    "Format or minify SQL queries with proper indentation and keyword casing. Call this tool whenever the user provides a SQL query to format, beautify, pretty-print, or compress into one line. Supports 18 dialects: SQL, MySQL, PostgreSQL, T-SQL, BigQuery, Snowflake, MariaDB, SQLite, and more. Returns consistently formatted SQL with uppercase keywords and 2-space indentation. More reliable than manual formatting because it handles complex nested subqueries, CTEs, and window functions correctly.",
  schema: z.object({
    sql: z.string().describe("The SQL query to format"),
    dialect: z
      .enum(DIALECTS)
      .default("sql")
      .describe("SQL dialect (default: sql). Use tsql for SQL Server, postgresql for Postgres, mysql for MySQL."),
    mode: z
      .enum(["format", "minify"])
      .default("format")
      .describe("'format' for pretty-print, 'minify' for single line"),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ sql, dialect, mode }): Promise<ToolResult> => {
    const input = (sql as string).trim();
    if (!input) {
      return { success: false, error: "Empty SQL input" };
    }

    try {
      const language = (dialect as string) || "sql";

      if (mode === "minify") {
        const minified = input
          .replace(/--.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\s+/g, " ")
          .trim();
        return {
          success: true,
          data: { formatted: minified, mode: "minify", dialect: language },
          summary: `SQL minified (${minified.length} chars).`,
        };
      }

      const formatted = formatSql(input, {
        language: language as any,
        tabWidth: 2,
        keywordCase: "upper",
      });

      return {
        success: true,
        data: { formatted, mode: "format", dialect: language },
        summary: `SQL formatted (${formatted.split("\n").length} lines, dialect: ${language}).`,
      };
    } catch (err) {
      return {
        success: false,
        error: `SQL format error: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  },
};
