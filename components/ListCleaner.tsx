import { useState, useEffect, useCallback, useMemo } from 'react';
import { ListFilter, Layers, Copy, Check, Eraser, SortAsc, SortDesc, GitCompare, List } from 'lucide-react';
import { ListToolsOptions, processListItems } from '../utils/formatter';
import ResizableSplit from './ResizableSplit';

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

// Deduplicate while preserving original casing and insertion order
function toDistinct(text: string, caseSensitive: boolean): { original: string; key: string }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: { original: string; key: string }[] = [];
  for (const line of lines) {
    const key = caseSensitive ? line : line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ original: line, key });
    }
  }
  return result;
}

export default function ListCleaner({ initialData }: { initialData?: string | null }) {
  const [mode, setMode] = useState<'clean' | 'compare'>('clean');

  // Clean mode
  const [input, setInput] = useState('');

  useEffect(() => { if (initialData) setInput(initialData); }, [initialData]);
  const [output, setOutput] = useState('');
  const [options, setOptions] = useState<ListToolsOptions>(DEFAULT_OPTIONS);
  const [copied, setCopied] = useState(false);

  // Compare mode
  const [list1, setList1] = useState('');
  const [list2, setList2] = useState('');
  const [compareCaseSensitive, setCompareCaseSensitive] = useState(false);
  const [compareCopied1, setCompareCopied1] = useState(false);
  const [compareCopied2, setCompareCopied2] = useState(false);

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

  // Compare mode computation
  const compareResult = useMemo(() => {
    const distinct1 = toDistinct(list1, compareCaseSensitive);
    const distinct2 = toDistinct(list2, compareCaseSensitive);
    const keys1 = new Set(distinct1.map(i => i.key));
    const keys2 = new Set(distinct2.map(i => i.key));
    const onlyInList1 = distinct1.filter(i => !keys2.has(i.key));
    const onlyInList2 = distinct2.filter(i => !keys1.has(i.key));
    return { distinct1, distinct2, onlyInList1, onlyInList2 };
  }, [list1, list2, compareCaseSensitive]);

  const handleCompareCopy1 = () => {
    if (!compareResult.onlyInList1.length) return;
    navigator.clipboard.writeText(compareResult.onlyInList1.map(i => i.original).join('\n'));
    setCompareCopied1(true);
    setTimeout(() => setCompareCopied1(false), 2000);
  };

  const handleCompareCopy2 = () => {
    if (!compareResult.onlyInList2.length) return;
    navigator.clipboard.writeText(compareResult.onlyInList2.map(i => i.original).join('\n'));
    setCompareCopied2(true);
    setTimeout(() => setCompareCopied2(false), 2000);
  };

  const listStats = (text: string, label: string, distinct: { original: string; key: string }[]) => {
    const raw = text.trim() ? text.split(/\r?\n/).filter(l => l.trim()).length : 0;
    return (
      <div className="flex items-center gap-2">
        {raw > 0 && (
          <>
            <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded shadow-sm">{raw} LINES</span>
            <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded shadow-sm">{distinct.length} UNIQUE</span>
            {raw - distinct.length > 0 && (
              <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm">
                {raw - distinct.length} DUPED
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  // ---- Clean mode panels ----

  const cleanLeftPanel = (
    <div className="flex flex-col gap-6 h-full">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[340px]">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <ListFilter size={14} /> Input List
          </span>
          {inputCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded shadow-sm">{inputCount} LINES</span>
              <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded shadow-sm">{uniqueCount} UNIQUE</span>
              {duplicateCount > 0 && (
                <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm">{duplicateCount} DUPED</span>
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
  );

  const cleanRightPanel = (
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
  );

  // ---- Compare mode panels ----

  const { distinct1, distinct2, onlyInList1, onlyInList2 } = compareResult;

  const compareLeftPanel = (
    <div className="flex flex-col gap-4 h-full">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[220px]">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
            <List size={14} /> List 1
          </span>
          {listStats(list1, 'List 1', distinct1)}
        </div>
        <textarea
          className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
          value={list1}
          onChange={e => setList1(e.target.value)}
          placeholder="Paste List 1 items line by line..."
        />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[220px]">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-2">
            <List size={14} /> List 2
          </span>
          {listStats(list2, 'List 2', distinct2)}
        </div>
        <textarea
          className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
          value={list2}
          onChange={e => setList2(e.target.value)}
          placeholder="Paste List 2 items line by line..."
        />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <Checkbox
          checked={compareCaseSensitive}
          onChange={setCompareCaseSensitive}
          label="Case Sensitive"
        />
      </section>
    </div>
  );

  const hasInput = list1.trim() || list2.trim();

  const MissingSection = ({
    label, items, allPresent, otherLabel, copied, onCopy, accentColor,
  }: {
    label: string; items: { original: string }[]; allPresent: string;
    otherLabel: string; copied: boolean; onCopy: () => void; accentColor: string;
  }) => (
    <div className="flex flex-col flex-1 min-h-0 border-b border-slate-800 last:border-b-0">
      <div className={`px-6 py-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-black uppercase tracking-widest ${accentColor}`}>
            {label}
          </span>
          {hasInput && (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
              items.length > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {items.length} missing
            </span>
          )}
        </div>
        <button
          onClick={onCopy}
          disabled={items.length === 0}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <div className="flex-1 p-5 overflow-auto">
        {items.length > 0 ? (
          <pre className="font-mono text-[13px] text-amber-200/90 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white">
            {items.map(i => i.original).join('\n')}
          </pre>
        ) : hasInput ? (
          <div className="flex items-center gap-2 text-emerald-400">
            <Check size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">{allPresent}</span>
          </div>
        ) : (
          <span className="font-mono text-[13px] text-slate-600">{'// Paste both lists to compare...'}</span>
        )}
      </div>
    </div>
  );

  const compareRightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
      {/* Stats header */}
      <div className="px-6 py-3 bg-slate-800/60 border-b border-slate-800 flex items-center gap-3 flex-wrap">
        <GitCompare size={13} className="text-slate-500" />
        {hasInput ? (
          <>
            <span className="text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded">
              {distinct1.length} unique in L1
            </span>
            <span className="text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded">
              {distinct2.length} unique in L2
            </span>
          </>
        ) : (
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Compare Results</span>
        )}
      </div>

      {/* Two result sections */}
      <MissingSection
        label="In List 1 — not in List 2"
        items={onlyInList1}
        allPresent="All L1 items found in L2"
        otherLabel="L2"
        copied={compareCopied1}
        onCopy={handleCompareCopy1}
        accentColor="text-blue-400"
      />
      <MissingSection
        label="In List 2 — not in List 1"
        items={onlyInList2}
        allPresent="All L2 items found in L1"
        otherLabel="L1"
        copied={compareCopied2}
        onCopy={handleCompareCopy2}
        accentColor="text-purple-400"
      />
    </section>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Mode switcher */}
      <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm w-fit gap-0.5">
        <button
          onClick={() => setMode('clean')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            mode === 'clean' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ListFilter size={12} /> Clean
        </button>
        <button
          onClick={() => setMode('compare')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            mode === 'compare' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <GitCompare size={12} /> Compare
        </button>
      </div>

      {mode === 'clean'
        ? <ResizableSplit left={cleanLeftPanel} right={cleanRightPanel} storageKey="split:list-cleaner" />
        : <ResizableSplit left={compareLeftPanel} right={compareRightPanel} storageKey="split:list-compare" />
      }
    </div>
  );
}
