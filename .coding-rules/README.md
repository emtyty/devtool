# Coding Rules — DevToolKit

> **Local-first, privacy-focused developer toolkit** — No server, no accounts, no tracking.

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI framework (functional components, hooks) |
| TypeScript | ~5.8 | Type safety, strict mode |
| Vite | 6 | Dev server (port 3000), bundler, HMR |
| Tailwind CSS | v4 | Utility-first styling via PostCSS |
| Vitest | 2.0 | Unit testing |
| Playwright | 1.44 | E2E testing |
| Testing Library | 16.0 | Component testing |
| Lucide React | — | Icon library |
| Font Awesome 6 | CDN | Additional icons |

## File Index

Files are ordered by priority — what you need to know first when working on this project.

### Foundation (read first)

| # | File | Topic |
|---|---|---|
| 01 | [Project Structure](01-project-structure.md) | Directory layout, file organization |
| 02 | [Component Patterns](02-component-patterns.md) | Functional components, composition, splitting |
| 03 | [Naming Conventions](03-naming-conventions.md) | Files, types, functions, constants |

### Core Development (daily patterns)

| # | File | Topic |
|---|---|---|
| 04 | [Styling & Tailwind](04-styling-tailwind.md) | Tailwind v4, utility classes, responsive |
| 05 | [State Management](05-state-management.md) | useState, localStorage, derived state |
| 06 | [Hooks Rules](06-hooks-rules.md) | useMemo, useCallback, custom hooks |
| 07 | [Dark Mode](07-dark-mode.md) | Theme toggle, CSS overrides, color palette |

### Feature Development (adding new tools)

| # | File | Topic |
|---|---|---|
| 08 | [Utility Functions](08-utility-functions.md) | Pure functions in `utils/` and `lib/` |
| 09 | [Routing & Navigation](09-routing-navigation.md) | URL routing, slug map, history API |
| 10 | [Lazy Loading & Performance](10-lazy-loading-performance.md) | Code splitting, memoization, bundle size |

### Quality & Safety

| # | File | Topic |
|---|---|---|
| 11 | [Error Handling](11-error-handling.md) | Try-catch, graceful degradation, user feedback |
| 12 | [Formatting & Linting](12-formatting-linting.md) | ESLint, code style, import order |
| 13 | [Security](13-security.md) | Client-side security, XSS, privacy |
| 14 | [Testing](14-testing.md) | Vitest, Testing Library, Playwright |
| 15 | [Accessibility](15-accessibility.md) | ARIA, keyboard nav, screen readers |

### Reference (look up when needed)

| # | File | Topic |
|---|---|---|
| 16 | [Environment & Build](16-environment-build.md) | Vite config, tsconfig, dependencies |
| 17 | [Anti-Patterns](17-anti-patterns.md) | Common mistakes and correct alternatives |
| 18 | [Review Checklist](18-review-checklist.md) | PR review guide (links to all other files) |

## Usage

- **Onboarding**: Read files 01 → 10 (Foundation + Core + Feature)
- **PR Review**: Use file 18 (Review Checklist) as primary reference
- **Quick Reference**: Jump to specific topic by file number
