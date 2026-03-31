export type Severity = 'info' | 'warning' | 'error' | 'critical';
export type RuleTarget = 'network' | 'console' | 'both';
export type Operator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith' | 'endsWith' | 'regex';

export interface RuleCondition {
  field: string;
  operator: Operator;
  value: string | number;
}

export interface RuleAction {
  tag: string;
  color: string;
  severity: Severity;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  target: RuleTarget;
  condition: RuleCondition;
  action: RuleAction;
}

export interface HarTimings {
  blocked: number;
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
}

export interface HarEntry {
  id: string;
  startedDateTime: string;
  absStartMs: number;
  relStartMs: number;
  time: number;
  method: string;
  url: string;
  pathname: string;
  host: string;
  status: number;
  statusText: string;
  mimeType: string;
  responseSize: number;
  timings: HarTimings;
  tags: Array<{ tag: string; color: string; severity: Severity }>;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

export interface LogEntry {
  id: string;
  raw: string;
  absMs: number;
  relMs: number;
  level: 'error' | 'warn' | 'info' | 'debug' | 'log' | 'unknown';
  message: string;
  tags: Array<{ tag: string; color: string; severity: Severity }>;
}

export interface ParseResult {
  entries: HarEntry[];
  logs: LogEntry[];
  t0: number;
  duration: number;
}

export interface Issue {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
  entries: HarEntry[];
  meta?: Record<string, unknown>;
}

export const DEFAULT_RULES: Rule[] = [
  {
    id: 'R_001', name: 'Slow Request (>3s)', enabled: true, target: 'network',
    condition: { field: 'time', operator: '>', value: 3000 },
    action: { tag: 'Slow', color: '#f59e0b', severity: 'warning' },
  },
  {
    id: 'R_002', name: 'Very Slow Request (>10s)', enabled: true, target: 'network',
    condition: { field: 'time', operator: '>', value: 10000 },
    action: { tag: 'Very Slow', color: '#ef4444', severity: 'critical' },
  },
  {
    id: 'R_003', name: 'Not Found (404)', enabled: true, target: 'network',
    condition: { field: 'status', operator: '==', value: 404 },
    action: { tag: '404', color: '#f97316', severity: 'error' },
  },
  {
    id: 'R_004', name: 'Server Error (5xx)', enabled: true, target: 'network',
    condition: { field: 'status', operator: '>=', value: 500 },
    action: { tag: '5xx', color: '#ef4444', severity: 'critical' },
  },
  {
    id: 'R_005', name: 'Large Response (>5MB)', enabled: true, target: 'network',
    condition: { field: 'responseSize', operator: '>', value: 5_000_000 },
    action: { tag: 'Large', color: '#8b5cf6', severity: 'warning' },
  },
  {
    id: 'R_006', name: 'Console Error', enabled: true, target: 'console',
    condition: { field: 'level', operator: '==', value: 'error' },
    action: { tag: 'Error', color: '#ef4444', severity: 'error' },
  },
  {
    id: 'R_007', name: 'Console Warning', enabled: true, target: 'console',
    condition: { field: 'level', operator: '==', value: 'warn' },
    action: { tag: 'Warn', color: '#f59e0b', severity: 'warning' },
  },
  {
    id: 'R_008', name: 'CORS Error', enabled: true, target: 'console',
    condition: { field: 'message', operator: 'regex', value: 'access-control|cors|cross.origin' },
    action: { tag: 'CORS', color: '#ef4444', severity: 'critical' },
  },
];

function evaluateCondition(itemValue: unknown, operator: Operator, targetValue: string | number): boolean {
  try {
    switch (operator) {
      case '==': return itemValue == targetValue;
      case '!=': return itemValue != targetValue;
      case '>': return Number(itemValue) > Number(targetValue);
      case '<': return Number(itemValue) < Number(targetValue);
      case '>=': return Number(itemValue) >= Number(targetValue);
      case '<=': return Number(itemValue) <= Number(targetValue);
      case 'contains': return String(itemValue).toLowerCase().includes(String(targetValue).toLowerCase());
      case 'startsWith': return String(itemValue).toLowerCase().startsWith(String(targetValue).toLowerCase());
      case 'endsWith': return String(itemValue).toLowerCase().endsWith(String(targetValue).toLowerCase());
      case 'regex': return new RegExp(String(targetValue), 'i').test(String(itemValue));
      default: return false;
    }
  } catch { return false; }
}

function applyRules<T extends Record<string, unknown>>(
  item: T,
  rules: Rule[],
  target: 'network' | 'console',
): Array<{ tag: string; color: string; severity: Severity }> {
  return rules
    .filter(r => r.enabled && (r.target === target || r.target === 'both'))
    .filter(r => evaluateCondition(item[r.condition.field], r.condition.operator, r.condition.value))
    .map(r => ({ tag: r.action.tag, color: r.action.color, severity: r.action.severity }));
}

function headersToRecord(headers: Array<{ name: string; value: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of (headers ?? [])) result[h.name] = h.value;
  return result;
}

function getHeader(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseHar(text: string, rules: Rule[]): { entries: HarEntry[]; t0: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = JSON.parse(text);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEntries: any[] = json?.log?.entries ?? [];
  if (rawEntries.length === 0) throw new Error('No entries found in HAR file');

  rawEntries.sort((a, b) => new Date(a.startedDateTime).getTime() - new Date(b.startedDateTime).getTime());
  const t0 = new Date(rawEntries[0].startedDateTime).getTime();

  const entries: HarEntry[] = rawEntries.map((e, idx) => {
    const absStartMs = new Date(e.startedDateTime).getTime();
    const t = e.timings ?? {};
    const timings: HarTimings = {
      blocked: Math.max(0, t.blocked ?? 0),
      dns:     Math.max(0, t.dns     ?? 0),
      connect: Math.max(0, t.connect ?? 0),
      ssl:     Math.max(0, t.ssl     ?? 0),
      send:    Math.max(0, t.send    ?? 0),
      wait:    Math.max(0, t.wait    ?? 0),
      receive: Math.max(0, t.receive ?? 0),
    };

    const url = e.request?.url ?? '';
    let pathname = url, host = '';
    try { const u = new URL(url); pathname = u.pathname + u.search; host = u.host; } catch {}

    const responseSize = Math.max(0, e.response?.content?.size ?? e.response?.bodySize ?? 0);
    const mimeType: string = e.response?.content?.mimeType ?? '';

    const entry: HarEntry = {
      id: `entry-${idx}`,
      startedDateTime: e.startedDateTime,
      absStartMs,
      relStartMs: absStartMs - t0,
      time: e.time ?? 0,
      method: (e.request?.method ?? 'GET').toUpperCase(),
      url,
      pathname,
      host,
      status: e.response?.status ?? 0,
      statusText: e.response?.statusText ?? '',
      mimeType,
      responseSize,
      timings,
      tags: [],
      requestHeaders:  e.request?.headers  ? headersToRecord(e.request.headers)  : undefined,
      responseHeaders: e.response?.headers ? headersToRecord(e.response.headers) : undefined,
    };

    entry.tags = applyRules(
      { time: entry.time, status: entry.status, url: entry.url, mimeType, responseSize } as Record<string, unknown>,
      rules,
      'network',
    );

    // ── Per-entry hardcoded detections ────────────────────────────────

    // #3 Uncompressed Bloat — response > 1MB without Content-Encoding
    if (responseSize > 1_000_000 && !getHeader(entry.responseHeaders, 'content-encoding')) {
      entry.tags.push({ tag: 'Bloat', color: '#7c3aed', severity: 'warning' });
    }

    // #8 Cache Miss Trend — static asset with no-cache / no-store header
    if (/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ico|webp)(\?|$)/i.test(url)) {
      const cc = getHeader(entry.responseHeaders, 'cache-control');
      if (/no-cache|no-store/.test(cc)) {
        entry.tags.push({ tag: 'No Cache', color: '#0891b2', severity: 'warning' });
      }
    }

    // #9 Header Leakage — sensitive headers sent over plain HTTP
    if (url.startsWith('http://')) {
      const SENSITIVE = /^(authorization|x-api-key|api-key|token|x-auth-token|x-access-token|set-cookie)$/i;
      const allHeaders = { ...entry.requestHeaders, ...entry.responseHeaders };
      if (Object.keys(allHeaders).some(k => SENSITIVE.test(k))) {
        entry.tags.push({ tag: 'Header Leak', color: '#dc2626', severity: 'critical' });
      }
    }

    // #10 Large Payload DOM — HTML response > 500KB
    if (mimeType.includes('text/html') && responseSize > 500_000) {
      entry.tags.push({ tag: 'Heavy HTML', color: '#be185d', severity: 'warning' });
    }

    return entry;
  });

  return { entries, t0 };
}

const TIMESTAMP_PATTERNS: Array<{ re: RegExp; parse: (m: RegExpExecArray) => number | null }> = [
  // ISO 8601 with timezone: 2024-01-15T10:00:00.123Z / +07:00
  {
    re: /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/,
    parse: m => { const d = new Date(m[1]); return isNaN(d.getTime()) ? null : d.getTime(); },
  },
  // Date + time without timezone: 2024-01-15 10:00:00.123
  {
    re: /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)/,
    parse: m => { const d = new Date(m[1]); return isNaN(d.getTime()) ? null : d.getTime(); },
  },
  // Unix ms timestamp (13 digits)
  {
    re: /\b(1[6-9]\d{11})\b/,
    parse: m => parseInt(m[1]),
  },
];

// Time-only pattern: [10:00:00.050] or 10:00:00.050 — resolved against t0's date
const TIME_ONLY_RE = /[\[{(]?(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?[\]})]?/;

function parseTimeOnly(line: string, t0: number): number | null {
  const m = TIME_ONLY_RE.exec(line);
  if (!m) return null;
  const base = new Date(t0);
  const ms = m[4] ? parseInt(m[4].padEnd(3, '0').slice(0, 3)) : 0;
  const candidate = new Date(
    base.getFullYear(), base.getMonth(), base.getDate(),
    parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), ms,
  ).getTime();
  // If parsed time is before t0 by more than 1 hour, assume next day
  return candidate < t0 - 3_600_000 ? candidate + 86_400_000 : candidate;
}

const LEVEL_RE: Array<{ re: RegExp; level: LogEntry['level'] }> = [
  { re: /\b(error|err|fatal|critical|exception)\b/i, level: 'error' },
  { re: /\b(warn(?:ing)?)\b/i,                        level: 'warn'  },
  { re: /\b(info(?:rmation)?)\b/i,                    level: 'info'  },
  { re: /\b(debug|verbose|trace)\b/i,                 level: 'debug' },
  { re: /\b(log)\b/i,                                 level: 'log'   },
];

function detectLevel(line: string): LogEntry['level'] {
  for (const { re, level } of LEVEL_RE) if (re.test(line)) return level;
  return 'unknown';
}

export function parseLogs(text: string, tzOffsetMs: number, t0: number, rules: Rule[]): LogEntry[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const entries: LogEntry[] = [];

  lines.forEach((line, idx) => {
    let absMs: number | null = null;
    for (const p of TIMESTAMP_PATTERNS) {
      const m = p.re.exec(line);
      if (m) { absMs = p.parse(m); if (absMs !== null) break; }
    }
    // Fallback: time-only format like [10:00:00.050]
    if (absMs === null) absMs = parseTimeOnly(line, t0);
    if (absMs === null) return;
    absMs += tzOffsetMs;

    const level = detectLevel(line);
    const entry: LogEntry = {
      id: `log-${idx}`,
      raw: line,
      absMs,
      relMs: absMs - t0,
      level,
      message: line,
      tags: [],
    };
    entry.tags = applyRules(
      { level: entry.level, message: entry.message } as Record<string, unknown>,
      rules,
      'console',
    );
    entries.push(entry);
  });

  return entries.sort((a, b) => a.absMs - b.absMs);
}

// ── New exports ────────────────────────────────────────────────────

// 1. Summary stats
export interface HarSummary {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  totalSize: number;
  totalDuration: number;
  avgTime: number;
  p50: number;
  p95: number;
  p99: number;
  avgTtfb: number;
  slowestEntry: HarEntry | null;
  largestEntry: HarEntry | null;
  domainStats: Map<string, { count: number; totalTime: number; errors: number; totalSize: number }>;
}

export function computeSummary(entries: HarEntry[]): HarSummary {
  if (entries.length === 0) {
    return {
      totalRequests: 0, totalErrors: 0, errorRate: 0,
      totalSize: 0, totalDuration: 0, avgTime: 0,
      p50: 0, p95: 0, p99: 0, avgTtfb: 0,
      slowestEntry: null, largestEntry: null,
      domainStats: new Map(),
    };
  }

  const sorted = [...entries].sort((a, b) => a.time - b.time);
  const p = (pct: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * pct / 100))].time;

  const totalErrors = entries.filter(e => e.status >= 400).length;
  const totalSize   = entries.reduce((s, e) => s + e.responseSize, 0);
  const avgTime     = entries.reduce((s, e) => s + e.time, 0) / entries.length;
  const avgTtfb     = entries.reduce((s, e) => s + e.timings.wait, 0) / entries.length;
  const lastEntry   = entries.reduce((a, b) => (a.relStartMs + a.time > b.relStartMs + b.time ? a : b));

  const slowestEntry = entries.reduce((a, b) => (a.time > b.time ? a : b));
  const largestEntry = entries.reduce((a, b) => (a.responseSize > b.responseSize ? a : b));

  const domainStats = new Map<string, { count: number; totalTime: number; errors: number; totalSize: number }>();
  for (const e of entries) {
    const key = e.host || '(unknown)';
    const cur = domainStats.get(key) ?? { count: 0, totalTime: 0, errors: 0, totalSize: 0 };
    cur.count++;
    cur.totalTime += e.time;
    cur.totalSize += e.responseSize;
    if (e.status >= 400) cur.errors++;
    domainStats.set(key, cur);
  }

  return {
    totalRequests: entries.length,
    totalErrors,
    errorRate: (totalErrors / entries.length) * 100,
    totalSize,
    totalDuration: lastEntry.relStartMs + lastEntry.time,
    avgTime,
    p50: p(50),
    p95: p(95),
    p99: p(99),
    avgTtfb,
    slowestEntry,
    largestEntry,
    domainStats,
  };
}

// 2. URL pattern normalization
export function normalizeUrlPattern(pathname: string): string {
  // Strip query string for pattern matching
  const path = pathname.split('?')[0];
  return path
    // UUID: 8-4-4-4-12 hex
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
    // Long hex hash (>= 12 hex chars not preceded by -)
    .replace(/\b[0-9a-f]{12,}\b/gi, ':hash')
    // Pure numeric segment
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    // Numeric at start of path segment boundary (e.g. /prefix123)
    .replace(/\b\d{2,}\b/g, ':id');
}

// 3. Duplicate / N+1 detection
export interface DuplicateGroup {
  pattern: string;
  method: string;
  count: number;
  entries: HarEntry[];
  totalTime: number;
  avgTime: number;
}

export function detectDuplicates(entries: HarEntry[], threshold = 3): DuplicateGroup[] {
  const map = new Map<string, HarEntry[]>();
  for (const e of entries) {
    const key = `${e.method}::${normalizeUrlPattern(e.pathname)}`;
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, group] of map) {
    if (group.length < threshold) continue;
    const [method, pattern] = key.split('::');
    const totalTime = group.reduce((s, e) => s + e.time, 0);
    groups.push({ pattern, method, count: group.length, entries: group, totalTime, avgTime: totalTime / group.length });
  }
  return groups.sort((a, b) => b.count - a.count);
}

// 4. Cache info
export interface CacheInfo {
  status: 'hit' | 'miss' | 'bypass' | 'expired' | 'unknown' | 'no-cache';
  directive: string;
  hasEtag: boolean;
  hasLastModified: boolean;
  ttl: number | null;
}

export function getCacheInfo(headers?: Record<string, string>): CacheInfo {
  if (!headers) {
    return { status: 'unknown', directive: '', hasEtag: false, hasLastModified: false, ttl: null };
  }

  const h = (name: string) => {
    const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : '';
  };

  const cc         = h('cache-control');
  const xCache     = h('x-cache');
  const cfCache    = h('cf-cache-status');
  const age        = h('age');
  const hasEtag    = !!h('etag');
  const hasLastMod = !!h('last-modified');

  let ttl: number | null = null;
  const maxAgeMatch = cc.match(/max-age=(\d+)/i);
  if (maxAgeMatch) ttl = parseInt(maxAgeMatch[1]);

  let status: CacheInfo['status'] = 'unknown';

  if (/no-store|no-cache/.test(cc)) {
    status = 'no-cache';
  } else if (cfCache) {
    const cf = cfCache.toUpperCase();
    if (cf === 'HIT') status = 'hit';
    else if (cf === 'MISS') status = 'miss';
    else if (cf === 'BYPASS') status = 'bypass';
    else if (cf === 'EXPIRED' || cf === 'REVALIDATED') status = 'expired';
  } else if (xCache) {
    const xc = xCache.toUpperCase();
    if (xc.includes('HIT')) status = 'hit';
    else if (xc.includes('MISS')) status = 'miss';
  } else if (age && parseInt(age) > 0) {
    status = 'hit';
  } else if (cc.includes('max-age') || hasEtag || hasLastMod) {
    status = 'miss';
  }

  return { status, directive: cc, hasEtag, hasLastModified: hasLastMod, ttl };
}

// 5. Compression info
export interface CompressionInfo {
  isCompressed: boolean;
  encoding: string;
  contentType: string;
  shouldBeCompressed: boolean;
}

const COMPRESSIBLE_TYPES = [
  'application/json', 'application/javascript', 'application/xml',
  'text/', 'application/x-www-form-urlencoded',
];

export function getCompressionInfo(responseHeaders?: Record<string, string>, mimeType?: string): CompressionInfo {
  const h = (name: string) => {
    if (!responseHeaders) return '';
    const key = Object.keys(responseHeaders).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? responseHeaders[key] : '';
  };

  const encoding    = h('content-encoding').toLowerCase();
  const contentType = mimeType || h('content-type') || '';
  const isCompressed = /gzip|br|deflate|zstd/.test(encoding);
  const shouldBeCompressed = !isCompressed && COMPRESSIBLE_TYPES.some(t => contentType.toLowerCase().includes(t));

  let enc = '';
  if (encoding.includes('br'))      enc = 'br';
  else if (encoding.includes('gzip'))    enc = 'gzip';
  else if (encoding.includes('deflate')) enc = 'deflate';
  else if (encoding.includes('zstd'))    enc = 'zstd';

  return { isCompressed, encoding: enc, contentType, shouldBeCompressed };
}

// 6. Performance insight
export interface PerfInsight {
  bottleneck: 'backend' | 'network' | 'dns' | 'ssl' | 'download' | 'ok';
  label: string;
  description: string;
  color: string;
}

export function getPerfInsight(entry: HarEntry): PerfInsight {
  const t = entry.timings;
  const total = entry.time || 1;

  if (t.dns > 200) {
    return { bottleneck: 'dns', label: 'DNS Slow', description: `DNS lookup took ${Math.round(t.dns)}ms`, color: '#a78bfa' };
  }
  if (t.ssl > 500) {
    return { bottleneck: 'ssl', label: 'SSL Slow', description: `TLS handshake took ${Math.round(t.ssl)}ms`, color: '#fbbf24' };
  }
  if (t.wait / total > 0.7 && t.wait > 500) {
    return { bottleneck: 'backend', label: 'Backend Slow', description: `TTFB is ${Math.round(t.wait)}ms (${Math.round((t.wait / total) * 100)}% of total)`, color: '#ef4444' };
  }
  if (t.receive / total > 0.6 && t.receive > 500) {
    return { bottleneck: 'download', label: 'Large Download', description: `Download took ${Math.round(t.receive)}ms`, color: '#f97316' };
  }
  if ((t.connect + t.ssl) / total > 0.5 && t.connect > 300) {
    return { bottleneck: 'network', label: 'Network Slow', description: `Connection took ${Math.round(t.connect + t.ssl)}ms`, color: '#fb923c' };
  }
  return { bottleneck: 'ok', label: 'OK', description: 'No significant bottleneck detected', color: '#34d399' };
}

// 7. cURL generator
export function generateCurl(entry: HarEntry): string {
  const parts: string[] = [`curl -X ${entry.method}`];
  if (entry.requestHeaders) {
    for (const [name, value] of Object.entries(entry.requestHeaders)) {
      const lower = name.toLowerCase();
      if (lower === 'host' || lower === ':method' || lower === ':path' || lower === ':scheme' || lower === ':authority') continue;
      parts.push(`  -H ${JSON.stringify(`${name}: ${value}`)}`);
    }
  }
  parts.push(`  ${JSON.stringify(entry.url)}`);
  return parts.join(' \\\n');
}

// ── Advanced Session-Level Issue Detection ─────────────────────────

// #1 N+1 Waterfall — sequential requests to same pattern with start-time gap < 20ms
export function detectN1Waterfall(entries: HarEntry[]): Issue[] {
  const groups = new Map<string, HarEntry[]>();
  // Only consider successful responses — redirects are handled by detectRedirectLoops
  for (const e of entries.filter(e => e.status >= 200 && e.status < 300)) {
    const key = `${e.method}::${normalizeUrlPattern(e.pathname)}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const issues: Issue[] = [];
  let idx = 0;
  for (const [key, group] of groups) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.relStartMs - b.relStartMs);
    // Collect consecutive entries where gap between start times < 20ms
    const run: HarEntry[] = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].relStartMs - sorted[i - 1].relStartMs < 20) run.push(sorted[i]);
    }
    if (run.length >= 3) {
      const [method, pattern] = key.split('::');
      issues.push({
        id: `n1-waterfall-${idx++}`,
        type: 'n1-waterfall',
        title: `N+1 Waterfall: ${method} ${pattern}`,
        description: `${run.length} sequential requests with <20ms gap between starts`,
        severity: 'critical',
        entries: run,
      });
    }
  }
  return issues;
}

// #2 Infinite Polling — identical GET requests at fixed interval (stdDev/avg < 20%)
export function detectInfinitePolling(entries: HarEntry[]): Issue[] {
  const gets = entries.filter(e => e.method === 'GET');
  const groups = new Map<string, HarEntry[]>();
  for (const e of gets) {
    const key = normalizeUrlPattern(e.pathname);
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const issues: Issue[] = [];
  let idx = 0;
  for (const [pattern, group] of groups) {
    if (group.length < 4) continue;
    const sorted = [...group].sort((a, b) => a.relStartMs - b.relStartMs);
    const gaps = sorted.slice(1).map((e, i) => e.relStartMs - sorted[i].relStartMs);
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const stdDev = Math.sqrt(gaps.reduce((s, g) => s + (g - avg) ** 2, 0) / gaps.length);
    if (avg > 500 && stdDev / avg < 0.2) {
      issues.push({
        id: `polling-${idx++}`,
        type: 'infinite-polling',
        title: `Infinite Polling: GET ${pattern}`,
        description: `${group.length} requests at ~${Math.round(avg)}ms fixed interval`,
        severity: 'error',
        entries: sorted,
        meta: { intervalMs: Math.round(avg) },
      });
    }
  }
  return issues;
}

// #4 CORS Preflight Storm — per-endpoint OPTIONS count ≥ actual call count on 2+ endpoints
// (Access-Control-Max-Age=0 or missing causes browser to re-send preflight every time)
export function detectCorsPreflightStorm(entries: HarEntry[]): Issue[] {
  const options = entries.filter(e => e.method === 'OPTIONS');
  if (options.length === 0) return [];

  // Group by normalized URL pattern: count OPTIONS vs actual calls
  const groups = new Map<string, { options: HarEntry[]; actual: HarEntry[] }>();
  for (const e of entries) {
    const key = normalizeUrlPattern(e.pathname);
    const g = groups.get(key) ?? { options: [], actual: [] };
    if (e.method === 'OPTIONS') g.options.push(e);
    else g.actual.push(e);
    groups.set(key, g);
  }

  // Storm = endpoints where preflight count ≥ actual call count (browser isn't caching)
  const stormEndpoints = [...groups.entries()].filter(
    ([, g]) => g.options.length > 0 && g.actual.length > 0 && g.options.length >= g.actual.length,
  );
  if (stormEndpoints.length < 2) return [];

  return [{
    id: 'cors-storm-0',
    type: 'cors-preflight-storm',
    title: 'CORS Preflight Storm',
    description: `${stormEndpoints.length} endpoints where OPTIONS ≥ actual calls — Access-Control-Max-Age may be 0`,
    severity: 'warning',
    entries: options,
    meta: { stormCount: stormEndpoints.length, totalOptions: options.length },
  }];
}

// #5 Zombie API Calls — 200 OK with empty body, repeated ≥ 3 times on same pattern
export function detectZombieApiCalls(entries: HarEntry[]): Issue[] {
  const groups = new Map<string, HarEntry[]>();
  for (const e of entries) {
    if (e.status !== 200 || e.responseSize > 10) continue;
    const key = `${e.method}::${normalizeUrlPattern(e.pathname)}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const issues: Issue[] = [];
  let idx = 0;
  for (const [key, group] of groups) {
    if (group.length < 3) continue;
    const [method, pattern] = key.split('::');
    issues.push({
      id: `zombie-${idx++}`,
      type: 'zombie-api',
      title: `Zombie API: ${method} ${pattern}`,
      description: `${group.length}× status 200 with empty response body`,
      severity: 'warning',
      entries: group,
    });
  }
  return issues;
}

// #6 Redirect Loops — same URL pattern with 301/302 appearing ≥ 3 times
export function detectRedirectLoops(entries: HarEntry[]): Issue[] {
  const groups = new Map<string, HarEntry[]>();
  for (const e of entries) {
    if (e.status !== 301 && e.status !== 302) continue;
    const key = normalizeUrlPattern(e.pathname);
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const issues: Issue[] = [];
  let idx = 0;
  for (const [pattern, group] of groups) {
    if (group.length < 3) continue;
    const statuses = [...new Set(group.map(e => e.status))].join(', ');
    issues.push({
      id: `redirect-loop-${idx++}`,
      type: 'redirect-loop',
      title: `Redirect Loop: ${pattern}`,
      description: `${group.length} redirects (${statuses})`,
      severity: 'critical',
      entries: group,
    });
  }
  return issues;
}

// #7 Heavy Third-Party — third-party domains account for > 60% of total transfer
export function detectHeavyThirdParty(entries: HarEntry[]): Issue[] {
  if (entries.length === 0) return [];
  // Detect app domain as most-requested host
  const hostCount = new Map<string, number>();
  for (const e of entries) if (e.host) hostCount.set(e.host, (hostCount.get(e.host) ?? 0) + 1);
  let appDomain = '';
  let maxCount = 0;
  for (const [host, count] of hostCount) if (count > maxCount) { maxCount = count; appDomain = host; }

  const totalSize = entries.reduce((s, e) => s + e.responseSize, 0);
  if (totalSize === 0) return [];

  const thirdParty = entries.filter(e => e.host && e.host !== appDomain);
  const thirdPartySize = thirdParty.reduce((s, e) => s + e.responseSize, 0);
  const ratio = thirdPartySize / totalSize;
  if (ratio <= 0.6) return [];

  const byDomain = new Map<string, number>();
  for (const e of thirdParty) byDomain.set(e.host, (byDomain.get(e.host) ?? 0) + e.responseSize);
  const topDomains = [...byDomain.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d).join(', ');

  return [{
    id: 'heavy-third-party-0',
    type: 'heavy-third-party',
    title: 'Heavy Third-Party Load',
    description: `${(ratio * 100).toFixed(0)}% of transfer from third-party domains (${topDomains})`,
    severity: 'warning',
    entries: thirdParty,
    meta: { ratio, appDomain, topDomains },
  }];
}

// #8 Cache Miss Trend — static assets served with no-cache / no-store
export function detectCacheMissTrend(entries: HarEntry[]): Issue[] {
  const noCacheEntries = entries.filter(e => {
    if (!/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ico|webp)(\?|$)/i.test(e.pathname)) return false;
    const cc = getHeader(e.responseHeaders, 'cache-control');
    return /no-cache|no-store/.test(cc);
  });
  if (noCacheEntries.length === 0) return [];
  const totalStatic = entries.filter(e =>
    /\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ico|webp)(\?|$)/i.test(e.pathname),
  ).length;
  return [{
    id: 'cache-miss-trend-0',
    type: 'cache-miss-trend',
    title: 'Cache Miss Trend',
    description: `${noCacheEntries.length} of ${totalStatic} static assets served with no-cache / no-store`,
    severity: 'warning',
    entries: noCacheEntries,
    meta: { count: noCacheEntries.length, totalStatic },
  }];
}

// #9 Header Leakage — sensitive headers sent over plain HTTP
export function detectHeaderLeakage(entries: HarEntry[]): Issue[] {
  const SENSITIVE = /^(authorization|x-api-key|api-key|token|x-auth-token|x-access-token|set-cookie)$/i;
  const leakyEntries = entries.filter(e => {
    if (!e.url.startsWith('http://')) return false;
    const allHeaders = { ...e.requestHeaders, ...e.responseHeaders };
    return Object.keys(allHeaders).some(k => SENSITIVE.test(k));
  });
  if (leakyEntries.length === 0) return [];
  return [{
    id: 'header-leakage-0',
    type: 'header-leakage',
    title: 'Header Leakage over HTTP',
    description: `${leakyEntries.length} request${leakyEntries.length > 1 ? 's' : ''} send sensitive headers over plain HTTP`,
    severity: 'critical',
    entries: leakyEntries,
    meta: { count: leakyEntries.length },
  }];
}

// #10 Large Payload DOM — HTML responses > 500 KB
export function detectLargePayloadDom(entries: HarEntry[]): Issue[] {
  const heavyHtml = entries.filter(e => {
    const mime = e.mimeType ?? '';
    return mime.includes('text/html') && e.responseSize > 500_000;
  });
  if (heavyHtml.length === 0) return [];
  const largest = heavyHtml.reduce((a, b) => (a.responseSize > b.responseSize ? a : b));
  return [{
    id: 'large-payload-dom-0',
    type: 'large-payload-dom',
    title: 'Large HTML Payload',
    description: `${heavyHtml.length} HTML response${heavyHtml.length > 1 ? 's' : ''} exceed 500 KB (largest: ${(largest.responseSize / 1024).toFixed(0)} KB)`,
    severity: 'warning',
    entries: heavyHtml,
    meta: { count: heavyHtml.length, largestBytes: largest.responseSize },
  }];
}

// #3 Uncompressed Bloat — response > 1 MB without Content-Encoding
export function detectUncompressedBloat(entries: HarEntry[]): Issue[] {
  const bloatEntries = entries.filter(
    e => e.responseSize > 1_000_000 && !getHeader(e.responseHeaders, 'content-encoding'),
  );
  if (bloatEntries.length === 0) return [];
  const totalBytes = bloatEntries.reduce((s, e) => s + e.responseSize, 0);
  return [{
    id: 'uncompressed-bloat-0',
    type: 'uncompressed-bloat',
    title: 'Uncompressed Bloat',
    description: `${bloatEntries.length} response${bloatEntries.length > 1 ? 's' : ''} > 1 MB served without compression (${(totalBytes / 1_048_576).toFixed(1)} MB total)`,
    severity: 'warning',
    entries: bloatEntries,
    meta: { count: bloatEntries.length, totalBytes },
  }];
}
