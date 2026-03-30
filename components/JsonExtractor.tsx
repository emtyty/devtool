import React, { useState, useCallback, useRef } from 'react';
import { Braces, Search, Copy, Check, AlertCircle } from 'lucide-react';
import { extractByPath, formatAsPlainText, formatAsJsonArray } from '../utils/jsonExtractor';

type OutputFormat = 'plain' | 'json';

const PLACEHOLDER_JSON = `{
  "hits": {
    "hits": [
      {
        "_source": {
          "keyword_productId": "eb45def0-7205-4feb-9335-18269305b26c"
        }
      },
      {
        "_source": {
          "keyword_productId": "57eed2eb-5838-427e-b535-27301eed8edf"
        }
      }
    ]
  }
}`;

const JsonExtractor: React.FC = () => {
  const [jsonInput, setJsonInput] = useState('');
  const [path, setPath] = useState('');
  const [output, setOutput] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>('plain');
  const [copied, setCopied] = useState(false);
  const lastValuesRef = useRef<unknown[]>([]);

  const handleExtract = useCallback(() => {
    setError(null);
    setOutput('');
    setCount(null);

    if (!jsonInput.trim()) {
      setError('Please paste a JSON input.');
      return;
    }
    if (!path.trim()) {
      setError('Please enter a dot-notation path.');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      setError('Invalid JSON — unable to parse.');
      return;
    }

    const values = extractByPath(parsed, path);
    lastValuesRef.current = values;

    if (values.length === 0) {
      setError(`No values found for path "${path}".`);
      return;
    }

    setCount(values.length);
    setOutput(format === 'plain' ? formatAsPlainText(values) : formatAsJsonArray(values));
  }, [jsonInput, path, format]);

  const handleFormatChange = useCallback((next: OutputFormat) => {
    setFormat(next);
    if (lastValuesRef.current.length > 0) {
      setOutput(
        next === 'plain'
          ? formatAsPlainText(lastValuesRef.current)
          : formatAsJsonArray(lastValuesRef.current)
      );
    }
  }, []);

  const handleCopy = useCallback(() => {
    if (!output) return;
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [output]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExtract();
      }
    },
    [handleExtract]
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
          JSON Extractor
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Extract a list of values from JSON using a dot-notation path. Automatically traverses nested arrays.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ── Left: JSON input ── */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              JSON Input
            </label>
            {jsonInput && (
              <button
                onClick={() => { setJsonInput(''); setOutput(''); setCount(null); setError(null); lastValuesRef.current = []; }}
                className="text-[11px] font-bold text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER_JSON}
            spellCheck={false}
            className="w-full h-[420px] resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-[13px] font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
          />
        </div>

        {/* ── Right: Controls + Output ── */}
        <div className="flex flex-col gap-3">
          {/* Path input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Dot-notation Path
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={path}
                  onChange={e => setPath(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleExtract(); }}
                  placeholder="_source.keyword_productId"
                  spellCheck={false}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                />
              </div>
              <button
                onClick={handleExtract}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold rounded-xl transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                <Braces size={14} />
                Extract
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Tip: use dot notation — <span className="font-mono">hits.hits._source.id</span> or short form <span className="font-mono">_source.id</span>. Press <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-mono">Enter</kbd> or <kbd className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-mono">Ctrl+Enter</kbd> to extract.
            </p>
          </div>

          {/* Output format toggle + count */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {(['plain', 'json'] as OutputFormat[]).map(f => (
                <button
                  key={f}
                  onClick={() => handleFormatChange(f)}
                  className={`px-3 py-1 rounded-md text-[12px] font-bold transition-all cursor-pointer ${
                    format === f
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {f === 'plain' ? 'Plain text' : 'JSON array'}
                </button>
              ))}
            </div>
            {count !== null && (
              <span className="text-[12px] font-bold text-blue-500 dark:text-blue-400">
                {count} {count === 1 ? 'value' : 'values'} found
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <span className="text-[13px] text-red-600 dark:text-red-400 font-medium">{error}</span>
            </div>
          )}

          {/* Output */}
          <div className="relative flex-1">
            {output && (
              <button
                onClick={handleCopy}
                className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer shadow-sm"
              >
                {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            <textarea
              value={output}
              readOnly
              placeholder="Extracted values will appear here…"
              spellCheck={false}
              className="w-full h-[300px] resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-[13px] font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none transition-all"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default JsonExtractor;
