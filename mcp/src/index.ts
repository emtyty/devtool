import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Tool } from "./registry.js";

// Import all tools
import { tool as repairJson } from "./tools/repair-json.js";
import { tool as formatSql } from "./tools/format-sql.js";
import { tool as formatList } from "./tools/format-list.js";
import { tool as cleanList } from "./tools/clean-list.js";
import { tool as decodeJwt } from "./tools/decode-jwt.js";
import { tool as generateMock } from "./tools/generate-mock.js";
import { tool as parseCron } from "./tools/parse-cron.js";
import { tool as convertEpoch } from "./tools/convert-epoch.js";
import { tool as convertColor } from "./tools/convert-color.js";
import { tool as detectContent } from "./tools/detect-content.js";
import { tool as hashText } from "./tools/hash-text.js";
import { tool as encodeDecode } from "./tools/encode-decode.js";
import { tool as uuidGenerate } from "./tools/uuid-generate.js";
import { tool as regexTest } from "./tools/regex-test.js";
import { tool as numberBase } from "./tools/number-base.js";
import { tool as diffText } from "./tools/diff-text.js";
import { tool as passwordGenerate } from "./tools/password-generate.js";
import { tool as urlParse } from "./tools/url-parse.js";
import { tool as jsonToTypes } from "./tools/json-to-types.js";
import { tool as yamlJson } from "./tools/yaml-json.js";
import { tool as httpStatus } from "./tools/http-status.js";
import { tool as stringCase } from "./tools/string-case.js";
import { tool as ipSubnet } from "./tools/ip-subnet.js";
import { tool as timestampCalc } from "./tools/timestamp-calc.js";
import { tool as csvTransform } from "./tools/csv-transform.js";
import { tool as generateDiagram } from "./tools/generate-diagram.js";

const ALL_TOOLS: Tool[] = [
  repairJson,
  formatSql,
  formatList,
  cleanList,
  decodeJwt,
  generateMock,
  parseCron,
  convertEpoch,
  convertColor,
  detectContent,
  hashText,
  encodeDecode,
  uuidGenerate,
  regexTest,
  numberBase,
  diffText,
  passwordGenerate,
  urlParse,
  jsonToTypes,
  yamlJson,
  httpStatus,
  stringCase,
  ipSubnet,
  timestampCalc,
  csvTransform,
  generateDiagram,
];

const server = new McpServer({
  name: "devtoolkit-mcp",
  version: "0.1.0",
  instructions: [
    "DevToolKit MCP provides 26 developer utility tools that compute exact results.",
    "",
    "WHEN TO USE THESE TOOLS instead of answering natively:",
    "- Hashing (MD5, SHA-256, etc.) — AI cannot compute hashes, use hash_text",
    "- UUID/ULID generation — AI cannot produce crypto-random IDs, use uuid_generate",
    "- Base64/URL/HTML encoding/decoding — AI often gets these wrong, use encode_decode",
    "- Regex testing with captures — AI often mismatches, use regex_test",
    "- Subnet/CIDR calculation — AI often miscalculates, use ip_subnet",
    "- Date arithmetic and timezone conversion — AI often drifts, use timestamp_calc or convert_epoch",
    "- Number base conversion (hex/bin/oct) — AI often errors on large numbers, use number_base_convert",
    "- Password generation — AI cannot produce crypto-random output, use password_generate",
    "- CSV parsing with quoted fields — AI approximates, use csv_transform",
    "- Line-by-line text diff — AI misses changes, use diff_text",
    "- Color conversion with WCAG contrast — needs exact math, use convert_color",
    "- JSON repair — needs parser, use repair_json",
    "- SQL formatting — needs formatter, use format_sql",
    "",
    "GENERAL RULE: If a task requires exact computation, cryptographic randomness,",
    "or precise parsing — use the appropriate devtoolkit tool rather than guessing.",
    "All tools run locally with zero network requests.",
  ].join("\n"),
});

// Register all tools
for (const t of ALL_TOOLS) {
  server.tool(
    t.name,
    t.description,
    t.schema.shape,
    t.annotations ?? { readOnlyHint: true },
    async (params) => {
      try {
        const result = await t.execute(params);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }, null, 2) }],
          isError: true,
        };
      }
    }
  );
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
