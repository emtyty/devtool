import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, X, Settings, Search, Download, ChevronRight, Clock, HardDrive,
  Activity, AlertTriangle, Filter, Pencil, CheckCircle, Trash2, Info,
  GitCompare, Layers, BarChart2, ChevronDown, ChevronUp, ZoomOut,
  Copy, Check, TrendingUp, TrendingDown, Minus, Globe,
} from 'lucide-react';
import {
  DEFAULT_RULES, Rule, HarEntry, LogEntry, ParseResult, Operator, RuleTarget, Severity,
  computeSummary, normalizeUrlPattern, detectDuplicates, DuplicateGroup,
  getCacheInfo, getCompressionInfo, getPerfInsight, generateCurl, HarSummary,
} from '../lib/harAnalyzer';

// ── Toast ─────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; type: ToastType }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const push = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 2800);
  }, [dismiss]);
  return { toasts, push, dismiss };
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-200 ${
            t.type === 'success' ? 'bg-emerald-600 text-white' :
            t.type === 'error'   ? 'bg-red-600 text-white' :
                                   'bg-slate-700 text-white'
          }`}
        >
          {t.type === 'success' && <CheckCircle size={15} className="shrink-0" />}
          {t.type === 'error'   && <AlertTriangle size={15} className="shrink-0" />}
          {t.type === 'info'    && <Info size={15} className="shrink-0" />}
          <span>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-1 opacity-70 hover:opacity-100 cursor-pointer">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function statusColor(status: number): string {
  if (status >= 500) return 'text-red-500 dark:text-red-400';
  if (status >= 400) return 'text-orange-500 dark:text-orange-400';
  if (status >= 300) return 'text-slate-400';
  if (status >= 200) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-slate-400';
}

function statusBg(status: number): string {
  if (status >= 500) return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (status >= 400) return 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  if (status >= 300) return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  if (status >= 200) return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
}

function methodColor(method: string): string {
  switch (method) {
    case 'GET':     return 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
    case 'POST':    return 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400';
    case 'PUT':     return 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
    case 'DELETE':  return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400';
    case 'PATCH':   return 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
    default:        return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  }
}

function levelColor(level: LogEntry['level']): string {
  switch (level) {
    case 'error':   return 'text-red-500 dark:text-red-400';
    case 'warn':    return 'text-amber-500 dark:text-amber-400';
    case 'info':    return 'text-blue-500 dark:text-blue-400';
    case 'debug':   return 'text-slate-400';
    default:        return 'text-slate-400';
  }
}

const TIMING_SEGMENTS: Array<{ key: keyof import('../lib/harAnalyzer').HarTimings; label: string; color: string }> = [
  { key: 'blocked', label: 'Blocked',  color: '#94a3b8' },
  { key: 'dns',     label: 'DNS',      color: '#a78bfa' },
  { key: 'connect', label: 'Connect',  color: '#fb923c' },
  { key: 'ssl',     label: 'SSL',      color: '#fbbf24' },
  { key: 'send',    label: 'Send',     color: '#60a5fa' },
  { key: 'wait',    label: 'TTFB',     color: '#3b82f6' },
  { key: 'receive', label: 'Download', color: '#34d399' },
];

// ── Sub-components ────────────────────────────────────────────────

function TagBadge({ tag, color }: { key?: React.Key; tag: string; color: string }) {
  return (
    <span
      className="inline-block text-[9px] font-black uppercase tracking-wide px-1 py-0.5 rounded"
      style={{ backgroundColor: color + '22', color }}
    >
      {tag}
    </span>
  );
}

// ── TimingBar (zoom-aware) ─────────────────────────────────────────

function TimingBar({
  entry, duration, zoomRange,
}: {
  entry: HarEntry;
  duration: number;
  zoomRange?: { start: number; end: number } | null;
}) {
  const viewDuration = zoomRange ? (zoomRange.end - zoomRange.start) : duration;
  const viewStart    = zoomRange ? zoomRange.start : 0;
  if (viewDuration <= 0) return null;

  const leftPct  = ((entry.relStartMs - viewStart) / viewDuration) * 100;
  const widthPct = Math.max(0.2, (entry.time / viewDuration) * 100);
  const total = TIMING_SEGMENTS.reduce((s, seg) => s + entry.timings[seg.key], 0) || entry.time;

  // Clip if out of range
  if (leftPct > 100 || leftPct + widthPct < 0) return null;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="absolute top-1/2 -translate-y-1/2 h-4 flex overflow-hidden rounded-sm"
        style={{ left: `${Math.max(0, leftPct)}%`, width: `${widthPct}%`, minWidth: 2 }}
      >
        {TIMING_SEGMENTS.map(seg => {
          const segWidth = (entry.timings[seg.key] / total) * 100;
          if (segWidth <= 0) return null;
          return (
            <div key={seg.key} style={{ width: `${segWidth}%`, backgroundColor: seg.color }} title={`${seg.label}: ${formatMs(entry.timings[seg.key])}`} />
          );
        })}
      </div>
    </div>
  );
}

const ROW_HEIGHT = 36;

interface WaterfallRowProps {
  key?: React.Key;
  entry: HarEntry;
  duration: number;
  isSelected: boolean;
  isCorrelated: boolean;
  isHighlighted?: boolean;
  logCount: number;
  onClick: () => void;
  onDoubleClick?: () => void;
  zoomRange?: { start: number; end: number } | null;
  sortKey?: string;
  indent?: boolean;
  isGroupRow?: boolean;
  groupCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

function WaterfallRow({
  entry, duration, isSelected, isCorrelated, isHighlighted, logCount, onClick, onDoubleClick,
  zoomRange, indent, isGroupRow, groupCount, isExpanded, onToggleExpand,
}: WaterfallRowProps) {
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`flex items-center gap-0 border-b border-slate-100 dark:border-slate-800 cursor-pointer select-none transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : isHighlighted
          ? 'bg-purple-50/70 dark:bg-purple-900/15 ring-1 ring-inset ring-purple-200 dark:ring-purple-800'
          : isCorrelated
          ? 'bg-amber-50/60 dark:bg-amber-900/10'
          : 'hover:bg-slate-50 dark:hover:bg-white/3'
      }`}
      style={{ height: ROW_HEIGHT }}
    >
      {/* Status */}
      <div className="w-12 shrink-0 px-2">
        <span className={`text-[11px] font-black ${statusColor(entry.status)}`}>{entry.status || '—'}</span>
      </div>

      {/* Method */}
      <div className="w-14 shrink-0 px-1">
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${methodColor(entry.method)}`}>{entry.method}</span>
      </div>

      {/* URL path */}
      <div className="w-40 shrink-0 px-2 overflow-hidden flex items-center gap-1">
        {indent && <span className="w-3 shrink-0" />}
        <div className="overflow-hidden">
          <span className="text-[11px] text-slate-700 dark:text-slate-300 truncate block" title={entry.url}>
            {entry.pathname}
          </span>
          <div className="flex gap-0.5 flex-wrap">
            {entry.tags.slice(0, 2).map((t, i) => <TagBadge key={i} tag={t.tag} color={t.color} />)}
            {isGroupRow && groupCount !== undefined && (
              <span className="text-[9px] font-black bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded px-1">
                ×{groupCount}
              </span>
            )}
          </div>
        </div>
        {isGroupRow && onToggleExpand && (
          <button
            onClick={e => { e.stopPropagation(); onToggleExpand(); }}
            className="ml-auto shrink-0 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}
      </div>

      {/* Timeline bar */}
      <div className="flex-1 px-1 h-full overflow-hidden">
        <TimingBar entry={entry} duration={duration} zoomRange={zoomRange} />
      </div>

      {/* Duration */}
      <div className="w-16 shrink-0 px-2 text-right">
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{formatMs(entry.time)}</span>
      </div>

      {/* Size */}
      <div className="w-14 shrink-0 px-2 text-right">
        <span className="text-[11px] font-mono text-slate-400">{formatBytes(entry.responseSize)}</span>
      </div>

      {/* Log indicator */}
      <div className="w-8 shrink-0 px-1 flex items-center justify-center">
        {logCount > 0 && (
          <span className="text-[9px] font-black bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded px-1">
            {logCount}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Timeline ruler (zoom-aware) ────────────────────────────────────

function logLevelDotColor(level: LogEntry['level']): string {
  switch (level) {
    case 'error': return '#ef4444';
    case 'warn':  return '#f59e0b';
    case 'info':  return '#3b82f6';
    case 'debug': return '#94a3b8';
    default:      return '#cbd5e1';
  }
}

function LogMarkers({
  logs, duration, selectedLog, onSelect, zoomRange,
}: {
  logs: LogEntry[];
  duration: number;
  selectedLog: LogEntry | null;
  onSelect: (log: LogEntry) => void;
  zoomRange?: { start: number; end: number } | null;
}) {
  const viewDuration = zoomRange ? (zoomRange.end - zoomRange.start) : duration;
  const viewStart    = zoomRange ? zoomRange.start : 0;
  if (!logs.length || viewDuration <= 0) return null;
  return (
    <div className="relative w-full h-4 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
      {logs.map(log => {
        const pct = ((log.relMs - viewStart) / viewDuration) * 100;
        if (pct < 0 || pct > 100) return null;
        const isSelected = selectedLog?.id === log.id;
        return (
          <button
            key={log.id}
            onClick={() => onSelect(log)}
            title={`[${formatMs(log.relMs)}] ${log.level.toUpperCase()}: ${log.message.slice(0, 120)}`}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-150 z-10"
            style={{ left: `${pct}%` }}
          >
            <div
              className="rounded-full transition-all"
              style={{
                width:  isSelected ? 8 : 6,
                height: isSelected ? 8 : 6,
                backgroundColor: logLevelDotColor(log.level),
                boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 3px ${logLevelDotColor(log.level)}` : undefined,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

function TimelineRuler({ duration, zoomRange, onZoom, onReset }: {
  duration: number;
  zoomRange?: { start: number; end: number } | null;
  onZoom?: (start: number, end: number) => void;
  onReset?: () => void;
}) {
  const rulerRef   = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startPctRef = useRef(0);
  const [drag, setDrag] = useState<{ s: number; e: number } | null>(null);

  const viewDuration = zoomRange ? (zoomRange.end - zoomRange.start) : duration;
  const viewStart    = zoomRange ? zoomRange.start : 0;

  const marks = useMemo(() => {
    if (viewDuration <= 0) return [];
    const step = viewDuration <= 500 ? 50 : viewDuration <= 1000 ? 100 : viewDuration <= 5000 ? 500 : viewDuration <= 30000 ? 2000 : 10000;
    const result = [];
    const firstMark = Math.ceil(viewStart / step) * step;
    for (let t = firstMark; t <= viewStart + viewDuration; t += step) result.push(t);
    return result;
  }, [viewDuration, viewStart]);

  const getPct = useCallback((clientX: number) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pct = getPct(e.clientX);
    startPctRef.current = pct;
    isDragging.current = true;
    setDrag({ s: pct, e: pct });

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setDrag({ s: startPctRef.current, e: getPct(ev.clientX) });
    };
    const onUp = (ev: MouseEvent) => {
      isDragging.current = false;
      const endPct = getPct(ev.clientX);
      const minPct = Math.min(startPctRef.current, endPct);
      const maxPct = Math.max(startPctRef.current, endPct);
      setDrag(null);
      if (maxPct - minPct > 0.01) {
        onZoom?.(viewStart + minPct * viewDuration, viewStart + maxPct * viewDuration);
      }
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [getPct, viewStart, viewDuration, onZoom]);

  const selLeft  = drag ? `${Math.min(drag.s, drag.e) * 100}%` : undefined;
  const selWidth = drag ? `${Math.abs(drag.e - drag.s) * 100}%` : undefined;

  return (
    <div
      ref={rulerRef}
      className="relative w-full h-9 border-b border-slate-200 dark:border-slate-700 text-[9px] text-slate-400 font-mono select-none cursor-crosshair"
      onMouseDown={handleMouseDown}
      onDoubleClick={() => onReset?.()}
    >
      {/* Drag selection overlay */}
      {drag && selLeft && selWidth && (
        <div
          className="absolute top-0 bottom-0 bg-blue-400/25 border-x border-blue-400 pointer-events-none"
          style={{ left: selLeft, width: selWidth }}
        />
      )}
      {/* Time marks */}
      {marks.map(t => (
        <div
          key={t}
          className="absolute top-0 bottom-0 flex flex-col justify-end pointer-events-none"
          style={{ left: `${((t - viewStart) / viewDuration) * 100}%` }}
        >
          <div className="w-px h-2 bg-slate-200 dark:bg-slate-700 mb-0.5" />
          <span className="pl-0.5 leading-none">{formatMs(t)}</span>
        </div>
      ))}
      {/* Hint */}
      {!zoomRange && !drag && (
        <span className="absolute right-1 top-0 leading-9 text-[8px] text-slate-300 dark:text-slate-600 pointer-events-none">
          drag to zoom
        </span>
      )}
      {zoomRange && !drag && (
        <span className="absolute right-1 top-0 leading-9 text-[8px] text-blue-400 pointer-events-none">
          {formatMs(zoomRange.start)} – {formatMs(zoomRange.end)} · dbl-click to reset
        </span>
      )}
    </div>
  );
}

// ── Summary Dashboard ─────────────────────────────────────────────

function SummaryDashboard({ summary, data, onClickSlowest, onClickLargest }: { summary: HarSummary; data: ParseResult; onClickSlowest: () => void; onClickLargest: () => void }) {
  const mostCalled = useMemo(() => {
    const groups = detectDuplicates(data.entries, 1);
    return groups.length > 0 ? groups[0] : null;
  }, [data]);

  const cards = [
    {
      label: 'Total Requests',
      value: summary.totalRequests.toString(),
      sub: `${summary.totalErrors} errors`,
      accent: summary.totalErrors > 0 ? 'text-red-500' : 'text-emerald-500',
    },
    {
      label: 'Error Rate',
      value: `${summary.errorRate.toFixed(1)}%`,
      sub: `${summary.totalErrors} / ${summary.totalRequests}`,
      accent: summary.errorRate > 5 ? 'text-red-500' : 'text-emerald-500',
    },
    {
      label: 'Avg Response',
      value: formatMs(summary.avgTime),
      sub: `P50 ${formatMs(summary.p50)}`,
      accent: 'text-blue-500',
    },
    {
      label: 'P95 / P99',
      value: formatMs(summary.p95),
      sub: `P99 ${formatMs(summary.p99)}`,
      accent: summary.p95 > 3000 ? 'text-orange-500' : 'text-blue-500',
    },
    {
      label: 'Transferred',
      value: formatBytes(summary.totalSize),
      sub: summary.largestEntry ? `Largest: ${formatBytes(summary.largestEntry.responseSize)}` : '',
      accent: 'text-purple-500',
    },
    {
      label: 'Session Duration',
      value: formatMs(summary.totalDuration),
      sub: `Avg TTFB ${formatMs(summary.avgTtfb)}`,
      accent: 'text-slate-500',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">{c.label}</div>
            <div className={`text-lg font-black leading-none ${c.accent}`}>{c.value}</div>
            {c.sub && <div className="text-[10px] text-slate-400 mt-1">{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* Chips row */}
      <div className="flex flex-wrap gap-2">
        {summary.slowestEntry && (
          <button
            onClick={onClickSlowest}
            className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5 text-xs cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <Clock size={11} className="text-red-400 shrink-0" />
            <span className="text-red-600 dark:text-red-400 font-semibold">Slowest:</span>
            <span className="text-red-700 dark:text-red-300 font-mono truncate max-w-[200px]">{summary.slowestEntry.pathname}</span>
            <span className="font-black text-red-500 ml-1">{formatMs(summary.slowestEntry.time)}</span>
          </button>
        )}
        {summary.largestEntry && (
          <button
            onClick={onClickLargest}
            className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <HardDrive size={11} className="text-blue-400 shrink-0" />
            <span className="text-blue-600 dark:text-blue-400 font-semibold">Largest:</span>
            <span className="text-blue-700 dark:text-blue-300 font-mono truncate max-w-[200px]">{summary.largestEntry.pathname}</span>
            <span className="font-black text-blue-500 ml-1">{formatBytes(summary.largestEntry.responseSize)}</span>
          </button>
        )}
        {mostCalled && mostCalled.count > 1 && (
          <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg px-3 py-1.5 text-xs">
            <BarChart2 size={11} className="text-purple-400 shrink-0" />
            <span className="text-purple-600 dark:text-purple-400 font-semibold">Most called:</span>
            <span className="text-purple-700 dark:text-purple-300 font-mono truncate max-w-[200px]">{mostCalled.pattern}</span>
            <span className="font-black text-purple-500 ml-1">×{mostCalled.count}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Issues Panel (N+1 / Duplicates) ──────────────────────────────

function IssuesPanel({ duplicates, onHighlight }: { duplicates: DuplicateGroup[]; onHighlight: (pattern: string, method: string) => void }) {
  const [open, setOpen] = useState(false);
  if (duplicates.length === 0) return null;

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          <span className="text-xs font-black text-amber-700 dark:text-amber-400">
            N+1 / Duplicate Requests
          </span>
          <span className="text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 font-black px-1.5 py-0.5 rounded">
            {duplicates.length} pattern{duplicates.length !== 1 ? 's' : ''}
          </span>
        </div>
        {open ? <ChevronUp size={14} className="text-amber-500" /> : <ChevronDown size={14} className="text-amber-500" />}
      </button>

      {open && (
        <div className="divide-y divide-amber-100 dark:divide-amber-900/40 bg-white dark:bg-slate-900">
          {duplicates.map((g, i) => (
            <DuplicateGroupRow key={i} group={g} onHighlight={() => onHighlight(g.pattern, g.method)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DuplicateGroupRow({ group, onHighlight }: { key?: React.Key; group: DuplicateGroup; onHighlight: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/3"
        onClick={() => { setExpanded(e => !e); onHighlight(); }}
      >
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${methodColor(group.method)}`}>{group.method}</span>
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{group.pattern}</span>
        <span className="text-[10px] font-black bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full shrink-0">
          ×{group.count}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">{formatMs(group.avgTime)} avg</span>
        {expanded ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
      </div>
      {expanded && (
        <div className="px-4 pb-2 space-y-0.5">
          {group.entries.map(e => (
            <div key={e.id} className="flex items-center gap-2 text-[10px] pl-4 py-0.5">
              <span className={`font-mono ${statusColor(e.status)}`}>{e.status}</span>
              <span className="text-slate-500 font-mono">{formatMs(e.relStartMs)}</span>
              <span className="text-slate-600 dark:text-slate-300 truncate flex-1">{e.pathname}</span>
              <span className="text-slate-400 font-mono">{formatMs(e.time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Domain Stats ──────────────────────────────────────────────────

function DomainStatsView({ summary }: { summary: HarSummary }) {
  const rows = useMemo(() => {
    const arr: Array<{ domain: string; count: number; errors: number; avgTime: number; totalSize: number }> = [];
    for (const [domain, s] of summary.domainStats) {
      arr.push({ domain, count: s.count, errors: s.errors, avgTime: s.totalTime / s.count, totalSize: s.totalSize });
    }
    return arr.sort((a, b) => b.count - a.count);
  }, [summary]);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Domain</th>
              <th className="px-4 py-2 text-right">Count</th>
              <th className="px-4 py-2 text-right">Errors</th>
              <th className="px-4 py-2 text-right">Avg Time</th>
              <th className="px-4 py-2 text-right">Total Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map(r => (
              <tr key={r.domain} className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">{r.domain}</td>
                <td className="px-4 py-2 text-right font-black text-slate-700 dark:text-slate-200">{r.count}</td>
                <td className={`px-4 py-2 text-right font-bold ${r.errors > 0 ? 'text-red-500' : 'text-slate-400'}`}>{r.errors}</td>
                <td className="px-4 py-2 text-right font-mono text-slate-500">{formatMs(r.avgTime)}</td>
                <td className="px-4 py-2 text-right font-mono text-slate-400">{formatBytes(r.totalSize)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── HAR Comparison Modal ──────────────────────────────────────────

interface CompareEntry {
  pattern: string;
  method: string;
  baseAvg: number;
  cmpAvg: number;
  delta: number;
  baseCount: number;
  cmpCount: number;
}

function CompareModal({
  baseData,
  compareData,
  onClose,
  onLoadCompare,
}: {
  baseData: ParseResult;
  compareData: ParseResult | null;
  onClose: () => void;
  onLoadCompare: (text: string, name: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => onLoadCompare(e.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const comparison = useMemo((): CompareEntry[] => {
    if (!compareData) return [];
    const groupBy = (entries: HarEntry[]) => {
      const m = new Map<string, number[]>();
      for (const e of entries) {
        const key = `${e.method}::${normalizeUrlPattern(e.pathname)}`;
        const arr = m.get(key) ?? [];
        arr.push(e.time);
        m.set(key, arr);
      }
      return m;
    };
    const base = groupBy(baseData.entries);
    const cmp  = groupBy(compareData.entries);
    const keys = new Set([...base.keys(), ...cmp.keys()]);
    const result: CompareEntry[] = [];
    for (const key of keys) {
      const [method, pattern] = key.split('::');
      const bArr = base.get(key) ?? [];
      const cArr = cmp.get(key) ?? [];
      if (bArr.length === 0 || cArr.length === 0) continue;
      const baseAvg = bArr.reduce((s, v) => s + v, 0) / bArr.length;
      const cmpAvg  = cArr.reduce((s, v) => s + v, 0) / cArr.length;
      result.push({ pattern, method, baseAvg, cmpAvg, delta: cmpAvg - baseAvg, baseCount: bArr.length, cmpCount: cArr.length });
    }
    return result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [baseData, compareData]);

  const maxTime = useMemo(() => Math.max(...comparison.map(c => Math.max(c.baseAvg, c.cmpAvg)), 1), [comparison]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <span className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <GitCompare size={16} className="text-blue-500" />
            HAR Comparison
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!compareData ? (
            <div
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${drag ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'}`}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".har,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
              <Upload size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-bold text-slate-600 dark:text-slate-300">Drop comparison HAR file</p>
              <p className="text-xs text-slate-400 mt-1">Will be compared pattern-by-pattern against the base HAR</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /><span className="text-slate-600 dark:text-slate-300">Base</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-purple-500" /><span className="text-slate-600 dark:text-slate-300">Compare</span></div>
                <span className="text-slate-400 ml-auto">{comparison.length} matched patterns</span>
                <button onClick={() => onLoadCompare('', '')} className="text-xs text-red-400 hover:text-red-600 cursor-pointer">Clear</button>
              </div>
              <div className="space-y-1">
                {comparison.map((c, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${methodColor(c.method)}`}>{c.method}</span>
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{c.pattern}</span>
                      <span className={`text-xs font-black ${c.delta > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {c.delta > 0 ? '+' : ''}{formatMs(c.delta)}
                      </span>
                    </div>
                    {/* Base bar */}
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="w-12 text-right text-slate-400 shrink-0">Base</span>
                      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(c.baseAvg / maxTime) * 100}%` }} />
                      </div>
                      <span className="w-16 text-right font-mono text-slate-500 shrink-0">{formatMs(c.baseAvg)}</span>
                    </div>
                    {/* Compare bar */}
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="w-12 text-right text-slate-400 shrink-0">Compare</span>
                      <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(c.cmpAvg / maxTime) * 100}%`,
                            backgroundColor: c.delta > 0 ? '#ef4444' : '#10b981',
                          }}
                        />
                      </div>
                      <span className="w-16 text-right font-mono text-slate-500 shrink-0">{formatMs(c.cmpAvg)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────

function DetailPanel({
  entry, logs, onClose, onToast,
}: {
  entry: HarEntry;
  logs: LogEntry[];
  onClose: () => void;
  onToast: (msg: string, type?: ToastType) => void;
}) {
  const correlated = useMemo(() =>
    logs.filter(l => l.relMs >= entry.relStartMs && l.relMs <= entry.relStartMs + entry.time),
    [logs, entry],
  );

  const insight     = useMemo(() => getPerfInsight(entry), [entry]);
  const cacheInfo   = useMemo(() => getCacheInfo(entry.responseHeaders), [entry]);
  const compression = useMemo(() => getCompressionInfo(entry.responseHeaders, entry.mimeType), [entry]);

  const copyCurl = () => {
    const curl = generateCurl(entry);
    navigator.clipboard.writeText(curl).then(
      () => onToast('cURL copied!'),
      () => onToast('Failed to copy', 'error'),
    );
  };

  const cacheStatusColor: Record<string, string> = {
    hit: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    miss: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    bypass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    expired: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'no-cache': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    unknown: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  };

  return (
    <div className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Request Detail</span>
        <div className="flex items-center gap-2">
          <button
            onClick={copyCurl}
            title="Copy as cURL"
            className="text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors cursor-pointer"
          >
            cURL
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* Summary */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`font-black text-[10px] px-1.5 py-0.5 rounded ${methodColor(entry.method)}`}>{entry.method}</span>
            <span className={`font-black ${statusColor(entry.status)}`}>{entry.status} {entry.statusText}</span>
          </div>
          <p className="text-slate-600 dark:text-slate-300 break-all leading-relaxed">{entry.url}</p>
          <div className="flex gap-3 mt-2 text-slate-500 dark:text-slate-400">
            <span><Clock size={10} className="inline mr-0.5" />{formatMs(entry.time)}</span>
            <span><HardDrive size={10} className="inline mr-0.5" />{formatBytes(entry.responseSize)}</span>
          </div>
          {entry.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2">
              {entry.tags.map((t, i) => <TagBadge key={i} tag={t.tag} color={t.color} />)}
            </div>
          )}
        </div>

        {/* Performance Insight */}
        <div>
          <div className="font-black text-slate-400 uppercase tracking-wider text-[9px] mb-2">Performance Insight</div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-black px-2 py-1 rounded-full"
              style={{ backgroundColor: insight.color + '22', color: insight.color }}
            >
              {insight.label}
            </span>
            <span className="text-slate-500 dark:text-slate-400">{insight.description}</span>
          </div>
        </div>

        {/* Timings */}
        <div>
          <div className="font-black text-slate-400 uppercase tracking-wider text-[9px] mb-2">Timings</div>
          <div className="space-y-1">
            {TIMING_SEGMENTS.map(seg => {
              const val = entry.timings[seg.key];
              if (val <= 0) return null;
              return (
                <div key={seg.key} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-slate-500 dark:text-slate-400 w-16 shrink-0">{seg.label}</span>
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(val / entry.time) * 100}%`, backgroundColor: seg.color }}
                    />
                  </div>
                  <span className="font-mono text-slate-600 dark:text-slate-300 w-14 text-right shrink-0">{formatMs(val)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cache Info */}
        <div>
          <div className="font-black text-slate-400 uppercase tracking-wider text-[9px] mb-2">Cache</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${cacheStatusColor[cacheInfo.status] ?? cacheStatusColor.unknown}`}>
                {cacheInfo.status}
              </span>
              {cacheInfo.ttl !== null && (
                <span className="text-slate-400 text-[10px]">TTL: {cacheInfo.ttl}s</span>
              )}
            </div>
            {cacheInfo.directive && (
              <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 break-all">{cacheInfo.directive}</p>
            )}
            <div className="flex gap-3 text-[10px] text-slate-400">
              {cacheInfo.hasEtag && <span className="text-emerald-500">ETag ✓</span>}
              {cacheInfo.hasLastModified && <span className="text-emerald-500">Last-Modified ✓</span>}
              {!cacheInfo.hasEtag && !cacheInfo.hasLastModified && <span>No revalidation headers</span>}
            </div>
          </div>
        </div>

        {/* Compression */}
        <div>
          <div className="font-black text-slate-400 uppercase tracking-wider text-[9px] mb-2">Compression</div>
          {compression.isCompressed ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 uppercase">
                {compression.encoding}
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-[10px]">Compressed</span>
            </div>
          ) : compression.shouldBeCompressed ? (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={11} className="shrink-0" />
              <span className="text-[10px] font-semibold">Not compressed — response should be gzip/br encoded</span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400">Not applicable</span>
          )}
          {compression.contentType && (
            <p className="text-[10px] text-slate-400 mt-1 font-mono">{compression.contentType.split(';')[0]}</p>
          )}
        </div>

        {/* Response headers */}
        {entry.responseHeaders && Object.keys(entry.responseHeaders).length > 0 && (
          <div>
            <div className="font-black text-slate-400 uppercase tracking-wider text-[9px] mb-2">Response Headers</div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {Object.entries(entry.responseHeaders).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[10px]">
                  <span className="text-slate-400 shrink-0 max-w-[120px] truncate" title={k}>{k}</span>
                  <span className="text-slate-600 dark:text-slate-300 break-all">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Request headers */}
        {entry.requestHeaders && Object.keys(entry.requestHeaders).length > 0 && (
          <div>
            <div className="font-black text-slate-400 uppercase tracking-wider text-[9px] mb-2">Request Headers</div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {Object.entries(entry.requestHeaders).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[10px]">
                  <span className="text-slate-400 shrink-0 max-w-[120px] truncate" title={k}>{k}</span>
                  <span className="text-slate-600 dark:text-slate-300 break-all">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Correlated logs */}
        {correlated.length > 0 && (
          <div>
            <div className="font-black text-slate-400 uppercase tracking-wider text-[9px] mb-2">
              Console Logs ({correlated.length})
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {correlated.map(log => (
                <div key={log.id} className="flex gap-2 items-start text-[10px] bg-slate-50 dark:bg-slate-800 rounded p-1.5">
                  <span className={`font-black uppercase shrink-0 ${levelColor(log.level)}`}>{log.level}</span>
                  <span className="text-slate-600 dark:text-slate-300 break-all">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rule Manager ──────────────────────────────────────────────────

const OPERATORS: { value: Operator; label: string }[] = [
  { value: '==', label: '==' }, { value: '!=', label: '!=' },
  { value: '>',  label: '>'  }, { value: '<',  label: '<'  },
  { value: '>=', label: '>=' }, { value: '<=', label: '<=' },
  { value: 'contains',   label: 'contains'   },
  { value: 'startsWith', label: 'startsWith' },
  { value: 'endsWith',   label: 'endsWith'   },
  { value: 'regex',      label: 'regex'      },
];

interface FieldDef {
  name: string;
  type: 'number' | 'string' | 'enum';
  hint: string;
  example: string;
  suggestedOps: Operator[];
}

const NETWORK_FIELDS: FieldDef[] = [
  { name: 'time',         type: 'number', hint: 'Total request duration (ms)',          example: '3000',              suggestedOps: ['>', '<', '>=', '<='] },
  { name: 'status',       type: 'number', hint: 'HTTP status code',                     example: '404',               suggestedOps: ['==', '!=', '>=', '<=', '>', '<'] },
  { name: 'method',       type: 'string', hint: 'HTTP method (uppercase)',               example: 'POST',              suggestedOps: ['==', '!='] },
  { name: 'url',          type: 'string', hint: 'Full request URL',                      example: 'https://api.',      suggestedOps: ['contains', 'startsWith', 'endsWith', 'regex'] },
  { name: 'mimeType',     type: 'string', hint: 'Response content type',                example: 'application/json',  suggestedOps: ['contains', '==', 'startsWith'] },
  { name: 'responseSize', type: 'number', hint: 'Response body size (bytes)',            example: '5000000',           suggestedOps: ['>', '<', '>='] },
];

const CONSOLE_FIELDS: FieldDef[] = [
  { name: 'level',   type: 'enum',   hint: 'Log level: error | warn | info | debug | log | unknown', example: 'error',      suggestedOps: ['==', '!='] },
  { name: 'message', type: 'string', hint: 'Full log line text',                                      example: 'TypeError',  suggestedOps: ['contains', 'regex', 'startsWith'] },
];

function getFields(target: RuleTarget): FieldDef[] {
  if (target === 'network') return NETWORK_FIELDS;
  if (target === 'console') return CONSOLE_FIELDS;
  return [...NETWORK_FIELDS, ...CONSOLE_FIELDS];
}

interface RuleManagerProps {
  rules: Rule[];
  onSave: (rules: Rule[]) => void;
  onClose: () => void;
  onToast: (msg: string, type?: ToastType) => void;
}

const BLANK_FORM: Omit<Rule, 'id'> = {
  name: '', enabled: true, target: 'network',
  condition: { field: 'time', operator: '>', value: 1000 },
  action: { tag: 'Custom', color: '#3b82f6', severity: 'warning' },
};

function RuleManager({ rules, onSave, onClose, onToast }: RuleManagerProps) {
  const [localRules, setLocalRules] = useState<Rule[]>(rules);
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<Omit<Rule, 'id'>>(BLANK_FORM);

  const toggle = (id: string) =>
    setLocalRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));

  const remove = (id: string) => {
    const name = localRules.find(r => r.id === id)?.name ?? 'Rule';
    setLocalRules(prev => prev.filter(r => r.id !== id));
    if (editingId === id) { setShowForm(false); setEditingId(null); }
    onToast(`Deleted "${name}"`, 'error');
  };

  const openAdd = () => { setForm(BLANK_FORM); setEditingId(null); setShowForm(true); };

  const openEdit = (rule: Rule) => {
    setForm({ name: rule.name, enabled: rule.enabled, target: rule.target, condition: { ...rule.condition }, action: { ...rule.action } });
    setEditingId(rule.id);
    setShowForm(true);
  };

  const saveForm = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      setLocalRules(prev => prev.map(r => r.id === editingId ? { ...form, id: editingId } : r));
      onToast(`Updated "${form.name}"`);
    } else {
      setLocalRules(prev => [...prev, { ...form, id: `custom-${Date.now()}` }]);
      onToast(`Added "${form.name}"`);
    }
    setShowForm(false); setEditingId(null); setForm(BLANK_FORM);
  };

  const exportRules = () => {
    const blob = new Blob([JSON.stringify({ rules: localRules }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'waterfall-rules.json'; a.click();
  };

  const importRules = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (Array.isArray(json.rules)) { setLocalRules(json.rules); onToast(`Imported ${json.rules.length} rules`, 'info'); }
        else onToast('Invalid rules file', 'error');
      } catch { onToast('Failed to parse file', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const selectCls = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const inputCls  = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <span className="font-black text-slate-800 dark:text-slate-100">Rule Manager</span>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer text-xs font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Import
              <input type="file" accept=".json" className="hidden" onChange={importRules} />
            </label>
            <button onClick={exportRules} className="text-xs font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">Export</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={16} /></button>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 pt-3 pb-1">
          {(() => {
            const allEnabled  = localRules.every(r => r.enabled);
            const someEnabled = localRules.some(r => r.enabled);
            return (
              <input type="checkbox" checked={allEnabled}
                ref={el => { if (el) el.indeterminate = someEnabled && !allEnabled; }}
                onChange={() => setLocalRules(prev => prev.map(r => ({ ...r, enabled: !allEnabled })))}
                className="accent-blue-500 cursor-pointer"
                title={allEnabled ? 'Disable all rules' : 'Enable all rules'}
              />
            );
          })()}
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
            {localRules.filter(r => r.enabled).length} / {localRules.length} enabled
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {localRules.map(rule => (
            <div key={rule.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${editingId === rule.id ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700' : 'bg-slate-50 dark:bg-slate-800'}`}>
              <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule.id)} className="accent-blue-500 cursor-pointer" />
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rule.action.color }} />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{rule.name}</span>
                <span className="text-[10px] text-slate-400 ml-2">[{rule.target}] {rule.condition.field} {rule.condition.operator} {rule.condition.value}</span>
              </div>
              <TagBadge tag={rule.action.tag} color={rule.action.color} />
              <button onClick={() => editingId === rule.id ? (setShowForm(false), setEditingId(null)) : openEdit(rule)} className={`cursor-pointer shrink-0 transition-colors ${editingId === rule.id ? 'text-blue-500' : 'text-slate-300 hover:text-blue-400'}`} title="Edit rule">
                <Pencil size={12} />
              </button>
              <button onClick={() => remove(rule.id)} className="text-slate-300 hover:text-red-400 cursor-pointer shrink-0" title="Delete rule"><X size={12} /></button>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-500 uppercase tracking-wider">{editingId ? 'Edit Rule' : 'New Rule'}</span>
              {editingId && <span className="text-[10px] text-blue-500 dark:text-blue-400 font-semibold">— {localRules.find(r => r.id === editingId)?.name}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Rule name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <select className={selectCls} value={form.target} onChange={e => { const t = e.target.value as RuleTarget; setForm(f => ({ ...f, target: t, condition: { ...f.condition, field: '' } })); }}>
                <option value="network">network</option>
                <option value="console">console</option>
                <option value="both">both</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-3 gap-2">
                <select className={selectCls} value={form.condition.field} onChange={e => { const fd = getFields(form.target).find(f => f.name === e.target.value); setForm(f => ({ ...f, condition: { ...f.condition, field: e.target.value, operator: fd?.suggestedOps[0] ?? f.condition.operator } })); }}>
                  <option value="" disabled>— pick field —</option>
                  {getFields(form.target).map(fd => <option key={fd.name} value={fd.name}>{fd.name}</option>)}
                </select>
                <select className={selectCls} value={form.condition.operator} onChange={e => setForm(f => ({ ...f, condition: { ...f.condition, operator: e.target.value as Operator } }))}>
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input className={inputCls} placeholder={getFields(form.target).find(f => f.name === form.condition.field)?.example ?? 'value'} value={form.condition.value} onChange={e => setForm(f => ({ ...f, condition: { ...f.condition, value: e.target.value } }))} />
              </div>
              {(() => { const fd = getFields(form.target).find(f => f.name === form.condition.field); if (!fd) return null; return (<p className="text-[10px] text-slate-400 dark:text-slate-500 pl-1"><span className="font-mono text-slate-500 dark:text-slate-400">{fd.name}</span>{' · '}<span className="italic">{fd.hint}</span>{fd.type === 'enum' && <span className="ml-1 text-blue-400">({fd.hint.split(':')[1]?.trim()})</span>}</p>); })()}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input className={inputCls} placeholder="tag label" value={form.action.tag} onChange={e => setForm(f => ({ ...f, action: { ...f.action, tag: e.target.value } }))} />
              <input type="color" className="h-7 w-full rounded cursor-pointer border border-slate-200 dark:border-slate-700" value={form.action.color} onChange={e => setForm(f => ({ ...f, action: { ...f.action, color: e.target.value } }))} />
              <select className={selectCls} value={form.action.severity} onChange={e => setForm(f => ({ ...f, action: { ...f.action, severity: e.target.value as Severity } }))}>
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="error">error</option>
                <option value="critical">critical</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={saveForm} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">{editingId ? 'Save Changes' : 'Add Rule'}</button>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(BLANK_FORM); }} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button onClick={openAdd} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">+ Add Rule</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">Cancel</button>
            <button onClick={() => { onSave(localRules); onClose(); }} className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upload Panel ──────────────────────────────────────────────────

function LoadSampleButton({ onHar, onLog, onProcess, onError }: { onHar: (text: string, name: string) => void; onLog: (text: string, name: string) => void; onProcess: () => void; onError?: (msg: string) => void }) {
  const [loading, setLoading] = useState(false);
  const base = ((import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL ?? '/').replace(/\/$/, '');
  const load = async () => {
    setLoading(true);
    try {
      const [harRes, logRes] = await Promise.all([
        fetch(`${base}/test-data/sample.har`),
        fetch(`${base}/test-data/sample.log`),
      ]);
      if (!harRes.ok) throw new Error(`Cannot load sample.har (${harRes.status})`);
      if (!logRes.ok) throw new Error(`Cannot load sample.log (${logRes.status})`);
      const [har, log] = await Promise.all([harRes.text(), logRes.text()]);
      onHar(har, 'sample.har');
      onLog(log, 'sample.log');
      setTimeout(onProcess, 50);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to load sample data');
    } finally { setLoading(false); }
  };
  return (
    <button onClick={load} disabled={loading} className="flex items-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300 font-bold text-sm rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-slate-700">
      {loading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> : <Activity size={15} />}
      Try Sample Data
    </button>
  );
}

// ── Help Modal ────────────────────────────────────────────────────

const HELP_SECTIONS = [
  {
    title: 'Waterfall Timeline',
    color: 'text-blue-600 dark:text-blue-400',
    items: [
      { icon: '🖱️', text: 'Drag on the ruler to zoom into a time range' },
      { icon: '↩️', text: 'Double-click ruler or click "Reset Zoom" to zoom out' },
      { icon: '⬛', text: 'Double-click a request row to auto-zoom to that request (±10% padding)' },
      { icon: '🔵', text: 'Colored dots on the log strip are console log markers — click to select' },
    ],
  },
  {
    title: 'Request ↔ Log Correlation',
    color: 'text-emerald-600 dark:text-emerald-400',
    items: [
      { icon: '→', text: 'Click a request row → logs inside its time window are highlighted green' },
      { icon: '←', text: 'Click a log marker → requests active at that timestamp are highlighted blue' },
      { icon: '📋', text: 'Click a request row → detail panel shows correlated logs at the bottom' },
    ],
  },
  {
    title: 'Filtering & Grouping',
    color: 'text-violet-600 dark:text-violet-400',
    items: [
      { icon: '🔍', text: 'Filter box searches URL, path, domain simultaneously' },
      { icon: '🏷️', text: '"Flagged" toggle shows only requests matching a Rule (colored tags)' },
      { icon: '⧉', text: '"Group" button collapses identical URL patterns (e.g. /api/users/:id)' },
      { icon: '↕️', text: 'Click column headers (Status, Method, Time, Size) to sort' },
    ],
  },
  {
    title: 'Rule Engine',
    color: 'text-amber-600 dark:text-amber-400',
    items: [
      { icon: '⚙️', text: 'Rules auto-tag requests/logs — e.g. "time > 3000" → Slow Request' },
      { icon: '➕', text: 'Create custom rules via Settings → Rules → + Add Rule' },
      { icon: '📤', text: 'Export/import rule sets as JSON to share with your team' },
      { icon: '💾', text: 'Rules are saved in localStorage — persist across sessions' },
    ],
  },
  {
    title: 'Performance Tools',
    color: 'text-rose-600 dark:text-rose-400',
    items: [
      { icon: '📊', text: 'Summary Dashboard shows P50/P95/P99 latency, cache rate, error rate' },
      { icon: '⚠️', text: 'Issues panel detects N+1 patterns (same URL called 3+ times)' },
      { icon: '🌐', text: '"By Domain" tab shows breakdown per domain with avg time & total bytes' },
      { icon: '⚖️', text: '"Compare" button loads a second HAR to diff requests side by side' },
    ],
  },
  {
    title: 'Other Actions',
    color: 'text-slate-600 dark:text-slate-400',
    items: [
      { icon: '📋', text: 'Detail panel → "cURL" button copies the request as a curl command' },
      { icon: '🕐', text: '"Log TZ" dropdown adjusts log timezone offset to sync with HAR (UTC)' },
      { icon: '🔄', text: '"Re-analyze" re-runs parsing — use after changing rules or TZ offset' },
      { icon: '🔒', text: '100% client-side — no data ever leaves your browser' },
    ],
  },
];

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100">How to use Network Waterfall Analyzer</h2>
            <p className="text-xs text-slate-400 mt-0.5">Quick reference for all features</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors">
            <X size={18} />
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-5">
          {HELP_SECTIONS.map(section => (
            <div key={section.title}>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${section.color}`}>{section.title}</p>
              <div className="space-y-1.5">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-5 text-center shrink-0 text-sm leading-5">{item.icon}</span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-5">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors cursor-pointer">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

interface UploadPanelProps {
  onHar: (text: string, name: string) => void;
  onLog: (text: string, name: string) => void;
  harName: string | null;
  logName: string | null;
  onProcess: () => void;
  isReady: boolean;
  onManageRules: () => void;
  ruleCount: number;
  onHelp: () => void;
  onError: (msg: string) => void;
}

function UploadPanel({ onHar, onLog, harName, logName, onProcess, isReady, onManageRules, ruleCount, onHelp, onError }: UploadPanelProps) {
  const harRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLInputElement>(null);
  const [harDrag, setHarDrag] = useState(false);
  const [logDrag, setLogDrag] = useState(false);

  const readFile = (file: File, cb: (text: string, name: string) => void) => {
    const reader = new FileReader();
    reader.onload = e => cb(e.target?.result as string, file.name);
    reader.readAsText(file);
  };

  const dropCls = (active: boolean) =>
    `border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${active ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600'}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Network Waterfall Analyzer</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Upload a HAR file to visualize network requests. Optionally add a console log file to correlate events.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button onClick={onManageRules} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-600 transition-colors cursor-pointer">
            <Settings size={13} />
            Rules
            <span className="ml-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[9px] font-black px-1 rounded">{ruleCount}</span>
          </button>
          <button onClick={onHelp} title="How to use" className="flex items-center justify-center w-8 h-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-600 transition-colors cursor-pointer text-sm font-black">
            ?
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={dropCls(harDrag)} onDragOver={e => { e.preventDefault(); setHarDrag(true); }} onDragLeave={() => setHarDrag(false)} onDrop={e => { e.preventDefault(); setHarDrag(false); const f = e.dataTransfer.files[0]; if (f) readFile(f, onHar); }} onClick={() => harRef.current?.click()}>
          <input ref={harRef} type="file" accept=".har,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f, onHar); e.target.value = ''; }} />
          <Activity size={32} className={`mx-auto mb-3 ${harName ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'}`} />
          {harName ? <p className="text-sm font-bold text-blue-600 dark:text-blue-400 break-all">{harName}</p> : (<><p className="text-sm font-bold text-slate-600 dark:text-slate-300">Drop HAR file</p><p className="text-xs text-slate-400 mt-1">Required · .har or .json</p></>)}
        </div>

        <div className={dropCls(logDrag)} onDragOver={e => { e.preventDefault(); setLogDrag(true); }} onDragLeave={() => setLogDrag(false)} onDrop={e => { e.preventDefault(); setLogDrag(false); const f = e.dataTransfer.files[0]; if (f) readFile(f, onLog); }} onClick={() => logRef.current?.click()}>
          <input ref={logRef} type="file" accept=".log,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f, onLog); e.target.value = ''; }} />
          <Filter size={32} className={`mx-auto mb-3 ${logName ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
          {logName ? <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 break-all">{logName}</p> : (<><p className="text-sm font-bold text-slate-600 dark:text-slate-300">Drop Log file</p><p className="text-xs text-slate-400 mt-1">Optional · .log or .txt</p></>)}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onProcess} disabled={!isReady} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl transition-colors cursor-pointer shadow-lg shadow-blue-500/20">Analyze</button>
          <LoadSampleButton onHar={onHar} onLog={onLog} onProcess={onProcess} onError={onError} />
        </div>
      </div>

      {/* Quick Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Quick Tips</span>
          <button onClick={onHelp} className="ml-auto text-[10px] font-bold text-blue-500 dark:text-blue-400 hover:underline cursor-pointer">Full guide →</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {[
            { icon: '🖱️', text: 'Drag ruler to zoom timeline' },
            { icon: '⬛', text: 'Double-click row to zoom to request' },
            { icon: '→', text: 'Click request to see correlated logs' },
            { icon: '🏷️', text: '"Flagged" shows rule-matched requests' },
            { icon: '⧉', text: '"Group" collapses URL patterns' },
            { icon: '⚙️', text: 'Rules auto-tag slow / error requests' },
          ].map((tip, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm shrink-0">{tip.icon}</span>
              <span className="text-xs text-slate-600 dark:text-slate-300">{tip.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
          <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">How to export a HAR file</p>
          <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
            <li>Open DevTools (F12) → Network tab</li>
            <li>Reproduce the issue in your browser</li>
            <li>Right-click any request → "Save all as HAR with content"</li>
            <li>Drop the .har file above</li>
          </ol>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">How to export a console log file</p>
          <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
            <li>Open DevTools (F12) → Console tab</li>
            <li>Right-click anywhere in the console → "Save as…"</li>
            <li><span className="font-semibold">Or</span> in Node.js: redirect output with <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono">node app.js &gt; app.log</code></li>
            <li>Drop the .log or .txt file above</li>
          </ol>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Supported timestamps: ISO 8601 · <code className="bg-slate-200 dark:bg-slate-700 px-0.5 rounded font-mono">YYYY-MM-DD HH:mm:ss</code> · <code className="bg-slate-200 dark:bg-slate-700 px-0.5 rounded font-mono">[HH:mm:ss.SSS]</code> · Unix ms epoch</p>
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2">
            <p className="text-[10px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest">Important notes</p>
            <div className="space-y-1.5">
              <div className="flex gap-2 items-start">
                <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300"><span className="font-bold">Enable timestamps</span> — In Console settings (⚙), check <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded text-[10px]">Show timestamps</span>. Without timestamps, logs cannot be matched to the waterfall timeline.</p>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-blue-400 shrink-0 mt-0.5">ℹ</span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300"><span className="font-bold">File format</span> — Both <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded text-[10px]">.log</span> and <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded text-[10px]">.txt</span> are supported — they are both plain text.</p>
              </div>
              <div className="flex gap-2 items-start">
                <span className="text-blue-400 shrink-0 mt-0.5">ℹ</span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300"><span className="font-bold">Log level</span> — Use <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded text-[10px]">All levels</span> mode to capture Info, Warn, and Error together.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

type SortKey = 'relStartMs' | 'time' | 'status' | 'responseSize' | 'method';
type ViewTab = 'requests' | 'domains';

interface FilterState {
  search: string;
  method: string;
  statusRange: string;
  onlyTagged: boolean;
}

const NetworkWaterfallAnalyzer: React.FC = () => {
  // ── Core state ────────────────────────────────────────────────
  const [harText, setHarText]   = useState<string | null>(null);
  const [logText, setLogText]   = useState<string | null>(null);
  const [harName, setHarName]   = useState<string | null>(null);
  const [logName, setLogName]   = useState<string | null>(null);
  const [data, setData]         = useState<ParseResult | null>(null);
  const { toasts, push: toast, dismiss } = useToast();
  const [rules, setRules] = useState<Rule[]>(() => {
    try { const s = localStorage.getItem('devtoolkit:waterfall-rules'); if (s) return JSON.parse(s) as Rule[]; } catch {}
    return DEFAULT_RULES;
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [tzOffsetMs, setTzOffsetMs] = useState(0);

  // ── Selection state ───────────────────────────────────────────
  const [selected,    setSelected]    = useState<HarEntry | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showRules,   setShowRules]   = useState(false);
  const [showHelp,    setShowHelp]    = useState(false);
  const [filter, setFilter] = useState<FilterState>({ search: '', method: '', statusRange: '', onlyTagged: false });

  // ── New feature state ─────────────────────────────────────────
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const [groupByPattern, setGroupByPattern] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [viewTab, setViewTab] = useState<ViewTab>('requests');
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number } | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [compareData, setCompareData] = useState<ParseResult | null>(null);
  const [compareText, setCompareText] = useState<string | null>(null);
  const [highlightedPattern, setHighlightedPattern] = useState<{ pattern: string; method: string } | null>(null);

  // ── Virtual scroll ────────────────────────────────────────────
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const compareWorkerRef = useRef<Worker | null>(null);

  // ── Worker setup ──────────────────────────────────────────────
  useEffect(() => {
    const w = new Worker(new URL('../workers/harAnalyzer.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    w.onmessage = (e) => {
      setIsProcessing(false);
      if (e.data.type === 'result') { setData(e.data.result); setError(null); }
      else { setError(e.data.message ?? 'Parse failed'); }
    };
    w.onerror = (e) => { setIsProcessing(false); setError(e.message); };
    return () => w.terminate();
  }, []);

  // Compare worker
  useEffect(() => {
    if (!compareText) return;
    const w = new Worker(new URL('../workers/harAnalyzer.worker.ts', import.meta.url), { type: 'module' });
    compareWorkerRef.current = w;
    w.onmessage = (e) => {
      if (e.data.type === 'result') setCompareData(e.data.result);
    };
    w.onerror = () => toast('Failed to parse comparison HAR', 'error');
    w.postMessage({ harText: compareText, logText: undefined, tzOffsetMs: 0, rules });
    return () => w.terminate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareText]);

  const process = useCallback(() => {
    if (!harText || !workerRef.current) return;
    setIsProcessing(true); setError(null); setSelected(null); setSelectedLog(null);
    workerRef.current.postMessage({ harText, logText: logText ?? undefined, tzOffsetMs, rules });
  }, [harText, logText, tzOffsetMs, rules]);

  // ── Derived data ──────────────────────────────────────────────

  const summary = useMemo(() => data ? computeSummary(data.entries) : null, [data]);

  const duplicates = useMemo(() => data ? detectDuplicates(data.entries) : [], [data]);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    let entries = data.entries.filter(e => {
      if (filter.search) { const q = filter.search.toLowerCase(); if (!e.url.toLowerCase().includes(q) && !e.pathname.toLowerCase().includes(q)) return false; }
      if (filter.method && e.method !== filter.method) return false;
      if (filter.statusRange) {
        if (filter.statusRange === '2xx' && (e.status < 200 || e.status >= 300)) return false;
        if (filter.statusRange === '3xx' && (e.status < 300 || e.status >= 400)) return false;
        if (filter.statusRange === '4xx' && (e.status < 400 || e.status >= 500)) return false;
        if (filter.statusRange === '5xx' && e.status < 500) return false;
      }
      if (filter.onlyTagged && e.tags.length === 0) return false;
      return true;
    });

    if (sortConfig) {
      entries = [...entries].sort((a, b) => {
        let av: string | number = a[sortConfig.key];
        let bv: string | number = b[sortConfig.key];
        if (typeof av === 'string' && typeof bv === 'string') {
          return sortConfig.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return sortConfig.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
      });
    }

    return entries;
  }, [data, filter, sortConfig]);

  // Group by pattern rows
  interface GroupedRow { type: 'group'; key: string; representative: HarEntry; count: number; entries: HarEntry[] }
  interface SingleRow  { type: 'single'; entry: HarEntry }
  type DisplayRow = GroupedRow | SingleRow;

  const displayRows = useMemo((): DisplayRow[] => {
    if (!groupByPattern) return filteredEntries.map(e => ({ type: 'single', entry: e }));
    const groups = new Map<string, HarEntry[]>();
    for (const e of filteredEntries) {
      const key = `${e.method}::${normalizeUrlPattern(e.pathname)}`;
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    const rows: DisplayRow[] = [];
    for (const [key, entries] of groups) {
      const rep = entries[0];
      if (entries.length === 1) { rows.push({ type: 'single', entry: rep }); continue; }
      rows.push({ type: 'group', key, representative: rep, count: entries.length, entries });
      if (expandedGroups.has(key)) {
        for (const e of entries) rows.push({ type: 'single', entry: e });
      }
    }
    return rows;
  }, [filteredEntries, groupByPattern, expandedGroups]);

  const correlatedLogIds = useMemo(() => {
    if (!selected || !data) return new Set<string>();
    return new Set(data.logs.filter(l => l.relMs >= selected.relStartMs && l.relMs <= selected.relStartMs + selected.time).map(l => l.id));
  }, [selected, data]);

  const correlatedEntryIds = useMemo(() => {
    if (!selectedLog || !data) return new Set<string>();
    return new Set(data.entries.filter(e => selectedLog.relMs >= e.relStartMs && selectedLog.relMs <= e.relStartMs + e.time).map(e => e.id));
  }, [selectedLog, data]);

  const logCountsPerEntry = useMemo(() => {
    if (!data || data.logs.length === 0) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const entry of data.entries) {
      const count = data.logs.filter(l => l.relMs >= entry.relStartMs && l.relMs <= entry.relStartMs + entry.time).length;
      if (count > 0) map.set(entry.id, count);
    }
    return map;
  }, [data]);

  const methods = useMemo(() => data ? [...new Set(data.entries.map(e => e.method))].sort() : [], [data]);

  // ── Virtual scroll math ───────────────────────────────────────
  const CONTAINER_HEIGHT = 500;
  const BUFFER = 5;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
  const endIdx   = Math.min(displayRows.length, Math.ceil((scrollTop + CONTAINER_HEIGHT) / ROW_HEIGHT) + BUFFER);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop), []);

  // ── Actions ───────────────────────────────────────────────────
  const reset = () => {
    setHarText(null); setLogText(null); setHarName(null); setLogName(null);
    setData(null); setSelected(null); setSelectedLog(null); setError(null);
    setCompareData(null); setCompareText(null); setZoomRange(null); setHighlightedPattern(null);
  };

  const saveRules = (r: Rule[]) => {
    setRules(r);
    localStorage.setItem('devtoolkit:waterfall-rules', JSON.stringify(r));
  };

  const toggleSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev?.key === key) return prev.dir === 'asc' ? { key, dir: 'desc' } : null;
      return { key, dir: 'asc' };
    });
  };

  const resetZoom = () => setZoomRange(null);

  const zoomToEntry = (entry: HarEntry, effectiveDur: number) => {
    const padding = Math.max((entry.time) * 0.1, 50);
    const start = Math.max(0, entry.relStartMs - padding);
    const end   = Math.min(effectiveDur, entry.relStartMs + entry.time + padding);
    if (end > start) setZoomRange({ start, end });
  };

  const SortIndicator = ({ k }: { k: SortKey }) => {
    if (sortConfig?.key !== k) return <span className="opacity-20 ml-0.5">↕</span>;
    return <span className="ml-0.5 text-blue-500">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  // ── Render ────────────────────────────────────────────────────

  const ruleManager = showRules && (
    <RuleManager rules={rules} onSave={saveRules} onClose={() => setShowRules(false)} onToast={toast} />
  );

  const helpModal = showHelp && <HelpModal onClose={() => setShowHelp(false)} />;

  if (!data && !isProcessing) {
    return (
      <div className="animate-in fade-in duration-300">
        {error && (
          <div className="max-w-2xl mx-auto mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer"><X size={14} /></button>
          </div>
        )}
        <UploadPanel
          onHar={(t, n) => { setHarText(t); setHarName(n); }}
          onLog={(t, n) => { setLogText(t); setLogName(n); }}
          harName={harName} logName={logName}
          onProcess={process} isReady={!!harText}
          onManageRules={() => setShowRules(true)}
          ruleCount={rules.filter(r => r.enabled).length}
          onHelp={() => setShowHelp(true)}
          onError={msg => setError(msg)}
        />
        {ruleManager}
        {helpModal}
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-600">Analyzing…</p>
      </div>
    );
  }

  if (!data) return null;

  const effectiveDuration = data.duration;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-2">
          <Activity size={14} className="text-blue-500 shrink-0" />
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate max-w-[160px]" title={harName ?? ''}>{harName}</span>
          <button onClick={reset} className="text-slate-400 hover:text-red-400 cursor-pointer"><X size={12} /></button>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Filter URLs…" value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            className="pl-7 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-48" />
        </div>

        {/* Method filter */}
        <select value={filter.method} onChange={e => setFilter(f => ({ ...f, method: e.target.value }))}
          className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600 dark:text-slate-300">
          <option value="">All Methods</option>
          {methods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Status filter */}
        <select value={filter.statusRange} onChange={e => setFilter(f => ({ ...f, statusRange: e.target.value }))}
          className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600 dark:text-slate-300">
          <option value="">All Status</option>
          <option value="2xx">2xx</option><option value="3xx">3xx</option>
          <option value="4xx">4xx</option><option value="5xx">5xx</option>
        </select>

        {/* Flagged toggle */}
        <button onClick={() => setFilter(f => ({ ...f, onlyTagged: !f.onlyTagged }))}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${filter.onlyTagged ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700'}`}>
          Flagged
        </button>

        {/* Group by pattern */}
        <button onClick={() => setGroupByPattern(g => !g)}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${groupByPattern ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
          <Layers size={11} />
          Group
        </button>

        {/* Compare */}
        <button onClick={() => setShowCompare(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer">
          <GitCompare size={11} />
          Compare
          {compareData && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
        </button>

        {/* TZ offset */}
        <select value={tzOffsetMs} onChange={e => setTzOffsetMs(Number(e.target.value))}
          className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-600 dark:text-slate-300">
          {[-12,-11,-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10,11,12].map(h => (
            <option key={h} value={h * 3600000}>{h >= 0 ? `+${h}h` : `${h}h`} Log TZ</option>
          ))}
        </select>

        {/* Rules */}
        <button onClick={() => setShowRules(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer">
          <Settings size={12} />
          Rules
          <span className="ml-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[9px] font-black px-1.5 py-0.5 rounded">{rules.filter(r => r.enabled).length}/{rules.length}</span>
        </button>

        {/* Re-analyze */}
        <button onClick={process}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer shadow-sm">
          <ChevronRight size={12} />
          Re-analyze
        </button>

        {/* Help */}
        <button onClick={() => setShowHelp(true)} title="How to use"
          className="flex items-center justify-center w-7 h-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 transition-colors cursor-pointer text-sm font-black shrink-0">
          ?
        </button>
      </div>

      {/* ── Summary Dashboard ──────────────────────────────────── */}
      {summary && <SummaryDashboard summary={summary} data={data}
        onClickSlowest={() => { if (summary.slowestEntry) { setSelected(summary.slowestEntry); setSelectedLog(null); } }}
        onClickLargest={() => { if (summary.largestEntry) { setSelected(summary.largestEntry); setSelectedLog(null); } }}
      />}

      {/* ── Issues panel ───────────────────────────────────────── */}
      {duplicates.length > 0 && <IssuesPanel duplicates={duplicates} onHighlight={(pattern, method) => {
        setHighlightedPattern(prev => prev?.pattern === pattern && prev?.method === method ? null : { pattern, method });
      }} />}

      {/* ── View tab bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['requests', 'domains'] as ViewTab[]).map(tab => (
          <button key={tab} onClick={() => setViewTab(tab)}
            className={`px-4 py-2 text-xs font-bold capitalize transition-colors cursor-pointer border-b-2 -mb-px ${viewTab === tab ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}>
            {tab === 'requests' ? 'Requests' : 'By Domain'}
          </button>
        ))}
        <div className="flex-1" />
        {/* Zoom reset (only when zoomed) */}
        {viewTab === 'requests' && zoomRange && (
          <button onClick={resetZoom}
            className="text-[10px] font-bold px-2 py-1 mb-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 rounded cursor-pointer transition-colors flex items-center gap-1">
            <ZoomOut size={10} />
            Reset Zoom
          </button>
        )}
      </div>

      {/* ── Domain stats view ─────────────────────────────────── */}
      {viewTab === 'domains' && summary && <DomainStatsView summary={summary} />}

      {/* ── Waterfall table ────────────────────────────────────── */}
      {viewTab === 'requests' && (
        <div className={`flex border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 ${selected ? 'divide-x divide-slate-200 dark:divide-slate-700' : ''}`}>
          {/* Main table */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Column header */}
            <div className="flex items-center gap-0 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-wider" style={{ height: 40 }}>
              <button onClick={() => toggleSort('status')} className="w-12 shrink-0 px-2 flex items-center cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-left">
                Status<SortIndicator k="status" />
              </button>
              <button onClick={() => toggleSort('method')} className="w-14 shrink-0 px-1 flex items-center cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors text-left">
                Method<SortIndicator k="method" />
              </button>
              <div className="w-40 shrink-0 px-2">URL / Path</div>
              <div className="flex-1 px-2">
                <TimelineRuler duration={effectiveDuration} zoomRange={zoomRange} onZoom={(s, e) => setZoomRange({ start: s, end: e })} onReset={resetZoom} />
              </div>
              <button onClick={() => toggleSort('time')} className="w-16 shrink-0 px-2 text-right flex items-center justify-end cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                Time<SortIndicator k="time" />
              </button>
              <button onClick={() => toggleSort('responseSize')} className="w-14 shrink-0 px-2 text-right flex items-center justify-end cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                Size<SortIndicator k="responseSize" />
              </button>
              <div className="w-8 shrink-0 px-1 text-center">Log</div>
            </div>

            {/* Log markers strip */}
            {data.logs.length > 0 && (
              <div className="flex">
                <div className="w-12 shrink-0" /><div className="w-14 shrink-0" /><div className="w-40 shrink-0" />
                <div className="flex-1">
                  <LogMarkers logs={data.logs} duration={effectiveDuration} selectedLog={selectedLog} zoomRange={zoomRange}
                    onSelect={log => { setSelected(null); setSelectedLog(l => l?.id === log.id ? null : log); }} />
                </div>
                <div className="w-16 shrink-0" /><div className="w-14 shrink-0" /><div className="w-8 shrink-0" />
              </div>
            )}

            {/* Virtual list */}
            <div ref={scrollRef} onScroll={onScroll} style={{ height: CONTAINER_HEIGHT, overflowY: 'auto' }}>
              {displayRows.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">No requests match the current filter.</div>
              ) : (
                <div style={{ height: displayRows.length * ROW_HEIGHT, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: startIdx * ROW_HEIGHT, width: '100%' }}>
                    {displayRows.slice(startIdx, endIdx).map((row, i) => {
                      if (row.type === 'group') {
                        const isExpanded = expandedGroups.has(row.key);
                        return (
                          <WaterfallRow
                            key={row.key}
                            entry={row.representative}
                            duration={effectiveDuration}
                            isSelected={selected?.id === row.representative.id}
                            isCorrelated={correlatedEntryIds.has(row.representative.id)}
                            isHighlighted={!!highlightedPattern && normalizeUrlPattern(row.representative.pathname) === highlightedPattern.pattern && row.representative.method === highlightedPattern.method}
                            logCount={logCountsPerEntry.get(row.representative.id) ?? 0}
                            onClick={() => { setSelectedLog(null); setSelected(s => s?.id === row.representative.id ? null : row.representative); }}
                            onDoubleClick={() => zoomToEntry(row.representative, effectiveDuration)}
                            zoomRange={zoomRange}
                            isGroupRow
                            groupCount={row.count}
                            isExpanded={isExpanded}
                            onToggleExpand={() => setExpandedGroups(prev => {
                              const next = new Set(prev);
                              if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
                              return next;
                            })}
                          />
                        );
                      }
                      return (
                        <WaterfallRow
                          key={row.entry.id}
                          entry={row.entry}
                          duration={effectiveDuration}
                          isSelected={selected?.id === row.entry.id}
                          isCorrelated={correlatedEntryIds.has(row.entry.id)}
                          isHighlighted={!!highlightedPattern && normalizeUrlPattern(row.entry.pathname) === highlightedPattern.pattern && row.entry.method === highlightedPattern.method}
                          logCount={logCountsPerEntry.get(row.entry.id) ?? 0}
                          onClick={() => { setSelectedLog(null); setSelected(s => s?.id === row.entry.id ? null : row.entry); }}
                          onDoubleClick={() => zoomToEntry(row.entry, effectiveDuration)}
                          zoomRange={zoomRange}
                          indent={groupByPattern}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <DetailPanel entry={selected} logs={data.logs} onClose={() => setSelected(null)} onToast={toast} />
          )}
        </div>
      )}

      {/* ── Log timeline ───────────────────────────────────────── */}
      {data.logs.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Console Logs</span>
            <span className="text-[10px] text-slate-400">{data.logs.length} entries</span>
            {logName && <span className="text-[10px] text-slate-300 dark:text-slate-600">{logName}</span>}
            {selectedLog && (
              <span className="text-[10px] text-blue-500 dark:text-blue-400 ml-auto">
                {correlatedEntryIds.size} request{correlatedEntryIds.size !== 1 ? 's' : ''} active at <span className="font-mono">{formatMs(selectedLog.relMs)}</span>
                <button onClick={() => setSelectedLog(null)} className="ml-2 text-slate-400 hover:text-slate-600 cursor-pointer"><X size={10} /></button>
              </span>
            )}
            {selected && (
              <span className="text-[10px] text-amber-500 dark:text-amber-400 ml-auto">
                {correlatedLogIds.size} log{correlatedLogIds.size !== 1 ? 's' : ''} during <span className="font-mono font-bold">{selected.pathname}</span>
              </span>
            )}
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
            {data.logs.map(log => {
              const isSelectedLog   = selectedLog?.id === log.id;
              const isCorrelatedLog = selected ? correlatedLogIds.has(log.id) : false;
              return (
                <div key={log.id} onClick={() => { setSelected(null); setSelectedLog(l => l?.id === log.id ? null : log); }}
                  className={`flex items-start gap-3 px-4 py-1.5 border-b border-slate-50 dark:border-slate-800/50 text-xs cursor-pointer transition-colors ${isSelectedLog ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-inset ring-blue-200 dark:ring-blue-800' : isCorrelatedLog ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-white/3'}`}>
                  <div className="w-1 shrink-0 self-stretch rounded-full mt-0.5" style={{ backgroundColor: logLevelDotColor(log.level) }} />
                  <span className="font-mono text-slate-400 shrink-0 text-[10px]">{formatMs(log.relMs)}</span>
                  <span className={`font-black uppercase text-[9px] shrink-0 w-10 ${levelColor(log.level)}`}>{log.level}</span>
                  <span className="text-slate-600 dark:text-slate-300 break-all flex-1">{log.message}</span>
                  {log.tags.length > 0 && (
                    <div className="flex gap-1 shrink-0">{log.tags.map((t, i) => <TagBadge key={i} tag={t.tag} color={t.color} />)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Export report ──────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            const rep = {
              file: harName, analyzedAt: new Date().toISOString(),
              totalRequests: data.entries.length, duration: data.duration,
              flagged: data.entries.filter(e => e.tags.length > 0).map(e => ({ url: e.url, method: e.method, status: e.status, time: e.time, tags: e.tags.map(t => t.tag) })),
            };
            const blob = new Blob([JSON.stringify(rep, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `waterfall-report-${Date.now()}.json`; a.click();
          }}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
        >
          <Download size={12} /> Export Report
        </button>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {ruleManager}
      {showCompare && (
        <CompareModal
          baseData={data}
          compareData={compareData}
          onClose={() => setShowCompare(false)}
          onLoadCompare={(text, _name) => {
            if (!text) { setCompareData(null); setCompareText(null); return; }
            setCompareText(text);
          }}
        />
      )}
      {helpModal}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
};

export default NetworkWaterfallAnalyzer;
