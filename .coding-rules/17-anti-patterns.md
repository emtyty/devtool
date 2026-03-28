# 17 — Anti-Patterns

> Common mistakes and their correct alternatives. All examples come from the actual DevToolKit codebase.

## Summary Table

| # | Anti-Pattern | Correct Pattern | Severity |
|---|---|---|---|
| 1 | Global state library (Redux, Zustand) | `useState` + `localStorage` | High |
| 2 | CSS modules or CSS-in-JS | Tailwind utility classes | High |
| 3 | Inline `style` props for static values | Tailwind classes | Medium |
| 4 | `console.log` in production code | `setError()` for UI feedback | Medium |
| 5 | Class components | Functional components + hooks | High |
| 6 | React Router library | Custom slug map + `pushState` | High |
| 7 | Non-lazy tool components | `React.lazy(() => import(...))` | High |
| 8 | Missing Suspense fallback | `<Suspense fallback={<Spinner />}>` | Medium |
| 9 | Business logic in components | Extract to `utils/` or `lib/` | Medium |
| 10 | React imports in `utils/` | Pure functions only | High |
| 11 | Empty catch blocks | Set error state or return fallback | Medium |
| 12 | Hardcoded colors | Tailwind palette or CSS variables | Medium |
| 13 | Full library imports | Named imports: `import { x } from 'lib'` | Medium |
| 14 | Missing `useCallback` for child handlers | Wrap with `useCallback` | Low |
| 15 | Over-memoizing primitives | Only memoize objects/arrays/computations | Low |
| 16 | `useEffect` without cleanup | Return cleanup function | Medium |
| 17 | Missing `initialData` prop | All tools accept optional initial data | Medium |
| 18 | Hardcoded localStorage keys | Use `devtoolkit:` prefix | Low |
| 19 | `dangerouslySetInnerHTML` with raw input | Escape with `escHtml()` first | High |
| 20 | Server-side dependencies | Client-only, no Express/DB/auth | High |
| 21 | Deep relative imports | Use `@/` path alias | Low |
| 22 | Missing dark mode support | Test both themes, use `dark:` prefix | Medium |
| 23 | God components (> 200 lines JSX) | Extract sub-components | Medium |
| 24 | God functions (> 30 lines) | Extract helper functions | Medium |
| 25 | Deep nesting (> 3 levels) | Early returns, extract components | Medium |

---

## Detailed Examples

### 1. No Global State Libraries

```typescript
// Bad
import { create } from 'zustand';
const useStore = create((set) => ({ items: [], setItems: (items) => set({ items }) }));

// Good — from ListCleaner.tsx
export default function ListCleaner({ initialData }: { initialData?: string | null }) {
  const [mode, setMode] = useState<'clean' | 'compare'>('clean');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [options, setOptions] = useState<ListToolsOptions>(DEFAULT_OPTIONS);
}
```

For persistent preferences, use localStorage with a custom hook:

```typescript
// Good — from App.tsx (useFavorites hook)
const FAVORITES_KEY = 'devtoolkit:favorites';

function useFavorites() {
  const [favorites, setFavorites] = useState<AppMode[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const toggleFavorite = useCallback((id: AppMode) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id)
        : prev.length >= MAX_FAVORITES ? prev : [...prev, id];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { favorites, toggleFavorite };
}
```

---

### 2. No CSS Modules or CSS-in-JS

```typescript
// Bad
import styles from './ListCleaner.module.css';
<div className={styles.container}>

// Bad
import styled from 'styled-components';
const Container = styled.div`padding: 16px;`;

// Good — from ListCleaner.tsx
<section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
    <div className="space-y-4">
      ...
    </div>
  </div>
</section>
```

---

### 3. No Inline Styles (except dynamic values)

```typescript
// Bad — static styling via style prop
<div style={{ padding: '16px', color: '#333', fontSize: '14px', borderRadius: '12px' }}>

// Good — from App.tsx
<div className="h-screen flex flex-col selection:bg-blue-500/30">
<header className="border-b border-slate-200 glass shrink-0 z-50 px-6 py-4 flex items-center justify-between">

// Acceptable — truly dynamic values from ResizableSplit.tsx
<div
  className="flex flex-col"
  style={isLg ? { width: `calc(${leftPercent}% - ${handleWidthPx / 2}px)` } : undefined}
>

// Acceptable — dynamic indent for tree nesting from JsonTools.tsx
<div className="flex items-start gap-2 py-1.5 px-2 text-xs" style={{ paddingLeft: indent }}>
```

---

### 4. No `console.log` — Use `setError()` for UI Feedback

```typescript
// Bad
const handleDecode = () => {
  try {
    const result = JSON.parse(base64UrlDecode(parts[0]));
    console.log('Decoded:', result);
  } catch (e) {
    console.error('Failed to decode:', e);
  }
};

// Good — from JwtDecode.tsx
const updateOutput = useCallback(() => {
  setError(null);
  setDecoded(null);

  const token = input.trim();
  if (!token) return;

  const parts = token.split('.');
  if (parts.length !== 3) {
    setError('Invalid JWT: expected 3 parts separated by "."');
    return;
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    setDecoded({ header, payload, signature: parts[2] });
  } catch {
    setError('Failed to decode: token may be malformed or encrypted');
  }
}, [input]);
```

---

### 5. No Class Components

```typescript
// Bad
class SqlFormatter extends React.Component {
  state = { input: '', output: '' };
  render() { return <div>{this.state.output}</div>; }
}

// Good — from SqlFormatter.tsx
export default function SqlFormatter({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [sqlMode, setSqlMode] = useState<'format' | 'minify'>('format');
  // ...
}
```

---

### 6. No React Router — Use Custom Slug Map

```typescript
// Bad
import { BrowserRouter, Route, Routes } from 'react-router-dom';
<Routes>
  <Route path="/json" element={<JsonTools />} />
</Routes>

// Good — from App.tsx
const MODE_TO_SLUG: Record<AppMode, string> = {
  smartdetect: '', sqlformatter: 'sql-formatter', jsontools: 'json',
  jwtdecode: 'jwt-decoder', listcleaner: 'list-cleaner', /* ... */
};

const switchMode = useCallback((m: AppMode) => {
  setMode(m);
  window.history.pushState(null, '', `/${MODE_TO_SLUG[m]}`);
}, []);

useEffect(() => {
  const onPopState = () => setMode(getModeFromPath());
  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}, []);
```

---

### 7. Non-Lazy Tool Components

```typescript
// Bad — eagerly imports everything into main bundle
import JsonTools from './components/JsonTools';
import SqlFormatter from './components/SqlFormatter';
import MockDataGenerator from './components/MockDataGenerator';

// Good — from App.tsx (each tool in its own chunk)
const JsonTools          = lazy(() => import('./components/JsonTools'));
const SqlFormatter       = lazy(() => import('./components/SqlFormatter'));
const MockDataGenerator  = lazy(() => import('./components/MockDataGenerator'));
const MarkdownPreview    = lazy(() => import('./components/MarkdownPreview'));
const CronBuilder        = lazy(() => import('./components/CronBuilder'));
// ... 20+ more lazy imports
```

---

### 8. Missing Suspense Fallback

```typescript
// Bad — no fallback, blank screen while loading
<Suspense>
  {mode === 'json' && <JsonTools />}
</Suspense>

// Good — from App.tsx
<Suspense fallback={
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
  </div>
}>
  {mode === 'sqlformatter'  ? <SqlFormatter initialData={pendingData} /> :
   mode === 'jsontools'     ? <JsonTools initialData={pendingData} /> :
   mode === 'listcleaner'   ? <ListCleaner initialData={pendingData} /> :
   /* ... */}
</Suspense>
```

---

### 9. Business Logic in Components — Extract to `utils/`

```typescript
// Bad — processing logic embedded in component
export default function ListCleaner() {
  const handleClean = () => {
    let items = input.split(/\r?\n/);
    items = items.map(i => i.trim());
    items = items.filter(i => i.length > 0);
    const seen = new Set<string>();
    items = items.filter(i => { const k = i.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    if (sortAsc) items.sort((a, b) => a.localeCompare(b));
    setOutput(items.join('\n'));
  };
}

// Good — from utils/formatter.ts (pure function, testable, reusable)
export function processListItems(input: string, options: ListToolsOptions): string {
  if (!input.trim()) return '';
  let items = input.split(/\r?\n/);
  if (options.trim) items = items.map(i => i.trim());
  if (options.removeEmpty) items = items.filter(i => i.length > 0);
  if (options.removeDuplicates) {
    if (options.caseSensitive) {
      items = Array.from(new Set(items));
    } else {
      const seen = new Set<string>();
      items = items.filter(i => { const lower = i.toLowerCase(); if (seen.has(lower)) return false; seen.add(lower); return true; });
    }
  }
  if (options.sort !== 'none') {
    const localeOptions = { numeric: options.naturalSort, sensitivity: options.caseSensitive ? ('variant' as const) : ('base' as const) };
    if (options.sort === 'asc') items.sort((a, b) => a.localeCompare(b, undefined, localeOptions));
    else items.sort((a, b) => b.localeCompare(a, undefined, localeOptions));
  }
  return items.join('\n');
}

// Component just calls it — from ListCleaner.tsx
const updateOutput = useCallback(() => {
  setOutput(processListItems(input, options));
}, [input, options]);
```

---

### 10. No React Imports in `utils/`

```typescript
// Bad — utility file importing React hooks
import { useState, useMemo } from 'react';
export function useSmartDetect(input: string) { ... }

// Good — from utils/smartDetect.ts (pure functions, zero dependencies on React)
export interface DetectResult {
  tool: string;
  confidence: number;
  label: string;
}

export function detectJSON(input: string): number {
  const t = input.trim();
  if (!t) return 0;
  try { JSON.parse(t); return 95; } catch { /* continue */ }
  if (/^\s*[\{\[]/.test(t) && /[\}\]]\s*$/.test(t)) {
    if (/"[\w$]+":\s/.test(t)) return 85;
    return 75;
  }
  return 0;
}
```

---

### 11. No Empty Catch Blocks

```typescript
// Bad — swallowed error, no feedback
try { JSON.parse(input); } catch {}

// Good — return boolean for validation (from smartDetect.ts)
try { JSON.parse(t); return 95; } catch { /* continue to next check */ }

// Good — show error to user (from JwtDecode.tsx)
try {
  const header = JSON.parse(base64UrlDecode(parts[0]));
  const payload = JSON.parse(base64UrlDecode(parts[1]));
  setDecoded({ header, payload, signature: parts[2] });
} catch {
  setError('Failed to decode: token may be malformed or encrypted');
}

// Good — fallback for corrupted localStorage (from DiagramGenerator.tsx)
function loadHistory(): SavedDiagram[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];  // Fallback to empty array
  }
}
```

---

### 12. No Hardcoded Colors

```typescript
// Bad
<div style={{ color: '#333', backgroundColor: '#f0f0f0', borderColor: '#ddd' }}>

// Good — from App.tsx (Tailwind slate palette)
<div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
  <i className="fa-solid fa-code text-white text-xl"></i>
</div>

// Good — dark mode aware from CspTools.tsx
{ bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-500/20' }
```

---

### 13. Full Library Imports

```typescript
// Bad — imports entire lodash (70KB+)
import _ from 'lodash';
const unique = _.uniq(items);

// Good — import only what you need (from SqlFormatter.tsx)
import { format as prettyPrintSql } from 'sql-formatter';

// Good — destructured icon imports (from ColorConverter.tsx)
import { Copy, Check, Pipette } from 'lucide-react';
```

---

### 14. Missing `useCallback` for Child Handlers

```typescript
// Bad — new function reference every render, causes child re-renders
<ResizableSplit
  left={<Panel onFormat={() => setOutput(format(input))} />}
  right={<Output />}
/>

// Good — from ColorConverter.tsx (stable reference)
const handlePickerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  setInput(e.target.value);
}, []);

const handleCopyAll = useCallback(() => {
  if (!colors) return;
  const lines = [
    `HEX:   ${colors.hex}`, `RGB:   ${colors.rgb}`,
    `HSL:   ${colors.hsl}`, `OKLCH: ${colors.oklch}`,
  ].join('\n');
  navigator.clipboard.writeText(lines);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}, [colors]);
```

---

### 15. Over-memoizing Primitives

```typescript
// Bad — useMemo for a cheap string operation
const label = useMemo(() => `${items.length} items`, [items.length]);
const isValid = useMemo(() => input.length > 0, [input]);

// Good — from ColorConverter.tsx (useMemo for actual expensive computation)
const rgba = useMemo(() => parseColor(input), [input]);
const colors = useMemo(() => (rgba ? convertAll(rgba) : null), [rgba]);
const contrast = useMemo(() => {
  if (!rgba) return null;
  const lum = relativeLuminance(rgba.r, rgba.g, rgba.b);
  const vsWhite = contrastRatio(lum, relativeLuminance(255, 255, 255));
  const vsBlack = contrastRatio(lum, relativeLuminance(0, 0, 0));
  return {
    vsWhite: { ratio: vsWhite, grade: wcagGrade(vsWhite) },
    vsBlack: { ratio: vsBlack, grade: wcagGrade(vsBlack) },
  };
}, [rgba]);

// Good — from ListCleaner.tsx (useMemo for set diff computation)
const compareResult = useMemo(() => {
  const distinct1 = toDistinct(list1, compareCaseSensitive);
  const distinct2 = toDistinct(list2, compareCaseSensitive);
  const keys1 = new Set(distinct1.map(i => i.key));
  const keys2 = new Set(distinct2.map(i => i.key));
  return {
    distinct1, distinct2,
    onlyInList1: distinct1.filter(i => !keys2.has(i.key)),
    onlyInList2: distinct2.filter(i => !keys1.has(i.key)),
  };
}, [list1, list2, compareCaseSensitive]);
```

---

### 16. `useEffect` Without Cleanup

```typescript
// Bad — event listener leaks on unmount
useEffect(() => {
  window.addEventListener('popstate', handlePopState);
}, []);

// Good — from App.tsx (cleanup removes listener)
useEffect(() => {
  const onPopState = () => setMode(getModeFromPath());
  window.addEventListener('popstate', onPopState);
  return () => window.removeEventListener('popstate', onPopState);
}, []);

// Good — from ResizableSplit.tsx (cleanup media query listener)
useEffect(() => {
  const mq = window.matchMedia('(min-width: 1024px)');
  setIsLg(mq.matches);
  const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}, []);

// Good — from EpochConverter.tsx (cleanup document listener)
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, []);
```

---

### 17. Missing `initialData` Prop

```typescript
// Bad — tool ignores Smart Detect data
export default function SqlFormatter() {
  const [input, setInput] = useState('');
  // User must manually paste even when navigated from Smart Detect
}

// Good — from SqlFormatter.tsx (accepts and loads initial data)
export default function SqlFormatter({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  useEffect(() => { if (initialData) setInput(initialData); }, [initialData]);
}

// Good — from App.tsx (parent passes pendingData to all tools)
mode === 'sqlformatter'  ? <SqlFormatter initialData={pendingData} /> :
mode === 'jsontools'     ? <JsonTools initialData={pendingData} /> :
mode === 'listcleaner'   ? <ListCleaner initialData={pendingData} /> :
mode === 'jwtdecode'     ? <JwtDecode initialData={pendingData} /> :
```

---

### 18. Hardcoded localStorage Keys

```typescript
// Bad — no prefix, risk of collision with other apps on same domain
localStorage.setItem('theme', 'dark');
localStorage.setItem('favorites', JSON.stringify(favorites));

// Good — from App.tsx (namespaced with devtoolkit: prefix)
const FAVORITES_KEY = 'devtoolkit:favorites';
localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));

// Good — from DiagramGenerator.tsx
const STORAGE_KEY = 'devtoolkit:diagram-history';
localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

// Good — theme persistence
localStorage.setItem('devtoolkit:theme', next ? 'dark' : 'light');
```

---

### 19. `dangerouslySetInnerHTML` With Raw Input

```typescript
// Bad — XSS vulnerability: raw user input rendered as HTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// Good — from SqlFormatter.tsx (escape FIRST, then wrap with styling spans)
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// highlightSql calls escHtml on content before wrapping keywords with styled spans
const highlightedOutput = useMemo(() => highlightSql(output), [output]);

<pre dangerouslySetInnerHTML={{ __html: highlightedOutput }} />

// Good — from JwtDecode.tsx (escape then highlight)
function highlightJson(json: string): string {
  const safe = escHtml(json);  // Escape user content first
  return safe.replace(
    /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|.../g,
    (_m, key, colon, strVal) => {
      if (key) return `<span style="color:#93c5fd">${key}</span>${colon}`;
      if (strVal) return `<span style="color:#86efac">${strVal}</span>`;
      // ...
    }
  );
}
```

---

### 20. No Server-Side Dependencies

```typescript
// Bad — this is a browser-only app
import express from 'express';
import { Pool } from 'pg';
import { createClient } from 'redis';

// Good — client-side only. Example of acceptable external call (user-initiated, opt-in):
// from QueryPlanViewer.tsx — Gemini AI with user-provided API key
const genAI = new GoogleGenerativeAI(apiKey);  // User provides key at runtime
const result = await model.generateContent(prompt);
```

---

### 21. Deep Relative Imports

```typescript
// Bad — fragile paths that break on refactor
import { formatItems } from '../../../../utils/formatter';
import type { AppMode } from '../../../../types';

// Good — use relative (project is flat, max 1 level deep)
import { processListItems } from '../utils/formatter';    // from components/
import ResizableSplit from './ResizableSplit';               // same directory
import { format as prettyPrintSql } from 'sql-formatter';  // external library
```

---

### 22. Missing Dark Mode Support

```typescript
// Bad — only works in light mode
<div className="bg-white text-gray-800 border border-gray-200">

// Good — from App.tsx (dark: prefix for dark mode variants)
className={`flex items-center rounded-lg transition-all ${
  mode === favId
    ? 'bg-blue-50 dark:bg-blue-500/15'
    : 'hover:bg-slate-50 dark:hover:bg-white/5'
}`}

// Good — from CspTools.tsx (dark mode for severity colors)
{ bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400' }
{ bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400' }
```

---

### 23. God Components (> 200 lines JSX) — Extract Sub-Components

```typescript
// Bad — 500-line component with everything inline
export default function ColorConverter() {
  // ... 500 lines of mixed logic, rendering, helpers

// Good — from ColorConverter.tsx (sub-components extracted at top of file)
function InlineCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <button onClick={handleCopy} className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] ...">
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'DONE' : 'COPY'}
    </button>
  );
}

function Badge({ pass, label }: { pass: boolean; label: string }) {
  return <span className={`inline-flex ... ${pass ? 'text-green-400 ...' : 'text-red-400 ...'}`}>{label} {pass ? 'PASS' : 'FAIL'}</span>;
}

// Good — from ListCleaner.tsx (Checkbox sub-component)
const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-3 cursor-pointer">
    <input type="checkbox" className="w-4 h-4 ..." checked={checked} onChange={e => onChange(e.target.checked)} />
    <span className="text-[10px] font-black text-slate-600 uppercase">{label}</span>
  </label>
);

// Good — from JsonTools.tsx (TreeNode recursive sub-component)
function TreeNode({ keyName, value, depth }: { keyName?: string | number; value: any; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  // ... self-contained rendering logic
}
```

---

### 24. God Functions (> 30 lines) — Extract Helpers

```typescript
// Bad — one giant function doing everything
const handleProcess = () => {
  // 50 lines: validate → parse → transform → format → update state → copy → toast
};

// Good — from utils/smartDetect.ts (small, focused detector functions)
export function detectJSON(input: string): number {
  const t = input.trim();
  if (!t) return 0;
  try { JSON.parse(t); return 95; } catch { /* continue */ }
  if (/^\s*[\{\[]/.test(t) && /[\}\]]\s*$/.test(t)) return /"[\w$]+":\s/.test(t) ? 85 : 75;
  if (/"[\w$]+":\s/.test(t) && (t.includes('{') || t.includes('['))) return 70;
  return 0;
}

export function detectSQL(input: string): number { /* focused on SQL detection */ }
export function detectJWT(input: string): number { /* focused on JWT detection */ }
```

---

### 25. Deep Nesting (> 3 levels) — Use Early Returns

```typescript
// Bad — deeply nested conditional logic
const handleCopy = () => {
  if (output) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(output).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }
};

// Good — from ListCleaner.tsx (early return)
const handleCopy = () => {
  if (!output) return;
  navigator.clipboard.writeText(output);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};

// Good — from ColorConverter.tsx (early return in useCallback)
const handleCopyAll = useCallback(() => {
  if (!colors) return;
  const lines = [`HEX: ${colors.hex}`, `RGB: ${colors.rgb}`, `HSL: ${colors.hsl}`].join('\n');
  navigator.clipboard.writeText(lines);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
}, [colors]);
```
