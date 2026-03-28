# 15 — Accessibility

## Overview

DevToolKit is a developer tool, but accessibility still matters. Support keyboard navigation, screen readers, and sufficient color contrast.

## ARIA Attributes

### Interactive Elements

```typescript
// Buttons must have accessible text
<button onClick={handleCopy} aria-label="Copy to clipboard">
  <Copy size={14} />
</button>

// Tooltips via title
<button title="Format SQL" onClick={handleFormat}>
  <Code2 size={14} />
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
// Labels for inputs
<label htmlFor="dialect-select" className="text-sm">Dialect:</label>
<select id="dialect-select" value={dialect} onChange={e => setDialect(e.target.value)}>

// Textareas with description
<textarea
  aria-label="Input"
  placeholder="Paste your SQL here..."
  value={input}
  onChange={e => setInput(e.target.value)}
/>
```

### Status Messages

```typescript
// Error messages
<div role="alert" className="text-red-500 text-sm">
  {error}
</div>

// Status updates
<div aria-live="polite" className="text-sm text-slate-500">
  {items.length} items processed
</div>
```

## Keyboard Navigation

### Tab Order

- All interactive elements must be reachable via Tab key
- Use `tabIndex={0}` only when making a non-interactive element focusable
- Never use `tabIndex > 0` — it breaks natural tab order

### Keyboard Shortcuts

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
// Focus input after mode switch
const inputRef = useRef<HTMLTextAreaElement>(null);
useEffect(() => {
  inputRef.current?.focus();
}, [mode]);
```

## Color Contrast

### Minimum Requirements

| Element | Ratio | Standard |
|---|---|---|
| Body text | 4.5:1 | WCAG AA |
| Large text (18px+) | 3:1 | WCAG AA |
| Interactive elements | 3:1 | WCAG AA |
| Disabled elements | N/A | Exempt |

### Both Themes

All color combinations must meet contrast requirements in both light and dark mode:

```typescript
// Good: Sufficient contrast in both themes
className="text-slate-800"    // Light: #1e293b on #fff → 12.6:1
// Dark override: #e2e8f0 on #131c2e → 11.3:1

// Bad: Low contrast
className="text-slate-300"    // Light: #cbd5e1 on #fff → 1.8:1 — fails!
```

## Semantic HTML

```typescript
// Good: Semantic structure
<nav aria-label="Tool navigation">
  <ul>{/* tool list */}</ul>
</nav>
<main>{/* tool content */}</main>
<footer>{/* footer links */}</footer>

// Bad: Div soup
<div className="nav">
  <div>{/* tool list */}</div>
</div>
```

## Rules

1. **All icon-only buttons need `aria-label`** — screen readers can't see icons
2. **Use `role="alert"` for error messages** — announces to screen readers immediately
3. **Use `aria-live="polite"` for status updates** — announces at next pause
4. **Tab order must be logical** — follow visual layout order
5. **Test keyboard navigation** — every feature must be operable without a mouse
6. **Check color contrast** — 4.5:1 for text, 3:1 for large text/interactive elements
7. **Both themes** — accessibility must work in light AND dark mode
8. **Semantic HTML** — use `<nav>`, `<main>`, `<button>`, `<label>` over generic `<div>`
