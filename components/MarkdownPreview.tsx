import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { Download, Printer, Trash2, Upload, FileText, Eye, Columns2, ImageDown, Copy, Check } from 'lucide-react';

// ── Mermaid diagram renderer ─────────────────────────────────────────────────

let mermaidCounter = 0;

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [zoomed, setZoomed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSvg('');
    setError('');
    // Use a fresh ID each render so mermaid never reuses a stale/errored DOM node
    const id = `mermaid-${++mermaidCounter}`;
    mermaid.render(id, code)
      .then(({ svg: rendered }) => {
        // Strip the mermaid background rect so the SVG is transparent
        const clean = rendered.replace(/<rect[^>]*class="[^"]*background[^"]*"[^>]*\/?>/g, '')
          .replace(/(<svg[^>]*>)\s*<rect[^>]*fill="[^"]*"[^>]*\/?>/g, '$1');
        setSvg(clean);
        document.getElementById(id)?.remove();
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : String(e));
        document.getElementById(id)?.remove();
      });
  }, [code]);

  const downloadSvg = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'diagram.svg'; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = await svgToCanvas();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'diagram.png'; a.click();
  };

  const svgToCanvas = (scale = 2): Promise<HTMLCanvasElement> => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg')!;
    const vb = svgEl.viewBox.baseVal;
    const w = vb.width || parseFloat(svgEl.getAttribute('width') || '0') || 800;
    const h = vb.height || parseFloat(svgEl.getAttribute('height') || '0') || 600;
    svgEl.setAttribute('width', String(w));
    svgEl.setAttribute('height', String(h));
    const serialized = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const copyPng = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const canvas = await svgToCanvas();
      canvas.toBlob(async blob => {
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }, 'image/png');
    } catch { /* clipboard API not available */ }
  };

  if (error) {
    return (
      <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-mono">
        Mermaid error: {error}
      </div>
    );
  }
  if (!svg) return <div className="my-4 text-slate-400 text-xs italic">Rendering diagram…</div>;
  return (
    <>
      <div className="my-4 group relative">
        <div
          className="flex justify-center overflow-x-auto rounded-lg p-2 transition-opacity hover:opacity-90"
          style={{ cursor: 'zoom-in', background: 'transparent' }}
          title="Click to zoom"
          onClick={() => setZoomed(true)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copyPng}
            title="Copy as PNG"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 text-[10px] font-bold shadow-sm transition-colors"
          >
            {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={downloadSvg}
            title="Download SVG"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 text-[10px] font-bold shadow-sm transition-colors"
          >
            <Download size={11} /> SVG
          </button>
          <button
            onClick={downloadPng}
            title="Download PNG"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 text-[10px] font-bold shadow-sm transition-colors"
          >
            <ImageDown size={11} /> PNG
          </button>
        </div>
      </div>
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative w-[60vw] h-[60vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomed(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 text-xl font-bold leading-none z-10"
              aria-label="Close"
            >
              ×
            </button>
            <div
              className="flex-1 flex justify-center items-center p-8 overflow-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="flex items-center justify-center gap-3 py-3 border-t border-slate-100 bg-slate-50">
              <button
                onClick={copyPng}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 text-[10px] font-bold shadow-sm transition-colors"
              >
                {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={downloadSvg}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 text-[10px] font-bold shadow-sm transition-colors"
              >
                <Download size={11} /> SVG
              </button>
              <button
                onClick={downloadPng}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 text-[10px] font-bold shadow-sm transition-colors"
              >
                <ImageDown size={11} /> PNG
              </button>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">· Click outside to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type ViewMode = 'split' | 'editor' | 'preview';

mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

const DEFAULT_MARKDOWN = `# Welcome to Markdown Preview

Write markdown on the **left**, see the preview on the **right** — in real time.

## Features

- **Bold** and *italic* text
- ~~Strikethrough~~
- \`inline code\`
- [Links](https://example.com)
- Images and more

## Code Block

\`\`\`javascript
function hello(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Table

| Name       | Type    | Required |
|------------|---------|----------|
| id         | integer | yes      |
| name       | string  | yes      |
| email      | string  | no       |

## Task List

- [x] Live preview
- [x] GitHub Flavored Markdown
- [ ] Even more features

> Blockquote: *"Write once, preview instantly."*



## Mermaid Diagram

\`\`\`mermaid
flowchart LR
    A[Input] --> B{Process}
    B --> C[Output]
    B --> D[Error]
\`\`\`



\`\`\`mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Database

    Client ->> Server: Submit login details
    activate Server

    Server ->> Database: Query user credentials
    activate Database

    Database -->> Server: Return result (valid/invalid)
    deactivate Database

    alt If valid credentials
        Server -->> Client: Authentication successful message
    else If invalid credentials
        Server -->> Client: Error message (invalid credentials)
    end

    deactivate Server

\`\`\`

---
Supports **CommonMark** + **GFM** (GitHub Flavored Markdown) + **Mermaid** diagrams.
`;

const EXPORT_STYLES = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; line-height: 1.7; font-size: 15px; }
    h1,h2,h3,h4,h5,h6 { font-weight: 700; margin: 1.5em 0 0.5em; line-height: 1.3; color: #0f172a; }
    h1 { font-size: 2em; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
    h3 { font-size: 1.25em; }
    p { margin: 0.75em 0; }
    code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 0.15em 0.4em; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.875em; color: #0f172a; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25em 1.5em; overflow-x: auto; margin: 1em 0; }
    pre code { background: none; border: none; padding: 0; color: #1e293b; }
    blockquote { border-left: 4px solid #3b82f6; margin: 1em 0; padding: 0.5em 1em; background: #eff6ff; color: #1e40af; border-radius: 0 6px 6px 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e2e8f0; padding: 0.6em 1em; text-align: left; }
    th { background: #f8fafc; font-weight: 700; color: #0f172a; }
    tr:nth-child(even) td { background: #f8fafc; }
    a { color: #3b82f6; text-decoration: underline; }
    img { max-width: 100%; border-radius: 6px; }
    hr { border: none; border-top: 2px solid #e2e8f0; margin: 2em 0; }
    ul, ol { padding-left: 1.75em; margin: 0.5em 0; }
    li { margin: 0.3em 0; }
    input[type="checkbox"] { margin-right: 0.4em; }
    strong { font-weight: 700; color: #0f172a; }
    del { color: #94a3b8; }
    svg { max-width: 100%; height: auto; display: block; margin: 1em auto; }
  `;

export default function MarkdownPreview({ initialData }: { initialData?: string | null }) {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);

  useEffect(() => { if (initialData) setMarkdown(initialData); }, [initialData]);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const charCount = markdown.length;
  const lineCount = markdown.split('\n').length;

  const buildHtmlDoc = () => {
    const node = previewRef.current;
    if (!node) return '';
    const clone = node.cloneNode(true) as HTMLElement;
    // Remove mermaid action buttons (Copy/SVG/PNG overlays) — hidden by opacity-0
    // in the app but would appear in exported HTML without Tailwind CSS
    clone.querySelectorAll('button').forEach(el => el.remove());
    const content = clone.innerHTML;
    return `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Markdown Export</title><style>${EXPORT_STYLES}</style></head>\n<body>${content}</body>\n</html>`;
  };

  const exportHtml = () => {
    const blob = new Blob([buildHtmlDoc()], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'export.html'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const html = buildHtmlDoc();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) return;
    win.addEventListener('load', () => { win.print(); URL.revokeObjectURL(url); });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setMarkdown((ev.target?.result as string) || '');
    reader.readAsText(file);
    e.target.value = '';
  };

  const VIEW_BUTTONS: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
    { id: 'editor',  icon: <FileText size={13} />,  label: 'Editor' },
    { id: 'split',   icon: <Columns2 size={13} />,  label: 'Split' },
    { id: 'preview', icon: <Eye size={13} />,        label: 'Preview' },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm gap-0.5">
            {VIEW_BUTTONS.map(b => (
              <button
                key={b.id}
                onClick={() => setViewMode(b.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === b.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {b.icon} {b.label}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
            <span>{lineCount} lines</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt"
            className="hidden"
            onChange={handleImport}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg bg-white"
          >
            <Upload size={12} /> Import .md
          </button>
          <button
            onClick={exportHtml}
            className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-colors"
          >
            <Download size={12} /> Export HTML
          </button>
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm"
          >
            <Printer size={12} /> Export PDF
          </button>
          <button
            onClick={() => setMarkdown('')}
            title="Clear editor"
            aria-label="Clear editor"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors bg-white"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Panes */}
      <div
        className={`flex gap-4 min-h-[600px] ${
          viewMode === 'split' ? 'flex-row' : 'flex-col'
        }`}
      >
        {/* Editor */}
        {(viewMode === 'editor' || viewMode === 'split') && (
          <div
            className={`flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${
              viewMode === 'split' ? 'flex-1' : 'flex-1'
            }`}
          >
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <FileText size={13} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Markdown Editor</span>
            </div>
            <textarea
              className="flex-1 p-5 resize-none focus:outline-none font-mono text-sm text-slate-700 leading-relaxed placeholder:text-slate-300 bg-white"
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              placeholder="Write markdown here..."
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            className={`flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${
              viewMode === 'split' ? 'flex-1' : 'flex-1'
            }`}
          >
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <Eye size={13} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Preview</span>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div ref={previewRef} className="markdown-body max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children }) {
                      const lang = /language-(\w+)/.exec(className || '')?.[1];
                      const code = String(children).replace(/\n$/, '');
                      if (lang === 'mermaid') return <MermaidBlock code={code} />;
                      return <code className={className}>{children}</code>;
                    },
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
