import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Clock, Copy, Check, ChevronDown, ChevronUp,
  BookOpen, Sparkles, Calendar, Timer, Settings2,
} from 'lucide-react';
import ResizableSplit from './ResizableSplit';

// ── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type FieldMode = 'every' | 'specific' | 'range' | 'interval';

interface FieldState {
  mode: FieldMode;
  specific: number[];
  rangeStart: number;
  rangeEnd: number;
  interval: number;
}

interface CronField {
  label: string;
  min: number;
  max: number;
  names?: string[];
}

const CRON_FIELDS: CronField[] = [
  { label: 'Minute', min: 0, max: 59 },
  { label: 'Hour', min: 0, max: 23 },
  { label: 'Day of Month', min: 1, max: 31 },
  { label: 'Month', min: 1, max: 12, names: MONTH_NAMES },
  { label: 'Day of Week', min: 0, max: 6, names: DOW_NAMES },
];

const PRESETS = [
  { label: 'Every weekday at 9 AM', cron: '0 9 * * 1-5' },
  { label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { label: 'First day of month at midnight', cron: '0 0 1 * *' },
  { label: 'Every Sunday at 3:30 PM', cron: '30 15 * * 0' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Twice daily (9 AM, 5 PM)', cron: '0 9,17 * * *' },
];

// ── Cron Parsing ─────────────────────────────────────────────────────────────

function parseFieldToken(token: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  if (token === '*') {
    for (let i = min; i <= max; i++) values.add(i);
    return values;
  }
  const parts = token.split(',');
  for (const part of parts) {
    const stepMatch = part.match(/^(\*|(\d+)-(\d+))\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[4], 10);
      let start = min;
      let end = max;
      if (stepMatch[2] !== undefined) {
        start = parseInt(stepMatch[2], 10);
        end = parseInt(stepMatch[3], 10);
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = parseInt(rangeMatch[1], 10);
      const b = parseInt(rangeMatch[2], 10);
      for (let i = a; i <= b; i++) values.add(i);
      continue;
    }
    const num = parseInt(part, 10);
    if (!isNaN(num)) values.add(num);
  }
  return values;
}

function parseCronExpression(expr: string): Set<number>[] | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    return parts.map((token, i) => parseFieldToken(token, CRON_FIELDS[i].min, CRON_FIELDS[i].max));
  } catch {
    return null;
  }
}

function fieldStateToToken(state: FieldState, field: CronField): string {
  switch (state.mode) {
    case 'every':
      return '*';
    case 'specific':
      return state.specific.length > 0 ? state.specific.sort((a, b) => a - b).join(',') : '*';
    case 'range':
      return `${state.rangeStart}-${state.rangeEnd}`;
    case 'interval':
      return `*/${state.interval}`;
  }
}

function tokenToFieldState(token: string, field: CronField): FieldState {
  const def: FieldState = {
    mode: 'every',
    specific: [],
    rangeStart: field.min,
    rangeEnd: field.max,
    interval: 1,
  };
  if (token === '*') return def;
  // interval: */n
  const intervalMatch = token.match(/^\*\/(\d+)$/);
  if (intervalMatch) {
    return { ...def, mode: 'interval', interval: parseInt(intervalMatch[1], 10) };
  }
  // range: n-m (single range, no commas)
  const rangeMatch = token.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    return { ...def, mode: 'range', rangeStart: parseInt(rangeMatch[1], 10), rangeEnd: parseInt(rangeMatch[2], 10) };
  }
  // specific values (may include commas and individual numbers)
  const nums = token.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  if (nums.length > 0) {
    return { ...def, mode: 'specific', specific: nums };
  }
  return def;
}

// ── Next Run Calculation ─────────────────────────────────────────────────────

function getNextRuns(expr: string, count: number): Date[] {
  const parsed = parseCronExpression(expr);
  if (!parsed) return [];
  const [minutes, hours, doms, months, dows] = parsed;
  const runs: Date[] = [];
  const now = new Date();
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

  const maxIterations = 525960; // ~1 year of minutes
  for (let i = 0; i < maxIterations && runs.length < count; i++) {
    const mo = cursor.getMonth() + 1;
    const dom = cursor.getDate();
    const dow = cursor.getDay();
    const hr = cursor.getHours();
    const mn = cursor.getMinutes();

    if (months.has(mo) && doms.has(dom) && dows.has(dow) && hours.has(hr) && minutes.has(mn)) {
      runs.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return runs;
}

// ── Human-Readable Description ───────────────────────────────────────────────

function describeField(token: string, fieldIndex: number): string {
  const field = CRON_FIELDS[fieldIndex];
  if (token === '*') return '';

  const intervalMatch = token.match(/^\*\/(\d+)$/);
  if (intervalMatch) {
    const n = intervalMatch[1];
    switch (fieldIndex) {
      case 0: return `every ${n} minutes`;
      case 1: return `every ${n} hours`;
      case 2: return `every ${n} days`;
      case 3: return `every ${n} months`;
      case 4: return `every ${n} days of the week`;
    }
  }

  const rangeMatch = token.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1], 10);
    const b = parseInt(rangeMatch[2], 10);
    if (fieldIndex === 4) return `${DOW_NAMES[a]} through ${DOW_NAMES[b]}`;
    if (fieldIndex === 3) return `${MONTH_NAMES[a - 1]} through ${MONTH_NAMES[b - 1]}`;
    return `${a}-${b}`;
  }

  const nums = token.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  if (fieldIndex === 4) return nums.map(n => DOW_NAMES[n] ?? n).join(', ');
  if (fieldIndex === 3) return nums.map(n => MONTH_NAMES[n - 1] ?? n).join(', ');
  return nums.join(', ');
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid cron expression';
  const [minTok, hrTok, domTok, moTok, dowTok] = parts;

  // Build time description
  let timeDesc = '';
  if (minTok.startsWith('*/')) {
    timeDesc = describeField(minTok, 0);
  } else if (hrTok.startsWith('*/')) {
    const minVal = minTok === '0' ? '' : ` at minute ${minTok}`;
    timeDesc = `${describeField(hrTok, 1)}${minVal}`;
  } else if (hrTok === '*' && minTok === '*') {
    timeDesc = 'every minute';
  } else if (hrTok === '*') {
    timeDesc = `every hour at minute ${minTok}`;
  } else {
    // Specific times
    const hours = hrTok.split(',').map(s => parseInt(s, 10));
    const mins = minTok.split(',').map(s => parseInt(s, 10));
    const times = hours.map(h => {
      return mins.map(m => {
        const period = h >= 12 ? 'PM' : 'AM';
        const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
      }).join(', ');
    }).join(' and ');
    timeDesc = `at ${times}`;
  }

  // Build date description
  let dateDesc = '';
  if (dowTok !== '*') {
    const dowDesc = describeField(dowTok, 4);
    // Check for weekday pattern
    if (dowTok === '1-5') {
      dateDesc = 'every weekday';
    } else if (dowTok === '0-6' || dowTok === '*') {
      dateDesc = '';
    } else {
      dateDesc = `on ${dowDesc}`;
    }
  }
  if (domTok !== '*') {
    const domDesc = describeField(domTok, 2);
    dateDesc = `on day ${domDesc} of the month`;
  }
  if (moTok !== '*') {
    const moDesc = describeField(moTok, 3);
    dateDesc += ` in ${moDesc}`;
  }

  const result = [dateDesc, timeDesc].filter(Boolean).join(', ');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `Expected 5 fields, got ${parts.length}`;
  const fieldNames = ['Minute', 'Hour', 'Day of Month', 'Month', 'Day of Week'];
  for (let i = 0; i < 5; i++) {
    const token = parts[i];
    const { min, max } = CRON_FIELDS[i];
    // Validate each comma-separated segment
    const segments = token.split(',');
    for (const seg of segments) {
      if (seg === '*') continue;
      if (/^\*\/\d+$/.test(seg)) {
        const step = parseInt(seg.split('/')[1], 10);
        if (step < 1) return `${fieldNames[i]}: step must be >= 1`;
        continue;
      }
      if (/^\d+-\d+$/.test(seg)) {
        const [a, b] = seg.split('-').map(Number);
        if (a < min || a > max || b < min || b > max) return `${fieldNames[i]}: range ${a}-${b} out of bounds (${min}-${max})`;
        if (a > b) return `${fieldNames[i]}: range start ${a} > end ${b}`;
        continue;
      }
      if (/^\d+-\d+\/\d+$/.test(seg)) continue;
      if (/^\d+$/.test(seg)) {
        const n = parseInt(seg, 10);
        if (n < min || n > max) return `${fieldNames[i]}: value ${n} out of bounds (${min}-${max})`;
        continue;
      }
      return `${fieldNames[i]}: invalid token "${seg}"`;
    }
  }
  return null;
}

// ── Cheat Sheet Data ─────────────────────────────────────────────────────────

const CHEAT_ROWS: { symbol: string; meaning: string; example: string }[] = [
  { symbol: '*', meaning: 'Any value', example: '* * * * * — every minute' },
  { symbol: ',', meaning: 'Value list separator', example: '1,15 — at 1 and 15' },
  { symbol: '-', meaning: 'Range of values', example: '1-5 — 1 through 5' },
  { symbol: '/', meaning: 'Step values', example: '*/15 — every 15th' },
];

// ── FieldCard Component ──────────────────────────────────────────────────────

function FieldCard({
  fieldIndex,
  state,
  onChange,
}: {
  fieldIndex: number;
  state: FieldState;
  onChange: (s: FieldState) => void;
}) {
  const field = CRON_FIELDS[fieldIndex];
  const options = Array.from({ length: field.max - field.min + 1 }, (_, i) => field.min + i);

  const toggleSpecific = (val: number) => {
    const next = state.specific.includes(val)
      ? state.specific.filter(v => v !== val)
      : [...state.specific, val];
    onChange({ ...state, specific: next });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          {field.label}
        </span>
        <span className="text-[10px] font-black text-slate-400">
          {field.min}–{field.max}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {/* Mode selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          {(['every', 'specific', 'range', 'interval'] as FieldMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => onChange({ ...state, mode })}
              className={`flex-1 py-1.5 px-2 text-[10px] font-black rounded-lg uppercase transition-all ${
                state.mode === mode ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {mode === 'every' ? '*' : mode === 'interval' ? '*/n' : mode}
            </button>
          ))}
        </div>

        {/* Mode-specific controls */}
        {state.mode === 'specific' && (
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {options.map(val => (
              <button
                key={val}
                onClick={() => toggleSpecific(val)}
                className={`min-w-[36px] px-1.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                  state.specific.includes(val)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                {field.names ? field.names[val - field.min] : val}
              </button>
            ))}
          </div>
        )}

        {state.mode === 'range' && (
          <div className="flex items-center gap-2">
            <select
              value={state.rangeStart}
              onChange={e => onChange({ ...state, rangeStart: parseInt(e.target.value, 10) })}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
            >
              {options.map(v => (
                <option key={v} value={v}>{field.names ? field.names[v - field.min] : v}</option>
              ))}
            </select>
            <span className="text-xs font-black text-slate-400">to</span>
            <select
              value={state.rangeEnd}
              onChange={e => onChange({ ...state, rangeEnd: parseInt(e.target.value, 10) })}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
            >
              {options.map(v => (
                <option key={v} value={v}>{field.names ? field.names[v - field.min] : v}</option>
              ))}
            </select>
          </div>
        )}

        {state.mode === 'interval' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-400">Every</span>
            <input
              type="number"
              min={1}
              max={field.max}
              value={state.interval}
              onChange={e => onChange({ ...state, interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <span className="text-xs text-slate-400">{field.label.toLowerCase()}(s)</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_CRON = '* * * * *';

function makeDefaultFields(): FieldState[] {
  return CRON_FIELDS.map(f => ({
    mode: 'every' as FieldMode,
    specific: [],
    rangeStart: f.min,
    rangeEnd: f.max,
    interval: 1,
  }));
}

export default function CronBuilder({ initialData }: { initialData?: string | null }) {
  const [cronText, setCronText] = useState(DEFAULT_CRON);

  useEffect(() => { if (initialData) setCronText(initialData); }, [initialData]);
  const [fields, setFields] = useState<FieldState[]>(makeDefaultFields);
  const [copied, setCopied] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  // Sync direction flag to prevent loops
  const syncSource = useRef<'text' | 'builder' | null>(null);

  // Close presets dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Text -> builder sync
  const handleTextChange = useCallback((value: string) => {
    setCronText(value);
    const parts = value.trim().split(/\s+/);
    if (parts.length === 5) {
      syncSource.current = 'text';
      setFields(parts.map((token, i) => tokenToFieldState(token, CRON_FIELDS[i])));
    }
  }, []);

  // Builder -> text sync
  const handleFieldChange = useCallback((index: number, state: FieldState) => {
    syncSource.current = 'builder';
    setFields(prev => {
      const next = [...prev];
      next[index] = state;
      const expr = next.map((s, i) => fieldStateToToken(s, CRON_FIELDS[i])).join(' ');
      setCronText(expr);
      return next;
    });
  }, []);

  // Load preset
  const loadPreset = useCallback((cron: string) => {
    setCronText(cron);
    const parts = cron.trim().split(/\s+/);
    if (parts.length === 5) {
      setFields(parts.map((token, i) => tokenToFieldState(token, CRON_FIELDS[i])));
    }
    setShowPresets(false);
  }, []);

  // Copy
  const handleCopy = useCallback(() => {
    if (!cronText) return;
    navigator.clipboard.writeText(cronText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [cronText]);

  // Computed values
  const validationError = useMemo(() => validateCron(cronText), [cronText]);
  const description = useMemo(() => validationError ? null : describeCron(cronText), [cronText, validationError]);
  const nextRuns = useMemo(() => validationError ? [] : getNextRuns(cronText, 10), [cronText, validationError]);

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'Local';
    }
  }, []);

  // ── Left Panel ─────────────────────────────────────────────────────────────

  const leftPanel = (
    <div className="flex flex-col gap-6 h-full">
      {/* Cron Expression Input */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Timer size={14} /> Cron Expression
          </span>
          {!validationError && (
            <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded shadow-sm">
              VALID
            </span>
          )}
          {validationError && cronText.trim() !== '' && (
            <span className="text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded shadow-sm">
              INVALID
            </span>
          )}
        </div>
        <div className="p-6 space-y-3">
          <input
            type="text"
            value={cronText}
            onChange={e => handleTextChange(e.target.value)}
            placeholder="* * * * *"
            spellCheck={false}
            className="w-full font-mono text-lg text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-300 tracking-widest text-center"
          />
          <div className="flex justify-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">
            <span>Min</span>
            <span>Hour</span>
            <span>Day</span>
            <span>Month</span>
            <span>DOW</span>
          </div>
          {validationError && cronText.trim() !== '' && (
            <p className="text-xs text-red-500 font-medium text-center">{validationError}</p>
          )}
        </div>
      </section>

      {/* Visual Builder */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Settings2 size={14} /> Visual Builder
          </span>
        </div>
        {CRON_FIELDS.map((_, i) => (
          <FieldCard
            key={i}
            fieldIndex={i}
            state={fields[i]}
            onChange={s => handleFieldChange(i, s)}
          />
        ))}
      </div>

      {/* Example Data + Cheat Sheet */}
      <div className="flex gap-3">
        {/* Example Data Dropdown */}
        <div className="relative" ref={presetsRef}>
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-white border border-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Sparkles size={14} />
            Example Data
            <ChevronDown size={12} className={`transition-transform ${showPresets ? 'rotate-180' : ''}`} />
          </button>
          {showPresets && (
            <div className="absolute z-50 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 left-0">
              {PRESETS.map(preset => (
                <button
                  key={preset.cron}
                  onClick={() => loadPreset(preset.cron)}
                  className="w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="text-xs font-bold text-slate-700">{preset.label}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">{preset.cron}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cheat Sheet Toggle */}
        <button
          onClick={() => setShowCheatSheet(!showCheatSheet)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-white border border-slate-200 shadow-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <BookOpen size={14} />
          Cheat Sheet
          {showCheatSheet ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Cheat Sheet Panel */}
      {showCheatSheet && (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <BookOpen size={14} /> Cron Syntax Reference
            </span>
          </div>
          <div className="p-6">
            {/* Field reference */}
            <div className="mb-5">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Fields (left to right)</h4>
              <div className="grid grid-cols-5 gap-2">
                {['Minute\n0–59', 'Hour\n0–23', 'Day\n1–31', 'Month\n1–12', 'DOW\n0–6'].map(f => {
                  const [name, range] = f.split('\n');
                  return (
                    <div key={name} className="bg-slate-50 rounded-lg p-2 text-center border border-slate-100">
                      <div className="text-[10px] font-black text-slate-600 uppercase">{name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{range}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Symbols */}
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Special Characters</h4>
            <div className="space-y-2">
              {CHEAT_ROWS.map(row => (
                <div key={row.symbol} className="flex items-start gap-3">
                  <code className="shrink-0 w-8 text-center font-mono text-sm font-bold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">{row.symbol}</code>
                  <div>
                    <div className="text-xs font-bold text-slate-700">{row.meaning}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{row.example}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );

  // ── Right Panel ────────────────────────────────────────────────────────────

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
          <Clock size={14} /> Schedule Preview
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'COPIED' : 'COPY EXPRESSION'}
        </button>
      </div>
      <div className="flex-1 p-6 overflow-auto space-y-8">
        {/* Expression Display */}
        <div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Expression</h3>
          <div className="font-mono text-2xl text-blue-100 tracking-widest text-center py-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            {cronText || '* * * * *'}
          </div>
        </div>

        {/* Human-Readable Description */}
        <div>
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Description</h3>
          {validationError ? (
            <p className="text-red-400 text-sm font-medium">{validationError}</p>
          ) : (
            <p className="text-emerald-300 text-base font-semibold leading-relaxed">{description}</p>
          )}
        </div>

        {/* Next 10 Runs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Calendar size={12} /> Next 10 Runs
            </h3>
            <span className="text-[10px] font-bold text-slate-600">{timezone}</span>
          </div>
          {nextRuns.length === 0 && !validationError && (
            <p className="text-slate-500 text-sm">No upcoming runs found within the next year.</p>
          )}
          {nextRuns.length === 0 && validationError && (
            <p className="text-slate-600 text-sm italic">Fix the expression to see upcoming runs.</p>
          )}
          <div className="space-y-1.5">
            {nextRuns.map((date, i) => (
              <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                <span className="text-[10px] font-black text-slate-600 w-5 text-right">{i + 1}</span>
                <span className="font-mono text-sm text-blue-100/90">
                  {date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
                <span className="font-mono text-sm text-emerald-300 ml-auto">
                  {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  return <ResizableSplit left={leftPanel} right={rightPanel} storageKey="split:cron" />;
}
