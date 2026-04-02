import React, { useState, useMemo } from 'react';
import {
  Filter, ListFilter, Code2, Braces, FileText, AlertTriangle, Database, Key,
  Replace, Workflow, Clock, Palette, Timer, ScrollText, Wand2, GitCompare,
  Hash, Cpu, FileOutput, Sheet, Waves, Shield, Search, ListTree, Scissors,
  ChevronDown, ChevronUp, BookOpen,
} from 'lucide-react';

type Tool = {
  id: string;
  label: string;
  icon: React.ReactNode;
  tagline: string;
  steps: string[];
  tips?: string[];
};

type Section = {
  title: string;
  color: string;
  tools: Tool[];
};

const SECTIONS: Section[] = [
  {
    title: 'Format & Parse',
    color: 'blue',
    tools: [
      {
        id: 'dataformatter',
        label: 'Data Formatter',
        icon: <Filter size={16} />,
        tagline: 'Convert a raw list of values into SQL IN clauses, INSERT VALUES, UNION ALL, CSV, or JSON arrays.',
        steps: [
          'Paste your values (one per line, or comma/tab-separated) into the input box.',
          'Choose an output format: SQL IN, VALUES, UNION ALL, CSV, or JSON Array.',
          'Optionally set a column name or table name for SQL formats.',
          'Click Copy to grab the result.',
        ],
        tips: [
          'Use "SQL IN" when you need WHERE id IN (1, 2, 3).',
          'Use "VALUES" when building a bulk INSERT statement.',
          'The tool auto-detects numeric vs. string values — strings get quoted automatically.',
        ],
      },
      {
        id: 'listcleaner',
        label: 'List Cleaner',
        icon: <ListFilter size={16} />,
        tagline: 'Deduplicate, sort, trim whitespace, and compare two lists.',
        steps: [
          'Paste your list into the left panel (one item per line).',
          'Toggle Deduplicate, Sort, or Trim as needed.',
          'For comparison mode, enable "Compare" and paste a second list into the right panel.',
          'Items unique to each side are highlighted. Copy the result or the diff.',
        ],
        tips: [
          'Comparison shows items only in A (red), only in B (green), and shared (grey).',
          'Case-insensitive mode treats "Apple" and "apple" as the same item.',
        ],
      },
      {
        id: 'sqlformatter',
        label: 'SQL Formatter',
        icon: <Code2 size={16} />,
        tagline: 'Format or minify SQL with support for 18+ dialects.',
        steps: [
          'Paste your SQL query into the editor.',
          'Select a dialect (e.g. PostgreSQL, MySQL, SQL Server, BigQuery).',
          'Choose Format for pretty-print with indentation, or Minify for a one-liner.',
          'Copy the output or use the diff view to see what changed.',
        ],
        tips: [
          'Use Minify when pasting SQL into a config file or environment variable.',
          'The formatter preserves comments — they won\'t be stripped.',
        ],
      },
      {
        id: 'jsontools',
        label: 'JSON Tools',
        icon: <Braces size={16} />,
        tagline: 'Format, minify, repair, diff, explore, and generate TypeScript types from JSON.',
        steps: [
          'Paste any JSON (even broken/malformed) into the input.',
          'Pick a tab: Format, Minify, Repair, Diff, Tree, or TypeScript.',
          'Format / Minify: instant output.',
          'Repair: auto-fixes missing quotes, trailing commas, and JS comments.',
          'Diff: paste a second JSON to compare side-by-side.',
          'TypeScript: generates typed interfaces from your JSON structure.',
        ],
        tips: [
          'Repair mode uses jsonrepair under the hood — works on very messy input.',
          'TypeScript mode supports nested objects and arrays with proper union types.',
        ],
      },
      {
        id: 'jsonextractor',
        label: 'JSON Extractor',
        icon: <ListTree size={16} />,
        tagline: 'Query JSON data with JSONPath expressions and extract exactly what you need.',
        steps: [
          'Paste your JSON into the left panel.',
          'Type a JSONPath expression (e.g. $.users[*].email).',
          'Results appear in real time on the right.',
          'Copy the extracted values or download as JSON.',
        ],
        tips: [
          '$.store.book[0].title — access a specific field.',
          '$.items[*].price — extract all prices from an array.',
          'Use filters: $.items[?(@.price > 10)].',
        ],
      },
      {
        id: 'markdown',
        label: 'Markdown Preview',
        icon: <FileText size={16} />,
        tagline: 'Write and preview GitHub-Flavored Markdown in real time.',
        steps: [
          'Type or paste Markdown into the left editor.',
          'The rendered preview updates instantly on the right.',
          'Switch to full-screen preview or full-screen editor with the layout buttons.',
          'Copy the raw Markdown or the rendered HTML.',
        ],
        tips: [
          'Supports GFM tables, task lists (- [ ]), strikethrough, and fenced code blocks.',
          'Code blocks are syntax-highlighted automatically.',
        ],
      },
      {
        id: 'stacktrace',
        label: 'Stack Trace Formatter',
        icon: <AlertTriangle size={16} />,
        tagline: 'Parse and highlight stack traces from .NET, JavaScript, Java, Python, Go, and Ruby.',
        steps: [
          'Paste the raw stack trace into the input.',
          'The tool auto-detects the language/platform.',
          'Frames are parsed into file, method, and line number columns.',
          'Click a frame to highlight it. Copy individual lines or the full formatted trace.',
        ],
        tips: [
          'Works with minified JS stack traces — partial source map hints are shown.',
          'Exception message is separated from frames for easier scanning.',
        ],
      },
    ],
  },
  {
    title: 'Generate & Convert',
    color: 'violet',
    tools: [
      {
        id: 'mockdata',
        label: 'Mock Data Generator',
        icon: <Database size={16} />,
        tagline: 'Generate realistic fake data in JSON, CSV, or SQL using Faker.js (60+ field types).',
        steps: [
          'Add fields using the + button — choose a name and a Faker type (e.g. firstName, email, uuid).',
          'Set the number of rows to generate.',
          'Choose output format: JSON, CSV, or SQL INSERT.',
          'Click Generate and copy or download the result.',
        ],
        tips: [
          'Use "Seed" for reproducible data — same seed always gives the same output.',
          'SQL output includes a CREATE TABLE statement matching your fields.',
        ],
      },
      {
        id: 'uuidgen',
        label: 'UUID / ULID Generator',
        icon: <Hash size={16} />,
        tagline: 'Generate cryptographically-random UUIDs (v4, v7), NanoIDs, and ULIDs.',
        steps: [
          'Select the format: UUID v4, UUID v7, NanoID, or ULID.',
          'Set how many IDs to generate (1–1000).',
          'Click Generate. Copy all or copy individual IDs.',
        ],
        tips: [
          'UUID v7 is time-ordered — better for database primary keys.',
          'ULIDs are lexicographically sortable and URL-safe.',
          'NanoID is shorter and URL-safe by default.',
        ],
      },
      {
        id: 'epoch',
        label: 'Epoch Converter',
        icon: <Clock size={16} />,
        tagline: 'Convert Unix timestamps to human-readable dates and vice versa.',
        steps: [
          'Enter a Unix timestamp (seconds or milliseconds) to see the human date.',
          'Or enter a date/time string to get the epoch value.',
          'The current timestamp is shown and updated live.',
          'Toggle between seconds and milliseconds with the unit switch.',
        ],
        tips: [
          'Hover over a timestamp in the input to see it in multiple timezones.',
          'Millisecond timestamps are 13 digits; second timestamps are 10 digits.',
        ],
      },
      {
        id: 'color',
        label: 'Color Converter',
        icon: <Palette size={16} />,
        tagline: 'Convert colors between HEX, RGB, HSL, and OKLCH. Check WCAG contrast ratios.',
        steps: [
          'Type or paste a color value in any format (e.g. #3b82f6, rgb(59,130,246), hsl(217,91%,60%)).',
          'All equivalent representations update instantly.',
          'Enter a second color to get the WCAG contrast ratio and pass/fail grade.',
          'Click any swatch to copy its value.',
        ],
        tips: [
          'WCAG AA requires ≥4.5:1 contrast for normal text, ≥3:1 for large text.',
          'OKLCH is the modern color space — use it for CSS color-mix().',
        ],
      },
      {
        id: 'cron',
        label: 'Cron Builder',
        icon: <Timer size={16} />,
        tagline: 'Build and parse cron expressions with a visual editor and human-readable descriptions.',
        steps: [
          'Enter a cron expression (5 or 6 fields) in the input box.',
          'The human-readable description updates as you type.',
          'Use the visual sliders/pickers to build the expression without memorizing syntax.',
          'Next 5 run times are shown below the builder.',
        ],
        tips: [
          '0 9 * * 1-5 = "At 09:00, Monday through Friday".',
          '@daily, @hourly, @weekly shortcuts are supported.',
          '6-field expressions (with seconds) are also supported.',
        ],
      },
      {
        id: 'diagram',
        label: 'Diagram Generator',
        icon: <Workflow size={16} />,
        tagline: 'Generate Mermaid flowcharts, sequence diagrams, and more from plain text descriptions.',
        steps: [
          'Type a plain-text description of your diagram (e.g. "User logs in, server validates, returns token").',
          'Select a diagram type: Flowchart, Sequence, ERD, Gantt, etc.',
          'The Mermaid diagram renders live on the right.',
          'Edit the Mermaid code directly for fine-grained control.',
          'Download as SVG or copy the Mermaid source.',
        ],
        tips: [
          'Use the template picker to start from a common pattern.',
          'Click on a node in the preview to highlight the corresponding code.',
        ],
      },
      {
        id: 'fileconverter',
        label: 'File Converter',
        icon: <FileOutput size={16} />,
        tagline: 'Convert images, data formats, and encode/decode files as Base64.',
        steps: [
          'Drop a file onto the zone or click to browse.',
          'Choose the conversion: image format (PNG→WebP, JPG→PNG, etc.), CSV↔JSON, or File↔Base64.',
          'Click Convert and download the result.',
        ],
        tips: [
          'Base64 encode is useful for embedding small images in CSS/HTML.',
          'CSV→JSON preserves column headers as object keys.',
        ],
      },
      {
        id: 'tablelens',
        label: 'Table Lens',
        icon: <Sheet size={16} />,
        tagline: 'Open CSV or XLSX files, sort, filter, inline-edit, and export.',
        steps: [
          'Drop a CSV or XLSX file onto the tool, or paste CSV text directly.',
          'Click a column header to sort. Use the filter bar to search rows.',
          'Double-click a cell to edit inline. Select rows to delete or duplicate.',
          'Use column menu (right-click header) to hide, freeze, or resize columns.',
          'Export back to CSV or XLSX with the Export button.',
        ],
        tips: [
          'Freeze columns by right-clicking the header → Freeze.',
          'Conditional formatting lets you color cells based on value rules.',
          'Batch editing: select multiple rows, right-click → Edit selected.',
        ],
      },
      {
        id: 'pdfeditor',
        label: 'PDF Editor',
        icon: <Scissors size={16} />,
        tagline: 'View, reorder, and extract pages from PDF files — entirely in your browser.',
        steps: [
          'Drop a PDF file onto the tool.',
          'Drag pages to reorder them.',
          'Select individual pages to extract them as a new PDF.',
          'Click Download to save the modified PDF.',
        ],
        tips: [
          'All processing is local — your PDF never leaves your device.',
          'Use Extract to split a large PDF into smaller ones.',
        ],
      },
    ],
  },
  {
    title: 'Decode & Analyze',
    color: 'emerald',
    tools: [
      {
        id: 'jwtdecode',
        label: 'JWT Decoder',
        icon: <Key size={16} />,
        tagline: 'Decode JWT tokens and inspect the header, payload, and expiration.',
        steps: [
          'Paste a JWT token (the three base64url parts separated by dots).',
          'Header and payload are decoded and pretty-printed instantly.',
          'Expiration (exp), issued-at (iat), and other standard claims are highlighted.',
          'A countdown shows how much time remains before the token expires.',
        ],
        tips: [
          'The signature is NOT verified — this is a decode-only tool.',
          'Sensitive tokens are never sent anywhere — all decoding is local.',
        ],
      },
      {
        id: 'texttools',
        label: 'Text Tools',
        icon: <Replace size={16} />,
        tagline: 'Transform text: change case, encode/decode, hash, count, and clean up.',
        steps: [
          'Paste text into the input box.',
          'Pick a transformation: UPPER, lower, Title Case, camelCase, snake_case, kebab-case, and more.',
          'For encoding: choose Base64, URL-encode, HTML entities, or Unicode escapes.',
          'For hashing: choose MD5, SHA-1, SHA-256, or SHA-512.',
          'The result appears instantly. Click Copy.',
        ],
        tips: [
          'You can chain transformations: trim whitespace, then convert to snake_case.',
          'Word and character counts update live as you type.',
        ],
      },
      {
        id: 'textdiff',
        label: 'Text Compare',
        icon: <GitCompare size={16} />,
        tagline: 'Compare two blocks of text and see line-by-line differences.',
        steps: [
          'Paste the original text into the left panel.',
          'Paste the modified text into the right panel.',
          'Added lines are shown in green, removed lines in red, unchanged lines in grey.',
          'Toggle inline diff mode to see character-level changes within each line.',
        ],
        tips: [
          'Use this to compare config files, SQL queries, or JSON payloads.',
          'The summary bar shows total additions and deletions at a glance.',
        ],
      },
      {
        id: 'logs',
        label: 'Log Analyzer',
        icon: <ScrollText size={16} />,
        tagline: 'Paste log output, filter by level, search patterns, and highlight errors.',
        steps: [
          'Paste log text (any format) into the input area.',
          'Use the level filter buttons to show only ERROR, WARN, INFO, or DEBUG lines.',
          'Use the search box to filter by keyword or regex.',
          'Click a line to expand and see the full entry context.',
        ],
        tips: [
          'Supports common log formats: JSON logs, Apache/Nginx, .NET, Node.js.',
          'Regex search is powerful — try \\b4\\d{2}\\b to find all 4xx status codes.',
        ],
      },
      {
        id: 'networkwaterfall',
        label: 'Network Waterfall',
        icon: <Waves size={16} />,
        tagline: 'Load a HAR file and visualize network requests as a timing waterfall.',
        steps: [
          'Export a HAR file from Chrome DevTools (Network tab → right-click → Save as HAR).',
          'Drop the HAR file onto the tool.',
          'Requests are listed in timeline order with DNS, connect, TTFB, and download bars.',
          'Click a request to see headers, status, timing, and size details.',
          'Filter by type (XHR, JS, CSS, images) or search by URL.',
        ],
        tips: [
          'Sort by duration to quickly spot the slowest requests.',
          'The summary bar shows total requests, size, and page load time.',
        ],
      },
      {
        id: 'metadata',
        label: 'Binary Metadata',
        icon: <i className="fa-solid fa-fingerprint text-[16px]" />,
        tagline: 'Extract EXIF and binary metadata from images, PDFs, audio, and other files using ExifTool (WASM).',
        steps: [
          'Drop any file (image, PDF, audio, video, document) onto the zone.',
          'ExifTool runs locally in your browser via WebAssembly.',
          'All metadata groups (EXIF, IPTC, XMP, etc.) are shown in expandable cards.',
          'Use the search bar to find specific metadata fields.',
        ],
        tips: [
          'GPS coordinates in EXIF are shown on a map link if present.',
          'No file is uploaded — extraction is 100% local.',
          'Supports JPEG, PNG, TIFF, PDF, MP3, MP4, DOCX, and many more.',
        ],
      },
      {
        id: 'queryplan',
        label: 'Query Plan Viewer',
        icon: <i className="fa-solid fa-diagram-project text-[16px]" />,
        tagline: 'Visualize SQL Server execution plans and optionally analyze them with Gemini AI.',
        steps: [
          'In SQL Server Management Studio: run a query with "Include Actual Execution Plan" enabled.',
          'Right-click the plan → Save Execution Plan As… → save as .sqlplan XML.',
          'Drop the .sqlplan file onto the tool, or paste the XML directly.',
          'The plan tree renders visually with cost percentages per node.',
          'Optionally enter your Gemini API key to get an AI-powered analysis and optimization suggestions.',
        ],
        tips: [
          'Click any node to see detailed operator properties.',
          'High-cost nodes are highlighted in orange/red for quick identification.',
          'Your API key is stored only in localStorage and never sent to our servers.',
        ],
      },
      {
        id: 'csptools',
        label: 'CSP Tools',
        icon: <Shield size={16} />,
        tagline: 'Analyze Content Security Policy headers, parse browser violation reports, and build CSP directives.',
        steps: [
          'Paste a CSP header value (e.g. from response headers or a meta tag).',
          'The tool parses each directive and flags weak or missing policies.',
          'Switch to "Violations" mode to paste browser CSP violation JSON reports.',
          'Use the "Builder" tab to construct a CSP policy from scratch with guided input.',
        ],
        tips: [
          'A CSP without default-src is flagged as a high-severity issue.',
          'unsafe-inline and unsafe-eval are highlighted as security risks.',
          'The builder generates a ready-to-use header string you can copy directly.',
        ],
      },
    ],
  },
  {
    title: 'Smart & Other',
    color: 'amber',
    tools: [
      {
        id: 'smartdetect',
        label: 'Smart Detect',
        icon: <Wand2 size={16} />,
        tagline: 'Paste anything — the tool automatically detects the content type and routes you to the right tool.',
        steps: [
          'Navigate to the home page (DevToolKit logo).',
          'Paste any content: JSON, SQL, JWT, a list, a stack trace, Markdown, CSV, etc.',
          'Smart Detect identifies the type and shows the best matching tool.',
          'Click "Open in [Tool]" to jump directly with your data pre-loaded.',
        ],
        tips: [
          'Works with ambiguous content — it ranks candidates by confidence.',
          'You can also drag-and-drop binary files here to route to Binary Metadata.',
        ],
      },
      {
        id: 'mcp',
        label: 'MCP Server',
        icon: <Cpu size={16} />,
        tagline: 'Use DevToolKit\'s tools directly from AI assistants via the Model Context Protocol.',
        steps: [
          'Install the DevToolKit MCP server: npx @coding4pizza/devtoolkit-mcp.',
          'Add the server config to your AI client (Claude Desktop, Cursor, etc.).',
          'The AI can now call DevToolKit tools (format SQL, repair JSON, generate mock data, etc.) on your behalf.',
          'See the MCP Server page for the full list of available tools and setup instructions.',
        ],
        tips: [
          '26 tools are available via MCP — the same ones in the UI.',
          'The MCP server runs locally — no network calls to external services.',
        ],
      },
    ],
  },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string; sectionBg: string }> = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-100',    badge: 'bg-blue-100 text-blue-700',    sectionBg: 'bg-blue-600' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-100',  badge: 'bg-violet-100 text-violet-700',  sectionBg: 'bg-violet-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', badge: 'bg-emerald-100 text-emerald-700', sectionBg: 'bg-emerald-600' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100',   badge: 'bg-amber-100 text-amber-700',   sectionBg: 'bg-amber-500' },
};

function ToolCard({ tool, color }: { tool: Tool; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const c = COLOR_MAP[color];

  return (
    <div className={`bg-white border ${c.border} rounded-2xl shadow-sm overflow-hidden`}>
      <button
        className="w-full text-left p-5 flex items-start gap-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className={`w-8 h-8 ${c.bg} ${c.text} rounded-xl flex items-center justify-center shrink-0 mt-0.5`}>
          {tool.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-black text-slate-800">{tool.label}</span>
            {expanded
              ? <ChevronUp size={15} className="text-slate-400 shrink-0" />
              : <ChevronDown size={15} className="text-slate-400 shrink-0" />
            }
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{tool.tagline}</p>
        </div>
      </button>

      {expanded && (
        <div className={`border-t ${c.border} px-5 pb-5 pt-4 space-y-4`}>
          {/* Steps */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">How to use</p>
            <ol className="space-y-2">
              {tool.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
                  <span className={`shrink-0 w-5 h-5 rounded-full ${c.bg} ${c.text} flex items-center justify-center text-[10px] font-black mt-0.5`}>
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Tips */}
          {tool.tips && tool.tips.length > 0 && (
            <div className={`${c.bg} rounded-xl p-3 space-y-1.5`}>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${c.text} mb-2`}>Tips</p>
              {tool.tips.map((tip, i) => (
                <p key={i} className="text-xs text-slate-600 leading-relaxed flex items-start gap-2">
                  <span className={`shrink-0 mt-1 ${c.text}`}>›</span>
                  {tip}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const HelpPage: React.FC = () => {
  const [query, setQuery] = useState('');

  const filtered = useMemo((): Section[] => {
    const q = query.toLowerCase().trim();
    if (!q) return SECTIONS;
    return SECTIONS
      .map(section => ({
        ...section,
        tools: section.tools.filter(
          t =>
            t.label.toLowerCase().includes(q) ||
            t.tagline.toLowerCase().includes(q) ||
            t.steps.some(s => s.toLowerCase().includes(q)) ||
            (t.tips ?? []).some(tip => tip.toLowerCase().includes(q))
        ),
      }))
      .filter(s => s.tools.length > 0);
  }, [query]);

  const totalTools = SECTIONS.reduce((n, s) => n + s.tools.length, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-10 py-4">

      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 mx-auto">
          <BookOpen size={26} className="text-white" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">How to Use DevToolKit</h2>
        <p className="text-slate-500 text-sm leading-relaxed max-w-lg mx-auto">
          {totalTools} tools, all running locally in your browser. Click any tool below to see step-by-step instructions and tips.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search tools, features, or keywords…"
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
        />
      </div>

      {/* Sections */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          No tools match <span className="font-bold text-slate-600">"{query}"</span>
        </div>
      ) : (
        filtered.map(section => {
          const c = COLOR_MAP[section.color];
          return (
            <div key={section.title} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${c.sectionBg}`} />
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{section.title}</h3>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.badge}`}>
                  {section.tools.length}
                </span>
              </div>
              <div className="space-y-2">
                {(section as Section).tools.map((tool: Tool) => (
                  <React.Fragment key={tool.id}>
                    <ToolCard tool={tool} color={(section as Section).color} />
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Footer note */}
      <div className="bg-slate-900 rounded-2xl p-6 text-center space-y-2">
        <p className="text-white font-bold text-sm">Everything runs in your browser.</p>
        <p className="text-slate-400 text-xs leading-relaxed">
          No uploads, no accounts, no tracking. Your data never leaves your device.
        </p>
      </div>

    </div>
  );
};

export default HelpPage;
