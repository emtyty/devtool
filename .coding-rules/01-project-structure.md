# 01 — Project Structure

## Directory Layout

```
├── App.tsx                    # Main app — routing, layout, sidebar, theme
├── index.tsx                  # React entry point with error handling
├── index.html                 # HTML shell, dark mode detection, fonts
├── index.css                  # Global styles, Tailwind, dark mode overrides
├── types.ts                   # Shared TypeScript types & interfaces
│
├── components/                # React components (one component per file)
│   ├── [ToolName].tsx         # Tool components (lazy-loaded)
│   ├── CopyButton.tsx         # Reusable UI components
│   ├── ResizableSplit.tsx     # Layout components
│   └── ...
│
├── utils/                     # Pure utility functions (NO React imports)
│   ├── formatter.ts           # Formatting logic
│   ├── smartDetect.ts         # Content type detection
│   ├── colorMath.ts           # Color space conversions
│   └── ...
│
├── lib/                       # Specialized analysis libraries
│   ├── harAnalyzer.ts         # HAR file analysis
│   └── SQLPlanAnalyzer.ts     # SQL plan parsing
│
├── tests/                     # Test files
│   ├── setup.ts               # Vitest setup + global mocks
│   ├── *.test.ts              # Unit tests
│   └── integration/           # Integration tests
│       └── *.test.tsx
│
├── mcp/                       # MCP server (separate Node.js package)
│   ├── src/
│   │   ├── index.ts           # Server entry point
│   │   ├── registry.ts        # Tool registry
│   │   └── tools/             # MCP tool implementations
│   └── package.json
│
└── public/                    # Static assets
    └── test-data/
```

## Rules

### File Placement

| Type | Location | Example |
|---|---|---|
| React tool component | `components/[ToolName].tsx` | `components/JsonTools.tsx` |
| Reusable UI component | `components/[Name].tsx` | `components/CopyButton.tsx` |
| Pure utility function | `utils/[topic].ts` | `utils/colorMath.ts` |
| Complex analysis lib | `lib/[Name].ts` | `lib/SQLPlanAnalyzer.ts` |
| Shared types | `types.ts` | — |
| Tests | `tests/` or `tests/integration/` | `tests/smartDetect.test.ts` |

### Principles

1. **One component per file** — each `.tsx` file exports one primary component
2. **Business logic in `utils/` or `lib/`** — components handle UI and state only
3. **No React in `utils/`** — utility files must be pure functions, no hooks or JSX
4. **Co-locate small helpers** — private helper functions can live inside the component file (above the main export)
5. **Shared types in `types.ts`** — component-local types can be defined in the component file
6. **`lib/` vs `utils/`** — `lib/` is for large, complex analysis modules; `utils/` is for small, focused utility functions
7. **MCP server is a separate package** — it has its own `package.json`, `tsconfig.json`, and build pipeline
