# 03 — Naming Conventions

## Files

| Type | Convention | Example |
|---|---|---|
| Tool component | PascalCase `.tsx` | `JsonTools.tsx`, `SqlFormatter.tsx` |
| Reusable component | PascalCase `.tsx` | `CopyButton.tsx`, `ResizableSplit.tsx` |
| Utility module | camelCase `.ts` | `formatter.ts`, `smartDetect.ts`, `colorMath.ts` |
| Library module | PascalCase `.ts` | `SQLPlanAnalyzer.ts`, `harAnalyzer.ts` |
| Test file | `*.test.ts` or `*.test.tsx` | `smartDetect.test.ts` |
| Types file | camelCase `.ts` | `types.ts` |

## Components

| Convention | Example |
|---|---|
| PascalCase function name | `export default function JsonTools()` |
| Match file name | `JsonTools.tsx` → `function JsonTools()` |
| Descriptive name | Tool name + action: `SqlFormatter`, `ListCleaner`, `MockDataGenerator` |

## Types & Interfaces

| Convention | Example |
|---|---|
| PascalCase | `JsonTab`, `DiffEntry`, `SqlDialect` |
| Props suffix (reusable) | `CopyButtonProps`, `ResizableSplitProps` |
| Discriminated unions | `type JsonTab = 'format' \| 'diff' \| 'ts'` |
| Options suffix | `ListToolsOptions`, `FormatterOptions` |

## Functions

| Type | Convention | Example |
|---|---|---|
| Pure utility | camelCase, verb-first | `parseItems()`, `formatItems()`, `computeDiff()` |
| Event handler (internal) | `handle` prefix | `handleFormat()`, `handleCopy()`, `handleDrop()` |
| Event handler (props) | `on` prefix | `onSelect()`, `onChange()`, `onClose()` |
| Boolean checker | `is/has/can` prefix | `isValid()`, `hasMetadata()`, `canProcess()` |
| Converter | `to` prefix | `toDistinct()`, `toHex()`, `toRGB()` |

## Variables

| Type | Convention | Example |
|---|---|---|
| State | camelCase | `input`, `output`, `darkMode` |
| State setter | `set` + PascalCase | `setInput`, `setOutput`, `setDarkMode` |
| Boolean state | `is/has` prefix | `isLoading`, `isCopied`, `hasError` |
| Ref | `*Ref` suffix | `containerRef`, `percentRef`, `inputRef` |
| Constant (module-level) | UPPER_SNAKE_CASE | `MAX_FAVORITES`, `THEME_KEY`, `DEFAULT_OPTIONS` |
| Constant (inline) | camelCase | `const defaultDialect = 'sql';` |

## URL Slugs

| Convention | Example |
|---|---|
| kebab-case | `sql-formatter`, `jwt-decoder`, `mock-data` |
| Short, descriptive | `json`, `markdown`, `query-plan` |

## CSS / Tailwind

| Convention | Example |
|---|---|
| Utility classes | Tailwind defaults: `text-sm`, `flex`, `gap-2` |
| Custom classes | kebab-case: `theme-toggle`, `drag-handle`, `markdown-body` |
| CSS variables | `--bg-primary`, `--bg-secondary`, `--accent` |

## localStorage Keys

| Convention | Example |
|---|---|
| Prefix with `devtoolkit:` | `devtoolkit:theme`, `devtoolkit:favorites` |
| Use colon separator | `devtoolkit:split:sql-formatter` |
