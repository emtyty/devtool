import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Database, Copy, Check, Download, AlertCircle, Code2, ChevronDown,
  ChevronUp, Table2, GitBranch, Wand2, FileCode2,
} from 'lucide-react';
import mermaid from 'mermaid';
import ResizableSplit from './ResizableSplit';
import { parseSchema, schemaToMermaid, detectInputFormat, SAMPLES, type ParsedSchema } from '../utils/dbSchemaParser';

// ── Format badge ───────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  sql:       'SQL DDL',
  prisma:    'Prisma',
  dbdiagram: 'dbdiagram.io',
  unknown:   'Unknown',
};

const FORMAT_COLORS: Record<string, string> = {
  sql:       'text-blue-400',
  prisma:    'text-purple-400',
  dbdiagram: 'text-emerald-400',
  unknown:   'text-slate-400',
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function DbSchemaVisualizer({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  const [schema, setSchema] = useState<ParsedSchema | null>(null);
  const [mermaidCode, setMermaidCode] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);

  const diagramRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(0);
  const sampleDropdownRef = useRef<HTMLDivElement>(null);

  // Track dark mode via .dark class on <html>
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark')),
    );
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Close sample dropdown on outside click
  useEffect(() => {
    if (!sampleOpen) return;
    const handler = (e: MouseEvent) => {
      if (sampleDropdownRef.current && !sampleDropdownRef.current.contains(e.target as Node)) {
        setSampleOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sampleOpen]);

  useEffect(() => {
    if (initialData) setInput(initialData);
  }, [initialData]);

  // Auto-parse on input change (debounced)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!input.trim()) {
      setSchema(null);
      setMermaidCode('');
      setRenderError(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const parsed = parseSchema(input);
      setSchema(parsed);
      const code = schemaToMermaid(parsed);
      setMermaidCode(code);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [input]);

  // Render mermaid whenever mermaidCode or dark mode changes
  const renderDiagram = useCallback(async (code: string, dark: boolean) => {
    if (!diagramRef.current || !code) return;
    const id = `db-schema-${++renderIdRef.current}`;
    setRenderError(null);
    mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'loose' });
    try {
      const { svg } = await mermaid.render(id, code);
      if (diagramRef.current) {
        diagramRef.current.innerHTML = svg;
        const svgEl = diagramRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 300) : 'Render failed';
      setRenderError(msg);
      if (diagramRef.current) diagramRef.current.innerHTML = '';
    }
  }, []);

  useEffect(() => {
    if (mermaidCode) renderDiagram(mermaidCode, isDark);
    else if (diagramRef.current) diagramRef.current.innerHTML = '';
  }, [mermaidCode, isDark, renderDiagram]);

  // Export SVG
  const exportSvg = useCallback(() => {
    const svgEl = diagramRef.current?.querySelector('svg');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const detectedFormat = useMemo(
    () => input.trim() ? detectInputFormat(input) : null,
    [input],
  );

  const handleCopyMermaid = () => {
    navigator.clipboard.writeText(mermaidCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleCopySvg = () => {
    const svgEl = diagramRef.current?.querySelector('svg');
    if (!svgEl) return;
    navigator.clipboard.writeText(svgEl.outerHTML);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leftPanel = (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px] h-full">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Database size={13} className="text-slate-400" /> Schema Input
        </span>
        <div className="flex items-center gap-2">
          {detectedFormat && detectedFormat !== 'unknown' && (
            <span className={`text-[10px] font-black uppercase tracking-widest ${FORMAT_COLORS[detectedFormat]}`}>
              <Wand2 size={10} className="inline mr-1" />
              {FORMAT_LABELS[detectedFormat]}
            </span>
          )}
          {/* Sample picker */}
          <div className="relative" ref={sampleDropdownRef}>
            <button
              onClick={() => setSampleOpen(v => !v)}
              className="text-[10px] font-black text-blue-500 hover:text-blue-700 uppercase tracking-widest transition-colors flex items-center gap-1"
            >
              Load Sample {sampleOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {sampleOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 min-w-[190px] overflow-hidden">
                {Object.entries(SAMPLES).map(([key, s]) => (
                  <button
                    key={key}
                    onClick={() => { setInput(s.code); setSampleOpen(false); }}
                    className="block w-full text-left px-4 py-3 text-xs hover:bg-slate-50 text-slate-700 font-medium transition-colors border-b border-slate-100 last:border-0"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Format hint pills */}
      <div className="flex gap-1.5 px-6 pt-3 pb-0">
        {(['sql', 'prisma', 'dbdiagram'] as const).map(f => (
          <span
            key={f}
            className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200 text-slate-400"
          >
            {FORMAT_LABELS[f]}
          </span>
        ))}
      </div>

      {/* Textarea */}
      <textarea
        className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={`Paste SQL DDL, Prisma schema, or dbdiagram.io syntax…\n\nExample (SQL):\nCREATE TABLE users (\n  id   SERIAL PRIMARY KEY,\n  name VARCHAR(100) NOT NULL\n);\n\nCREATE TABLE posts (\n  id      SERIAL PRIMARY KEY,\n  user_id INT REFERENCES users(id)\n);`}
        spellCheck={false}
      />

      {/* Stats footer */}
      {schema && schema.tables.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-4 flex-wrap">
          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
            <Table2 size={11} />
            <span className="text-slate-700">{schema.tables.length}</span> tables
          </span>
          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
            <GitBranch size={11} />
            <span className="text-slate-700">{schema.relations.length}</span> relations
          </span>
          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
            <span className="text-slate-400">Format:</span>
            <span className={`${FORMAT_COLORS[schema.inputFormat]}`}>
              {FORMAT_LABELS[schema.inputFormat]}
            </span>
          </span>
        </div>
      )}
    </section>
  );

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col min-h-[500px] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
          <GitBranch size={13} /> ER Diagram
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopySvg}
            disabled={!mermaidCode}
            title="Copy SVG"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />} SVG
          </button>
          <button
            onClick={exportSvg}
            disabled={!mermaidCode}
            title="Download SVG"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={11} /> SVG
          </button>
        </div>
      </div>

      {/* Diagram canvas */}
      <div className="flex-1 overflow-auto p-6 bg-white dark:bg-slate-950 flex items-start justify-center min-h-[380px]">
        {!mermaidCode && !renderError ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3 py-20">
            <Database size={48} strokeWidth={1} />
            <p className="text-sm font-medium text-slate-400">Paste a schema on the left to see the ER diagram</p>
          </div>
        ) : renderError ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-600 text-xs w-full">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{renderError}</span>
          </div>
        ) : (
          <div ref={diagramRef} className="w-full" />
        )}
      </div>

      {/* Mermaid code collapsible */}
      {mermaidCode && (
        <div className="border-t border-slate-800">
          <button
            onClick={() => setCodeOpen(v => !v)}
            className="w-full flex items-center justify-between px-6 py-3 text-[10px] font-black text-slate-400 hover:text-slate-200 uppercase tracking-widest transition-colors"
          >
            <span className="flex items-center gap-2"><Code2 size={12} /> Mermaid Code</span>
            {codeOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {codeOpen && (
            <div className="border-t border-slate-800 bg-slate-950">
              <div className="flex justify-end px-4 py-2">
                <button
                  onClick={handleCopyMermaid}
                  className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-white transition-colors"
                >
                  {codeCopied ? <Check size={11} /> : <Copy size={11} />}
                  {codeCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="px-6 pb-5 font-mono text-[11px] text-emerald-400 leading-relaxed overflow-x-auto max-h-[220px] overflow-y-auto">
                {mermaidCode}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Table summary */}
      {schema && schema.tables.length > 0 && (
        <div className="border-t border-slate-800 px-6 py-4 flex flex-wrap gap-2">
          {schema.tables.map(table => (
            <div
              key={table.name}
              className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg"
            >
              <FileCode2 size={10} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-300">{table.name}</span>
              <span className="text-[10px] text-slate-500">{table.columns.length}c</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return <ResizableSplit left={leftPanel} right={rightPanel} storageKey="split:db-schema" />;
}
