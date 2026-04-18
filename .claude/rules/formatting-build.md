# Formatting, Linting & Build

## Prettier (`.prettierrc`)

Prettier handles all code formatting automatically. **Do not manually format code** — let Prettier do it.

| Rule            | Value                            |
| --------------- | -------------------------------- |
| Semicolons      | Required (`semi: true`)          |
| Quotes          | Single (`singleQuote: true`)     |
| JSX Quotes      | Double (`jsxSingleQuote: false`) |
| Trailing commas | ES5 (`trailingComma: "es5"`)     |
| Print width     | 120 characters                   |
| Tab width       | 2 spaces                         |
| Bracket spacing | Yes (`{ x }` not `{x}`)          |
| Arrow parens    | Always (`(x) => x`)              |
| End of line     | Auto (cross-platform)            |

```bash
npm run format        # Auto-format all files
npm run format:check  # Check formatting without writing (CI)
```

## ESLint Configuration

ESLint handles code quality rules (not formatting). Config: `eslint.config.js`.

| Setting                                | Value                                                              |
| -------------------------------------- | ------------------------------------------------------------------ |
| Base                                   | `@eslint/js` recommended + `typescript-eslint` recommended         |
| Plugins                                | `react-hooks`, `react-refresh`                                     |
| Prettier compat                        | `eslint-config-prettier` (disables formatting rules that conflict) |
| `@typescript-eslint/no-explicit-any`   | `off` (allowed but discouraged)                                    |
| `react-refresh/only-export-components` | `warn` (components should be default exports)                      |

```bash
npm run lint          # Run ESLint
npm run type-check    # Run TypeScript type checking (tsc --noEmit)
```

## Import Order

Group imports in this order, separated by blank lines:

```typescript
// 1. React & React hooks
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// 2. External libraries
import { format } from 'sql-formatter';
import { jsonrepair } from 'jsonrepair';

// 3. Icons
import { Copy, Check, Code2, Braces } from 'lucide-react';

// 4. Internal components
import ResizableSplit from './ResizableSplit';
import CopyButton from './CopyButton';

// 5. Utilities & lib
import { processListItems } from '../utils/formatter';
import { detectJSON } from '../utils/smartDetect';

// 6. Types (use `import type` when possible)
import type { DiffEntry, JsonTab } from '../types';
```

## TypeScript Configuration

**`tsconfig.json`** key settings:

| Setting            | Value         | Purpose                                     |
| ------------------ | ------------- | ------------------------------------------- |
| `target`           | ES2022        | Modern JS features                          |
| `module`           | ESNext        | ESM imports                                 |
| `moduleResolution` | bundler       | Vite-compatible resolution                  |
| `jsx`              | react-jsx     | Automatic JSX transform (no `import React`) |
| `strict`           | true          | Full type checking                          |
| `skipLibCheck`     | true          | Skip node_modules type checking             |
| `isolatedModules`  | true          | Safe for transpilers                        |
| `paths`            | `@/*` → `./*` | Path alias for imports                      |

## Vite Configuration

**`vite.config.ts`** key settings:

```typescript
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: '0.0.0.0' },
  resolve: { alias: { '@': path.resolve(__dirname) } },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    include: ['@uswriting/exiftool', '@6over3/zeroperl-ts'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

## Build Commands

```bash
npm run dev          # Start dev server on port 3000 with HMR
npm run build        # Production build → dist/
npm run preview      # Preview production build locally
npm run format       # Prettier — auto-format all files
npm run format:check # Prettier — check formatting (CI)
npm run lint         # ESLint
npm run type-check   # tsc --noEmit
npm run test         # Vitest (unit tests)
npm run test:e2e     # Playwright (e2e tests)
```

## Build Output

```
dist/
├── index.html           # Entry HTML
├── assets/
│   ├── index-[hash].js  # Main bundle
│   ├── [Tool]-[hash].js # Lazy-loaded tool chunks
│   └── index-[hash].css # Compiled Tailwind CSS
└── *.wasm               # WebAssembly binaries
```

## Dependency Management

### Adding New Dependencies

1. Check bundle size on bundlephobia.com (prefer < 50KB gzipped)
2. Verify license (MIT/Apache/BSD — avoid GPL/LGPL)
3. Check for known vulnerabilities: `npm audit`
4. Prefer packages with ESM support and tree-shaking
5. If heavy, ensure consuming component is lazy-loaded

### No Server Dependencies

DevToolKit is a pure client-side app. Do NOT add: Express, Fastify, database drivers, ORMs, SSR libraries, or backend auth. Exception: `mcp/` directory is a separate Node.js package.

## Rules

1. **Run `npm run format` before committing** — or enable Format on Save in IDE
2. **Run `npm run lint`** — fix all warnings and errors
3. **Run `npm run type-check`** — ensure TypeScript compiles cleanly
4. **Do NOT disable ESLint rules** with inline comments unless absolutely necessary
5. **Prefer `import type { X }`** for type-only imports
6. **Do NOT manually format code** — let Prettier handle it
7. **Dev server on port 3000** — do not change without updating documentation
8. **Use `@/` path alias** — avoid deep relative imports
9. **WASM files in `assetsInclude`** — add new WASM file patterns if needed
10. **MCP server is independent** — has its own build pipeline (`tsup`), don't mix dependencies
