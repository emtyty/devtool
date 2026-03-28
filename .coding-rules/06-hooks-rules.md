# 06 — Hooks Rules

## useState

- Primary state management tool
- Use function initializer for expensive defaults: `useState(() => computeDefault())`
- Group related state in an object when they always change together

```typescript
// Good: Related state grouped
const [options, setOptions] = useState<ListToolsOptions>(DEFAULT_OPTIONS);

// Good: Independent state separate
const [input, setInput] = useState('');
const [output, setOutput] = useState('');
const [error, setError] = useState<string | null>(null);
```

## useMemo

### REQUIRED when:

| Scenario | Example |
|---|---|
| Expensive computation (sort, filter, diff) | `useMemo(() => computeDiff(a, b), [a, b])` |
| Object/array passed as prop to memoized child | `useMemo(() => ({ x, y }), [x, y])` |
| Derived data from large datasets | `useMemo(() => items.filter(i => i.active), [items])` |

### NOT needed when:

| Scenario | Reason |
|---|---|
| Primitive values | Already referentially stable |
| Simple string concatenation | Cheap to compute |
| State setters | React guarantees stable identity |

```typescript
// Good: Expensive diff computation
const diffResult = useMemo(() => {
  if (!leftJson || !rightJson) return [];
  return computeDiff(JSON.parse(leftJson), JSON.parse(rightJson));
}, [leftJson, rightJson]);

// Bad: Unnecessary memo for cheap operation
const label = useMemo(() => `Count: ${items.length}`, [items.length]); // Just use inline
```

## useCallback

### REQUIRED when:

| Scenario | Example |
|---|---|
| Handler passed to child component | `useCallback(() => setMode('diff'), [])` |
| Function in useEffect dependency array | `useCallback(() => fetchData(), [url])` |
| Event handler used in ResizableSplit children | Prevent re-render of split panels |

### NOT needed when:

| Scenario | Reason |
|---|---|
| Handler used only in the same component | No re-render benefit |
| Simple state setter call | `onClick={() => setX(true)}` is fine inline |

```typescript
// Good: Handler passed to child
const handleFormat = useCallback(() => {
  try {
    setOutput(format(input, { language: dialect }));
    setError(null);
  } catch (e) {
    setError((e as Error).message);
  }
}, [input, dialect]);

// Good: Inline for simple state toggle (not passed down)
<button onClick={() => setMode('diff')}>Diff</button>
```

## useEffect

### Rules:

1. **Always return cleanup** for subscriptions, timers, event listeners
2. **Declare all dependencies** — never suppress the exhaustive-deps warning
3. **One effect per concern** — don't mix unrelated logic in one effect

```typescript
// Good: Cleanup event listener
useEffect(() => {
  const handlePopState = () => {
    const slug = window.location.pathname.slice(1);
    setMode(SLUG_TO_MODE[slug] ?? 'detect');
  };
  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, []);

// Good: Initialize from props
useEffect(() => {
  if (initialData) setInput(initialData);
}, [initialData]);
```

## useRef

Use for:
- DOM element references (drag handles, textareas, scroll targets)
- Mutable values that don't trigger re-renders (timers, previous values)

```typescript
const containerRef = useRef<HTMLDivElement>(null);
const percentRef = useRef(50); // Drag resize tracking
```

## Custom Hooks

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
