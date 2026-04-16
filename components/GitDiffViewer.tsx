import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  GitCompare, FileDiff, Plus, Minus, FilePlus2, FileMinus2, FileX,
  ChevronDown, ChevronRight, Columns, AlignJustify, Copy, Check,
  Expand, Shrink, PanelLeft, PanelLeftClose, Space,
} from 'lucide-react';
import hljs from 'highlight.js/lib/common';
import {
  parseGitDiff, hunkToSideBySide, diffWords, getLanguageFromPath, isWhitespaceOnlyFile,
  SAMPLES,
  type DiffFile, type DiffLine, type FileStatus, type WordSegment,
} from '../utils/gitDiffParser';

type ViewMode = 'split' | 'unified';
type StatusFilter = 'all' | FileStatus;

// ── Utilities ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightCode(code: string, lang: string | null): string {
  if (!code) return '';
  if (!lang) return escapeHtml(code);
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

// ── File status styling ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<FileStatus, { label: string; className: string; icon: React.ReactNode }> = {
  added:    { label: 'Added',    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <FilePlus2 size={10} /> },
  deleted:  { label: 'Deleted',  className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',                 icon: <FileMinus2 size={10} /> },
  renamed:  { label: 'Renamed',  className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',         icon: <FileDiff size={10} /> },
  modified: { label: 'Modified', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',              icon: <FileDiff size={10} /> },
  binary:   { label: 'Binary',   className: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',             icon: <FileX size={10} /> },
};

// ── Line row helpers ───────────────────────────────────────────────────────────

function LineNo({ n }: { n: number | undefined }) {
  return (
    <span className="select-none inline-block w-10 text-right pr-2 text-[10px] font-mono text-slate-400 dark:text-slate-500 flex-shrink-0 pt-[1px]">
      {n ?? ''}
    </span>
  );
}

function lineBg(type: DiffLine['type'], side: 'left' | 'right' | 'unified') {
  if (type === 'add') return 'bg-emerald-50 dark:bg-emerald-950/40';
  if (type === 'del') return 'bg-red-50 dark:bg-red-950/40';
  return side === 'unified' ? '' : 'bg-slate-50/40 dark:bg-slate-900/40';
}

function linePrefix(type: DiffLine['type']) {
  if (type === 'add') return <span className="text-emerald-600 dark:text-emerald-400">+</span>;
  if (type === 'del') return <span className="text-red-600 dark:text-red-400">-</span>;
  return <span className="text-slate-300 dark:text-slate-600">&nbsp;</span>;
}

// ── Line content renderer (word-diff + syntax highlighting) ────────────────────

function LineContent({ content, lang, segments, side }: {
  content: string;
  lang: string | null;
  segments?: WordSegment[];
  side: 'left' | 'right';
}) {
  if (!segments || segments.length <= 1 || segments.every(s => s.type === 'equal')) {
    return <span dangerouslySetInnerHTML={{ __html: highlightCode(content, lang) || '&nbsp;' }} />;
  }

  const highlightCls = side === 'left'
    ? 'bg-red-200/70 text-red-900 dark:bg-red-800/60 dark:text-red-100'
    : 'bg-emerald-200/70 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100';

  const targetType = side === 'left' ? 'removed' : 'added';

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'equal') {
          return <span key={i} dangerouslySetInnerHTML={{ __html: highlightCode(seg.text, lang) }} />;
        }
        if (seg.type === targetType) {
          return <span key={i} className={highlightCls}>{seg.text}</span>;
        }
        return null;
      })}
    </>
  );
}

// ── Split hunk view ────────────────────────────────────────────────────────────

function SplitHunk({ file }: { file: DiffFile }) {
  const lang = useMemo(() => getLanguageFromPath(file.newPath || file.oldPath), [file]);

  return (
    <div className="font-mono text-[12px]">
      {file.hunks.map((hunk, hi) => {
        const rows = hunkToSideBySide(hunk);
        return (
          <div key={hi} className="border-t border-slate-200 dark:border-slate-800">
            <div className="bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 px-3 py-1 text-[11px] italic border-b border-sky-200/50 dark:border-sky-800/50">
              {hunk.header}
            </div>
            {rows.map((row, ri) => {
              // Compute word diff for paired del/add rows
              let wordDiff: { left: WordSegment[]; right: WordSegment[] } | null = null;
              if (row.left?.type === 'del' && row.right?.type === 'add') {
                wordDiff = diffWords(row.left.content, row.right.content);
              }

              const leftLine = row.left;
              const rightLine = row.right;
              const leftType = leftLine?.type ?? 'context';
              const rightType = rightLine?.type ?? 'context';

              return (
                <div key={ri} className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800">
                  {/* Left (old) */}
                  <div className={`flex items-start ${leftLine ? lineBg(leftType, 'left') : 'bg-slate-100/50 dark:bg-slate-800/30'}`}>
                    <LineNo n={leftLine?.oldLineNo} />
                    <span className="w-4 text-center flex-shrink-0 text-[10px] pt-[1px]">{leftLine ? linePrefix(leftType) : ''}</span>
                    <pre className="flex-1 min-w-0 px-1 py-[1px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                      {leftLine ? (
                        <LineContent content={leftLine.content} lang={lang} segments={wordDiff?.left} side="left" />
                      ) : ''}
                    </pre>
                  </div>
                  {/* Right (new) */}
                  <div className={`flex items-start ${rightLine ? lineBg(rightType, 'right') : 'bg-slate-100/50 dark:bg-slate-800/30'}`}>
                    <LineNo n={rightLine?.newLineNo} />
                    <span className="w-4 text-center flex-shrink-0 text-[10px] pt-[1px]">{rightLine ? linePrefix(rightType) : ''}</span>
                    <pre className="flex-1 min-w-0 px-1 py-[1px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                      {rightLine ? (
                        <LineContent content={rightLine.content} lang={lang} segments={wordDiff?.right} side="right" />
                      ) : ''}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Unified hunk view ──────────────────────────────────────────────────────────

function UnifiedHunk({ file }: { file: DiffFile }) {
  const lang = useMemo(() => getLanguageFromPath(file.newPath || file.oldPath), [file]);

  return (
    <div className="font-mono text-[12px]">
      {file.hunks.map((hunk, hi) => {
        // Pre-compute word diff for consecutive del/add runs
        const wordDiffs = new Map<number, WordSegment[]>();
        const lines = hunk.lines;
        let i = 0;
        while (i < lines.length) {
          if (lines[i].type === 'del') {
            const delStart = i;
            while (i < lines.length && lines[i].type === 'del') i++;
            const addStart = i;
            while (i < lines.length && lines[i].type === 'add') i++;
            const dels = lines.slice(delStart, addStart);
            const adds = lines.slice(addStart, i);
            const pairs = Math.min(dels.length, adds.length);
            for (let p = 0; p < pairs; p++) {
              const wd = diffWords(dels[p].content, adds[p].content);
              wordDiffs.set(delStart + p, wd.left);
              wordDiffs.set(addStart + p, wd.right);
            }
          } else {
            i++;
          }
        }

        return (
          <div key={hi} className="border-t border-slate-200 dark:border-slate-800">
            <div className="bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 px-3 py-1 text-[11px] italic border-b border-sky-200/50 dark:border-sky-800/50">
              {hunk.header}
            </div>
            {hunk.lines.map((line, li) => {
              const segs = wordDiffs.get(li);
              const side: 'left' | 'right' = line.type === 'del' ? 'left' : 'right';
              return (
                <div key={li} className={`flex items-start ${lineBg(line.type, 'unified')}`}>
                  <LineNo n={line.oldLineNo} />
                  <LineNo n={line.newLineNo} />
                  <span className="w-4 text-center flex-shrink-0 text-[10px] pt-[1px]">{linePrefix(line.type)}</span>
                  <pre className="flex-1 min-w-0 px-1 py-[1px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                    <LineContent content={line.content} lang={lang} segments={segs} side={side} />
                  </pre>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── File card ──────────────────────────────────────────────────────────────────

interface FileCardProps {
  file: DiffFile;
  index: number;
  viewMode: ViewMode;
  expanded: boolean;
  onToggle: () => void;
  fileRef: (el: HTMLElement | null) => void;
}

function FileCard({ file, viewMode, expanded, onToggle, fileRef }: FileCardProps) {
  const badge = STATUS_BADGE[file.status];
  const title = file.status === 'renamed'
    ? `${file.oldPath} → ${file.newPath}`
    : file.newPath || file.oldPath;

  return (
    <section ref={fileRef} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm scroll-mt-4">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {expanded ? <ChevronDown size={14} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />}
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${badge.className}`}>
            {badge.icon} {badge.label}
          </span>
          <code className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">{title}</code>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-[10px] font-bold">
          {file.additions > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
              <Plus size={10} /> {file.additions}
            </span>
          )}
          {file.deletions > 0 && (
            <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
              <Minus size={10} /> {file.deletions}
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          {file.isBinary ? (
            <div className="px-4 py-6 text-center text-sm italic text-slate-400">
              Binary file — diff not shown
            </div>
          ) : viewMode === 'split' ? (
            <SplitHunk file={file} />
          ) : (
            <UnifiedHunk file={file} />
          )}
        </div>
      )}
    </section>
  );
}

// ── File sidebar ───────────────────────────────────────────────────────────────

function FileSidebar({ files, onJumpTo }: { files: DiffFile[]; onJumpTo: (i: number) => void }) {
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Files</span>
        <span className="text-[10px] font-bold text-slate-400">{files.length}</span>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {files.map((file, i) => {
          const badge = STATUS_BADGE[file.status];
          const name = (file.newPath || file.oldPath).split('/').pop() || file.oldPath;
          const dir = (file.newPath || file.oldPath).split('/').slice(0, -1).join('/');
          return (
            <li key={i}>
              <button
                onClick={() => onJumpTo(i)}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex flex-col gap-1"
                title={file.newPath || file.oldPath}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${badge.className}`} title={badge.label}>
                    {badge.icon}
                  </span>
                  <code className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">{name}</code>
                </div>
                <div className="flex items-center justify-between pl-6">
                  {dir && <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{dir}/</span>}
                  <span className="flex items-center gap-1.5 text-[10px] font-bold ml-auto">
                    {file.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>}
                    {file.deletions > 0 && <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GitDiffViewer({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set());
  const [sampleOpen, setSampleOpen] = useState(false);

  const fileRefs = useRef<Array<HTMLElement | null>>([]);
  const sampleDropdownRef = useRef<HTMLDivElement>(null);

  // Close sample dropdown on outside click
  useEffect(() => {
    if (!sampleOpen) return;
    const handler = (e: MouseEvent) => {
      if (sampleDropdownRef.current && !sampleDropdownRef.current.contains(e.target as Node)) {
        setSampleOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sampleOpen]);

  useEffect(() => {
    if (initialData) setInput(initialData);
  }, [initialData]);

  const parsed = useMemo(() => (input.trim() ? parseGitDiff(input) : null), [input]);

  // Reset collapse when input changes
  useEffect(() => {
    setCollapsedFiles(new Set());
  }, [input]);

  // Apply filters
  const visibleFiles = useMemo(() => {
    if (!parsed) return [];
    return parsed.files
      .map((file, origIdx) => ({ file, origIdx }))
      .filter(({ file }) => {
        if (ignoreWhitespace && isWhitespaceOnlyFile(file)) return false;
        if (filter === 'all') return true;
        return file.status === filter;
      });
  }, [parsed, filter, ignoreWhitespace]);

  const availableStatuses = useMemo(() => {
    const s = new Set<FileStatus>();
    parsed?.files.forEach(f => s.add(f.status));
    return s;
  }, [parsed]);

  const handleCopy = () => {
    navigator.clipboard.writeText(input);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFile = useCallback((idx: number) => {
    setCollapsedFiles(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const expandAll = () => setCollapsedFiles(new Set());
  const collapseAll = () => {
    if (!parsed) return;
    setCollapsedFiles(new Set(parsed.files.map((_, i) => i)));
  };

  const jumpToFile = (origIdx: number) => {
    const el = fileRefs.current[origIdx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Auto-expand on jump
    setCollapsedFiles(prev => {
      if (!prev.has(origIdx)) return prev;
      const next = new Set(prev);
      next.delete(origIdx);
      return next;
    });
  };

  const filterButtons: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all',      label: 'All' },
    { value: 'added',    label: 'Added' },
    { value: 'modified', label: 'Modified' },
    { value: 'deleted',  label: 'Deleted' },
    { value: 'renamed',  label: 'Renamed' },
  ];

  return (
    <div className="space-y-6">
      {/* Input panel */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <GitCompare size={13} /> Git Diff Input
          </span>
          <div className="flex items-center gap-3">
            <div className="relative" ref={sampleDropdownRef}>
              <button
                onClick={() => setSampleOpen(v => !v)}
                className="text-[10px] font-black text-blue-500 hover:text-blue-700 uppercase tracking-widest transition-colors flex items-center gap-1"
              >
                Load Sample {sampleOpen ? <ChevronDown size={10} className="rotate-180" /> : <ChevronDown size={10} />}
              </button>
              {sampleOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 min-w-[210px] overflow-hidden">
                  {Object.entries(SAMPLES).map(([key, s]) => (
                    <button
                      key={key}
                      onClick={() => { setInput(s.code); setSampleOpen(false); }}
                      className="block w-full text-left px-4 py-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleCopy}
              disabled={!input}
              className="text-[10px] font-black text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 uppercase tracking-widest transition-colors flex items-center gap-1 disabled:opacity-40"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={'Paste the output of `git diff`, `git show`, or a .patch file here...'}
          spellCheck={false}
          className="w-full p-6 resize-none focus:outline-none font-mono text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-300 dark:placeholder:text-slate-600 bg-white dark:bg-slate-900 leading-relaxed min-h-[195px]"
        />
      </section>

      {parsed && parsed.files.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="space-y-3">
            {/* Row 1: stats + primary toggles */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-4 text-xs font-bold flex-wrap">
                <span className="text-slate-600 dark:text-slate-300">
                  <span className="text-slate-900 dark:text-slate-100">{visibleFiles.length}</span>
                  {visibleFiles.length !== parsed.files.length && <span className="text-slate-400"> / {parsed.files.length}</span>}
                  {' '}file{visibleFiles.length !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Plus size={12} /> {parsed.totalAdditions}
                </span>
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <Minus size={12} /> {parsed.totalDeletions}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setIgnoreWhitespace(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                    ignoreWhitespace
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                  title="Hide files with only whitespace changes"
                >
                  <Space size={11} /> Ignore Whitespace
                </button>
                <button
                  onClick={() => setSidebarOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
                  title={sidebarOpen ? 'Hide file sidebar' : 'Show file sidebar'}
                >
                  {sidebarOpen ? <PanelLeftClose size={11} /> : <PanelLeft size={11} />}
                  Sidebar
                </button>
                <button
                  onClick={expandAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
                >
                  <Expand size={11} /> Expand All
                </button>
                <button
                  onClick={collapseAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
                >
                  <Shrink size={11} /> Collapse All
                </button>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 gap-0.5">
                  <button
                    onClick={() => setViewMode('split')}
                    className={`flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      viewMode === 'split'
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Columns size={11} /> Split
                  </button>
                  <button
                    onClick={() => setViewMode('unified')}
                    className={`flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                      viewMode === 'unified'
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <AlignJustify size={11} /> Unified
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: status filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {filterButtons.map(btn => {
                const disabled = btn.value !== 'all' && !availableStatuses.has(btn.value);
                const active = filter === btn.value;
                return (
                  <button
                    key={btn.value}
                    onClick={() => !disabled && setFilter(btn.value)}
                    disabled={disabled}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                      active
                        ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900 shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main layout: sidebar + content */}
          <div className={sidebarOpen ? 'grid gap-6 lg:grid-cols-[280px_1fr]' : ''}>
            {sidebarOpen && (
              <FileSidebar files={parsed.files} onJumpTo={jumpToFile} />
            )}
            <div className="space-y-4 min-w-0">
              {visibleFiles.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm italic text-slate-400">
                  No files match the current filter.
                </div>
              ) : (
                visibleFiles.map(({ file, origIdx }) => (
                  <FileCard
                    key={origIdx}
                    file={file}
                    index={origIdx}
                    viewMode={viewMode}
                    expanded={!collapsedFiles.has(origIdx)}
                    onToggle={() => toggleFile(origIdx)}
                    fileRef={el => { fileRefs.current[origIdx] = el; }}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}

      {parsed && parsed.files.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center text-sm text-amber-700 dark:text-amber-300">
          No diff hunks found. Make sure the input starts with <code className="font-mono font-bold">diff --git</code> or <code className="font-mono font-bold">---</code>.
        </div>
      )}
    </div>
  );
}
