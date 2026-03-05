import { useState, useRef } from 'react';
import * as qp from 'html-query-plan';
import 'html-query-plan/css/qp.css';
import { FileCode2, Play, AlertTriangle, Sparkles, SplitSquareHorizontal, Key, Eye, EyeOff, X, Check } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { SQLPlanAnalyzer } from '../lib/SQLPlanAnalyzer';
import type { PlanSummary } from '../types';
import CopyButton from './CopyButton';

const AI_MODEL = 'gemini-2.5-pro-preview-06-05';
const LS_KEY = 'devtoolkit_gemini_key';

const COMPARE_SYSTEM_PROMPT = `You are a Performance Tuning Expert. You will receive a JSON payload containing 'Before' and 'After' metrics of a SQL Execution Plan.

Compare the total subtree cost and memory grants.

Validate if the 'After' plan successfully resolved the 'Before' bottlenecks (e.g., did a Scan become a Seek?).

Identify any new regressions introduced by the change.

Conclude with a final recommendation on whether to deploy this change to production.`;

const SINGLE_SYSTEM_PROMPT = `You will receive a pruned XML SQL Execution Plan. Namespaces and low-cost metadata have been removed for token efficiency. Focus your analysis on nodes with high EstimatedTotalSubtreeCost and any present <Warnings> or <MissingIndexes> blocks. If a node is empty, assume it is a standard low-cost operator`;

// --- Gemini Key Modal ---

function GeminiKeyModal({
  current,
  onSave,
  onClose,
}: {
  current: string;
  onSave: (key: string, remember: boolean) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(current);
  const [remember, setRemember] = useState(!!localStorage.getItem(LS_KEY));
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    onSave(value.trim(), remember);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6 flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <Key size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Gemini API Key</h2>
              <p className="text-xs text-slate-500">Used locally — never sent anywhere else</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Input */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 pr-10 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="AIza..."
              value={value}
              onChange={e => setValue(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {/* Remember toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            className={`w-10 h-5 rounded-full relative transition-all ${remember ? 'bg-blue-600' : 'bg-slate-200'}`}
            onClick={() => setRemember(r => !r)}
          >
            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow transition-all ${remember ? 'left-6' : 'left-1'}`} />
          </div>
          <span className="text-xs font-semibold text-slate-600">Remember key (saved in browser storage)</span>
        </label>

        {/* Info */}
        <p className="text-xs text-slate-400 leading-relaxed bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
          Your key is stored only in this browser's <code className="font-mono">localStorage</code>. It is never transmitted to any server — all AI calls go directly from your browser to the Gemini API.
        </p>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Check size={14} /> Save Key
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---

export default function QueryPlanViewer() {
  const [xmlInput, setXmlInput] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [beforeXml, setBeforeXml] = useState('');
  const [afterXml, setAfterXml] = useState('');
  const [compareAnalysis, setCompareAnalysis] = useState<string | null>(null);
  const [isCompareAnalyzing, setIsCompareAnalyzing] = useState(false);
  const [singleAnalysis, setSingleAnalysis] = useState<string | null>(null);
  const [isSingleAnalyzing, setIsSingleAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRendered, setHasRendered] = useState(false);
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem(LS_KEY) || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSaveKey = (key: string, remember: boolean) => {
    setGeminiKey(key);
    if (remember && key) {
      localStorage.setItem(LS_KEY, key);
    } else {
      localStorage.removeItem(LS_KEY);
    }
  };

  const createAiClient = () => {
    if (!geminiKey) throw new Error('No Gemini API key set. Click the key icon to add one.');
    return new GoogleGenAI({ apiKey: geminiKey });
  };

  const handleSingleAnalyze = async () => {
    if (!xmlInput.trim()) {
      setError('Execution plan XML is required for analysis.');
      return;
    }
    setError(null);
    setIsSingleAnalyzing(true);
    setSingleAnalysis(null);

    try {
      const response = await createAiClient().models.generateContent({
        model: AI_MODEL,
        contents: SQLPlanAnalyzer.pruneExecutionPlan(xmlInput),
        config: { systemInstruction: SINGLE_SYSTEM_PROMPT },
      });
      setSingleAnalysis(response.text || 'No analysis generated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to analyze plan.');
    } finally {
      setIsSingleAnalyzing(false);
    }
  };

  const handleCompareAnalyze = async () => {
    if (!beforeXml.trim() || !afterXml.trim()) {
      setError('Both Before and After XML plans are required for comparison.');
      return;
    }
    setError(null);
    setIsCompareAnalyzing(true);
    setCompareAnalysis(null);

    try {
      const payload = SQLPlanAnalyzer.generateAIPayload(beforeXml, afterXml);
      const response = await createAiClient().models.generateContent({
        model: AI_MODEL,
        contents: JSON.stringify(payload),
        config: { systemInstruction: COMPARE_SYSTEM_PROMPT },
      });
      setCompareAnalysis(response.text || 'No analysis generated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to analyze plans.');
    } finally {
      setIsCompareAnalyzing(false);
    }
  };

  const handleRender = () => {
    if (!containerRef.current) return;

    setError(null);
    containerRef.current.innerHTML = '';
    setHasRendered(false);
    setSummary(null);

    if (!xmlInput.trim()) return;

    try {
      const xmlToRender = xmlInput
        .replace(/(<\s*)(?:\w+:)?ShowPlanXML([^>]*?)>/i, (_, p1, p2) => {
          const cleanedTag = p2.replace(/\s+xmlns(:\w+)?=(['"])[^\2]*?\2/gi, '');
          return p1 + 'ShowPlanXML' + cleanedTag + ' xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan">';
        })
        .replace(/<\/\s*(?:\w+:)?ShowPlanXML\s*>/i, '</ShowPlanXML>');

      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlToRender, 'text/xml');

      if (doc.getElementsByTagName('parsererror').length > 0) {
        const errorText = doc.getElementsByTagName('parsererror')[0].textContent || 'Unknown syntax error';
        throw new Error(`Invalid XML format: ${errorText}`);
      }

      const showPlanElements = doc.getElementsByTagNameNS('*', 'ShowPlanXML');
      const rootElements = showPlanElements.length === 0 ? doc.getElementsByTagName('ShowPlanXML') : showPlanElements;
      if (rootElements.length === 0) {
        throw new Error('Missing <ShowPlanXML> root element. This does not appear to be a valid SQL execution plan.');
      }

      const renderFn = qp.showPlan || (qp as any).default?.showPlan;
      if (!renderFn) throw new Error('showPlan function not found in html-query-plan module');

      renderFn(containerRef.current, xmlToRender, { jsTooltips: false });

      if (!containerRef.current.querySelector('.qp-root')) {
        throw new Error('Rendered plan is empty. The XML might be structurally invalid for a SQL Execution Plan.');
      }

      setHasRendered(true);
      setSummary(SQLPlanAnalyzer.extractSummary(xmlToRender));
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : 'Failed to parse or render the execution plan XML.';
      if (message.includes('getBoundingClientRect') || message.includes('root is null')) {
        message = 'The provided XML is not a valid SQL execution plan or is missing required elements.';
      }
      setError(message);
      setSummary(null);
    }
  };

  return (
    <>
      {showKeyModal && (
        <GeminiKeyModal
          current={geminiKey}
          onSave={handleSaveKey}
          onClose={() => setShowKeyModal(false)}
        />
      )}

      <div className="flex flex-col gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <FileCode2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">SQL Execution Plan Viewer</h2>
              <p className="text-[10px] text-slate-500">Analyze and compare Microsoft SQL Server Execution Plans</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowKeyModal(true)}
              title={geminiKey ? 'Gemini key configured — click to change' : 'Set Gemini API key for AI analysis'}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                geminiKey
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Key size={15} />
              {geminiKey ? 'Key Set' : 'Set API Key'}
            </button>
            <button
              onClick={() => { setCompareMode(!compareMode); setError(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                compareMode ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <SplitSquareHorizontal size={18} />
              {compareMode ? 'Single Plan Mode' : 'Compare Plans'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {!compareMode ? (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor="xml-input" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Execution Plan XML
                </label>
                <textarea
                  id="xml-input"
                  className="w-full h-48 p-4 border border-slate-300 rounded-xl font-mono text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder='<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan"...'
                  value={xmlInput}
                  onChange={(e) => setXmlInput(e.target.value)}
                />
                <div className="flex justify-between items-center mt-2">
                  {error ? <span className="text-sm text-red-500 font-medium">{error}</span> : <span />}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSingleAnalyze}
                      disabled={isSingleAnalyzing || !xmlInput.trim() || !geminiKey}
                      title={!geminiKey ? 'Set a Gemini API key first' : undefined}
                      className="flex items-center gap-2 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                    >
                      <Sparkles size={18} />
                      {isSingleAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
                    </button>
                    <button
                      onClick={handleRender}
                      disabled={!xmlInput.trim()}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                    >
                      <Play size={18} />
                      Render Plan
                    </button>
                  </div>
                </div>
              </div>

              {singleAnalysis && <AiAnalysisPanel analysis={singleAnalysis} />}

              <div className="flex-1 flex flex-col gap-2 min-h-[400px]">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rendered Plan</h2>
                <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                  <div className="flex-1 overflow-hidden p-4 bg-white">
                    <div ref={containerRef} className="w-full" />
                    {!hasRendered && (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                        No plan rendered yet. Paste XML and click Render.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {summary && <PlanSummaryPanel summary={summary} />}
            </>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label htmlFor="before-xml" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Before Plan XML</label>
                  <textarea
                    id="before-xml"
                    className="w-full h-64 p-4 border border-slate-300 rounded-xl font-mono text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="Paste the original execution plan XML..."
                    value={beforeXml}
                    onChange={(e) => setBeforeXml(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="after-xml" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">After Plan XML</label>
                  <textarea
                    id="after-xml"
                    className="w-full h-64 p-4 border border-slate-300 rounded-xl font-mono text-sm resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="Paste the optimized execution plan XML..."
                    value={afterXml}
                    onChange={(e) => setAfterXml(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-between items-center">
                {error ? <span className="text-sm text-red-500 font-medium">{error}</span> : <span />}
                <button
                  onClick={handleCompareAnalyze}
                  disabled={isCompareAnalyzing || !geminiKey}
                  title={!geminiKey ? 'Set a Gemini API key first' : undefined}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                >
                  <Sparkles size={18} />
                  {isCompareAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
                </button>
              </div>

              {compareAnalysis && <AiAnalysisPanel analysis={compareAnalysis} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AiAnalysisPanel({ analysis }: { analysis: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Sparkles className="text-blue-500" size={20} />
        AI Performance Analysis
      </h2>
      <div className="prose prose-slate max-w-none prose-sm sm:prose-base">
        <div className="markdown-body">
          <Markdown>{analysis}</Markdown>
        </div>
      </div>
    </div>
  );
}

function PlanSummaryPanel({ summary }: { summary: PlanSummary }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Plan Summary</h2>

      {summary.statementText && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-slate-500">Statement</h3>
            <CopyButton text={summary.statementText} label="Copy SQL" />
          </div>
          <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-800 font-mono break-words max-h-48 overflow-y-auto">
            {summary.statementText}
          </div>
        </div>
      )}

      {summary.missingIndexes.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-amber-600 flex items-center gap-1.5">
              <AlertTriangle size={16} />
              Missing Indexes ({summary.missingIndexes.length})
            </h3>
            <CopyButton text={summary.missingIndexes.join('\n\n')} label="Copy Indexes" />
          </div>
          <div className="space-y-3">
            {summary.missingIndexes.map((idx, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-900 font-mono break-words whitespace-pre-wrap">
                {idx}
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.redFlags.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-red-600 flex items-center gap-1.5 mb-3">
            <AlertTriangle size={16} />
            Red Flags & Warnings ({summary.redFlags.length})
          </h3>
          <div className="bg-red-50 border border-red-100 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-red-200">
              <thead className="bg-red-100/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-800 uppercase tracking-wider w-1/4">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-800 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-800 uppercase tracking-wider w-24">Node ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {summary.redFlags.map((flag, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 text-sm font-medium text-red-900">{flag.type}</td>
                    <td className="px-4 py-2 text-sm text-red-800">{flag.description}</td>
                    <td className="px-4 py-2 text-sm text-red-600 font-mono">{flag.nodeId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-slate-500 mb-3">Key Metrics</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">Total Nodes</span>
              <span className="font-semibold text-slate-900">{summary.totalNodes}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">Estimated Subtree Cost</span>
              <span className="font-semibold text-slate-900">{summary.totalCost.toFixed(4)}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-slate-500 mb-3">Operations Breakdown</h3>
          <div className="bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto">
            <div className="space-y-2">
              {summary.operations.map((op, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <span className="text-slate-700">{op.name}</span>
                  <span className="bg-white px-2 py-1 rounded-md border border-slate-200 text-slate-600 font-medium">
                    {op.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
