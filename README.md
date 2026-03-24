# DevToolKit

A local-first developer toolkit. Professional-grade tools that run 100% in your browser — no server, no account, no tracking.

## Tools

| Tool | What it does |
|------|-------------|
| **Smart Detector** | Auto-detect input type and route to the right tool |
| **Data Formatter** | Convert raw lists into SQL `IN` clauses, `VALUES`, `UNION ALL`, or CSV |
| **File Converter** | Convert images (PNG/JPG/WebP/BMP/AVIF), structured data (JSON/CSV/TSV/XML/YAML), and File ↔ Base64 with batch queue + ZIP download |
| **List Cleaner** | Deduplicate, sort, trim, and normalize plain-text lists with live unique/dupe counts |
| **SQL Formatter** | Format or minify SQL with dialect support and highlighted parameters |
| **JSON Tools** | Format, minify, auto-repair, diff two payloads, tree view, generate TypeScript interfaces |
| **Markdown Preview** | Live GFM editor with tables, task lists, and syntax-highlighted code blocks |
| **Stack Trace Formatter** | Parse and display .NET/JS/Java/Python/Go/Ruby stack traces with user code highlighting |
| **Mock Data Generator** | Generate fake test data (JSON/CSV/SQL) via faker.js with 60+ field types |
| **JWT Decode** | Decode and inspect JWT tokens with syntax highlighting |
| **Text Tools** | Log Insights pattern builder (CloudWatch) and Jira release note formatter |
| **Epoch Converter** | Convert between Unix timestamps and human-readable dates |
| **Color Converter** | Convert between HEX, RGB, HSL, OKLCH with visual picker and WCAG contrast checker |
| **Cron Builder** | Visual cron expression builder with human-readable descriptions and next 10 run times |
| **Log Analyzer** | Parse, filter, and analyze logs with auto-format detection, level filtering, and timeline view |
| **Text Compare** | Side-by-side diff of two text blocks with line and character-level highlighting |
| **Diagram Generator** | 12 diagram types (flowchart, sequence, C4, ER, class, state, gantt, pie, mindmap, timeline, gitgraph, quadrant) with 27 templates, visual editor, undo/redo, and PNG + SVG export |
| **Binary Metadata** | Drop any file to extract EXIF/XMP/IPTC tags via WebAssembly ExifTool |
| **SQL Query Plan** | Visualize SQL Server execution plans with optional Gemini AI analysis |
| **UUID / ULID** | Bulk-generate UUID v1/v4/v7 and ULIDs with one-per-line, JSON array, SQL IN, or CSV output |

## Getting Started

```bash
npm install
npm run dev
```

## Tech Stack

- **React 19** + **TypeScript** — UI and type safety
- **Vite** — Dev server and bundler (port 3000)
- **Tailwind CSS v4** — Utility-first styling (PostCSS, no CDN)
- **WebAssembly** — ExifTool via `@uswriting/exiftool` for binary metadata
- **Gemini AI** — Optional AI analysis (user-supplied API key, opt-in only)
- **sql-formatter** — SQL dialect formatting
- **jsonrepair** — Auto-repair malformed JSON
- **@faker-js/faker** — Mock data generation
- **react-markdown** + **remark-gfm** — Markdown preview
- **html-query-plan** — SQL execution plan renderer
- **Mermaid.js** — Diagram generation (12 types)
- **Lucide Icons** + **Font Awesome** — Icon sets

## Privacy

- All processing happens locally in the browser
- No data is sent to any server
- Gemini AI is strictly opt-in and uses only your own API key
- No analytics, no telemetry, no cookies

## Build

```bash
npm run build
```

Output is in `dist/`. Deploy anywhere static files are served (Netlify, Vercel, GitHub Pages, S3, etc.).

## Development

```bash
npm run dev        # start dev server with HMR
npm run build      # production build
npm run preview    # preview production build locally
npm run lint       # ESLint
npm run type-check # TypeScript type checking
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright e2e tests
```
