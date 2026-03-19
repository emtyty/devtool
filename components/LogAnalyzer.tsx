import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  FileText, Copy, Check, Search, BarChart3, ChevronDown, ChevronRight,
  Layers, Zap, X, Upload,
} from 'lucide-react';
import ResizableSplit from './ResizableSplit';

// ── Types ───────────────────────────────────────────────────────────────────

type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

interface ParsedEntry {
  lineIndex: number;
  timestamp: Date | null;
  level: LogLevel | null;
  message: string;
  raw: string;
  isMultiLine: boolean;
}

interface LevelConfig {
  label: string;
  bg: string;
  text: string;
  dot: string;
  bar: string;
}

const LEVEL_CONFIG: Record<LogLevel, LevelConfig> = {
  ERROR: { label: 'ERROR', bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-500', bar: 'bg-red-500' },
  WARN:  { label: 'WARN',  bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500', bar: 'bg-yellow-500' },
  INFO:  { label: 'INFO',  bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-500', bar: 'bg-blue-500' },
  DEBUG: { label: 'DEBUG', bg: 'bg-slate-500/20', text: 'text-slate-400', dot: 'bg-slate-500', bar: 'bg-slate-400' },
  TRACE: { label: 'TRACE', bg: 'bg-slate-600/20', text: 'text-slate-500', dot: 'bg-slate-600', bar: 'bg-slate-600' },
};

const ALL_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];

// ── Log Parsing ─────────────────────────────────────────────────────────────

function normalizeLevel(raw: string): LogLevel | null {
  const u = raw.toUpperCase().trim();
  if (u === 'ERROR' || u === 'ERR' || u === 'FATAL' || u === 'CRITICAL' || u === 'SEVERE') return 'ERROR';
  if (u === 'WARN' || u === 'WARNING') return 'WARN';
  if (u === 'INFO' || u === 'INFORMATION' || u === 'NOTICE') return 'INFO';
  if (u === 'DEBUG' || u === 'DBG' || u === 'FINE') return 'DEBUG';
  if (u === 'TRACE' || u === 'VERBOSE' || u === 'FINER' || u === 'FINEST') return 'TRACE';
  return null;
}

const RE_ISO = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+(\w+)\s+(.*)/s;
const RE_BRACKET = /^\[(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\s*(\w+)\s+(.*)/s;
const RE_BRACKET_LEVEL = /^\[(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\s*\[(\w+)\]\s+(.*)/s;
const RE_DATETIME = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(\w+)\s+(.*)/s;
const RE_SYSLOG = /^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(\S+?)(?:\[\d+\])?:\s+(.*)/s;
const RE_LEVEL_PREFIX = /^(\w+):\s+(.*)/s;
const RE_LEVEL_BRACKET = /^\[(\w+)\]\s+(.*)/s;
const RE_APACHE = /^(\S+)\s+\S+\s+\S+\s+\[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\]\s+"(\w+)\s+(\S+)\s+\S+"\s+(\d{3})\s+/;

function tryParseDate(s: string): Date | null {
  const syslogMatch = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})$/);
  if (syslogMatch) {
    const year = new Date().getFullYear();
    const d = new Date(`${syslogMatch[1]} ${syslogMatch[2]}, ${year} ${syslogMatch[3]}`);
    return isNaN(d.getTime()) ? null : d;
  }
  const apacheMatch = s.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})$/);
  if (apacheMatch) {
    const d = new Date(`${apacheMatch[2]} ${apacheMatch[1]}, ${apacheMatch[3]} ${apacheMatch[4]} ${apacheMatch[5]}`);
    return isNaN(d.getTime()) ? null : d;
  }
  const normalized = s.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2})/, '$1T$2');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function tryParseJson(line: string): ParsedEntry | null {
  if (!line.trimStart().startsWith('{')) return null;
  try {
    const obj = JSON.parse(line);
    const ts = obj.timestamp || obj.time || obj.ts || obj['@timestamp'] || obj.date || obj.datetime;
    const lvl = obj.level || obj.severity || obj.loglevel || obj.log_level || obj.lvl;
    const msg = obj.message || obj.msg || obj.text || obj.error || obj.description || '';
    return {
      lineIndex: 0,
      timestamp: ts ? tryParseDate(String(ts)) : null,
      level: lvl ? normalizeLevel(String(lvl)) : null,
      message: typeof msg === 'string' ? msg : JSON.stringify(msg),
      raw: line,
      isMultiLine: false,
    };
  } catch {
    return null;
  }
}

function parseLine(line: string): Omit<ParsedEntry, 'lineIndex' | 'isMultiLine'> | null {
  const jsonEntry = tryParseJson(line);
  if (jsonEntry) return jsonEntry;

  let m = line.match(RE_BRACKET_LEVEL);
  if (m) { const level = normalizeLevel(m[2]); if (level) return { timestamp: tryParseDate(m[1]), level, message: m[3], raw: line }; }

  m = line.match(RE_BRACKET);
  if (m) { const level = normalizeLevel(m[2]); if (level) return { timestamp: tryParseDate(m[1]), level, message: m[3], raw: line }; }

  m = line.match(RE_ISO);
  if (m) { const level = normalizeLevel(m[2]); if (level) return { timestamp: tryParseDate(m[1]), level, message: m[3], raw: line }; }

  m = line.match(RE_DATETIME);
  if (m) { const level = normalizeLevel(m[2]); if (level) return { timestamp: tryParseDate(m[1]), level, message: m[3], raw: line }; }

  m = line.match(RE_SYSLOG);
  if (m) return { timestamp: tryParseDate(m[1]), level: 'INFO', message: `${m[2]} ${m[3]}: ${m[4]}`, raw: line };

  m = line.match(RE_APACHE);
  if (m) {
    const status = parseInt(m[5], 10);
    const level: LogLevel = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
    return { timestamp: tryParseDate(m[2]), level, message: `${m[3]} ${m[4]} → ${m[5]}`, raw: line };
  }

  m = line.match(RE_LEVEL_PREFIX);
  if (m) { const level = normalizeLevel(m[1]); if (level) return { timestamp: null, level, message: m[2], raw: line }; }

  m = line.match(RE_LEVEL_BRACKET);
  if (m) { const level = normalizeLevel(m[1]); if (level) return { timestamp: null, level, message: m[2], raw: line }; }

  return null;
}

function parseLogInput(text: string): ParsedEntry[] {
  if (!text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const entries: ParsedEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const parsed = parseLine(line);
    if (parsed) {
      entries.push({ ...parsed, lineIndex: i, isMultiLine: false });
    } else if (entries.length > 0) {
      const prev = entries[entries.length - 1];
      prev.message += '\n' + line;
      prev.raw += '\n' + line;
      prev.isMultiLine = true;
    } else {
      entries.push({ lineIndex: i, timestamp: null, level: null, message: line, raw: line, isMultiLine: false });
    }
  }
  return entries;
}

// ── Debounce hook ───────────────────────────────────────────────────────────

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// ── Virtual scroll hook ─────────────────────────────────────────────────────

const ROW_HEIGHT = 32;
const OVERSCAN = 10;

function useVirtualScroll(containerRef: React.RefObject<HTMLDivElement | null>, itemCount: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  const totalHeight = itemCount * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(itemCount, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);

  return { totalHeight, startIndex, endIndex, offsetY: startIndex * ROW_HEIGHT };
}

// ── Example Data ────────────────────────────────────────────────────────────

const EXAMPLE_LOGS = `[2024-01-15 08:00:01.123] INFO Application starting up...
[2024-01-15 08:00:01.456] INFO Loading configuration from /etc/app/config.yml
[2024-01-15 08:00:01.789] DEBUG Configuration loaded: {env: production, workers: 8}
[2024-01-15 08:00:02.012] INFO Connecting to database on port 5432
[2024-01-15 08:00:02.345] DEBUG Connection pool initialized: min=5, max=20
[2024-01-15 08:00:02.567] INFO Database connection established successfully
[2024-01-15 08:00:03.001] INFO Starting HTTP server on port 8080
[2024-01-15 08:00:03.234] INFO Health check endpoint registered at /health
[2024-01-15 08:00:03.456] INFO Application ready, accepting requests
[2024-01-15 08:00:10.111] DEBUG Incoming request: GET /api/users
[2024-01-15 08:00:10.222] DEBUG Query executed in 12ms: SELECT * FROM users WHERE active = true
[2024-01-15 08:00:10.333] INFO Request completed: GET /api/users → 200 (125ms)
[2024-01-15 08:00:15.444] DEBUG Incoming request: POST /api/orders
[2024-01-15 08:00:15.555] WARN Slow query detected (1523ms): SELECT o.*, p.* FROM orders o JOIN products p ON o.product_id = p.id WHERE o.status = 'pending'
[2024-01-15 08:00:15.666] INFO Request completed: POST /api/orders → 201 (1680ms)
[2024-01-15 08:00:20.001] DEBUG Incoming request: GET /api/products/999
[2024-01-15 08:00:20.050] WARN Product not found: id=999, returning 404
[2024-01-15 08:00:20.060] INFO Request completed: GET /api/products/999 → 404 (59ms)
[2024-01-15 08:00:25.100] DEBUG Cache hit for key: product_catalog_v2
[2024-01-15 08:00:25.200] TRACE Cache stats: {hits: 1024, misses: 38, evictions: 5, ttl: "300s"}
[2024-01-15 08:00:30.300] DEBUG Incoming request: PUT /api/users/42
[2024-01-15 08:00:30.400] INFO User profile updated: id=42, fields=[displayName, theme]
[2024-01-15 08:00:30.500] DEBUG Audit log written: user=42, action=profile_update
[2024-01-15 08:00:35.100] ERROR Failed to process payment for order #1847
java.lang.NullPointerException: Cannot invoke method on null reference
    at com.app.payment.PaymentService.processPayment(PaymentService.java:142)
    at com.app.payment.PaymentController.handlePayment(PaymentController.java:67)
    at com.app.core.RequestDispatcher.dispatch(RequestDispatcher.java:203)
    at com.app.core.HttpHandler.handle(HttpHandler.java:89)
Caused by: java.sql.SQLException: Connection refused — payment service unavailable
    at com.app.db.ConnectionPool.getConnection(ConnectionPool.java:55)
    at com.app.payment.PaymentService.initTransaction(PaymentService.java:98)
    ... 4 more
[2024-01-15 08:00:35.200] ERROR Payment gateway unreachable — triggering circuit breaker
[2024-01-15 08:00:35.300] WARN Circuit breaker OPEN for payment-gateway (threshold: 5 failures in 60s)
[2024-01-15 08:00:40.100] DEBUG Incoming request: GET /api/orders?status=pending
[2024-01-15 08:00:40.200] DEBUG Query executed in 8ms: SELECT * FROM orders WHERE status = 'pending' LIMIT 50
[2024-01-15 08:00:40.300] INFO Request completed: GET /api/orders → 200 (200ms)
[2024-01-15 08:00:45.100] INFO Scheduled task: cleanup_expired_sessions started
[2024-01-15 08:00:45.200] DEBUG Removed 147 expired sessions from store
[2024-01-15 08:00:45.300] INFO Scheduled task: cleanup_expired_sessions completed (200ms)
[2024-01-15 08:00:50.100] TRACE Heartbeat sent to monitoring service
[2024-01-15 08:00:50.200] DEBUG Memory usage: heap=412MB/1024MB, gc_pauses=3 (avg 12ms)
[2024-01-15 08:00:55.100] WARN High memory usage detected: 78% of allocated heap
[2024-01-15 08:00:55.200] INFO Triggering garbage collection
[2024-01-15 08:00:55.300] DEBUG GC completed: freed 180MB in 45ms
[2024-01-15 08:01:00.100] DEBUG Incoming request: DELETE /api/users/99
[2024-01-15 08:01:00.200] WARN Unauthorized deletion attempt: user=99, insufficient permissions
[2024-01-15 08:01:00.300] INFO Request completed: DELETE /api/users/99 → 403 (200ms)
[2024-01-15 08:01:05.100] ERROR Unhandled exception in worker thread #3
java.lang.OutOfMemoryError: GC overhead limit exceeded
    at java.util.Arrays.copyOf(Arrays.java:3236)
    at java.util.ArrayList.grow(ArrayList.java:265)
    at com.app.cache.LRUCache.put(LRUCache.java:112)
    at com.app.core.WorkerThread.run(WorkerThread.java:44)
[2024-01-15 08:01:05.200] ERROR Worker thread #3 terminated unexpectedly — restarting
[2024-01-15 08:01:05.300] INFO Worker thread #3 restarted successfully
[2024-01-15 08:01:10.100] TRACE Connection pool stats: active=12, idle=8, waiting=0
{"timestamp":"2024-01-15T08:01:15.000Z","level":"info","message":"Metrics exported to Prometheus endpoint","service":"app-server","labels":{"instance":"prod-01","region":"us-east-1"}}
[2024-01-15 08:01:20.100] INFO Graceful shutdown initiated (SIGTERM received)
[2024-01-15 08:01:20.200] INFO Draining active connections (12 remaining)
[2024-01-15 08:01:20.500] DEBUG All connections drained
[2024-01-15 08:01:20.600] INFO Database connection pool closed
[2024-01-15 08:01:20.700] INFO Application shut down cleanly`;

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function LogAnalyzer() {
  const [rawInput, setRawInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // For large files, don't bind textarea to input — show readonly summary instead
  const isLargeInput = rawInput.length > 500_000; // ~500KB

  // Debounce search for performance
  const debouncedSearch = useDebounced(searchText, 200);

  // Parse entries — use deferred parsing for large inputs
  const [entries, setEntries] = useState<ParsedEntry[]>([]);

  useEffect(() => {
    if (!rawInput.trim()) {
      setEntries([]);
      setLineCount(0);
      return;
    }

    setIsParsing(true);
    // Use setTimeout to unblock UI for large inputs
    const timer = setTimeout(() => {
      const parsed = parseLogInput(rawInput);
      setEntries(parsed);
      setLineCount(rawInput.split(/\r?\n/).length);
      setIsParsing(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [rawInput]);

  // Search regex (debounced)
  const searchRegex = useMemo(() => {
    if (!debouncedSearch.trim()) return null;
    try {
      return new RegExp(debouncedSearch, 'gi');
    } catch {
      return new RegExp(debouncedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    }
  }, [debouncedSearch]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (enabledLevels.size < ALL_LEVELS.length) {
      result = result.filter(e => e.level === null || enabledLevels.has(e.level));
    }
    if (searchRegex) {
      result = result.filter(e => {
        searchRegex.lastIndex = 0;
        return searchRegex.test(e.raw);
      });
    }
    return result;
  }, [entries, enabledLevels, searchRegex]);

  // Stats
  const stats = useMemo(() => {
    const counts: Record<LogLevel, number> = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 };
    let minTime: Date | null = null;
    let maxTime: Date | null = null;
    for (const e of entries) {
      if (e.level) counts[e.level]++;
      if (e.timestamp) {
        if (!minTime || e.timestamp < minTime) minTime = e.timestamp;
        if (!maxTime || e.timestamp > maxTime) maxTime = e.timestamp;
      }
    }
    return { total: entries.length, counts, minTime, maxTime };
  }, [entries]);

  // Timeline buckets
  const timelineBuckets = useMemo(() => {
    if (!stats.minTime || !stats.maxTime) return [];
    const minMs = stats.minTime.getTime();
    const maxMs = stats.maxTime.getTime();
    const range = maxMs - minMs;
    if (range <= 0) return [];
    const bucketCount = Math.min(30, Math.max(5, Math.ceil(range / 1000)));
    const bucketSize = range / bucketCount;
    const buckets: { start: number; counts: Record<LogLevel, number>; total: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({ start: minMs + i * bucketSize, counts: { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 }, total: 0 });
    }
    for (const e of entries) {
      if (!e.timestamp) continue;
      const idx = Math.min(bucketCount - 1, Math.floor((e.timestamp.getTime() - minMs) / bucketSize));
      if (e.level) buckets[idx].counts[e.level]++;
      buckets[idx].total++;
    }
    return buckets;
  }, [entries, stats.minTime, stats.maxTime]);

  const maxBucketTotal = useMemo(() => Math.max(1, ...timelineBuckets.map(b => b.total)), [timelineBuckets]);

  // Virtual scroll
  const { totalHeight, startIndex, endIndex, offsetY } = useVirtualScroll(scrollContainerRef, filteredEntries.length);

  // ── Handlers ────────────────────────────────────────────────────────────

  const toggleLevel = useCallback((level: LogLevel) => {
    setEnabledLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((lineIndex: number) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(lineIndex)) next.delete(lineIndex); else next.add(lineIndex);
      return next;
    });
  }, []);

  const handleCopy = useCallback(() => {
    const text = filteredEntries.map(e => e.raw).join('\n');
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [filteredEntries]);

  const loadText = useCallback((text: string, name?: string) => {
    setRawInput(text);
    setExpandedEntries(new Set());
    setFileName(name || null);
  }, []);

  const loadExample = useCallback(() => loadText(EXAMPLE_LOGS), [loadText]);

  const clearInput = useCallback(() => {
    setRawInput('');
    setSearchText('');
    setExpandedEntries(new Set());
    setEnabledLevels(new Set(ALL_LEVELS));
    setFileName(null);
  }, []);

  // ── File import ───────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        loadText(text, file.name);
      }
    };
    reader.readAsText(file);
  }, [loadText]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Highlight search matches
  const highlightText = useCallback((text: string, regex: RegExp | null): React.ReactNode => {
    if (!regex) return text;
    regex.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    // Limit highlights per entry for performance
    let matchCount = 0;
    while ((match = regex.exec(text)) !== null && matchCount < 20) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      parts.push(<mark key={key++} className="bg-yellow-400/40 text-yellow-200 rounded px-0.5">{match[0]}</mark>);
      lastIndex = regex.lastIndex;
      if (match[0].length === 0) regex.lastIndex++;
      matchCount++;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts.length > 0 ? parts : text;
  }, []);

  const formatTime = useCallback((d: Date | null) => {
    if (!d) return '';
    return d.toISOString().replace('T', ' ').replace('Z', '');
  }, []);

  // ── Left Panel ──────────────────────────────────────────────────────────

  const leftPanel = (
    <div className="flex flex-col gap-4 h-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".log,.txt,.json,.csv,.out,.err,*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      {/* Input area */}
      <section
        className={`bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col min-h-[300px] flex-1 transition-colors ${
          isDragging ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-400/30' : 'border-slate-200'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <FileText size={14} className="text-slate-400" /> Log Input
            {fileName && (
              <span className="text-blue-500 normal-case tracking-normal font-bold ml-1">
                — {fileName}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {isParsing && (
              <span className="text-[10px] font-black text-amber-600 px-2 py-0.5 rounded bg-amber-50 border border-amber-200">
                PARSING...
              </span>
            )}
            {entries.length > 0 && !isParsing && (
              <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded shadow-sm">
                {entries.length.toLocaleString()} ENTRIES
                {lineCount > 0 && ` / ${lineCount.toLocaleString()} LINES`}
              </span>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] font-black text-slate-500 uppercase px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
              title="Import log file (.log, .txt, .json)"
            >
              <Upload size={11} className="inline mr-1 -mt-0.5" />
              Import File
            </button>
            <button
              onClick={loadExample}
              className="text-[10px] font-black text-slate-500 uppercase px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              <Zap size={11} className="inline mr-1 -mt-0.5" />
              Example
            </button>
            {rawInput && (
              <button
                onClick={clearInput}
                className="text-[10px] font-black text-slate-400 uppercase px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                <X size={11} className="inline -mt-0.5" />
              </button>
            )}
          </div>
        </div>

        {isDragging ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Upload size={32} className="mx-auto text-blue-400 mb-2" />
              <p className="text-sm font-bold text-blue-500">Drop log file here</p>
              <p className="text-[10px] text-slate-400 mt-1">.log, .txt, .json, or any text file</p>
            </div>
          </div>
        ) : isLargeInput ? (
          /* For large files, show a read-only summary instead of binding to textarea */
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
              <FileText size={24} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">
                {fileName || 'Large log loaded'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {formatFileSize(rawInput.length)} — {lineCount.toLocaleString()} lines — {entries.length.toLocaleString()} parsed entries
              </p>
            </div>
            <button
              onClick={clearInput}
              className="text-[10px] font-black text-slate-500 uppercase px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Clear & paste new logs
            </button>
          </div>
        ) : (
          <textarea
            className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
            value={rawInput}
            onChange={e => { setRawInput(e.target.value); setFileName(null); }}
            placeholder={"Paste your log output here or drag & drop a log file...\n\nSupports:\n  [2024-01-15 10:30:00] ERROR message\n  2024-01-15T10:30:00.000Z INFO message\n  Jan 15 10:30:00 hostname process: message\n  {\"timestamp\":\"...\",\"level\":\"error\",\"message\":\"...\"}\n  ERROR: simple prefix messages"}
            spellCheck={false}
          />
        )}
      </section>

      {/* Filters */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
        <div className="mb-3">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">
            Filter by Level
          </span>
          <div className="flex flex-wrap gap-2">
            {ALL_LEVELS.map(level => {
              const config = LEVEL_CONFIG[level];
              const count = stats.counts[level];
              const active = enabledLevels.has(level);
              return (
                <button
                  key={level}
                  onClick={() => toggleLevel(level)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border ${
                    active ? `${config.bg} ${config.text} border-current` : 'bg-slate-50 text-slate-300 border-slate-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${active ? config.dot : 'bg-slate-300'}`} />
                  {level}
                  {count > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] ${active ? 'bg-white/20' : 'bg-slate-100'}`}>
                      {count.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">
            Search (supports regex)
          </span>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Filter logs by text or /regex/..."
              className="w-full pl-9 pr-3 py-2 text-sm font-mono rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white text-slate-700 placeholder:text-slate-300"
            />
            {searchText && (
              <button onClick={() => setSearchText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );

  // ── Right Panel ─────────────────────────────────────────────────────────

  const visibleEntries = filteredEntries.slice(startIndex, endIndex);

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-sm border border-slate-700 overflow-hidden flex flex-col min-h-[400px] h-full">
      <div className="px-6 py-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Layers size={14} className="text-slate-500" /> Analysis
        </span>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
            copied ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {entries.length === 0 && !isParsing ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            Paste logs or import a file to analyze...
          </div>
        ) : isParsing ? (
          <div className="flex items-center justify-center h-full gap-3">
            <div className="w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            <span className="text-slate-400 text-sm font-bold">Parsing log entries...</span>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Stats summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Entries</div>
                <div className="text-2xl font-black text-white">{stats.total.toLocaleString()}</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Filtered</div>
                <div className="text-2xl font-black text-white">{filteredEntries.length.toLocaleString()}</div>
              </div>
              <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 col-span-2 md:col-span-1">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Time Range</div>
                <div className="text-xs font-mono text-slate-300 leading-relaxed">
                  {stats.minTime ? (
                    <>{formatTime(stats.minTime)}<br />{formatTime(stats.maxTime)}</>
                  ) : (
                    <span className="text-slate-500">No timestamps</span>
                  )}
                </div>
              </div>
            </div>

            {/* Level breakdown */}
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Level Breakdown</div>
              <div className="space-y-1.5">
                {ALL_LEVELS.map(level => {
                  const count = stats.counts[level];
                  if (count === 0) return null;
                  const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0';
                  const config = LEVEL_CONFIG[level];
                  return (
                    <div key={level} className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase w-12 ${config.text}`}>{level}</span>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${config.bar} transition-all duration-300`} style={{ width: `${(count / stats.total) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 w-24 text-right">
                        {count.toLocaleString()} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Timeline */}
            {timelineBuckets.length > 0 && (
              <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <BarChart3 size={12} /> Timeline
                </div>
                <div className="flex items-end gap-px h-16">
                  {timelineBuckets.map((bucket, i) => {
                    const heightPct = (bucket.total / maxBucketTotal) * 100;
                    const levelOrder: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
                    return (
                      <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${new Date(bucket.start).toLocaleTimeString()}: ${bucket.total} entries`}>
                        <div className="w-full rounded-t-sm overflow-hidden flex flex-col justify-end" style={{ height: `${heightPct}%` }}>
                          {levelOrder.map(level => {
                            const cnt = bucket.counts[level];
                            if (cnt === 0 || bucket.total === 0) return null;
                            const config = LEVEL_CONFIG[level];
                            return <div key={level} className={`w-full ${config.bar}`} style={{ height: `${(cnt / bucket.total) * 100}%`, minHeight: cnt > 0 ? '1px' : 0 }} />;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] font-mono text-slate-600">{stats.minTime?.toLocaleTimeString()}</span>
                  <span className="text-[9px] font-mono text-slate-600">{stats.maxTime?.toLocaleTimeString()}</span>
                </div>
              </div>
            )}

            {/* Virtualized log entries */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Log Entries ({filteredEntries.length.toLocaleString()})
                </span>
              </div>
              <div
                ref={scrollContainerRef}
                className="overflow-auto"
                style={{ maxHeight: '600px' }}
              >
                {filteredEntries.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">
                    No entries match the current filters.
                  </div>
                ) : (
                  <div style={{ height: totalHeight, position: 'relative' }}>
                    <div style={{ transform: `translateY(${offsetY}px)` }}>
                      {visibleEntries.map((entry, idx) => {
                        const config = entry.level ? LEVEL_CONFIG[entry.level] : null;
                        const isExpanded = expandedEntries.has(entry.lineIndex);
                        const firstLine = entry.message.split('\n')[0];
                        const hasMultipleLines = entry.message.includes('\n');

                        return (
                          <div
                            key={entry.lineIndex}
                            className="px-3 hover:bg-slate-700/30 transition-colors"
                            style={!isExpanded ? { height: ROW_HEIGHT, overflow: 'hidden' } : undefined}
                          >
                            <div
                              className={`flex items-start gap-2 ${hasMultipleLines ? 'cursor-pointer' : ''}`}
                              style={{ height: ROW_HEIGHT, alignItems: 'center' }}
                              onClick={hasMultipleLines ? () => toggleExpanded(entry.lineIndex) : undefined}
                            >
                              <div className="w-4 shrink-0">
                                {hasMultipleLines && (
                                  isExpanded
                                    ? <ChevronDown size={12} className="text-slate-500" />
                                    : <ChevronRight size={12} className="text-slate-500" />
                                )}
                              </div>
                              <div className="w-14 shrink-0">
                                {config ? (
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${config.bg} ${config.text}`}>{entry.level}</span>
                                ) : (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-700 text-slate-500">???</span>
                                )}
                              </div>
                              {entry.timestamp && (
                                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                                  {entry.timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)}
                                </span>
                              )}
                              <span className="text-xs font-mono text-slate-300 truncate leading-relaxed">
                                {highlightText(firstLine, searchRegex)}
                                {hasMultipleLines && !isExpanded && (
                                  <span className="text-slate-600 ml-1">(+{entry.message.split('\n').length - 1} lines)</span>
                                )}
                              </span>
                            </div>
                            {hasMultipleLines && isExpanded && (
                              <pre className="ml-20 mb-2 text-[11px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed bg-slate-900/50 rounded p-2 border border-slate-700/50 max-h-80 overflow-auto">
                                {highlightText(entry.message.split('\n').slice(1).join('\n'), searchRegex)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <ResizableSplit
      left={leftPanel}
      right={rightPanel}
      storageKey="split:logs"
      defaultLeftPercent={40}
    />
  );
}
