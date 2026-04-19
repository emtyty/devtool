import React, { useState } from 'react';
import { Terminal, Copy, Check, Cpu, Shuffle, Hash, Code2, Wrench, Wand2, ArrowRight, Zap, Globe, HardDrive } from 'lucide-react';

const TOOL_CATEGORIES = [
  {
    title: 'Data Transform',
    color: 'blue',
    icon: <Shuffle size={16} />,
    tools: [
      { name: 'repair_json', desc: 'Fix malformed JSON — missing quotes, trailing commas, comments' },
      { name: 'format_sql', desc: 'Format or minify SQL with 18+ dialect support' },
      { name: 'format_list', desc: 'Convert lists to SQL IN, VALUES, UNION, JSON, CSV' },
      { name: 'clean_list', desc: 'Deduplicate, sort, trim, filter lists' },
      { name: 'generate_mock_data', desc: 'Fake data with 63+ field types via Faker.js' },
      { name: 'csv_transform', desc: 'Parse, filter, sort, aggregate CSV data' },
      { name: 'yaml_json', desc: 'Convert between YAML and JSON' },
      { name: 'json_to_types', desc: 'JSON → TypeScript interfaces, Zod schemas, JSON Schema' },
      { name: 'generate_diagram', desc: 'Plain English → Mermaid flowchart & sequence diagram' },
      { name: 'parse_db_schema', desc: 'SQL DDL / Prisma / dbdiagram → tables + relations + ER diagram' },
    ],
  },
  {
    title: 'Decode & Parse',
    color: 'violet',
    icon: <Code2 size={16} />,
    tools: [
      { name: 'decode_jwt', desc: 'Decode JWT tokens — header, payload, expiration' },
      { name: 'parse_cron', desc: 'Human-readable cron descriptions + next run times' },
      { name: 'convert_epoch', desc: 'Convert between epoch timestamps and dates' },
      { name: 'convert_color', desc: 'HEX/RGB/HSL/OKLCH with WCAG contrast grades' },
      { name: 'url_parse', desc: 'Parse URLs into components, manipulate queries' },
      { name: 'http_status', desc: 'HTTP status codes, headers, MIME types + RFC refs' },
      { name: 'parse_git_diff', desc: 'Unified diff / patch → per-file status, hunks, line numbers' },
    ],
  },
  {
    title: 'Crypto & Random',
    color: 'emerald',
    icon: <Hash size={16} />,
    tools: [
      { name: 'hash_text', desc: 'MD5, SHA-1, SHA-256, SHA-512 hashes and HMAC' },
      { name: 'encode_decode', desc: 'Base64, URL, HTML entities, Unicode escapes' },
      { name: 'uuid_generate', desc: 'UUID v4, v7, NanoID, ULID — crypto-random' },
      { name: 'password_generate', desc: 'Crypto-random passwords with entropy estimate' },
    ],
  },
  {
    title: 'Dev Utilities',
    color: 'amber',
    icon: <Wrench size={16} />,
    tools: [
      { name: 'regex_test', desc: 'Matches, captures, named groups, replace' },
      { name: 'number_base_convert', desc: 'Decimal, hex, binary, octal (BigInt)' },
      { name: 'diff_text', desc: 'Line-by-line text diff using LCS algorithm' },
      { name: 'string_case', desc: 'camelCase, snake_case, kebab-case, PascalCase...' },
      { name: 'ip_subnet', desc: 'IPv4 subnet calc — CIDR, masks, host range' },
      { name: 'timestamp_calc', desc: 'Date math, duration diff, timezone conversion' },
      { name: 'validate_json_schema', desc: 'Validate JSON vs JSON Schema / OpenAPI 3.x / Swagger 2.x (ajv)' },
    ],
  },
  {
    title: 'Smart Detection',
    color: 'pink',
    icon: <Wand2 size={16} />,
    tools: [
      { name: 'detect_content', desc: 'Auto-detect content type with confidence score' },
    ],
  },
];

const CONFIGS: { id: string; label: string; icon: string; code: string; note?: string }[] = [
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    icon: 'fa-solid fa-desktop',
    code: `{
  "mcpServers": {
    "devtoolkit": {
      "command": "npx",
      "args": ["-y", "devtoolkit-mcp"]
    }
  }
}`,
    note: 'Add to ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%\\Claude\\claude_desktop_config.json (Windows)',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    icon: 'fa-solid fa-terminal',
    code: `# Add globally (all projects):
claude mcp add -s user devtoolkit -- npx -y devtoolkit-mcp

# Or current project only:
claude mcp add devtoolkit -- npx -y devtoolkit-mcp`,
    note: 'Do NOT manually edit ~/.claude/.mcp.json — use claude mcp add to register servers correctly.',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    icon: 'fa-solid fa-i-cursor',
    code: `{
  "mcpServers": {
    "devtoolkit": {
      "command": "npx",
      "args": ["-y", "devtoolkit-mcp"]
    }
  }
}`,
    note: 'Add to ~/.cursor/mcp.json',
  },
  {
    id: 'vscode',
    label: 'VS Code',
    icon: 'fa-solid fa-code',
    code: `{
  "servers": {
    "devtoolkit": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "devtoolkit-mcp"]
    }
  }
}`,
    note: 'Add to .vscode/mcp.json in your project',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    icon: 'fa-solid fa-wind',
    code: `{
  "mcpServers": {
    "devtoolkit": {
      "command": "npx",
      "args": ["-y", "devtoolkit-mcp"]
    }
  }
}`,
    note: 'Add to ~/.codeium/windsurf/mcp_config.json',
  },
];

const COMPARISON = [
  { capability: 'Compute SHA-256 hash', ai: 'Cannot', mcp: 'Exact' },
  { capability: 'Generate true random UUIDs', ai: 'Cannot', mcp: 'Crypto-random' },
  { capability: 'Base64 encode/decode', ai: 'Often wrong', mcp: 'Exact' },
  { capability: 'Regex matching with captures', ai: 'Often wrong', mcp: 'JS RegExp engine' },
  { capability: 'Subnet math (CIDR, masks)', ai: 'Often wrong', mcp: 'Bit-level exact' },
  { capability: 'Date arithmetic', ai: 'Often wrong', mcp: 'Millisecond exact' },
  { capability: 'CSV parsing (quoted fields)', ai: 'Approximates', mcp: 'RFC-compliant' },
  { capability: 'Line-by-line diff', ai: 'Misses changes', mcp: 'LCS algorithm' },
  { capability: 'Git diff parsing', ai: 'Mislabels renames/binary', mcp: 'Unified-diff grammar' },
  { capability: 'DB schema → ER diagram', ai: 'Miscounts relations', mcp: 'Exact SQL/Prisma parsing' },
  { capability: 'JSON Schema validation', ai: 'Misses required/enum', mcp: 'ajv strict validation' },
];

type ExampleGroup = { category: string; items: { prompt: string; tool: string }[] };

const EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    category: 'Data Transform',
    items: [
      { prompt: 'Fix this broken JSON: {name: "John", age: 30,}',             tool: 'repair_json' },
      { prompt: 'Format this SQL: select * from users where id in (1,2,3)',    tool: 'format_sql' },
      { prompt: 'Convert this list to SQL IN clause: apple banana cherry',     tool: 'format_list' },
      { prompt: 'Deduplicate: foo bar foo baz bar',                            tool: 'clean_list' },
      { prompt: 'Generate 20 mock users with id, name, email as CSV',         tool: 'generate_mock_data' },
      { prompt: 'Parse CSV and filter rows where age > 30',                    tool: 'csv_transform' },
      { prompt: 'Convert this YAML to JSON: name: John\\nage: 30',            tool: 'yaml_json' },
      { prompt: 'Convert {"id":1,"name":"John"} to TypeScript interface',      tool: 'json_to_types' },
      { prompt: 'Draw: User sends request to API Gateway, forwards to Auth Service, queries Postgres', tool: 'generate_diagram' },
      { prompt: 'Visualize this Prisma schema as an ER diagram',              tool: 'parse_db_schema' },
    ],
  },
  {
    category: 'Decode & Parse',
    items: [
      { prompt: 'Decode this JWT: eyJhbGciOiJIUzI1NiIs...dozjgNryP4J3jV',     tool: 'decode_jwt' },
      { prompt: 'Explain this cron: */15 9-17 * * 1-5',                        tool: 'parse_cron' },
      { prompt: 'Convert epoch 1711929600 to human date',                      tool: 'convert_epoch' },
      { prompt: 'Convert #3B82F6 to RGB and check contrast with white',       tool: 'convert_color' },
      { prompt: 'Parse URL: https://example.com/api/users?page=2&limit=10',   tool: 'url_parse' },
      { prompt: 'What is HTTP status 429?',                                    tool: 'http_status' },
      { prompt: 'Parse this git diff and list files that were renamed',        tool: 'parse_git_diff' },
    ],
  },
  {
    category: 'Crypto & Random',
    items: [
      { prompt: 'Hash "hello world" with SHA-256',                             tool: 'hash_text' },
      { prompt: 'Base64 encode: {"token":"secret123"}',                        tool: 'encode_decode' },
      { prompt: 'Generate 5 UUID v7',                                          tool: 'uuid_generate' },
      { prompt: 'Generate a 24-char password with symbols',                    tool: 'password_generate' },
    ],
  },
  {
    category: 'Dev Utilities',
    items: [
      { prompt: 'Test regex (\\d{4})-(\\d{2})-(\\d{2}) against "2024-03-15"', tool: 'regex_test' },
      { prompt: 'Convert 0xFF3A to binary',                                    tool: 'number_base_convert' },
      { prompt: 'Diff: "hello world" vs "hello mars"',                         tool: 'diff_text' },
      { prompt: 'Convert getUserHTTPResponse to snake_case',                   tool: 'string_case' },
      { prompt: 'Calculate subnet for 192.168.1.0/24',                         tool: 'ip_subnet' },
      { prompt: 'What is 2024-01-15 + 90 days?',                              tool: 'timestamp_calc' },
      { prompt: 'Validate this payload against the User schema in my OpenAPI spec', tool: 'validate_json_schema' },
    ],
  },
];

const FEATURED_EXAMPLES = [
  { prompt: 'Hash "hello world" with SHA-256',                             tool: 'hash_text' },
  { prompt: 'Decode this JWT: eyJhbGciOiJIUzI1NiIs...dozjgNryP4J3jV',     tool: 'decode_jwt' },
  { prompt: 'Convert 0xFF3A to binary',                                    tool: 'number_base_convert' },
  { prompt: 'Generate 5 UUID v7',                                          tool: 'uuid_generate' },
  { prompt: 'What is 2024-01-15 + 90 days?',                              tool: 'timestamp_calc' },
  { prompt: 'Calculate subnet for 192.168.1.0/24',                         tool: 'ip_subnet' },
  { prompt: 'Convert getUserHTTPResponse to snake_case',                   tool: 'string_case' },
  { prompt: 'Generate 20 mock users with id, name, email as CSV',         tool: 'generate_mock_data' },
  { prompt: 'Draw diagram: User → API Gateway → Auth → Redis → Postgres', tool: 'generate_diagram' },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       text: 'text-blue-600 dark:text-blue-400',       border: 'border-blue-100 dark:border-blue-500/20',    badge: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-500/10',   text: 'text-violet-600 dark:text-violet-400',   border: 'border-violet-100 dark:border-violet-500/20', badge: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-100 dark:border-emerald-500/20', badge: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-600 dark:text-amber-400',     border: 'border-amber-100 dark:border-amber-500/20',   badge: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' },
  pink:    { bg: 'bg-pink-50 dark:bg-pink-500/10',       text: 'text-pink-600 dark:text-pink-400',       border: 'border-pink-100 dark:border-pink-500/20',     badge: 'bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300' },
};

function CopyBlock({ text, language }: { text: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase">{language}</span>
        <button
          onClick={handleCopy}
          aria-label="Copy to clipboard"
          className="p-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <pre className="bg-slate-900 dark:bg-slate-950 rounded-xl p-4 pr-24 overflow-x-auto">
        <code className="text-xs text-slate-300 font-mono leading-relaxed">{text}</code>
      </pre>
    </div>
  );
}

const McpPage: React.FC = () => {
  const [activeConfig, setActiveConfig] = useState('claude-desktop');
  const [showAllExamples, setShowAllExamples] = useState(false);
  const config = CONFIGS.find(c => c.id === activeConfig)!;

  return (
    <div className="max-w-4xl mx-auto space-y-16 py-4">

      {/* Hero */}
      <section className="text-center space-y-6 pt-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-violet-600 rounded-2xl shadow-lg shadow-blue-500/20 mx-auto">
          <Cpu size={30} className="text-white" />
        </div>
        <div className="space-y-3">
          <h2 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
            devtoolkit-mcp
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            29 developer utilities as an MCP server for AI-assisted workflows.
            Give your AI assistant <strong className="text-slate-700 dark:text-slate-200">real tools</strong> instead of guessing.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://www.npmjs.com/package/devtoolkit-mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-xs font-bold px-4 py-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
          >
            <i className="fa-brands fa-npm text-sm"></i>
            devtoolkit-mcp
          </a>
          <div className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-4 py-1.5 rounded-full">
            <HardDrive size={12} />
            100% Local — No API Keys
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="space-y-4">
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Quick Start</div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">One command. That's it.</h3>
        </div>
        <CopyBlock text="npx -y devtoolkit-mcp" language="bash" />
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          Requires Node.js 18+. No installation needed — npx downloads and runs it automatically.
        </p>
      </section>

      {/* Pillars */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: <Zap size={18} />, title: 'Deterministic', desc: 'Exact results every time. No hallucination. SHA-256, regex, subnet math — all computed, not guessed.' },
          { icon: <HardDrive size={18} />, title: '100% Local', desc: 'No API keys. No network requests. Everything runs on your machine via Node.js.' },
          { icon: <Globe size={18} />, title: 'Universal', desc: 'Works with Claude Desktop, Claude Code, Cursor, VS Code Copilot, Windsurf, and any MCP client.' },
        ].map(p => (
          <div key={p.title} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400">
              {p.icon}
            </div>
            <div>
              <div className="text-sm font-black text-slate-800 dark:text-white">{p.title}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{p.desc}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Tools by Category */}
      <section className="space-y-6">
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Available Tools</div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">29 Tools. 5 Categories.</h3>
        </div>
        <div className="space-y-4">
          {TOOL_CATEGORIES.map(cat => {
            const c = COLOR_MAP[cat.color];
            return (
              <div key={cat.title} className={`bg-white dark:bg-white/5 border ${c.border} rounded-2xl p-5 shadow-sm`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 ${c.bg} ${c.text} rounded-lg flex items-center justify-center shrink-0`}>
                    {cat.icon}
                  </div>
                  <h4 className="text-sm font-black text-slate-800 dark:text-white">{cat.title}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                    {cat.tools.length} tool{cat.tools.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  {cat.tools.map(tool => (
                    <div key={tool.name} className="flex items-start gap-2 py-1.5">
                      <code className={`text-[11px] font-bold font-mono ${c.text} shrink-0 mt-0.5`}>{tool.name}</code>
                      <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{tool.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Configuration */}
      <section className="space-y-4">
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Setup</div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Works everywhere.</h3>
        </div>
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            {CONFIGS.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveConfig(c.id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  activeConfig === c.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-transparent'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <i className={`${c.icon} text-[11px]`}></i>
                {c.label}
              </button>
            ))}
          </div>
          {/* Content */}
          <div className="p-5 space-y-3">
            {config.note && (
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                <i className="fa-solid fa-circle-info text-blue-400 mr-1.5"></i>
                {config.note}
              </p>
            )}
            <CopyBlock text={config.code} language={config.id === 'claude-code' ? 'bash' : 'json'} />
          </div>
        </div>
      </section>

      {/* Why MCP vs Native AI */}
      <section className="space-y-4">
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Why MCP Tools?</div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Computed, not guessed.</h3>
        </div>
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-5 py-3 font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px]">Capability</th>
                <th className="text-center px-5 py-3 font-black text-red-500 uppercase tracking-wider text-[10px]">AI Native</th>
                <th className="text-center px-5 py-3 font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[10px]">MCP Tool</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="px-5 py-3 text-slate-700 dark:text-slate-300 font-medium">{row.capability}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400 font-semibold">
                      <i className="fa-solid fa-xmark text-[10px]"></i> {row.ai}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <i className="fa-solid fa-check text-[10px]"></i> {row.mcp}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Examples */}
      <section className="space-y-4">
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-2">Usage</div>
          <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Just ask in natural language.</h3>
        </div>

        {/* Featured (always visible) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FEATURED_EXAMPLES.map((ex, i) => (
            <div key={i} className="flex items-start gap-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-sm">
              <Terminal size={14} className="text-blue-500 shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-slate-600 dark:text-slate-300 font-mono leading-relaxed">{ex.prompt}</span>
                <div className="mt-1.5">
                  <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-1.5 py-0.5 rounded font-mono">{ex.tool}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Expand / Collapse */}
        {!showAllExamples ? (
          <div className="text-center">
            <button
              onClick={() => setShowAllExamples(true)}
              className="text-xs font-bold text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors cursor-pointer"
            >
              Show all 28 examples by category →
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {EXAMPLE_GROUPS.map(group => (
              <div key={group.category}>
                <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2">{group.category}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {group.items.map((ex, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 shadow-sm">
                      <Terminal size={12} className="text-blue-500 shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 font-mono leading-relaxed">{ex.prompt}</span>
                        <div className="mt-1">
                          <span className="text-[9px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 px-1.5 py-0.5 rounded font-mono">{ex.tool}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="text-center">
              <button
                onClick={() => setShowAllExamples(false)}
                className="text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
              >
                ← Show less
              </button>
            </div>
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="bg-slate-900 dark:bg-slate-950 rounded-2xl p-10 text-center space-y-5">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Get Started</div>
        <p className="text-white font-bold text-lg leading-snug">
          Give your AI real developer tools.<br />
          <span className="text-slate-400 font-normal text-sm">One command. 29 tools. Zero config.</span>
        </p>
        <div className="inline-flex items-center gap-3 bg-slate-800 rounded-xl px-5 py-3">
          <code className="text-sm text-emerald-400 font-mono font-bold">npx -y devtoolkit-mcp</code>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          {['No API keys', 'No network', 'No tracking', 'Node.js 18+', 'MIT License'].map(label => (
            <span key={label} className="text-[10px] font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full">
              {label}
            </span>
          ))}
        </div>
        <div className="pt-2">
          <a
            href="https://www.npmjs.com/package/devtoolkit-mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-xs font-bold transition-colors"
          >
            View on npm <ArrowRight size={12} />
          </a>
        </div>
      </section>

      {/* Spacer before app footer */}
      <div className="h-4" />
    </div>
  );
};

export default McpPage;
