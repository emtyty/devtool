# 11 — Error Handling

## Overview

DevToolKit is a client-side-only app with no backend. Error handling focuses on:
1. Graceful degradation for invalid user input
2. Clear error messages displayed in the UI
3. Critical boot failure handling in `index.tsx`

## Patterns

### 1. Try-Catch with User Feedback

Display errors in the UI, don't swallow them:

```typescript
const [error, setError] = useState<string | null>(null);

const handleFormat = useCallback(() => {
  try {
    const result = JSON.parse(input);
    setOutput(JSON.stringify(result, null, 2));
    setError(null);  // Clear previous error
  } catch (e) {
    setError(`Invalid JSON: ${(e as Error).message}`);
  }
}, [input]);

// In JSX
{error && (
  <div className="text-red-500 text-sm p-2 bg-red-50 rounded">
    {error}
  </div>
)}
```

### 2. Silent Validation (Boolean Check)

For validators and detectors — fail silently, return false:

```typescript
function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;  // Not an error — just detection
  }
}
```

### 3. Graceful Degradation

Try the best option, fall back to a simpler one:

```typescript
// Try pretty-print, fallback to raw output
try {
  return prettyPrintSql(input, { language: 'tsql' });
} catch {
  return input;  // Return unformatted version
}
```

### 4. Boot-Level Error Handling (index.tsx)

Critical errors before React mounts:

```typescript
// Catch React mount failures
try {
  const root = createRoot(document.getElementById('root')!);
  root.render(<React.StrictMode><App /></React.StrictMode>);
} catch (error) {
  showError(`Failed to start: ${error}`);
}

// Catch WASM/Worker load failures
window.addEventListener('unhandledrejection', (event) => {
  showError(`Module Load Error: ${event.reason}`);
});
```

### 5. File Processing Errors

For binary file operations that can fail in many ways:

```typescript
const handleFile = async (file: File) => {
  try {
    setError(null);
    setLoading(true);
    const metadata = await extractMetadata(file);
    setResult(metadata);
  } catch (e) {
    setError(`Failed to process ${file.name}: ${(e as Error).message}`);
  } finally {
    setLoading(false);
  }
};
```

### 6. Null Safety

Use TypeScript's null-safety features:

```typescript
// Optional chaining
const name = file?.name;
const size = metadata?.exif?.imageWidth;

// Nullish coalescing
const dialect = selectedDialect ?? 'sql';
const theme = localStorage.getItem('theme') ?? 'light';

// Type guards
if (!session) {
  return <DropZone onDrop={handleDrop} />;
}
```

## Rules

1. **NO empty catch blocks** — always log, set error state, or return a fallback
2. **NO `console.log` for errors** — display errors in the UI with `setError()`
3. **Clear errors on success** — always `setError(null)` when an operation succeeds
4. **Use `finally` for cleanup** — reset loading states, close resources
5. **Type errors with `(e as Error).message`** — TypeScript catch is `unknown` by default
6. **Validate at boundaries** — check user input before processing, but trust internal functions
7. **Don't over-catch** — let programming errors bubble up during development (React StrictMode helps)
