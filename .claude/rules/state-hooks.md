---
paths:
  - 'components/**/*.tsx'
  - 'App.tsx'
---

# State Management & Hooks

## State Management

DevToolKit uses **no global state library** (no Redux, Zustand, Jotai). Each tool component manages its own state via React hooks.

### 1. Component State (`useState`)

```typescript
export default function JsonTools({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<JsonTab>('format');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) setInput(initialData);
  }, [initialData]);
}
```

- Use function initializer for expensive defaults: `useState(() => computeDefault())`
- Group related state in an object when they always change together
- Keep independent state separate (`input`, `output`, `error`)

### 2. Persistent State (`localStorage`)

```typescript
const THEME_KEY = 'devtoolkit:theme';
const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');

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
| `devtoolkit:hidden-tools` | `JSON string[]` | Hidden tools |
| `devtoolkit:split:*` | `number` | ResizableSplit panel widths |

### 3. Derived State (`useMemo`)

```typescript
const compareResult = useMemo(() => {
  if (!listA || !listB) return null;
  return computeListDiff(listA, listB);
}, [listA, listB]);
```

### 4. Options Object Pattern

```typescript
const DEFAULT_OPTIONS: ListToolsOptions = {
  trim: true, removeDuplicates: true, sortAlpha: false, caseSensitive: true,
};
const [options, setOptions] = useState(DEFAULT_OPTIONS);

const updateOption = (key: keyof ListToolsOptions, value: boolean) => {
  setOptions(prev => ({ ...prev, [key]: value }));
};
```

### 5. Data Flow Between Tools

```
App.tsx (pendingData state)
  └─→ SmartDetect detects type, calls setMode(tool) + setPendingData(content)
       └─→ App renders <ToolComponent initialData={pendingData} />
            └─→ Tool initializes with data via useEffect
```

## Hooks Rules

### useMemo

**REQUIRED when:**

| Scenario | Example |
|---|---|
| Expensive computation (sort, filter, diff) | `useMemo(() => computeDiff(a, b), [a, b])` |
| Object/array passed as prop to memoized child | `useMemo(() => ({ x, y }), [x, y])` |
| Derived data from large datasets | `useMemo(() => items.filter(i => i.active), [items])` |

**NOT needed when:**
- Primitive values (already referentially stable)
- Simple string concatenation (cheap to compute)
- State setters (React guarantees stable identity)

### useCallback

**REQUIRED when:**

| Scenario | Example |
|---|---|
| Handler passed to child component | `useCallback(() => setMode('diff'), [])` |
| Function in useEffect dependency array | `useCallback(() => fetchData(), [url])` |
| Event handler used in ResizableSplit children | Prevent re-render of split panels |

**NOT needed when:**
- Handler used only in the same component
- Simple state setter call: `onClick={() => setX(true)}` is fine inline

### useEffect

1. **Always return cleanup** for subscriptions, timers, event listeners
2. **Declare all dependencies** — never suppress the exhaustive-deps warning
3. **One effect per concern** — don't mix unrelated logic in one effect

```typescript
// Good: Cleanup event listener
useEffect(() => {
  const handlePopState = () => { /* ... */ };
  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, []);
```

### useRef

- DOM element references (drag handles, textareas, scroll targets)
- Mutable values that don't trigger re-renders (timers, previous values)

```typescript
const containerRef = useRef<HTMLDivElement>(null);
const percentRef = useRef(50);
```

### Custom Hooks

- Prefix with `use` (e.g., `useFavorites`, `useTheme`)
- Place in `utils/` if reusable, co-locate in component file if single-use
- Must follow all Rules of Hooks

```typescript
// utils/useFavorites.ts
export function useFavorites() {
  const [favorites, setFavorites] = useState<AppMode[]>(() => {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  const toggleFavorite = useCallback((mode: AppMode) => {
    setFavorites(prev => prev.includes(mode)
      ? prev.filter(m => m !== mode)
      : [...prev, mode].slice(0, MAX_FAVORITES));
  }, []);

  return { favorites, toggleFavorite };
}
```

## Rules

1. **NO global state libraries** — useState + localStorage is sufficient
2. **Each tool owns its state** — no shared state between tools
3. **Use `useMemo` for expensive computations** — diffs, sorts, filters
4. **Use `useCallback` for handlers passed to children** — prevent unnecessary re-renders
5. **Default values via function initializer** — `useState(() => computeDefault())`
6. **Clean up effects** — always return cleanup for subscriptions, timers, event listeners
7. **Prefix localStorage keys with `devtoolkit:`** — avoid collisions
8. **Declare all effect dependencies** — never suppress exhaustive-deps warning
9. **One effect per concern** — don't mix unrelated logic
