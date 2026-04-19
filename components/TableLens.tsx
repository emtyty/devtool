import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Trash2, Download, Search, ChevronDown, X, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Copy, MoreHorizontal, Paintbrush, WrapText, Pin, PinOff, EyeOff, Eye, Undo2, Redo2, Replace, Sigma } from 'lucide-react';
import {
  Row, CFRule, SortKey, CF_COLORS, CF_OPS, matchCFRule,
  exportData, computeSummary, findMatches, replaceAll, multiSort, parseJSON,
  type FindOptions, type ColumnSummary, type ExportFormat,
} from '@/utils/tableLensUtils';
import { useHistory } from '@/utils/tableLensHistory';

const ROW_H = 33;
const OVERSCAN = 25;

function useDebounce<T>(value: T, ms: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return dv;
}

// ── FilterCell ───────────────────────────────────────────────────
interface FilterCellProps {
  value: string;
  onChange: (v: string) => void;
  getOptions: () => string[];
  active: boolean;
}

const PAGE = 60;

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
    setOptions(getOptions());
    setPage(1);
    setOpen(true);
  };

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
            aria-label="Clear"
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

// ── Props ────────────────────────────────────────────────────────
export interface TableLensProps {
  /** When provided, file picker is hidden and data comes from parent */
  externalData?: { columns: string[]; rows: Row[]; fileName?: string };
  /** Called when data changes in external mode */
  onDataChange?: (rows: Row[]) => void;
}

// ── Main component ───────────────────────────────────────────────
const TableLens: React.FC<TableLensProps> = ({ externalData, onDataChange }) => {
  const [rawData, setRawData] = useState<Row[]>([]);
  const [data, setData] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

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

  // Multi-column sort (P1)
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);

  // Column reorder (drag)
  const [colOrder, setColOrder] = useState<string[]>([]);
  const dragColRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const [colMenuCol, setColMenuCol] = useState<string | null>(null);
  const [colMenuRect, setColMenuRect] = useState<DOMRect | null>(null);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const [cfRules, setCFRules] = useState<CFRule[]>([]);
  const [showCFPanel, setShowCFPanel] = useState(false);
  const [wrapText, setWrapText] = useState(false);
  const [hiddenRows, setHiddenRows] = useState<Set<number>>(new Set());
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [frozenCols, setFrozenCols] = useState<Set<string>>(new Set());
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

  // Global search (P0)
  const [globalSearch, setGlobalSearch] = useState('');
  const debouncedGlobalSearch = useDebounce(globalSearch, 300);

  // Find & Replace (P0)
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIsRegex, setFindIsRegex] = useState(false);
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findColumnScope, setFindColumnScope] = useState('');
  const [replaceValue, setReplaceValue] = useState('');

  // Export format
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');

  // Summary footer (P0)
  const [showSummary, setShowSummary] = useState(false);

  // Undo/Redo (P1)
  const history = useHistory(50);

  const hasData = data.length > 0;

  // ── Tracked data setter (pushes to undo history) ───────────────
  const dataRef = useRef(data);
  dataRef.current = data;

  const setDataWithHistory = useCallback((updater: (prev: Row[]) => Row[], label: string) => {
    const next = updater(dataRef.current);
    history.push(next, label);
    setData(next);
    onDataChange?.(next);
  }, [history, onDataChange]);

  // Track container height for virtual scroll
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  // Reset scroll when filters or sort change
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [debouncedFilters, sortKeys, debouncedGlobalSearch]);

  // Filtered rows — column filters + global search + hidden rows
  const filteredRows = useMemo(() => {
    const gq = debouncedGlobalSearch.toLowerCase();
    return data
      .map((row, idx) => ({ idx, row }))
      .filter(({ row, idx }: { row: Row; idx: number }) =>
        !hiddenRows.has(idx) &&
        columns.every((col: string) => {
          const f = (debouncedFilters[col] || '').toLowerCase();
          return !f || String(row[col] ?? '').toLowerCase().includes(f);
        }) &&
        (!gq || columns.some((col: string) => String(row[col] ?? '').toLowerCase().includes(gq)))
      );
  }, [data, debouncedFilters, columns, hiddenRows, debouncedGlobalSearch]);

  const orderedColumns = useMemo(() => {
    if (colOrder.length === 0) return columns;
    const colSet = new Set(columns);
    return colOrder.filter((c: string) => colSet.has(c));
  }, [columns, colOrder]);

  const visibleColumns = useMemo(() => [
    ...orderedColumns.filter((c: string) => frozenCols.has(c) && !hiddenCols.has(c)),
    ...orderedColumns.filter((c: string) => !frozenCols.has(c) && !hiddenCols.has(c)),
  ], [orderedColumns, frozenCols, hiddenCols]);

  const frozenLeftOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let left = 36 + 40;
    for (const col of visibleColumns) {
      if (!frozenCols.has(col)) break;
      offsets[col] = left;
      left += colWidths[col] ?? 140;
    }
    return offsets;
  }, [visibleColumns, frozenCols, colWidths]);

  // Multi-column sort
  const sortedRows = useMemo(
    () => multiSort(filteredRows, sortKeys),
    [filteredRows, sortKeys],
  );

  const handleSort = useCallback((col: string, additive: boolean) => {
    setSortKeys(prev => {
      const existing = prev.findIndex(k => k.col === col);
      if (additive) {
        // Shift+click: add or toggle
        if (existing >= 0) {
          const next = [...prev];
          if (next[existing].dir === 'asc') {
            next[existing] = { col, dir: 'desc' };
          } else {
            next.splice(existing, 1); // remove on third click
          }
          return next;
        }
        if (prev.length >= 3) return prev; // max 3
        return [...prev, { col, dir: 'asc' }];
      }
      // Plain click: single sort cycle
      if (existing >= 0 && prev.length === 1) {
        if (prev[0].dir === 'asc') return [{ col, dir: 'desc' }];
        return []; // clear
      }
      return [{ col, dir: 'asc' }];
    });
  }, []);

  // Virtual scroll window
  const startIdx = wrapText ? 0 : Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const endIdx = wrapText ? sortedRows.length : Math.min(sortedRows.length, Math.ceil((scrollTop + containerH) / ROW_H) + OVERSCAN);
  const visibleRows = sortedRows.slice(startIdx, endIdx);
  const padTop = wrapText ? 0 : startIdx * ROW_H;
  const padBot = wrapText ? 0 : Math.max(0, (sortedRows.length - endIdx) * ROW_H);

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

  // Find & Replace — match set
  const findOpts: FindOptions = useMemo(() => ({
    isRegex: findIsRegex,
    caseSensitive: findCaseSensitive,
    columnScope: findColumnScope || undefined,
  }), [findIsRegex, findCaseSensitive, findColumnScope]);

  const findMatchSet = useMemo(
    () => showFindReplace ? findMatches(data, columns, findQuery, findOpts) : new Set<string>(),
    [showFindReplace, data, columns, findQuery, findOpts],
  );

  // Summary footer
  const summaryData = useMemo<Record<string, ColumnSummary>>(() => {
    if (!showSummary) return {};
    const rows = sortedRows.map(r => r.row);
    const result: Record<string, ColumnSummary> = {};
    for (const col of visibleColumns) {
      result[col] = computeSummary(col, rows);
    }
    return result;
  }, [showSummary, sortedRows, visibleColumns]);

  const startResize = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: colWidths[col] ?? 140 };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const { col: resizeCol, startW, startX } = resizeRef.current;
      const newW = Math.max(60, startW + ev.clientX - startX);
      setColWidths((prev: Record<string, number>) => ({ ...prev, [resizeCol]: newW }));
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const loadParsed = useCallback((cols: string[], rows: Row[], name: string) => {
    setColumns(cols);
    setRawData(rows.map(r => ({ ...r })));
    const dataCopy = rows.map(r => ({ ...r }));
    setData(dataCopy);
    history.init(dataCopy);
    setFilterInputs({});
    setSelected(new Set());
    setEditCell(null);
    setDistinctCol('');
    setBatchCol(cols[0] || '');
    setFileName(name);
    setColWidths({});
    setCFRules([]);
    setHiddenRows(new Set());
    setHiddenCols(new Set());
    setFrozenCols(new Set());
    setScrollTop(0);
    setSortKeys([]);
    setColOrder([]);
    setGlobalSearch('');
    setShowFindReplace(false);
    setShowSummary(false);
  }, [history]);

  // External data support
  useEffect(() => {
    if (!externalData) return;
    loadParsed(externalData.columns, externalData.rows, externalData.fileName || 'external');
  }, [externalData, loadParsed]);

  const loadFile = useCallback(async (file: File) => {
    setLoading(true);
    const name = file.name;
    await new Promise(r => setTimeout(r, 30));
    try {
      if (/\.json$/i.test(name)) {
        setLoadMsg('Parsing JSON...');
        const text = await file.text();
        const result = parseJSON(text);
        if (!result || result.columns.length === 0) return;
        setLoadMsg(`Loading ${result.rows.length.toLocaleString()} rows...`);
        await new Promise(r => setTimeout(r, 16));
        loadParsed(result.columns, result.rows, name);
      } else if (/\.(xlsx|xls)$/i.test(name)) {
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
        const isTSV = /\.(tsv|tab)$/i.test(name);
        setLoadMsg(isTSV ? 'Parsing TSV...' : 'Parsing CSV...');
        const Papa = await import('papaparse');
        await new Promise<void>(resolve => {
          Papa.default.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: false,
            delimiter: isTSV ? '\t' : undefined,
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
    setDataWithHistory(
      prev => prev.map((r, i) => i === editCell.row ? { ...r, [editCell.col]: editVal } : r),
      `Edit cell [${editCell.row},${editCell.col}]`,
    );
    setEditCell(null);
  }, [editCell, editVal, setDataWithHistory]);

  const applyBatch = useCallback(() => {
    if (!batchCol || selected.size === 0) return;
    setDataWithHistory(
      prev => prev.map((r, i) => selected.has(i) ? { ...r, [batchCol]: batchVal } : r),
      `Batch edit ${selected.size} rows`,
    );
  }, [batchCol, batchVal, selected, setDataWithHistory]);

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

  const deleteSelectedRows = useCallback(() => {
    setDataWithHistory(
      (prev: Row[]) => prev.filter((_r: Row, i: number) => !selected.has(i)),
      `Delete ${selected.size} rows`,
    );
    setRawData((prev: Row[]) => prev.filter((_r: Row, i: number) => !selected.has(i)));
    setSelected(new Set());
  }, [selected, setDataWithHistory]);

  const duplicateSelectedRows = useCallback(() => {
    const sortedIdx = Array.from(selected as Set<number>).sort((a: number, b: number) => a - b);
    const insertAt = sortedIdx[sortedIdx.length - 1] + 1;
    setDataWithHistory((prev: Row[]) => {
      const next = [...prev];
      next.splice(insertAt, 0, ...sortedIdx.map((i: number) => ({ ...prev[i] })));
      return next;
    }, `Duplicate ${selected.size} rows`);
    setRawData((prev: Row[]) => {
      const next = [...prev];
      next.splice(insertAt, 0, ...sortedIdx.map((i: number) => ({ ...prev[i] })));
      return next;
    });
    setSelected(new Set());
  }, [selected, setDataWithHistory]);

  const deleteColumn = useCallback((col: string) => {
    const omitCol = (r: Row): Row => Object.fromEntries(Object.entries(r).filter(([k]) => k !== col)) as Row;
    setColumns((prev: string[]) => prev.filter((c: string) => c !== col));
    setDataWithHistory((prev: Row[]) => prev.map(omitCol), `Delete column "${col}"`);
    setRawData((prev: Row[]) => prev.map(omitCol));
    setColWidths((prev: Record<string, number>) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== col)));
    setFilterInputs((prev: Record<string, string>) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== col)));
    setColMenuCol(null);
  }, [setDataWithHistory]);

  const duplicateColumn = useCallback((col: string) => {
    const newCol = `${col}_copy`;
    setColumns((prev: string[]) => {
      const idx = prev.indexOf(col);
      const next = [...prev];
      next.splice(idx + 1, 0, newCol);
      return next;
    });
    setDataWithHistory((prev: Row[]) => prev.map((r: Row) => ({ ...r, [newCol]: r[col] })), `Duplicate column "${col}"`);
    setRawData((prev: Row[]) => prev.map((r: Row) => ({ ...r, [newCol]: r[col] })));
    setColMenuCol(null);
  }, [setDataWithHistory]);

  useEffect(() => {
    if (!colMenuCol) return;
    const close = (e: MouseEvent) => {
      if (!colMenuRef.current?.contains(e.target as Node)) setColMenuCol(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [colMenuCol]);

  const hideSelectedRows = useCallback(() => {
    setHiddenRows((prev: Set<number>) => new Set([...Array.from(prev as Set<number>), ...Array.from(selected as Set<number>)]));
    setSelected(new Set());
  }, [selected]);

  const showAllHiddenRows = useCallback(() => setHiddenRows(new Set()), []);

  const hideColumn = useCallback((col: string) => {
    setHiddenCols((prev: Set<string>) => new Set([...Array.from(prev as Set<string>), col]));
    setColMenuCol(null);
  }, []);

  const showAllHiddenCols = useCallback(() => setHiddenCols(new Set()), []);

  const toggleFreezeColumn = useCallback((col: string) => {
    setFrozenCols((prev: Set<string>) => {
      const next = new Set(prev as Set<string>);
      if (next.has(col)) { next.delete(col); } else { next.add(col); }
      return next;
    });
    setColMenuCol(null);
  }, []);

  const addCFRule = useCallback(() => {
    setCFRules((prev: CFRule[]) => [
      ...prev,
      { id: String(Date.now()), col: columns[0] || '', op: 'contains', value: '', color: CF_COLORS[0].cell },
    ]);
  }, [columns]);

  const updateCFRule = useCallback((idx: number, key: keyof CFRule, val: string) => {
    setCFRules((prev: CFRule[]) => prev.map((r: CFRule, i: number) => i === idx ? { ...r, [key]: val } : r));
  }, []);

  const removeCFRule = useCallback((idx: number) => {
    setCFRules((prev: CFRule[]) => prev.filter((_: CFRule, i: number) => i !== idx));
  }, []);

  // Find & Replace actions
  const handleReplaceAll = useCallback(() => {
    if (!findQuery) return;
    const newData = replaceAll(data, columns, findQuery, replaceValue, findOpts);
    if (newData !== data) {
      history.push(data, `Replace all "${findQuery}" → "${replaceValue}"`);
      setData(newData);
      onDataChange?.(newData);
    }
  }, [data, columns, findQuery, replaceValue, findOpts, history, onDataChange]);

  // Undo/Redo
  const handleUndo = useCallback(() => {
    const prev = history.undo();
    if (prev) { setData(prev); onDataChange?.(prev); }
  }, [history, onDataChange]);

  const handleRedo = useCallback(() => {
    const next = history.redo();
    if (next) { setData(next); onDataChange?.(next); }
  }, [history, onDataChange]);

  // Keyboard shortcuts: Ctrl+Z, Ctrl+Y, Ctrl+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
      if (mod && e.key === 'f') { e.preventDefault(); setGlobalSearchFocused(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const [globalSearchFocused, setGlobalSearchFocused] = useState(false);
  const globalSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (globalSearchFocused && globalSearchRef.current) {
      globalSearchRef.current.focus();
      setGlobalSearchFocused(false);
    }
  }, [globalSearchFocused]);

  const baseName = fileName.replace(/\.[^.]+$/, '') || 'export';
  const activeFilters = columns.filter(c => filterInputs[c]);

  // ── Drop zone (no data loaded yet) ────────────────────────────
  if (!hasData && !externalData) {
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
                {['CSV', 'TSV', 'JSON', 'XLSX'].map(f => (
                  <span key={f} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs font-bold text-slate-500 dark:text-slate-400">{f}</span>
                ))}
              </div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.tab,.json,.xlsx,.xls" className="hidden"
          onChange={e => { e.target.files?.[0] && loadFile(e.target.files[0]); e.target.value = ''; }}
        />
      </div>
    );
  }

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(r => selected.has(r.idx));

  // Sort key helper for header badges
  const getSortKeyIndex = (col: string) => sortKeys.findIndex(k => k.col === col);

  // ── Main table view ────────────────────────────────────────────
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
          {hiddenRows.size > 0 && (
            <>
              <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full shrink-0">
                {hiddenRows.size} hidden row{hiddenRows.size > 1 ? 's' : ''}
              </span>
              <button onClick={showAllHiddenRows} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer shrink-0">
                <Eye size={11} /> Show
              </button>
            </>
          )}
          {hiddenCols.size > 0 && (
            <>
              <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full shrink-0">
                {hiddenCols.size} hidden col{hiddenCols.size > 1 ? 's' : ''}
              </span>
              <button onClick={showAllHiddenCols} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer shrink-0">
                <Eye size={11} /> Show
              </button>
            </>
          )}
          {sortKeys.length > 0 && (
            <button
              onClick={() => setSortKeys([])}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer shrink-0"
            >
              <X size={11} /> Clear {sortKeys.length} sort{sortKeys.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Global search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={globalSearchRef}
              type="text"
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setGlobalSearch('')}
              placeholder="Search all..."
              className="pl-7 pr-7 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-40 focus:outline-none focus:border-blue-400 focus:w-56 transition-all"
            />
            {globalSearch && (
              <button onClick={() => setGlobalSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X size={10} />
              </button>
            )}
          </div>
          {/* Undo / Redo */}
          <button
            onClick={handleUndo}
            disabled={!history.canUndo}
            title={history.canUndo ? `Undo: ${history.undoLabel}` : 'Nothing to undo'}
            aria-label={history.canUndo ? `Undo: ${history.undoLabel}` : 'Nothing to undo'}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              history.canUndo
                ? 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                : 'border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed'
            }`}
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!history.canRedo}
            title={history.canRedo ? `Redo: ${history.redoLabel}` : 'Nothing to redo'}
            aria-label={history.canRedo ? `Redo: ${history.redoLabel}` : 'Nothing to redo'}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              history.canRedo
                ? 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                : 'border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed'
            }`}
          >
            <Redo2 size={14} />
          </button>
          {/* Find & Replace toggle */}
          <button
            onClick={() => setShowFindReplace(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg transition-all cursor-pointer ${
              showFindReplace
                ? 'border-orange-300 dark:border-orange-600 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Replace size={12} /> Find
          </button>
          {/* Summary toggle */}
          <button
            onClick={() => setShowSummary(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg transition-all cursor-pointer ${
              showSummary
                ? 'border-emerald-300 dark:border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Sigma size={12} /> Summary
          </button>
          <button
            onClick={() => setWrapText((w: boolean) => !w)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg transition-all cursor-pointer ${
              wrapText
                ? 'border-teal-300 dark:border-teal-600 text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <WrapText size={12} /> Wrap
          </button>
          <button
            onClick={() => setShowCFPanel((p: boolean) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg transition-all cursor-pointer ${
              showCFPanel || cfRules.length > 0
                ? 'border-purple-300 dark:border-purple-600 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Paintbrush size={12} /> Format{cfRules.length > 0 ? ` (${cfRules.length})` : ''}
          </button>
          <button
            onClick={() => { setData([]); setColumns([]); setRawData([]); setFileName(''); setFilterInputs({}); setSelected(new Set()); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <Trash2 size={12} /> Clear
          </button>
          <select
            value={exportFormat}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExportFormat(e.target.value as ExportFormat)}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold cursor-pointer"
          >
            <option value="csv">CSV</option>
            <option value="tsv">TSV</option>
            <option value="json">JSON</option>
          </select>
          <button
            onClick={() => exportData(orderedColumns, data, baseName, '_all', exportFormat)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all cursor-pointer"
          >
            <Download size={12} /> Export All
          </button>
          <button
            onClick={() => exportData(orderedColumns, filteredRows.map((r: { row: Row }) => r.row), baseName, '_filtered', exportFormat)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all cursor-pointer"
          >
            <Download size={12} /> Export Filtered
          </button>
          <button
            onClick={() => exportData(orderedColumns, data.filter((_: Row, i: number) => modifiedSet.has(i)), baseName, '_changes', exportFormat)}
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

      {/* Find & Replace Panel */}
      {showFindReplace && (
        <div className="shrink-0 flex items-center gap-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl px-4 py-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            <input
              value={findQuery}
              onChange={e => setFindQuery(e.target.value)}
              placeholder="Find..."
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-40 focus:outline-none focus:border-orange-400"
            />
            <input
              value={replaceValue}
              onChange={e => setReplaceValue(e.target.value)}
              placeholder="Replace with..."
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-40 focus:outline-none focus:border-orange-400"
            />
            <select
              value={findColumnScope}
              onChange={e => setFindColumnScope(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <option value="">All columns</option>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => setFindIsRegex(p => !p)}
              className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                findIsRegex ? 'border-orange-400 text-orange-600 bg-orange-100 dark:bg-orange-500/20 dark:text-orange-400' : 'border-slate-200 dark:border-slate-700 text-slate-400'
              }`}
            >
              .*
            </button>
            <button
              onClick={() => setFindCaseSensitive(p => !p)}
              className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                findCaseSensitive ? 'border-orange-400 text-orange-600 bg-orange-100 dark:bg-orange-500/20 dark:text-orange-400' : 'border-slate-200 dark:border-slate-700 text-slate-400'
              }`}
            >
              Aa
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
              {findMatchSet.size} match{findMatchSet.size !== 1 ? 'es' : ''}
            </span>
            <button
              onClick={handleReplaceAll}
              disabled={findMatchSet.size === 0}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                findMatchSet.size > 0
                  ? 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              Replace All
            </button>
            <button onClick={() => setShowFindReplace(false)} aria-label="Close find and replace" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

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
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
            <button onClick={duplicateSelectedRows} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1.5 cursor-pointer transition-colors">
              <Copy size={12} /> Duplicate
            </button>
            <button onClick={hideSelectedRows} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-500 dark:hover:text-slate-400 px-2 py-1.5 cursor-pointer transition-colors">
              <EyeOff size={12} /> Hide
            </button>
            <button onClick={deleteSelectedRows} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 px-2 py-1.5 cursor-pointer transition-colors">
              <Trash2 size={12} /> Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1.5 cursor-pointer transition-colors">
              Deselect
            </button>
          </div>
        </div>
      )}

      {/* Conditional Formatting Panel */}
      {showCFPanel && (
        <div className="shrink-0 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-500/30 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-purple-500 dark:text-purple-400 uppercase tracking-[0.15em]">Conditional Formatting</span>
            <button onClick={addCFRule} className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 cursor-pointer transition-colors">+ Add rule</button>
          </div>
          {cfRules.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-1">No rules yet — click "+ Add rule" to highlight cells.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {cfRules.map((rule: CFRule, i: number) => (
                <div key={rule.id} className="flex items-center gap-2 flex-wrap">
                  <select value={rule.col} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateCFRule(i, 'col', e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer">
                    {columns.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={rule.op} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateCFRule(i, 'op', e.target.value)}
                    className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer">
                    {CF_OPS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                  </select>
                  {!['is_empty', 'is_not_empty'].includes(rule.op) && (
                    <input value={rule.value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCFRule(i, 'value', e.target.value)}
                      placeholder="value..."
                      className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-28 focus:outline-none focus:border-purple-400" />
                  )}
                  <div className="flex items-center gap-1">
                    {CF_COLORS.map(c => (
                      <button key={c.label} title={c.label} aria-label={c.label} onClick={() => updateCFRule(i, 'color', c.cell)}
                        style={{ backgroundColor: c.swatch, outline: rule.color === c.cell ? `2px solid ${c.swatch}` : undefined, outlineOffset: '2px' }}
                        className="w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-110" />
                    ))}
                  </div>
                  <button onClick={() => removeCFRule(i)} aria-label="Remove rule" className="text-slate-300 dark:text-slate-600 hover:text-red-400 cursor-pointer transition-colors ml-1">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
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

          {/* Single scroll container */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto"
            onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          >
            <table className="text-xs border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-50 dark:bg-slate-800">
                  <th className="w-9 px-3 py-2 border-r border-b border-slate-200 dark:border-slate-700 sticky left-0 z-20 bg-slate-50 dark:bg-slate-800">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="cursor-pointer accent-blue-600" />
                  </th>
                  <th className="w-10 px-3 py-2 text-slate-400 dark:text-slate-500 font-bold text-right border-r border-b border-slate-200 dark:border-slate-700 sticky left-9 z-20 bg-slate-50 dark:bg-slate-800">#</th>
                  {visibleColumns.map((col: string) => {
                    const w = colWidths[col] ?? 140;
                    const isFrozen = frozenCols.has(col);
                    const sortIdx = getSortKeyIndex(col);
                    const sortKey = sortIdx >= 0 ? sortKeys[sortIdx] : null;
                    return (
                      <th
                        key={col}
                        draggable
                        onDragStart={(e: React.DragEvent) => { dragColRef.current = col; e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCol !== col) setDragOverCol(col); }}
                        onDragLeave={() => { if (dragOverCol === col) setDragOverCol(null); }}
                        onDrop={(e: React.DragEvent) => {
                          e.preventDefault();
                          setDragOverCol(null);
                          const from = dragColRef.current;
                          if (!from || from === col) return;
                          setColOrder(prev => {
                            const base = prev.length > 0 ? prev : columns;
                            const next = base.filter((c: string) => c !== from);
                            const toIdx = next.indexOf(col);
                            next.splice(toIdx, 0, from);
                            return next;
                          });
                          dragColRef.current = null;
                        }}
                        onDragEnd={() => { dragColRef.current = null; setDragOverCol(null); }}
                        style={{ width: w, minWidth: w, maxWidth: w, ...(isFrozen ? { position: 'sticky' as const, left: frozenLeftOffsets[col], zIndex: 21 } : {}) }}
                        className={`relative px-3 py-2 text-left border-r border-b border-slate-200 dark:border-slate-700 last:border-r-0 ${isFrozen ? 'bg-slate-100 dark:bg-slate-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : 'bg-slate-50 dark:bg-slate-800'} ${dragOverCol === col ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                      >
                        <div className="flex items-center gap-0.5 mb-1.5">
                          <button
                            onClick={e => handleSort(col, e.shiftKey)}
                            className="flex items-center gap-1 group flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <span title={col} className={`font-black text-[11px] uppercase tracking-wide truncate ${sortKey ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-slate-100'}`}>{col}</span>
                            <span className={`shrink-0 flex items-center gap-0.5 ${sortKey ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}`}>
                              {sortKey
                                ? <>
                                    {sortKey.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                                    {sortKeys.length > 1 && <span className="text-[9px] font-black">{sortIdx + 1}</span>}
                                  </>
                                : <ArrowUpDown size={11} />}
                            </span>
                          </button>
                          <button
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setColMenuCol(col); setColMenuRect(e.currentTarget.getBoundingClientRect()); }}
                            aria-label="Column options"
                            className="shrink-0 p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          >
                            <MoreHorizontal size={11} />
                          </button>
                        </div>
                        <FilterCell
                          value={filterInputs[col] || ''}
                          onChange={(v: string) => setFilterInputs((prev: Record<string, string>) => ({ ...prev, [col]: v }))}
                          getOptions={() => Array.from<string>(new Set(data.map((r: Row) => String(r[col] ?? '')))).sort()}
                          active={!!(debouncedFilters[col])}
                        />
                        <div
                          onMouseDown={(e: React.MouseEvent) => startResize(col, e)}
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors"
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
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
                      style={wrapText ? undefined : { height: ROW_H }}
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
                      {visibleColumns.map((col: string) => {
                        const isEditing = editCell?.row === idx && editCell?.col === col;
                        const cellModified = isModified && row[col] !== rawData[idx]?.[col];
                        const cfColor = !isSelected && cfRules.length > 0
                          ? cfRules.find((r: CFRule) => r.col === col && matchCFRule(String(row[col] ?? ''), r.op, r.value))?.color
                          : undefined;
                        const isFrozen = frozenCols.has(col);
                        const frozenBg = isFrozen ? (isSelected ? 'bg-blue-50 dark:bg-slate-800' : isModified ? 'bg-amber-50 dark:bg-slate-800' : displayIdx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800' : 'bg-slate-100 dark:bg-slate-800') : '';
                        const isFindMatch = findMatchSet.has(`${idx}:${col}`);
                        return (
                          <td
                            key={col}
                            onClick={() => { setEditCell({ row: idx, col }); setEditVal(row[col] ?? ''); }}
                            style={{
                              width: colWidths[col] ?? 140, minWidth: colWidths[col] ?? 140, maxWidth: colWidths[col] ?? 140,
                              backgroundColor: isFindMatch ? 'rgba(251,191,36,0.25)' : cfColor,
                              ...(isFrozen ? { position: 'sticky' as const, left: frozenLeftOffsets[col] } : {}),
                            }}
                            className={`px-3 border-r border-slate-100 dark:border-slate-800 last:border-r-0 cursor-pointer ${wrapText ? '' : 'overflow-hidden'} ${isFrozen ? `z-10 ${frozenBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]` : ''} ${
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
                              <span title={wrapText ? undefined : String(row[col] ?? '')} className={wrapText ? 'block whitespace-pre-wrap break-words' : 'truncate block'}>{String(row[col] ?? '')}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {padBot > 0 && <tr style={{ height: padBot }}><td colSpan={columns.length + 2} /></tr>}
              </tbody>
              {/* Summary footer — inside same table so it scrolls horizontally together */}
              {showSummary && Object.keys(summaryData).length > 0 && (
                <tfoot className="sticky bottom-0 z-10">
                  <tr className="bg-emerald-50 dark:bg-emerald-500/10 border-t-2 border-emerald-300 dark:border-emerald-500/30 text-[10px]">
                    <td className="w-9 px-3 py-1.5 border-r border-emerald-200/50 dark:border-emerald-500/20 sticky left-0 z-10 bg-emerald-50 dark:bg-emerald-500/10" />
                    <td className="w-10 px-3 py-1.5 text-right border-r border-emerald-200/50 dark:border-emerald-500/20 font-black text-emerald-500 dark:text-emerald-400 sticky left-9 z-10 bg-emerald-50 dark:bg-emerald-500/10">
                      <Sigma size={10} />
                    </td>
                    {visibleColumns.map((col: string) => {
                      const s = summaryData[col];
                      const w = colWidths[col] ?? 140;
                      if (!s) return <td key={col} className="px-3 py-1.5 border-r border-emerald-200/50 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10" style={{ width: w, minWidth: w, maxWidth: w }} />;
                      return (
                        <td key={col} className="px-3 py-1.5 border-r border-emerald-200/50 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10" style={{ width: w, minWidth: w, maxWidth: w }}>
                          {s.isNumeric ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              <span title="Count" className="font-bold text-slate-500 dark:text-slate-400">{s.count}</span>
                              {s.sum !== null && <span title="Sum" className="ml-1">Σ{s.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
                              {s.avg !== null && <span title="Average" className="ml-1">μ{s.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
                            </span>
                          ) : (
                            <span className="font-bold text-slate-400 dark:text-slate-500">{s.count}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
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

      {/* Column context menu portal */}
      {colMenuCol && colMenuRect && createPortal(
        <div
          ref={colMenuRef}
          style={{ position: 'fixed', top: colMenuRect.bottom + 4, left: colMenuRect.left, zIndex: 9999 }}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 min-w-[160px]"
        >
          <button
            onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); toggleFreezeColumn(colMenuCol as string); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            {frozenCols.has(colMenuCol as string) ? <PinOff size={12} /> : <Pin size={12} />}
            {frozenCols.has(colMenuCol as string) ? 'Unfreeze column' : 'Freeze column'}
          </button>
          <button
            onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); hideColumn(colMenuCol as string); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            <EyeOff size={12} /> Hide column
          </button>
          <button
            onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); duplicateColumn(colMenuCol); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            <Copy size={12} /> Duplicate column
          </button>
          <div className="mx-3 my-1 border-t border-slate-100 dark:border-slate-700" />
          <button
            onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); deleteColumn(colMenuCol); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer transition-colors"
          >
            <Trash2 size={12} /> Delete column
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TableLens;
