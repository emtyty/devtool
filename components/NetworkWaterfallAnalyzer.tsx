import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, X, Settings, Search, Download, ChevronRight, Clock, HardDrive,
  Activity, AlertTriangle, Filter, Pencil, CheckCircle, Trash2, Info,
  GitCompare, Layers, BarChart2, ChevronDown, ChevronUp, ZoomOut,
  Copy, Check, TrendingUp, TrendingDown, Minus, Globe, Terminal,
} from 'lucide-react';
import {
  DEFAULT_RULES, Rule, HarEntry, LogEntry, ParseResult, Operator, RuleTarget, Severity,
  computeSummary, normalizeUrlPattern, detectDuplicates, DuplicateGroup,
  getCacheInfo, getCompressionInfo, getPerfInsight, generateCurl, HarSummary,
  Issue,
  detectN1Waterfall, detectInfinitePolling, detectCorsPreflightStorm,
  detectZombieApiCalls, detectRedirectLoops, detectHeavyThirdParty,
  detectCacheMissTrend, detectHeaderLeakage, detectLargePayloadDom, detectUncompressedBloat,
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

// ── Log row (interleaved in waterfall) ────────────────────────────

function LogWaterfallRow({
  log, isSelected, isCorrelated, onClick,
}: {
  key?: React.Key;
  log: LogEntry;
  isSelected: boolean;
  isCorrelated: boolean;
  onClick: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(log.message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div
      onClick={onClick}
      style={{ height: ROW_HEIGHT, borderLeft: `3px solid ${logLevelDotColor(log.level)}` }}
      className={`group flex items-center border-b border-slate-100 dark:border-slate-800 cursor-pointer select-none transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : isCorrelated
          ? 'bg-amber-50/80 dark:bg-amber-900/15'
          : 'bg-slate-50/60 dark:bg-slate-800/25 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
      }`}
    >
      {/* Spacer aligns with Status col (w-12 minus the 3px border) */}
      <div className="w-[45px] shrink-0" />

      {/* Level badge — aligns with Method col (w-14) */}
      <div className="w-14 shrink-0 px-1">
        <span className={`text-[9px] font-black uppercase ${levelColor(log.level)}`}>{log.level}</span>
      </div>

      {/* Timestamp — aligns with URL/Path col (w-40) */}
      <div className="w-40 shrink-0 px-2">
        <span className="text-[10px] font-mono text-slate-400">{formatMs(log.relMs)}</span>
      </div>

      {/* Message — spans the timeline area (flex-1) */}
      <div className="flex-1 px-3 overflow-hidden flex items-center gap-2 min-w-0">
        <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0 italic">
          {log.message}
        </span>
        {log.tags.length > 0 && (
          <div className="shrink-0 flex gap-1">
            {log.tags.slice(0, 2).map((t, i) => <TagBadge key={i} tag={t.tag} color={t.color} />)}
          </div>
        )}
      </div>

      {/* Empty spacers for Time / Size cols */}
      <div className="w-16 shrink-0" />
      <div className="w-14 shrink-0" />

      {/* Copy button — replaces Log-count col (w-8) */}
      <div className="w-8 shrink-0 flex items-center justify-center">
        <button
          onClick={handleCopy}
          title="Copy message"
          className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          {copied
            ? <Check size={11} className="text-emerald-500" />
            : <Copy size={11} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
          }
        </button>
      </div>
    </div>
  );
}

interface WaterfallRowProps {
  key?: React.Key;
  entry: HarEntry;
  duration: number;
  isSelected: boolean;
  isCorrelated: boolean;
  isHighlighted?: boolean;
  logCount: number;
  isLogExpanded?: boolean;
  onClick: () => void;
  onLogClick?: () => void;
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
  entry, duration, isSelected, isCorrelated, isHighlighted, logCount, isLogExpanded, onClick, onLogClick, onDoubleClick,
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
          <button
            onClick={e => { e.stopPropagation(); onLogClick?.(); }}
            title={isLogExpanded ? 'Collapse logs' : `${logCount} log${logCount !== 1 ? 's' : ''} — click to show inline`}
            className={`text-[9px] font-black rounded px-1 transition-colors cursor-pointer ${
              isLogExpanded
                ? 'bg-amber-400 dark:bg-amber-600 text-white'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/50'
            }`}
          >
            {logCount}
          </button>
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

// ── Mini Charts ───────────────────────────────────────────────────

function StatusDonutCard({ entries, activeRange, onSliceClick }: {
  entries: HarEntry[];
  activeRange: string;
  onSliceClick: (range: string) => void;
}) {
  const counts = useMemo(() => {
    const c = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    for (const e of entries) {
      if (e.status >= 500) c['5xx']++;
      else if (e.status >= 400) c['4xx']++;
      else if (e.status >= 300) c['3xx']++;
      else if (e.status >= 200) c['2xx']++;
    }
    return c;
  }, [entries]);

  const total = entries.length;
  const slices = ([
    { key: '2xx' as const, color: '#10b981', label: '2xx' },
    { key: '3xx' as const, color: '#94a3b8', label: '3xx' },
    { key: '4xx' as const, color: '#f97316', label: '4xx' },
    { key: '5xx' as const, color: '#ef4444', label: '5xx' },
  ] as const).filter(s => counts[s.key] > 0).map(s => ({ ...s, value: counts[s.key] }));

  const cx = 36, cy = 36, r = 26, sw = 10;
  const C = 2 * Math.PI * r;
  let cumulativePct = 0;
  const segments = slices.map(s => {
    const pct = s.value / total;
    const offset = C * (0.25 - cumulativePct);
    cumulativePct += pct;
    return { ...s, pct, dash: pct * C, offset };
  });

  const hasActive = activeRange !== '';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Status Distribution</span>
        {hasActive && (
          <button onClick={() => onSliceClick('')} className="text-[9px] text-blue-500 hover:text-blue-700 cursor-pointer font-bold ml-auto">Clear ×</button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-slate-100 dark:stroke-slate-800" strokeWidth={sw} />
          {segments.map((s, i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={s.color} strokeWidth={sw}
              strokeDasharray={`${s.dash} ${C - s.dash}`}
              strokeDashoffset={s.offset}
              opacity={hasActive ? (activeRange === s.key ? 1 : 0.25) : 1}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              onClick={() => onSliceClick(activeRange === s.key ? '' : s.key)}
            />
          ))}
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="900"
            className="fill-slate-700 dark:fill-slate-200 pointer-events-none">
            {hasActive ? (counts[activeRange as keyof typeof counts] ?? total) : total}
          </text>
        </svg>
        <div className="space-y-1.5 flex-1 min-w-0">
          {segments.map(s => {
            const isActive = activeRange === s.key;
            return (
              <button key={s.key} onClick={() => onSliceClick(isActive ? '' : s.key)}
                className={`w-full flex items-center gap-1.5 text-[10px] rounded px-1 py-0.5 transition-colors cursor-pointer ${isActive ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'} ${hasActive && !isActive ? 'opacity-40' : ''}`}>
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-slate-500 dark:text-slate-400 w-6">{s.label}</span>
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.pct * 100}%`, backgroundColor: s.color }} />
                </div>
                <span className="font-black w-5 text-right shrink-0 tabular-nums" style={{ color: s.color }}>{s.value}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const HISTOGRAM_BUCKETS = [
  { label: '<100ms',    min: 0,    max: 100,      color: '#10b981' },
  { label: '100–500ms', min: 100,  max: 500,      color: '#3b82f6' },
  { label: '500ms–1s',  min: 500,  max: 1000,     color: '#f59e0b' },
  { label: '1–3s',      min: 1000, max: 3000,     color: '#f97316' },
  { label: '>3s',       min: 3000, max: Infinity,  color: '#ef4444' },
] as const;

function ResponseHistogramCard({ entries, activeTimeRange, onBucketClick }: {
  entries: HarEntry[];
  activeTimeRange: { min: number; max: number } | null;
  onBucketClick: (range: { min: number; max: number } | null) => void;
}) {
  const counts = useMemo(() => {
    return HISTOGRAM_BUCKETS.map(b => {
      const count = entries.filter(e => e.time >= b.min && e.time < b.max).length;
      return { ...b, count };
    });
  }, [entries]);

  const max = Math.max(...counts.map(b => b.count), 1);
  const hasActive = activeTimeRange !== null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Response Time</span>
        {hasActive && (
          <button onClick={() => onBucketClick(null)} className="text-[9px] text-blue-500 hover:text-blue-700 cursor-pointer font-bold ml-auto">Clear ×</button>
        )}
      </div>
      <div className="space-y-1.5">
        {counts.map(b => {
          const isActive = hasActive && activeTimeRange!.min === b.min && activeTimeRange!.max === b.max;
          return (
            <button key={b.label} onClick={() => onBucketClick(isActive ? null : { min: b.min, max: b.max })}
              className={`w-full flex items-center gap-2 text-[10px] rounded px-1 py-0.5 transition-colors cursor-pointer ${isActive ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'} ${hasActive && !isActive ? 'opacity-40' : ''}`}>
              <span className="w-[68px] shrink-0 text-slate-400 dark:text-slate-500 text-right">{b.label}</span>
              <div className="flex-1 h-3.5 bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                <div className="h-full rounded-sm transition-all"
                  style={{ width: `${(b.count / max) * 100}%`, backgroundColor: b.color, minWidth: b.count > 0 ? 3 : 0 }} />
              </div>
              <span className="w-5 text-right font-black shrink-0 tabular-nums" style={{ color: b.count > 0 ? b.color : undefined }}>{b.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimelineSparklineCard({ entries, duration, zoomRange, onBucketZoom }: {
  entries: HarEntry[];
  duration: number;
  zoomRange: { start: number; end: number } | null;
  onBucketZoom: (range: { start: number; end: number } | null) => void;
}) {
  const BUCKETS = 32;
  const bSize = duration > 0 ? duration / BUCKETS : 1;

  const bars = useMemo(() => {
    const arr = Array<number>(BUCKETS).fill(0);
    if (duration <= 0) return arr;
    for (const e of entries) {
      const idx = Math.min(BUCKETS - 1, Math.floor(e.relStartMs / bSize));
      arr[idx]++;
    }
    return arr;
  }, [entries, duration, bSize]);

  const max = Math.max(...bars, 1);

  const isInZoom = (i: number) => {
    if (!zoomRange) return false;
    const start = i * bSize;
    const end = (i + 1) * bSize;
    return start < zoomRange.end && end > zoomRange.start;
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Requests / Time</span>
        {zoomRange && (
          <button onClick={() => onBucketZoom(null)} className="text-[9px] text-blue-500 hover:text-blue-700 cursor-pointer font-bold ml-auto">Reset zoom ×</button>
        )}
      </div>
      <div className="flex items-end gap-px h-[52px]">
        {bars.map((count, i) => {
          const active = isInZoom(i);
          return (
            <button key={i}
              onClick={() => {
                const start = i * bSize;
                const end = Math.min(duration, (i + 1) * bSize);
                const alreadyExact = zoomRange && Math.abs(zoomRange.start - start) < 1 && Math.abs(zoomRange.end - end) < 1;
                onBucketZoom(alreadyExact ? null : { start, end });
              }}
              className="flex-1 flex items-end h-full cursor-pointer group/bar"
              title={count > 0 ? `${formatMs(i * bSize)} – ${formatMs((i + 1) * bSize)}: ${count} request${count !== 1 ? 's' : ''}` : undefined}
            >
              <div className={`w-full rounded-t-[1px] transition-colors ${active ? 'bg-blue-500 dark:bg-blue-400' : 'bg-blue-300 dark:bg-blue-700 group-hover/bar:bg-blue-400 dark:group-hover/bar:bg-blue-500'} ${zoomRange && !active ? 'opacity-30' : ''}`}
                style={{ height: count > 0 ? `${Math.max(3, (count / max) * 100)}%` : 0 }} />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] mt-1.5">
        <span className="text-slate-400">0s</span>
        <span className="text-slate-300 dark:text-slate-600">{entries.length} requests</span>
        <span className="text-slate-400">{formatMs(duration)}</span>
      </div>
    </div>
  );
}

// ── Summary Dashboard ─────────────────────────────────────────────

function SummaryDashboard({ summary, data, filter, zoomRange, onClickSlowest, onClickLargest, onStatusFilter, onTimeRangeFilter, onZoomToRange }: {
  summary: HarSummary;
  data: ParseResult;
  filter: FilterState;
  zoomRange: { start: number; end: number } | null;
  onClickSlowest: () => void;
  onClickLargest: () => void;
  onStatusFilter: (range: string) => void;
  onTimeRangeFilter: (range: { min: number; max: number } | null) => void;
  onZoomToRange: (range: { start: number; end: number } | null) => void;
}) {
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

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusDonutCard entries={data.entries} activeRange={filter.statusRange} onSliceClick={onStatusFilter} />
        <ResponseHistogramCard entries={data.entries} activeTimeRange={filter.timeRange} onBucketClick={onTimeRangeFilter} />
        <TimelineSparklineCard entries={data.entries} duration={summary.totalDuration} zoomRange={zoomRange} onBucketZoom={onZoomToRange} />
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

// ── Advanced Issues Panel ─────────────────────────────────────────

const ISSUE_TYPE_LABELS: Record<string, string> = {
  'n1-waterfall':         'N+1 Waterfall',
  'infinite-polling':     'Infinite Polling',
  'cors-preflight-storm': 'CORS Storm',
  'zombie-api':           'Zombie API',
  'redirect-loop':        'Redirect Loop',
  'heavy-third-party':    'Heavy 3rd-Party',
};

interface IssueDocs { what: string; why: string; fix: string; impact: string }

const ISSUE_DOCS: Record<string, IssueDocs> = {
  'n1-waterfall': {
    what: 'Multiple sequential requests to the same endpoint fired with <20ms between starts.',
    why: 'Creates a "staircase" waterfall — each iteration waits for the previous to begin. Causes massive TTFB and UI lag.',
    fix: 'Batch with Promise.all(), collect IDs first then call a bulk endpoint, or use a DataLoader pattern.',
    impact: 'Critical UI Lag / High TTFB',
  },
  'infinite-polling': {
    what: 'Identical GET requests repeating at a fixed interval throughout the session.',
    why: 'Drains CPU on the client, creates constant server load, and wastes bandwidth even when data hasn\'t changed.',
    fix: 'Replace with WebSockets, Server-Sent Events (SSE), or HTTP long-polling. If polling is necessary, add exponential back-off.',
    impact: 'CPU Drain / Unnecessary Server Load',
  },
  'cors-preflight-storm': {
    what: 'OPTIONS preflight count equals or exceeds actual API calls on multiple endpoints.',
    why: 'Browser cannot cache preflights (Access-Control-Max-Age=0 or missing). Every request doubles in latency.',
    fix: 'Set Access-Control-Max-Age to a high value (86400). Ensure CORS headers are consistent so the browser can cache preflight results.',
    impact: 'Doubled Latency on Every API Call',
  },
  'zombie-api': {
    what: 'Repeated HTTP 200 OK responses with an empty body (≤10 bytes) on the same endpoint.',
    why: 'Wastes connection slots, TCP handshakes, and bandwidth for calls that deliver no usable data to the client.',
    fix: 'Return 204 No Content when there is no body, or investigate why the endpoint returns empty JSON {} repeatedly.',
    impact: 'Wasted Connections / Misleading Status',
  },
  'redirect-loop': {
    what: 'The same URL receives 3 or more consecutive 301/302 redirect responses.',
    why: 'Browser aborts the chain after a limit (~20 hops), resulting in a fatal ERR_TOO_MANY_REDIRECTS or timeout.',
    fix: 'Trace the redirect chain on the server. Ensure each path leads to a final destination without looping back.',
    impact: 'Fatal Error / Request Timeout',
  },
  'heavy-third-party': {
    what: 'Third-party domains account for more than 60% of total transfer size.',
    why: 'Creates privacy risk (user data sent to external parties), single-point-of-failure fragility, and slower FCP/LCP.',
    fix: 'Self-host critical scripts, lazy-load analytics after interaction, use <link rel="preconnect"> for known third-parties, and audit which scripts are truly necessary.',
    impact: 'Privacy Risk / Performance Fragility',
  },
  'uncompressed-bloat': {
    what: 'Responses over 1 MB sent without Content-Encoding (gzip/br/deflate).',
    why: 'Wastes bandwidth and slows page load — a 3 MB uncompressed JSON can be ~200 KB after gzip. Particularly painful on mobile networks.',
    fix: 'Enable gzip or Brotli compression on your server/CDN for all text-based responses (JSON, HTML, JS, CSS).',
    impact: 'High Bandwidth / Slow Load',
  },
  'cache-miss-trend': {
    what: 'Static assets (JS, CSS, images, fonts) served with Cache-Control: no-cache or no-store.',
    why: 'Prevents the browser from caching immutable assets, forcing a full re-download on every page load.',
    fix: 'For fingerprinted/hashed assets (e.g. main.a1b2c3.js), use Cache-Control: max-age=31536000, immutable. Reserve no-cache for truly dynamic resources.',
    impact: 'Repeated Downloads / Slow Repeat Visits',
  },
  'header-leakage': {
    what: 'Sensitive auth headers (Authorization, X-Api-Key, Set-Cookie, etc.) sent over plain HTTP.',
    why: 'Plain HTTP traffic can be intercepted by a network attacker. Credentials transmitted this way are exposed in clear text.',
    fix: 'Enforce HTTPS everywhere. Add HSTS headers and redirect all HTTP traffic to HTTPS at the load balancer level.',
    impact: 'Security Risk / Credential Exposure',
  },
  'large-payload-dom': {
    what: 'HTML responses larger than 500 KB.',
    why: 'Large HTML documents delay First Contentful Paint (FCP), increase parse time, and block rendering on slow connections.',
    fix: 'Use server-side pagination, lazy-load non-critical content, or split server-rendered HTML with streaming (React SSR / Suspense).',
    impact: 'Slow FCP / High Parse Time',
  },
};

function IssueInfoTooltip({ type }: { type: string }) {
  const doc = ISSUE_DOCS[type];
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  if (!doc) return null;

  const handleMouseEnter = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const TOOLTIP_H = 220;
    const above = window.innerHeight - rect.bottom < TOOLTIP_H + 8;
    setPos({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: Math.min(rect.left, window.innerWidth - 296),
      above,
    });
  };

  return (
    <div
      ref={triggerRef}
      className="shrink-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      <Info size={11} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-help transition-colors" />
      {pos && (
        <div
          style={{
            position: 'fixed',
            top: pos.above ? undefined : pos.top,
            bottom: pos.above ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: 288,
            zIndex: 9999,
          }}
          className="bg-slate-900 dark:bg-slate-800 border border-slate-700 text-white rounded-xl shadow-2xl p-3 text-[10px] leading-relaxed pointer-events-none"
        >
          <div className="space-y-2">
            <div>
              <span className="font-black text-slate-400 uppercase tracking-wider text-[8px] block mb-0.5">What</span>
              <span className="text-slate-200">{doc.what}</span>
            </div>
            <div>
              <span className="font-black text-amber-400 uppercase tracking-wider text-[8px] block mb-0.5">Why it matters</span>
              <span className="text-slate-200">{doc.why}</span>
            </div>
            <div>
              <span className="font-black text-emerald-400 uppercase tracking-wider text-[8px] block mb-0.5">How to fix</span>
              <span className="text-slate-200">{doc.fix}</span>
            </div>
            <div className="pt-1 border-t border-slate-700">
              <span className="font-black text-red-400 uppercase tracking-wider text-[8px]">Impact: </span>
              <span className="text-red-300 font-semibold">{doc.impact}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdvancedIssuesPanel({
  issues,
  onHighlight,
  onScrollTo,
}: {
  issues: Issue[];
  onHighlight: (ids: Set<string>) => void;
  onScrollTo: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (issues.length === 0) return null;

  const criticalCount = issues.filter(i => i.severity === 'critical').length;

  const severityChipCls = (sev: Severity) => {
    if (sev === 'critical') return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
    if (sev === 'error')    return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
    return 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400';
  };

  const borderAccent = (sev: Severity) => {
    if (sev === 'critical') return 'border-l-red-500';
    if (sev === 'error')    return 'border-l-orange-500';
    return 'border-l-amber-400';
  };


  return (
    <div className="border border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden">
      {/* Panel header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-violet-50 dark:bg-violet-900/20 text-left cursor-pointer hover:bg-violet-100/70 dark:hover:bg-violet-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-violet-500 shrink-0" />
          <span className="text-xs font-black text-violet-700 dark:text-violet-400">Advanced Issues</span>
          <span className="text-[10px] bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 font-black px-1.5 py-0.5 rounded">
            {issues.length} issue{issues.length !== 1 ? 's' : ''}
          </span>
          {criticalCount > 0 && (
            <span className="text-[10px] bg-red-600 text-white font-black px-1.5 py-0.5 rounded">
              {criticalCount} critical
            </span>
          )}
        </div>
        {open ? <ChevronUp size={14} className="text-violet-500" /> : <ChevronDown size={14} className="text-violet-500" />}
      </button>

      {open && (
        <div className="divide-y divide-violet-100 dark:divide-violet-900/40 bg-white dark:bg-slate-900">
          {issues.map(issue => {
            const isActive   = activeId === issue.id;
            const isExpanded = expandedId === issue.id;
            return (
              <div key={issue.id} className={`border-l-4 ${borderAccent(issue.severity)}`}>
                {/* Issue summary row */}
                <div
                  onClick={() => {
                    const next = activeId === issue.id ? null : issue.id;
                    setActiveId(next);
                    setExpandedId(id => id === issue.id ? null : issue.id);
                    if (next) {
                      onHighlight(new Set(issue.entries.map(en => en.id)));
                      if (issue.entries.length > 0) onScrollTo(issue.entries[0].id);
                    } else {
                      onHighlight(new Set());
                    }
                  }}
                  className={`px-4 py-2.5 cursor-pointer transition-colors ${
                    isActive ? 'bg-violet-50 dark:bg-violet-900/15' : 'hover:bg-slate-50 dark:hover:bg-white/3'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${severityChipCls(issue.severity)}`}>
                      {issue.severity}
                    </span>
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                      {ISSUE_TYPE_LABELS[issue.type] ?? issue.type}
                    </span>
                    <IssueInfoTooltip type={issue.type} />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1 min-w-0 truncate">{issue.title}</span>
                    {isActive && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 shrink-0">
                        highlighted ×
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-0 leading-relaxed">
                    {issue.description}
                  </p>
                </div>

                {/* Expanded entry list */}
                {isExpanded && issue.entries.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 px-4 py-2 space-y-0.5">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      {issue.entries.length} affected request{issue.entries.length !== 1 ? 's' : ''}
                    </div>
                    {issue.entries.slice(0, 12).map(e => (
                      <div
                        key={e.id}
                        onClick={ev => { ev.stopPropagation(); onScrollTo(e.id); }}
                        className="flex items-center gap-2 text-[10px] py-0.5 rounded px-1 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                        title="Click to scroll waterfall to this request"
                      >
                        <span className={`font-black w-8 shrink-0 ${statusColor(e.status)}`}>{e.status || '—'}</span>
                        <span className={`text-[8px] font-black px-1 py-0.5 rounded shrink-0 ${methodColor(e.method)}`}>{e.method}</span>
                        <span className="text-slate-600 dark:text-slate-300 font-mono flex-1 truncate" title={e.url}>{e.pathname}</span>
                        <span className="text-slate-400 font-mono shrink-0">{formatMs(e.time)}</span>
                        <ChevronRight size={9} className="text-violet-400 shrink-0" />
                      </div>
                    ))}
                    {issue.entries.length > 12 && (
                      <p className="text-[10px] text-slate-400 pt-1">…and {issue.entries.length - 12} more</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

// ── Total Timing View ─────────────────────────────────────────────

const TIMING_PHASES = [
  { key: 'send',     label: 'Send',     color: '#3b82f6', desc: 'Blocked + DNS + Connect + SSL + Send' },
  { key: 'ttfb',     label: 'TTFB',     color: '#f59e0b', desc: 'Waiting for first byte (server processing)' },
  { key: 'download', label: 'Download', color: '#10b981', desc: 'Response body download (Receive)' },
] as const;

function TotalTimingView({ entries }: { entries: HarEntry[] }) {
  const [sortKey, setSortKey] = useState<'total' | 'send' | 'ttfb' | 'download'>('total');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const rows = useMemo(() => {
    return entries.map(e => {
      const t = e.timings;
      const send     = t.blocked + t.dns + t.connect + t.ssl + t.send;
      const ttfb     = t.wait;
      const download = t.receive;
      const total    = send + ttfb + download;
      return { entry: e, send, ttfb, download, total };
    });
  }, [entries]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [rows, sortKey, sortDir]);

  const maxTotal = useMemo(() => Math.max(...rows.map(r => r.total), 1), [rows]);

  const avg = useMemo(() => {
    if (!rows.length) return { send: 0, ttfb: 0, download: 0, total: 0 };
    const sum = rows.reduce((acc, r) => ({ send: acc.send + r.send, ttfb: acc.ttfb + r.ttfb, download: acc.download + r.download, total: acc.total + r.total }), { send: 0, ttfb: 0, download: 0, total: 0 });
    return { send: sum.send / rows.length, ttfb: sum.ttfb / rows.length, download: sum.download / rows.length, total: sum.total / rows.length };
  }, [rows]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const SortBtn = ({ k, label }: { k: typeof sortKey; label: string }) => (
    <button onClick={() => toggleSort(k)} className="flex items-center gap-0.5 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
      {label}
      <span className="text-[8px]">{sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}</span>
    </button>
  );

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
      {/* Legend + summary */}
      <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex-wrap">
        {TIMING_PHASES.map(p => (
          <div key={p.key} className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="font-semibold">{p.label}</span>
            <span className="hidden sm:inline text-slate-400">— {p.desc}</span>
          </div>
        ))}
        <div className="ml-auto text-[10px] text-slate-400 font-mono">
          avg: <span style={{ color: TIMING_PHASES[0].color }}>{formatMs(avg.send)}</span>
          {' / '}
          <span style={{ color: TIMING_PHASES[1].color }}>{formatMs(avg.ttfb)}</span>
          {' / '}
          <span style={{ color: TIMING_PHASES[2].color }}>{formatMs(avg.download)}</span>
          {' = '}
          <span className="font-black text-slate-600 dark:text-slate-200">{formatMs(avg.total)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <th className="px-3 py-2 text-left w-14 shrink-0">Status</th>
              <th className="px-2 py-2 text-left w-12 shrink-0">Method</th>
              <th className="px-3 py-2 text-left">URL / Path</th>
              <th className="px-3 py-2 text-right w-20"><SortBtn k="send" label="Send" /></th>
              <th className="px-3 py-2 text-right w-20"><SortBtn k="ttfb" label="TTFB" /></th>
              <th className="px-3 py-2 text-right w-24"><SortBtn k="download" label="Download" /></th>
              <th className="px-3 py-2 text-right w-20"><SortBtn k="total" label="Total" /></th>
              <th className="px-3 py-2 w-36">Breakdown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sorted.map(({ entry: e, send, ttfb, download, total }) => {
              const totalForBar = Math.max(total, 1);
              const statusCls = e.status >= 500 ? 'text-red-500' : e.status >= 400 ? 'text-orange-500' : e.status >= 300 ? 'text-yellow-500' : 'text-emerald-600 dark:text-emerald-400';
              return (
                <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-white/3 transition-colors">
                  <td className={`px-3 py-1.5 font-black tabular-nums ${statusCls}`}>{e.status}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">{e.method}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-300 max-w-0 truncate" title={e.pathname}>{e.pathname}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-mono" style={{ color: TIMING_PHASES[0].color }}>{formatMs(send)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-mono" style={{ color: TIMING_PHASES[1].color }}>{formatMs(ttfb)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-mono" style={{ color: TIMING_PHASES[2].color }}>{formatMs(download)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-black text-slate-700 dark:text-slate-200">{formatMs(total)}</td>
                  <td className="px-3 py-1.5">
                    {/* Stacked bar */}
                    <div className="h-3 rounded overflow-hidden flex" style={{ width: `${Math.max(4, (total / maxTotal) * 100)}%`, minWidth: 4 }}>
                      <div style={{ width: `${(send / totalForBar) * 100}%`, background: TIMING_PHASES[0].color }} />
                      <div style={{ width: `${(ttfb / totalForBar) * 100}%`, background: TIMING_PHASES[1].color }} />
                      <div style={{ width: `${(download / totalForBar) * 100}%`, background: TIMING_PHASES[2].color }} />
                    </div>
                  </td>
                </tr>
              );
            })}
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
        fetch(`${base}/test-data/sample.txt`),
      ]);
      if (!harRes.ok) throw new Error(`Cannot load sample.har (${harRes.status})`);
      if (!logRes.ok) throw new Error(`Cannot load sample.txt (${logRes.status})`);
      const [har, log] = await Promise.all([harRes.text(), logRes.text()]);
      onHar(har, 'sample.har');
      onLog(log, 'sample.txt');
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
    title: 'Log Overlay (Interleaved Mode)',
    color: 'text-emerald-600 dark:text-emerald-400',
    items: [
      { icon: '📟', text: 'Toggle "Logs" button in toolbar — merges console logs directly into the waterfall, sorted by time' },
      { icon: '→', text: 'Click a request row → all logs within its time window highlight amber in the waterfall' },
      { icon: '←', text: 'Click a log row → network requests active at that timestamp highlight blue' },
      { icon: '📋', text: 'Request detail panel shows correlated logs in the "Console Logs" section at the bottom' },
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
      { icon: '📊', text: 'Summary Dashboard shows P50/P95/P99 latency, error rate, avg TTFB' },
      { icon: '⚠️', text: 'Issues panel auto-detects N+1 patterns (same URL called 3+ times)' },
      { icon: '🌐', text: '"By Domain" tab breaks down count, errors, avg time, total size per host' },
      { icon: '⚖️', text: '"Compare" loads a second HAR to diff average response times side by side' },
    ],
  },
  {
    title: 'Other Actions',
    color: 'text-slate-600 dark:text-slate-400',
    items: [
      { icon: '📋', text: 'Request detail → "cURL" button copies the full request as a curl command' },
      { icon: '🕐', text: '"Log TZ" dropdown shifts log timestamps to align with HAR time (HAR is always UTC)' },
      { icon: '🔄', text: '"Re-analyze" re-runs parsing — use after changing rules or timezone offset' },
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
        {/* HAR export guide */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">How to export a HAR file</p>
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Chrome / Edge / Brave</p>
            <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open DevTools (F12) → <span className="font-semibold">Network</span> tab</li>
              <li>Reproduce the issue or navigate the page</li>
              <li>Right-click any request → <span className="font-semibold">Save all as HAR with content</span></li>
            </ol>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Firefox</p>
            <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open DevTools (F12) → <span className="font-semibold">Network</span> tab</li>
              <li>Click the gear icon → <span className="font-semibold">Save All As HAR</span></li>
            </ol>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Safari</p>
            <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Enable DevTools: Preferences → Advanced → Show Develop menu</li>
              <li>Develop → Show Web Inspector → Network tab</li>
              <li>Click <span className="font-semibold">Export</span> (down-arrow icon)</li>
            </ol>
          </div>
        </div>

        {/* Console log export guide */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">How to get a console log file</p>

          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Browser (Chrome / Edge)</p>
            <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open DevTools → <span className="font-semibold">Console</span> tab</li>
              <li>Click ⚙ (gear) → enable <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded text-[10px]">Show timestamps</span></li>
              <li>Set log level to <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1 rounded text-[10px]">All levels</span> (Default / Verbose)</li>
              <li>Reproduce the issue, then right-click → <span className="font-semibold">Save as…</span></li>
            </ol>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Node.js / Backend</p>
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <p>Redirect stdout + stderr to a file:</p>
              <code className="block bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded font-mono text-[10px] text-slate-700 dark:text-slate-200">
                node app.js &gt; app.log 2&gt;&amp;1
              </code>
              <p className="mt-1">Or use a logger with ISO timestamps:</p>
              <code className="block bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded font-mono text-[10px] text-slate-700 dark:text-slate-200">
                winston / pino / bunyan → format: timestamp
              </code>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Other sources</p>
            <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li>AWS CloudWatch, Datadog, Loki → export as plain text</li>
              <li>Docker: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-[10px]">docker logs container &gt; app.log</code></li>
              <li>PM2: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-[10px]">~/.pm2/logs/app-out.log</code></li>
            </ul>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-1.5">
            <p className="text-[10px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-widest">Critical: timestamp format</p>
            <div className="flex gap-2 items-start">
              <span className="text-emerald-500 shrink-0">✓</span>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-bold">Best:</span> ISO 8601 with timezone — <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-[10px]">2024-11-15T10:00:00.050Z</code>
              </p>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-emerald-500 shrink-0">✓</span>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-bold">OK:</span> Date + time — <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-[10px]">2024-11-15 10:00:00.050</code>
              </p>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-amber-500 shrink-0">⚠</span>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-bold">Needs TZ offset:</span> Time-only — <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-[10px]">[10:00:00.050]</code> — use the <span className="font-semibold">Log TZ</span> dropdown to correct
              </p>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-red-500 shrink-0">✗</span>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-bold">No timestamp</span> — logs cannot be matched to requests
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

type SortKey = 'relStartMs' | 'time' | 'status' | 'responseSize' | 'method';
type ViewTab = 'requests' | 'domains' | 'timing';

interface FilterState {
  search: string;
  method: string;
  statusRange: string;
  onlyTagged: boolean;
  timeRange: { min: number; max: number } | null;
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
  const [filter, setFilter] = useState<FilterState>({ search: '', method: '', statusRange: '', onlyTagged: false, timeRange: null });

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
  const [interleavedLogs, setInterleavedLogs] = useState(false);
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'error' | 'warn' | 'error+warn'>('all');
  const [expandedLogEntry, setExpandedLogEntry] = useState<string | null>(null);
  const [highlightedIssueIds, setHighlightedIssueIds] = useState<Set<string>>(new Set());

  // ── Virtual scroll ────────────────────────────────────────────
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const waterfallSectionRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const compareWorkerRef = useRef<Worker | null>(null);
  const mergedRowsRef = useRef<any[]>([]);

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

  const advancedIssues = useMemo((): Issue[] => {
    if (!data) return [];
    return [
      ...detectN1Waterfall(data.entries),
      ...detectInfinitePolling(data.entries),
      ...detectCorsPreflightStorm(data.entries),
      ...detectZombieApiCalls(data.entries),
      ...detectRedirectLoops(data.entries),
      ...detectHeavyThirdParty(data.entries),
      ...detectUncompressedBloat(data.entries),
      ...detectCacheMissTrend(data.entries),
      ...detectHeaderLeakage(data.entries),
      ...detectLargePayloadDom(data.entries),
    ];
  }, [data]);

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
      if (filter.timeRange && (e.time < filter.timeRange.min || e.time >= filter.timeRange.max)) return false;
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

  const errorEntries = useMemo(() => filteredEntries.filter(e => e.status >= 400), [filteredEntries]);

  const statusCounts = useMemo(() => {
    if (!data) return { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    const c = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    for (const e of data.entries) {
      if (e.status >= 500) c['5xx']++;
      else if (e.status >= 400) c['4xx']++;
      else if (e.status >= 300) c['3xx']++;
      else if (e.status >= 200) c['2xx']++;
    }
    return c;
  }, [data]);

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

  type MergedRow = DisplayRow | { type: 'log'; log: LogEntry };

  const mergedRows = useMemo((): MergedRow[] => {
    // Full interleaved mode — all logs sorted into waterfall
    if (interleavedLogs && data && data.logs.length > 0) {
      const netRows: MergedRow[] = filteredEntries.map(e => ({ type: 'single' as const, entry: e }));
      const visibleLogs = data.logs.filter(log => {
        if (logLevelFilter === 'all') return true;
        if (logLevelFilter === 'error') return log.level === 'error';
        if (logLevelFilter === 'warn') return log.level === 'warn';
        if (logLevelFilter === 'error+warn') return log.level === 'error' || log.level === 'warn';
        return true;
      });
      const logRows: MergedRow[] = visibleLogs.map(log => ({ type: 'log' as const, log }));
      const getT = (r: MergedRow): number => {
        if (r.type === 'log') return r.log.relMs;
        if (r.type === 'group') return r.representative.relStartMs;
        return r.entry.relStartMs;
      };
      return [...netRows, ...logRows].sort((a, b) => getT(a) - getT(b));
    }

    // Single-entry log expansion — insert correlated logs right after the expanded row
    if (expandedLogEntry && data && data.logs.length > 0) {
      const result: MergedRow[] = [];
      for (const row of displayRows) {
        result.push(row);
        const entry = row.type === 'single' ? row.entry : row.type === 'group' ? row.representative : null;
        if (entry?.id === expandedLogEntry) {
          const correlated = data.logs.filter(l => l.relMs >= entry.relStartMs && l.relMs <= entry.relStartMs + entry.time);
          for (const log of correlated) result.push({ type: 'log' as const, log });
        }
      }
      return result;
    }

    return displayRows;
  }, [interleavedLogs, logLevelFilter, expandedLogEntry, displayRows, filteredEntries, data]);

  // Keep mergedRowsRef in sync for scroll-to-selected
  useEffect(() => { mergedRowsRef.current = mergedRows; }, [mergedRows]);

  // Scroll virtual list to show selected entry
  useEffect(() => {
    if (!selected || !scrollRef.current) return;
    const rows = mergedRowsRef.current;
    const idx = rows.findIndex((r: any) => {
      if (r.type === 'log') return false;
      if (r.type === 'group') return r.representative.id === selected.id;
      return r.entry.id === selected.id;
    });
    if (idx < 0) return;
    const targetTop = idx * ROW_HEIGHT;
    const { scrollTop: st, clientHeight } = scrollRef.current;
    if (targetTop < st || targetTop + ROW_HEIGHT > st + clientHeight) {
      scrollRef.current.scrollTo({ top: Math.max(0, targetTop - clientHeight / 3), behavior: 'smooth' });
    }
  }, [selected]);

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
  const endIdx   = Math.min(mergedRows.length, Math.ceil((scrollTop + CONTAINER_HEIGHT) / ROW_HEIGHT) + BUFFER);
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop), []);

  // Scroll page + virtual list to a specific entry (without opening detail panel)
  const scrollToEntry = useCallback((targetId: string) => {
    // 1. Switch to requests tab so waterfall is visible
    setViewTab('requests');
    // 2. Scroll page so waterfall section is visible
    if (waterfallSectionRef.current) {
      const rect = waterfallSectionRef.current.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.5) {
        waterfallSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    // 3. Scroll virtual list to the entry (slight delay to let tab switch render)
    setTimeout(() => {
      if (!scrollRef.current) return;
      const rows = mergedRowsRef.current;
      const idx = rows.findIndex((r: any) => {
        if (r.type === 'log') return false;
        if (r.type === 'group') return r.representative.id === targetId;
        return r.entry.id === targetId;
      });
      if (idx < 0) return;
      const targetTop = idx * ROW_HEIGHT;
      const { scrollTop: st, clientHeight } = scrollRef.current;
      if (targetTop < st || targetTop + ROW_HEIGHT > st + clientHeight) {
        scrollRef.current.scrollTo({ top: Math.max(0, targetTop - clientHeight / 3), behavior: 'smooth' });
      }
    }, 50);
  }, []);

  // ── Actions ───────────────────────────────────────────────────
  const reset = () => {
    setHarText(null); setLogText(null); setHarName(null); setLogName(null);
    setData(null); setSelected(null); setSelectedLog(null); setError(null);
    setCompareData(null); setCompareText(null); setZoomRange(null); setHighlightedPattern(null);
    setHighlightedIssueIds(new Set());
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

  const jumpToError = (dir: 1 | -1) => {
    if (errorEntries.length === 0) return;
    const currentPos = selected ? errorEntries.findIndex(e => e.id === selected.id) : -1;
    let next = currentPos + dir;
    if (next < 0) next = errorEntries.length - 1;
    if (next >= errorEntries.length) next = 0;
    setSelectedLog(null);
    setSelected(errorEntries[next]);
  };

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

        {/* Status filter chips */}
        <div className="flex items-center gap-1">
          {([
            { v: '',    label: 'All',  cnt: data.entries.length, active: 'bg-slate-200 dark:bg-slate-600 border-slate-400 dark:border-slate-500 text-slate-700 dark:text-slate-100' },
            { v: '2xx', label: '2xx',  cnt: statusCounts['2xx'], active: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-400 text-emerald-700 dark:text-emerald-300' },
            { v: '3xx', label: '3xx',  cnt: statusCounts['3xx'], active: 'bg-slate-100 dark:bg-slate-700 border-slate-400 text-slate-600 dark:text-slate-200' },
            { v: '4xx', label: '4xx',  cnt: statusCounts['4xx'], active: 'bg-orange-100 dark:bg-orange-900/40 border-orange-400 text-orange-700 dark:text-orange-300' },
            { v: '5xx', label: '5xx',  cnt: statusCounts['5xx'], active: 'bg-red-100 dark:bg-red-900/40 border-red-400 text-red-700 dark:text-red-300' },
          ] as const).filter(c => c.v === '' || c.cnt > 0).map(c => (
            <button key={c.v}
              onClick={() => setFilter(f => ({ ...f, statusRange: c.v }))}
              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border transition-colors cursor-pointer ${
                filter.statusRange === c.v
                  ? c.active
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {c.label}
              {c.v !== '' && <span className="opacity-60 text-[9px]">{c.cnt}</span>}
            </button>
          ))}
        </div>

        {/* Jump-to-error navigation */}
        {errorEntries.length > 0 && (
          <div className="flex items-center rounded-lg border border-red-200 dark:border-red-800 overflow-hidden shrink-0">
            <button onClick={() => jumpToError(-1)} title="Previous error" className="px-1.5 py-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 transition-colors cursor-pointer text-xs font-black">←</button>
            <span className="text-[10px] font-black text-red-500 px-1.5 tabular-nums">
              {selected && errorEntries.findIndex(e => e.id === selected.id) >= 0
                ? `${errorEntries.findIndex(e => e.id === selected.id) + 1}/${errorEntries.length}`
                : `${errorEntries.length} err`}
            </span>
            <button onClick={() => jumpToError(1)} title="Next error" className="px-1.5 py-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 transition-colors cursor-pointer text-xs font-black">→</button>
          </div>
        )}

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

        {/* Interleaved logs toggle */}
        {data.logs.length > 0 && (
          <button
            onClick={() => {
              setInterleavedLogs(v => !v);
              setLogLevelFilter('all');
            }}
            title={interleavedLogs ? 'Hide logs from waterfall' : 'Show logs inline in waterfall'}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              interleavedLogs
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-400'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Terminal size={11} />
            Logs
          </button>
        )}

        {/* Log level filter chips — only when interleaved mode is on */}
        {interleavedLogs && data.logs.length > 0 && (
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2">
            {(['all', 'error+warn', 'error', 'warn'] as const).map(level => {
              const labels: Record<string, string> = { all: 'All', 'error+warn': 'Err+Warn', error: 'Error', warn: 'Warn' };
              const activeColors: Record<string, string> = {
                all: 'bg-slate-100 border-slate-400 text-slate-700 dark:bg-slate-700 dark:border-slate-500 dark:text-slate-200',
                'error+warn': 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400',
                error: 'bg-red-50 border-red-400 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-400',
                warn: 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400',
              };
              const isActive = logLevelFilter === level;
              return (
                <button
                  key={level}
                  onClick={() => setLogLevelFilter(level)}
                  className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors cursor-pointer ${
                    isActive
                      ? activeColors[level]
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {labels[level]}
                </button>
              );
            })}
          </div>
        )}

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
        filter={filter} zoomRange={zoomRange}
        onClickSlowest={() => { if (summary.slowestEntry) { setSelected(summary.slowestEntry); setSelectedLog(null); } }}
        onClickLargest={() => { if (summary.largestEntry) { setSelected(summary.largestEntry); setSelectedLog(null); } }}
        onStatusFilter={range => setFilter(f => ({ ...f, statusRange: range }))}
        onTimeRangeFilter={range => setFilter(f => ({ ...f, timeRange: range }))}
        onZoomToRange={range => setZoomRange(range)}
      />}

      {/* ── Issues panel ───────────────────────────────────────── */}
      {duplicates.length > 0 && <IssuesPanel duplicates={duplicates} onHighlight={(pattern, method) => {
        setHighlightedPattern(prev => prev?.pattern === pattern && prev?.method === method ? null : { pattern, method });
        setHighlightedIssueIds(new Set());
      }} />}

      {/* ── Advanced Issues panel ──────────────────────────────── */}
      <AdvancedIssuesPanel
        issues={advancedIssues}
        onHighlight={ids => {
          setHighlightedIssueIds(ids);
          setHighlightedPattern(null);
        }}
        onScrollTo={scrollToEntry}
      />

      {/* ── View tab bar ────────────────────────────────────────── */}
      <div ref={waterfallSectionRef} className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['requests', 'domains', 'timing'] as ViewTab[]).map(tab => (
          <button key={tab} onClick={() => setViewTab(tab)}
            className={`px-4 py-2 text-xs font-bold capitalize transition-colors cursor-pointer border-b-2 -mb-px ${viewTab === tab ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}>
            {tab === 'requests' ? 'Requests' : tab === 'domains' ? 'By Domain' : 'Total Timing'}
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

      {/* ── Total Timing view ─────────────────────────────────── */}
      {viewTab === 'timing' && <TotalTimingView entries={data.entries} />}

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
              {mergedRows.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">No requests match the current filter.</div>
              ) : (
                <div style={{ height: mergedRows.length * ROW_HEIGHT, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: startIdx * ROW_HEIGHT, width: '100%' }}>
                    {mergedRows.slice(startIdx, endIdx).map((row, i) => {
                      if (row.type === 'log') {
                        return (
                          <LogWaterfallRow
                            key={row.log.id}
                            log={row.log}
                            isSelected={selectedLog?.id === row.log.id}
                            isCorrelated={selected ? correlatedLogIds.has(row.log.id) : false}
                            onClick={() => { setSelected(null); setSelectedLog(l => l?.id === row.log.id ? null : row.log); }}
                          />
                        );
                      }
                      if (row.type === 'group') {
                        const isExpanded = expandedGroups.has(row.key);
                        return (
                          <WaterfallRow
                            key={row.key}
                            entry={row.representative}
                            duration={effectiveDuration}
                            isSelected={selected?.id === row.representative.id}
                            isCorrelated={correlatedEntryIds.has(row.representative.id)}
                            isHighlighted={(!!highlightedPattern && normalizeUrlPattern(row.representative.pathname) === highlightedPattern.pattern && row.representative.method === highlightedPattern.method) || highlightedIssueIds.has(row.representative.id)}
                            logCount={logCountsPerEntry.get(row.representative.id) ?? 0}
                            isLogExpanded={expandedLogEntry === row.representative.id}
                            onClick={() => { setSelectedLog(null); setSelected(s => s?.id === row.representative.id ? null : row.representative); }}
                            onLogClick={() => { setSelectedLog(null); setSelected(row.representative); setExpandedLogEntry(id => id === row.representative.id ? null : row.representative.id); }}
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
                          isHighlighted={(!!highlightedPattern && normalizeUrlPattern(row.entry.pathname) === highlightedPattern.pattern && row.entry.method === highlightedPattern.method) || highlightedIssueIds.has(row.entry.id)}
                          logCount={logCountsPerEntry.get(row.entry.id) ?? 0}
                          isLogExpanded={expandedLogEntry === row.entry.id}
                          onClick={() => { setSelectedLog(null); setSelected(s => s?.id === row.entry.id ? null : row.entry); }}
                          onLogClick={() => { setSelectedLog(null); setSelected(row.entry); setExpandedLogEntry(id => id === row.entry.id ? null : row.entry.id); }}
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
      {data.logs.length > 0 && !interleavedLogs && (
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
                <div key={log.id} onClick={() => {
                    const isDeselecting = selectedLog?.id === log.id;
                    setSelected(null);
                    setSelectedLog(isDeselecting ? null : log);
                    if (!isDeselecting && data) {
                      // Find entry in-flight at log time, else nearest by start time
                      const inFlight = data.entries.filter(e => log.relMs >= e.relStartMs && log.relMs <= e.relStartMs + e.time);
                      const target = inFlight.length > 0
                        ? inFlight.reduce((a, b) => Math.abs(a.relStartMs - log.relMs) < Math.abs(b.relStartMs - log.relMs) ? a : b)
                        : data.entries.reduce((a, b) => Math.abs(a.relStartMs - log.relMs) < Math.abs(b.relStartMs - log.relMs) ? a : b);
                      scrollToEntry(target.id);
                    }
                  }}
                  className={`flex items-start gap-3 px-4 py-1.5 border-b border-slate-50 dark:border-slate-800/50 text-xs cursor-pointer transition-colors ${isSelectedLog ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-inset ring-blue-200 dark:ring-blue-800' : isCorrelatedLog ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-white/3'}`}>
                  <div className="w-1 shrink-0 self-stretch rounded-full mt-0.5" style={{ backgroundColor: logLevelDotColor(log.level) }} />
                  <span className="font-mono text-slate-400 shrink-0 text-[10px]">{formatMs(log.relMs)}</span>
                  <span className={`font-black uppercase text-[9px] shrink-0 w-10 ${levelColor(log.level)}`}>{log.level}</span>
                  <span className="text-slate-600 dark:text-slate-300 break-all flex-1">{log.message}</span>
                  {isSelectedLog && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[9px] font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded px-1" title="Waterfall scrolled to nearest request">
                      <TrendingUp size={9} /> ↑ waterfall
                    </span>
                  )}
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
