# 18 — Code Review Checklist

> Use this checklist when reviewing PRs. Items link to detailed rule files.

## 1. Project Structure ([01](01-project-structure.md))
- [ ] New component in `components/`
- [ ] New utility in `utils/` (no React imports) or `lib/` (complex analysis)
- [ ] One primary component per file
- [ ] Shared types in `types.ts`

## 2. Component Patterns ([02](02-component-patterns.md))
- [ ] Functional component with default export
- [ ] Tool accepts `initialData` prop for Smart Detect
- [ ] Component < 200 lines of JSX (split if larger)
- [ ] Functions < 30 lines (extract helpers if longer)
- [ ] Max 3 levels of JSX nesting

## 3. Naming ([03](03-naming-conventions.md))
- [ ] Component file: PascalCase `.tsx`
- [ ] Utility file: camelCase `.ts`
- [ ] Functions: camelCase, verb-first
- [ ] Types/interfaces: PascalCase
- [ ] Constants: UPPER_SNAKE_CASE
- [ ] Booleans: `is/has/can` prefix

## 4. Styling ([04](04-styling-tailwind.md))
- [ ] Tailwind utility classes (no CSS modules, no CSS-in-JS)
- [ ] No inline `style` props (except dynamic values)
- [ ] No hardcoded colors — use Tailwind palette
- [ ] Responsive: mobile-first, `lg:` for desktop

## 5. State Management ([05](05-state-management.md))
- [ ] No global state library added
- [ ] localStorage keys prefixed with `devtoolkit:`
- [ ] Effects have cleanup functions (timers, listeners)
- [ ] Expensive computations wrapped in `useMemo`

## 6. Hooks ([06](06-hooks-rules.md))
- [ ] `useMemo` for expensive computations (sort, filter, diff)
- [ ] `useCallback` for handlers passed to children
- [ ] No unnecessary memoization of primitives
- [ ] All effect dependencies declared (no suppressed warnings)
- [ ] Custom hooks prefixed with `use`

## 7. Dark Mode ([07](07-dark-mode.md))
- [ ] UI looks correct in both light and dark themes
- [ ] No hardcoded background/text colors that bypass dark overrides
- [ ] Third-party rendered content has dark mode overrides

## 8. Utilities ([08](08-utility-functions.md))
- [ ] No React imports in `utils/` or `lib/`
- [ ] Pure functions with typed inputs/outputs
- [ ] Guard clauses for invalid input
- [ ] Named exports (not default)

## 9. Routing ([09](09-routing-navigation.md))
- [ ] New tool added to `MODE_TO_SLUG` map
- [ ] New tool added to `AppMode` type
- [ ] Lazy import with `React.lazy()`
- [ ] Sidebar entry with icon and label
- [ ] Clean kebab-case URL slug

## 10. Performance ([10](10-lazy-loading-performance.md))
- [ ] New tool component is lazy-loaded
- [ ] Suspense wrapper with loading fallback
- [ ] New dependency < 50KB gzipped (or justified)
- [ ] License check (no GPL/LGPL)

## 11. Error Handling ([11](11-error-handling.md))
- [ ] No empty catch blocks
- [ ] Errors displayed in UI via `setError()`
- [ ] Errors cleared on success (`setError(null)`)
- [ ] `finally` used for cleanup (loading states)
- [ ] No `console.log` for errors

## 12. Formatting & Linting ([12](12-formatting-linting.md))
- [ ] ESLint passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Imports grouped correctly (React → external → icons → components → utils → types)
- [ ] Type-only imports use `import type`

## 13. Security ([13](13-security.md))
- [ ] No `dangerouslySetInnerHTML` with user input
- [ ] HTML content escaped before rendering
- [ ] No hardcoded API keys or secrets
- [ ] External URLs validated (no open redirect)
- [ ] `JSON.parse` wrapped in try-catch

## 14. Testing ([14](14-testing.md))
- [ ] New utility has unit tests
- [ ] Tests pass: `npm run test`
- [ ] No skipped tests (`.skip`)

## 15. Accessibility ([15](15-accessibility.md))
- [ ] Interactive elements have `aria-label`
- [ ] Buttons have accessible text (visible or aria)
- [ ] Keyboard navigation works for new features
- [ ] Color contrast sufficient in both themes

## 16. Environment & Build ([16](16-environment-build.md))
- [ ] No server-side dependencies added
- [ ] `@/` path alias used instead of deep relative imports
- [ ] WASM files included in `assetsInclude` if needed
- [ ] Build succeeds: `npm run build`

## 17. Anti-Patterns ([17](17-anti-patterns.md))
- [ ] No global state libraries
- [ ] No class components
- [ ] No React Router imports
- [ ] No CSS-in-JS or CSS modules
- [ ] No `dangerouslySetInnerHTML` with unsanitized input
- [ ] No server-side dependencies
- [ ] No full library imports (tree-shake)
