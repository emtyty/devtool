import React, { useState, useRef, useMemo } from 'react';
import ResizableSplit from './ResizableSplit';
import {
  Braces, Layers, Copy, Check, Maximize2, Minimize2, AlertCircle,
  Upload, Wrench, GitCompare, ChevronRight, ChevronDown, Plus, Minus,
  RefreshCw, TreePine, Code2, Quote, ArrowLeftRight, Unlink,
} from 'lucide-react';
import { jsonrepair } from 'jsonrepair';
import JsonDiffV2, { findDiffs, type DiffItem } from './JsonDiffV2';

// --- Types ---

type JsonTab = 'format' | 'diff' | 'ts' | 'unescape';
type DiffViewMode = 'tree' | 'sidebyside';
type OutputMode = 'text' | 'tree' | 'string';
type DiffType = 'added' | 'removed' | 'changed' | 'nested';

interface DiffEntry {
  key: string;
  type: DiffType;
  oldVal?: any;
  newVal?: any;
  children?: DiffEntry[];
}

// --- Diff algorithm (returns only changed nodes) ---

function computeDiff(a: any, b: any): DiffEntry[] {
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return JSON.stringify(a) !== JSON.stringify(b)
      ? [{ key: '', type: 'changed', oldVal: a, newVal: b }]
      : [];
  }

  const allKeys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  const result: DiffEntry[] = [];

  for (const key of allKeys) {
    const hasA = key in a;
    const hasB = key in b;

    if (hasA && !hasB) {
      result.push({ key, type: 'removed', oldVal: a[key] });
    } else if (!hasA && hasB) {
      result.push({ key, type: 'added', newVal: b[key] });
    } else {
      const va = a[key];
      const vb = b[key];
      const bothObjects =
        typeof va === 'object' && va !== null &&
        typeof vb === 'object' && vb !== null;

      if (bothObjects) {
        const children = computeDiff(va, vb);
        if (children.length > 0) result.push({ key, type: 'nested', children });
      } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
        result.push({ key, type: 'changed', oldVal: va, newVal: vb });
      }
    }
  }

  return result;
}

function countDiffStats(entries: DiffEntry[]): { added: number; removed: number; changed: number } {
  let added = 0, removed = 0, changed = 0;
  for (const e of entries) {
    if (e.type === 'added') added++;
    else if (e.type === 'removed') removed++;
    else if (e.type === 'changed') changed++;
    else if (e.type === 'nested' && e.children) {
      const s = countDiffStats(e.children);
      added += s.added; removed += s.removed; changed += s.changed;
    }
  }
  return { added, removed, changed };
}

// --- Tree View ---

function primitiveColor(value: any): string {
  if (value === null) return 'text-slate-400';
  if (typeof value === 'string') return 'text-emerald-400';
  if (typeof value === 'number') return 'text-orange-400';
  if (typeof value === 'boolean') return 'text-purple-400';
  return 'text-slate-400';
}

function TreeNode({ keyName, value, depth }: { keyName?: string | number; value: any; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isObj = typeof value === 'object' && value !== null;
  const isArr = Array.isArray(value);

  const keyLabel = keyName !== undefined ? (
    <span className="text-blue-300 text-xs font-mono mr-1">
      {typeof keyName === 'number' ? keyName : `"${keyName}"`}:
    </span>
  ) : null;

  if (!isObj) {
    return (
      <div className="flex items-baseline gap-1 py-0.5 pl-1">
        {keyLabel}
        <span className={`text-xs font-mono ${primitiveColor(value)}`}>
          {JSON.stringify(value)}
        </span>
      </div>
    );
  }

  const entries = Object.entries(value);
  const openBrace = isArr ? '[' : '{';
  const closeBrace = isArr ? ']' : '}';
  const preview = isArr ? `${entries.length} items` : `${entries.length} keys`;

  return (
    <div>
      <div
        className="flex items-center gap-0.5 py-0.5 px-1 cursor-pointer hover:bg-slate-700/40 rounded group"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        {keyLabel}
        <span className="text-slate-300 text-xs font-mono">{openBrace}</span>
        {!expanded && <span className="text-slate-500 text-xs ml-1 italic">{preview}</span>}
        {!expanded && <span className="text-slate-300 text-xs font-mono">{closeBrace}</span>}
      </div>
      {expanded && (
        <div className="ml-3 border-l border-slate-700/60 pl-2">
          {entries.map(([k, v]) => (
            <TreeNode key={k} keyName={isArr ? Number(k) : k} value={v} depth={depth + 1} />
          ))}
          <div className="text-slate-300 text-xs font-mono py-0.5 pl-1">{closeBrace}</div>
        </div>
      )}
    </div>
  );
}

// --- Diff Row Renderer ---

function DiffEntryRow({ entry, depth = 0 }: { entry: DiffEntry; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const indent = depth * 16 + 8;

  const formatVal = (v: any) => {
    if (typeof v === 'object' && v !== null) {
      const s = JSON.stringify(v);
      return s.length > 80 ? s.slice(0, 80) + '…' : s;
    }
    return JSON.stringify(v);
  };

  if (entry.type === 'nested') {
    return (
      <div>
        <div
          className="flex items-center gap-1 py-1.5 px-2 cursor-pointer hover:bg-slate-50 text-slate-600 text-xs font-mono border-b border-slate-100"
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: indent }}
        >
          <span className="text-slate-400">{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          <span className="text-blue-600 font-bold">"{entry.key}"</span>
          <span className="text-slate-400 ml-1">&#123; changes inside &#125;</span>
        </div>
        {expanded && entry.children?.map((child, i) => (
          <DiffEntryRow key={i} entry={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const styles = {
    added:   { bg: 'bg-emerald-50 border-l-4 border-emerald-400', icon: <Plus size={11} className="text-emerald-600 shrink-0" />, keyColor: 'text-emerald-700' },
    removed: { bg: 'bg-red-50 border-l-4 border-red-400',         icon: <Minus size={11} className="text-red-600 shrink-0" />,     keyColor: 'text-red-700' },
    changed: { bg: 'bg-amber-50 border-l-4 border-amber-400',     icon: <RefreshCw size={11} className="text-amber-600 shrink-0" />, keyColor: 'text-amber-700' },
  }[entry.type];

  return (
    <div className={`flex items-start gap-2 py-1.5 px-2 text-xs border-b border-slate-100 ${styles.bg}`} style={{ paddingLeft: indent }}>
      {styles.icon}
      <div className="flex-1 min-w-0 font-mono">
        <span className={`font-bold ${styles.keyColor}`}>"{entry.key}"</span>
        {entry.type === 'changed' && (
          <span className="ml-2">
            <span className="line-through text-red-500">{formatVal(entry.oldVal)}</span>
            <span className="mx-1.5 text-slate-400">→</span>
            <span className="text-emerald-600">{formatVal(entry.newVal)}</span>
          </span>
        )}
        {entry.type === 'added' && (
          <span className="text-emerald-600 ml-2">{formatVal(entry.newVal)}</span>
        )}
        {entry.type === 'removed' && (
          <span className="text-red-500 ml-2 line-through">{formatVal(entry.oldVal)}</span>
        )}
      </div>
    </div>
  );
}

// --- File Import Button ---

function FileImportButton({ onLoad, label = 'Import File' }: { onLoad: (content: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".json,application/json,text/plain"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => onLoad((ev.target?.result as string) || '');
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
      >
        <Upload size={12} /> {label}
      </button>
    </>
  );
}

// --- JSON Syntax Highlighter ---

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightJson(json: string): string {
  // Escape HTML first, then colorize tokens
  const safe = escHtml(json);
  return safe.replace(
    /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|(true|false|null)|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|([{}[\]])/g,
    (_m, key, colon, strVal, bool, num, brace) => {
      if (key)    return `<span style="color:#93c5fd">${key}</span>${colon}`;
      if (strVal) return `<span style="color:#86efac">${strVal}</span>`;
      if (bool === 'true' || bool === 'false') return `<span style="color:#c4b5fd">${bool}</span>`;
      if (bool === 'null') return `<span style="color:#94a3b8">${bool}</span>`;
      if (num)    return `<span style="color:#fdba74">${num}</span>`;
      if (brace)  return `<span style="color:#cbd5e1">${brace}</span>`;
      return _m;
    }
  );
}

// --- JSON → TypeScript generator ---

type NamingConvention = 'standard' | 'camel' | 'snake';

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function toCamelCase(s: string): string {
  return s
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c: string) => c.toLowerCase());
}

function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, '_$1')
    .replace(/[-\s]+/g, '_')
    .replace(/^_/, '')
    .toLowerCase();
}

function convertKey(key: string, convention: NamingConvention): string {
  if (convention === 'camel') return toCamelCase(key);
  if (convention === 'snake') return toSnakeCase(key);
  return key;
}

function jsonToTs(jsonStr: string, convention: NamingConvention = 'camel'): string {
  const root = JSON.parse(jsonStr);
  const defs: string[] = [];
  const seen = new Set<string>();

  function inferType(val: any, name: string): string {
    if (val === null) return 'null';
    if (typeof val === 'boolean') return 'boolean';
    if (typeof val === 'number') return 'number';
    if (typeof val === 'string') return 'string';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'unknown[]';
      const first = val.find((v: any) => v !== null);
      if (first === undefined) return 'null[]';
      if (typeof first === 'object' && !Array.isArray(first)) {
        const childName = capitalize(name) + 'Item';
        buildInterface(first, childName);
        return `${childName}[]`;
      }
      return `${inferType(first, name)}[]`;
    }
    if (typeof val === 'object') {
      const childName = capitalize(name);
      buildInterface(val, childName);
      return childName;
    }
    return 'unknown';
  }

  function buildInterface(obj: Record<string, any>, name: string): void {
    if (seen.has(name)) return;
    seen.add(name);
    const lines = Object.entries(obj).map(([k, v]) => {
      const converted = convertKey(k, convention);
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(converted) ? converted : `"${converted}"`;
      return `  ${safeKey}: ${inferType(v, k)};`;
    });
    defs.push(`export interface ${name} {\n${lines.join('\n')}\n}`);
  }

  if (Array.isArray(root)) {
    if (root.length === 0) return 'export type Root = unknown[];';
    const first = root.find((v: any) => v !== null && typeof v === 'object' && !Array.isArray(v));
    if (first) {
      buildInterface(first, 'RootItem');
      defs.push('export type Root = RootItem[];');
    } else {
      return `export type Root = ${inferType(root[0], 'root')}[];`;
    }
  } else if (root !== null && typeof root === 'object') {
    buildInterface(root, 'Root');
  } else {
    return `export type Root = ${inferType(root, 'root')};`;
  }

  return defs.join('\n\n');
}

function highlightTs(code: string): string {
  const safe = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return safe
    .replace(/\b(export|interface|type)\b/g, '<span style="color:#c4b5fd;font-weight:700">$1</span>')
    .replace(/\b(string|number|boolean|null|unknown|any|void|never|undefined)\b/g, '<span style="color:#86efac">$1</span>')
    .replace(/\[\]/g, '<span style="color:#fdba74">[]</span>')
    .replace(/(  \w+)(:)/g, '<span style="color:#93c5fd">$1</span>$2');
}

// --- Tab button ---

const TAB_CLASSES = (active: boolean) =>
  `flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
    active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
  }`;

// --- Main Component ---

export default function JsonTools() {
  const [tab, setTab] = useState<JsonTab>('format');

  // Format
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [outputMode, setOutputMode] = useState<OutputMode>('tree');
  const [treeParsed, setTreeParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [indent, setIndent] = useState<2 | 4 | 'tab'>(2);
  const [copied, setCopied] = useState(false);

  // TS Types
  const [tsInput, setTsInput] = useState('');
  const [tsOutput, setTsOutput] = useState('');
  const [tsError, setTsError] = useState<string | null>(null);
  const [tsCopied, setTsCopied] = useState(false);
  const [tsNaming, setTsNaming] = useState<NamingConvention>('camel');

  // Diff
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('sidebyside');
  const [diffBefore, setDiffBefore] = useState('');
  const [diffAfter, setDiffAfter] = useState('');
  const [diffEntries, setDiffEntries] = useState<DiffEntry[] | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [v2Parsed, setV2Parsed] = useState<{ a: any; b: any; diffs: DiffItem[] } | null>(null);

  // Unescape
  const [unescInput, setUnescInput] = useState('');
  const [unescOutput, setUnescOutput] = useState('');
  const [unescError, setUnescError] = useState<string | null>(null);
  const [unescCopied, setUnescCopied] = useState(false);

  // --- Format handlers ---

  const indentVal = () => (indent === 'tab' ? '\t' : indent);

  // Switch output mode: text ↔ tree ↔ string, releasing unused memory
  const switchOutputMode = (mode: OutputMode) => {
    if (mode === outputMode) return;
    if (mode === 'tree') {
      // Parse current output (or input) → tree, then free the string
      const src = output || input;
      if (!src.trim()) { setOutputMode('tree'); return; }
      try {
        const parsed = JSON.parse(src);
        setTreeParsed(parsed);
        setOutput(''); // release string memory — tree holds all data
        setError(null);
      } catch (e: unknown) {
        setError(`Cannot show tree: ${e instanceof Error ? e.message : 'Invalid JSON'}`);
        return;
      }
    } else {
      // Rebuild text from tree object, then free the parsed object
      if (treeParsed !== null) {
        setOutput(JSON.stringify(treeParsed, null, indentVal()));
        setTreeParsed(null); // release object memory — string holds all data
      }
    }
    setOutputMode(mode);
  };

  const handleFormat = (mode: 'beautify' | 'minify') => {
    if (!input.trim()) return;
    try {
      const parsed = JSON.parse(input);
      const formatted = mode === 'beautify'
        ? JSON.stringify(parsed, null, indentVal())
        : JSON.stringify(parsed);
      if (outputMode === 'tree') {
        // Update tree directly
        setTreeParsed(parsed);
        setOutput('');
      } else {
        setOutput(formatted);
        setTreeParsed(null);
      }
      setError(null);
    } catch (e: unknown) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`);
      setOutput('');
      setTreeParsed(null);
    }
  };

  const handleAutoFix = () => {
    if (!input.trim()) return;
    try {
      const fixed = jsonrepair(input);
      const parsed = JSON.parse(fixed);
      if (outputMode === 'tree') {
        setTreeParsed(parsed);
        setOutput('');
      } else {
        setOutput(JSON.stringify(parsed, null, indentVal()));
        setTreeParsed(null);
      }
      setError(null);
    } catch (e: unknown) {
      setError(`Could not repair: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleCopy = () => {
    const raw = outputMode === 'tree' && treeParsed !== null
      ? JSON.stringify(treeParsed, null, indentVal())
      : output;
    if (!raw) return;
    const text = outputMode === 'string' ? JSON.stringify(raw) : raw;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Diff handler ---

  const handleDiff = () => {
    setDiffError(null);
    setDiffEntries(null);
    setV2Parsed(null);
    try {
      const a = JSON.parse(diffBefore.trim() || '{}');
      const b = JSON.parse(diffAfter.trim() || '{}');
      setDiffEntries(computeDiff(a, b));
      setV2Parsed({ a, b, diffs: findDiffs(a, b) });
    } catch (e: unknown) {
      setDiffError(e instanceof Error ? e.message : 'Invalid JSON in one or both inputs');
    }
  };

  const handleDiffSwap = () => {
    const newBefore = diffAfter;
    const newAfter = diffBefore;
    setDiffBefore(newBefore);
    setDiffAfter(newAfter);
    setDiffError(null);
    setDiffEntries(null);
    setV2Parsed(null);
    try {
      const a = JSON.parse(newBefore.trim() || '{}');
      const b = JSON.parse(newAfter.trim() || '{}');
      setDiffEntries(computeDiff(a, b));
      setV2Parsed({ a, b, diffs: findDiffs(a, b) });
    } catch (e: unknown) {
      setDiffError(e instanceof Error ? e.message : 'Invalid JSON in one or both inputs');
    }
  };

  // Auto-format helper (used by paste & file import)
  const autoBeautify = (text: string) => {
    setInput(text);
    setError(null);
    try {
      const parsed = JSON.parse(text);
      if (outputMode === 'tree') {
        setTreeParsed(parsed);
        setOutput('');
      } else {
        setOutput(JSON.stringify(parsed, null, indentVal()));
        setTreeParsed(null);
      }
    } catch {
      setOutput('');
      setTreeParsed(null);
    }
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    if (text) autoBeautify(text);
  };

  const handleFileLoad = (text: string) => autoBeautify(text);

  const highlightedOutput = useMemo(() => highlightJson(output), [output]);

  const diffStats = diffEntries ? countDiffStats(diffEntries) : null;
  const hasOutput = outputMode === 'tree' ? treeParsed !== null : !!output;

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm w-fit gap-0.5">
        <button onClick={() => setTab('format')} className={TAB_CLASSES(tab === 'format')}>
          <Braces size={14} /> Format
        </button>
        <button onClick={() => setTab('diff')} className={TAB_CLASSES(tab === 'diff')}>
          <GitCompare size={14} /> Diff
        </button>
        <button onClick={() => setTab('ts')} className={TAB_CLASSES(tab === 'ts')}>
          <Code2 size={14} /> TS Types
        </button>
        <button onClick={() => setTab('unescape')} className={TAB_CLASSES(tab === 'unescape')}>
          <Unlink size={14} /> Unescape
        </button>
      </div>

      {/* ── FORMAT TAB ── */}
      {tab === 'format' && (
        <ResizableSplit
          storageKey="split:json-format"
          left={
            <div className="flex flex-col gap-6 h-full">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Braces size={14} /> JSON Input
                  </span>
                  <FileImportButton onLoad={handleFileLoad} />
                </div>
                <textarea
                  className={`flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed ${error ? 'ring-2 ring-red-100' : ''}`}
                  value={input}
                  onChange={e => { setInput(e.target.value); setError(null); }}
                  onPaste={handleInputPaste}
                  placeholder='Paste or import JSON here...'
                />
                {error && (
                  <div className="px-6 py-3 bg-red-50 border-t border-red-100 flex items-center gap-2 text-red-600 text-xs font-bold">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
              </section>

              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Indent Style</label>
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {([2, 4, 'tab'] as const).map(v => (
                      <button
                        key={String(v)}
                        onClick={() => setIndent(v as typeof indent)}
                        className={`flex-1 py-2 px-3 text-[10px] font-black rounded-lg uppercase transition-all ${
                          indent === v ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {v === 'tab' ? 'Tab' : `${v} Spaces`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleFormat('beautify')}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-100 uppercase tracking-widest text-xs"
                  >
                    <Maximize2 size={16} /> Beautify
                  </button>
                  <button
                    onClick={() => handleFormat('minify')}
                    className="flex-1 bg-slate-900 hover:bg-black text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-slate-200 uppercase tracking-widest text-xs"
                  >
                    <Minimize2 size={16} /> Minify
                  </button>
                  <button
                    onClick={handleAutoFix}
                    title="Attempts to repair broken JSON: trailing commas, single quotes, unquoted keys, etc."
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-100 uppercase tracking-widest text-xs"
                  >
                    <Wrench size={16} /> Auto Fix
                  </button>
                </div>
              </section>
            </div>
          }
          right={
            <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
              <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between gap-2">
                <div className="flex bg-slate-700/50 p-0.5 rounded-lg gap-0.5">
                  <button
                    onClick={() => switchOutputMode('text')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                      outputMode === 'text'
                        ? 'bg-slate-600 text-blue-300 shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Layers size={11} /> Text
                  </button>
                  <button
                    onClick={() => switchOutputMode('tree')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                      outputMode === 'tree'
                        ? 'bg-slate-600 text-blue-300 shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <TreePine size={11} /> Tree
                  </button>
                  <button
                    onClick={() => switchOutputMode('string')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                      outputMode === 'string'
                        ? 'bg-slate-600 text-blue-300 shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Quote size={11} /> String
                  </button>
                </div>

                <button
                  onClick={handleCopy}
                  disabled={!hasOutput}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'COPIED' : 'COPY RESULT'}
                </button>
              </div>

              <div className="flex-1 p-6 overflow-auto">
                {outputMode === 'text' ? (
                  output
                    ? <pre
                        className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white"
                        dangerouslySetInnerHTML={{ __html: highlightedOutput }}
                      />
                    : <pre className="font-mono text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">{'// Output will appear here...'}</pre>
                ) : outputMode === 'string' ? (
                  output
                    ? <pre className="font-mono text-[13px] text-emerald-400 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white">
                        {JSON.stringify(output)}
                      </pre>
                    : <pre className="font-mono text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">{'// Stringified output will appear here...'}</pre>
                ) : (
                  treeParsed !== null ? (
                    <TreeNode value={treeParsed} depth={0} />
                  ) : (
                    <p className="text-slate-500 text-xs italic">// Tree will render here after Beautify / Auto Fix...</p>
                  )
                )}
              </div>
            </section>
          }
        />
      )}

      {/* ── TS TYPES TAB ── */}
      {tab === 'ts' && (
        <ResizableSplit
          storageKey="split:json-ts"
          left={
            <div className="flex flex-col gap-6 h-full">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Braces size={14} /> JSON Input
                  </span>
                  <FileImportButton onLoad={text => { setTsInput(text); setTsOutput(''); setTsError(null); }} />
                </div>
                <textarea
                  className={`flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed ${tsError ? 'ring-2 ring-red-100' : ''}`}
                  value={tsInput}
                  onChange={e => { setTsInput(e.target.value); setTsError(null); }}
                  onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text'); setTsInput(text); setTsError(null); setTsOutput(''); }}
                  placeholder='Paste JSON here to generate TypeScript interfaces...'
                />
                {tsError && (
                  <div className="px-6 py-3 bg-red-50 border-t border-red-100 flex items-center gap-2 text-red-600 text-xs font-bold">
                    <AlertCircle size={14} /> {tsError}
                  </div>
                )}
              </section>
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Key Naming Convention</label>
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {(['standard', 'camel', 'snake'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setTsNaming(v)}
                        className={`flex-1 py-2 px-3 text-[10px] font-black rounded-lg uppercase transition-all ${
                          tsNaming === v ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {v === 'standard' ? 'Standard' : v === 'camel' ? 'Camel' : 'Snake'}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!tsInput.trim()) return;
                    try {
                      setTsOutput(jsonToTs(tsInput, tsNaming));
                      setTsError(null);
                    } catch (e: unknown) {
                      setTsError(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`);
                      setTsOutput('');
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-100 uppercase tracking-widest text-xs"
                >
                  <Code2 size={16} /> Generate TypeScript
                </button>
              </section>
            </div>
          }
          right={
            <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
              <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                  <Code2 size={14} /> TypeScript Output
                </span>
                <button
                  onClick={() => {
                    if (!tsOutput) return;
                    navigator.clipboard.writeText(tsOutput);
                    setTsCopied(true);
                    setTimeout(() => setTsCopied(false), 2000);
                  }}
                  disabled={!tsOutput}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {tsCopied ? <Check size={12} /> : <Copy size={12} />}
                  {tsCopied ? 'COPIED' : 'COPY RESULT'}
                </button>
              </div>
              <div className="flex-1 p-6 overflow-auto">
                {tsOutput
                  ? <pre
                      className="font-mono text-[13px] text-slate-200 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white"
                      dangerouslySetInnerHTML={{ __html: highlightTs(tsOutput) }}
                    />
                  : <pre className="font-mono text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">{'// Interfaces will appear here...'}</pre>
                }
              </div>
            </section>
          }
        />
      )}

      {/* ── UNESCAPE TAB ── */}
      {tab === 'unescape' && (
        <ResizableSplit
          storageKey="split:json-unescape"
          left={
            <div className="flex flex-col gap-6 h-full">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Unlink size={14} /> Escaped JSON String
                  </span>
                  <button
                    onClick={() => {
                      const example = `{\\\"id\\\":42,\\\"name\\\":\\\"Alice Smith\\\",\\\"email\\\":\\\"alice@example.com\\\",\\\"roles\\\":[\\\"admin\\\",\\\"editor\\\"],\\\"active\\\":true,\\\"score\\\":9.5}`;
                      setUnescInput(example);
                      setUnescError(null);
                      setUnescOutput('');
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
                  >
                    Load Example
                  </button>
                </div>
                <textarea
                  className={`flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed ${unescError ? 'ring-2 ring-red-100' : ''}`}
                  value={unescInput}
                  onChange={e => { setUnescInput(e.target.value); setUnescError(null); }}
                  placeholder={'Paste a JSON string with escaped quotes, e.g.:\n{\\\"name\\\":\\\"Alice\\\",\\\"age\\\":30}'}
                />
                {unescError && (
                  <div className="px-6 py-3 bg-red-50 border-t border-red-100 flex items-center gap-2 text-red-600 text-xs font-bold">
                    <AlertCircle size={14} /> {unescError}
                  </div>
                )}
              </section>
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">How it works</p>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Removes backslash-escaping from JSON strings. Useful when JSON is embedded in a log line, API response, or serialized as a string with <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">\&quot;</code> instead of real quotes.
                </p>
                <button
                  onClick={() => {
                    const s = unescInput.trim();
                    if (!s) return;
                    try {
                      // Case 1: wrapped in outer quotes → full JSON string literal
                      if (s.startsWith('"') && s.endsWith('"')) {
                        const inner = JSON.parse(s) as string;
                        try {
                          const parsed = JSON.parse(inner);
                          setUnescOutput(JSON.stringify(parsed, null, 2));
                        } catch {
                          setUnescOutput(inner);
                        }
                        setUnescError(null);
                        return;
                      }
                      // Case 2: raw escaped text without outer quotes
                      const unescaped = s.replace(/\\"/g, '"');
                      const parsed = JSON.parse(unescaped);
                      setUnescOutput(JSON.stringify(parsed, null, 2));
                      setUnescError(null);
                    } catch (e: unknown) {
                      setUnescError(`Could not parse: ${e instanceof Error ? e.message : 'Invalid input'}`);
                      setUnescOutput('');
                    }
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-100 uppercase tracking-widest text-xs"
                >
                  <Unlink size={16} /> Unescape JSON
                </button>
              </section>
            </div>
          }
          right={
            <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
              <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                  <Braces size={14} /> Unescaped JSON
                </span>
                <button
                  onClick={() => {
                    if (!unescOutput) return;
                    navigator.clipboard.writeText(unescOutput);
                    setUnescCopied(true);
                    setTimeout(() => setUnescCopied(false), 2000);
                  }}
                  disabled={!unescOutput}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {unescCopied ? <Check size={12} /> : <Copy size={12} />}
                  {unescCopied ? 'COPIED' : 'COPY RESULT'}
                </button>
              </div>
              <div className="flex-1 p-6 overflow-auto">
                {unescOutput
                  ? <pre
                      className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white"
                      dangerouslySetInnerHTML={{ __html: highlightJson(unescOutput) }}
                    />
                  : <pre className="font-mono text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">{'// Unescaped JSON will appear here...'}</pre>
                }
              </div>
            </section>
          }
        />
      )}

      {/* ── DIFF TAB ── */}
      {tab === 'diff' && (
        <div className="space-y-6">
          {/* Shared inputs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(['Before', 'After'] as const).map((label, idx) => {
              const value = idx === 0 ? diffBefore : diffAfter;
              const setValue = idx === 0 ? setDiffBefore : setDiffAfter;
              return (
                <section key={label} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[280px]">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                      {label}
                    </span>
                    <FileImportButton onLoad={setValue} label="Import" />
                  </div>
                  <textarea
                    className="flex-1 p-5 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={`Paste ${label.toLowerCase()} JSON...`}
                  />
                </section>
              );
            })}
          </div>

          {/* Shared actions */}
          <div className="flex justify-center gap-3">
            <button
              onClick={handleDiffSwap}
              className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300 px-5 py-3 rounded-xl bg-white transition-colors"
              title="Swap Before and After"
            >
              <ArrowLeftRight size={14} /> Swap
            </button>
            <button
              onClick={handleDiff}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-3 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-100"
            >
              <GitCompare size={16} /> Compare
            </button>
          </div>

          {/* Shared error */}
          {diffError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600 text-xs font-bold">
              <AlertCircle size={14} /> {diffError}
            </div>
          )}

          {/* View mode toggle (only show after compare) */}
          {(diffEntries !== null || v2Parsed !== null) && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit gap-0.5">
              <button
                onClick={() => setDiffViewMode('sidebyside')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  diffViewMode === 'sidebyside' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Layers size={13} /> Side by Side
              </button>
              <button
                onClick={() => setDiffViewMode('tree')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  diffViewMode === 'tree' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <TreePine size={13} /> Tree
              </button>
            </div>
          )}

          {/* Side by Side result */}
          {diffViewMode === 'sidebyside' && v2Parsed && (
            <JsonDiffV2 a={v2Parsed.a} b={v2Parsed.b} diffs={v2Parsed.diffs} />
          )}

          {/* Tree result */}
          {diffViewMode === 'tree' && diffEntries !== null && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Diff Result</span>
                {diffStats && (
                  <div className="flex items-center gap-4 text-[10px] font-black uppercase">
                    <span className="text-emerald-600 flex items-center gap-1"><Plus size={10} /> {diffStats.added} added</span>
                    <span className="text-red-600 flex items-center gap-1"><Minus size={10} /> {diffStats.removed} removed</span>
                    <span className="text-amber-600 flex items-center gap-1"><RefreshCw size={10} /> {diffStats.changed} changed</span>
                  </div>
                )}
              </div>
              <div className="max-h-[500px] overflow-auto">
                {diffEntries.length === 0 ? (
                  <div className="p-12 text-center">
                    <Check size={32} className="mx-auto mb-3 text-emerald-400" />
                    <p className="text-sm font-bold text-emerald-600">No differences — JSON objects are identical</p>
                  </div>
                ) : (
                  diffEntries.map((entry, i) => <DiffEntryRow key={i} entry={entry} />)
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
