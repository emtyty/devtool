import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Trash2, Download, Search, ChevronDown, X, Loader2, ArrowUp, ArrowDown, ArrowUpDown, Copy, MoreHorizontal, Paintbrush, WrapText, Pin, PinOff, EyeOff, Eye, Undo2, Redo2, Replace, Sigma, Plus, Pencil, ArrowLeftToLine, ArrowRightToLine, ClipboardPaste, Save } from 'lucide-react';
import TableLensCellEditor, { type CommitMove } from './TableLensCellEditor';
import TableLensFillOptions from './TableLensFillOptions';
import TableLensPasteDialog, { type PasteDialogResult } from './TableLensPasteDialog';
import {
  Row, CFRule, SortKey, CF_COLORS, CF_OPS, matchCFRule,
  exportData, computeSummary, findMatches, replaceAll, multiSort, parseJSON,
  fillColumn, setColumnValues, fillRangePositions, moveCell,
  type FindOptions, type ColumnSummary, type ExportFormat,
} from '@/utils/tableLensUtils';
import {
  buildFillValues, canFillSeries, fillValueAt, isDayFirstLocale, resolveFillMode,
  type FillDirection, type FillMode,
} from '@/utils/tableLensFill';
import {
  validateColumnName, nextColumnName, dedupeColumnName, renameColumn, renameRecordKey, insertColumn,
  removeColumn, insertNextTo, orderColumns, removeRows, duplicateRows, selectRange,
  type TableSnapshot, type InsertSide,
} from '@/utils/tableLensColumns';
import { parseClipboardGrid, planPaste, applyPaste, toClipboardCell } from '@/utils/tableLensPaste';
import { getSaveFormat, getSaveWarning, serializeTable, SAVE_MIME, type SaveFormat, type SaveSource } from '@/utils/tableLensSave';
import { useHistory } from '@/utils/tableLensHistory';

const ROW_H = 33;
const OVERSCAN = 25;
/** Width of the sticky checkbox + row-number columns */
const ROW_GUTTER_W = 36 + 40;
const EDGE_SCROLL_ZONE = 32;
const KEY_MOVES: Record<string, [number, number]> = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
};

/** A cell addressed by its index in `data` (stable across sort/filter) and column name */
type CellRef = { row: number; col: string };

/** Ambiguous slash dates (3/4/2024) follow the browser locale, as Excel does */
const FILL_OPTS = { dayFirst: isDayFirstLocale() };

/** The fill just applied — kept so Auto Fill Options can redo it in the other mode */
interface LastFill {
  col: string;
  targets: number[];
  direction: FillDirection;
  sourceValue: string;
  mode: FillMode;
  before: Row[];
  anchor: DOMRect;
}

const fillLabel = (mode: FillMode, count: number, col: string) =>
  mode === 'series' ? `Fill series (${count} cells) in "${col}"` : `Fill ${count} cells in "${col}"`;

/** Short message shown in the table footer (save results, paste summaries, validation errors) */
type Notice = { text: string; tone: 'info' | 'error' };
const NOTICE_MS = 6000;

// ── File System Access API (Chrome/Edge) — lets Save write back to the opened file ──
// Not in TypeScript's DOM lib yet, so declare the small part we use.
interface FsWritable { write(data: Blob): Promise<void>; close(): Promise<void> }
interface FsFileHandle { kind: 'file'; name: string; getFile(): Promise<File>; createWritable(): Promise<FsWritable> }
interface FsPickerType { description: string; accept: Record<string, string[]> }
type FsWindow = Window & {
  showOpenFilePicker?: (opts: { types: FsPickerType[]; multiple?: boolean }) => Promise<FsFileHandle[]>;
  showSaveFilePicker?: (opts: { suggestedName: string; types: FsPickerType[] }) => Promise<FsFileHandle>;
};
const fsWindow = window as FsWindow;

const OPEN_TYPES: FsPickerType[] = [{
  description: 'Tables',
  accept: {
    'text/csv': ['.csv'],
    'text/tab-separated-values': ['.tsv', '.tab'],
    'application/json': ['.json'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-excel': ['.xls'],
  },
}];

const SAVE_EXT: Record<SaveFormat, string[]> = {
  csv: ['.csv'], tsv: ['.tsv', '.tab'], json: ['.json'], xlsx: ['.xlsx'], xls: ['.xls'],
};

const isAbortError = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Open a table file through the browser picker, keeping its handle for Save. Null when cancelled. */
async function pickTableFile(): Promise<{ file: File; handle: FsFileHandle } | null> {
  if (!fsWindow.showOpenFilePicker) return null;
  try {
    const [handle] = await fsWindow.showOpenFilePicker({ types: OPEN_TYPES, multiple: false });
    return { file: await handle.getFile(), handle };
  } catch (e) {
    if (isAbortError(e)) return null;
    throw e;
  }
}

/** Ask where to save (Chrome/Edge). Null when the API is missing or the user cancels. */
async function pickSaveTarget(suggestedName: string, format: SaveFormat): Promise<FsFileHandle | null> {
  if (!fsWindow.showSaveFilePicker) return null;
  try {
    return await fsWindow.showSaveFilePicker({
      suggestedName,
      types: [{ description: format.toUpperCase(), accept: { [SAVE_MIME[format]]: SAVE_EXT[format] } }],
    });
  } catch (e) {
    if (isAbortError(e)) return null;
    throw e;
  }
}

async function writeToHandle(handle: FsFileHandle, blob: Blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File handle of a dropped file (Chrome/Edge), so dropped files can be saved in place too */
function getDroppedHandle(e: React.DragEvent): Promise<FsFileHandle | null> {
  const item = e.dataTransfer.items?.[0] as (DataTransferItem & { getAsFileSystemHandle?: () => Promise<FsFileHandle | null> }) | undefined;
  if (!item?.getAsFileSystemHandle) return Promise.resolve(null);
  // Must be requested synchronously inside the drop event
  return item.getAsFileSystemHandle().then(h => (h?.kind === 'file' ? h : null), () => null);
}

const isEditableTarget = (target: EventTarget | null) =>
  !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

// ── HeaderNameInput — inline column rename ───────────────────────
interface HeaderNameInputProps {
  initial: string;
  /** Returns false when the name is rejected (editing stays open) */
  onCommit: (value: string) => boolean;
  onCancel: () => void;
}

const HeaderNameInput: React.FC<HeaderNameInputProps> = ({ initial, onCommit, onCancel }) => {
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const doneRef = useRef(false);

  const commit = () => {
    if (doneRef.current) return true;
    const ok = onCommit(value);
    doneRef.current = ok;
    setInvalid(!ok);
    return ok;
  };

  return (
    <input
      autoFocus
      value={value}
      onFocus={e => e.target.select()}
      onChange={e => { setValue(e.target.value); setInvalid(false); }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { doneRef.current = true; onCancel(); }
      }}
      // Leaving with an invalid name abandons the rename rather than trapping focus
      onBlur={() => { if (!commit()) { doneRef.current = true; onCancel(); } }}
      onClick={e => e.stopPropagation()}
      aria-label="Column name"
      aria-invalid={invalid}
      className={`flex-1 min-w-0 font-bold text-[11px] bg-white dark:bg-slate-900 border rounded px-1.5 py-0.5 outline-none text-slate-700 dark:text-slate-200 ${
        invalid ? 'border-red-400' : 'border-blue-400'
      }`}
    />
  );
};

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
const EMPTY_FILTER = '\0__EMPTY__';

const FilterCell: React.FC<FilterCellProps> = ({ value, onChange, getOptions, active }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (value === EMPTY_FILTER) return options;
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
          value={value === EMPTY_FILTER ? '(empty)' : value}
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
          {visible.map((v: string) => {
            const isEmptyOpt = v === '';
            const selected = isEmptyOpt ? value === EMPTY_FILTER : value === v;
            const next = isEmptyOpt
              ? (value === EMPTY_FILTER ? '' : EMPTY_FILTER)
              : (value === v ? '' : v);
            return (
              <button
                key={v}
                onMouseDown={e => { e.preventDefault(); onChange(next); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer truncate transition-colors ${
                  selected
                    ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
                title={v}
              >
                {isEmptyOpt ? <span className="italic text-slate-400 dark:text-slate-500">(empty)</span> : v}
              </button>
            );
          })}
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

// ── Grid DOM helpers (cell selection, fill handle) ──────────────
function findCellEl(container: HTMLElement, pos: number, col: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`tr[data-pos="${pos}"] > td[data-col="${CSS.escape(col)}"]`);
}

/** Viewport bounds of the scrollable body area — excludes sticky header/footer and scrollbars */
function getBodyBounds(container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  const head = container.querySelector('thead')?.getBoundingClientRect();
  const foot = container.querySelector('tfoot')?.getBoundingClientRect();
  return {
    left: rect.left,
    right: rect.left + container.clientWidth,
    top: head?.bottom ?? rect.top,
    bottom: Math.min(rect.top + container.clientHeight, foot?.top ?? Infinity),
  };
}

/** Display position of the body row under the pointer, clamped into the visible body area */
function hitTestRowPos(container: HTMLElement, x: number, y: number): number | null {
  const b = getBodyBounds(container);
  const px = Math.max(b.left + 1, Math.min(b.right - 1, x));
  const py = Math.max(b.top + 1, Math.min(b.bottom - 1, y));
  const tr = document.elementFromPoint(px, py)?.closest<HTMLElement>('tr[data-pos]');
  return tr ? Number(tr.dataset.pos) : null;
}

/** Auto-scroll speed while dragging near the top/bottom edge of the body */
function edgeScrollDelta(container: HTMLElement, y: number): number {
  const b = getBodyBounds(container);
  if (y < b.top + EDGE_SCROLL_ZONE) return -Math.min(40, Math.ceil((b.top + EDGE_SCROLL_ZONE - y) / 2));
  if (y > b.bottom - EDGE_SCROLL_ZONE) return Math.min(40, Math.ceil((y - b.bottom + EDGE_SCROLL_ZONE) / 2));
  return 0;
}

function scrollCellIntoView(container: HTMLElement, cell: HTMLElement, stickyLeft: number) {
  const b = getBodyBounds(container);
  const r = cell.getBoundingClientRect();
  if (r.top < b.top) container.scrollTop -= b.top - r.top;
  else if (r.bottom > b.bottom) container.scrollTop += r.bottom - b.bottom;
  if (cell.style.position === 'sticky') return;
  const left = b.left + stickyLeft;
  if (r.left < left) container.scrollLeft -= left - r.left;
  else if (r.right > b.right) container.scrollLeft += r.right - b.right;
}

/** Keys reach the grid only when focus is on the page body or a non-form element inside the table */
function isGridKeyTarget(target: EventTarget | null, container: HTMLElement | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || el.closest('input, textarea, select, button, [contenteditable="true"]')) return false;
  return el === document.body || !!container?.contains(el);
}

// ── useFillHandle — Excel-style drag-to-fill down a column ──────
/** `toggled`: Ctrl (Win) / Option (Mac) held — flips between copy and series, like Excel */
interface FillDrag { src: number; to: number; toggled: boolean; x: number; y: number }

const isFillToggle = (ev: { ctrlKey: boolean; altKey: boolean }) => ev.ctrlKey || ev.altKey;

function useFillHandle(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  onFill: (src: number, to: number, toggled: boolean) => void,
) {
  const [fillDrag, setFillDrag] = useState<FillDrag | null>(null);
  const onFillRef = useRef(onFill);
  useLayoutEffect(() => { onFillRef.current = onFill; }, [onFill]);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const startFill = useCallback((e: React.MouseEvent, src: number) => {
    const container = scrollRef.current;
    if (e.button !== 0 || !container) return;
    e.preventDefault();
    e.stopPropagation();
    let pointer = { x: e.clientX, y: e.clientY };
    let to = src;
    let toggled = isFillToggle(e);
    let moved = false;
    let frame = 0;
    // State only updates when the target row or toggle changes, not on every mouse move
    const publish = () => setFillDrag({ src, to, toggled, x: pointer.x, y: pointer.y });
    const track = () => {
      const pos = hitTestRowPos(container, pointer.x, pointer.y);
      if (pos === null || pos === to) return;
      to = pos;
      publish();
    };
    const setToggled = (next: boolean) => {
      if (next === toggled) return;
      toggled = next;
      publish();
    };
    const tick = () => {
      const delta = moved ? edgeScrollDelta(container, pointer.y) : 0;
      if (delta !== 0) { container.scrollTop += delta; track(); }
      frame = requestAnimationFrame(tick);
    };
    const onMove = (ev: MouseEvent) => {
      pointer = { x: ev.clientX, y: ev.clientY };
      moved = true;
      setToggled(isFillToggle(ev));
      track();
    };
    const onKey = (ev: KeyboardEvent) => setToggled(isFillToggle(ev));
    const stop = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      stopRef.current = null;
      setFillDrag(null);
    };
    const onUp = (ev: MouseEvent) => {
      stop();
      if (to !== src) onFillRef.current(src, to, isFillToggle(ev));
    };
    stopRef.current = stop;
    publish();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    frame = requestAnimationFrame(tick);
  }, [scrollRef]);

  return { fillDrag, startFill };
}

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
  const [activeCell, setActiveCell] = useState<CellRef | null>(null);
  const [editCell, setEditCell] = useState<CellRef | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editAnchor, setEditAnchor] = useState<DOMRect | null>(null);
  const [lastFill, setLastFill] = useState<LastFill | null>(null);
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [pasteDialogCol, setPasteDialogCol] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Save: where the file came from, and the snapshot last written to disk (for "unsaved changes")
  const [fileHandle, setFileHandle] = useState<FsFileHandle | null>(null);
  const [saveSource, setSaveSource] = useState<SaveSource>({});
  const [savedSnapshot, setSavedSnapshot] = useState<TableSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const selectAnchorRef = useRef<number | null>(null);
  const sortClickTimerRef = useRef<number | null>(null);
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

  // Undo/Redo (P1) — each step restores rows, the as-loaded baseline and the column list together
  const history = useHistory<TableSnapshot>(50);

  const hasData = data.length > 0;

  // ── Tracked table setters (push to undo history) ───────────────
  const dataRef = useRef(data);
  dataRef.current = data;
  const rawRef = useRef(rawData);
  rawRef.current = rawData;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const currentSnapshot = useCallback(
    (): TableSnapshot => ({ rows: dataRef.current, raw: rawRef.current, columns: columnsRef.current }),
    [],
  );

  const applySnapshot = useCallback((s: TableSnapshot) => {
    // Refs update immediately so a second change in the same event builds on this one
    dataRef.current = s.rows;
    rawRef.current = s.raw;
    columnsRef.current = s.columns;
    setData(s.rows);
    setRawData(s.raw);
    setColumns(s.columns);
    onDataChange?.(s.rows);
  }, [onDataChange]);

  const commitTable = useCallback((update: (prev: TableSnapshot) => TableSnapshot, label: string) => {
    setLastFill(null);
    const next = update(currentSnapshot());
    history.push(next, label);
    applySnapshot(next);
  }, [history, currentSnapshot, applySnapshot]);

  const setDataWithHistory = useCallback((updater: (prev: Row[]) => Row[], label: string) => {
    commitTable(s => ({ ...s, rows: updater(s.rows) }), label);
  }, [commitTable]);

  const isDirty = !!savedSnapshot && (data !== savedSnapshot.rows || columns !== savedSnapshot.columns);

  const notify = useCallback((text: string, tone: Notice['tone'] = 'info') => setNotice({ text, tone }), []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  // Warn before closing the tab with unsaved edits
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  useEffect(() => () => {
    if (sortClickTimerRef.current) clearTimeout(sortClickTimerRef.current);
  }, []);

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
          const raw = debouncedFilters[col] || '';
          if (!raw) return true;
          const cell = String(row[col] ?? '');
          if (raw === EMPTY_FILTER) return cell === '';
          return cell.toLowerCase().includes(raw.toLowerCase());
        }) &&
        (!gq || columns.some((col: string) => String(row[col] ?? '').toLowerCase().includes(gq)))
      );
  }, [data, debouncedFilters, columns, hiddenRows, debouncedGlobalSearch]);

  const orderedColumns = useMemo(() => orderColumns(columns, colOrder), [columns, colOrder]);

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

  const loadParsed = useCallback((
    cols: string[],
    rows: Row[],
    name: string,
    file: { handle?: FsFileHandle | null; source?: SaveSource } = {},
  ) => {
    const snapshot: TableSnapshot = { rows: rows.map(r => ({ ...r })), raw: rows.map(r => ({ ...r })), columns: cols };
    applySnapshot(snapshot);
    history.init(snapshot);
    setSavedSnapshot(snapshot);
    setFileHandle(file.handle ?? null);
    setSaveSource(file.source ?? {});
    setLastFill(null);
    setRenamingCol(null);
    setPasteDialogCol(null);
    selectAnchorRef.current = null;
    setFilterInputs({});
    setSelected(new Set());
    setEditCell(null);
    setActiveCell(null);
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
  }, [history, applySnapshot]);

  // External data support
  useEffect(() => {
    if (!externalData) return;
    loadParsed(externalData.columns, externalData.rows, externalData.fileName || 'external');
  }, [externalData, loadParsed]);

  const loadFile = useCallback(async (file: File, handle: FsFileHandle | null = null) => {
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
        loadParsed(result.columns, result.rows, name, { handle });
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
        const rows = arr.map(r => Object.fromEntries(cols.map(c => [c, String(r[c] ?? '')])));
        loadParsed(cols, rows, name, { handle, source: { workbook: buffer, sheetName: wb.SheetNames[0] } });
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
            complete: (result: { meta: { fields?: string[]; delimiter?: string }; data: Row[] }) => {
              const cols = result.meta.fields || [];
              const rows = result.data.map(r => Object.fromEntries(cols.map(c => [c, String(r[c] ?? '')])));
              setLoadMsg(`Loading ${rows.length.toLocaleString()} rows...`);
              setTimeout(() => {
                loadParsed(cols, rows, name, { handle, source: { delimiter: result.meta.delimiter } });
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

  // Open via the browser picker when available (gives Save a handle to write back to)
  const openFile = useCallback(async () => {
    if (loading) return;
    if (!fsWindow.showOpenFilePicker) { fileRef.current?.click(); return; }
    try {
      const picked = await pickTableFile();
      if (picked) await loadFile(picked.file, picked.handle);
    } catch (e) {
      notify(`Couldn't open the file: ${(e as Error).message}`, 'error');
    }
  }, [loading, loadFile, notify]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const handlePromise = getDroppedHandle(e);
    handlePromise.then(handle => loadFile(file, handle));
  }, [loadFile]);

  // ── Cell selection, editing & fill ─────────────────────────────
  const activePos = useMemo(
    () => (activeCell ? sortedRows.findIndex(r => r.idx === activeCell.row) : -1),
    [activeCell, sortedRows],
  );

  const revealCell = useCallback((pos: number, col: string) => {
    const container = scrollRef.current;
    if (!container) return;
    const cell = findCellEl(container, pos, col);
    if (!cell) {
      // Row is outside the virtualized window — jump to it
      container.scrollTop = Math.max(0, pos * ROW_H - containerH / 2);
      return;
    }
    const frozenW = visibleColumns.filter(c => frozenCols.has(c)).reduce((sum, c) => sum + (colWidths[c] ?? 140), 0);
    scrollCellIntoView(container, cell, ROW_GUTTER_W + frozenW);
  }, [containerH, visibleColumns, frozenCols, colWidths]);

  const moveActive = useCallback((dRow: number, dCol: number) => {
    if (!activeCell || activePos < 0) return;
    const colIdx = visibleColumns.indexOf(activeCell.col);
    if (colIdx < 0) return;
    const next = moveCell(activePos, colIdx, dRow, dCol, sortedRows.length, visibleColumns.length);
    const col = visibleColumns[next.colIdx];
    setActiveCell({ row: sortedRows[next.pos].idx, col });
    revealCell(next.pos, col);
  }, [activeCell, activePos, visibleColumns, sortedRows, revealCell]);

  const startEdit = useCallback((cell: CellRef, cellEl: HTMLElement, initial?: string) => {
    setActiveCell(cell);
    setEditCell(cell);
    setEditVal(initial ?? dataRef.current[cell.row]?.[cell.col] ?? '');
    setEditAnchor(cellEl.getBoundingClientRect());
  }, []);

  const openActiveEditor = useCallback((initial?: string) => {
    if (!activeCell || activePos < 0 || !scrollRef.current) return;
    const cellEl = findCellEl(scrollRef.current, activePos, activeCell.col);
    if (cellEl) startEdit(activeCell, cellEl, initial);
    else revealCell(activePos, activeCell.col);
  }, [activeCell, activePos, startEdit, revealCell]);

  const cancelEdit = useCallback(() => {
    setEditCell(null);
    setEditAnchor(null);
  }, []);

  const commitEdit = useCallback((move: CommitMove = 'none') => {
    if (!editCell) return;
    const { row, col } = editCell;
    if (editVal !== (dataRef.current[row]?.[col] ?? '')) {
      setDataWithHistory(prev => fillColumn(prev, [row], col, editVal), `Edit cell [${row},${col}]`);
    }
    cancelEdit();
    if (move === 'down') moveActive(1, 0);
    else if (move === 'right') moveActive(0, 1);
    else if (move === 'left') moveActive(0, -1);
  }, [editCell, editVal, setDataWithHistory, cancelEdit, moveActive]);

  const clearActiveCell = useCallback(() => {
    if (!activeCell || !dataRef.current[activeCell.row]?.[activeCell.col]) return;
    const { row, col } = activeCell;
    setDataWithHistory(prev => fillColumn(prev, [row], col, ''), `Clear cell [${row},${col}]`);
  }, [activeCell, setDataWithHistory]);

  const handleFill = useCallback((src: number, to: number, toggled: boolean) => {
    const range = fillRangePositions(src, to);
    if (!activeCell || !range || !sortedRows[src]) return;
    const { col } = activeCell;
    const sourceValue = dataRef.current[sortedRows[src].idx]?.[col] ?? '';
    const direction: FillDirection = to > src ? 1 : -1;
    // Nearest-first, so series values line up with distance from the source
    const inRange = sortedRows.slice(range[0], range[1] + 1).map(r => r.idx);
    const targets = direction === 1 ? inRange : inRange.reverse();
    const mode = resolveFillMode(sourceValue, toggled, FILL_OPTS);
    const before = dataRef.current;
    const values = buildFillValues(sourceValue, targets.length, direction, mode, FILL_OPTS);
    setDataWithHistory(prev => setColumnValues(prev, targets, col, values), fillLabel(mode, targets.length, col));
    const endCell = scrollRef.current && findCellEl(scrollRef.current, to, col);
    if (endCell && canFillSeries(sourceValue, FILL_OPTS)) {
      setLastFill({ col, targets, direction, sourceValue, mode, before, anchor: endCell.getBoundingClientRect() });
    }
  }, [activeCell, sortedRows, setDataWithHistory]);

  // Auto Fill Options: re-apply the last fill in the other mode, replacing it in history (one undo step)
  const switchFillMode = useCallback((mode: FillMode) => {
    if (!lastFill || mode === lastFill.mode) return;
    const { before, targets, col, sourceValue, direction } = lastFill;
    const values = buildFillValues(sourceValue, targets.length, direction, mode, FILL_OPTS);
    const next: TableSnapshot = { ...currentSnapshot(), rows: setColumnValues(before, targets, col, values) };
    history.replace(next, fillLabel(mode, targets.length, col));
    applySnapshot(next);
    setLastFill({ ...lastFill, mode });
  }, [lastFill, history, currentSnapshot, applySnapshot]);

  const closeFillOptions = useCallback(() => setLastFill(null), []);

  const { fillDrag, startFill } = useFillHandle(scrollRef, handleFill);
  const fillBounds = fillDrag ? [Math.min(fillDrag.src, fillDrag.to), Math.max(fillDrag.src, fillDrag.to)] : null;

  // Value the last cell under the drag will get — shown next to the pointer like Excel
  const fillPreview = useMemo(() => {
    if (!fillDrag || !activeCell || fillDrag.to === fillDrag.src || !sortedRows[fillDrag.src]) return null;
    const value = data[sortedRows[fillDrag.src].idx]?.[activeCell.col] ?? '';
    const mode = resolveFillMode(value, fillDrag.toggled, FILL_OPTS);
    return fillValueAt(value, fillDrag.to - fillDrag.src, mode, FILL_OPTS);
  }, [fillDrag, activeCell, sortedRows, data]);

  // Keyboard on the selected cell: arrows/Tab move, Enter/F2/typing edits, Delete clears, Esc deselects
  useEffect(() => {
    if (!activeCell || editCell) return;
    const handler = (e: KeyboardEvent) => {
      if (!isGridKeyTarget(e.target, scrollRef.current) || e.ctrlKey || e.metaKey || e.altKey) return;
      const delta = KEY_MOVES[e.key] ?? (e.key === 'Tab' ? [0, e.shiftKey ? -1 : 1] : null);
      if (delta) { e.preventDefault(); moveActive(delta[0], delta[1]); return; }
      if (e.key === 'Escape') { setActiveCell(null); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clearActiveCell(); return; }
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); openActiveEditor(); return; }
      if (e.key.length === 1) { e.preventDefault(); openActiveEditor(e.key); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCell, editCell, moveActive, clearActiveCell, openActiveEditor]);

  // Deselect when clicking outside the table (the floating editor counts as inside)
  useEffect(() => {
    if (!activeCell) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (scrollRef.current?.contains(target) || target.closest('[data-cell-editor]')) return;
      setActiveCell(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [activeCell]);

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

  // Checkbox / row-number click: plain click toggles one row, Shift+click sets the whole on-screen
  // range from the last plainly clicked row to the same state as that row
  const handleRowCheck = useCallback((idx: number, shift: boolean) => {
    const anchor = selectAnchorRef.current;
    const anchorPos = anchor === null ? -1 : sortedRows.findIndex(r => r.idx === anchor);
    const pos = sortedRows.findIndex(r => r.idx === idx);
    if (!shift || anchor === null || anchorPos < 0 || pos < 0) {
      toggleRow(idx);
      selectAnchorRef.current = idx;
      return;
    }
    const ids = sortedRows.slice(Math.min(anchorPos, pos), Math.max(anchorPos, pos) + 1).map(r => r.idx);
    setSelected(prev => selectRange(prev, ids, prev.has(anchor)));
  }, [sortedRows, toggleRow]);

  const deleteSelectedRows = useCallback(() => {
    commitTable(s => removeRows(s, selected), `Delete ${selected.size} rows`);
    setSelected(new Set());
    setActiveCell(null);
    selectAnchorRef.current = null;
  }, [selected, commitTable]);

  const duplicateSelectedRows = useCallback(() => {
    commitTable(s => duplicateRows(s, Array.from(selected)), `Duplicate ${selected.size} rows`);
    setSelected(new Set());
    setActiveCell(null);
    selectAnchorRef.current = null;
  }, [selected, commitTable]);

  const deleteColumn = useCallback((col: string) => {
    commitTable(s => removeColumn(s, col), `Delete column "${col}"`);
    setActiveCell(prev => (prev?.col === col ? null : prev));
    setColMenuCol(null);
  }, [commitTable]);

  const duplicateColumn = useCallback((col: string) => {
    const newCol = dedupeColumnName(columnsRef.current, `${col}_copy`);
    commitTable(s => insertColumn(s, newCol, s.columns.indexOf(col) + 1, col), `Duplicate column "${col}"`);
    setColOrder(prev => (prev.length ? insertNextTo(prev, newCol, col, 'right') : prev));
    setColMenuCol(null);
  }, [commitTable]);

  /** Insert an empty column beside `anchor` and open its name for editing */
  const addColumn = useCallback((anchor: string, side: InsertSide) => {
    const name = nextColumnName(columnsRef.current);
    commitTable(s => {
      const anchorIdx = s.columns.indexOf(anchor);
      const index = anchorIdx < 0 ? s.columns.length : anchorIdx + (side === 'right' ? 1 : 0);
      return insertColumn(s, name, index);
    }, `Insert column "${name}"`);
    setColOrder(prev => (prev.length ? insertNextTo(prev, name, anchor, side) : prev));
    setColMenuCol(null);
    setRenamingCol(name);
  }, [commitTable]);

  /** Point every column-keyed setting (width, filter, sort, freeze…) at the renamed column */
  const remapColumnState = useCallback((from: string, to: string) => {
    const ren = (c: string) => (c === from ? to : c);
    const renSet = (prev: Set<string>) => (prev.has(from) ? new Set(Array.from(prev, ren)) : prev);
    setColWidths(prev => renameRecordKey(prev, from, to));
    setFilterInputs(prev => renameRecordKey(prev, from, to));
    setSortKeys(prev => (prev.some(k => k.col === from) ? prev.map(k => ({ ...k, col: ren(k.col) })) : prev));
    setColOrder(prev => (prev.includes(from) ? prev.map(ren) : prev));
    setFrozenCols(renSet);
    setHiddenCols(renSet);
    setCFRules(prev => (prev.some(r => r.col === from) ? prev.map(r => ({ ...r, col: ren(r.col) })) : prev));
    setDistinctCol(ren);
    setBatchCol(ren);
    setFindColumnScope(ren);
    setActiveCell(prev => (prev?.col === from ? { ...prev, col: to } : prev));
  }, []);

  const commitRename = useCallback((from: string, value: string): boolean => {
    const to = value.trim();
    const error = validateColumnName(to, columnsRef.current, from);
    if (error) {
      notify(error, 'error');
      return false;
    }
    setRenamingCol(null);
    if (to === from) return true;
    commitTable(s => renameColumn(s, from, to), `Rename column "${from}" → "${to}"`);
    remapColumnState(from, to);
    return true;
  }, [commitTable, remapColumnState, notify]);

  // Header name: click sorts, double-click renames — the sort waits briefly so a double-click doesn't also sort
  const handleHeaderClick = useCallback((col: string, additive: boolean) => {
    if (sortClickTimerRef.current) clearTimeout(sortClickTimerRef.current);
    sortClickTimerRef.current = window.setTimeout(() => {
      sortClickTimerRef.current = null;
      handleSort(col, additive);
    }, 220);
  }, [handleSort]);

  const handleHeaderDoubleClick = useCallback((col: string) => {
    if (sortClickTimerRef.current) clearTimeout(sortClickTimerRef.current);
    sortClickTimerRef.current = null;
    setRenamingCol(col);
  }, []);

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
    setActiveCell(prev => (prev?.col === col ? null : prev));
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
    setDataWithHistory(
      prev => replaceAll(prev, columns, findQuery, replaceValue, findOpts),
      `Replace all "${findQuery}" → "${replaceValue}"`,
    );
  }, [columns, findQuery, replaceValue, findOpts, setDataWithHistory]);

  // Undo/Redo
  const handleUndo = useCallback(() => {
    setLastFill(null);
    const prev = history.undo();
    if (prev) applySnapshot(prev);
  }, [history, applySnapshot]);

  const handleRedo = useCallback(() => {
    setLastFill(null);
    const next = history.redo();
    if (next) applySnapshot(next);
  }, [history, applySnapshot]);

  // ── Paste (Ctrl+V on a cell, or the Paste values dialog) ───────
  const pasteText = useCallback((text: string, opts: { startPos: number; startCol: string; addRows: boolean; newColumn?: string }) => {
    const grid = parseClipboardGrid(text);
    if (grid.length === 0) return;
    let base = currentSnapshot();
    let targetCols = visibleColumns;
    if (opts.newColumn) {
      base = insertColumn(base, opts.newColumn, base.columns.length);
      targetCols = [opts.newColumn];
    }
    const startColIdx = opts.newColumn ? 0 : targetCols.indexOf(opts.startCol);
    const plan = planPaste(grid, sortedRows.map(r => r.idx), opts.startPos, targetCols, startColIdx, base.rows.length, opts.addRows);
    const next = applyPaste(base, grid, plan);
    const cells = (plan.rowTargets.length * plan.colTargets.length).toLocaleString();
    commitTable(() => next, `Paste ${cells} cells${opts.newColumn ? ` into new column "${opts.newColumn}"` : ''}`);
    const extra = [
      plan.newRows > 0 && `added ${plan.newRows.toLocaleString()} rows`,
      plan.skippedRows > 0 && `${plan.skippedRows.toLocaleString()} lines didn't fit — use Paste values… in the column menu to add rows`,
      plan.skippedCols > 0 && `${plan.skippedCols} column${plan.skippedCols > 1 ? 's' : ''} didn't fit`,
    ].filter(Boolean).join(' · ');
    notify(`Pasted ${grid.length.toLocaleString()} line${grid.length > 1 ? 's' : ''}${extra ? ` · ${extra}` : ''}`);
  }, [currentSnapshot, visibleColumns, sortedRows, commitTable, notify]);

  const applyPasteDialog = useCallback((result: PasteDialogResult) => {
    const startPos = result.start === 'selected' && activePos >= 0 ? activePos : 0;
    pasteText(result.text, {
      startPos,
      startCol: result.column ?? '',
      addRows: result.addRows,
      newColumn: result.column === null ? result.newColumnName : undefined,
    });
    setPasteDialogCol(null);
  }, [activePos, pasteText]);

  // Ctrl+V pastes from the selected cell down/right; Ctrl+C copies the selected cell
  useEffect(() => {
    if (!activeCell || editCell) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!isGridKeyTarget(e.target, scrollRef.current) || activePos < 0) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      pasteText(text, { startPos: activePos, startCol: activeCell.col, addRows: false });
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!isGridKeyTarget(e.target, scrollRef.current) || !window.getSelection()?.isCollapsed) return;
      e.clipboardData?.setData('text/plain', toClipboardCell(dataRef.current[activeCell.row]?.[activeCell.col] ?? ''));
      e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('copy', onCopy);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('copy', onCopy);
    };
  }, [activeCell, editCell, activePos, pasteText]);

  // ── Save ───────────────────────────────────────────────────────
  // Save writes back to the opened file when the browser allows it (Chrome/Edge);
  // otherwise — or on first save of a file opened without a handle — it asks where / downloads a copy
  const saveTable = useCallback(async (saveAs: boolean) => {
    if (saving || !hasData) return;
    const format = getSaveFormat(fileName);
    const warning = getSaveWarning(format);
    if (warning && !window.confirm(warning)) return;
    setSaving(true);
    try {
      const snapshot = currentSnapshot();
      const blob = await serializeTable(orderColumns(snapshot.columns, colOrder), snapshot.rows, format, saveSource);
      const target = !saveAs && fileHandle ? fileHandle : await pickSaveTarget(fileName, format);
      if (target) {
        await writeToHandle(target, blob);
        setFileHandle(target);
        setFileName(target.name);
        notify(`Saved ${target.name}`);
      } else if (!fsWindow.showSaveFilePicker) {
        downloadBlob(fileName, blob);
        notify(`Downloaded ${fileName} — this browser can't save over the original, so replace it with the download`);
      } else {
        return; // picker cancelled
      }
      setSavedSnapshot(snapshot);
    } catch (e) {
      if (!isAbortError(e)) notify(`Couldn't save: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, hasData, fileName, currentSnapshot, colOrder, saveSource, fileHandle, notify]);

  const clearTable = useCallback(() => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    applySnapshot({ rows: [], raw: [], columns: [] });
    setSavedSnapshot(null);
    setFileHandle(null);
    setFileName('');
    setFilterInputs({});
    setSelected(new Set());
    setActiveCell(null);
  }, [isDirty, applySnapshot]);

  // Keyboard shortcuts: Ctrl+Z, Ctrl+Y, Ctrl+F, Ctrl+S (Save), Ctrl+Shift+S (Save as)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') { e.preventDefault(); saveTable(e.shiftKey); return; }
      if (key === 'f') { e.preventDefault(); setGlobalSearchFocused(true); return; }
      // Text fields keep their own undo
      if (isEditableTarget(e.target)) return;
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, saveTable]);

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
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={openFile}
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
          {isDirty && (
            <span title="Unsaved changes — Ctrl+S to save" className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
              ● Unsaved
            </span>
          )}
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
            onClick={clearTable}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <Trash2 size={12} /> Clear
          </button>
          {/* Save / Save as */}
          <div className="flex items-center">
            <button
              onClick={() => saveTable(false)}
              disabled={saving}
              title={fileHandle ? `Save to ${fileName} (Ctrl+S)` : `Save ${fileName} (Ctrl+S)`}
              className={`flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 text-xs font-bold border rounded-l-lg transition-all cursor-pointer ${
                isDirty
                  ? 'border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
            </button>
            <button
              onClick={() => saveTable(true)}
              disabled={saving}
              title="Save as… (Ctrl+Shift+S)"
              className="px-2 py-1.5 text-xs font-bold border border-l-0 border-slate-200 dark:border-slate-700 rounded-r-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              as…
            </button>
          </div>
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
            onScroll={e => {
              setScrollTop((e.target as HTMLDivElement).scrollTop);
              // The floating editor is pinned to the viewport — save it rather than let it drift off its cell
              if (editCell) commitEdit();
              if (lastFill) setLastFill(null);
            }}
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
                        draggable={renamingCol !== col}
                        onDragStart={(e: React.DragEvent) => { dragColRef.current = col; e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCol !== col) setDragOverCol(col); }}
                        onDragLeave={() => { if (dragOverCol === col) setDragOverCol(null); }}
                        onDrop={(e: React.DragEvent) => {
                          e.preventDefault();
                          setDragOverCol(null);
                          const from = dragColRef.current;
                          if (!from || from === col) return;
                          setColOrder(prev => {
                            const base = orderColumns(columns, prev);
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
                          {renamingCol === col ? (
                            <HeaderNameInput
                              initial={col}
                              onCommit={(value: string) => commitRename(col, value)}
                              onCancel={() => setRenamingCol(null)}
                            />
                          ) : (
                          <button
                            onClick={e => handleHeaderClick(col, e.shiftKey)}
                            onDoubleClick={() => handleHeaderDoubleClick(col)}
                            title={`${col} — click to sort, double-click to rename`}
                            className="flex items-center gap-1 group flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <span className={`font-black text-[11px] uppercase tracking-wide truncate ${sortKey ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-slate-100'}`}>{col}</span>
                            <span className={`shrink-0 flex items-center gap-0.5 ${sortKey ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600 group-hover:text-slate-400'}`}>
                              {sortKey
                                ? <>
                                    {sortKey.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                                    {sortKeys.length > 1 && <span className="text-[9px] font-black">{sortIdx + 1}</span>}
                                  </>
                                : <ArrowUpDown size={11} />}
                            </span>
                          </button>
                          )}
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
                  <th className="w-10 px-1 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 align-top pt-2">
                    <button
                      onClick={() => addColumn(visibleColumns[visibleColumns.length - 1] ?? '', 'right')}
                      aria-label="Add column"
                      title="Add column"
                      className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      <Plus size={13} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={columns.length + 3} /></tr>}

                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 3} className="text-center py-12 text-sm text-slate-400 dark:text-slate-500">
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
                      data-pos={displayIdx}
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
                        <input
                          type="checkbox"
                          checked={isSelected}
                          // React fires onChange from the click event, so Shift is readable here
                          onChange={e => handleRowCheck(idx, (e.nativeEvent as MouseEvent).shiftKey)}
                          onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                          aria-label={`Select row ${displayIdx + 1}`}
                          className="cursor-pointer accent-blue-600"
                        />
                      </td>
                      <td
                        onClick={e => handleRowCheck(idx, e.shiftKey)}
                        onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }}
                        title="Click to select · Shift+click to select a range"
                        className={`w-10 px-3 text-right border-r border-slate-100 dark:border-slate-800 font-medium sticky left-9 z-10 cursor-pointer select-none ${isSelected ? 'bg-blue-50 dark:bg-slate-800' : isModified ? 'bg-amber-50 dark:bg-slate-900' : displayIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-900'}`}>
                        {isModified
                          ? <span className="text-amber-500 font-bold">{displayIdx + 1}</span>
                          : <span className="text-slate-400 dark:text-slate-500">{displayIdx + 1}</span>
                        }
                      </td>
                      {visibleColumns.map((col: string) => {
                        const isActive = activeCell?.row === idx && activeCell?.col === col;
                        const isInFill = !!fillBounds && activeCell?.col === col && displayIdx >= fillBounds[0] && displayIdx <= fillBounds[1];
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
                            data-col={col}
                            onMouseDown={e => { if (e.detail > 1) e.preventDefault(); }}
                            onClick={() => setActiveCell({ row: idx, col })}
                            onDoubleClick={e => startEdit({ row: idx, col }, e.currentTarget)}
                            style={{
                              width: colWidths[col] ?? 140, minWidth: colWidths[col] ?? 140, maxWidth: colWidths[col] ?? 140,
                              backgroundColor: isFindMatch ? 'rgba(251,191,36,0.25)' : cfColor,
                              ...(isFrozen ? { position: 'sticky' as const, left: frozenLeftOffsets[col] } : {}),
                            }}
                            className={`relative px-3 border-r border-slate-100 dark:border-slate-800 last:border-r-0 cursor-cell ${wrapText ? '' : 'overflow-hidden'} ${isFrozen ? `z-10 ${frozenBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]` : ''} ${
                              cellModified ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'
                            } ${isActive ? 'ring-2 ring-inset ring-blue-500' : ''} ${isInFill && !isActive ? 'bg-blue-100/70 dark:bg-blue-500/20' : ''}`}
                          >
                            <span title={wrapText ? undefined : String(row[col] ?? '')} className={wrapText ? 'block whitespace-pre-wrap break-words' : 'truncate block'}>{String(row[col] ?? '')}</span>
                            {isActive && !editCell && (
                              <div
                                onMouseDown={e => startFill(e, displayIdx)}
                                title="Drag to fill"
                                aria-hidden="true"
                                className="absolute right-0 bottom-0 w-2 h-2 bg-blue-500 border border-white dark:border-slate-900 cursor-crosshair"
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="w-10" />
                    </tr>
                  );
                })}

                {padBot > 0 && <tr style={{ height: padBot }}><td colSpan={columns.length + 3} /></tr>}
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
              <span className="ml-2 hidden xl:inline">· Double-click to edit · drag the corner square to fill · Ctrl+V to paste</span>
            </span>
            {notice && (
              <span
                role={notice.tone === 'error' ? 'alert' : 'status'}
                className={`min-w-0 truncate text-[11px] font-semibold ${notice.tone === 'error' ? 'text-red-500 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}
                title={notice.text}
              >
                {notice.text}
              </span>
            )}
            {modifiedSet.size > 0 && (
              <span className="text-[11px] font-bold text-amber-500">
                ● {modifiedSet.size.toLocaleString()} modified row{modifiedSet.size > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {editCell && editAnchor && (
        <TableLensCellEditor
          anchor={editAnchor}
          value={editVal}
          onChange={setEditVal}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        />
      )}

      {lastFill && (
        <TableLensFillOptions
          anchor={lastFill.anchor}
          mode={lastFill.mode}
          onChange={switchFillMode}
          onClose={closeFillOptions}
        />
      )}

      {fillDrag && fillPreview !== null && createPortal(
        <div
          style={{ position: 'fixed', left: fillDrag.x + 14, top: fillDrag.y + 14, zIndex: 9999 }}
          className="pointer-events-none max-w-[240px] truncate px-2 py-1 rounded-md bg-slate-900 text-white text-[11px] font-medium shadow-lg"
        >
          {fillPreview || <span className="italic opacity-70">(empty)</span>}
        </div>,
        document.body
      )}

      {pasteDialogCol !== null && (
        <TableLensPasteDialog
          columns={visibleColumns}
          allColumns={columns}
          initialColumn={pasteDialogCol}
          selectedRowNumber={activePos >= 0 ? activePos + 1 : null}
          rowCount={sortedRows.length}
          onApply={applyPasteDialog}
          onClose={() => setPasteDialogCol(null)}
        />
      )}

      {/* Column context menu portal */}
      {colMenuCol && colMenuRect && createPortal(
        <div
          ref={colMenuRef}
          style={{ position: 'fixed', top: colMenuRect.bottom + 4, left: colMenuRect.left, zIndex: 9999 }}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 min-w-[180px]"
        >
          <button
            onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); setRenamingCol(colMenuCol); setColMenuCol(null); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            <Pencil size={12} /> Rename column
          </button>
          <button
            onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); addColumn(colMenuCol, 'left'); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            <ArrowLeftToLine size={12} /> Insert column left
          </button>
          <button
            onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); addColumn(colMenuCol, 'right'); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            <ArrowRightToLine size={12} /> Insert column right
          </button>
          <button
            onMouseDown={(e: React.MouseEvent) => { e.preventDefault(); setPasteDialogCol(colMenuCol); setColMenuCol(null); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            <ClipboardPaste size={12} /> Paste values…
          </button>
          <div className="mx-3 my-1 border-t border-slate-100 dark:border-slate-700" />
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
