import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Trash2, Upload, FileText, Eye, Columns2 } from 'lucide-react';

type ViewMode = 'split' | 'editor' | 'preview';

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

Supports **CommonMark** + **GFM** (GitHub Flavored Markdown).
`;

export default function MarkdownPreview() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const charCount = markdown.length;
  const lineCount = markdown.split('\n').length;

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'COPIED' : 'COPY RESULT'}
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
              <div className="markdown-body max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
