---
paths:
  - 'App.tsx'
  - 'types.ts'
  - 'components/**/*.tsx'
---

# Routing & Navigation

## Overview

DevToolKit uses **custom URL routing without React Router**. Navigation is state-driven via `window.history.pushState` and a slug-to-mode map in `App.tsx`.

## Route Map

`AppMode` type and slug map both live in `App.tsx`:

```typescript
type AppMode = 'smartdetect' | 'sqlformatter' | 'jsontools' | 'jwtdecode' | ...;

const MODE_TO_SLUG: Record<AppMode, string> = {
  smartdetect: '',
  sqlformatter: 'sql-formatter',
  jsontools: 'json',
  jwtdecode: 'jwt-decoder',
  // ... all tools
};

const SLUG_TO_MODE: Record<string, AppMode> = Object.fromEntries(
  Object.entries(MODE_TO_SLUG).map(([mode, slug]) => [slug, mode as AppMode])
);
```

## Navigation Pattern

```typescript
function getModeFromPath(): AppMode {
  const slug = window.location.pathname.slice(1);
  if (!slug) return 'smartdetect';
  return SLUG_TO_MODE[slug] ?? 'smartdetect';
}

const navigateTo = (mode: AppMode) => {
  setMode(mode);
  const slug = MODE_TO_SLUG[mode];
  window.history.pushState(null, '', slug ? `/${slug}` : '/');
};

// Handle browser back/forward
useEffect(() => {
  const handlePopState = () => setMode(getModeFromPath());
  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, []);

// Initialize from URL on mount
const [mode, setMode] = useState<AppMode>(getModeFromPath);
```

## Adding a New Tool

When adding a new tool, update these in `App.tsx`:

1. **Add to `AppMode` union type** (defined in `App.tsx`, not `types.ts`)
2. **Add slug mapping** in `MODE_TO_SLUG`
3. **Add lazy import**: `const NewTool = lazy(() => import('./components/NewTool'));`
4. **Add render case** in the main conditional rendering
5. **Add sidebar entry** with icon and label in `NAV_ITEMS`

```typescript
// App.tsx
type AppMode = '...existing' | 'newtool';

const MODE_TO_SLUG: Record<AppMode, string> = {
  ...existing,
  newtool: 'new-tool',  // kebab-case URL slug
};

const NewTool = lazy(() => import('./components/NewTool'));
```

## Routing Rules

1. **No React Router** — use the existing `pushState` + slug map pattern
2. **Clean URL paths** — use kebab-case slugs (e.g., `/sql-formatter`, `/jwt-decoder`)
3. **Default route is Smart Detect** — `/` maps to `'smartdetect'`
4. **Unknown paths redirect to `/`** — fallback to `'smartdetect'` for any unrecognized slug
5. **Every tool must have a URL** — all tools are deep-linkable
6. **Browser back/forward must work** — handled by the `popstate` listener
7. **No nested routes** — all tools are top-level (single segment paths only)
8. **All tool components must be lazy-loaded** — `React.lazy(() => import(...))` + `Suspense`
