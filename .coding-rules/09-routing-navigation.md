# 09 — Routing & Navigation

## Overview

DevToolKit uses **custom URL routing without React Router**. Navigation is state-driven via `window.history.pushState` and a slug-to-mode map in `App.tsx`.

## Route Map

Routes are defined as two lookup maps:

```typescript
const MODE_TO_SLUG: Record<AppMode, string> = {
  'detect': '',
  'sql': 'sql-formatter',
  'json': 'json',
  'jwt': 'jwt-decoder',
  // ... all tools
};

const SLUG_TO_MODE: Record<string, AppMode> = Object.fromEntries(
  Object.entries(MODE_TO_SLUG).map(([k, v]) => [v, k as AppMode])
);
```

## Navigation Pattern

```typescript
// Navigate to a tool
const navigateTo = (mode: AppMode) => {
  setMode(mode);
  const slug = MODE_TO_SLUG[mode];
  window.history.pushState(null, '', slug ? `/${slug}` : '/');
};

// Handle browser back/forward
useEffect(() => {
  const handlePopState = () => {
    const slug = window.location.pathname.slice(1);
    setMode(SLUG_TO_MODE[slug] ?? 'detect');
  };
  window.addEventListener('popstate', handlePopState);
  return () => window.removeEventListener('popstate', handlePopState);
}, []);

// Initialize from URL on mount
useEffect(() => {
  const slug = window.location.pathname.slice(1);
  if (slug && SLUG_TO_MODE[slug]) {
    setMode(SLUG_TO_MODE[slug]);
  }
}, []);
```

## Adding a New Route

When adding a new tool, update these in `App.tsx`:

1. **Add to `AppMode` type** in `types.ts`
2. **Add slug mapping** in `MODE_TO_SLUG`
3. **Add lazy import**: `const NewTool = lazy(() => import('./components/NewTool'));`
4. **Add render case** in the main switch/conditional rendering
5. **Add sidebar entry** with icon and label

```typescript
// types.ts
export type AppMode = 'detect' | 'sql' | 'json' | ... | 'new-tool';

// App.tsx
const MODE_TO_SLUG = {
  // ...existing
  'new-tool': 'new-tool',
};

const NewTool = lazy(() => import('./components/NewTool'));
```

## Rules

1. **No React Router** — use the existing `pushState` + slug map pattern
2. **Clean URL paths** — use kebab-case slugs (e.g., `/sql-formatter`, `/jwt-decoder`)
3. **Default route is Smart Detect** — `/` maps to the detect mode
4. **Unknown paths redirect to `/`** — fallback to Smart Detect for any unrecognized slug
5. **Every tool must have a URL** — all tools are deep-linkable
6. **Browser back/forward must work** — handled by the `popstate` listener
7. **No nested routes** — all tools are top-level (single segment paths only)
