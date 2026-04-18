# Code Review Checklist

> Use when reviewing PRs.

## 1. Project Structure
- [ ] New component in `components/`
- [ ] New utility in `utils/` (no React imports) or `lib/` (complex analysis)
- [ ] One primary component per file
- [ ] Shared types in `types.ts`

## 2. Component Patterns
- [ ] Functional component with default export
- [ ] Tool accepts `initialData` prop for Smart Detect
- [ ] Component < 200 lines of JSX (split if larger)
- [ ] Functions < 30 lines (extract helpers)
- [ ] Max 3 levels of JSX nesting

## 3. Naming
- [ ] Component file: PascalCase `.tsx`
- [ ] Utility file: camelCase `.ts`
- [ ] Functions: camelCase, verb-first
- [ ] Types/interfaces: PascalCase
- [ ] Constants: UPPER_SNAKE_CASE
- [ ] Booleans: `is/has/can` prefix

## 4. Styling
- [ ] Tailwind utility classes (no CSS modules, no CSS-in-JS)
- [ ] No inline `style` props (except dynamic values)
- [ ] No hardcoded colors — use Tailwind palette
- [ ] Responsive: mobile-first, `lg:` for desktop

## 5. State Management
- [ ] No global state library added
- [ ] localStorage keys prefixed with `devtoolkit:`
- [ ] Effects have cleanup functions (timers, listeners)
- [ ] Expensive computations wrapped in `useMemo`

## 6. Hooks
- [ ] `useMemo` for expensive computations (sort, filter, diff)
- [ ] `useCallback` for handlers passed to children
- [ ] No unnecessary memoization of primitives
- [ ] All effect dependencies declared (no suppressed warnings)
- [ ] Custom hooks prefixed with `use`

## 7. Dark Mode
- [ ] UI looks correct in both light and dark themes
- [ ] Common classes rely on `index.css` overrides (no redundant `dark:`)
- [ ] Specific colors use `dark:` prefix (amber, emerald, purple, sky...)
- [ ] Third-party rendered content has dark mode overrides

## 8. Utilities
- [ ] No React imports in `utils/` or `lib/`
- [ ] Pure functions with typed inputs/outputs
- [ ] Guard clauses for invalid input
- [ ] Named exports (not default)

## 9. Routing
- [ ] New tool added to `MODE_TO_SLUG` map
- [ ] New tool added to `AppMode` type
- [ ] Lazy import with `React.lazy()`
- [ ] Sidebar entry with icon and label
- [ ] Clean kebab-case URL slug

## 10. Performance
- [ ] New tool component is lazy-loaded
- [ ] Suspense wrapper with loading fallback
- [ ] New dependency < 50KB gzipped (or justified)
- [ ] License check (no GPL/LGPL)

## 11. Error Handling
- [ ] No empty catch blocks
- [ ] Errors displayed in UI via `setError()`
- [ ] Errors cleared on success (`setError(null)`)
- [ ] `finally` used for cleanup (loading states)
- [ ] No `console.log` for errors

## 12. Formatting & Linting
- [ ] ESLint passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Imports grouped correctly (React → external → icons → components → utils → types)
- [ ] Type-only imports use `import type`

## 13. Security
- [ ] No `dangerouslySetInnerHTML` with user input
- [ ] HTML content escaped before rendering
- [ ] No hardcoded API keys or secrets
- [ ] External URLs validated
- [ ] `JSON.parse` wrapped in try-catch

## 14. Testing
- [ ] New utility has unit tests
- [ ] Tests pass: `npm run test`
- [ ] No skipped tests (`.skip`)

## 15. Accessibility
- [ ] Interactive elements have `aria-label`
- [ ] Buttons have accessible text (visible or aria)
- [ ] Keyboard navigation works for new features
- [ ] Color contrast sufficient in both themes

## 16. Environment & Build
- [ ] No server-side dependencies added
- [ ] `@/` path alias used instead of deep relative imports
- [ ] WASM files included in `assetsInclude` if needed
- [ ] Build succeeds: `npm run build`

## 17. Anti-Patterns
- [ ] No global state libraries
- [ ] No class components
- [ ] No React Router imports
- [ ] No CSS-in-JS or CSS modules
- [ ] No `dangerouslySetInnerHTML` with unsanitized input
- [ ] No server-side dependencies
- [ ] No full library imports (tree-shake)
