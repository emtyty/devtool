import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Copy, Check, Link, Globe, AlignLeft, Plus, Trash2, RefreshCw } from 'lucide-react';
import ResizableSplit from './ResizableSplit';
import {
  encodeComponent,
  decodeComponent,
  encodeFullUrl,
  decodeFullUrl,
  parseQueryString,
  buildQueryString,
  type QueryParam,
} from '../utils/urlEncoder';

// ── Types ──────────────────────────────────────────────────────────────────────

type UrlTab = 'component' | 'full' | 'query';

// ── Helpers ────────────────────────────────────────────────────────────────────

const TAB_CLASSES = (active: boolean) =>
  `flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
    active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
  }`;

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);
  return [copied, copy];
}

function CopyBtn({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: (t: string) => void }) {
  return (
    <button
      onClick={() => onCopy(text)}
      disabled={!text}
      aria-label="Copy to clipboard"
      className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'COPIED' : 'COPY'}
    </button>
  );
}

function ModeToggle({
  mode,
  onToggle,
}: {
  mode: 'encode' | 'decode';
  onToggle: (m: 'encode' | 'decode') => void;
}) {
  return (
    <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-lg gap-0.5">
      {(['encode', 'decode'] as const).map(m => (
        <button
          key={m}
          onClick={() => onToggle(m)}
          className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
            mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function OutputPanel({
  label,
  icon,
  text,
  copied,
  onCopy,
}: {
  label: string;
  icon: React.ReactNode;
  text: string;
  copied: boolean;
  onCopy: (t: string) => void;
}) {
  return (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
          {icon} {label}
        </span>
        <CopyBtn text={text} copied={copied} onCopy={onCopy} />
      </div>
      <div className="flex-1 p-6 overflow-auto">
        <pre className="font-mono text-[13px] text-blue-100/90 whitespace-pre-wrap leading-relaxed break-all selection:bg-blue-500 selection:text-white">
          {text || '// Output will appear here...'}
        </pre>
      </div>
    </section>
  );
}

// ── Component Encode/Decode ────────────────────────────────────────────────────

const COMPONENT_EXAMPLE_ENCODE = 'hello world & name=John Doe / foo@bar.com?q=1#top';
const COMPONENT_EXAMPLE_DECODE = 'hello%20world%20%26%20name%3DJohn%20Doe%20%2F%20foo%40bar.com%3Fq%3D1%23top';

function ComponentTab({ initialInput }: { initialInput?: string }) {
  const [input, setInput] = useState(initialInput ?? '');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [copied, copy] = useCopy();

  useEffect(() => {
    if (initialInput !== undefined) setInput(initialInput);
  }, [initialInput]);

  const output = useMemo(
    () => (input ? (mode === 'encode' ? encodeComponent(input) : decodeComponent(input)) : ''),
    [input, mode]
  );

  return (
    <ResizableSplit
      storageKey="split:url-component"
      left={
        <div className="flex flex-col gap-6 h-full">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Link size={14} /> Input
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInput(mode === 'encode' ? COMPONENT_EXAMPLE_ENCODE : COMPONENT_EXAMPLE_DECODE)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
                >
                  Load Example
                </button>
                <ModeToggle mode={mode} onToggle={setMode} />
              </div>
            </div>
            <textarea
              aria-label="URL component input"
              className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                mode === 'encode'
                  ? 'hello world & foo=bar?q=1#anchor'
                  : 'hello%20world%20%26%20foo%3Dbar%3Fq%3D1%23anchor'
              }
            />
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">About</p>
            <ul className="text-xs text-slate-500 leading-relaxed space-y-1.5">
              <li>
                • Uses{' '}
                <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">encodeURIComponent</code> /{' '}
                <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">decodeURIComponent</code>
              </li>
              <li>
                • Encodes ALL special chars including{' '}
                <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">& = ? / # @</code>
              </li>
              <li>• Best for encoding individual query param values or path segments</li>
              <li>• Full UTF-8 support — emoji, CJK, diacritics</li>
            </ul>
          </section>
        </div>
      }
      right={<OutputPanel label="Output" icon={<Link size={14} />} text={output} copied={copied} onCopy={copy} />}
    />
  );
}

// ── Full URL Encode/Decode ─────────────────────────────────────────────────────

const FULL_URL_EXAMPLE_ENCODE = 'https://example.com/search?q=hello world&lang=日本語&price=<100';
const FULL_URL_EXAMPLE_DECODE = 'https://example.com/search?q=hello%20world&lang=%E6%97%A5%E6%9C%AC%E8%AA%9E&price=%3C100';

function FullUrlTab() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [copied, copy] = useCopy();

  const output = useMemo(
    () => (input ? (mode === 'encode' ? encodeFullUrl(input) : decodeFullUrl(input)) : ''),
    [input, mode]
  );

  return (
    <ResizableSplit
      storageKey="split:url-full"
      left={
        <div className="flex flex-col gap-6 h-full">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Globe size={14} /> Input
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInput(mode === 'encode' ? FULL_URL_EXAMPLE_ENCODE : FULL_URL_EXAMPLE_DECODE)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
                >
                  Load Example
                </button>
                <ModeToggle mode={mode} onToggle={setMode} />
              </div>
            </div>
            <textarea
              aria-label="Full URL input"
              className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                mode === 'encode'
                  ? 'https://example.com/search?q=hello world&lang=日本語'
                  : 'https://example.com/search?q=hello%20world&lang=%E6%97%A5%E6%9C%AC%E8%AA%9E'
              }
            />
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">About</p>
            <ul className="text-xs text-slate-500 leading-relaxed space-y-1.5">
              <li>
                • Uses <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">encodeURI</code> /{' '}
                <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">decodeURI</code>
              </li>
              <li>
                • Preserves structural chars:{' '}
                <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">: / ? # [ ] @ ! $ & ' ( ) * + , ; =</code>
              </li>
              <li>• Best for encoding a complete URL without breaking its structure</li>
              <li>• Does NOT encode query param delimiters — use Component tab for values</li>
            </ul>
          </section>
        </div>
      }
      right={<OutputPanel label="Output" icon={<Globe size={14} />} text={output} copied={copied} onCopy={copy} />}
    />
  );
}

// ── Query String Tab ───────────────────────────────────────────────────────────

const QUERY_EXAMPLE = 'https://example.com/search?q=hello+world&lang=%E6%97%A5%E6%9C%AC%E8%AA%9E&price=%3C100&page=1';

interface EditableParam {
  id: number;
  key: string;
  value: string;
}

let _nextId = 1;
function nextId() {
  return _nextId++;
}

function QueryTab() {
  const [urlInput, setUrlInput] = useState('');
  const [parsed, setParsed] = useState<QueryParam[]>([]);
  const [editRows, setEditRows] = useState<EditableParam[]>([{ id: nextId(), key: '', value: '' }]);
  const [view, setView] = useState<'parse' | 'build'>('parse');
  const [parseCopied, copyParse] = useCopy();
  const [buildCopied, copyBuild] = useCopy();

  const handleParse = useCallback(() => {
    setParsed(parseQueryString(urlInput));
  }, [urlInput]);

  const builtQuery = useMemo(() => buildQueryString(editRows), [editRows]);

  const updateRow = (id: number, field: 'key' | 'value', val: string) => {
    setEditRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const addRow = () => setEditRows(prev => [...prev, { id: nextId(), key: '', value: '' }]);

  const removeRow = (id: number) => setEditRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : prev));

  const loadExample = () => {
    setUrlInput(QUERY_EXAMPLE);
    setParsed(parseQueryString(QUERY_EXAMPLE));
  };

  return (
    <div className="space-y-4">
      {/* Sub-view toggle */}
      <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm w-fit gap-0.5">
        <button
          onClick={() => setView('parse')}
          className={TAB_CLASSES(view === 'parse')}
        >
          <AlignLeft size={13} /> Parse URL / Query String
        </button>
        <button
          onClick={() => setView('build')}
          className={TAB_CLASSES(view === 'build')}
        >
          <RefreshCw size={13} /> Build Query String
        </button>
      </div>

      {view === 'parse' && (
        <div className="space-y-4">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">URL or Query String</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadExample}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
                >
                  Load Example
                </button>
                <button
                  onClick={handleParse}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg"
                >
                  <AlignLeft size={12} /> Parse
                </button>
              </div>
            </div>
            <textarea
              aria-label="URL or query string to parse"
              className="w-full p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed h-24"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://example.com/search?q=hello+world&lang=%E6%97%A5%E6%9C%AC%E8%AA%9E"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParse(); }}
            />
          </section>

          {parsed.length > 0 && (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {parsed.length} parameter{parsed.length !== 1 ? 's' : ''} found
                </span>
                <CopyBtn
                  text={parsed.map(p => `${p.decodedKey} = ${p.decodedValue}`).join('\n')}
                  copied={parseCopied}
                  onCopy={copyParse}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-1/2">Key (decoded)</th>
                      <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider w-1/2">Value (decoded)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((p, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 text-slate-700 font-semibold break-all">{p.decodedKey}</td>
                        <td className="px-6 py-3 text-blue-700 break-all">{p.decodedValue || <span className="text-slate-300 italic">empty</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Raw (encoded)</p>
                <pre className="font-mono text-[11px] text-slate-500 whitespace-pre-wrap break-all leading-relaxed">
                  {parsed.map(p => `${p.key}=${p.value}`).join('&')}
                </pre>
              </div>
            </section>
          )}

          {urlInput && parsed.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">
              No query parameters found. Click <strong>Parse</strong> or press <kbd className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-xs font-mono">⌘ Enter</kbd>.
            </div>
          )}
        </div>
      )}

      {view === 'build' && (
        <div className="space-y-4">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Parameters (plain text)</span>
              <button
                onClick={addRow}
                className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 hover:text-blue-700 transition-colors border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg bg-white"
              >
                <Plus size={11} /> Add Row
              </button>
            </div>
            <div className="p-4 space-y-2">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_1fr_32px] gap-2 px-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Key</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Value</span>
              </div>
              {editRows.map(row => (
                <div key={row.id} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                  <input
                    type="text"
                    aria-label="Parameter key"
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    value={row.key}
                    onChange={e => updateRow(row.id, 'key', e.target.value)}
                    placeholder="key"
                  />
                  <input
                    type="text"
                    aria-label="Parameter value"
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    value={row.value}
                    onChange={e => updateRow(row.id, 'value', e.target.value)}
                    placeholder="value"
                  />
                  <button
                    onClick={() => removeRow(row.id)}
                    disabled={editRows.length === 1}
                    aria-label="Remove row"
                    className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
            <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <Link size={14} /> Encoded Query String
              </span>
              <CopyBtn text={builtQuery} copied={buildCopied} onCopy={copyBuild} />
            </div>
            <div className="p-6">
              <pre className="font-mono text-[13px] text-blue-100/90 whitespace-pre-wrap break-all leading-relaxed selection:bg-blue-500 selection:text-white">
                {builtQuery || '// Add keys and values above...'}
              </pre>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function UrlEncoder({ initialData }: { initialData?: string | null }) {
  const [tab, setTab] = useState<UrlTab>('component');
  const [componentInput, setComponentInput] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!initialData) return;
    const t = initialData.trim();
    // Detect percent-encoded content → component decode tab
    if (/%[0-9A-Fa-f]{2}/.test(t)) {
      setTab('component');
      setComponentInput(t);
    } else if (/^https?:\/\//.test(t) || t.includes('?') || t.includes('&')) {
      setTab('query');
    } else {
      setTab('component');
      setComponentInput(t);
    }
  }, [initialData]);

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex flex-wrap bg-white border border-slate-200 p-1 rounded-xl shadow-sm w-fit gap-0.5">
        <button onClick={() => setTab('component')} className={TAB_CLASSES(tab === 'component')}>
          <Link size={14} /> Component
        </button>
        <button onClick={() => setTab('full')} className={TAB_CLASSES(tab === 'full')}>
          <Globe size={14} /> Full URL
        </button>
        <button onClick={() => setTab('query')} className={TAB_CLASSES(tab === 'query')}>
          <AlignLeft size={14} /> Query String
        </button>
      </div>

      {tab === 'component' && <ComponentTab initialInput={componentInput} />}
      {tab === 'full' && <FullUrlTab />}
      {tab === 'query' && <QueryTab />}
    </div>
  );
}
