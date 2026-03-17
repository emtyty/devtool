import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Copy, Check, Download, RotateCcw, GitBranch, Workflow, Code2, Eye, Loader2 } from 'lucide-react';
import mermaid from 'mermaid';
import { generateDiagramJSON, type DiagramOutput } from '../utils/diagramParser';
import { buildSequenceMermaid, buildFlowchartMermaid } from '../utils/mermaidBuilder';
import ResizableSplit from './ResizableSplit';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  sequence: { mirrorActors: false, messageAlign: 'center' },
  flowchart: { curve: 'basis', padding: 20 },
});

type DiagramType = 'sequence' | 'flowchart';
type ViewTab = 'preview' | 'code';

const EXAMPLE_INPUT = 'User uploads image from mobile app. API validates auth, stores metadata in Postgres, pushes job to SQS, worker processes image and uploads to S3.';

const DiagramGenerator: React.FC = () => {
  const [input, setInput] = useState('');
  const [diagramData, setDiagramData] = useState<DiagramOutput | null>(null);
  const [diagramType, setDiagramType] = useState<DiagramType>('flowchart');
  const [viewTab, setViewTab] = useState<ViewTab>('preview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(0);

  const mermaidCode = diagramData
    ? diagramType === 'sequence'
      ? buildSequenceMermaid(diagramData.sequence)
      : buildFlowchartMermaid(diagramData.flowchart)
    : '';

  const renderDiagram = useCallback(async (code: string) => {
    if (!previewRef.current || !code) return;
    const id = `diagram-${++renderIdRef.current}`;
    try {
      const { svg } = await mermaid.render(id, code);
      if (previewRef.current) {
        previewRef.current.innerHTML = svg;
        // Make SVG responsive
        const svgEl = previewRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
      }
    } catch {
      if (previewRef.current) {
        previewRef.current.innerHTML = '<p class="text-red-400 text-sm p-4">Failed to render diagram. Try regenerating.</p>';
      }
    }
  }, []);

  useEffect(() => {
    if (viewTab === 'preview' && mermaidCode) {
      renderDiagram(mermaidCode);
    }
  }, [mermaidCode, viewTab, renderDiagram]);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setDiagramData(null);
    try {
      const result = await generateDiagramJSON(input);
      setDiagramData(result);
      setViewTab('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate diagram.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(mermaidCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSVG = () => {
    if (!previewRef.current) return;
    const svgEl = previewRef.current.querySelector('svg');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagramType}-diagram.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TAB_CLS = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
      active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`;

  const leftPanel = (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full">
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <GitBranch size={14} /> System Description
        </span>
        <button
          onClick={() => setInput(EXAMPLE_INPUT)}
          className="text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors"
        >
          Load Example
        </button>
      </div>

      <textarea
        className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed rounded-b-2xl min-h-[300px]"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Describe your system or flow..."
      />

      <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-sm shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Play size={14} /> Generate
            </>
          )}
        </button>

        {diagramData && (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 transition-all"
          >
            <RotateCcw size={14} /> Regenerate
          </button>
        )}
      </div>

      {error && (
        <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
          {error}
        </div>
      )}
    </section>
  );

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col h-full">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex flex-col gap-3">
        {/* Diagram type toggle */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Type</span>
          <div className="flex bg-slate-800 border border-slate-700 p-1 rounded-xl gap-0.5">
            <button
              onClick={() => setDiagramType('flowchart')}
              className={TAB_CLS(diagramType === 'flowchart')}
            >
              <Workflow size={12} /> Flowchart
            </button>
            <button
              onClick={() => setDiagramType('sequence')}
              className={TAB_CLS(diagramType === 'sequence')}
            >
              <GitBranch size={12} /> Sequence
            </button>
          </div>
        </div>

        {/* View toggle + actions */}
        <div className="flex items-center justify-between">
          <div className="flex bg-slate-800 border border-slate-700 p-1 rounded-xl gap-0.5">
            <button
              onClick={() => setViewTab('preview')}
              className={TAB_CLS(viewTab === 'preview')}
            >
              <Eye size={12} /> Preview
            </button>
            <button
              onClick={() => setViewTab('code')}
              className={TAB_CLS(viewTab === 'code')}
            >
              <Code2 size={12} /> Mermaid Code
            </button>
          </div>

          {diagramData && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              {viewTab === 'preview' && (
                <button
                  onClick={handleDownloadSVG}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
                >
                  <Download size={12} /> SVG
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 min-h-[300px]">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={24} className="animate-spin text-blue-400" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Analyzing system...</p>
          </div>
        )}

        {!loading && !diagramData && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <Workflow size={40} strokeWidth={1} />
            <p className="text-xs font-bold uppercase tracking-widest">Describe a system to generate diagrams</p>
          </div>
        )}

        {!loading && diagramData && viewTab === 'preview' && (
          <div ref={previewRef} className="flex items-center justify-center bg-white rounded-xl p-4 min-h-[250px]" />
        )}

        {!loading && diagramData && viewTab === 'code' && (
          <pre className="font-mono text-[13px] text-blue-100/90 whitespace-pre-wrap leading-relaxed">
            {mermaidCode}
          </pre>
        )}
      </div>
    </section>
  );

  return (
    <ResizableSplit
      storageKey="split:diagram-generator"
      left={leftPanel}
      right={rightPanel}
      defaultLeftPercent={38}
    />
  );
};

export default DiagramGenerator;
