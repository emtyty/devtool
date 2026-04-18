---
paths:
  - 'components/**/*.tsx'
  - 'index.css'
---

# Styling, Tailwind & Dark Mode

## Tailwind CSS v4 Stack

| Technology | Purpose |
|---|---|
| Tailwind CSS v4 | Utility-first CSS framework |
| `@tailwindcss/postcss` | PostCSS plugin (replaces `@tailwind` directives) |
| `autoprefixer` | Vendor prefix generation |
| `index.css` | Global styles, dark mode overrides, custom components |

### Configuration

**`postcss.config.js`:**
```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

**`tailwind.config.js`:**
```javascript
export default {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}', './utils/**/*.ts', './lib/**/*.ts'],
  theme: { extend: {} },
  plugins: [],
};
```

## Utility Class Patterns

### Layout
```html
<div className="flex flex-col h-full">              <!-- Full height column -->
<div className="flex items-center gap-2 p-3">       <!-- Toolbar row -->
<div className="grid grid-cols-2 gap-4">             <!-- 2-column grid -->
<div className="flex-1 overflow-auto">               <!-- Scrollable content -->
```

### Typography
```html
<h2 className="text-lg font-bold text-slate-800">   <!-- Section heading -->
<span className="text-xs text-slate-500">            <!-- Label -->
<code className="font-mono text-sm">                 <!-- Code text -->
```

### Interactive Elements
```html
<button className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
<select className="px-2 py-1 text-sm border border-slate-200 rounded">
<textarea className="w-full h-full p-3 font-mono text-sm resize-none border-0 focus:outline-none">
```

### Responsive
```html
<div className="flex flex-col lg:flex-row">          <!-- Stack on mobile, row on desktop -->
<div className="hidden lg:block">                    <!-- Desktop only -->
```

## Custom CSS (`index.css`)

Custom styles for cases Tailwind can't handle:

```css
.theme-toggle { /* Toggle switch animation */ }
.drag-handle { /* Resize handle for ResizableSplit */ }
.markdown-body { /* Markdown preview styling */ }
.glass { /* Frosted glass effect for header */ }

:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --accent: #2563eb;
}
```

## Dark Mode Architecture

### Hybrid Approach (Actual Codebase Pattern)

The codebase uses **two complementary patterns**:

1. **CSS overrides in `index.css`** — for common Tailwind classes (bg-white, text-slate-800, border-slate-200, etc.)
2. **`dark:` prefix in components** — for specific/semantic colors not covered by global overrides (amber, emerald, purple, sky, etc.)

```
index.html → blocking script detects localStorage, adds .dark class before paint
App.tsx    → toggle button flips .dark class + saves to localStorage
index.css  → .dark overrides for common color tokens (via @custom-variant)
components → dark: prefix for specific colors (amber, emerald, purple, sky...)
```

### When to Use Which

| Pattern | Use For | Example |
|---|---|---|
| **CSS override** (already in `index.css`) | Common slate/white/blue classes | `bg-white`, `text-slate-800`, `border-slate-200` |
| **`dark:` prefix** in component | Semantic/specific colors NOT in overrides | `bg-amber-50 dark:bg-amber-500/10`, `text-red-700 dark:text-red-400` |

**Check `index.css` first** — if a class already has a `.dark` override, do NOT add `dark:` prefix in the component. If it doesn't, use `dark:` prefix.

### Flash Prevention (`index.html`)

```html
<script>
  if (localStorage.getItem('devtoolkit:theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
</script>
```

### Theme Toggle (`App.tsx`)

```typescript
const [dark, setDark] = useState(() => localStorage.getItem('devtoolkit:theme') === 'dark');

useEffect(() => {
  localStorage.setItem('devtoolkit:theme', dark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', dark);
}, [dark]);
```

### Tailwind v4 Custom Variant (`index.css`)

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

.dark .bg-white        { background-color: #131c2e !important; }
.dark .bg-slate-50     { background-color: #0e1525 !important; }
.dark .text-slate-800  { color: #e2e8f0 !important; }
.dark .border-slate-200 { border-color: #1e2d45 !important; }
/* ... 100+ overrides for common classes */
```

### Color Palette

| Light | Dark | Usage |
|---|---|---|
| `#ffffff` | `#131c2e` | Primary background |
| `#f8fafc` (slate-50) | `#0e1525` | Secondary background |
| `#1e293b` (slate-800) | `#e2e8f0` (slate-200) | Primary text |
| `#64748b` (slate-500) | `#94a3b8` (slate-400) | Secondary text |
| `#e2e8f0` (slate-200) | `#1e2d45` | Borders |
| `#2563eb` (blue-600) | `#3b82f6` (blue-500) | Accent / interactive |

## Styling Rules

1. **Tailwind utility classes first** — no CSS modules, no CSS-in-JS
2. **NO inline `style` props** — except for truly dynamic values (e.g., `style={{ width: `${percent}%` }}`)
3. **Custom CSS in `index.css` only** — for animations, complex pseudo-elements, third-party overrides
4. **Use slate color palette** — `slate-50` through `slate-900` for grays
5. **Use `gap-*` over `space-*`** — prefer flexbox gap for spacing
6. **Responsive: mobile-first** — default styles for mobile, `lg:` prefix for desktop
7. **No hardcoded colors** — use Tailwind palette or CSS variables

## Dark Mode Rules

1. **Always test both themes** — every UI change must look correct in light AND dark mode
2. **Check `index.css` overrides first** — if a class is already overridden, don't add `dark:` prefix
3. **Use `dark:` prefix for specific colors** — amber, emerald, purple, sky, and other semantic colors not in global overrides
4. **No hardcoded colors** — use Tailwind classes that participate in the dark mode system
5. **Glass effects** — header uses `backdrop-blur` which works in both themes
6. **Third-party content** — add dark overrides in `index.css` for rendered HTML (markdown, query plans)
7. **localStorage key**: `devtoolkit:theme` — do not change
