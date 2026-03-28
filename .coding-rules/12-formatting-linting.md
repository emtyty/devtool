# 12 — Formatting & Linting

## Prettier (`.prettierrc`)

Prettier handles all code formatting automatically. **Do not manually format code** — let Prettier do it.

| Rule | Value |
|---|---|
| Semicolons | Required (`semi: true`) |
| Quotes | Single (`singleQuote: true`) |
| JSX Quotes | Double (`jsxSingleQuote: false`) |
| Trailing commas | ES5 (`trailingComma: "es5"`) |
| Print width | 120 characters |
| Tab width | 2 spaces |
| Bracket spacing | Yes (`{ x }` not `{x}`) |
| Arrow parens | Always (`(x) => x`) |
| End of line | Auto (cross-platform) |

### Commands

```bash
npm run format        # Auto-format all files
npm run format:check  # Check formatting without writing (CI)
```

### IDE Integration

Install the Prettier extension in your IDE and enable **Format on Save**:

- **VS Code**: Install `esbenp.prettier-vscode`, add to settings:
  ```json
  {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  }
  ```

## ESLint Configuration

ESLint handles code quality rules (not formatting). Config: `eslint.config.js`.

| Setting | Value |
|---|---|
| Base | `@eslint/js` recommended + `typescript-eslint` recommended |
| Plugins | `react-hooks`, `react-refresh` |
| Prettier compat | `eslint-config-prettier` (disables formatting rules that conflict) |
| `@typescript-eslint/no-explicit-any` | `off` (allowed but discouraged) |
| `react-refresh/only-export-components` | `warn` (components should be default exports) |

### Commands

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

## Rules

1. **Run `npm run format` before committing** — or enable Format on Save in IDE
2. **Run `npm run lint`** — fix all warnings and errors
3. **Run `npm run type-check`** — ensure TypeScript compiles cleanly
4. **Do NOT disable ESLint rules** with inline comments unless absolutely necessary — add a `// reason:` comment if you do
5. **Prefer `import type { X }`** over `import { X }` for type-only imports
6. **Do NOT manually format code** — let Prettier handle it, don't fight the formatter
