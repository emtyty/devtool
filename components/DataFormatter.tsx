import { useState, useEffect, useCallback } from 'react';
import { Filter, Layers, Copy, Check } from 'lucide-react';
import { SqlFormat, FormatterOptions, parseItems, formatItems } from '../utils/formatter';

const DEFAULT_OPTIONS: FormatterOptions = {
  quotes: 'single',
  delimiter: ', ',
  upperCase: false,
  removeHyphens: false,
  removeDoubleQuotes: false,
  prettyPrint: true,
};

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-3 cursor-pointer">
    <div
      className={`w-10 h-5 rounded-full relative transition-all ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}
      onClick={() => onChange(!checked)}
    >
      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </div>
    <span className="text-[10px] font-black text-slate-500 uppercase">{label}</span>
  </label>
);

export default function DataFormatter() {
  const [rawInput, setRawInput] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [output, setOutput] = useState('');
  const [sqlFormat, setSqlFormat] = useState<SqlFormat>(SqlFormat.IN_CLAUSE);
  const [options, setOptions] = useState<FormatterOptions>(DEFAULT_OPTIONS);
  const [copied, setCopied] = useState(false);

  const updateOutput = useCallback(() => {
    setOutput(formatItems(items, sqlFormat, options));
  }, [items, sqlFormat, options]);

  useEffect(() => { updateOutput(); }, [updateOutput]);

  const handleInput = (val: string) => {
    setRawInput(val);
    setItems(parseItems(val));
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setOption = <K extends keyof FormatterOptions>(key: K, val: FormatterOptions[K]) =>
    setOptions(prev => ({ ...prev, [key]: val }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left: Input + Options */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[340px]">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Filter size={14} /> Input Data
            </span>
            {items.length > 0 && (
              <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded shadow-sm">
                {items.length} ITEMS DETECTED
              </span>
            )}
          </div>
          <textarea
            className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
            value={rawInput}
            onChange={e => handleInput(e.target.value)}
            placeholder="Paste any list of items (words, IDs, GUIDs) separated by space, comma, or newline..."
          />
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">SQL Structure</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                value={sqlFormat}
                onChange={e => setSqlFormat(e.target.value as SqlFormat)}
              >
                <option value={SqlFormat.IN_CLAUSE}>IN (...) CLAUSE</option>
                <option value={SqlFormat.VALUES_LIST}>VALUES (...) LIST</option>
                <option value={SqlFormat.UNION_SELECT}>UNION SELECTS</option>
                <option value={SqlFormat.JSON_ARRAY}>JSON ARRAY</option>
                <option value={SqlFormat.RAW_CSV}>RAW CSV</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Quote Style</label>
              <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                {(['single', 'double', 'none'] as const).map(q => (
                  <button
                    key={q}
                    onClick={() => setOption('quotes', q)}
                    className={`flex-1 py-2 px-3 text-[10px] font-black rounded-lg uppercase transition-all ${
                      options.quotes === q ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 justify-center">
              <Toggle checked={options.upperCase} onChange={v => setOption('upperCase', v)} label="Uppercase" />
              <Toggle checked={options.removeHyphens} onChange={v => setOption('removeHyphens', v)} label="Clean Hyphens" />
              <Toggle checked={options.removeDoubleQuotes} onChange={v => setOption('removeDoubleQuotes', v)} label="Remove Double Quotes" />
            </div>
          </div>
        </section>
      </div>

      {/* Right: Output */}
      <div className="lg:col-span-4 flex flex-col">
        <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
          <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
              <Layers size={14} /> Processed Output
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'COPIED' : 'COPY RESULT'}
            </button>
          </div>
          <div className="flex-1 p-6 overflow-auto">
            <pre className="font-mono text-[13px] text-blue-100/90 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white">
              {output || '// Output will appear here...'}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
