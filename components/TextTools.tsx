import { useState, useMemo } from 'react';
import { Replace, Copy, Check, Layers, AlignLeft, Ticket } from 'lucide-react';
import ResizableSplit from './ResizableSplit';

// ── Types ─────────────────────────────────────────────────────────────────────

type TextTab = 'insights' | 'jira';

// ── Tab button ────────────────────────────────────────────────────────────────

const TAB_CLASSES = (active: boolean) =>
  `flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
    active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
  }`;

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

  // Log Insights state
  const [insightsInput, setInsightsInput] = useState('');
  const [insightsCopied, setInsightsCopied] = useState(false);

  const insightsOutput = useMemo(() => transformLogInsights(insightsInput), [insightsInput]);

  const copyInsights = () => {
    if (!insightsOutput) return;
    navigator.clipboard.writeText(insightsOutput);
    setInsightsCopied(true);
    setTimeout(() => setInsightsCopied(false), 2000);
  };

  // Jira Notes state
  const [jiraInput, setJiraInput] = useState('');
  const [jiraBaseUrl, setJiraBaseUrl] = useState('https://yourcompany.atlassian.net');
  const [jiraPrefix, setJiraPrefix] = useState('');
  const [jiraCopied, setJiraCopied] = useState(false);

  const jiraOutput = useMemo(
    () => transformJiraNotes(jiraInput, jiraBaseUrl, jiraPrefix),
    [jiraInput, jiraBaseUrl, jiraPrefix]
  );

  const copyJira = () => {
    if (!jiraOutput) return;
    navigator.clipboard.writeText(jiraOutput);
    setJiraCopied(true);
    setTimeout(() => setJiraCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm w-fit gap-0.5">
        <button onClick={() => setTab('insights')} className={TAB_CLASSES(tab === 'insights')}>
          <AlignLeft size={14} /> Log Insights
        </button>
        <button onClick={() => setTab('jira')} className={TAB_CLASSES(tab === 'jira')}>
          <Ticket size={14} /> Jira Notes
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
            <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
              <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={14} /> CloudWatch Insights Pattern
                </span>
                <button
                  onClick={copyInsights}
                  disabled={!insightsOutput}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {insightsCopied ? <Check size={12} /> : <Copy size={12} />}
                  {insightsCopied ? 'COPIED' : 'COPY RESULT'}
                </button>
              </div>
              <div className="flex-1 p-6 overflow-auto">
                <pre className="font-mono text-[13px] text-blue-100/90 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white">
                  {insightsOutput || '// Paste log group names on the left to generate the pattern...'}
                </pre>
              </div>
            </section>
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
            <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
              <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={14} /> Release Notes
                </span>
                <button
                  onClick={copyJira}
                  disabled={!jiraOutput}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {jiraCopied ? <Check size={12} /> : <Copy size={12} />}
                  {jiraCopied ? 'COPIED' : 'COPY RESULT'}
                </button>
              </div>
              <div className="flex-1 p-6 overflow-auto">
                <pre className="font-mono text-[13px] text-blue-100/90 whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white">
                  {jiraOutput || '// Paste ticket lines on the left to generate release notes...'}
                </pre>
              </div>
            </section>
          }
        />
      )}
    </div>
  );
}
