import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { Download, Printer, Trash2, Upload, FileText, Eye, Columns2 } from 'lucide-react';

// ── Mermaid diagram renderer ─────────────────────────────────────────────────

let mermaidCounter = 0;

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSvg('');
    setError('');
    // Use a fresh ID each render so mermaid never reuses a stale/errored DOM node
    const id = `mermaid-${++mermaidCounter}`;
    mermaid.render(id, code)
      .then(({ svg: rendered }) => {
        setSvg(rendered);
        document.getElementById(id)?.remove();
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : String(e));
        document.getElementById(id)?.remove();
      });
  }, [code]);

  if (error) {
    return (
      <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-mono">
        Mermaid error: {error}
      </div>
    );
  }
  if (!svg) return <div className="my-4 text-slate-400 text-xs italic">Rendering diagram…</div>;
  return (
    <div
      className="my-4 flex justify-center overflow-x-auto rounded-lg bg-white p-2"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
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

---

Supports **CommonMark** + **GFM** (GitHub Flavored Markdown) + **Mermaid** diagrams.

## Mermaid Diagram

\`\`\`mermaid
flowchart LR
    A[Input] --> B{Process}
    B --> C[Output]
    B --> D[Error]
\`\`\`
`;

const EXPORT_STYLES = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; line-height: 1.6; }
    h1,h2,h3,h4,h5,h6 { font-weight: 700; margin: 1.5em 0 0.5em; }
    h1 { font-size: 2em; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
    code { background: #f1f5f9; border-radius: 4px; padding: 0.2em 0.4em; font-family: monospace; font-size: 0.9em; }
    pre { background: #1e293b; color: #e2e8f0; border-radius: 8px; padding: 1em; overflow-x: auto; }
    pre code { background: none; padding: 0; color: inherit; }
    blockquote { border-left: 4px solid #3b82f6; margin: 0; padding: 0.5em 1em; background: #eff6ff; color: #1e40af; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #e2e8f0; padding: 0.5em 1em; }
    th { background: #f8fafc; font-weight: 700; }
    a { color: #3b82f6; } img { max-width: 100%; } hr { border: none; border-top: 2px solid #e2e8f0; }
    ul, ol { padding-left: 1.5em; } li { margin: 0.25em 0; }
    input[type="checkbox"] { margin-right: 0.4em; }
  `;

export default function MarkdownPreview() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const charCount = markdown.length;
  const lineCount = markdown.split('\n').length;

  const buildHtmlDoc = () => {
    const content = previewRef.current?.innerHTML || '';
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
