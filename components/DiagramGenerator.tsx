import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Copy, Check, Download, RotateCcw, GitBranch, Workflow, Code2, Eye,
  Loader2, LayoutTemplate, PenTool, Plus, Trash2, Save, FolderOpen, X,
  Image, FileDown, Layers, ChevronDown,
} from 'lucide-react';
import mermaid from 'mermaid';
import { generateDiagramJSON, type DiagramOutput, type NodeType, type FlowchartNode, type FlowchartEdge, type FlowchartSubgroup } from '../utils/diagramParser';
import { buildSequenceMermaid, buildFlowchartMermaid } from '../utils/mermaidBuilder';
import { TEMPLATES, CATEGORY_LABELS, DIAGRAM_TYPE_LABELS, STARTER_TEMPLATES, type DiagramTemplate, type DiagramType, type TemplateCategory } from '../utils/diagramTemplates';
import ResizableSplit from './ResizableSplit';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  sequence: { mirrorActors: false, messageAlign: 'center' },
  flowchart: { curve: 'basis', padding: 20 },
  c4: { diagramMarginY: 20 },
  quadrantChart: {
    titleFontSize: 16,
    quadrantLabelFontSize: 14,
    pointLabelFontSize: 11,
    xAxisLabelFontSize: 12,
    yAxisLabelFontSize: 12,
    quadrantTextTopPadding: 6,
    pointRadius: 4,
  },
});

// ── Types ──

type InputMode = 'text' | 'templates' | 'editor';
type ViewTab = 'preview' | 'code';

interface EditorNode {
  id: string;
  label: string;
  type: NodeType;
  subgroup: string;
}

interface EditorEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

interface EditorSubgroup {
  id: string;
  name: string;
}

interface SavedDiagram {
  id: string;
  name: string;
  timestamp: number;
  mermaidCode: string;
  diagramType: DiagramType;
}

const STORAGE_KEY = 'devtoolkit:diagram-history';
const NODE_TYPES: NodeType[] = ['user', 'client', 'service', 'database', 'queue', 'storage', 'external'];

function loadHistory(): SavedDiagram[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(items: SavedDiagram[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

let editorIdCounter = 0;
function nextId(prefix: string) {
  return `${prefix}_${++editorIdCounter}`;
}

// ── NLP example text ──
const EXAMPLE_INPUT = 'User uploads image from mobile app. API validates auth, stores metadata in Postgres, pushes job to SQS, worker processes image and uploads to S3.';

// ── Component ──

const DiagramGenerator: React.FC = () => {
  // Core state
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [textInput, setTextInput] = useState('');
  const [mermaidCode, setMermaidCode] = useState('');
  const [editableCode, setEditableCode] = useState('');
  const [diagramType, setDiagramType] = useState<DiagramType>('flowchart');
  const [viewTab, setViewTab] = useState<ViewTab>('preview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Template state
  const [templateFilter, setTemplateFilter] = useState<TemplateCategory | 'all'>('all');

  // Visual editor state
  const [editorNodes, setEditorNodes] = useState<EditorNode[]>([
    { id: 'node_1', label: 'User', type: 'user', subgroup: '' },
    { id: 'node_2', label: 'API', type: 'service', subgroup: '' },
  ]);
  const [editorEdges, setEditorEdges] = useState<EditorEdge[]>([
    { id: 'edge_1', from: 'node_1', to: 'node_2', label: 'requests' },
  ]);
  const [editorSubgroups, setEditorSubgroups] = useState<EditorSubgroup[]>([]);

  // History state
  const [history, setHistory] = useState<SavedDiagram[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Export state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Undo/redo stack for visual editor
  const [undoStack, setUndoStack] = useState<{ nodes: EditorNode[]; edges: EditorEdge[]; subgroups: EditorSubgroup[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ nodes: EditorNode[]; edges: EditorEdge[]; subgroups: EditorSubgroup[] }[]>([]);

  // Refs
  const previewRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(0);
  const codeDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Mermaid rendering ──

  const renderDiagram = useCallback(async (code: string) => {
    if (!previewRef.current || !code) return;
    const id = `diagram-${++renderIdRef.current}`;
    try {
      const { svg } = await mermaid.render(id, code);
      if (previewRef.current) {
        previewRef.current.innerHTML = svg;
        const svgEl = previewRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
      }
    } catch (err) {
      if (previewRef.current) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        // Extract useful info from mermaid error
        const cleanMsg = msg.replace(/ParseError:?\s*/i, '').slice(0, 200);
        previewRef.current.innerHTML = `<div class="p-4 space-y-2">
          <p class="text-red-400 text-sm font-bold">Render Error</p>
          <p class="text-red-300 text-xs font-mono bg-red-950/30 rounded-lg p-3 whitespace-pre-wrap">${cleanMsg}</p>
          <p class="text-slate-500 text-xs">Switch to <strong>Code Editor</strong> tab to fix the syntax.</p>
        </div>`;
      }
    }
  }, []);

  useEffect(() => {
    if (viewTab === 'preview' && mermaidCode) {
      renderDiagram(mermaidCode);
    }
  }, [mermaidCode, viewTab, renderDiagram]);

  // Sync editable code when mermaid code changes (not from code editing)
  useEffect(() => {
    setEditableCode(mermaidCode);
  }, [mermaidCode]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Ctrl+Enter → Generate / Build
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (inputMode === 'text' && textInput.trim() && !loading) handleGenerateFromText();
        else if (inputMode === 'editor') handleBuildFromEditor();
      }
      // Ctrl+S → Open save input
      if (mod && e.key === 's' && hasGenerated) {
        e.preventDefault();
        setShowSaveInput(true);
      }
      // Ctrl+Z / Ctrl+Y → Undo / Redo (only in editor mode)
      if (inputMode === 'editor' && mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (inputMode === 'editor' && mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ── Generate from NLP text ──

  const handleGenerateFromText = async () => {
    if (!textInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // NLP parser only supports flowchart & sequence — others use starter template
      const nlpTypes: DiagramType[] = ['flowchart', 'sequence'];
      if (nlpTypes.includes(diagramType)) {
        const result: DiagramOutput = await generateDiagramJSON(textInput);
        const code = diagramType === 'sequence'
          ? buildSequenceMermaid(result.sequence)
          : buildFlowchartMermaid(result.flowchart);
        setMermaidCode(code);
      } else {
        // Load starter template for this type — user can edit in code editor
        const starter = STARTER_TEMPLATES[diagramType];
        if (starter) {
          setMermaidCode(starter);
          setViewTab('code');
        }
      }
      setHasGenerated(true);
      if (nlpTypes.includes(diagramType)) setViewTab('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate diagram.');
    } finally {
      setLoading(false);
    }
  };

  // ── Load template ──

  const handleLoadTemplate = (template: DiagramTemplate) => {
    setMermaidCode(template.mermaidCode);
    setDiagramType(template.diagramType);
    setHasGenerated(true);
    setViewTab('preview');
    setError(null);
  };

  // ── Build from visual editor ──

  const handleBuildFromEditor = () => {
    if (editorNodes.length === 0) {
      setError('Add at least one node.');
      return;
    }
    setError(null);
    const nodes: FlowchartNode[] = editorNodes.map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
      subgroup: n.subgroup || undefined,
    }));
    const edges: FlowchartEdge[] = editorEdges.map(e => ({
      from: e.from,
      to: e.to,
      label: e.label || undefined,
    }));
    const subgroups: FlowchartSubgroup[] = editorSubgroups.map(sg => ({
      id: sg.id,
      name: sg.name,
    }));
    const code = buildFlowchartMermaid({ nodes, edges, subgroups: subgroups.length > 0 ? subgroups : undefined });
    setMermaidCode(code);
    setDiagramType('flowchart');
    setHasGenerated(true);
    setViewTab('preview');
  };

  // ── Code editing with live preview ──

  const handleCodeChange = (value: string) => {
    setEditableCode(value);
    clearTimeout(codeDebounceRef.current);
    codeDebounceRef.current = setTimeout(() => {
      setMermaidCode(value);
    }, 600);
  };

  // ── Copy ──

  const handleCopy = () => {
    navigator.clipboard.writeText(mermaidCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Download SVG ──

  const handleDownloadSVG = () => {
    if (!previewRef.current) return;
    const svgEl = previewRef.current.querySelector('svg');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagram.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Download PNG ──

  const toBase64 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const handleDownloadPNG = () => {
    const svgEl = previewRef.current?.querySelector('svg');
    if (!svgEl) return;

    try {
      const bbox = svgEl.getBoundingClientRect();
      const width = Math.ceil(bbox.width) || 800;
      const height = Math.ceil(bbox.height) || 600;
      const scale = 2;

      // Clone and prepare SVG
      const cloned = svgEl.cloneNode(true) as SVGSVGElement;
      cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      cloned.setAttribute('width', String(width));
      cloned.setAttribute('height', String(height));
      // Remove foreignObject (breaks canvas rendering)
      cloned.querySelectorAll('foreignObject').forEach(fo => fo.remove());

      const svgData = new XMLSerializer().serializeToString(cloned);
      const base64 = toBase64(svgData);

      const img = new window.Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext('2d')!;
          ctx.scale(scale, scale);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (!blob) {
              setExportError('PNG export failed — empty blob. Try SVG instead.');
              setTimeout(() => setExportError(null), 4000);
              return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'diagram.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 'image/png');
        } catch {
          setExportError('PNG canvas render failed. Try SVG instead.');
          setTimeout(() => setExportError(null), 4000);
        }
      };

      img.onerror = () => {
        setExportError('PNG export failed. Try downloading as SVG instead.');
        setTimeout(() => setExportError(null), 4000);
      };

      img.src = `data:image/svg+xml;base64,${base64}`;
    } catch {
      setExportError('PNG export error. Try downloading as SVG instead.');
      setTimeout(() => setExportError(null), 4000);
    }
  };

  // ── Save / Load History ──

  const handleSave = () => {
    if (!mermaidCode || !saveName.trim()) return;
    const item: SavedDiagram = {
      id: `save_${Date.now()}`,
      name: saveName.trim(),
      timestamp: Date.now(),
      mermaidCode,
      diagramType,
    };
    const updated = [item, ...history].slice(0, 50);
    setHistory(updated);
    saveHistory(updated);
    setSaveName('');
    setShowSaveInput(false);
  };

  const handleLoadSaved = (item: SavedDiagram) => {
    setMermaidCode(item.mermaidCode);
    setDiagramType(item.diagramType);
    setHasGenerated(true);
    setViewTab('preview');
    setShowHistory(false);
    setError(null);
  };

  const handleDeleteSaved = (id: string) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
  };

  // ── Undo / Redo for visual editor ──

  const pushUndo = () => {
    setUndoStack(prev => [...prev.slice(-29), { nodes: editorNodes, edges: editorEdges, subgroups: editorSubgroups }]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, { nodes: editorNodes, edges: editorEdges, subgroups: editorSubgroups }]);
    setUndoStack(u => u.slice(0, -1));
    setEditorNodes(prev.nodes);
    setEditorEdges(prev.edges);
    setEditorSubgroups(prev.subgroups);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, { nodes: editorNodes, edges: editorEdges, subgroups: editorSubgroups }]);
    setRedoStack(r => r.slice(0, -1));
    setEditorNodes(next.nodes);
    setEditorEdges(next.edges);
    setEditorSubgroups(next.subgroups);
  };

  // ── Visual editor helpers ──

  const addNode = () => {
    pushUndo();
    const id = nextId('node');
    setEditorNodes(prev => [...prev, { id, label: `Node ${prev.length + 1}`, type: 'service', subgroup: '' }]);
  };

  const updateNode = (id: string, field: keyof EditorNode, value: string) => {
    pushUndo();
    setEditorNodes(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n));
  };

  const removeNode = (id: string) => {
    pushUndo();
    setEditorNodes(prev => prev.filter(n => n.id !== id));
    setEditorEdges(prev => prev.filter(e => e.from !== id && e.to !== id));
  };

  const addEdge = () => {
    if (editorNodes.length < 2) return;
    pushUndo();
    const id = nextId('edge');
    setEditorEdges(prev => [...prev, { id, from: editorNodes[0].id, to: editorNodes[1].id, label: '' }]);
  };

  const updateEdge = (id: string, field: keyof EditorEdge, value: string) => {
    pushUndo();
    setEditorEdges(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEdge = (id: string) => {
    pushUndo();
    setEditorEdges(prev => prev.filter(e => e.id !== id));
  };

  const addSubgroup = () => {
    pushUndo();
    const id = nextId('sg');
    setEditorSubgroups(prev => [...prev, { id, name: `Group ${prev.length + 1}` }]);
  };

  const updateSubgroup = (id: string, name: string) => {
    pushUndo();
    setEditorSubgroups(prev => prev.map(sg => sg.id === id ? { ...sg, name } : sg));
  };

  const removeSubgroup = (id: string) => {
    pushUndo();
    setEditorSubgroups(prev => prev.filter(sg => sg.id !== id));
    setEditorNodes(prev => prev.map(n => n.subgroup === id ? { ...n, subgroup: '' } : n));
  };

  // ── Styles ──

  const TAB_CLS = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
      active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`;

  const INPUT_MODE_CLS = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
      active ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'text-slate-500 hover:text-slate-700 border border-transparent hover:border-slate-200'
    }`;

  // ── Filtered templates ──

  const filteredTemplates = templateFilter === 'all'
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === templateFilter);

  // ── Left Panel ──

  const leftPanel = (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full">
      {/* Input mode tabs */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 flex-wrap">
        <button onClick={() => setInputMode('text')} className={INPUT_MODE_CLS(inputMode === 'text')}>
          <GitBranch size={13} /> Text Input
        </button>
        <button onClick={() => setInputMode('templates')} className={INPUT_MODE_CLS(inputMode === 'templates')}>
          <LayoutTemplate size={13} /> Templates
        </button>
        <button onClick={() => setInputMode('editor')} className={INPUT_MODE_CLS(inputMode === 'editor')}>
          <PenTool size={13} /> Visual Editor
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
            showHistory ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'text-slate-400 hover:text-slate-600 border border-transparent'
          }`}
        >
          <FolderOpen size={12} /> History{history.length > 0 && ` (${history.length})`}
        </button>
      </div>

      {/* History panel (overlay) */}
      {showHistory && (
        <div className="border-b border-slate-200 bg-amber-50/50 max-h-64 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-xs text-slate-400 p-4 text-center">No saved diagrams yet.</p>
          ) : (
            <div className="p-2 space-y-1">
              {history.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {DIAGRAM_TYPE_LABELS[item.diagramType]} &middot; {new Date(item.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleLoadSaved(item)}
                    className="text-[10px] font-bold text-blue-500 hover:text-blue-700 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDeleteSaved(item.id)}
                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Text Input Mode ── */}
        {inputMode === 'text' && (
          <div className="flex flex-col h-full">
            <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Describe your system</span>
              <button
                onClick={() => setTextInput(EXAMPLE_INPUT)}
                className="text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors"
              >
                Load Example
              </button>
            </div>
            <textarea
              className="flex-1 p-4 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed min-h-[200px]"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="User sends request to API Gateway. API Gateway routes to Auth Service. Auth Service validates token against Redis..."
            />
            <div className="px-4 py-3 border-t border-slate-200 flex items-center gap-2">
              {/* Diagram type for NLP */}
              <select
                value={diagramType}
                onChange={e => setDiagramType(e.target.value as DiagramType)}
                className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-600 focus:outline-none focus:border-blue-300"
              >
                <optgroup label="NLP Supported">
                  <option value="flowchart">Flowchart</option>
                  <option value="sequence">Sequence</option>
                </optgroup>
                <optgroup label="Template (editable)">
                  <option value="class">Class Diagram</option>
                  <option value="er">ER Diagram</option>
                  <option value="state">State Diagram</option>
                  <option value="c4">C4 Model</option>
                  <option value="gantt">Gantt Chart</option>
                  <option value="pie">Pie Chart</option>
                  <option value="mindmap">Mind Map</option>
                  <option value="timeline">Timeline</option>
                  <option value="gitgraph">Git Graph</option>
                  <option value="quadrant">Quadrant Chart</option>
                </optgroup>
              </select>
              <button
                onClick={handleGenerateFromText}
                disabled={loading || !textInput.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-sm shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : <><Play size={13} /> Generate</>}
              </button>
              {hasGenerated && (
                <button
                  onClick={handleGenerateFromText}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 transition-all"
                >
                  <RotateCcw size={13} /> Redo
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Templates Mode ── */}
        {inputMode === 'templates' && (
          <div className="p-4 space-y-3">
            {/* Category filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setTemplateFilter('all')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                  templateFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setTemplateFilter(cat)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                    templateFilter === cat ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Template cards */}
            <div className="grid grid-cols-1 gap-2">
              {filteredTemplates.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleLoadTemplate(t)}
                  className="text-left p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black text-slate-700 group-hover:text-blue-600">{t.name}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 uppercase">
                      {DIAGRAM_TYPE_LABELS[t.diagramType]}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{t.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Visual Editor Mode ── */}
        {inputMode === 'editor' && (
          <div className="p-4 space-y-4">
            {/* Undo/Redo bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Undo (Ctrl+Z)"
                >
                  <RotateCcw size={10} /> Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Redo (Ctrl+Y)"
                >
                  <RotateCcw size={10} className="scale-x-[-1]" /> Redo
                </button>
              </div>
              <span className="text-[9px] text-slate-300">Ctrl+Enter to build</span>
            </div>

            {/* Subgroups */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Layers size={11} /> Subgroups
                </span>
                <button onClick={addSubgroup} className="text-[10px] font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1">
                  <Plus size={10} /> Add
                </button>
              </div>
              {editorSubgroups.length === 0 && (
                <p className="text-[10px] text-slate-300 italic">No subgroups. Nodes will be ungrouped.</p>
              )}
              <div className="space-y-1">
                {editorSubgroups.map(sg => (
                  <div key={sg.id} className="flex items-center gap-2">
                    <input
                      value={sg.name}
                      onChange={e => updateSubgroup(sg.id, e.target.value)}
                      className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-300"
                    />
                    <button onClick={() => removeSubgroup(sg.id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Nodes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nodes</span>
                <button onClick={addNode} className="text-[10px] font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1">
                  <Plus size={10} /> Add Node
                </button>
              </div>
              <div className="space-y-1.5">
                {editorNodes.map(node => (
                  <div key={node.id} className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1.5">
                    <input
                      value={node.label}
                      onChange={e => updateNode(node.id, 'label', e.target.value)}
                      className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-blue-300 min-w-0"
                      placeholder="Label"
                    />
                    <select
                      value={node.type}
                      onChange={e => updateNode(node.id, 'type', e.target.value)}
                      className="text-[10px] border border-slate-200 rounded px-1 py-1 bg-white focus:outline-none w-20"
                    >
                      {NODE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {editorSubgroups.length > 0 && (
                      <select
                        value={node.subgroup}
                        onChange={e => updateNode(node.id, 'subgroup', e.target.value)}
                        className="text-[10px] border border-slate-200 rounded px-1 py-1 bg-white focus:outline-none w-20"
                      >
                        <option value="">No group</option>
                        {editorSubgroups.map(sg => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
                      </select>
                    )}
                    <button onClick={() => removeNode(node.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Edges */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Edges</span>
                <button onClick={addEdge} disabled={editorNodes.length < 2} className="text-[10px] font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1 disabled:opacity-40">
                  <Plus size={10} /> Add Edge
                </button>
              </div>
              <div className="space-y-1.5">
                {editorEdges.map(edge => (
                  <div key={edge.id} className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1.5">
                    <select
                      value={edge.from}
                      onChange={e => updateEdge(edge.id, 'from', e.target.value)}
                      className="text-[10px] border border-slate-200 rounded px-1 py-1 bg-white focus:outline-none flex-1 min-w-0"
                    >
                      {editorNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                    </select>
                    <span className="text-[10px] text-slate-400 shrink-0">&rarr;</span>
                    <select
                      value={edge.to}
                      onChange={e => updateEdge(edge.id, 'to', e.target.value)}
                      className="text-[10px] border border-slate-200 rounded px-1 py-1 bg-white focus:outline-none flex-1 min-w-0"
                    >
                      {editorNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
                    </select>
                    <input
                      value={edge.label}
                      onChange={e => updateEdge(edge.id, 'label', e.target.value)}
                      placeholder="label"
                      className="text-[10px] border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none w-16"
                    />
                    <button onClick={() => removeEdge(edge.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Build button */}
            <button
              onClick={handleBuildFromEditor}
              disabled={editorNodes.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-sm shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={13} /> Build Diagram
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium flex items-center gap-2">
          <X size={12} className="shrink-0" />
          {error}
        </div>
      )}
    </section>
  );

  // ── Right Panel ──

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col h-full">
      <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-800 flex flex-col gap-2">
        {/* View toggle + actions */}
        <div className="flex items-center justify-between">
          <div className="flex bg-slate-800 border border-slate-700 p-0.5 rounded-xl gap-0.5">
            <button onClick={() => setViewTab('preview')} className={TAB_CLS(viewTab === 'preview')}>
              <Eye size={11} /> Preview
            </button>
            <button onClick={() => setViewTab('code')} className={TAB_CLS(viewTab === 'code')}>
              <Code2 size={11} /> Code Editor
            </button>
          </div>

          {hasGenerated && (
            <div className="flex items-center gap-1.5">
              {/* Copy */}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
              >
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copied ? 'Copied' : 'Copy'}
              </button>

              {/* Save */}
              <div className="relative">
                {showSaveInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSave()}
                      placeholder="Name..."
                      className="text-[10px] w-24 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim()}
                      className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
                    >
                      <Check size={13} />
                    </button>
                    <button onClick={() => setShowSaveInput(false)} className="text-slate-500 hover:text-slate-300">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSaveInput(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
                  >
                    <Save size={11} /> Save
                  </button>
                )}
              </div>

              {/* Export dropdown */}
              {viewTab === 'preview' && (
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
                  >
                    <Download size={11} /> Export <ChevronDown size={9} />
                  </button>
                  {showExportMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden min-w-[120px]">
                        <button
                          onClick={() => { handleDownloadSVG(); setShowExportMenu(false); }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          <FileDown size={12} /> SVG
                        </button>
                        <button
                          onClick={() => { handleDownloadPNG(); setShowExportMenu(false); }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                        >
                          <Image size={12} /> PNG
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Export error toast */}
      {exportError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-900/50 border border-red-700 rounded-xl text-xs text-red-300 font-medium flex items-center gap-2">
          <X size={12} className="shrink-0" />
          {exportError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-[300px]">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={24} className="animate-spin text-blue-400" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Analyzing system...</p>
          </div>
        )}

        {!loading && !hasGenerated && !error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 p-6">
            <Workflow size={40} strokeWidth={1} />
            <p className="text-xs font-bold uppercase tracking-widest text-center">Describe a system, pick a template, or use the visual editor</p>
          </div>
        )}

        {!loading && hasGenerated && viewTab === 'preview' && (
          <div ref={previewRef} className="flex items-center justify-center bg-white rounded-xl m-4 p-4 min-h-[250px]" />
        )}

        {!loading && hasGenerated && viewTab === 'code' && (
          <div className="p-4 h-full">
            <textarea
              value={editableCode}
              onChange={e => handleCodeChange(e.target.value)}
              className="w-full h-full min-h-[400px] font-mono text-[13px] text-blue-100/90 bg-slate-800/50 border border-slate-700 rounded-xl p-4 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
              spellCheck={false}
            />
          </div>
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
