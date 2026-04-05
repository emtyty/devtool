# CLAUDE.md — DevToolKit

## Project Overview

DevToolKit is a **local-first, privacy-focused developer toolkit** that runs entirely in the browser. No server, no accounts, no tracking. Built by Coding4Pizza.

## Tech Stack

- **React 19** + **TypeScript 5.8** — UI framework (functional components, hooks only)
- **Vite 6** — Dev server (port 3000) and bundler
- **Tailwind CSS v4** — Styling via PostCSS (not CDN)
- **Prettier** + **ESLint 10** — Code formatting + linting
- **Vitest** + **Testing Library** — Unit/integration tests
- **Playwright** — E2E tests
- **Lucide React** + **Font Awesome 6** (CDN) — Icons
- **Inter** + **Fira Code** — Fonts (Google Fonts CDN)

## Commands

```bash
npm run dev          # Start dev server on port 3000 with HMR
npm run build        # Production build → dist/
npm run preview      # Preview production build
npm run format       # Prettier — auto-format all files
npm run format:check # Prettier — check formatting (CI)
npm run lint         # ESLint
npm run type-check   # tsc --noEmit
npm run test         # Vitest (unit tests)
npm run test:watch   # Vitest in watch mode
npm run test:coverage # Vitest with coverage
npm run test:e2e     # Playwright (e2e tests)
npm run test:e2e:ui  # Playwright with UI
npm run mcp:build    # Build MCP server
npm run mcp:dev      # Dev MCP server
npm run mcp:inspect  # Inspect MCP server with MCP Inspector
```

## Project Structure

```
├── App.tsx                        # Main app — routing, layout, sidebar, theme, favorites
├── index.tsx                      # React entry point with error handling
├── index.html                     # HTML shell, dark mode detection, fonts, loading screen
├── index.css                      # Global styles (Tailwind), dark mode overrides
├── types.ts                       # Shared TypeScript types (AppMode, etc.)
├── .prettierrc                    # Prettier config
├── eslint.config.js               # ESLint config (+ eslint-config-prettier)
├── vite.config.ts                 # Vite config (+ html-query-plan patches)
│
├── components/                    # React components (34 files)
│   ├── SmartDetect.tsx            # Content auto-detector (default route)
│   ├── DataFormatter.tsx          # Convert lists → SQL IN/VALUES/UNION/CSV
│   ├── ListCleaner.tsx            # Dedup, sort, trim, compare lists
│   ├── SqlFormatter.tsx           # Format/minify SQL with dialect support
│   ├── JsonTools.tsx              # Format/minify/repair/diff/tree/TS interface gen
│   ├── JsonDiffV2.tsx             # JSON diff viewer component
│   ├── MarkdownPreview.tsx        # Live GFM markdown editor + preview
│   ├── StackTraceFormatter.tsx    # Parse stack traces (.NET/JS/Java/Python/Go/Ruby)
│   ├── MockDataGenerator.tsx      # Generate fake data (JSON/CSV/SQL) via faker.js
│   ├── JwtDecode.tsx              # JWT token decoder with syntax highlighting
│   ├── TextTools.tsx              # Text case conversion, encoding, hashing
│   ├── TextDiff.tsx               # Text comparison/diff viewer
│   ├── EpochConverter.tsx         # Unix timestamp converter
│   ├── ColorConverter.tsx         # Color space converter (HEX/RGB/HSL/OKLCH)
│   ├── CronBuilder.tsx            # Cron expression builder + parser
│   ├── LogAnalyzer.tsx            # Log file analyzer
│   ├── DiagramGenerator.tsx       # Mermaid diagram generator
│   ├── UuidGenerator.tsx          # UUID / ULID generator
│   ├── FileConverter.tsx          # Convert images, data formats, File ↔ Base64
│   ├── TableLens.tsx              # CSV/XLSX viewer with filter, inline/batch edit, export
│   ├── NetworkWaterfallAnalyzer.tsx # HAR file network waterfall analyzer
│   ├── QueryPlanViewer.tsx        # SQL Server execution plan viewer + Gemini AI analysis
│   ├── CspTools.tsx               # CSP analyzer, console violation parser, domain builder
│   ├── MetadataExplorer.tsx       # Binary file metadata display
│   ├── MetadataSidebar.tsx        # Metadata sidebar panel
│   ├── DropZone.tsx               # File drop zone for metadata tool
│   ├── MetadataCard.tsx           # Metadata card component
│   ├── CopyButton.tsx             # Reusable copy-to-clipboard button
│   ├── ResizableSplit.tsx         # Resizable split pane component
│   ├── McpPage.tsx                # MCP server documentation page
│   ├── PrivacyPage.tsx            # Privacy policy page
│   ├── SettingsPage.tsx           # Tool visibility settings (enable/disable per tool)
│   ├── PdfMaker.tsx               # Combine images/PDFs/Word/Excel into one PDF
│   ├── PdfEditor.tsx              # PDF editor (split, reorder, annotate pages)
│   └── LandingPage.tsx            # (unused) Landing page
│
├── utils/                         # Pure utility functions — NO React (16 files)
│   ├── smartDetect.ts             # Content type detection engine
│   ├── formatter.ts               # SQL/list formatting utilities
│   ├── colorMath.ts               # Color space conversions + WCAG contrast
│   ├── cronParser.ts              # Cron expression parsing
│   ├── diagramParser.ts           # Text → diagram conversion
│   ├── diagramTemplates.ts        # Diagram template definitions
│   ├── epochConverter.ts          # Unix timestamp utilities
│   ├── exifParser.ts              # EXIF/metadata extraction via WebAssembly
│   ├── fileConverter.ts           # File format conversion logic
│   ├── jwtDecoder.ts              # JWT token decoding
│   ├── mermaidBuilder.ts          # Mermaid diagram generation
│   ├── mockDataGenerator.ts       # Faker.js data generation logic
│   ├── metadataUtils.ts           # Metadata helper functions
│   ├── cspEvaluator.ts            # CSP policy parser and security evaluator
│   ├── cspUtils.ts                # Console violation parser, suggestion builder
│   └── pdfMaker.ts                # PDF generation: merge images/PDFs/DOCX/XLSX → PDF
│
├── lib/                           # Complex analysis libraries (2 files)
│   ├── SQLPlanAnalyzer.ts         # SQL execution plan parser/analyzer
│   └── harAnalyzer.ts             # HAR file analysis for network waterfall
│
├── tests/                         # Test files
│   ├── setup.ts                   # Vitest setup (jsdom + global mocks)
│   ├── smartDetect.test.ts        # Unit tests for detection engine
│   └── integration/
│       └── MarkdownPreview.test.tsx
│
├── mcp/                           # MCP server (separate Node.js package)
│   ├── src/
│   │   ├── index.ts               # Server entry point
│   │   ├── registry.ts            # Tool registry
│   │   ├── compat.ts              # Compatibility layer
│   │   └── tools/                 # 26 MCP tool implementations
│   ├── package.json               # MCP dependencies (separate)
│   └── tsup.config.ts             # MCP build config
│
└── public/                        # Static assets
    └── test-data/
```

## Architecture

- **SPA with URL routing** — `App.tsx` manages `AppMode` state, renders selected tool via conditional rendering
- **Lazy loading** — All tool components use `React.lazy()` + `Suspense` for code splitting
- **URL routing** — HTML5 History API (`window.history.pushState`) maps each tool to a clean path. Unknown paths redirect to `/` (Smart Detect). Browser back/forward supported via `popstate` event.
- **No router library** — Navigation is state-driven with `MODE_TO_SLUG` / `SLUG_TO_MODE` maps in `App.tsx`
- **No global state** — Each tool manages its own state via `useState`. User preferences (theme, favorites, hidden tools) in `localStorage`.
- **Tool visibility** — `useHiddenTools()` hook + `SettingsPage` let users hide/show tools. Hidden tools are filtered from the sidebar, redirect to `/` if accessed by URL, and auto-removed from favorites. Stored in `devtoolkit:hidden-tools`.
- **Dark mode** — `.dark` class on `<html>`, CSS overrides in `index.css`, toggle in App.tsx
- **Path alias** — `@/*` maps to project root

### URL Route Map (28 routes)

| Path | Tool |
|------|------|
| `/` | Smart Detect (default) |
| `/sql-formatter` | SQL Formatter |
| `/json` | JSON Tools |
| `/jwt-decoder` | JWT Decoder |
| `/data-formatter` | Data Formatter |
| `/list-cleaner` | List Cleaner |
| `/markdown` | Markdown Preview |
| `/stack-trace` | Stack Trace Formatter |
| `/mock-data` | Mock Data Generator |
| `/text-tools` | Text Tools |
| `/text-diff` | Text Compare |
| `/epoch-converter` | Epoch Converter |
| `/color-converter` | Color Converter |
| `/cron-builder` | Cron Builder |
| `/log-analyzer` | Log Analyzer |
| `/diagram` | Diagram Generator |
| `/uuid-generator` | UUID / ULID |
| `/file-converter` | File Converter |
| `/table-lens` | Table Lens |
| `/network-waterfall` | Network Waterfall Analyzer |
| `/binary-metadata` | Binary Metadata |
| `/query-plan` | Query Plan Viewer |
| `/csp-tools` | CSP Tools |
| `/mcp-server` | MCP Server Page |
| `/privacy` | Privacy Policy |
| `/settings` | Settings (tool visibility) |
| `/pdf-maker` | PDF Maker |
| `/pdf-editor` | PDF Editor |

## Key Libraries

| Library | Purpose |
|---------|---------|
| `sql-formatter` | SQL formatting/minification (18+ dialects) |
| `jsonrepair` | Auto-repair malformed JSON |
| `@faker-js/faker` | Mock data generation (60+ field types) |
| `@uswriting/exiftool` | Binary metadata extraction (WASM) |
| `@google/genai` | Gemini AI for SQL plan analysis (opt-in, user API key) |
| `html-query-plan` | SQL Server execution plan rendering (patched in vite.config.ts) |
| `react-markdown` + `remark-gfm` | Markdown preview (GFM) |
| `mermaid` | Diagram rendering (flowchart, sequence, etc.) |
| `papaparse` | CSV parsing and generation |
| `xlsx` | Excel file handling |
| `@6over3/zeroperl-ts` | Perl WASM runtime for ExifTool |
| `pdf-lib` | Create/merge PDFs, embed images (PDF Maker) |
| `mammoth` | .docx → HTML conversion (PDF Maker) |
| `html2canvas` | Render HTML DOM → canvas for PDF embedding (PDF Maker) |

## Coding Rules

Detailed coding conventions are documented in `.coding-rules/` (18 files). Key references:

| Priority | File | Topic |
|----------|------|-------|
| Foundation | `01-project-structure.md` | Directory layout, file placement |
| Foundation | `02-component-patterns.md` | Component types, composition, splitting |
| Foundation | `03-naming-conventions.md` | Files, types, functions, constants |
| Core | `04-styling-tailwind.md` | Tailwind v4, utility classes, responsive |
| Core | `05-state-management.md` | useState, localStorage, no Redux |
| Core | `06-hooks-rules.md` | useMemo, useCallback, custom hooks |
| Core | `07-dark-mode.md` | Theme toggle, CSS overrides, color palette |
| Feature | `08-utility-functions.md` | Pure functions in `utils/` and `lib/` |
| Feature | `09-routing-navigation.md` | Adding new tools, URL slug map |
| Feature | `10-lazy-loading-performance.md` | Code splitting, memoization, bundle size |
| Quality | `11-error-handling.md` | Try-catch, graceful degradation |
| Quality | `12-formatting-linting.md` | Prettier + ESLint config |
| Quality | `13-security.md` | XSS, privacy, no tracking |
| Quality | `14-testing.md` | Vitest, Testing Library, Playwright |
| Quality | `15-accessibility.md` | ARIA, keyboard nav, screen readers |
| Reference | `16-environment-build.md` | Vite config, tsconfig, dependencies |
| Reference | `17-anti-patterns.md` | 25 common mistakes to avoid |
| Reference | `18-review-checklist.md` | PR review guide (~70 check items) |

### Quick Conventions Summary

- **Functional components only** — no class components, default export per file
- **Tailwind utility classes** — no CSS modules, no CSS-in-JS, no inline styles
- **No global state** — useState + localStorage, no Redux/Zustand. Keys: `devtoolkit:theme`, `devtoolkit:favorites`, `devtoolkit:hidden-tools`
- **Business logic in `utils/`** — components handle UI only, `utils/` must be pure (no React)
- **All tools lazy-loaded** — `React.lazy()` + `Suspense` with fallback
- **Prettier on save** — run `npm run format` before commit
- **Privacy-first** — no tracking, no analytics, no server calls, no PII
