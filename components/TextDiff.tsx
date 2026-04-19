import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { GitCompare, Upload, Eraser, AlignJustify, Columns2, ArrowLeftRight, ChevronUp, ChevronDown, WrapText, ChevronsUpDown } from 'lucide-react';
import CopyButton from './CopyButton';

// ─── Line-level Diff Engine ──────────────────────────────────────────────────

type DiffOp = { type: 'equal' | 'insert' | 'delete'; value: string };

function lcsLineDiff(oldLines: string[], newLines: string[]): DiffOp[] {
  const m = oldLines.length;
  const n = newLines.length;

  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'equal', value: oldLines[i - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', value: newLines[j - 1] }); j--;
    } else {
      ops.unshift({ type: 'delete', value: oldLines[i - 1] }); i--;
    }
  }
  return ops;
}

function normalise(line: string, ignoreWs: boolean, ignoreCase: boolean): string {
  let s = line;
  if (ignoreWs) s = s.replace(/\s+/g, ' ').trim();
  if (ignoreCase) s = s.toLowerCase();
  return s;
}

// ─── Inline (hybrid word→char) Diff Engine ──────────────────────────────────

type InlineOp = { type: 'equal' | 'del' | 'ins'; text: string };

function tokenize(s: string): string[] {
  return s.match(/\w+|\s+|[^\w\s]/g) ?? (s.length ? [s] : []);
}

function lcsStringDiff(a: string[], b: string[]): { type: 'equal' | 'delete' | 'insert'; tok: string }[] {
  const m = a.length, n = b.length;
  if (m * n > 40_000) {
    return [...a.map(t => ({ type: 'delete' as const, tok: t })),
            ...b.map(t => ({ type: 'insert' as const, tok: t }))];
  }
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: { type: 'equal' | 'delete' | 'insert'; tok: string }[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'equal', tok: a[i - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', tok: b[j - 1] }); j--;
    } else {
      ops.unshift({ type: 'delete', tok: a[i - 1] }); i--;
    }
  }
  return ops;
}

function charLevelDiff(a: string, b: string): { left: InlineOp[]; right: InlineOp[] } {
  const ops = lcsStringDiff(a.split(''), b.split(''));
  const left: InlineOp[] = [], right: InlineOp[] = [];
  for (const op of ops) {
    if (op.type === 'equal') { left.push({ type: 'equal', text: op.tok }); right.push({ type: 'equal', text: op.tok }); }
    else if (op.type === 'delete') left.push({ type: 'del', text: op.tok });
    else right.push({ type: 'ins', text: op.tok });
  }
  return { left, right };
}

function inlineDiff(a: string, b: string): { left: InlineOp[]; right: InlineOp[] } {
  const wordOps = lcsStringDiff(tokenize(a), tokenize(b));
  const left: InlineOp[] = [], right: InlineOp[] = [];
  let i = 0;
  while (i < wordOps.length) {
    const op = wordOps[i];
    if (op.type === 'equal') {
      left.push({ type: 'equal', text: op.tok });
      right.push({ type: 'equal', text: op.tok });
      i++;
    } else {
      const dels: string[] = [], ins: string[] = [];
      while (i < wordOps.length && (wordOps[i].type === 'delete' || wordOps[i].type === 'insert')) {
        if (wordOps[i].type === 'delete') dels.push(wordOps[i].tok);
        else ins.push(wordOps[i].tok);
        i++;
      }
      const pairCount = Math.min(dels.length, ins.length);
      for (let k = 0; k < pairCount; k++) {
        const { left: cl, right: cr } = charLevelDiff(dels[k], ins[k]);
        left.push(...cl);
        right.push(...cr);
      }
      for (let k = pairCount; k < dels.length; k++) left.push({ type: 'del', text: dels[k] });
      for (let k = pairCount; k < ins.length; k++) right.push({ type: 'ins', text: ins[k] });
    }
  }
  return { left, right };
}

function InlineSpans({ ops }: { ops: InlineOp[] }) {
  return (
    <>
      {ops.map((op, i) => {
        if (op.type === 'equal') return <span key={i}>{op.text}</span>;
        if (op.type === 'del')
          return <mark key={i} className="bg-red-300/70 text-red-950 rounded-sm">{op.text}</mark>;
        return <mark key={i} className="bg-emerald-300/70 text-emerald-950 rounded-sm">{op.text}</mark>;
      })}
    </>
  );
}

// ─── Side-by-side row types ──────────────────────────────────────────────────

interface SideBySideRow {
  type: 'equal' | 'change' | 'insert' | 'delete';
  left: string | null;
  right: string | null;
  leftNo: number | null;
  rightNo: number | null;
}

function buildSideBySide(ops: DiffOp[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let l = 1, r = 1;
  let i = 0;

  while (i < ops.length) {
    const op = ops[i];
    if (op.type === 'equal') {
      rows.push({ type: 'equal', left: op.value, right: op.value, leftNo: l++, rightNo: r++ });
      i++;
    } else {
      const deletes: string[] = [];
      const inserts: string[] = [];
      while (i < ops.length && (ops[i].type === 'delete' || ops[i].type === 'insert')) {
        if (ops[i].type === 'delete') deletes.push(ops[i].value);
        else inserts.push(ops[i].value);
        i++;
      }
      const maxLen = Math.max(deletes.length, inserts.length);
      for (let k = 0; k < maxLen; k++) {
        const hasBoth = k < deletes.length && k < inserts.length;
        rows.push({
          type: hasBoth ? 'change' : k < deletes.length ? 'delete' : 'insert',
          left: k < deletes.length ? deletes[k] : null,
          right: k < inserts.length ? inserts[k] : null,
          leftNo: k < deletes.length ? l++ : null,
          rightNo: k < inserts.length ? r++ : null,
        });
      }
    }
  }
  return rows;
}

// ─── Unified display rows ────────────────────────────────────────────────────

interface UnifiedDisplayRow {
  type: 'hunk' | 'context' | 'delete' | 'insert';
  text: string;
  pairText?: string;
  hunkHeader?: string;
  hunkIndex?: number;
  canExpand?: boolean;
}

function buildUnifiedDisplayRows(ops: DiffOp[], context = 3, expandedHunks = new Set<number>()): UnifiedDisplayRow[] {
  const rows: UnifiedDisplayRow[] = [];

  const lineNums: { a: number; b: number }[] = [];
  let la = 1, lb = 1;
  for (const op of ops) {
    lineNums.push({ a: la, b: lb });
    if (op.type === 'equal' || op.type === 'delete') la++;
    if (op.type === 'equal' || op.type === 'insert') lb++;
  }

  let pos = 0;
  let hunkIndex = 0;

  while (pos < ops.length) {
    let s = pos;
    while (s < ops.length && ops[s].type === 'equal') s++;
    if (s === ops.length) break;

    const availableBefore = s - pos;

    // Find end of hunk using standard context (for merging close change blocks)
    let end = s;
    let gap = 0;
    for (let k = s; k < ops.length; k++) {
      if (ops[k].type !== 'equal') { end = k; gap = 0; }
      else { gap++; if (gap > context) break; }
    }

    // Compute true trailing (all equal ops after last change in this hunk)
    let trueTrailing = 0;
    for (let k = end + 1; k < ops.length && ops[k].type === 'equal'; k++) trueTrailing++;

    const isExpanded = expandedHunks.has(hunkIndex);
    const ctxBefore = isExpanded ? availableBefore : Math.min(context, availableBefore);
    const ctxAfter  = isExpanded ? trueTrailing    : Math.min(context, trueTrailing);

    const sliceStart = s - ctxBefore;
    const sliceEnd   = end + ctxAfter + 1;
    const hunk = ops.slice(sliceStart, sliceEnd);

    const canExpand = !isExpanded && (availableBefore > context || trueTrailing > context);

    const startA = lineNums[sliceStart].a;
    const startB = lineNums[sliceStart].b;
    const countA = hunk.filter(o => o.type !== 'insert').length;
    const countB = hunk.filter(o => o.type !== 'delete').length;
    const hunkHeader = `@@ -${startA},${countA} +${startB},${countB} @@`;

    rows.push({ type: 'hunk', text: '', hunkHeader, hunkIndex, canExpand });
    for (const op of hunk) {
      if (op.type === 'equal') rows.push({ type: 'context', text: op.value });
      else if (op.type === 'delete') rows.push({ type: 'delete', text: op.value });
      else rows.push({ type: 'insert', text: op.value });
    }

    // Always advance by standard slice end to avoid duplicates with next hunk
    pos = end + Math.min(context, trueTrailing) + 1;
    hunkIndex++;
  }

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type !== 'delete') continue;
    let di = i;
    while (di < rows.length && rows[di].type === 'delete') di++;
    let ii2 = di;
    while (ii2 < rows.length && rows[ii2].type === 'insert') ii2++;
    const pairCount = Math.min(di - i, ii2 - di);
    for (let k = 0; k < pairCount; k++) {
      rows[i + k].pairText = rows[di + k].text;
      rows[di + k].pairText = rows[i + k].text;
    }
    i = ii2 - 1;
  }

  return rows;
}

function buildUnifiedPatch(ops: DiffOp[], context = 3): string {
  const lines: string[] = [];

  const lineNums: { a: number; b: number }[] = [];
  let la = 1, lb = 1;
  for (const op of ops) {
    lineNums.push({ a: la, b: lb });
    if (op.type === 'equal' || op.type === 'delete') la++;
    if (op.type === 'equal' || op.type === 'insert') lb++;
  }

  let hunkStart = 0;
  while (hunkStart < ops.length) {
    let s = hunkStart;
    while (s < ops.length && ops[s].type === 'equal') s++;
    if (s === ops.length) break;

    const ctxBefore = Math.min(context, s - hunkStart);
    let end = s;
    let trailing = 0;
    for (let k = s; k < ops.length; k++) {
      if (ops[k].type !== 'equal') { end = k; trailing = 0; }
      else { trailing++; if (trailing > context) break; }
    }
    const sliceStart = s - ctxBefore;
    const sliceEnd = end + Math.min(context, trailing) + 1;
    const hunk = ops.slice(sliceStart, sliceEnd);

    const startA = lineNums[sliceStart].a;
    const startB = lineNums[sliceStart].b;
    const countA = hunk.filter(op => op.type !== 'insert').length;
    const countB = hunk.filter(op => op.type !== 'delete').length;
    lines.push(`@@ -${startA},${countA} +${startB},${countB} @@`);

    for (const op of hunk) {
      if (op.type === 'equal') lines.push(' ' + op.value);
      else if (op.type === 'delete') lines.push('-' + op.value);
      else lines.push('+' + op.value);
    }
    hunkStart = sliceEnd;
  }
  return lines.join('\n');
}

// ─── Component ───────────────────────────────────────────────────────────────

type ViewMode = 'sidebyside' | 'unified';

export default function TextDiff({ initialData }: { initialData?: string | null }) {
  const [left, setLeft] = useState(initialData ?? '');
  const [right, setRight] = useState('');
  const [ignoreWs, setIgnoreWs] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [hideEqual, setHideEqual] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('sidebyside');
  const [activeHunk, setActiveHunk] = useState(0);
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(new Set());
  const [wordWrap, setWordWrap] = useState(true);
  const [leftDragOver, setLeftDragOver] = useState(false);
  const [rightDragOver, setRightDragOver] = useState(false);
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLg(mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      setIsLg(e.matches);
      if (!e.matches) setViewMode('unified');
    };
    mq.addEventListener('change', handler);
    if (!mq.matches) setViewMode('unified');
    return () => mq.removeEventListener('change', handler);
  }, []);

  const leftFileRef = useRef<HTMLInputElement>(null);
  const rightFileRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback((file: File, setter: (v: string) => void) => {
    const reader = new FileReader();
    reader.onload = e => setter((e.target?.result as string) ?? '');
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: { preventDefault(): void; dataTransfer: DataTransfer }, setter: (v: string) => void, setDrag: (v: boolean) => void) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file, setter);
  }, [readFile]);

  const { ops, stats } = useMemo(() => {
    const leftLines = left.split(/\r?\n/);
    const rightLines = right.split(/\r?\n/);
    const normLeft = leftLines.map(line => normalise(line, ignoreWs, ignoreCase));
    const normRight = rightLines.map(line => normalise(line, ignoreWs, ignoreCase));
    const normOps = lcsLineDiff(normLeft, normRight);

    const remapped: DiffOp[] = [];
    let ll = 0, rr = 0;
    for (const op of normOps) {
      if (op.type === 'equal') { remapped.push({ type: 'equal', value: leftLines[ll] ?? '' }); ll++; rr++; }
      else if (op.type === 'delete') { remapped.push({ type: 'delete', value: leftLines[ll] ?? '' }); ll++; }
      else { remapped.push({ type: 'insert', value: rightLines[rr] ?? '' }); rr++; }
    }

    const added = remapped.filter(o => o.type === 'insert').length;
    const removed = remapped.filter(o => o.type === 'delete').length;
    const equal = remapped.filter(o => o.type === 'equal').length;
    return { ops: remapped, stats: { added, removed, equal } };
  }, [left, right, ignoreWs, ignoreCase]);

  const rows = useMemo(() => {
    const all = buildSideBySide(ops);
    return hideEqual ? all.filter(r => r.type !== 'equal') : all;
  }, [ops, hideEqual]);

  const unifiedRows = useMemo(() => buildUnifiedDisplayRows(ops, 3, expandedHunks), [ops, expandedHunks]);
  const unifiedPatch = useMemo(() => buildUnifiedPatch(ops), [ops]);

  const hunkCount = useMemo(() => {
    if (viewMode === 'sidebyside') {
      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].type !== 'equal' && (i === 0 || rows[i - 1].type === 'equal')) count++;
      }
      return count;
    }
    return unifiedRows.filter(r => r.type === 'hunk').length;
  }, [rows, unifiedRows, viewMode]);

  // Reset navigation + expansions when diff or view changes
  useEffect(() => { setActiveHunk(0); setExpandedHunks(new Set()); }, [ops, viewMode]);

  const onExpandHunk = useCallback((idx: number) => {
    setExpandedHunks(prev => { const next = new Set(prev); next.add(idx); return next; });
  }, []);

  const hasDiff = stats.added > 0 || stats.removed > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <GitCompare size={24} className="text-blue-600" />
          Text Compare
        </h2>
        <p className="text-sm text-slate-500 mt-1">Compare two texts or files side-by-side with line-level diff highlighting.</p>
      </div>

      {/* Options bar */}
      <div className="flex flex-wrap items-center gap-3 lg:gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none min-h-[44px] lg:min-h-0">
          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={ignoreWs} onChange={e => setIgnoreWs(e.target.checked)} />
          <span className="text-[11px] font-black text-slate-600 uppercase tracking-wide">Ignore whitespace</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none min-h-[44px] lg:min-h-0">
          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={ignoreCase} onChange={e => setIgnoreCase(e.target.checked)} />
          <span className="text-[11px] font-black text-slate-600 uppercase tracking-wide">Ignore case</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none min-h-[44px] lg:min-h-0">
          <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={hideEqual} onChange={e => setHideEqual(e.target.checked)} />
          <span className="text-[11px] font-black text-slate-600 uppercase tracking-wide">Hide unchanged</span>
        </label>

        {/* Swap button — visible on mobile only (since the center overlay is hidden) */}
        <button type="button" onClick={() => { setLeft(right); setRight(left); }} title="Swap A ↔ B"
          className="flex lg:hidden items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-[11px] font-black uppercase tracking-wide text-slate-500 border border-slate-200 hover:text-blue-600 hover:border-blue-400 transition-all">
          <ArrowLeftRight size={13} /> Swap
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setWordWrap(w => !w)} title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
            className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all border ${
              wordWrap ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'
            }`}>
            <WrapText size={13} /> Wrap
          </button>
          <div className="hidden lg:flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button type="button" onClick={() => setViewMode('sidebyside')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wide transition-all ${
                viewMode === 'sidebyside' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Columns2 size={13} /> Side by Side
            </button>
            <button type="button" onClick={() => setViewMode('unified')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-black uppercase tracking-wide transition-all ${
                viewMode === 'unified' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <AlignJustify size={13} /> Unified
            </button>
          </div>
        </div>
      </div>

      {/* Input panels */}
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Original (A)</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => leftFileRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                <Upload size={12} /> Import file
              </button>
              <button type="button" title="Clear original text" aria-label="Clear original text" onClick={() => setLeft('')}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                <Eraser size={12} />
              </button>
            </div>
          </div>
          <textarea
            value={left}
            onChange={e => setLeft(e.target.value)}
            onDragOver={e => { e.preventDefault(); setLeftDragOver(true); }}
            onDragLeave={() => setLeftDragOver(false)}
            onDrop={e => handleDrop(e, setLeft, setLeftDragOver)}
            placeholder={leftDragOver ? 'Drop file here…' : 'Paste original text or drop a file here…'}
            className={`w-full h-56 font-mono text-xs bg-white border rounded-xl p-4 resize-none focus:outline-none focus:ring-2 text-slate-700 placeholder-slate-300 transition-colors ${
              leftDragOver
                ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-400/30'
                : 'border-slate-200 focus:ring-blue-500/30 focus:border-blue-400'
            }`}
            spellCheck={false}
          />
          <input ref={leftFileRef} type="file" aria-label="Import original file" className="hidden"
            onChange={e => e.target.files?.[0] && readFile(e.target.files[0], setLeft)} />
        </div>

        {/* Swap button */}
        <button type="button" onClick={() => { setLeft(right); setRight(left); }} title="Swap A ↔ B" aria-label="Swap A and B"
          className="hidden lg:flex absolute left-1/2 top-[calc(50%+0.75rem)] -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center bg-white border border-slate-200 rounded-full shadow-sm text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:shadow-md transition-all">
          <ArrowLeftRight size={14} />
        </button>

        {/* Right */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Modified (B)</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => rightFileRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                <Upload size={12} /> Import file
              </button>
              <button type="button" title="Clear modified text" aria-label="Clear modified text" onClick={() => setRight('')}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                <Eraser size={12} />
              </button>
            </div>
          </div>
          <textarea
            value={right}
            onChange={e => setRight(e.target.value)}
            onDragOver={e => { e.preventDefault(); setRightDragOver(true); }}
            onDragLeave={() => setRightDragOver(false)}
            onDrop={e => handleDrop(e, setRight, setRightDragOver)}
            placeholder={rightDragOver ? 'Drop file here…' : 'Paste modified text or drop a file here…'}
            className={`w-full h-56 font-mono text-xs bg-white border rounded-xl p-4 resize-none focus:outline-none focus:ring-2 text-slate-700 placeholder-slate-300 transition-colors ${
              rightDragOver
                ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-400/30'
                : 'border-slate-200 focus:ring-blue-500/30 focus:border-blue-400'
            }`}
            spellCheck={false}
          />
          <input ref={rightFileRef} type="file" aria-label="Import modified file" className="hidden"
            onChange={e => e.target.files?.[0] && readFile(e.target.files[0], setRight)} />
        </div>
      </div>

      {/* Stats bar */}
      {(left || right) && (
        <div className="flex flex-wrap items-center gap-3 lg:gap-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Result</span>
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            +{stats.added} added
          </span>
          <span className="flex items-center gap-1.5 text-xs font-bold text-red-500">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            -{stats.removed} removed
          </span>
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
            {stats.equal} unchanged
          </span>
          {!hasDiff && left && right && (
            <span className="ml-2 text-xs font-black text-blue-600 uppercase tracking-wide">
              ✓ Files are identical
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Hunk navigation */}
            {hasDiff && hunkCount > 0 && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setActiveHunk(h => Math.max(0, h - 1))}
                  disabled={activeHunk === 0}
                  title="Previous change"
                  aria-label="Previous change"
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <ChevronUp size={14} />
                </button>
                <span className="text-[11px] font-black text-slate-500 tabular-nums min-w-[2.5rem] text-center">
                  {activeHunk + 1}/{hunkCount}
                </span>
                <button type="button" onClick={() => setActiveHunk(h => Math.min(hunkCount - 1, h + 1))}
                  disabled={activeHunk === hunkCount - 1}
                  title="Next change"
                  aria-label="Next change"
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <ChevronDown size={14} />
                </button>
              </div>
            )}
            <CopyButton text={unifiedPatch} label="Copy patch" />
          </div>
        </div>
      )}

      {/* Diff output */}
      {(left || right) && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {viewMode === 'sidebyside' ? (
            <SideBySideView rows={rows} activeHunk={activeHunk} wordWrap={wordWrap} />
          ) : (
            <UnifiedView rows={unifiedRows} activeHunk={activeHunk} wordWrap={wordWrap} onExpandHunk={onExpandHunk} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Side-by-side view ───────────────────────────────────────────────────────

function SideBySideView({ rows, activeHunk, wordWrap }: { rows: SideBySideRow[]; activeHunk: number; wordWrap: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hunkRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // Precompute which row index starts each hunk
  const rowToHunkId = useMemo(() => {
    const map = new Map<number, number>();
    let hunkId = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].type !== 'equal' && (i === 0 || rows[i - 1].type === 'equal')) {
        map.set(i, hunkId++);
      }
    }
    return map;
  }, [rows]);

  useEffect(() => {
    const el = hunkRefs.current[activeHunk];
    const container = scrollRef.current;
    if (!el || !container) return;
    container.scrollTo({ top: Math.max(0, el.offsetTop - 48), behavior: 'smooth' });
  }, [activeHunk]);

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 text-sm font-semibold">
        No differences to show
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="overflow-auto max-h-[600px]">
      <table className={`w-full border-collapse font-mono text-xs ${wordWrap ? 'table-fixed' : ''}`}>
        <colgroup>
          <col className="w-12" />
          <col className="w-1/2" />
          <col className="w-12" />
          <col className="w-1/2" />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-100 border-b border-slate-200">
            <th className="px-2 py-2 text-[10px] font-black text-slate-400 text-right">#</th>
            <th className="px-4 py-2 text-[10px] font-black text-slate-500 text-left uppercase tracking-wider">Original (A)</th>
            <th className="px-2 py-2 text-[10px] font-black text-slate-400 text-right">#</th>
            <th className="px-4 py-2 text-[10px] font-black text-slate-500 text-left uppercase tracking-wider">Modified (B)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const hunkId = rowToHunkId.get(idx);
            const inline = row.type === 'change' && row.left !== null && row.right !== null
              ? inlineDiff(row.left, row.right) : null;

            return (
              <tr
                key={idx}
                ref={hunkId !== undefined ? (el => { hunkRefs.current[hunkId] = el; }) : undefined}
                className={`border-b border-slate-100 ${row.type === 'equal' ? 'bg-white hover:bg-slate-50' : ''}`}
              >
                <td className={`px-2 py-0.5 text-right select-none border-r text-[11px] ${
                  row.type === 'delete' || row.type === 'change'
                    ? 'bg-red-50 border-red-200 text-red-300'
                    : row.left === null ? 'bg-slate-50 border-slate-100 text-slate-200' : 'border-slate-100 text-slate-300'
                }`}>
                  {row.leftNo}
                </td>
                <td className={`px-4 py-0.5 align-top ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${
                  row.type === 'delete' || row.type === 'change' ? 'bg-red-50 text-red-800' :
                  row.left === null ? 'bg-slate-50' : 'text-slate-700'
                }`}>
                  {(row.type === 'delete' || row.type === 'change') && row.left !== null ? (
                    <span className="opacity-90">
                      <span className="text-red-400 select-none mr-1">-</span>
                      {inline ? <InlineSpans ops={inline.left} /> : row.left}
                    </span>
                  ) : row.left !== null ? <span>{row.left}</span> : null}
                </td>
                <td className={`px-2 py-0.5 text-right select-none border-r border-l text-[11px] ${
                  row.type === 'insert' || row.type === 'change'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-300'
                    : row.right === null ? 'bg-slate-50 border-slate-100 text-slate-200' : 'border-slate-100 text-slate-300'
                }`}>
                  {row.rightNo}
                </td>
                <td className={`px-4 py-0.5 align-top ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${
                  row.type === 'insert' || row.type === 'change' ? 'bg-emerald-50 text-emerald-800' :
                  row.right === null ? 'bg-slate-50' : 'text-slate-700'
                }`}>
                  {(row.type === 'insert' || row.type === 'change') && row.right !== null ? (
                    <span className="opacity-90">
                      <span className="text-emerald-500 select-none mr-1">+</span>
                      {inline ? <InlineSpans ops={inline.right} /> : row.right}
                    </span>
                  ) : row.right !== null ? <span>{row.right}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Unified view ────────────────────────────────────────────────────────────

function UnifiedView({ rows, activeHunk, wordWrap, onExpandHunk }: {
  rows: UnifiedDisplayRow[];
  activeHunk: number;
  wordWrap: boolean;
  onExpandHunk: (idx: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hunkRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  useEffect(() => {
    const el = hunkRefs.current[activeHunk];
    const container = scrollRef.current;
    if (!el || !container) return;
    container.scrollTo({ top: Math.max(0, el.offsetTop - 48), behavior: 'smooth' });
  }, [activeHunk]);

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400 text-sm font-semibold">
        No differences to show
      </div>
    );
  }

  let hunkCounter = -1;

  return (
    <div ref={scrollRef} className="overflow-auto max-h-[600px]">
      <table className={`w-full border-collapse font-mono text-xs ${wordWrap ? 'table-fixed' : ''}`}>
        <colgroup>
          <col className="w-8" />
          <col className="w-full" />
        </colgroup>
        <tbody>
          {rows.map((row, i) => {
            if (row.type === 'hunk') {
              hunkCounter++;
              const currentHunk = hunkCounter;
              return (
                <tr key={i} ref={el => { hunkRefs.current[currentHunk] = el; }}
                  className="bg-slate-800 border-b border-slate-700">
                  <td className="px-2 py-1 text-slate-500 select-none text-center text-[10px]">⋯</td>
                  <td className="px-4 py-1 text-slate-300 font-mono text-[11px] font-semibold tracking-tight">
                    <span className="mr-3">{row.hunkHeader}</span>
                    {row.canExpand && (
                      <button type="button"
                        onClick={() => onExpandHunk(row.hunkIndex!)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide text-slate-400 hover:text-white hover:bg-slate-600 transition-all"
                        title="Show more context">
                        <ChevronsUpDown size={11} /> more context
                      </button>
                    )}
                  </td>
                </tr>
              );
            }

            if (row.type === 'context') {
              return (
                <tr key={i} className="bg-white hover:bg-slate-50 border-b border-slate-100">
                  <td className="px-2 py-0.5 text-slate-300 select-none text-right text-[10px] border-r border-slate-100" />
                  <td className={`px-4 py-0.5 text-slate-600 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>{row.text}</td>
                </tr>
              );
            }

            if (row.type === 'delete') {
              const ops = row.pairText !== undefined ? inlineDiff(row.text, row.pairText).left : null;
              return (
                <tr key={i} className="bg-red-50 border-b border-red-100">
                  <td className="px-2 py-0.5 text-red-300 select-none text-center border-r border-red-100">-</td>
                  <td className={`px-4 py-0.5 text-red-800 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                    {ops ? <InlineSpans ops={ops} /> : row.text}
                  </td>
                </tr>
              );
            }

            // insert
            const ops = row.pairText !== undefined ? inlineDiff(row.pairText, row.text).right : null;
            return (
              <tr key={i} className="bg-emerald-50 border-b border-emerald-100">
                <td className="px-2 py-0.5 text-emerald-400 select-none text-center border-r border-emerald-100">+</td>
                <td className={`px-4 py-0.5 text-emerald-800 ${wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
                  {ops ? <InlineSpans ops={ops} /> : row.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
