import { useState, useEffect, useCallback } from 'react';
import { Key, Layers, Copy, Check, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import ResizableSplit from './ResizableSplit';

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  return atob(padded);
}

function formatTimestamp(value: number): string {
  try {
    const date = new Date(value * 1000);
    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    const gmt = `GMT${sign}${hh}:${mm}`;
    return `${date.toLocaleString()} ${gmt}`;
  } catch {
    return String(value);
  }
}

function getTokenStatus(payload: Record<string, unknown>): { label: string; color: string } | null {
  const exp = payload['exp'];
  if (typeof exp !== 'number') return null;
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    return { label: 'EXPIRED', color: 'text-red-400 bg-red-900/20 border-red-500/30' };
  }
  return { label: 'VALID', color: 'text-green-400 bg-green-900/20 border-green-500/30' };
}

const KNOWN_CLAIMS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expires At',
  nbf: 'Not Before',
  iat: 'Issued At',
  jti: 'JWT ID',
};

const TIME_CLAIMS = new Set(['exp', 'nbf', 'iat']);

interface Decoded {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightJson(json: string): string {
  const safe = escHtml(json);
  return safe.replace(
    /("(?:\\.|[^"\\])*")(\s*:)|("(?:\\.|[^"\\])*")|(true|false|null)|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|([{}[\]])/g,
    (_m, key, colon, strVal, bool, num, brace) => {
      if (key)    return `<span style="color:#93c5fd">${key}</span>${colon}`;
      if (strVal) return `<span style="color:#86efac">${strVal}</span>`;
      if (bool === 'true' || bool === 'false') return `<span style="color:#c4b5fd">${bool}</span>`;
      if (bool === 'null') return `<span style="color:#94a3b8">${bool}</span>`;
      if (num)    return `<span style="color:#fdba74">${num}</span>`;
      if (brace)  return `<span style="color:#cbd5e1">${brace}</span>`;
      return _m;
    }
  );
}

function JsonBlock({ data }: { data: Record<string, unknown> }) {
  const html = highlightJson(JSON.stringify(data, null, 2));
  return (
    <pre
      className="font-mono text-[12px] whitespace-pre-wrap leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Builds a payload object with timestamp claims annotated as comments in JSON. */
function buildAnnotatedPayload(payload: Record<string, unknown>): string {
  const lines = JSON.stringify(payload, null, 2).split('\n');
  return lines.map(line => {
    const match = line.match(/^(\s*"(\w+)":\s*)(-?\d+)(,?)$/);
    if (match) {
      const [, prefix, key, numStr, comma] = match;
      if (TIME_CLAIMS.has(key)) {
        const human = formatTimestamp(Number(numStr));
        return `${prefix}${numStr}${comma} // ${human}`;
      }
    }
    return line;
  }).join('\n');
}

function PayloadBlock({ payload }: { payload: Record<string, unknown> }) {
  const status = getTokenStatus(payload);
  const annotated = buildAnnotatedPayload(payload);

  // Highlight JSON parts, then colorize // comments separately
  const highlighted = highlightJson(annotated).replace(
    /(\/\/ [^<\n]+)/g,
    '<span style="color:#cbd5e1;font-style:italic">$1</span>'
  );

  return (
    <div className="space-y-3">
      {status && (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${status.color}`}>
          {status.label === 'VALID' ? <ShieldCheck size={11} /> : <AlertCircle size={11} />}
          {status.label}
        </div>
      )}
      <pre
        className="font-mono text-[12px] whitespace-pre-wrap leading-relaxed"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}

export default function JwtDecode() {
  const [input, setInput] = useState('');
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<'header' | 'payload' | 'signature'>('payload');

  const updateOutput = useCallback(() => {
    setError(null);
    setDecoded(null);

    const token = input.trim();
    if (!token) return;

    const parts = token.split('.');
    if (parts.length !== 3) {
      setError('Invalid JWT: expected 3 parts separated by "."');
      return;
    }

    try {
      const header = JSON.parse(base64UrlDecode(parts[0]));
      const payload = JSON.parse(base64UrlDecode(parts[1]));
      setDecoded({ header, payload, signature: parts[2] });
    } catch {
      setError('Failed to decode: token may be malformed or encrypted');
    }
  }, [input]);

  useEffect(() => { updateOutput(); }, [updateOutput]);

  const handleCopy = () => {
    if (!decoded) return;
    const out = { header: decoded.header, payload: decoded.payload, signature: decoded.signature };
    navigator.clipboard.writeText(JSON.stringify(out, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const SECTIONS = [
    { id: 'header' as const, label: 'Header' },
    { id: 'payload' as const, label: 'Payload' },
    { id: 'signature' as const, label: 'Signature' },
  ];

  const leftPanel = (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px] h-full">
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <Key size={14} className="text-slate-400" />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">JWT Token</span>
      </div>
      <textarea
        className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Paste your JWT token here…&#10;&#10;eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
        spellCheck={false}
      />
    </section>
  );

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[400px]">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                activeSection === s.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {decoded && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <Clock size={11} />
              <span className="font-mono">
                {decoded.header['alg'] as string ?? '—'}
              </span>
            </div>
          )}
          <button
            onClick={handleCopy}
            disabled={!decoded}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {decoded && (
          <>
            {activeSection === 'header' && <JsonBlock data={decoded.header} />}
            {activeSection === 'payload' && <PayloadBlock payload={decoded.payload as Record<string, unknown>} />}
            {activeSection === 'signature' && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Raw Signature (Base64url)</p>
                <p className="font-mono text-[12px] text-blue-100/80 break-all leading-relaxed">{decoded.signature}</p>
                <p className="text-[10px] text-slate-500 leading-relaxed pt-2">
                  The signature cannot be verified client-side without the secret key. It is displayed here for reference only.
                </p>
              </div>
            )}
          </>
        )}

        {!error && !decoded && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <Layers size={32} strokeWidth={1} />
            <p className="text-xs font-bold uppercase tracking-widest">Paste a token to decode</p>
          </div>
        )}
      </div>
    </section>
  );

  return <ResizableSplit left={leftPanel} right={rightPanel} storageKey="split:jwt-decode" />;
}
