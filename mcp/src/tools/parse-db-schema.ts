import { z } from "zod";
import type { Tool, ToolResult } from "../registry.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface DbColumn {
  name: string;
  type: string;
  isPK: boolean;
  isFK: boolean;
  isNullable: boolean;
  isUnique: boolean;
}

interface DbRelation {
  fromTable: string;
  fromCol: string;
  toTable: string;
  toCol: string;
  nullable: boolean;
}

interface DbTable {
  name: string;
  columns: DbColumn[];
}

interface ParsedSchema {
  tables: DbTable[];
  relations: DbRelation[];
  inputFormat: "sql" | "prisma" | "dbdiagram" | "unknown";
}

// ── Format detection ─────────────────────────────────────────────────────────

function detectInputFormat(input: string): ParsedSchema["inputFormat"] {
  if (/CREATE\s+TABLE/i.test(input)) return "sql";
  if (/^\s*model\s+\w+\s*\{/m.test(input)) return "prisma";
  if (/^\s*Table\s+\w+\s*\{/m.test(input)) return "dbdiagram";
  return "unknown";
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function simplifyType(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\(.*\)/, "").trim();
  if (/^(int|integer|bigint|smallint|tinyint|serial|bigserial|int2|int4|int8)$/.test(t)) return "int";
  if (/^(varchar|nvarchar|char|nchar|text|tinytext|mediumtext|longtext|string|citext)$/.test(t)) return "string";
  if (/^(float|double|real|numeric|decimal|money|number)$/.test(t)) return "float";
  if (/^(bool|boolean|bit)$/.test(t)) return "boolean";
  if (/^date$/.test(t)) return "date";
  if (/^(datetime|timestamp|timestamptz|datetime2)$/.test(t)) return "datetime";
  if (/^time/.test(t)) return "time";
  if (/^(uuid|uniqueidentifier|guid)$/.test(t)) return "uuid";
  if (/^(json|jsonb)$/.test(t)) return "json";
  if (/^(blob|bytea|binary|varbinary|image|bytes)$/.test(t)) return "bytes";
  return t.replace(/\s+/, "_") || "string";
}

function unquote(s: string): string {
  return s.trim().replace(/^[`"\[]|[`"\]]$/g, "");
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function extractParenList(s: string): string[] {
  const m = /\(([^)]+)\)/.exec(s);
  if (!m) return [];
  return m[1].split(",").map((c) => unquote(c.trim())).filter(Boolean);
}

// ── SQL DDL parser ───────────────────────────────────────────────────────────

function parseSql(input: string): ParsedSchema {
  const clean = stripSqlComments(input);
  const tables: DbTable[] = [];
  const relations: DbRelation[] = [];

  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?[\w.]+[`"\]]?)\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = createTableRe.exec(clean)) !== null) {
    const tableName = unquote(match[1]).split(".").pop()!;

    let depth = 1;
    let i = match.index + match[0].length;
    let body = "";
    while (i < clean.length && depth > 0) {
      if (clean[i] === "(") depth++;
      else if (clean[i] === ")") { depth--; if (depth === 0) break; }
      body += clean[i];
      i++;
    }

    const columns: DbColumn[] = [];
    const tableLevelPKs: string[] = [];
    const tableLevelFKs: { col: string; refTable: string; refCol: string }[] = [];

    for (const part of splitTopLevel(body)) {
      const line = part.trim();
      if (!line) continue;

      if (/^PRIMARY\s+KEY/i.test(line)) {
        tableLevelPKs.push(...extractParenList(line));
        continue;
      }
      if (/FOREIGN\s+KEY/i.test(line)) {
        const colM = /FOREIGN\s+KEY\s*\(([^)]+)\)/i.exec(line);
        const refM = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line);
        if (colM && refM) {
          tableLevelFKs.push({
            col: unquote(colM[1].trim()),
            refTable: unquote(refM[1]).split(".").pop()!,
            refCol: unquote(refM[2].trim()),
          });
        }
        continue;
      }
      if (/^UNIQUE\s*\(/i.test(line) || /^(INDEX|KEY)\b/i.test(line)) continue;
      if (/^CONSTRAINT\b/i.test(line)) {
        if (/PRIMARY\s+KEY/i.test(line)) {
          tableLevelPKs.push(...extractParenList(line.replace(/.*PRIMARY\s+KEY/i, "")));
        } else if (/FOREIGN\s+KEY/i.test(line)) {
          const colM = /FOREIGN\s+KEY\s*\(([^)]+)\)/i.exec(line);
          const refM = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line);
          if (colM && refM) {
            tableLevelFKs.push({
              col: unquote(colM[1].trim()),
              refTable: unquote(refM[1]).split(".").pop()!,
              refCol: unquote(refM[2].trim()),
            });
          }
        }
        continue;
      }

      const colM = /^([`"\[]?[\w]+[`"\]]?)\s+(\w[\w\s()]*?)(?:\s+(.*))?$/.exec(line);
      if (!colM) continue;

      const colName = unquote(colM[1]);
      if (["PRIMARY", "FOREIGN", "UNIQUE", "INDEX", "KEY", "CONSTRAINT", "CHECK"].includes(colName.toUpperCase())) continue;

      const rawType = colM[2].replace(/\([\d, ]+\)/, "").trim();
      const rest = ((colM[3] ?? "") + " " + colM[2]).toUpperCase();

      const isPK = /\bPRIMARY\s+KEY\b/.test(rest);
      const isNullable = !/\bNOT\s+NULL\b/.test(rest) && !isPK;
      const isUnique = /\bUNIQUE\b/.test(rest);

      const inlineRef = /REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i.exec(line);
      let isFK = false;
      if (inlineRef) {
        isFK = true;
        tableLevelFKs.push({
          col: colName,
          refTable: unquote(inlineRef[1]).split(".").pop()!,
          refCol: unquote(inlineRef[2].trim()),
        });
      }

      if (isPK) tableLevelPKs.push(colName);
      columns.push({ name: colName, type: simplifyType(rawType), isPK, isFK, isNullable, isUnique });
    }

    for (const pk of tableLevelPKs) {
      const col = columns.find((c) => c.name === pk);
      if (col) col.isPK = true;
    }
    for (const { col } of tableLevelFKs) {
      const c = columns.find((x) => x.name === col);
      if (c) c.isFK = true;
    }

    tables.push({ name: tableName, columns });

    for (const { col, refTable, refCol } of tableLevelFKs) {
      const srcCol = columns.find((c) => c.name === col);
      relations.push({
        fromTable: tableName,
        fromCol: col,
        toTable: refTable,
        toCol: refCol,
        nullable: srcCol?.isNullable ?? true,
      });
    }
  }

  const alterRe = /ALTER\s+TABLE\s+([`"\[]?[\w.]+[`"\]]?)\s+ADD\s+(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/gi;
  while ((match = alterRe.exec(clean)) !== null) {
    const fromTable = unquote(match[1]).split(".").pop()!;
    const fromCol = unquote(match[2].trim());
    const toTable = unquote(match[3]).split(".").pop()!;
    const toCol = unquote(match[4].trim());
    const col = tables.find((t) => t.name === fromTable)?.columns.find((c) => c.name === fromCol);
    if (col) col.isFK = true;
    relations.push({ fromTable, fromCol, toTable, toCol, nullable: col?.isNullable ?? true });
  }

  return { tables, relations, inputFormat: "sql" };
}

// ── Prisma parser ────────────────────────────────────────────────────────────

function parsePrisma(input: string): ParsedSchema {
  const tables: DbTable[] = [];
  const relations: DbRelation[] = [];

  const modelNames = new Set<string>();
  for (const m of input.matchAll(/^model\s+(\w+)\s*\{/gm)) modelNames.add(m[1]);

  const SCALARS = new Set(["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"]);

  for (const m of input.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
    const modelName = m[1];
    const body = m[2];
    const columns: DbColumn[] = [];
    const fkFields = new Set<string>();

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

      const fM = /^(\w+)\s+(\w+)(\?)?((\[\])?)\s*(.*)$/.exec(trimmed);
      if (!fM) continue;

      const [, name, type, optional, , isArray, attrs = ""] = fM;

      if (modelNames.has(type)) {
        if (!isArray) {
          const relAttr = /@relation\s*\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\][^)]*\)/.exec(attrs);
          if (relAttr) {
            const fromCols = relAttr[1].split(",").map((s) => s.trim());
            const toCols = relAttr[2].split(",").map((s) => s.trim());
            fromCols.forEach((fc) => fkFields.add(fc));
            relations.push({
              fromTable: modelName,
              fromCol: fromCols[0] ?? "",
              toTable: type,
              toCol: toCols[0] ?? "id",
              nullable: !!optional,
            });
          }
        }
        continue;
      }

      if (!SCALARS.has(type) && /^[A-Z]/.test(type)) continue;

      columns.push({
        name,
        type: simplifyType(type.toLowerCase()),
        isPK: /@id\b/.test(attrs),
        isFK: false,
        isNullable: !!optional,
        isUnique: /@unique\b/.test(attrs),
      });
    }

    for (const col of columns) {
      if (fkFields.has(col.name)) col.isFK = true;
    }
    tables.push({ name: modelName, columns });
  }

  return { tables, relations, inputFormat: "prisma" };
}

// ── dbdiagram parser ─────────────────────────────────────────────────────────

function parseDbdiagram(input: string): ParsedSchema {
  const tables: DbTable[] = [];
  const relations: DbRelation[] = [];

  for (const m of input.matchAll(/Table\s+(\w+)(?:\s+as\s+\w+)?\s*\{([^}]*)\}/g)) {
    const tableName = m[1];
    const columns: DbColumn[] = [];

    for (const line of m[2].split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("Note")) continue;

      const cM = /^(\w+)\s+(\w+)\s*(?:\[([^\]]*)\])?/.exec(trimmed);
      if (!cM) continue;

      const [, name, type, attrs = ""] = cM;
      const isPK = /\bpk\b/i.test(attrs);
      const isUnique = /\bunique\b/i.test(attrs);
      const isNullable = /\bnot\s+null\b/i.test(attrs) ? false : !isPK;

      const refM = /ref:\s*[<>-]\s*(\w+)\.(\w+)/i.exec(attrs);
      let isFK = false;
      if (refM) {
        isFK = true;
        relations.push({ fromTable: tableName, fromCol: name, toTable: refM[1], toCol: refM[2], nullable: isNullable });
      }
      columns.push({ name, type: simplifyType(type), isPK, isFK, isNullable, isUnique });
    }

    tables.push({ name: tableName, columns });
  }

  for (const m of input.matchAll(/^Ref(?::\s*\w+)?\s*:\s*(\w+)\.(\w+)\s*[<>-]+\s*(\w+)\.(\w+)/gm)) {
    relations.push({ fromTable: m[1], fromCol: m[2], toTable: m[3], toCol: m[4], nullable: true });
    const col = tables.find((t) => t.name === m[1])?.columns.find((c) => c.name === m[2]);
    if (col) col.isFK = true;
  }

  return { tables, relations, inputFormat: "dbdiagram" };
}

// ── Main parser entry ────────────────────────────────────────────────────────

function parseSchema(input: string): ParsedSchema {
  const format = detectInputFormat(input.trim());
  if (format === "sql") return parseSql(input);
  if (format === "prisma") return parsePrisma(input);
  if (format === "dbdiagram") return parseDbdiagram(input);
  const tried = parseSql(input);
  if (tried.tables.length > 0) return tried;
  return { tables: [], relations: [], inputFormat: "unknown" };
}

// ── Mermaid erDiagram generator ──────────────────────────────────────────────

function schemaToMermaid(schema: ParsedSchema): string {
  if (schema.tables.length === 0) return "";

  const lines: string[] = ["erDiagram"];
  const tableNames = new Set(schema.tables.map((t) => t.name));

  for (const table of schema.tables) {
    lines.push(`    ${table.name} {`);
    for (const col of table.columns) {
      const annotations: string[] = [];
      if (col.isPK) annotations.push("PK");
      if (col.isFK) annotations.push("FK");
      if (col.isUnique && !col.isPK) annotations.push("UK");
      const safeName = col.name.replace(/[^a-zA-Z0-9_]/g, "_");
      const suffix = annotations.length ? ` "${annotations.join(",")}"` : "";
      lines.push(`        ${col.type} ${safeName}${suffix}`);
    }
    lines.push("    }");
  }

  const seen = new Set<string>();
  for (const rel of schema.relations) {
    if (!tableNames.has(rel.toTable)) continue;
    const key = `${rel.toTable}->${rel.fromTable}:${rel.fromCol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const arrow = rel.nullable ? "||--o{" : "||--|{";
    lines.push(`    ${rel.toTable} ${arrow} ${rel.fromTable} : "${rel.fromCol}"`);
  }

  return lines.join("\n");
}

// ── Tool export ──────────────────────────────────────────────────────────────

export const tool: Tool = {
  name: "parse_db_schema",
  description:
    "Parse a database schema (SQL DDL `CREATE TABLE`, Prisma `model`, or dbdiagram.io `Table` syntax) into structured tables + relationships, and generate a Mermaid `erDiagram` visualization. Auto-detects input format. Handles inline FK (`REFERENCES`), `ALTER TABLE ADD FOREIGN KEY`, Prisma `@relation(fields: [...], references: [...], onDelete: ...)`, and dbdiagram `[ref: > table.col]`. Call this whenever the user provides a schema definition and wants to visualize it, extract relationships, or generate an ER diagram. Claude often miscounts relations or omits FKs — this tool parses the canonical grammar for exact results.",
  schema: z.object({
    input: z
      .string()
      .min(1)
      .describe("The schema text — SQL CREATE TABLE statements, Prisma schema, or dbdiagram.io syntax. Format is auto-detected."),
    output: z
      .enum(["mermaid", "json", "both"])
      .optional()
      .default("both")
      .describe("What to return: Mermaid erDiagram code, JSON structure, or both (default)."),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ input, output = "both" }): Promise<ToolResult> => {
    const text = input as string;
    const mode = (output as string) ?? "both";

    const schema = parseSchema(text);

    if (schema.tables.length === 0) {
      return {
        success: false,
        error: "No tables detected. Input should be SQL CREATE TABLE, Prisma `model`, or dbdiagram.io `Table` syntax.",
      };
    }

    const mermaid = schemaToMermaid(schema);

    const data: Record<string, unknown> = { format: schema.inputFormat };
    if (mode === "mermaid" || mode === "both") data.mermaid = mermaid;
    if (mode === "json" || mode === "both") {
      data.tables = schema.tables;
      data.relations = schema.relations;
    }
    data.tableCount = schema.tables.length;
    data.relationCount = schema.relations.length;

    const summary =
      `Detected ${schema.inputFormat} schema — ${schema.tables.length} table(s), ${schema.relations.length} relation(s).\n` +
      schema.tables.map((t) => `  ${t.name}  (${t.columns.length} columns)`).join("\n") +
      (mermaid ? "\n\nMermaid erDiagram:\n" + mermaid : "");

    return { success: true, data, summary };
  },
};
