import React, { useState, useMemo, useCallback } from 'react';
import { Copy, Check, Layers, AlignLeft, Ticket, Binary, Link } from 'lucide-react';
import ResizableSplit from './ResizableSplit';

// ── Types ─────────────────────────────────────────────────────────────────────

type TextTab = 'base64' | 'url' | 'insights' | 'jira';

// ── Tab button ────────────────────────────────────────────────────────────────

const TAB_CLASSES = (active: boolean) =>
  `flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
    active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
  }`;

// ── Copy helper ──────────────────────────────────────────────────────────────

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);
  return [copied, copy];
}

function CopyBtn({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: (t: string) => void }) {
  return (
    <button
      onClick={() => onCopy(text)}
      disabled={!text}
      className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'COPIED' : 'COPY'}
    </button>
  );
}

// ── Reusable dark output panel ───────────────────────────────────────────────

function OutputPanel({ label, icon, text, copied, onCopy }: {
  label: string; icon: React.ReactNode; text: string; copied: boolean; onCopy: (t: string) => void;
}) {
  return (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
          {icon} {label}
        </span>
        <CopyBtn text={text} copied={copied} onCopy={onCopy} />
      </div>
      <div className="flex-1 p-6 overflow-auto">
        <pre className="font-mono text-[13px] text-blue-100/90 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white">
          {text || `// Output will appear here...`}
        </pre>
      </div>
    </section>
  );
}

// ── Base64 ───────────────────────────────────────────────────────────────────

function base64Encode(input: string): string {
  try { return btoa(unescape(encodeURIComponent(input))); }
  catch { return '⚠ Failed to encode'; }
}

function base64Decode(input: string): string {
  try { return decodeURIComponent(escape(atob(input.trim()))); }
  catch { return '⚠ Invalid Base64 string'; }
}

// ── URL Encode/Decode ────────────────────────────────────────────────────────

function urlEncodeFn(input: string): string {
  try { return encodeURIComponent(input); }
  catch { return '⚠ Failed to encode'; }
}

function urlDecodeFn(input: string): string {
  try { return decodeURIComponent(input.trim()); }
  catch { return '⚠ Invalid URL-encoded string'; }
}

// ── Log Insights transform ────────────────────────────────────────────────────

const INSIGHTS_EXAMPLE = `/aws/lambda/my-function
/aws/apigateway/my-api-service
/aws/rds/production-db-instance
/ecs/my-app-cluster`;

function transformLogInsights(input: string): string {
  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  return lines.map(l => l.replace(/-/g, '\\-')).join('|');
}

// ── Jira Notes transform ──────────────────────────────────────────────────────

const JIRA_EXAMPLE = `LH-101 Fix login button not working on mobile devices
LH-205 Add dark mode support to user dashboard
LH-318 Update user profile page layout and styling
LH-422 Resolve race condition in payment processing`;

const JIRA_EXAMPLE_URL = 'https://yourcompany.atlassian.net';

function transformJiraNotes(input: string, baseUrl: string, prefix: string): string {
  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  const escapedPrefix = prefix.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const pattern = prefix
    ? new RegExp(`^(${escapedPrefix}-\\d+)\\s+(.+)$`)
    : /^([A-Z]+-\d+)\s+(.+)$/;

  const url = baseUrl.replace(/\/$/, '');
  return lines.map(line => {
    const match = line.match(pattern);
    if (!match) return line;
    const [, ticket, title] = match;
    return `${title} (${url}/browse/${ticket})`;
  }).join('\n');
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TextTools() {
  const [tab, setTab] = useState<TextTab>('insights');

  // ── Base64 state ──
  const [b64Input, setB64Input] = useState('');
  const [b64Mode, setB64Mode] = useState<'encode' | 'decode'>('encode');
  const [b64Copied, copyB64] = useCopy();
  const b64Output = useMemo(
    () => b64Input ? (b64Mode === 'encode' ? base64Encode(b64Input) : base64Decode(b64Input)) : '',
    [b64Input, b64Mode]
  );

  // ── URL Encode state ──
  const [urlInput, setUrlInput] = useState('');
  const [urlMode, setUrlMode] = useState<'encode' | 'decode'>('encode');
  const [urlCopied, copyUrl] = useCopy();
  const urlOutput = useMemo(
    () => urlInput ? (urlMode === 'encode' ? urlEncodeFn(urlInput) : urlDecodeFn(urlInput)) : '',
    [urlInput, urlMode]
  );

  // ── Log Insights state ──
  const [insightsInput, setInsightsInput] = useState('');
  const [insightsCopied, copyInsights] = useCopy();
  const insightsOutput = useMemo(() => transformLogInsights(insightsInput), [insightsInput]);

  // ── Jira Notes state ──
  const [jiraInput, setJiraInput] = useState('');
  const [jiraBaseUrl, setJiraBaseUrl] = useState('https://yourcompany.atlassian.net');
  const [jiraPrefix, setJiraPrefix] = useState('');
  const [jiraCopied, copyJira] = useCopy();
  const jiraOutput = useMemo(
    () => transformJiraNotes(jiraInput, jiraBaseUrl, jiraPrefix),
    [jiraInput, jiraBaseUrl, jiraPrefix]
  );

  // ── Shared mode toggle ──
  const ModeToggle = ({ mode, onToggle }: { mode: 'encode' | 'decode'; onToggle: (m: 'encode' | 'decode') => void }) => (
    <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-lg gap-0.5">
      {(['encode', 'decode'] as const).map(m => (
        <button key={m} onClick={() => onToggle(m)}
          className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${
            mode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
          }`}
        >{m}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex flex-wrap bg-white border border-slate-200 p-1 rounded-xl shadow-sm w-fit gap-0.5">
        <button onClick={() => setTab('insights')} className={TAB_CLASSES(tab === 'insights')}>
          <AlignLeft size={14} /> Log Insights
        </button>
        <button onClick={() => setTab('jira')} className={TAB_CLASSES(tab === 'jira')}>
          <Ticket size={14} /> Jira Notes
        </button>
        <button onClick={() => setTab('base64')} className={TAB_CLASSES(tab === 'base64')}>
          <Binary size={14} /> Base64
        </button>
        <button onClick={() => setTab('url')} className={TAB_CLASSES(tab === 'url')}>
          <Link size={14} /> URL Encode
        </button>
      </div>

      {/* ── LOG INSIGHTS TAB ── */}
      {tab === 'insights' && (
        <ResizableSplit
          storageKey="split:text-insights"
          left={
            <div className="flex flex-col gap-6 h-full">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <AlignLeft size={14} /> Log Group Names
                  </span>
                  <button
                    onClick={() => setInsightsInput(INSIGHTS_EXAMPLE)}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
                  >
                    Load Example
                  </button>
                </div>
                <textarea
                  className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
                  value={insightsInput}
                  onChange={e => setInsightsInput(e.target.value)}
                  placeholder={'/aws/lambda/my-function\n/aws/apigateway/my-api\n/aws/rds/my-db'}
                />
              </section>

              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">How it works</p>
                <ul className="text-xs text-slate-500 leading-relaxed space-y-1.5">
                  <li>• Joins each log group name with <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">|</code> (pipe)</li>
                  <li>• Escapes hyphens <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">-</code> to <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">\-</code> for CloudWatch Insights regex syntax</li>
                  <li>• Use the result in a CloudWatch Insights <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">filter @logStream like</code> query</li>
                </ul>
              </section>
            </div>
          }
          right={
            <OutputPanel label="CloudWatch Insights Pattern" icon={<Layers size={14} />} text={insightsOutput} copied={insightsCopied} onCopy={copyInsights} />
          }
        />
      )}

      {/* ── JIRA NOTES TAB ── */}
      {tab === 'jira' && (
        <ResizableSplit
          storageKey="split:text-jira"
          left={
            <div className="flex flex-col gap-6 h-full">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Ticket size={14} /> Ticket Lines
                  </span>
                  <button
                    onClick={() => {
                      setJiraInput(JIRA_EXAMPLE);
                      setJiraBaseUrl(JIRA_EXAMPLE_URL);
                      setJiraPrefix('LH');
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
                  >
                    Load Example
                  </button>
                </div>
                <textarea
                  className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
                  value={jiraInput}
                  onChange={e => setJiraInput(e.target.value)}
                  placeholder={'PROJ-123 Fix login button\nPROJ-456 Add dark mode\nPROJ-789 Update profile page'}
                />
              </section>

              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                    Jira Base URL
                  </label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    value={jiraBaseUrl}
                    onChange={e => setJiraBaseUrl(e.target.value)}
                    placeholder="https://yourcompany.atlassian.net"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                    Ticket Prefix <span className="text-slate-300 font-medium normal-case">(leave blank to auto-detect)</span>
                  </label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                    value={jiraPrefix}
                    onChange={e => setJiraPrefix(e.target.value.toUpperCase())}
                    placeholder="e.g. LH, PROJ, MYAPP"
                  />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Converts <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">TICKET-123 Title</code> lines to <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">Title (url/browse/TICKET-123)</code> for release notes.
                </p>
              </section>
            </div>
          }
          right={
            <OutputPanel label="Release Notes" icon={<Layers size={14} />} text={jiraOutput} copied={jiraCopied} onCopy={copyJira} />
          }
        />
      )}

      {/* ── BASE64 TAB ── */}
      {tab === 'base64' && (
        <ResizableSplit
          storageKey="split:text-base64"
          left={
            <div className="flex flex-col gap-6 h-full">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Binary size={14} /> Input
                  </span>
                  <ModeToggle mode={b64Mode} onToggle={setB64Mode} />
                </div>
                <textarea
                  className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
                  value={b64Input}
                  onChange={e => setB64Input(e.target.value)}
                  placeholder={b64Mode === 'encode' ? 'Type or paste text to encode...' : 'Paste Base64 string to decode...'}
                />
              </section>
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">Info</p>
                <ul className="text-xs text-slate-500 leading-relaxed space-y-1.5">
                  <li>• Full UTF-8 support (emoji, CJK, diacritics)</li>
                  <li>• {b64Mode === 'encode' ? 'Encodes text → Base64 string' : 'Decodes Base64 → original text'}</li>
                  <li>• 100% local — nothing leaves your browser</li>
                </ul>
              </section>
            </div>
          }
          right={
            <OutputPanel label="Output" icon={<Layers size={14} />} text={b64Output} copied={b64Copied} onCopy={copyB64} />
          }
        />
      )}

      {/* ── URL ENCODE TAB ── */}
      {tab === 'url' && (
        <ResizableSplit
          storageKey="split:text-url"
          left={
            <div className="flex flex-col gap-6 h-full">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Link size={14} /> Input
                  </span>
                  <ModeToggle mode={urlMode} onToggle={setUrlMode} />
                </div>
                <textarea
                  className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder={urlMode === 'encode' ? 'hello world & foo=bar' : 'hello%20world%20%26%20foo%3Dbar'}
                />
              </section>
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">Info</p>
                <ul className="text-xs text-slate-500 leading-relaxed space-y-1.5">
                  <li>• Uses <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">encodeURIComponent</code> / <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">decodeURIComponent</code></li>
                  <li>• Encodes all special characters including <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono">& = ? / # @</code></li>
                  <li>• Useful for query params, form data, API calls</li>
                </ul>
              </section>
            </div>
          }
          right={
            <OutputPanel label="Output" icon={<Layers size={14} />} text={urlOutput} copied={urlCopied} onCopy={copyUrl} />
          }
        />
      )}
    </div>
  );
}
