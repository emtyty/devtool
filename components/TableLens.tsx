import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Trash2, Download, Search, ChevronDown, X, Loader2 } from 'lucide-react';

type Row = Record<string, string>;

const ROW_H = 33;   // px — must match actual row height
const OVERSCAN = 25;

// ── Utilities ────────────────────────────────────────────────────
function toCSV(cols: string[], rows: Row[]): string {
  const e = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.map(e).join(','), ...rows.map(r => cols.map(c => e(r[c])).join(','))].join('\n');
}

function downloadCSV(name: string, content: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  a.download = name;
  a.click();
}

function useDebounce<T>(value: T, ms: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return dv;
}

// ── FilterCell — lazy distinct values, only computed on dropdown open ──
interface FilterCellProps {
  value: string;
  onChange: (v: string) => void;
  getOptions: () => string[];
  active: boolean;
}

const PAGE = 60; // items per page in dropdown

const FilterCell: React.FC<FilterCellProps> = ({ value, onChange, getOptions, active }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.toLowerCase();
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  }, [options, value]);

  const visible = filtered.slice(0, page * PAGE);
  const hasMore = filtered.length > visible.length;

  const openDrop = () => {
    if (!inputRef.current) return;
    setDropRect(inputRef.current.getBoundingClientRect());
    setOptions(getOptions()); // lazy — computed only here
    setPage(1);
    setOpen(true);
  };

  // Reset page when search text changes
  useEffect(() => { setPage(1); }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!inputRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Only close on scroll that happens OUTSIDE the dropdown
    const close = (e: Event) => {
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={openDrop}
          onClick={e => { e.stopPropagation(); openDrop(); }}
          placeholder="Filter..."
          className={`w-full font-normal bg-white dark:bg-slate-900 border rounded px-2 py-1 pr-6 text-[11px] placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none transition-colors ${
            active
              ? 'border-blue-400 text-blue-700 dark:text-blue-300'
              : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 focus:border-blue-400'
          }`}
        />
        {value ? (
          <button
            onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false); }}
            className="absolute right-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X size={10} />
          </button>
        ) : (
          <ChevronDown size={10} className={`absolute right-1.5 pointer-events-none transition-transform ${open ? 'rotate-180' : ''} text-slate-300 dark:text-slate-600`} />
        )}
      </div>

      {open && dropRect && filtered.length > 0 && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: dropRect.bottom + 2, left: dropRect.left, width: Math.max(dropRect.width, 180), zIndex: 9999 }}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-52 overflow-y-auto py-1"
        >
          {value && !options.includes(value) && (
            <div className="px-3 py-1.5 text-[11px] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700 italic">
              Freetext: "{value}"
            </div>
          )}
          {visible.map((v: string) => (
            <button
              key={v}
              onMouseDown={e => { e.preventDefault(); onChange(value === v ? '' : v); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer truncate transition-colors ${
                value === v
                  ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title={v}
            >
              {v === '' ? <span className="italic text-slate-400 dark:text-slate-500">(empty)</span> : v}
            </button>
          ))}
          {hasMore && (
            <button
              onMouseDown={e => { e.preventDefault(); setPage(p => p + 1); }}
              className="w-full px-3 py-2 text-[11px] font-bold text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 cursor-pointer border-t border-slate-100 dark:border-slate-700 transition-colors"
            >
              Load {Math.min(PAGE, filtered.length - visible.length)} more ({filtered.length - visible.length} remaining)
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────
const TableLens: React.FC = () => {
  const [rawData, setRawData] = useState<Row[]>([]);
  const [data, setData] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  // filterInputs = immediate (for controlled inputs)
  // debouncedFilters = 300ms delayed (for actual row filtering)
  const [filterInputs, setFilterInputs] = useState<Record<string, string>>({});
  const debouncedFilters = useDebounce(filterInputs, 300);
  const isFiltering = JSON.stringify(filterInputs) !== JSON.stringify(debouncedFilters);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editCell, setEditCell] = useState<{ row: number; col: string } | null>(null);
  const [editVal, setEditVal] = useState('');
  const [distinctCol, setDistinctCol] = useState('');
  const [distinctValues, setDistinctValues] = useState<string[]>([]);
  const [distinctLoading, setDistinctLoading] = useState(false);
  const [distinctPage, setDistinctPage] = useState(1);
  const DISTINCT_PAGE = 50;
  const [batchCol, setBatchCol] = useState('');
  const [batchVal, setBatchVal] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Virtual scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerH, setContainerH] = useState(500);

  const hasData = data.length > 0;

  // Track container height for virtual scroll
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  // Reset scroll when filters change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [debouncedFilters]);

  // Filtered rows — uses debounced filters
  const filteredRows = useMemo(() =>
    data
      .map((row, idx) => ({ idx, row }))
      .filter(({ row }) =>
        columns.every(col => {
          const f = (debouncedFilters[col] || '').toLowerCase();
          return !f || String(row[col] ?? '').toLowerCase().includes(f);
        })
      ),
    [data, debouncedFilters, columns]
  );

  // Virtual scroll window
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = Math.min(filteredRows.length, Math.ceil((scrollTop + containerH) / ROW_H) + OVERSCAN);
  const visibleRows = filteredRows.slice(startIdx, endIdx);
  const padTop = startIdx * ROW_H;
  const padBot = Math.max(0, (filteredRows.length - endIdx) * ROW_H);

  useEffect(() => {
    if (!distinctCol) { setDistinctValues([]); setDistinctPage(1); return; }
    setDistinctLoading(true);
    setDistinctPage(1);
    const t = setTimeout(() => {
      const vals = Array.from<string>(new Set(data.map((r: Row) => String(r[distinctCol] ?? '')))).sort();
      setDistinctValues(vals);
      setDistinctLoading(false);
    }, 30);
    return () => clearTimeout(t);
  }, [distinctCol, data]);

  const modifiedSet = useMemo(() =>
    new Set(
      data.reduce<number[]>((acc, row, i) => {
        if (columns.some(c => row[c] !== rawData[i]?.[c])) acc.push(i);
        return acc;
      }, [])
    ),
    [data, rawData, columns]
  );

  const loadParsed = useCallback((cols: string[], rows: Row[], name: string) => {
    setColumns(cols);
    setRawData(rows.map(r => ({ ...r })));
    setData(rows.map(r => ({ ...r })));
    setFilterInputs({});
    setSelected(new Set());
    setEditCell(null);
    setDistinctCol('');
    setBatchCol(cols[0] || '');
    setFileName(name);
    setScrollTop(0);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setLoading(true);
    const name = file.name;

    // Yield to paint the loading UI before heavy work
    await new Promise(r => setTimeout(r, 30));

    try {
      if (/\.(xlsx|xls)$/i.test(name)) {
        setLoadMsg('Reading XLSX...');
        await new Promise(r => setTimeout(r, 16));
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        setLoadMsg('Parsing rows...');
        await new Promise(r => setTimeout(r, 16));
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const arr = XLSX.utils.sheet_to_json<Row>(ws, { defval: '' });
        if (!arr.length) return;
        const cols = Object.keys(arr[0]);
        setLoadMsg(`Loading ${arr.length.toLocaleString()} rows...`);
        await new Promise(r => setTimeout(r, 16));
        loadParsed(cols, arr.map(r => Object.fromEntries(cols.map(c => [c, String(r[c] ?? '')]))), name);
      } else {
        setLoadMsg('Parsing CSV...');
        const Papa = await import('papaparse');
        await new Promise<void>(resolve => {
          Papa.default.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: false,
            complete: (result: { meta: { fields?: string[] }; data: Row[] }) => {
              const cols = result.meta.fields || [];
              const rows = result.data.map(r => Object.fromEntries(cols.map(c => [c, String(r[c] ?? '')])));
              setLoadMsg(`Loading ${rows.length.toLocaleString()} rows...`);
              setTimeout(() => {
                loadParsed(cols, rows, name);
                resolve();
              }, 16);
            },
          });
        });
      }
    } finally {
      setLoading(false);
      setLoadMsg('');
    }
  }, [loadParsed]);

  const commitEdit = useCallback(() => {
    if (!editCell) return;
    setData(prev => prev.map((r, i) => i === editCell.row ? { ...r, [editCell.col]: editVal } : r));
    setEditCell(null);
  }, [editCell, editVal]);

  const applyBatch = useCallback(() => {
    if (!batchCol || selected.size === 0) return;
    setData(prev => prev.map((r, i) => selected.has(i) ? { ...r, [batchCol]: batchVal } : r));
  }, [batchCol, batchVal, selected]);

  const toggleRow = useCallback((idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === filteredRows.length
        ? new Set()
        : new Set(filteredRows.map(r => r.idx))
    );
  }, [filteredRows]);

  const baseName = fileName.replace(/\.[^.]+$/, '') || 'export';
  const activeFilters = columns.filter(c => filterInputs[c]);

  // ── Drop zone ────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Table Lens</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Import CSV or XLSX — filter, edit cells, batch edit, and export your data. Fully local, nothing uploaded.
          </p>
        </div>

        <div
          onDrop={e => { e.preventDefault(); setDragging(false); e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]); }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => !loading && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center gap-4 transition-all ${
            loading
              ? 'border-blue-300 bg-blue-50 dark:bg-blue-500/10 cursor-default'
              : dragging
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10 cursor-copy'
              : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer'
          }`}
        >
          {loading ? (
            <>
              <Loader2 size={32} className="text-blue-500 animate-spin" />
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{loadMsg || 'Loading...'}</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center">
                <Upload size={28} className="text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-700 dark:text-slate-200">Drop a CSV or XLSX file here</p>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">or click to browse</p>
              </div>
              <div className="flex gap-2 mt-2">
                {['CSV', 'XLSX', 'XLS'].map(f => (
                  <span key={f} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-bold text-slate-500 dark:text-slate-400">{f}</span>
                ))}
              </div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => { e.target.files?.[0] && loadFile(e.target.files[0]); e.target.value = ''; }}
        />
      </div>
    );
  }

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.idx));

  // ── Main table view ─────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3" style={{ height: 'calc(100vh - 160px)', minHeight: 480 }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight shrink-0">Table Lens</h2>
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 truncate">{fileName}</span>
          {activeFilters.length > 0 && (
            <>
              <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full shrink-0">
                {activeFilters.length} filter{activeFilters.length > 1 ? 's' : ''} active
              </span>
              <button
                onClick={() => setFilterInputs({})}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer shrink-0"
              >
                <X size={11} /> Clear all
              </button>
            </>
          )}
          {isFiltering && (
            <Loader2 size={12} className="text-blue-400 animate-spin shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setData([]); setColumns([]); setRawData([]); setFileName(''); setFilterInputs({}); setSelected(new Set()); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <Trash2 size={12} /> Clear
          </button>
          <button
            onClick={() => downloadCSV(`${baseName}_all.csv`, toCSV(columns, data))}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all cursor-pointer"
          >
            <Download size={12} /> Export All
          </button>
          <button
            onClick={() => downloadCSV(`${baseName}_filtered.csv`, toCSV(columns, filteredRows.map(r => r.row)))}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all cursor-pointer"
          >
            <Download size={12} /> Export Filtered
          </button>
          <button
            onClick={() => downloadCSV(`${baseName}_changes.csv`, toCSV(columns, data.filter((_, i) => modifiedSet.has(i))))}
            disabled={modifiedSet.size === 0}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              modifiedSet.size > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
            }`}
          >
            <Download size={12} /> Export Changes{modifiedSet.size > 0 ? ` (${modifiedSet.size})` : ''}
          </button>
        </div>
      </div>

      {/* Batch edit bar */}
      {selected.size > 0 && (
        <div className="shrink-0 flex items-center gap-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl px-4 py-2">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
            {selected.size} row{selected.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select
              value={batchCol}
              onChange={e => setBatchCol(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium cursor-pointer appearance-none"
            >
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-xs text-slate-400 font-bold">=</span>
            <input
              value={batchVal}
              onChange={e => setBatchVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyBatch()}
              placeholder="New value..."
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-36 focus:outline-none focus:border-blue-400"
            />
            <button onClick={applyBatch} className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-all cursor-pointer">
              Apply to all
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1.5 cursor-pointer transition-colors">
              Deselect
            </button>
          </div>
        </div>
      )}

      {/* Body: sidebar + table */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Distinct Values Sidebar */}
        <div className="w-52 shrink-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 mb-2">
              <Search size={11} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Find Distinct Values</span>
            </div>
            <div className="relative">
              <select
                value={distinctCol}
                onChange={e => setDistinctCol(e.target.value)}
                className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium appearance-none cursor-pointer pr-6 focus:outline-none focus:border-blue-400"
              >
                <option value="">Select a column...</option>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {!distinctCol ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6 px-2 leading-relaxed">
                Select a column above to see all its unique values.
              </p>
            ) : distinctLoading ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <Loader2 size={16} className="animate-spin text-blue-400" />
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Computing...</span>
              </div>
            ) : (
              <>
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 px-1 py-1 flex items-center justify-between">
                  <span>{distinctValues.length} unique value{distinctValues.length !== 1 ? 's' : ''}</span>
                  {filterInputs[distinctCol] && (
                    <button onClick={() => setFilterInputs(p => ({ ...p, [distinctCol]: '' }))} className="text-blue-500 hover:text-blue-600 cursor-pointer">clear</button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {distinctValues.slice(0, distinctPage * DISTINCT_PAGE).map(v => (
                    <button
                      key={v}
                      onClick={() => setFilterInputs(prev => ({ ...prev, [distinctCol]: prev[distinctCol] === v ? '' : v }))}
                      className={`w-full text-left text-xs px-2 py-1 rounded-lg transition-all cursor-pointer font-medium ${
                        filterInputs[distinctCol] === v
                          ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title={v}
                    >
                      <span className="truncate block">
                        {v === '' ? <span className="italic text-slate-300 dark:text-slate-600">(empty)</span> : v}
                      </span>
                    </button>
                  ))}
                </div>
                {distinctValues.length > distinctPage * DISTINCT_PAGE && (
                  <button
                    onClick={() => setDistinctPage(p => p + 1)}
                    className="w-full mt-1 py-1.5 text-[11px] font-bold text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors cursor-pointer"
                  >
                    Load {Math.min(DISTINCT_PAGE, distinctValues.length - distinctPage * DISTINCT_PAGE)} more
                    <span className="text-slate-400 font-normal ml-1">
                      ({distinctValues.length - distinctPage * DISTINCT_PAGE} remaining)
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">

          {/* Single scroll container — thead sticky inside, no split tables */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto"
            onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          >
            <table className="text-xs border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 dark:bg-slate-800">
                  <th className="w-9 px-3 py-2 border-r border-b border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="cursor-pointer accent-blue-600" />
                  </th>
                  <th className="w-10 px-3 py-2 text-slate-400 dark:text-slate-500 font-bold text-right border-r border-b border-slate-200 dark:border-slate-700 sticky left-9 z-20 bg-slate-50 dark:bg-slate-800">#</th>
                  {columns.map(col => (
                    <th key={col} className="px-3 py-2 text-left border-r border-b border-slate-200 dark:border-slate-700 last:border-r-0 min-w-[140px] bg-slate-50 dark:bg-slate-800">
                      <div className="font-black text-slate-600 dark:text-slate-300 truncate mb-1.5 text-[11px] uppercase tracking-wide">{col}</div>
                      <FilterCell
                        value={filterInputs[col] || ''}
                        onChange={v => setFilterInputs(prev => ({ ...prev, [col]: v }))}
                        getOptions={() => Array.from<string>(new Set(data.map((r: Row) => String(r[col] ?? '')))).sort()}
                        active={!!(debouncedFilters[col])}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* top padding */}
                {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={columns.length + 2} /></tr>}

                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="text-center py-12 text-sm text-slate-400 dark:text-slate-500">
                      No rows match the current filters.
                    </td>
                  </tr>
                ) : visibleRows.map(({ idx, row }, vi) => {
                  const displayIdx = startIdx + vi;
                  const isModified = modifiedSet.has(idx);
                  const isSelected = selected.has(idx);
                  return (
                    <tr
                      key={idx}
                      style={{ height: ROW_H }}
                      className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-500/[0.08]'
                          : isModified
                          ? 'bg-amber-50/60 dark:bg-amber-500/[0.05]'
                          : displayIdx % 2 === 0
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-slate-50/40 dark:bg-slate-800/20'
                      } hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.04]`}
                    >
                      <td className={`w-9 px-3 border-r border-slate-100 dark:border-slate-800 sticky left-0 z-10 ${isSelected ? 'bg-blue-50 dark:bg-slate-800' : isModified ? 'bg-amber-50 dark:bg-slate-900' : displayIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-900'}`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleRow(idx)} className="cursor-pointer accent-blue-600" />
                      </td>
                      <td className={`w-10 px-3 text-right border-r border-slate-100 dark:border-slate-800 font-medium sticky left-9 z-10 ${isSelected ? 'bg-blue-50 dark:bg-slate-800' : isModified ? 'bg-amber-50 dark:bg-slate-900' : displayIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-900'}`}>
                        {isModified
                          ? <span className="text-amber-500 font-bold">{displayIdx + 1}</span>
                          : <span className="text-slate-400 dark:text-slate-500">{displayIdx + 1}</span>
                        }
                      </td>
                      {columns.map(col => {
                        const isEditing = editCell?.row === idx && editCell?.col === col;
                        const cellModified = isModified && row[col] !== rawData[idx]?.[col];
                        return (
                          <td
                            key={col}
                            onClick={() => { setEditCell({ row: idx, col }); setEditVal(row[col] ?? ''); }}
                            className={`px-3 border-r border-slate-100 dark:border-slate-800 last:border-r-0 cursor-pointer max-w-[240px] min-w-[140px] ${
                              cellModified ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
                                onClick={e => e.stopPropagation()}
                                className="w-full bg-white dark:bg-slate-800 border border-blue-400 rounded px-1.5 py-0.5 text-xs outline-none text-slate-700 dark:text-slate-200 min-w-[80px]"
                              />
                            ) : (
                              <span className="truncate block">{String(row[col] ?? '')}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* bottom padding */}
                {padBot > 0 && <tr style={{ height: padBot }}><td colSpan={columns.length + 2} /></tr>}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-4">
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              Showing {filteredRows.length.toLocaleString()} of {data.length.toLocaleString()} rows
              {selected.size > 0 && <span className="ml-2 text-blue-500">· {selected.size.toLocaleString()} selected</span>}
            </span>
            {modifiedSet.size > 0 && (
              <span className="text-[11px] font-bold text-amber-500">
                ● {modifiedSet.size.toLocaleString()} modified row{modifiedSet.size > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableLens;
