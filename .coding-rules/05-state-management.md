# 05 — State Management

## Overview

DevToolKit uses **no global state library** (no Redux, Zustand, Jotai). Each tool component manages its own state via React hooks. This is intentional — the app is a collection of independent tools.

## Patterns

### 1. Component State (`useState`)

Primary pattern for all tool state:

```typescript
export default function JsonTools({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<JsonTab>('format');
  const [error, setError] = useState<string | null>(null);

  // Initialize from Smart Detect
  useEffect(() => {
    if (initialData) setInput(initialData);
  }, [initialData]);

  return <div>...</div>;
}
```

### 2. Persistent State (`localStorage`)

For user preferences that survive page reloads:

```typescript
// Theme
const THEME_KEY = 'devtoolkit:theme';
const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');

// Save on change
useEffect(() => {
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', dark);
}, [dark]);
```

**Current localStorage keys:**

| Key | Type | Purpose |
|---|---|---|
| `devtoolkit:theme` | `'light' \| 'dark'` | Theme preference |
| `devtoolkit:favorites` | `JSON string[]` | Favorite tools (max 5) |
| `devtoolkit:split:*` | `number` | ResizableSplit panel widths |

### 3. Derived State (`useMemo`)

For values computed from other state:

```typescript
const compareResult = useMemo(() => {
  if (!listA || !listB) return null;
  return computeListDiff(listA, listB);
}, [listA, listB]);
```

### 4. Options Object Pattern

Group related settings into a single state object:

```typescript
const DEFAULT_OPTIONS: ListToolsOptions = {
  trim: true,
  removeDuplicates: true,
  sortAlpha: false,
  caseSensitive: true,
};

const [options, setOptions] = useState(DEFAULT_OPTIONS);

// Update single option
const updateOption = (key: keyof ListToolsOptions, value: boolean) => {
  setOptions(prev => ({ ...prev, [key]: value }));
};
```

### 5. Data Flow Between Tools

Smart Detect passes data to tools via `initialData` prop:

```
App.tsx (pendingData state)
  └─→ SmartDetect detects type, calls setMode(tool) + setPendingData(content)
       └─→ App renders <ToolComponent initialData={pendingData} />
            └─→ Tool initializes with data via useEffect
```

## Rules

1. **NO global state libraries** — useState + localStorage is sufficient
2. **Each tool owns its state** — no shared state between tools
3. **Use `useMemo` for expensive computations** — diffs, sorts, filters
4. **Use `useCallback` for handlers passed to children** — prevent unnecessary re-renders
5. **Default values via function initializer** — `useState(() => computeDefault())` for expensive defaults
6. **Clean up effects** — always return cleanup functions for subscriptions, timers, event listeners
7. **Prefix localStorage keys with `devtoolkit:`** — avoid collisions
