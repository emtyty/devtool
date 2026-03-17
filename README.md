# DevToolKit

A local-first developer toolkit. Nine professional-grade tools that run 100% in your browser — no server, no account, no tracking.

## Tools

| Tool | What it does |
|------|-------------|
| **Data Formatter** | Convert raw lists into SQL `IN` clauses, `VALUES`, `UNION ALL`, or CSV |
| **List Cleaner** | Deduplicate, sort, trim, and normalize plain-text lists with live unique/dupe counts |
| **SQL Formatter** | Format or minify SQL with dialect support and pink-highlighted parameters |
| **JSON Tools** | Format, minify, auto-repair, diff two payloads, tree view, generate TypeScript interfaces |
| **Markdown Preview** | Live GFM editor with tables, task lists, and syntax-highlighted code blocks |
| **Binary Metadata** | Drop any file to extract EXIF/XMP/IPTC tags via WebAssembly ExifTool |
| **SQL Query Plan** | Visualize SQL Server execution plans with optional Gemini AI analysis |
| **Stack Trace Formatter** | Parse and display .NET/C#/js ... stack traces with user code highlighting and EF Core support |
| **Diagram Generator** | Describe a system in plain English and generate Mermaid sequence diagrams and flowcharts with live preview, copy, and SVG download |

## Getting Started

```bash
npm install
npm run dev
```

## Tech Stack

- **React 19** + **TypeScript** — UI and type safety
- **Vite** — Dev server and bundler
- **Tailwind CSS v4** — Utility-first styling (PostCSS, no CDN)
- **WebAssembly** — ExifTool via `@uswriting/exiftool` for binary metadata
- **Gemini AI** — Optional AI analysis (user-supplied API key, opt-in only)
- **sql-formatter** — SQL dialect formatting
- **jsonrepair** — Auto-repair malformed JSON
- **react-markdown** + **remark-gfm** — Markdown preview
- **html-query-plan** — SQL execution plan renderer
- **Mermaid.js** — Sequence diagram and flowchart rendering
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
npm run dev      # start dev server with HMR
npm run build    # production build
npm run preview  # preview production build locally
```
