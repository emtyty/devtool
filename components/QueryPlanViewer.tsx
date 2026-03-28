import { useState, useRef, useEffect } from 'react';
import { FileCode2, Play, AlertTriangle, Sparkles, Key, Eye, EyeOff, X, Check, ChevronDown, ChevronRight, Upload, FlaskConical } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import * as qp from 'html-query-plan';
import 'html-query-plan/css/qp.css';
import { SQLPlanAnalyzer } from '../lib/SQLPlanAnalyzer';
import type { PlanSummary, PlanNode } from '../types';
import CopyButton from './CopyButton';
import { PlanTreeRenderer } from './PlanTreeRenderer';

const AI_MODEL = 'gemini-2.5-pro-preview-06-05';

// ── Sample execution plan for demo purposes ──────────────────────────────────
const SAMPLE_PLAN = `<?xml version="1.0" encoding="utf-16"?>
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan" Version="1.539" Build="15.0.4375.4">
  <BatchSequence>
    <Batch>
      <Statements>
        <StmtSimple
          StatementText="SELECT o.OrderId, c.Name, c.Email, od.Quantity, od.UnitPrice FROM Orders o INNER JOIN Customers c ON o.CustomerId = c.CustomerId INNER JOIN OrderDetails od ON o.OrderId = od.OrderId WHERE o.OrderDate &gt;= '2024-01-01' AND c.Country = 'USA'"
          StatementId="1" StatementCompId="1" StatementType="SELECT"
          StatementSubTreeCost="1.95432" StatementEstRows="1250"
          StatementOptmLevel="FULL"
          QueryHash="0x8A4F2B1C3D5E6F70" QueryPlanHash="0x1A2B3C4D5E6F7A8B">
          <StatementSetOptions QUOTED_IDENTIFIER="true" ARITHABORT="true" CONCAT_NULL_YIELDS_NULL="true" ANSI_NULLS="true" ANSI_PADDING="true" ANSI_WARNINGS="true" NUMERIC_ROUNDABORT="false" />
          <QueryPlan DegreeOfParallelism="1" MemoryGrant="4096" CachedPlanSize="192" CompileTime="78" CompileCPU="76" CompileMemory="2048">
            <MissingIndexes>
              <MissingIndexGroup Impact="78.32">
                <MissingIndex Database="[SalesDB]" Schema="[dbo]" Table="[Customers]">
                  <ColumnGroup Usage="EQUALITY">
                    <Column Name="[Country]" ColumnId="5" />
                  </ColumnGroup>
                  <ColumnGroup Usage="INCLUDE">
                    <Column Name="[Name]" ColumnId="2" />
                    <Column Name="[Email]" ColumnId="3" />
                    <Column Name="[CustomerId]" ColumnId="1" />
                  </ColumnGroup>
                </MissingIndex>
              </MissingIndexGroup>
            </MissingIndexes>
            <RelOp NodeId="0" PhysicalOp="Nested Loops" LogicalOp="Inner Join"
              EstimateRows="1250" EstimatedTotalSubtreeCost="1.95432"
              EstimateIO="0" EstimateCPU="0.001250" AvgRowSize="148"
              EstimateRebinds="0" EstimateRewinds="0" Parallel="0" EstimatedExecutionMode="Row">
              <OutputList>
                <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="OrderId" />
                <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="Name" />
                <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="Email" />
                <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[OrderDetails]" Alias="[od]" Column="Quantity" />
                <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[OrderDetails]" Alias="[od]" Column="UnitPrice" />
              </OutputList>
              <NestedLoops Optimized="false" WithOrderedPrefetch="true">
                <OuterReferences>
                  <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="OrderId" />
                </OuterReferences>
                <RelOp NodeId="1" PhysicalOp="Hash Match" LogicalOp="Inner Join"
                  EstimateRows="1250" EstimatedTotalSubtreeCost="1.65321"
                  EstimateIO="0" EstimateCPU="0.045680" AvgRowSize="96"
                  EstimateRebinds="0" EstimateRewinds="0" Parallel="0" EstimatedExecutionMode="Row">
                  <OutputList>
                    <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="OrderId" />
                    <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="CustomerId" />
                    <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="Name" />
                    <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="Email" />
                  </OutputList>
                  <HashMatch BuildResidual="none">
                    <HashKeysBuild>
                      <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="CustomerId" />
                    </HashKeysBuild>
                    <HashKeysProbe>
                      <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="CustomerId" />
                    </HashKeysProbe>
                    <RelOp NodeId="2" PhysicalOp="Table Scan" LogicalOp="Table Scan"
                      EstimateRows="45000" EstimatedTotalSubtreeCost="0.95432"
                      EstimateIO="0.848066" EstimateCPU="0.045000" AvgRowSize="156"
                      EstimateRebinds="0" EstimateRewinds="0" Parallel="0"
                      EstimatedExecutionMode="Row" StorageType="RowStore">
                      <OutputList>
                        <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="CustomerId" />
                        <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="Name" />
                        <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="Email" />
                        <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="Country" />
                      </OutputList>
                      <TableScan Ordered="false" ForcedIndex="false" NoExpandHint="false" Storage="RowStore">
                        <Object Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" IndexKind="Heap" Storage="RowStore" />
                        <Predicate>
                          <ScalarOperator ScalarString="[SalesDB].[dbo].[Customers].[Country] as [c].[Country]=N'USA'">
                            <Compare CompareOp="EQ">
                              <ScalarOperator><Identifier><ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Customers]" Alias="[c]" Column="Country" /></Identifier></ScalarOperator>
                              <ScalarOperator><Const ConstValue="N'USA'" /></ScalarOperator>
                            </Compare>
                          </ScalarOperator>
                        </Predicate>
                      </TableScan>
                    </RelOp>
                    <RelOp NodeId="3" PhysicalOp="Clustered Index Seek" LogicalOp="Clustered Index Seek"
                      EstimateRows="15423" EstimatedTotalSubtreeCost="0.65321"
                      EstimateIO="0.548066" EstimateCPU="0.015423" AvgRowSize="48"
                      EstimateRebinds="0" EstimateRewinds="0" Parallel="0"
                      EstimatedExecutionMode="Row" StorageType="RowStore">
                      <OutputList>
                        <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="OrderId" />
                        <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="CustomerId" />
                        <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="OrderDate" />
                      </OutputList>
                      <IndexScan Ordered="true" ScanDirection="FORWARD" ForcedIndex="false" ForceSeek="false" NoExpandHint="false" Storage="RowStore" EstimatedRowsRead="15423">
                        <Object Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Index="[PK_Orders_OrderId]" Alias="[o]" IndexKind="Clustered" Storage="RowStore" />
                        <SeekPredicates>
                          <SeekPredicateNew>
                            <SeekKeys>
                              <StartRange ScanType="GE">
                                <RangeColumns>
                                  <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[Orders]" Alias="[o]" Column="OrderDate" />
                                </RangeColumns>
                                <RangeExpressions>
                                  <ScalarOperator ScalarString="'2024-01-01'"><Const ConstValue="'2024-01-01'" /></ScalarOperator>
                                </RangeExpressions>
                              </StartRange>
                            </SeekKeys>
                          </SeekPredicateNew>
                        </SeekPredicates>
                      </IndexScan>
                    </RelOp>
                  </HashMatch>
                </RelOp>
                <RelOp NodeId="4" PhysicalOp="Index Seek" LogicalOp="Index Seek"
                  EstimateRows="3.5" EstimatedTotalSubtreeCost="0.006572"
                  EstimateIO="0.003125" EstimateCPU="0.0001581" AvgRowSize="36"
                  EstimateRebinds="0" EstimateRewinds="1249" Parallel="0"
                  EstimatedExecutionMode="Row" StorageType="RowStore">
                  <OutputList>
                    <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[OrderDetails]" Alias="[od]" Column="Quantity" />
                    <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[OrderDetails]" Alias="[od]" Column="UnitPrice" />
                    <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[OrderDetails]" Alias="[od]" Column="ProductId" />
                  </OutputList>
                  <IndexScan Ordered="true" ScanDirection="FORWARD" ForcedIndex="false" ForceSeek="false" NoExpandHint="false" Storage="RowStore" EstimatedRowsRead="3.5">
                    <Object Database="[SalesDB]" Schema="[dbo]" Table="[OrderDetails]" Index="[IX_OrderDetails_OrderId]" Alias="[od]" IndexKind="NonClustered" Storage="RowStore" />
                    <SeekPredicates>
                      <SeekPredicateNew>
                        <SeekKeys>
                          <StartRange ScanType="EQ">
                            <RangeColumns>
                              <ColumnReference Database="[SalesDB]" Schema="[dbo]" Table="[OrderDetails]" Alias="[od]" Column="OrderId" />
                            </RangeColumns>
                          </StartRange>
                        </SeekKeys>
                      </SeekPredicateNew>
                    </SeekPredicates>
                  </IndexScan>
                </RelOp>
              </NestedLoops>
            </RelOp>
          </QueryPlan>
        </StmtSimple>
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>`.trim();
const LS_KEY = 'devtoolkit_gemini_key';

const SINGLE_SYSTEM_PROMPT = `You are a SQL Server performance tuning expert. You will receive a JSON object containing a pre-analyzed SQL execution plan with the following fields:
- statement: the SQL text
- totalCost: estimated total subtree cost
- metrics: cost, memory grant, parallelism, top bottleneck operators
- redFlags: detected issues with severity (high/medium/low), type, description, and nodeId
- missingIndexes: index recommendations from the optimizer
- executionPath: flat list of operators in execution order (leaves first), each with selfCostPercent (the operator's own work), estimateRows, and objectName
- operations: operator type counts

Based on this analysis, provide:
1. A brief summary of the query's overall performance profile
2. The top 3 most critical issues to fix, referencing specific node IDs and operator names
3. Concrete, actionable recommendations for each issue

Be concise and direct. Prioritize high-severity red flags and operators with high selfCostPercent.`;

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

export default function QueryPlanViewer({ initialData }: { initialData?: string | null }) {
  const [xmlInput, setXmlInput] = useState('');

  useEffect(() => { if (initialData) setXmlInput(initialData); }, [initialData]);
  const [singleAnalysis, setSingleAnalysis] = useState<string | null>(null);
  const [isSingleAnalyzing, setIsSingleAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem(LS_KEY) || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [viewMode, setViewMode] = useState<'classic' | 'modern'>('classic');
  const [classicXml, setClassicXml] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-render Classic plan whenever switching to Classic tab or new XML is loaded
  useEffect(() => {
    if (viewMode !== 'classic' || !classicXml || !containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = '';
    qp.showPlan(el, classicXml, { jsTooltips: true });
    // Double-RAF so SVG arrows are drawn after layout
    requestAnimationFrame(() => requestAnimationFrame(() => {
      qp.showPlan(el, classicXml, { jsTooltips: true });
    }));
  }, [viewMode, classicXml]);

  const handleFileImport = (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') setXmlInput(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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
      // Use pre-computed summary if available, otherwise compute fresh
      const planSummary = summary ?? SQLPlanAnalyzer.extractSummary(xmlInput);
      const metrics = SQLPlanAnalyzer.getMetrics(xmlInput);

      const payload = {
        statement: planSummary.statementText,
        totalCost: planSummary.totalCost,
        metrics: {
          cost: metrics.cost,
          memoryGrant: metrics.memGrant,
          degreeOfParallelism: metrics.parallelism,
          topBottlenecks: metrics.bottlenecks,
          warnings: metrics.warnings,
        },
        redFlags: planSummary.redFlags.map(f => ({
          severity: f.severity,
          type: f.type,
          description: f.description,
          nodeId: f.nodeId,
        })),
        missingIndexes: planSummary.missingIndexes,
        executionPath: planSummary.executionPath.map(n => ({
          nodeId: n.nodeId,
          operator: n.physicalOp || n.logicalOp,
          objectName: n.objectName,
          selfCostPercent: parseFloat(n.selfCostPercent.toFixed(2)),
          estimateRows: n.estimateRows,
          estimateExecutions: n.estimateExecutions,
        })),
        operations: planSummary.operations,
      };

      const response = await createAiClient().models.generateContent({
        model: AI_MODEL,
        contents: JSON.stringify(payload),
        config: { systemInstruction: SINGLE_SYSTEM_PROMPT },
      });
      setSingleAnalysis(response.text || 'No analysis generated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to analyze plan.');
    } finally {
      setIsSingleAnalyzing(false);
    }
  };

  const handleRender = () => {
    setError(null);
    setSummary(null);
    setActiveNodeId(null);

    if (!xmlInput.trim()) return;

    try {
      const xmlToRender = xmlInput
        .replace(/(<\s*)(?:\w+:)?ShowPlanXML([^>]*?)>/i, (_, p1, p2) => {
          const cleanedTag = p2.replace(/\s+xmlns(:\w+)?=(?:"[^"]*"|'[^']*')/gi, '');
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

      setClassicXml(xmlToRender);
      setSummary(SQLPlanAnalyzer.extractSummary(xmlToRender));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse the execution plan XML.');
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
              <p className="text-[10px] text-slate-500">Analyze Microsoft SQL Server Execution Plans</p>
            </div>
          </div>
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
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="xml-input" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Execution Plan XML
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setXmlInput(SAMPLE_PLAN)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200 transition-colors"
                >
                  <FlaskConical size={13} />
                  Load Sample
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <Upload size={13} />
                  Import .sqlplan
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sqlplan,.xml"
                  className="hidden"
                  onChange={handleFileImport}
                />
              </div>
            </div>
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

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rendered Plan</h2>
              {classicXml && (
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('classic')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                      viewMode === 'classic'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Classic
                  </button>
                  <button
                    onClick={() => setViewMode('modern')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                      viewMode === 'modern'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Modern
                  </button>
                </div>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              {/* Classic container — always mounted so containerRef stays valid */}
              <div
                style={{ display: viewMode === 'classic' ? 'block' : 'none' }}
                className="overflow-auto p-4 bg-white min-h-[400px]"
              >
                {!classicXml && (
                  <div className="h-96 flex items-center justify-center text-slate-400 text-sm italic">
                    No plan rendered yet. Paste XML or import a .sqlplan file and click Render.
                  </div>
                )}
                <div ref={containerRef} />
              </div>
              {/* Modern container */}
              {viewMode === 'modern' && (
                <div className="overflow-auto p-4 bg-white min-h-[400px]">
                  {summary?.planTree
                    ? <PlanTreeRenderer root={summary.planTree} redFlags={summary.redFlags} activeNodeId={activeNodeId} />
                    : (
                      <div className="h-96 flex items-center justify-center text-slate-400 text-sm italic">
                        No plan rendered yet. Paste XML or import a .sqlplan file and click Render.
                      </div>
                    )
                  }
                </div>
              )}
            </div>
          </div>

          {summary && <PlanSummaryPanel summary={summary} onFlagClick={id => setActiveNodeId(id)} />}
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

function nodeStyle(node: PlanNode): { bg: string; badge: string; border: string } {
  const op = node.physicalOp || node.logicalOp;
  if (op === 'Table Scan' || op === 'Clustered Index Scan') {
    return { bg: 'bg-red-50', badge: 'bg-red-100 text-red-700', border: 'border-l-4 border-l-red-400' };
  }
  if (op === 'Key Lookup' || op === 'Index Scan') {
    return { bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', border: 'border-l-4 border-l-orange-400' };
  }
  if (node.selfCostPercent > 15) {
    return { bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700', border: 'border-l-4 border-l-yellow-400' };
  }
  if (op === 'Index Seek' || op === 'Clustered Index Seek') {
    return { bg: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700', border: 'border-l-4 border-l-emerald-400' };
  }
  return { bg: '', badge: 'bg-slate-100 text-slate-600', border: 'border-l-4 border-l-transparent' };
}

function ExecutionPathPanel({ nodes }: { nodes: PlanNode[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const allIds = nodes.map((n, i) => n.nodeId || String(i));
  const allExpanded = allIds.length > 0 && allIds.every(id => expanded.has(id));

  const toggle = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(allIds));

  if (nodes.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-slate-500">
          Execution Order
          <span className="ml-2 text-xs text-slate-400 font-normal">leaves first (right → left)</span>
        </h3>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-0.5 rounded hover:bg-slate-100 transition-colors"
        >
          {allExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
        {nodes.map((node, i) => {
          const style = nodeStyle(node);
          const isOpen = expanded.has(node.nodeId || String(i));
          const op = node.physicalOp || node.logicalOp;
          const barWidth = Math.min(100, node.selfCostPercent);
          return (
            <div key={node.nodeId || i} className={`${style.bg} ${style.border}`}>
              <button
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:brightness-95 transition-all"
                onClick={() => toggle(node.nodeId || String(i))}
              >
                <span className="text-xs text-slate-400 font-mono w-6 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md shrink-0 ${style.badge}`}>{op}</span>
                {node.objectName && (
                  <span className="text-xs text-slate-500 font-mono truncate flex-1">{node.objectName}</span>
                )}
                {!node.objectName && <span className="flex-1" />}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${node.selfCostPercent > 20 ? 'bg-red-400' : node.selfCostPercent > 10 ? 'bg-yellow-400' : 'bg-blue-300'}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 w-10 text-right">{node.selfCostPercent.toFixed(1)}%</span>
                </div>
                {isOpen ? <ChevronDown size={13} className="text-slate-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-2.5 pt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono bg-slate-50 border-t border-slate-100">
                  <span><span className="text-slate-400">Operator Cost: </span><span className="text-slate-700">{node.selfCost.toFixed(6)}</span> <span className="text-slate-400">({node.selfCostPercent.toFixed(1)}%)</span></span>
                  <span><span className="text-slate-400">Subtree Cost: </span><span className="text-slate-700">{node.subtreeCost.toFixed(6)}</span></span>
                  <span><span className="text-slate-400">Est. Rows: </span><span className="text-slate-700">{node.estimateRows.toLocaleString()}</span></span>
                  <span><span className="text-slate-400">Executions: </span><span className="text-slate-700">{node.estimateExecutions.toLocaleString()}</span></span>
                  {node.nodeId && <span><span className="text-slate-400">Node ID: </span><span className="text-slate-700">{node.nodeId}</span></span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-orange-100 text-orange-700',
  low: 'bg-slate-100 text-slate-500',
};

function PlanSummaryPanel({ summary, onFlagClick }: { summary: PlanSummary; onFlagClick?: (nodeId: string) => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-5">Plan Summary</h2>

      {/* Two-column layout: left = execution path + statement, right = flags + metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT column — execution path only */}
        <div className="flex flex-col gap-6">
          <ExecutionPathPanel nodes={summary.executionPath} />
        </div>

        {/* RIGHT column — issues, indexes, operations, statement, metrics */}
        <div className="flex flex-col gap-6">
          {summary.redFlags.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-red-500" />
                Issues ({summary.redFlags.length})
              </h3>
              <div className="rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100">
                {summary.redFlags.map((flag, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 px-3 py-2.5 items-start ${flag.nodeId && onFlagClick ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
                    onClick={() => flag.nodeId && onFlagClick?.(flag.nodeId)}
                  >
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 uppercase tracking-wide ${SEVERITY_BADGE[flag.severity]}`}>
                      {flag.severity}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-semibold text-slate-700">{flag.type}</span>
                      <span className="text-xs text-slate-500 leading-relaxed">{flag.description}</span>
                    </div>
                    {flag.nodeId && (
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-auto">#{flag.nodeId}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.missingIndexes.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                  <AlertTriangle size={13} />
                  Missing Indexes ({summary.missingIndexes.length})
                </h3>
                <CopyButton text={summary.missingIndexes.join('\n\n')} label="Copy" />
              </div>
              <div className="space-y-2">
                {summary.missingIndexes.map((idx, i) => (
                  <div key={i} className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-900 font-mono break-words whitespace-pre-wrap">
                    {idx}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operations Breakdown */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Operations</h3>
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 max-h-52 overflow-y-auto">
              <div className="space-y-1.5">
                {summary.operations.map((op, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="text-slate-600">{op.name}</span>
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600 font-semibold tabular-nums">
                      {op.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Statement */}
          {summary.statementText && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Statement</h3>
                <CopyButton text={summary.statementText} label="Copy SQL" />
              </div>
              <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-800 font-mono break-words max-h-40 overflow-y-auto border border-slate-200">
                {summary.statementText}
              </div>
            </div>
          )}

          {/* Key Metrics */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Key Metrics</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500">Total Nodes</span>
                <span className="text-lg font-bold text-slate-800">{summary.totalNodes}</span>
              </div>
              <div className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs text-slate-500">Total Cost</span>
                <span className="text-lg font-bold text-slate-800">{summary.totalCost.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
