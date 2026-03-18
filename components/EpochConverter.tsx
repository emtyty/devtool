import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Clock, Copy, Check, Layers, ArrowLeftRight, Search, ChevronDown } from 'lucide-react';
import ResizableSplit from './ResizableSplit';

// ── Timezones ────────────────────────────────────────────────────────────────

interface TzEntry { id: string; offset: string; label: string; pinned: boolean }

const PINNED = new Set([
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Europe/Istanbul', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh',
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore', 'Australia/Sydney',
  'Pacific/Auckland',
]);

function getUtcOffset(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
    const offset = parts.find(p => p.type === 'timeZoneName')?.value || '';
    return offset.replace('GMT', 'UTC');
  } catch { return ''; }
}

const TZ_LIST: TzEntry[] = (() => {
  let ids: string[];
  try { ids = Intl.supportedValuesOf('timeZone'); }
  catch { ids = [...PINNED]; }

  const entries: TzEntry[] = ids.map(id => ({
    id,
    offset: getUtcOffset(id),
    label: `${id.replace(/_/g, ' ')}`,
    pinned: PINNED.has(id),
  }));

  const pinned = entries.filter(e => e.pinned);
  const rest = entries.filter(e => !e.pinned);
  return [...pinned, ...rest];
})();

// ── Searchable Timezone Picker ───────────────────────────────────────────────

function TzPicker({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) { inputRef.current?.focus(); setQuery(''); }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return TZ_LIST;
    const q = query.toLowerCase();
    return TZ_LIST.filter(e =>
      e.id.toLowerCase().includes(q) || e.offset.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)
    );
  }, [query]);

  const current = TZ_LIST.find(e => e.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none hover:border-slate-300 transition-colors"
      >
        <span className="truncate">
          {current ? <>{current.id} <span className="text-blue-500 font-bold">{current.offset}</span></> : value}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search timezone..."
                className="flex-1 bg-transparent text-xs font-mono outline-none placeholder:text-slate-300"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-xs text-slate-400 text-center">No matches</div>
            )}
            {filtered.map((e, i) => {
              const showSeparator = i > 0 && filtered[i - 1].pinned && !e.pinned;
              return (
                <div key={e.id}>
                  {showSeparator && <div className="border-t border-slate-100 mx-3" />}
                  <button
                    onClick={() => { onChange(e.id); setOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-xs font-mono flex items-center justify-between hover:bg-blue-50 transition-colors ${
                      e.id === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                    }`}
                  >
                    <span className="truncate">{e.id.replace(/_/g, ' ')}</span>
                    <span className={`shrink-0 ml-2 font-bold ${e.id === value ? 'text-blue-500' : 'text-slate-400'}`}>{e.offset}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date, zone: string): string {
  try {
    return d.toLocaleString('en-US', {
      timeZone: zone,
      weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      timeZoneName: 'short',
    });
  } catch { return `⚠ Unknown timezone: ${zone}`; }
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const abs = Math.abs(diffMs);
  const suffix = diffMs > 0 ? 'ago' : 'from now';
  if (abs < 60_000) return `${Math.floor(abs / 1000)}s ${suffix}`;
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ${suffix}`;
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ${suffix}`;
  if (abs < 31_536_000_000) return `${Math.floor(abs / 86_400_000)}d ${suffix}`;
  return `${(abs / 31_536_000_000).toFixed(1)}y ${suffix}`;
}

function epochToDate(input: string, tz: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const num = Number(trimmed);
  if (isNaN(num)) return '⚠ Invalid number';

  const ms = trimmed.length <= 10 ? num * 1000 : num;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '⚠ Invalid timestamp';

  const unitNote = trimmed.length <= 10 ? '(detected: seconds)' : '(detected: milliseconds)';
  return [
    `Input:          ${trimmed} ${unitNote}`,
    `Milliseconds:   ${ms}`,
    `Seconds:        ${Math.floor(ms / 1000)}`,
    ``,
    `ISO 8601:       ${d.toISOString()}`,
    `UTC:            ${fmtDate(d, 'UTC')}`,
    `${tz}:${' '.repeat(Math.max(1, 16 - tz.length))}${fmtDate(d, tz)}`,
    ``,
    `Relative:       ${relativeTime(d)}`,
  ].join('\n');
}

function dateToEpoch(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return '⚠ Could not parse date string';
  const ms = d.getTime();
  return [
    `Parsed:         ${d.toISOString()}`,
    `Epoch (s):      ${Math.floor(ms / 1000)}`,
    `Epoch (ms):     ${ms}`,
  ].join('\n');
}

function getCurrentTimestamps(): string {
  const now = Date.now();
  return [
    `Now (s):        ${Math.floor(now / 1000)}`,
    `Now (ms):       ${now}`,
    `ISO 8601:       ${new Date(now).toISOString()}`,
  ].join('\n');
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EpochConverter() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'toDate' | 'toEpoch'>('toDate');
  const [tz, setTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [copied, setCopied] = useState(false);
  const [nowCopied, setNowCopied] = useState(false);

  const output = useMemo(
    () => mode === 'toDate' ? epochToDate(input, tz) : dateToEpoch(input),
    [input, mode, tz]
  );

  const copy = useCallback((text: string, setFn: (v: boolean) => void) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  }, []);

  return (
    <div className="space-y-6">
      <ResizableSplit
        storageKey="split:epoch"
        left={
          <div className="flex flex-col gap-6 h-full">
            {/* Now card */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Clock size={14} /> Current Time
                </span>
                <button
                  onClick={() => copy(getCurrentTimestamps(), setNowCopied)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
                >
                  {nowCopied ? <Check size={12} /> : <Copy size={12} />}
                  {nowCopied ? 'Copied' : 'Copy Now'}
                </button>
              </div>
              <pre className="font-mono text-xs text-slate-600 leading-relaxed">{getCurrentTimestamps()}</pre>
            </section>

            {/* Input */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[280px]">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Convert</span>
                <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-lg gap-0.5">
                  {([['toDate', 'Epoch → Date'], ['toEpoch', 'Date → Epoch']] as const).map(([m, label]) => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
                        mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>
              <textarea
                className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={mode === 'toDate' ? '1700000000 or 1700000000000' : '2024-01-15T10:30:00Z'}
              />
            </section>

            {/* Timezone selector */}
            {mode === 'toDate' && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                  Display Timezone
                </label>
                <TzPicker value={tz} onChange={setTz} />
              </section>
            )}

            {/* Info */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">Info</p>
              <ul className="text-xs text-slate-500 leading-relaxed space-y-1.5">
                <li>• Auto-detects seconds (≤10 digits) vs milliseconds (&gt;10 digits)</li>
                <li>• Date → Epoch accepts ISO 8601 and common date formats</li>
                <li>• Relative time shows how far from now</li>
              </ul>
            </section>
          </div>
        }
        right={
          <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
            <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={14} /> Result
              </span>
              <button
                onClick={() => copy(output, setCopied)}
                disabled={!output}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <div className="flex-1 p-6 overflow-auto">
              <pre className="font-mono text-[13px] text-blue-100/90 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white">
                {output || '// Enter a timestamp or date string on the left...'}
              </pre>
            </div>
          </section>
        }
      />
    </div>
  );
}
