import { useState, useEffect, useCallback } from 'react';
import { ListFilter, Layers, Copy, Check, Eraser, SortAsc, SortDesc } from 'lucide-react';
import { ListToolsOptions, processListItems } from '../utils/formatter';

const DEFAULT_OPTIONS: ListToolsOptions = {
  removeDuplicates: true,
  sort: 'none',
  naturalSort: true,
  trim: true,
  removeEmpty: true,
  caseSensitive: false,
};

const Checkbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-3 cursor-pointer">
    <input
      type="checkbox"
      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
    />
    <span className="text-[10px] font-black text-slate-600 uppercase">{label}</span>
  </label>
);

export default function ListCleaner() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [options, setOptions] = useState<ListToolsOptions>(DEFAULT_OPTIONS);
  const [copied, setCopied] = useState(false);

  const updateOutput = useCallback(() => {
    setOutput(processListItems(input, options));
  }, [input, options]);

  useEffect(() => { updateOutput(); }, [updateOutput]);

  const setOption = <K extends keyof ListToolsOptions>(key: K, val: ListToolsOptions[K]) =>
    setOptions(prev => ({ ...prev, [key]: val }));

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputLines = input.trim() ? input.split(/\r?\n/).filter(l => l.trim()) : [];
  const inputCount = inputLines.length;
  const outputCount = output.trim() ? output.split(/\r?\n/).filter(l => l.trim()).length : 0;

  const normalizedLines = inputLines.map(l => options.caseSensitive ? l.trim() : l.trim().toLowerCase());
  const freq = normalizedLines.reduce<Record<string, number>>((acc, l) => { acc[l] = (acc[l] || 0) + 1; return acc; }, {});
  const uniqueCount = Object.keys(freq).length;
  const duplicateCount = Object.values(freq).filter(n => n > 1).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left: Input + Options */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[340px]">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <ListFilter size={14} /> Input List
            </span>
            {inputCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded shadow-sm">
                  {inputCount} LINES
                </span>
                <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded shadow-sm">
                  {uniqueCount} UNIQUE
                </span>
                {duplicateCount > 0 && (
                  <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm">
                    {duplicateCount} DUPED
                  </span>
                )}
              </div>
            )}
          </div>
          <textarea
            className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste items line by line..."
          />
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-4">
              <Checkbox checked={options.removeDuplicates} onChange={v => setOption('removeDuplicates', v)} label="Unique Only" />
              <Checkbox checked={options.removeEmpty} onChange={v => setOption('removeEmpty', v)} label="Remove Empty" />
            </div>
            <div className="space-y-4">
              <Checkbox checked={options.trim} onChange={v => setOption('trim', v)} label="Trim Items" />
              <Checkbox checked={options.caseSensitive} onChange={v => setOption('caseSensitive', v)} label="Case Sensitive" />
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sort Sequence</label>
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {[
                    { id: 'none', label: 'None', icon: <Eraser size={12} /> },
                    { id: 'asc', label: 'A→Z', icon: <SortAsc size={12} /> },
                    { id: 'desc', label: 'Z→A', icon: <SortDesc size={12} /> },
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => setOption('sort', s.id as ListToolsOptions['sort'])}
                      className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 text-[10px] font-black rounded-lg uppercase transition-all ${
                        options.sort === s.id ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={options.naturalSort}
                  onChange={e => setOption('naturalSort', e.target.checked)}
                />
                <span className="text-[10px] font-black text-blue-600 uppercase italic">Natural Sort Mode</span>
              </label>
            </div>
          </div>
        </section>
      </div>

      {/* Right: Output */}
      <div className="lg:col-span-4 flex flex-col">
        <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
          <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
              <Layers size={14} />
              {outputCount > 0 ? `${outputCount} ITEMS` : 'Clean Output'}
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
