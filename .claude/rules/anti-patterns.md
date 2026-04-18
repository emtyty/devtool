# Anti-Patterns

> Common mistakes and their correct alternatives. All examples come from the actual DevToolKit codebase.

## Summary Table

| #   | Anti-Pattern                             | Correct Pattern                          | Severity |
| --- | ---------------------------------------- | ---------------------------------------- | -------- |
| 1   | Global state library (Redux, Zustand)    | `useState` + `localStorage`              | High     |
| 2   | CSS modules or CSS-in-JS                 | Tailwind utility classes                 | High     |
| 3   | Inline `style` props for static values   | Tailwind classes                         | Medium   |
| 4   | `console.log` in production code         | `setError()` for UI feedback             | Medium   |
| 5   | Class components                         | Functional components + hooks            | High     |
| 6   | React Router library                     | Custom slug map + `pushState`            | High     |
| 7   | Non-lazy tool components                 | `React.lazy(() => import(...))`          | High     |
| 8   | Missing Suspense fallback                | `<Suspense fallback={<Spinner />}>`      | Medium   |
| 9   | Business logic in components             | Extract to `utils/` or `lib/`            | Medium   |
| 10  | React imports in `utils/`                | Pure functions only                      | High     |
| 11  | Empty catch blocks                       | Set error state or return fallback       | Medium   |
| 12  | Hardcoded colors                         | Tailwind palette or CSS variables        | Medium   |
| 13  | Full library imports                     | Named imports: `import { x } from 'lib'` | Medium   |
| 14  | Missing `useCallback` for child handlers | Wrap with `useCallback`                  | Low      |
| 15  | Over-memoizing primitives                | Only memoize objects/arrays/computations | Low      |
| 16  | `useEffect` without cleanup              | Return cleanup function                  | Medium   |
| 17  | Missing `initialData` prop               | All tools accept optional initial data   | Medium   |
| 18  | Hardcoded localStorage keys              | Use `devtoolkit:` prefix                 | Low      |
| 19  | `dangerouslySetInnerHTML` with raw input | Escape with `escHtml()` first            | High     |
| 20  | Server-side dependencies                 | Client-only, no Express/DB/auth          | High     |
| 21  | Deep relative imports                    | Use `@/` path alias                      | Low      |
| 22  | Missing dark mode support                | Test both themes                         | Medium   |
| 23  | God components (> 200 lines JSX)         | Extract sub-components                   | Medium   |
| 24  | God functions (> 30 lines)               | Extract helper functions                 | Medium   |
| 25  | Deep nesting (> 3 levels)                | Early returns, extract components        | Medium   |

## Key Examples

### No Global State Libraries

```typescript
// Bad
import { create } from 'zustand';

// Good — each tool owns its state
export default function ListCleaner({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [options, setOptions] = useState<ListToolsOptions>(DEFAULT_OPTIONS);
}
```

### No CSS Modules or CSS-in-JS

```typescript
// Bad
import styles from './ListCleaner.module.css';

// Good — Tailwind utility classes
<section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
```

### No Inline Styles (except dynamic values)

```typescript
// Bad
<div style={{ padding: '16px', color: '#333', fontSize: '14px' }}>

// Good
<div className="h-screen flex flex-col selection:bg-blue-500/30">

// Acceptable — truly dynamic values
<div style={isLg ? { width: `calc(${leftPercent}% - ${handleWidthPx / 2}px)` } : undefined}>
```

### No console.log — Use setError()

```typescript
// Bad
console.error('Failed to decode:', e);

// Good
setError('Failed to decode: token may be malformed or encrypted');
```

### No React Router

```typescript
// Bad
import { BrowserRouter, Route, Routes } from 'react-router-dom';

// Good — custom slug map
const MODE_TO_SLUG: Record<AppMode, string> = { ... };
const switchMode = useCallback((m: AppMode) => {
  setMode(m);
  window.history.pushState(null, '', `/${MODE_TO_SLUG[m]}`);
}, []);
```

### All Tool Components Must Be Lazy-Loaded

```typescript
// Bad
import JsonTools from './components/JsonTools';

// Good
const JsonTools = lazy(() => import('./components/JsonTools'));
```

### Business Logic in utils/, Not Components

```typescript
// Bad — processing logic embedded in component
const handleClean = () => {
  let items = input.split(/\r?\n/);
  items = items.map((i) => i.trim());
  // ... 20 more lines of processing
};

// Good — from utils/formatter.ts
export function processListItems(input: string, options: ListToolsOptions): string {
  // Testable, reusable pure function
}

// Component just calls it
const updateOutput = useCallback(() => {
  setOutput(processListItems(input, options));
}, [input, options]);
```

### No React Imports in utils/

```typescript
// Bad
import { useState, useMemo } from 'react';
export function useSmartDetect(input: string) { ... }

// Good — pure functions, zero React dependencies
export function detectJSON(input: string): number { ... }
```

### dangerouslySetInnerHTML Must Escape First

```typescript
// Bad — XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// Good — escape FIRST, then wrap with styling
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const highlighted = `<span class="keyword">${escHtml(keyword)}</span>`;
<pre dangerouslySetInnerHTML={{ __html: highlighted }} />
```

### No Server-Side Dependencies

```typescript
// Bad — this is a browser-only app
import express from 'express';
import { Pool } from 'pg';

// Good — client-side only
```

### useEffect Must Have Cleanup

```typescript
// Bad — event listener leaks
useEffect(() => {
  window.addEventListener('popstate', handlePopState);
}, []);

// Good
useEffect(() => {
  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}, []);
```

### All Tools Accept initialData

```typescript
// Bad
export default function SqlFormatter() { ... }

// Good
export default function SqlFormatter({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  useEffect(() => { if (initialData) setInput(initialData); }, [initialData]);
}
```

### Deep Nesting — Use Early Returns

```typescript
// Bad
const handleCopy = () => {
  if (output) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(output).then(() => { ... });
    }
  }
};

// Good
const handleCopy = () => {
  if (!output) return;
  navigator.clipboard.writeText(output);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

## Code Review Checklist

### Structure & Components

- [ ] New component in `components/`, utility in `utils/` or `lib/`
- [ ] Functional component with default export
- [ ] Tool accepts `initialData` prop
- [ ] Component < 200 lines JSX, functions < 30 lines
- [ ] Max 3 levels of JSX nesting

### Naming & Imports

- [ ] PascalCase components, camelCase utilities
- [ ] Imports grouped: React → external → icons → components → utils → types
- [ ] Type-only imports use `import type`
- [ ] `@/` path alias for non-adjacent imports

### Styling & Dark Mode

- [ ] Tailwind classes only, no inline styles (except dynamic)
- [ ] No hardcoded colors
- [ ] UI correct in both light and dark themes

### State & Hooks

- [ ] No global state library
- [ ] localStorage keys prefixed with `devtoolkit:`
- [ ] Effects have cleanup functions
- [ ] `useMemo` for expensive computations
- [ ] `useCallback` for handlers passed to children

### Security & Quality

- [ ] No `dangerouslySetInnerHTML` with raw user input
- [ ] `JSON.parse` wrapped in try-catch
- [ ] No hardcoded secrets
- [ ] No `console.log` — errors shown in UI
- [ ] All tool components lazy-loaded
- [ ] No `.skip` or `.only` tests committed
- [ ] ESLint + type-check + build pass
