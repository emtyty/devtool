# 04 — Styling & Tailwind

## Stack

| Technology | Purpose |
|---|---|
| Tailwind CSS v4 | Utility-first CSS framework |
| `@tailwindcss/postcss` | PostCSS plugin (replaces `@tailwind` directives) |
| `autoprefixer` | Vendor prefix generation |
| `index.css` | Global styles, dark mode overrides, custom components |

## Configuration

**`tailwind.config.js`:**
```javascript
export default {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}', './utils/**/*.ts', './lib/**/*.ts'],
  theme: { extend: {} },
  plugins: [],
};
```

**`postcss.config.js`:**
```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

## Utility Classes — Common Patterns

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

## Custom CSS (index.css)

Custom styles go in `index.css` for cases Tailwind can't handle:

```css
/* Custom component styles */
.theme-toggle { /* Toggle switch animation */ }
.drag-handle { /* Resize handle for ResizableSplit */ }
.markdown-body { /* Markdown preview styling */ }
.glass { /* Frosted glass effect for header */ }

/* CSS custom properties */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --accent: #2563eb;
}
```

## Rules

1. **Tailwind utility classes first** — use inline Tailwind classes for all styling
2. **NO CSS modules** — no `*.module.css` files
3. **NO CSS-in-JS** — no styled-components, emotion, etc.
4. **NO inline `style` props** — except for truly dynamic values (e.g., `style={{ width: `${percent}%` }}`)
5. **Custom CSS in `index.css` only** — for animations, complex pseudo-elements, third-party overrides
6. **Use slate color palette** — `slate-50` through `slate-900` for grays
7. **Use `gap-*` over `space-*`** — prefer flexbox gap for spacing between items
8. **Responsive: mobile-first** — default styles for mobile, `lg:` prefix for desktop
9. **No hardcoded colors** — use Tailwind palette or CSS variables
10. **Dark mode via `.dark` class** — see [07-dark-mode.md](07-dark-mode.md) for details
