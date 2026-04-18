---
paths:
  - 'components/**/*.tsx'
---

# Accessibility

## ARIA Attributes

### Interactive Elements

```typescript
// Icon-only buttons must have aria-label
<button onClick={handleCopy} aria-label="Copy to clipboard">
  <Copy size={14} />
</button>

// Toggle buttons
<button
  aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
  aria-pressed={dark}
  onClick={() => setDark(!dark)}
>
```

### Form Controls

```typescript
<label htmlFor="dialect-select" className="text-sm">Dialect:</label>
<select id="dialect-select" value={dialect} onChange={e => setDialect(e.target.value)}>

<textarea
  aria-label="Input"
  placeholder="Paste your SQL here..."
  value={input}
  onChange={e => setInput(e.target.value)}
/>
```

### Status Messages

```typescript
// Error messages — announce immediately
<div role="alert" className="text-red-500 text-sm">{error}</div>

// Status updates — announce at next pause
<div aria-live="polite" className="text-sm text-slate-500">
  {items.length} items processed
</div>
```

## Keyboard Navigation

- All interactive elements must be reachable via Tab key
- Use `tabIndex={0}` only when making a non-interactive element focusable
- Never use `tabIndex > 0` — it breaks natural tab order

```typescript
// Handle Escape to close/cancel
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### Focus Management

```typescript
const inputRef = useRef<HTMLTextAreaElement>(null);
useEffect(() => {
  inputRef.current?.focus();
}, [mode]);
```

## Color Contrast

| Element | Ratio | Standard |
|---|---|---|
| Body text | 4.5:1 | WCAG AA |
| Large text (18px+) | 3:1 | WCAG AA |
| Interactive elements | 3:1 | WCAG AA |
| Disabled elements | N/A | Exempt |

All color combinations must meet contrast in both light and dark mode.

## Semantic HTML

```typescript
// Good
<nav aria-label="Tool navigation"><ul>{/* ... */}</ul></nav>
<main>{/* tool content */}</main>
<footer>{/* footer links */}</footer>

// Bad — div soup
<div className="nav"><div>{/* ... */}</div></div>
```

## Rules

1. **All icon-only buttons need `aria-label`** — screen readers can't see icons
2. **Use `role="alert"` for error messages** — announces immediately
3. **Use `aria-live="polite"` for status updates** — announces at next pause
4. **Tab order must be logical** — follow visual layout order
5. **Test keyboard navigation** — every feature operable without a mouse
6. **Check color contrast** — 4.5:1 for text, 3:1 for large text/interactive
7. **Both themes** — accessibility must work in light AND dark mode
8. **Semantic HTML** — use `<nav>`, `<main>`, `<button>`, `<label>` over generic `<div>`
