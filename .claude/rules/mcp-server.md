---
paths:
  - 'mcp/**'
---

# MCP Server

## Overview

The MCP server is an **independent Node.js package** under `mcp/` — it has its own `package.json`, `tsconfig.json`, and build pipeline (`tsup`). Do NOT mix its dependencies with the main app.

26 developer utilities exposed as MCP tools for AI-assisted workflows (Claude Desktop, Claude Code, Cursor, etc.).

## Structure

```
mcp/
├── src/
│   ├── index.ts           # Server entry point (stdio transport)
│   ├── registry.ts         # Tool registry — auto-registers all tools
│   ├── compat.ts           # Compatibility layer (browser → Node.js adaptations)
│   └── tools/              # One tool per file
│       ├── format-sql.ts
│       ├── repair-json.ts
│       ├── decode-jwt.ts
│       └── ... (26 tools)
├── package.json            # Separate dependencies
├── tsconfig.json           # Separate TS config
└── tsup.config.ts          # Build config → mcp/dist/
```

## Tool File Pattern

Each tool exports a standard shape:

```typescript
import { z } from 'zod';

export const name = 'format-sql';
export const description = 'Format and beautify SQL queries';

export const schema = z.object({
  sql: z.string().describe('SQL query to format'),
  dialect: z.string().optional().describe('SQL dialect'),
});

export async function execute(args: z.infer<typeof schema>) {
  // Pure logic — adapt from utils/ if needed
  // Use Buffer.from() instead of atob(), etc.
}
```

## Commands

```bash
npm run mcp:build    # Build MCP server (tsup → mcp/dist/)
npm run mcp:dev      # Dev MCP server with watch
npm run mcp:inspect  # Inspect with MCP Inspector
```

## Rules

1. **Independent package** — own `package.json`, don't add MCP deps to root
2. **One tool per file** in `mcp/src/tools/`
3. **Zod schemas** for input validation
4. **Pure logic** — extract from `utils/` but adapt browser APIs (e.g., `atob` → `Buffer.from`)
5. **No external API calls** — everything runs locally
6. **Build with tsup** — do not use Vite for MCP server
