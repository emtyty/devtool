import { useState, useEffect, useCallback } from 'react';
import { Hash, Copy, Check, RefreshCw } from 'lucide-react';
import ResizableSplit from './ResizableSplit';

type UuidType = 'v4' | 'v7' | 'v1' | 'ulid';
type OutputFormat = 'lines' | 'array' | 'sql' | 'csv';

function generateUUIDv4(): string {
  return crypto.randomUUID();
}

function generateUUIDv1(): string {
  const unixToGregorian = 122192928000000000n;
  const t = BigInt(Date.now()) * 10000n + unixToGregorian;

  const timeLow = t & 0xFFFFFFFFn;
  const timeMid = (t >> 32n) & 0xFFFFn;
  const timeHi = (t >> 48n) & 0x0FFFn;

  const rnd = crypto.getRandomValues(new Uint8Array(8));
  const clockSeq = ((rnd[0] & 0x3F) << 8) | rnd[1];
  const node = Array.from(rnd.slice(2)).map(b => b.toString(16).padStart(2, '0')).join('');

  const pad = (n: bigint | number, len: number) =>
    (typeof n === 'bigint' ? n : BigInt(n)).toString(16).padStart(len, '0');

  return [
    pad(timeLow, 8),
    pad(timeMid, 4),
    pad(0x1000n | timeHi, 4),
    pad(0x8000 | clockSeq, 4),
    node,
  ].join('-');
}

function generateUUIDv7(): string {
  const ms = BigInt(Date.now());
  const rnd = crypto.getRandomValues(new Uint8Array(10));

  const tsHigh = (ms >> 16n) & 0xFFFFFFFFn;
  const tsLow = ms & 0xFFFFn;
  const randA = ((rnd[0] & 0x0F) << 8) | rnd[1];
  const variantBits = 0x8000 | ((rnd[2] & 0x3F) << 8) | rnd[3];
  const nodeHex = Array.from(rnd.slice(4)).map(b => b.toString(16).padStart(2, '0')).join('');

  const pad = (n: bigint | number, len: number) =>
    (typeof n === 'bigint' ? n : BigInt(n)).toString(16).padStart(len, '0');

  return [
    pad(tsHigh, 8),
    pad(tsLow, 4),
    pad(0x7000 | randA, 4),
    pad(variantBits, 4),
    nodeHex,
  ].join('-');
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateULID(): string {
  const ms = BigInt(Date.now());
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  let r = 0n;
  for (const b of rnd) r = (r << 8n) | BigInt(b);

  const enc = (val: bigint, len: number): string => {
    let out = '';
    for (let i = 0; i < len; i++) {
      out = B32[Number(val & 0x1Fn)] + out;
      val >>= 5n;
    }
    return out;
  };

  return enc(ms, 10) + enc(r, 16);
}

function formatOutput(ids: string[], fmt: OutputFormat): string {
  if (!ids.length) return '';
  switch (fmt) {
    case 'lines': return ids.join('\n');
    case 'array': return JSON.stringify(ids, null, 2);
    case 'sql':   return `IN (\n  ${ids.map(id => `'${id}'`).join(',\n  ')}\n)`;
    case 'csv':   return ids.join(', ');
  }
}

const TYPE_OPTIONS: { id: UuidType; label: string; desc: string }[] = [
  { id: 'v4',   label: 'UUID v4',  desc: 'Random' },
  { id: 'v7',   label: 'UUID v7',  desc: 'Time-ordered' },
  { id: 'v1',   label: 'UUID v1',  desc: 'Time-based' },
  { id: 'ulid', label: 'ULID',     desc: 'Sortable' },
];

const FORMAT_OPTIONS: { id: OutputFormat; label: string }[] = [
  { id: 'lines', label: 'One per line' },
  { id: 'array', label: 'JSON array' },
  { id: 'sql',   label: 'SQL IN (...)' },
  { id: 'csv',   label: 'CSV' },
];

export default function UuidGenerator() {
  const [uuidType, setUuidType] = useState<UuidType>('v4');
  const [count, setCount] = useState(10);
  const [format, setFormat] = useState<OutputFormat>('lines');
  const [ids, setIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(() => {
    const gen =
      uuidType === 'v1'   ? generateUUIDv1 :
      uuidType === 'v7'   ? generateUUIDv7 :
      uuidType === 'ulid' ? generateULID :
                            generateUUIDv4;
    const clampedCount = Math.min(Math.max(count, 1), 1000);
    setIds(Array.from({ length: clampedCount }, gen));
  }, [uuidType, count]);

  useEffect(() => { generate(); }, [generate]);

  const output = formatOutput(ids, format);

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leftPanel = (
    <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-[400px] h-full">
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <Hash size={14} className="text-slate-400" />
        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Configuration</span>
      </div>

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Type */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Type</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setUuidType(opt.id)}
                className={`flex flex-col px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  uuidType === opt.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:border-blue-400 dark:text-blue-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5'
                }`}
              >
                <span className="text-sm font-black">{opt.label}</span>
                <span className="text-[10px] opacity-70 mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Count — <span className="text-blue-600 dark:text-blue-400">{count}</span>
          </label>
          <input
            type="range"
            min={1}
            max={100}
            value={Math.min(count, 100)}
            onChange={e => setCount(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-bold">
            <span>1</span>
            <span>100</span>
          </div>
          <input
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={e => {
              const v = Math.min(Math.max(Number(e.target.value) || 1, 1), 1000);
              setCount(v);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-700 dark:text-slate-200 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          <p className="text-[10px] text-slate-400">Enter 1–1000 directly in the box above</p>
        </div>

        {/* Format */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Output Format</label>
          <div className="flex flex-col gap-1.5">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setFormat(opt.id)}
                className={`px-4 py-2.5 rounded-lg border-2 text-sm font-bold text-left transition-all ${
                  format === opt.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:border-blue-400 dark:text-blue-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Regenerate */}
        <button
          onClick={generate}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-black text-sm hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20"
        >
          <RefreshCw size={14} />
          Regenerate
        </button>
      </div>
    </section>
  );

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[400px]">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Output</span>
          <span className="text-[10px] font-mono text-slate-500">
            {ids.length} {uuidType.toUpperCase()}{ids.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={handleCopy}
          disabled={!output}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'COPIED' : 'COPY ALL'}
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {output ? (
          <pre className="font-mono text-[12px] text-green-300/90 whitespace-pre-wrap leading-relaxed">
            {output}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <Hash size={32} strokeWidth={1} />
            <p className="text-xs font-bold uppercase tracking-widest">Configure and generate</p>
          </div>
        )}
      </div>
    </section>
  );

  return <ResizableSplit left={leftPanel} right={rightPanel} storageKey="split:uuid-generator" />;
}
