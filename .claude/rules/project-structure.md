# Project Structure & Naming Conventions

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
│   └── ResizableSplit.tsx     # Layout components
│
├── utils/                     # Pure utility functions (NO React imports)
│   ├── formatter.ts           # Formatting logic
│   ├── smartDetect.ts         # Content type detection
│   └── colorMath.ts           # Color space conversions
│
├── lib/                       # Specialized analysis libraries (200+ lines)
│   ├── harAnalyzer.ts         # HAR file analysis
│   └── SQLPlanAnalyzer.ts     # SQL plan parsing
│
├── tests/                     # Test files (not co-located)
│   ├── setup.ts               # Vitest setup + global mocks
│   ├── *.test.ts              # Unit tests
│   └── integration/           # Integration tests
│
├── mcp/                       # MCP server (separate Node.js package)
│   ├── src/
│   │   ├── index.ts           # Server entry point
│   │   ├── registry.ts        # Tool registry
│   │   └── tools/             # MCP tool implementations
│   └── package.json
│
└── public/                    # Static assets
```

## File Placement Rules

| Type | Location | Example |
|---|---|---|
| React tool component | `components/[ToolName].tsx` | `components/JsonTools.tsx` |
| Reusable UI component | `components/[Name].tsx` | `components/CopyButton.tsx` |
| Pure utility function | `utils/[topic].ts` | `utils/colorMath.ts` |
| Complex analysis lib | `lib/[Name].ts` | `lib/SQLPlanAnalyzer.ts` |
| Shared types | `types.ts` | — |
| Tests | `tests/` or `tests/integration/` | `tests/smartDetect.test.ts` |

## Principles

1. **One component per file** — each `.tsx` file exports one primary component
2. **Business logic in `utils/` or `lib/`** — components handle UI and state only
3. **No React in `utils/`** — utility files must be pure functions, no hooks or JSX
4. **Co-locate small helpers** — private helper functions can live inside the component file (above the main export)
5. **Shared types in `types.ts`** — component-local types can be defined in the component file
6. **`lib/` vs `utils/`** — `lib/` is for large, complex analysis modules (200+ lines); `utils/` is for small, focused utility functions
7. **MCP server is a separate package** — it has its own `package.json`, `tsconfig.json`, and build pipeline

## Naming Conventions

### Files

| Type | Convention | Example |
|---|---|---|
| Tool component | PascalCase `.tsx` | `JsonTools.tsx`, `SqlFormatter.tsx` |
| Reusable component | PascalCase `.tsx` | `CopyButton.tsx`, `ResizableSplit.tsx` |
| Utility module | camelCase `.ts` | `formatter.ts`, `smartDetect.ts`, `colorMath.ts` |
| Library module | PascalCase `.ts` | `SQLPlanAnalyzer.ts`, `harAnalyzer.ts` |
| Test file | `*.test.ts` or `*.test.tsx` | `smartDetect.test.ts` |

### Components & Types

| Convention | Example |
|---|---|
| PascalCase function name | `export default function JsonTools()` |
| Match file name | `JsonTools.tsx` → `function JsonTools()` |
| Props suffix (reusable) | `CopyButtonProps`, `ResizableSplitProps` |
| Discriminated unions | `type JsonTab = 'format' \| 'diff' \| 'ts'` |

### Functions

| Type | Convention | Example |
|---|---|---|
| Pure utility | camelCase, verb-first | `parseItems()`, `formatItems()`, `computeDiff()` |
| Event handler (internal) | `handle` prefix | `handleFormat()`, `handleCopy()` |
| Event handler (props) | `on` prefix | `onSelect()`, `onChange()` |
| Boolean checker | `is/has/can` prefix | `isValid()`, `hasMetadata()` |
| Converter | `to` prefix | `toDistinct()`, `toHex()` |

### Variables

| Type | Convention | Example |
|---|---|---|
| State | camelCase | `input`, `output`, `darkMode` |
| State setter | `set` + PascalCase | `setInput`, `setOutput` |
| Boolean state | `is/has` prefix | `isLoading`, `isCopied`, `hasError` |
| Ref | `*Ref` suffix | `containerRef`, `percentRef` |
| Constant (module) | UPPER_SNAKE_CASE | `MAX_FAVORITES`, `THEME_KEY` |
| localStorage keys | `devtoolkit:` prefix | `devtoolkit:theme`, `devtoolkit:favorites` |

### URL Slugs & CSS

- URL slugs: kebab-case (`sql-formatter`, `jwt-decoder`)
- Custom CSS classes: kebab-case (`theme-toggle`, `drag-handle`)
- CSS variables: `--bg-primary`, `--accent`
