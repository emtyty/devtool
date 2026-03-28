# 07 — Dark Mode

## Architecture

Dark mode is implemented via **HTML class toggle** + **CSS overrides**, not Tailwind's built-in dark variant.

```
index.html → script detects localStorage, adds .dark class before paint
App.tsx    → toggle button flips .dark class + saves to localStorage
index.css  → .dark overrides for all color tokens
```

## How It Works

### 1. Flash Prevention (index.html)

A blocking script in `<head>` checks localStorage before the page renders:

```html
<script>
  if (localStorage.getItem('devtoolkit:theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
</script>
```

### 2. Theme Toggle (App.tsx)

```typescript
const [dark, setDark] = useState(() => localStorage.getItem('devtoolkit:theme') === 'dark');

useEffect(() => {
  localStorage.setItem('devtoolkit:theme', dark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', dark);
}, [dark]);
```

### 3. CSS Overrides (index.css)

Tailwind v4 custom variant + comprehensive overrides:

```css
@custom-variant dark (&:is(.dark *));

/* Surface colors */
.dark .bg-white { background-color: #131c2e !important; }
.dark .bg-slate-50 { background-color: #0e1525 !important; }

/* Text colors */
.dark .text-slate-800 { color: #e2e8f0 !important; }
.dark .text-slate-600 { color: #94a3b8 !important; }

/* Borders */
.dark .border-slate-200 { border-color: #1e293b !important; }

/* Inputs & controls */
.dark select, .dark input, .dark textarea {
  background-color: #0f172a;
  color: #e2e8f0;
  border-color: #334155;
}
```

## Color Palette

| Light | Dark | Usage |
|---|---|---|
| `#ffffff` | `#131c2e` | Primary background |
| `#f8fafc` (slate-50) | `#0e1525` | Secondary background |
| `#1e293b` (slate-800) | `#e2e8f0` (slate-200) | Primary text |
| `#64748b` (slate-500) | `#94a3b8` (slate-400) | Secondary text |
| `#e2e8f0` (slate-200) | `#1e293b` (slate-800) | Borders |
| `#2563eb` (blue-600) | `#3b82f6` (blue-500) | Accent / interactive |

## Rules

1. **Always test both themes** — every UI change must look correct in light AND dark mode
2. **Use override classes in `index.css`** — do NOT use Tailwind `dark:` prefix directly in components (the override system handles it globally)
3. **No hardcoded colors** — use Tailwind classes that are overridden by the dark mode system
4. **Glass effects** — header uses `backdrop-blur` which works in both themes
5. **Third-party content** — add dark overrides for any third-party rendered HTML (markdown, query plans, etc.)
6. **localStorage key**: `devtoolkit:theme` — do not change
