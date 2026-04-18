---
paths:
  - 'components/**/*.tsx'
  - 'App.tsx'
  - 'vite.config.ts'
---

# Lazy Loading & Performance

## Code Splitting

Every tool component is lazy-loaded via `React.lazy()` + `Suspense`:

```typescript
// App.tsx
const JsonTools = lazy(() => import('./components/JsonTools'));
const SqlFormatter = lazy(() => import('./components/SqlFormatter'));

// Render with Suspense
<Suspense fallback={<LoadingSpinner />}>
  {mode === 'json' && <JsonTools initialData={pendingData} />}
  {mode === 'sql' && <SqlFormatter initialData={pendingData} />}
</Suspense>
```

**Why**: Each tool imports heavy dependencies (sql-formatter, faker, mermaid, exiftool). Lazy loading keeps the initial bundle small.

## Memoization

```typescript
// useMemo for expensive computations
const diffResult = useMemo(() => {
  if (!leftJson || !rightJson) return [];
  return computeDiff(JSON.parse(leftJson), JSON.parse(rightJson));
}, [leftJson, rightJson]);

// useCallback for stable references passed to children
const handleFormat = useCallback(() => {
  setOutput(format(input, { language: dialect }));
}, [input, dialect]);
```

## Bundle Size

### Pre-bundling (Vite optimizeDeps)

```typescript
// vite.config.ts
optimizeDeps: {
  include: ['@uswriting/exiftool', '@6over3/zeroperl-ts'],
}
```

### Import Guidelines

```typescript
// Good: Named imports
import { format } from 'sql-formatter';
import { faker } from '@faker-js/faker';

// Bad: Full library import
import * as sqlFormatter from 'sql-formatter';
```

### Dependency Review Checklist

| Check | Criteria |
|---|---|
| Bundle size | bundlephobia.com — prefer < 50KB gzipped |
| Tree-shakeable | ESM exports with `sideEffects: false` |
| Maintenance | Active maintenance, recent releases |
| Alternatives | Can this be done with a small utility function? |
| License | MIT/Apache/BSD — NO GPL/LGPL |

## ResizableSplit Persistence

Panel widths are saved to localStorage:

```typescript
<ResizableSplit
  left={<InputPanel />}
  right={<OutputPanel />}
  storageKey="sql-formatter"  // Persisted width
/>
```

## Performance Checklist

| Pattern | When |
|---|---|
| `React.lazy()` | Every tool component |
| `useMemo()` | Diff, sort, filter, search operations |
| `useCallback()` | Handlers passed to child components or ResizableSplit |
| `React.memo()` | Reusable components that receive object/array props |
| localStorage caching | Theme, favorites, panel widths |
| Vite optimizeDeps | WASM and large binary dependencies |

## Rules

1. **All tool components must be lazy-loaded** — use `React.lazy(() => import(...))`
2. **Always wrap lazy components in `Suspense`** — with a loading fallback
3. **Use `useMemo` for computations over arrays/objects** — especially diff, sort, filter
4. **Don't over-memoize** — primitives and simple string ops don't need memoization
5. **Check bundle size before adding dependencies** — use bundlephobia.com
6. **Prefer tree-shakeable ESM packages** — avoid CommonJS-only libraries when possible
