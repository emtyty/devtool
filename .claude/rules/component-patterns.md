# Component Patterns

## Component Types

### 1. Tool Component (Feature)

Each tool is a self-contained component with its own state and UI:

```typescript
export default function SqlFormatter({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [dialect, setDialect] = useState<SqlDialect>('sql');

  useEffect(() => {
    if (initialData) setInput(initialData);
  }, [initialData]);

  const handleFormat = useCallback(() => {
    setOutput(format(input, { language: dialect }));
  }, [input, dialect]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3">{/* Toolbar */}</div>
      <ResizableSplit
        left={<textarea value={input} onChange={e => setInput(e.target.value)} />}
        right={<pre>{output}</pre>}
        storageKey="sql-formatter"
      />
    </div>
  );
}
```

### 2. Reusable UI Component

Small, focused components shared across tools:

```typescript
interface CopyButtonProps {
  text: string;
  label?: string;
}

export default function CopyButton({ text, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} aria-label={label}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
```

### 3. Layout Component

Structural components that control arrangement (e.g., `ResizableSplit`).

## Composition Patterns

### Tab/Mode Switching

Use discriminated union types for mode:

```typescript
type JsonTab = 'format' | 'diff' | 'ts' | 'unescape';
const [mode, setMode] = useState<JsonTab>('format');

return (
  <div>
    <nav className="flex gap-1">
      {(['format', 'diff', 'ts', 'unescape'] as const).map(tab => (
        <button key={tab} onClick={() => setMode(tab)}
          className={mode === tab ? 'bg-blue-600 text-white' : 'text-slate-600'}>
          {tab}
        </button>
      ))}
    </nav>
    {mode === 'format' && <FormatPanel />}
    {mode === 'diff' && <DiffPanel />}
  </div>
);
```

### ResizableSplit Reuse

```typescript
<ResizableSplit
  left={<InputPanel />}
  right={<OutputPanel />}
  storageKey="tool-name"  // Persists panel width
/>
```

### Co-located Sub-Components

Small helper components defined in the same file (not exported):

```typescript
function TreeNode({ node, depth }: { node: JsonNode; depth: number }) {
  return <div style={{ paddingLeft: depth * 16 }}>{node.key}: {node.value}</div>;
}

export default function JsonTools() { ... }
```

## Component Rules

1. **Functional components only** — no class components
2. **Default export for primary component** — `export default function ToolName()`
3. **One primary component per file** — small helpers can be co-located above the main export
4. **Props interface** — define explicitly for reusable components; inline for simple tool props
5. **Split at ~200 lines** — if a component grows beyond 200 lines of JSX, extract sub-components
6. **Functions > 30 lines** — extract into named helper functions
7. **Max 3 levels of JSX nesting** — use early returns or extracted components to reduce nesting
8. **Accept `initialData` prop** — tool components should accept optional initial data from Smart Detect

## Related Rules

Detailed rules for specific topics are in separate files (loaded on demand when working with matching files):

- **Styling & Dark Mode** → `styling-dark-mode.md`
- **State & Hooks** → `state-hooks.md`
- **Performance & Lazy Loading** → `performance.md`
- **Error Handling** → `error-handling.md`
- **Accessibility** → `accessibility.md`
