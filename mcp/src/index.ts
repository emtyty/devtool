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
];

const server = new McpServer({
  name: "devtoolkit-mcp",
  version: "0.1.0",
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
