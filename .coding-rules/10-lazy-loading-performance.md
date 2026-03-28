# 10 — Lazy Loading & Performance

## Code Splitting

Every tool component is lazy-loaded via `React.lazy()` + `Suspense`:

```typescript
// App.tsx
const JsonTools = lazy(() => import('./components/JsonTools'));
const SqlFormatter = lazy(() => import('./components/SqlFormatter'));
const JwtDecode = lazy(() => import('./components/JwtDecode'));
// ... all 24+ tools

// Render with Suspense
<Suspense fallback={<LoadingSpinner />}>
  {mode === 'json' && <JsonTools initialData={pendingData} />}
  {mode === 'sql' && <SqlFormatter initialData={pendingData} />}
</Suspense>
```

**Why**: Each tool imports its own heavy dependencies (sql-formatter, faker, mermaid, exiftool). Lazy loading keeps the initial bundle small — only the active tool's code is downloaded.

## Memoization

### useMemo for Expensive Computations

```typescript
// Diff computation — only recalculate when inputs change
const diffResult = useMemo(() => {
  if (!leftJson || !rightJson) return [];
  return computeDiff(JSON.parse(leftJson), JSON.parse(rightJson));
}, [leftJson, rightJson]);

// List comparison — sort, dedup, intersect
const compareResult = useMemo(() => {
  return computeListDiff(listA, listB, options);
}, [listA, listB, options]);
```

### useCallback for Stable References

```typescript
// Handlers passed to ResizableSplit children
const handleFormat = useCallback(() => {
  setOutput(format(input, { language: dialect }));
}, [input, dialect]);
```

## Bundle Size

### Pre-bundling (Vite optimizeDeps)

Heavy WASM dependencies are pre-bundled:

```typescript
// vite.config.ts
optimizeDeps: {
  include: ['@uswriting/exiftool', '@6over3/zeroperl-ts'],
}
```

### Import Guidelines

```typescript
// Good: Import only what you need
import { format } from 'sql-formatter';
import { faker } from '@faker-js/faker';

// Bad: Import entire library
import * as sqlFormatter from 'sql-formatter';
```

### Dependency Review Checklist

Before adding a new dependency:

| Check | Criteria |
|---|---|
| Bundle size | Check on bundlephobia.com — prefer < 50KB gzipped |
| Tree-shakeable | ESM exports with sideEffects: false |
| Maintenance | Active maintenance, recent releases |
| Alternatives | Can this be done with a small utility function instead? |
| License | MIT/Apache/BSD preferred — NO GPL/LGPL |

## ResizableSplit Persistence

Panel widths are saved to localStorage to avoid layout recalculation:

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
3. **Use `useMemo` for computations over arrays/objects** — especially in diff, sort, filter
4. **Don't over-memoize** — primitives and simple string ops don't need memoization
5. **Check bundle size before adding dependencies** — use bundlephobia.com
6. **Prefer tree-shakeable ESM packages** — avoid CommonJS-only libraries when possible
