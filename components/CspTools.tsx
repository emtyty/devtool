import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Copy, Check, Shield, AlertTriangle, Info, ChevronRight, Sparkles, Merge, Terminal, Plus } from 'lucide-react';
import {
  evaluateCsp,
  Severity,
  severityLabel,
  type Finding,
  DIRECTIVE_DESCRIPTIONS,
  parseCsp,
} from '../utils/cspEvaluator';
import {
  parseConsoleViolations,
  generateSuggestions,
  buildUpdatedCsp,
  parseServiceTable,
  mergeServiceIntoCsp,
  type CspViolation,
  type DirectiveSuggestion,
  type CspTableEntry,
} from '../utils/cspUtils';

// ── Helpers ──────────────────────────────────────────────────────

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);
  return [copied, copy];
}

type Tab = 'analyzer' | 'issues' | 'builder';

const TABS: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'analyzer', label: 'Analyzer', icon: <Shield size={14} />, desc: 'Evaluate CSP header security' },
  { id: 'issues', label: 'Issues', icon: <Terminal size={14} />, desc: 'Parse console violations' },
  { id: 'builder', label: 'Builder', icon: <Merge size={14} />, desc: 'Merge domains into CSP' },
];

// ── Severity Styles ──────────────────────────────────────────────

function severityColor(s: Severity): { bg: string; text: string; border: string; dot: string } {
  if (s <= Severity.HIGH) return { bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-500/20', dot: 'bg-red-500' };
  if (s <= Severity.SYNTAX) return { bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/20', dot: 'bg-purple-500' };
  if (s <= Severity.MEDIUM) return { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/20', dot: 'bg-amber-500' };
  if (s <= Severity.HIGH_MAYBE) return { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-500/20', dot: 'bg-orange-500' };
  if (s <= Severity.STRICT_CSP) return { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-200 dark:border-sky-500/20', dot: 'bg-sky-500' };
  if (s <= Severity.MEDIUM_MAYBE) return { bg: 'bg-yellow-50 dark:bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-500/20', dot: 'bg-yellow-500' };
  return { bg: 'bg-slate-50 dark:bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200 dark:border-slate-500/20', dot: 'bg-slate-400' };
}

function severityBadge(s: Severity) {
  const c = severityColor(s);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${c.bg} ${c.text} ${c.border} border`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {severityLabel(s)}
    </span>
  );
}

// ── Score Badge ──────────────────────────────────────────────────

function ScoreGrade({ findings }: { findings: Finding[] }) {
  const high = findings.filter(f => f.severity <= Severity.HIGH).length;
  const medium = findings.filter(f => f.severity > Severity.HIGH && f.severity <= Severity.MEDIUM).length;
  const syntax = findings.filter(f => f.severity === Severity.SYNTAX).length;

  let grade: string;
  let gradeColor: string;
  let gradeBg: string;

  if (findings.length === 0) {
    grade = 'A+';
    gradeColor = 'text-emerald-600 dark:text-emerald-400';
    gradeBg = 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20';
  } else if (high === 0 && medium === 0 && syntax === 0) {
    grade = 'A';
    gradeColor = 'text-emerald-600 dark:text-emerald-400';
    gradeBg = 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20';
  } else if (high === 0 && medium <= 1) {
    grade = 'B';
    gradeColor = 'text-sky-600 dark:text-sky-400';
    gradeBg = 'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/20';
  } else if (high <= 1) {
    grade = 'C';
    gradeColor = 'text-amber-600 dark:text-amber-400';
    gradeBg = 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20';
  } else if (high <= 3) {
    grade = 'D';
    gradeColor = 'text-orange-600 dark:text-orange-400';
    gradeBg = 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20';
  } else {
    grade = 'F';
    gradeColor = 'text-red-600 dark:text-red-400';
    gradeBg = 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20';
  }

  return (
    <div className={`flex items-center gap-4 px-5 py-3 rounded-xl border ${gradeBg}`}>
      <span className={`text-3xl font-black ${gradeColor}`}>{grade}</span>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-3 text-[11px] font-bold">
          {high > 0 && <span className="text-red-600 dark:text-red-400">{high} High</span>}
          {medium > 0 && <span className="text-amber-600 dark:text-amber-400">{medium} Medium</span>}
          {syntax > 0 && <span className="text-purple-600 dark:text-purple-400">{syntax} Syntax</span>}
          {findings.length > 0 && (
            <span className="text-slate-400">{findings.length} total</span>
          )}
        </div>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {findings.length === 0 ? 'No issues found' : 'Review findings below'}
        </span>
      </div>
    </div>
  );
}

// ── Finding Card ─────────────────────────────────────────────────

function FindingCard({ finding }: { finding: Finding; key?: React.Key }) {
  const c = severityColor(finding.severity);
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-3 transition-all hover:shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {severityBadge(finding.severity)}
            <code className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              {finding.directive}
            </code>
          </div>
          <p className={`text-[12px] leading-relaxed ${c.text}`}>
            {finding.description}
          </p>
          {finding.value && (
            <code className="mt-1.5 inline-block text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded font-mono">
              {finding.value}
            </code>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Guide Tip ────────────────────────────────────────────────────

function GuideTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="-mt-2 rounded-lg overflow-hidden transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg transition-colors"
      >
        <Info size={12} className="text-slate-400 dark:text-slate-500 shrink-0" />
        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">How to get this data?</span>
        <ChevronRight size={10} className={`ml-auto text-slate-300 dark:text-slate-600 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0.5 text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Highlighted CSP Output ────────────────────────────────────────

function HighlightedCsp({ csp, newTokens }: { csp: string; newTokens: Set<string> }) {
  // Split CSP into tokens, highlight ones that match newTokens
  const parts = csp.split(/(\s+|;)/);
  return (
    <pre className="font-mono text-[12px] whitespace-pre-wrap break-all leading-relaxed">
      {parts.map((part, i) => {
        const trimmed = part.trim();
        if (newTokens.has(trimmed)) {
          return (
            <span key={i} className="text-emerald-400 bg-emerald-400/10 rounded px-0.5 font-bold">{part}</span>
          );
        }
        return <span key={i} className="text-blue-100/90">{part}</span>;
      })}
    </pre>
  );
}

// ── Directive Display ────────────────────────────────────────────

function DirectiveBlock({ name, values }: { name: string; values: string[]; key?: React.Key }) {
  const desc = DIRECTIVE_DESCRIPTIONS[name];
  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1">
        <code className="text-[12px] font-black text-blue-600 dark:text-blue-400">{name}</code>
        {desc && <span className="text-[10px] text-slate-400 dark:text-slate-500">{desc}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 ml-3">
        {values.map((v, i) => {
          const isKeyword = v.startsWith("'");
          const isWildcard = v.startsWith('*');
          return (
            <span
              key={i}
              className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono ${
                isKeyword
                  ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 font-bold'
                  : isWildcard
                    ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300'
              }`}
            >
              {v}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════

export default function CspTools({ initialData }: { initialData?: string | null }) {
  const [tab, setTab] = useState<Tab>('analyzer');

  // ── Analyzer State ─────────────────────────────────────────────
  const [analyzerInput, setAnalyzerInput] = useState('');
  const [analyzerFindings, setAnalyzerFindings] = useState<Finding[]>([]);
  const [analyzerParsed, setAnalyzerParsed] = useState<Record<string, string[]> | null>(null);
  const [analyzerDirty, setAnalyzerDirty] = useState(false);

  // ── Issues State ───────────────────────────────────────────────
  const [consoleInput, setConsoleInput] = useState('');
  const [issuesCspInput, setIssuesCspInput] = useState('');
  const [violations, setViolations] = useState<CspViolation[]>([]);
  const [suggestions, setSuggestions] = useState<DirectiveSuggestion[]>([]);
  const [updatedCsp, setUpdatedCsp] = useState<string | null>(null);
  const [issuesNewTokens, setIssuesNewTokens] = useState<Set<string>>(new Set());
  const [issuesWarnings, setIssuesWarnings] = useState<string[]>([]);

  // ── Builder State ──────────────────────────────────────────────
  const [builderCspInput, setBuilderCspInput] = useState('');
  const [builderTableInput, setBuilderTableInput] = useState('');
  const [builderResult, setBuilderResult] = useState<string | null>(null);
  const [builderNewTokens, setBuilderNewTokens] = useState<Set<string>>(new Set());
  const [builderEntries, setBuilderEntries] = useState<CspTableEntry[]>([]);
  const [builderWarnings, setBuilderWarnings] = useState<string[]>([]);
  const [builderAddedCount, setBuilderAddedCount] = useState(0);

  const [copied, copy] = useCopy();

  // Handle initialData
  useEffect(() => {
    if (initialData) {
      setAnalyzerInput(initialData);
      setAnalyzerDirty(true);
    }
  }, [initialData]);

  // ── Analyzer Logic ─────────────────────────────────────────────

  const runAnalyzer = useCallback(() => {
    if (!analyzerInput.trim()) {
      setAnalyzerFindings([]);
      setAnalyzerParsed(null);
      return;
    }
    const { csp, findings } = evaluateCsp(analyzerInput.trim());
    setAnalyzerFindings(findings);
    const directives: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(csp.directives)) {
      if (v) directives[k] = v;
    }
    setAnalyzerParsed(directives);
    setAnalyzerDirty(false);
  }, [analyzerInput]);

  useEffect(() => {
    if (analyzerDirty && analyzerInput.trim()) {
      const t = setTimeout(runAnalyzer, 400);
      return () => clearTimeout(t);
    }
  }, [analyzerDirty, analyzerInput, runAnalyzer]);

  // Group findings by severity, sorted high → low
  const groupedFindings = useMemo(() => {
    const map = new Map<number, { label: string; findings: Finding[] }>();
    for (const f of analyzerFindings) {
      if (!map.has(f.severity)) map.set(f.severity, { label: severityLabel(f.severity), findings: [] });
      map.get(f.severity)!.findings.push(f);
    }
    // Sort by severity value ascending (HIGH=10 first)
    return [...map.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
  }, [analyzerFindings]);

  // ── Issues Logic ───────────────────────────────────────────────

  const runIssuesParser = useCallback(() => {
    if (!consoleInput.trim()) {
      setViolations([]);
      setSuggestions([]);
      setUpdatedCsp(null);
      setIssuesWarnings([]);
      return;
    }

    const viols = parseConsoleViolations(consoleInput.trim());
    setViolations(viols);

    const suggs = generateSuggestions(viols);
    setSuggestions(suggs);

    if (issuesCspInput.trim() && suggs.length > 0) {
      const { csp, warnings, newTokens } = buildUpdatedCsp(issuesCspInput.trim(), suggs);
      setUpdatedCsp(csp);
      setIssuesNewTokens(newTokens);
      setIssuesWarnings(warnings);
    } else {
      setUpdatedCsp(null);
      setIssuesNewTokens(new Set());
      setIssuesWarnings([]);
    }
  }, [consoleInput, issuesCspInput]);

  // Auto-parse on input change
  useEffect(() => {
    if (consoleInput.trim()) {
      const t = setTimeout(runIssuesParser, 400);
      return () => clearTimeout(t);
    } else {
      setViolations([]);
      setSuggestions([]);
      setUpdatedCsp(null);
    }
  }, [consoleInput, issuesCspInput, runIssuesParser]);

  // ── Builder Logic ──────────────────────────────────────────────

  const runBuilder = useCallback(() => {
    if (!builderCspInput.trim() || !builderTableInput.trim()) {
      setBuilderResult(null);
      setBuilderEntries([]);
      setBuilderWarnings([]);
      setBuilderAddedCount(0);
      return;
    }

    const entries = parseServiceTable(builderTableInput.trim());
    setBuilderEntries(entries);

    if (entries.length > 0) {
      const { csp, warnings, addedCount, newTokens } = mergeServiceIntoCsp(
        builderCspInput.trim(),
        entries
      );
      setBuilderResult(csp);
      setBuilderNewTokens(newTokens);
      setBuilderWarnings(warnings);
      setBuilderAddedCount(addedCount);
    } else {
      setBuilderResult(null);
      setBuilderWarnings(['Could not parse the table. Expected tab-separated format: domain\\tdirective(s)\\tdescription']);
      setBuilderAddedCount(0);
    }
  }, [builderCspInput, builderTableInput]);

  useEffect(() => {
    if (builderCspInput.trim() && builderTableInput.trim()) {
      const t = setTimeout(runBuilder, 400);
      return () => clearTimeout(t);
    } else {
      setBuilderResult(null);
      setBuilderEntries([]);
    }
  }, [builderCspInput, builderTableInput, runBuilder]);

  // ── Share CSP between tabs ─────────────────────────────────────

  const sendCspToIssues = useCallback(() => {
    setIssuesCspInput(analyzerInput);
    setTab('issues');
  }, [analyzerInput]);

  const sendCspToBuilder = useCallback(() => {
    setBuilderCspInput(analyzerInput);
    setTab('builder');
  }, [analyzerInput]);

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight">CSP Tools</h2>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.15em]">Content Security Policy Toolkit</p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
              tab === t.id
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            <span className={`hidden sm:inline text-[10px] ${tab === t.id ? 'text-slate-400 dark:text-slate-500' : 'text-slate-400 dark:text-slate-600'}`}>
              {t.desc}
            </span>
          </button>
        ))}
      </div>

      {/* ═══ TAB 1: ANALYZER ═══ */}
      {tab === 'analyzer' && (
        <div className="space-y-4">
          {/* Input */}
          <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-emerald-500" />
                <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">CSP Header</span>
              </div>
              <div className="flex items-center gap-2">
                {analyzerInput.trim() && (
                  <>
                    <button
                      onClick={sendCspToIssues}
                      className="text-[10px] font-bold text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer"
                    >
                      Use in Issues →
                    </button>
                    <button
                      onClick={sendCspToBuilder}
                      className="text-[10px] font-bold text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer"
                    >
                      Use in Builder →
                    </button>
                  </>
                )}
                <button
                  onClick={runAnalyzer}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow cursor-pointer"
                >
                  <Sparkles size={10} />
                  ANALYZE
                </button>
              </div>
            </div>
            <textarea
              value={analyzerInput}
              onChange={(e) => { setAnalyzerInput(e.target.value); setAnalyzerDirty(true); }}
              placeholder="Paste your Content-Security-Policy header value here...&#10;&#10;Example: default-src 'self'; script-src 'self' 'unsafe-inline' *.example.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: *.cdn.com"
              className="w-full h-32 px-5 py-4 resize-none focus:outline-none font-mono text-[13px] text-slate-800 dark:text-slate-200 bg-transparent placeholder:text-slate-300 dark:placeholder:text-slate-600"
              spellCheck={false}
            />
          </div>

          {!analyzerParsed && (
            <GuideTip>
              <p>Open your website in the browser, then:</p>
              <p><strong>Chrome:</strong> DevTools (F12) → Network tab → reload the page → click on the main document request → Headers tab → look for <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">content-security-policy</code> in Response Headers.</p>
              <p><strong>Firefox:</strong> DevTools (F12) → Network tab → reload → click the main request → Headers → find the CSP header.</p>
              <p><strong>curl:</strong> <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">curl -sI https://yoursite.com | grep -i content-security-policy</code></p>
              <p>You can also check your site's <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">&lt;meta http-equiv="Content-Security-Policy"&gt;</code> tag in the HTML source.</p>
            </GuideTip>
          )}

          {/* Results */}
          {analyzerParsed && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Score */}
              <ScoreGrade findings={analyzerFindings} />

              {/* Parsed Directives */}
              <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50">
                  <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Parsed Directives</span>
                  <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500">{Object.keys(analyzerParsed).length} directives</span>
                </div>
                <div className="p-5 space-y-3">
                  {Object.entries(analyzerParsed).map(([name, values]) => (
                    <DirectiveBlock key={name} name={name} values={values as string[]} />
                  ))}
                </div>
              </div>

              {/* Findings */}
              {analyzerFindings.length > 0 && (
                <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50">
                    <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Findings</span>
                    <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500">{analyzerFindings.length} issues</span>
                  </div>
                  <div className="p-4 space-y-4">
                    {groupedFindings.map((group, gi) => (
                      <div key={gi} className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">{group.label} ({group.findings.length})</h4>
                        {group.findings.map((f, i) => (
                          <FindingCard key={i} finding={f} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analyzerFindings.length === 0 && (
                <div className="text-center py-8 text-emerald-500">
                  <Check size={32} className="mx-auto mb-2" />
                  <p className="text-sm font-bold">No security issues found!</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Your CSP looks well-configured.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 2: ISSUES ═══ */}
      {tab === 'issues' && (
        <div className="space-y-4">
          {/* Console Input */}
          <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-orange-500" />
                <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Console Output</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Paste CSP violation logs from Chrome, Firefox, or Safari</span>
            </div>
            <textarea
              value={consoleInput}
              onChange={(e) => setConsoleInput(e.target.value)}
              placeholder={'Paste browser console logs with CSP violations here...\n\nExample:\nLoading the script \'https://example.com/script.js\' violates the following Content Security Policy directive: "script-src \'self\' \'unsafe-inline\'"'}
              className="w-full h-36 px-5 py-4 resize-none focus:outline-none font-mono text-[12px] text-slate-800 dark:text-slate-200 bg-transparent placeholder:text-slate-300 dark:placeholder:text-slate-600"
              spellCheck={false}
            />
          </div>

          {violations.length === 0 && !consoleInput.trim() && (
            <GuideTip>
              <p>Open your website in the browser, then:</p>
              <p><strong>Chrome/Edge:</strong> DevTools (F12) → Console tab → look for red/yellow messages containing "violates the following Content Security Policy directive".</p>
              <p><strong>Firefox:</strong> DevTools (F12) → Console tab → look for "Content-Security-Policy" messages. You may need to enable CSS/network warnings in the console filter.</p>
              <p><strong>Tip:</strong> Select all console output (Ctrl+A) and paste it here. Non-CSP messages are automatically ignored.</p>
            </GuideTip>
          )}

          {/* Optional: Current CSP */}
          <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-blue-500" />
                <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current CSP</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">(optional — for full header suggestion)</span>
              </div>
            </div>
            <textarea
              value={issuesCspInput}
              onChange={(e) => setIssuesCspInput(e.target.value)}
              placeholder="Paste your current CSP header here to get the full updated CSP..."
              className="w-full h-20 px-5 py-3 resize-none focus:outline-none font-mono text-[12px] text-slate-800 dark:text-slate-200 bg-transparent placeholder:text-slate-300 dark:placeholder:text-slate-600"
              spellCheck={false}
            />
          </div>

          {!issuesCspInput.trim() && (
            <GuideTip>
              <p>Open your website in the browser, then:</p>
              <p><strong>Chrome:</strong> DevTools (F12) → Network tab → reload the page → click on the main document request → Headers tab → look for <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">content-security-policy</code> in Response Headers.</p>
              <p><strong>curl:</strong> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">curl -sI https://yoursite.com | grep -i content-security-policy</code></p>
              <p><strong>Tip:</strong> You can also paste a CSP in the Analyzer tab first, then click "Use in Issues →" to send it here.</p>
            </GuideTip>
          )}

          {/* Results */}
          {violations.length > 0 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Violations Summary */}
              <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Violations Found</span>
                    <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500">{violations.length} blocked resources</span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {violations.map((v, i) => (
                    <div key={i} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                        v.resourceType === 'script' ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400' :
                        v.resourceType === 'image' ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400' :
                        v.resourceType === 'style' ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400' :
                        v.resourceType === 'font' ? 'bg-pink-100 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400' :
                        v.resourceType === 'connect' ? 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' :
                        'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}>
                        {v.resourceType}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate block">{v.blockedDomain}</code>
                          <ChevronRight size={10} className="text-slate-300 dark:text-slate-600 shrink-0" />
                          <code className="text-[11px] font-bold text-blue-600 dark:text-blue-400 shrink-0">{v.directive}</code>
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{v.resourceUrl}</div>
                        {v.fallbackNote && (
                          <div className="text-[10px] text-amber-500 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                            <Info size={10} /> {v.fallbackNote}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50">
                    <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Suggested Updates</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {suggestions.map((s, i) => (
                      <div key={i} className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Plus size={12} className="text-emerald-600 dark:text-emerald-400" />
                          <code className="text-[12px] font-black text-emerald-700 dark:text-emerald-400">{s.directive}</code>
                        </div>
                        <div className="flex flex-wrap gap-1.5 ml-5">
                          {s.domainsToAdd.map((d, j) => (
                            <span key={j} className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono">
                              {d}
                            </span>
                          ))}
                        </div>
                        {s.warnings.length > 0 && (
                          <div className="mt-2 ml-5 space-y-1">
                            {s.warnings.map((w, j) => (
                              <div key={j} className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <AlertTriangle size={10} /> {w}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Updated CSP */}
              {updatedCsp && (
                <div className="bg-slate-900 dark:bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                  <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Updated CSP Header</span>
                    <button
                      onClick={() => copy(updatedCsp)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow cursor-pointer"
                    >
                      {copied ? <Check size={10} /> : <Copy size={10} />}
                      {copied ? 'COPIED' : 'COPY'}
                    </button>
                  </div>
                  <div className="p-5">
                    <HighlightedCsp csp={updatedCsp} newTokens={issuesNewTokens} />
                  </div>
                  {issuesWarnings.length > 0 && (
                    <div className="px-5 pb-4 space-y-1">
                      {issuesWarnings.map((w, i) => (
                        <div key={i} className="text-[10px] text-amber-400 flex items-center gap-1">
                          <AlertTriangle size={10} /> {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {consoleInput.trim() && violations.length === 0 && (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500">
              <Terminal size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-bold">No CSP violations detected</p>
              <p className="text-[11px] mt-1">Make sure the console output contains CSP violation messages</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB 3: BUILDER ═══ */}
      {tab === 'builder' && (
        <div className="space-y-4">
          {/* Current CSP */}
          <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50 flex items-center gap-2">
              <Shield size={14} className="text-blue-500" />
              <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current CSP Header</span>
            </div>
            <textarea
              value={builderCspInput}
              onChange={(e) => setBuilderCspInput(e.target.value)}
              placeholder="Paste your current Content-Security-Policy header here..."
              className="w-full h-24 px-5 py-3 resize-none focus:outline-none font-mono text-[12px] text-slate-800 dark:text-slate-200 bg-transparent placeholder:text-slate-300 dark:placeholder:text-slate-600"
              spellCheck={false}
            />
          </div>

          {!builderCspInput.trim() && (
            <GuideTip>
              <p>Open your website in the browser, then:</p>
              <p><strong>Chrome:</strong> DevTools (F12) → Network tab → reload the page → click on the main document request → Headers tab → look for <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">content-security-policy</code> in Response Headers.</p>
              <p><strong>curl:</strong> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">curl -sI https://yoursite.com | grep -i content-security-policy</code></p>
              <p><strong>Tip:</strong> You can also paste a CSP in the Analyzer tab first, then click "Use in Builder →" to send it here.</p>
            </GuideTip>
          )}

          {/* Service Table */}
          <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Merge size={14} className="text-violet-500" />
                <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Domains to Add</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Tab, multi-space, or space separated</span>
            </div>
            <textarea
              value={builderTableInput}
              onChange={(e) => setBuilderTableInput(e.target.value)}
              placeholder={'Paste a table of domains and their CSP directives:\n\n*.example.com  script-src, connect-src  Example Service\ncdn.example.com  img-src, style-src  CDN Assets\n*.analytics.com  script-src  Analytics'}
              className="w-full h-40 px-5 py-3 resize-none focus:outline-none font-mono text-[12px] text-slate-800 dark:text-slate-200 bg-transparent placeholder:text-slate-300 dark:placeholder:text-slate-600"
              spellCheck={false}
            />
          </div>

          {builderEntries.length === 0 && !builderTableInput.trim() && (
            <GuideTip>
              <p>Third-party services often document their CSP requirements. You can paste them in any format:</p>
              <p><strong>Table format:</strong> Copy a table with domains and directives from the service's docs — any column order works.</p>
              <p><strong>CSP snippet:</strong> Paste a CSP policy snippet directly, e.g. <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">script-src https://*.example.com; connect-src https://api.example.com;</code></p>
              <p><strong>Example:</strong> See <a href="https://knowledge.hubspot.com/domains-and-urls/ssl-and-domain-security-in-hubspot#content-security-policy" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline">HubSpot's CSP table</a> — just copy the table and paste it here. Intercom, Segment, ProductFruits, Mintlify, and others publish similar docs.</p>
            </GuideTip>
          )}

          {/* Parsed Entries Preview */}
          {builderEntries.length > 0 && (
            <div className="bg-white dark:bg-[#131c2e] rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700/50">
                <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Parsed Entries</span>
                <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500">{builderEntries.length} entries, {builderAddedCount} new additions</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-800/20">
                      <th className="px-5 py-2">Directive</th>
                      <th className="px-5 py-2">Values</th>
                      <th className="px-5 py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {builderEntries.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-5 py-2">
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                            {e.directive}
                          </span>
                        </td>
                        <td className="px-5 py-2">
                          <div className="flex flex-wrap gap-1">
                            {e.values.map((v, j) => (
                              <span key={j} className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                v.startsWith("'") ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 font-bold' :
                                v.endsWith(':') ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                                v.startsWith('wss:') || v.startsWith('ws:') ? 'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' :
                                'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300'
                              }`}>
                                {v}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-2 text-slate-400 dark:text-slate-500">{e.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {builderResult && (
            <div className="bg-slate-900 dark:bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Merged CSP Header</span>
                <button
                  onClick={() => copy(builderResult)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow cursor-pointer"
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />}
                  {copied ? 'COPIED' : 'COPY'}
                </button>
              </div>
              <div className="p-5">
                <HighlightedCsp csp={builderResult} newTokens={builderNewTokens} />
              </div>
              {builderWarnings.length > 0 && (
                <div className="px-5 pb-4 space-y-1">
                  {builderWarnings.map((w, i) => (
                    <div key={i} className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle size={10} /> {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
