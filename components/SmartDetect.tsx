import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { detectAll, detectFile, getExtHint, DetectResult } from '../utils/smartDetect';
import { Wand2, Upload, ArrowRight, Filter, ListFilter, Code2, Braces, FileText, AlertTriangle, Database, Key, Replace, Workflow, Clock, Palette, Timer, ScrollText } from 'lucide-react';

interface SmartDetectProps {
  onDetect: (tool: string, data: string) => void;
  onDetectFile: (tool: string, file: File) => void;
  onNavigate: (tool: string) => void;
}

const TOOL_GRID: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'dataformatter', label: 'Data Formatter',    icon: <Filter size={18} /> },
  { id: 'listcleaner',   label: 'List Cleaner',      icon: <ListFilter size={18} /> },
  { id: 'sqlformatter',  label: 'SQL',               icon: <Code2 size={18} /> },
  { id: 'jsontools',     label: 'JSON',              icon: <Braces size={18} /> },
  { id: 'markdown',      label: 'Markdown',          icon: <FileText size={18} /> },
  { id: 'stacktrace',    label: 'Stack Trace',       icon: <AlertTriangle size={18} /> },
  { id: 'mockdata',      label: 'Mock Data',         icon: <Database size={18} /> },
  { id: 'jwtdecode',     label: 'JWT Decode',        icon: <Key size={18} /> },
  { id: 'texttools',     label: 'Text Tools',        icon: <Replace size={18} /> },
  { id: 'epoch',         label: 'Epoch Converter',   icon: <Clock size={18} /> },
  { id: 'color',         label: 'Color Converter',   icon: <Palette size={18} /> },
  { id: 'cron',          label: 'Cron Builder',      icon: <Timer size={18} /> },
  { id: 'logs',          label: 'Log Analyzer',      icon: <ScrollText size={18} /> },
  { id: 'diagram',       label: 'Diagram Generator', icon: <Workflow size={18} /> },
  { id: 'metadata',      label: 'Binary Metadata',   icon: <i className="fa-solid fa-fingerprint text-[18px]" /> },
  { id: 'queryplan',     label: 'Query Plan',        icon: <i className="fa-solid fa-diagram-project text-[18px]" /> },
];

export default function SmartDetect({ onDetect, onDetectFile, onNavigate }: SmartDetectProps) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<DetectResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced detection
  const runDetect = useCallback((text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!text.trim()) { setResults([]); setDetecting(false); return; }

    setDetecting(true);
    timerRef.current = setTimeout(() => {
      const detected = detectAll(text);
      setResults(detected);
      setDetecting(false);

      // Auto-redirect if top result >= 90%
      if (detected.length > 0 && detected[0].confidence >= 90) {
        onDetect(detected[0].tool, text);
      }
    }, 400);
  }, [onDetect]);

  useEffect(() => { return () => { if (timerRef.current) clearTimeout(timerRef.current); }; }, []);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    runDetect(value);
  }, [runDetect]);

  // File handling
  const handleFile = useCallback(async (file: File) => {
    const fileResult = detectFile(file);
    if (fileResult) {
      // Binary file → direct route
      onDetectFile(fileResult.tool, file);
      return;
    }

    // Text file → read content and detect
    try {
      const text = await file.text();
      setInput(text);

      const detected = detectAll(text);
      const extHint = getExtHint(file.name);

      // Boost ext-hinted tool if present
      if (extHint) {
        const hinted = detected.find(r => r.tool === extHint);
        if (hinted) hinted.confidence = Math.min(100, hinted.confidence + 5);
        detected.sort((a, b) => b.confidence - a.confidence);
      }

      setResults(detected);

      if (detected.length > 0 && detected[0].confidence >= 90) {
        onDetect(detected[0].tool, text);
      }
    } catch {
      // Can't read → try as binary
      onDetectFile('metadata', file);
    }
  }, [onDetect, onDetectFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // Check for pasted files
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) handleFile(file);
        return;
      }
    }
    // Text paste handled by onChange
  }, [handleFile]);

  const showSuggestions = results.length > 0 && results[0].confidence < 90;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider">
          <Wand2 size={14} />
          Smart Detect
        </div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Paste anything — we'll find the right tool</h2>
        <p className="text-sm text-slate-500">Paste text, drop a file, or pick a tool below</p>
      </div>

      {/* Input area */}
      <div
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 ${
          isDragging
            ? 'border-blue-400 bg-blue-50/50 scale-[1.01]'
            : input
            ? 'border-slate-300 bg-white'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <textarea
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onPaste={handlePaste}
          placeholder="Paste JSON, SQL, JWT, stack trace, log, markdown, cron expression, color code, epoch timestamp... or drop a file here"
          className="w-full h-48 p-5 bg-transparent rounded-2xl resize-none text-sm font-mono text-slate-700 placeholder:text-slate-400 focus:outline-none"
          spellCheck={false}
        />

        {/* Drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-blue-50/80 backdrop-blur-sm pointer-events-none">
            <div className="flex items-center gap-3 text-blue-600">
              <Upload size={24} />
              <span className="text-sm font-bold">Drop file to detect</span>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-slate-400 hover:text-blue-600 font-semibold transition-colors flex items-center gap-1.5"
            >
              <Upload size={12} />
              Upload file
            </button>
            {input && (
              <button
                onClick={() => { setInput(''); setResults([]); }}
                className="text-xs text-slate-400 hover:text-red-500 font-semibold transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          {detecting && (
            <div className="flex items-center gap-2 text-xs text-blue-500 font-semibold">
              <div className="w-3 h-3 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              Detecting...
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>

      {/* Suggestions */}
      {showSuggestions && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detected tools</p>
          <div className="grid gap-2">
            {results.map((r) => (
              <button
                key={r.tool}
                onClick={() => onDetect(r.tool, input)}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">{r.label}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    r.confidence >= 80 ? 'bg-green-100 text-green-700' :
                    r.confidence >= 65 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {r.confidence}%
                  </span>
                </div>
                <ArrowRight size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tool grid */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Or pick a tool</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TOOL_GRID.map((tool) => (
            <button
              key={tool.id}
              onClick={() => onNavigate(tool.id)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group text-left"
            >
              <span className="text-slate-400 group-hover:text-blue-500 transition-colors">{tool.icon}</span>
              <span className="text-xs font-bold text-slate-600 group-hover:text-blue-600 transition-colors truncate">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
