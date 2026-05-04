import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import mermaid from 'mermaid';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown as cmMarkdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap, EditorView } from '@codemirror/view';
import {
  Download,
  Printer,
  Trash2,
  Upload,
  FileText,
  Eye,
  Columns2,
  ImageDown,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListOrdered,
  Quote,
  Code,
  Table,
  ListTree,
} from 'lucide-react';

import ResizableSplit from './ResizableSplit';
import { parseHeadings, type Heading } from '../utils/markdownToc';

// ── Mermaid diagram renderer ─────────────────────────────────────────────────

let mermaidCounter = 0;

const MermaidBlock = React.memo(function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [zoomed, setZoomed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++mermaidCounter}`;
    mermaid
      .render(id, code)
      .then(({ svg: rendered }) => {
        if (cancelled) return;
        const clean = rendered
          .replace(/<rect[^>]*class="[^"]*background[^"]*"[^>]*\/?>/g, '')
          .replace(/(<svg[^>]*>)\s*<rect[^>]*fill="[^"]*"[^>]*\/?>/g, '$1');
        setSvg(clean);
        setError('');
        document.getElementById(id)?.remove();
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        document.getElementById(id)?.remove();
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const downloadSvg = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const canvas = await svgToCanvas();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'diagram.png';
    a.click();
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
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }, 'image/png');
    } catch {
      /* clipboard API not available */
    }
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
            onClick={(e) => e.stopPropagation()}
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
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">
                · Click outside to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

// ── Editor helpers ───────────────────────────────────────────────────────────

function wrapInView(view: EditorView, before: string, after = before, placeholder = 'text'): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = selected || placeholder;
  view.dispatch({
    changes: { from, to, insert: `${before}${insert}${after}` },
    selection: { anchor: from + before.length, head: from + before.length + insert.length },
  });
  view.focus();
  return true;
}

function prefixLinesInView(view: EditorView, prefix: string): boolean {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const changes = [];
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = view.state.doc.line(n);
    changes.push({ from: line.from, insert: prefix });
  }
  view.dispatch({ changes });
  view.focus();
  return true;
}

function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || 'text';
  const insert = `[${selected}](url)`;
  const urlStart = from + selected.length + 3;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlStart, head: urlStart + 3 },
  });
  view.focus();
  return true;
}

function insertCodeBlock(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const body = selected || 'code';
  const insert = `\`\`\`\n${body}\n\`\`\``;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 3, head: from + 3 },
  });
  view.focus();
  return true;
}

function insertTable(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const insert =
    '\n| Header | Header |\n|--------|--------|\n| Cell   | Cell   |\n| Cell   | Cell   |\n';
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length, head: from + insert.length },
  });
  view.focus();
  return true;
}

const editorKeymap = keymap.of([
  { key: 'Mod-b', run: (v) => wrapInView(v, '**') },
  { key: 'Mod-i', run: (v) => wrapInView(v, '*') },
  { key: 'Mod-Shift-x', run: (v) => wrapInView(v, '~~') },
  { key: 'Mod-e', run: (v) => wrapInView(v, '`') },
  { key: 'Mod-k', run: (v) => insertLink(v) },
]);

// ── Component ────────────────────────────────────────────────────────────────

type ViewMode = 'split' | 'editor' | 'preview';

mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

const DEFAULT_MARKDOWN = `# Welcome to Markdown Studio

A **rich**, *real-time* markdown editor with live preview, syntax highlighting, mermaid diagrams, and an outline.

> Tip: click any heading in the **On this page** outline to jump there. Drag the divider to resize.

## Quick start

Use the toolbar above to format text, or these keyboard shortcuts:

| Shortcut | Action |
|---|---|
| \`Ctrl + B\` | Bold |
| \`Ctrl + I\` | Italic |
| \`Ctrl + K\` | Insert link |
| \`Ctrl + E\` | Inline code |
| \`Ctrl + Shift + X\` | Strikethrough |

## Syntax-highlighted code

### JavaScript

\`\`\`javascript
async function fetchUsers(query) {
  const res = await fetch(\`/api/users?q=\${encodeURIComponent(query)}\`);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}
\`\`\`

### Python

\`\`\`python
from dataclasses import dataclass

@dataclass
class User:
    id: int
    name: str
    email: str | None = None

users = [User(1, "Alice"), User(2, "Bob", "bob@example.com")]
print([u.name for u in users if u.email])
\`\`\`

### SQL

\`\`\`sql
SELECT u.id, u.name, COUNT(o.id) AS orders
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.name
ORDER BY orders DESC
LIMIT 10;
\`\`\`

### TypeScript

\`\`\`typescript
interface ApiResponse<T> {
  data: T;
  error?: string;
}

const handle = <T,>(res: ApiResponse<T>): T => {
  if (res.error) throw new Error(res.error);
  return res.data;
};
\`\`\`

### Bash

\`\`\`bash
#!/bin/bash
set -euo pipefail

for file in *.log; do
  count=$(grep -c "ERROR" "$file" || true)
  echo "$file: $count errors"
done
\`\`\`

## Tables

| Feature | Status | Notes |
|---|---|---|
| **Live preview** | shipped | Updates as you type |
| **Syntax highlighting** | shipped | 190+ languages via highlight.js |
| **Mermaid diagrams** | shipped | Flowcharts, sequence, and more |
| **Outline / TOC** | shipped | Auto-generated, click to scroll |
| **Resizable split** | shipped | Drag the divider between panes |
| **Export** | shipped | HTML and PDF |
| ~~Cloud sync~~ | not needed | Local-first, by design |

## Task list

- [x] Format selection with toolbar buttons
- [x] Keyboard shortcuts wired up
- [x] Resizable split between editor and preview
- [x] Outline auto-built from headings
- [ ] Add your own content here

## Mermaid diagrams

\`\`\`mermaid
flowchart LR
    Edit[Edit markdown] --> Render{Render preview}
    Render --> Highlight[Highlight code]
    Render --> Diagram[Render mermaid]
    Render --> Outline[Build outline]
    Highlight --> Export[Export HTML/PDF]
    Diagram --> Export
    Outline --> Export
\`\`\`

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant E as Editor
    participant P as Preview

    U->>E: type markdown
    E-->>P: stream changes
    P->>P: render + highlight
    P-->>U: live preview
\`\`\`

## Inline formatting

Mix **bold**, *italic*, ***both***, ~~strikethrough~~, \`inline code\`, and [links](https://example.com) freely.

## Blockquote

> *"The best way to predict the future is to invent it."*
>
> — Alan Kay

---

Supports **CommonMark** + **GFM** + **Mermaid** + **highlight.js** for 190+ syntax languages.
`;

const EXPORT_STYLES = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; line-height: 1.7; font-size: 15px; }
    body.has-toc { max-width: 1200px; padding: 0 32px; display: grid; grid-template-columns: 220px 1fr; column-gap: 3em; align-items: start; }
    body.has-toc .md-content { min-width: 0; }
    body.has-toc h1:first-child, body.has-toc h2:first-child { margin-top: 0; }
    @media (max-width: 820px) { body.has-toc { grid-template-columns: 1fr; column-gap: 0; } }
    @media print {
      body.has-toc { display: grid; grid-template-columns: 200px 1fr; column-gap: 2em; max-width: 100%; margin: 0; padding: 1cm; }
      body.has-toc .md-toc { position: static; max-height: none; overflow: visible; font-size: 0.85em; }
    }
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
    .hljs-keyword,.hljs-built_in,.hljs-type,.hljs-selector-tag { color: #a626a4; }
    .hljs-string,.hljs-regexp,.hljs-literal { color: #50a14f; }
    .hljs-number,.hljs-symbol,.hljs-bullet { color: #986801; }
    .hljs-comment,.hljs-quote { color: #a0a1a7; font-style: italic; }
    .hljs-function,.hljs-title,.hljs-name { color: #4078f2; }
    .hljs-variable,.hljs-property,.hljs-attribute,.hljs-attr { color: #e45649; }
    .md-toc { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5em 1.5em; margin: 0 0 2em 0; position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow-y: auto; page-break-inside: avoid; }
    .md-toc-title { font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 700; margin: 0 0 0.85em 0; border: none; padding: 0; }
    .md-toc-list { list-style: none; padding: 0; margin: 0; }
    .md-toc-list li { margin: 0.35em 0; line-height: 1.4; }
    .md-toc-list a { color: #334155; text-decoration: none; font-size: 0.92em; border-bottom: 1px dotted transparent; }
    .md-toc-list a:hover { color: #2563eb; border-bottom-color: #93c5fd; }
    .md-toc-l1 { font-weight: 600; }
    .md-toc-l2 { padding-left: 1em; }
    .md-toc-l3 { padding-left: 2em; font-size: 0.95em; color: #475569; }
    .md-toc-l4 { padding-left: 3em; font-size: 0.9em; color: #64748b; }
    .md-toc-l5, .md-toc-l6 { padding-left: 4em; font-size: 0.88em; color: #64748b; }
  `;

interface ToolbarButton {
  icon: React.ReactNode;
  label: string;
  onClick: (view: EditorView) => void;
  group?: number;
}

// Stable components prop for ReactMarkdown — defined outside so reference never changes.
const MARKDOWN_COMPONENTS = {
  code({ className, children }: { className?: string; children?: React.ReactNode }) {
    const lang = /language-(\w+)/.exec(className || '')?.[1];
    const code = String(children).replace(/\n$/, '');
    if (lang === 'mermaid') return <MermaidBlock code={code} />;
    return <code className={className}>{children}</code>;
  },
};

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS: [typeof rehypeHighlight, { detect: boolean; ignoreMissing: boolean }][] = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

export default function MarkdownPreview({ initialData }: { initialData?: string | null }) {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [previewCopied, setPreviewCopied] = useState(false);
  const [showToc, setShowToc] = useState(true);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string>('');
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialData) setMarkdown(initialData);
  }, [initialData]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!previewFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewFullscreen]);

  const headings = useMemo(() => parseHeadings(markdown), [markdown]);
  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const charCount = markdown.length;
  const lineCount = markdown.split('\n').length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 225));

  // Assign IDs to rendered headings (in order) AND track active heading via IntersectionObserver.
  // Doing this post-render is more robust than a custom heading component, and avoids destabilizing
  // ReactMarkdown's components prop (which would remount mermaid blocks on every state change).
  useEffect(() => {
    const root = previewScrollRef.current;
    const content = previewRef.current;
    if (!root || !content) return;
    const headingEls = Array.from(
      content.querySelectorAll('h1, h2, h3, h4, h5, h6')
    ) as HTMLElement[];
    headingEls.forEach((el, i) => {
      const h = headings[i];
      if (h) el.id = h.id;
    });
    if (headingEls.length === 0) return;
    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first && (first.target as HTMLElement).id) {
          setActiveHeading((first.target as HTMLElement).id);
        }
      },
      { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );
    headingEls.forEach((el: HTMLElement) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings, markdown, viewMode, showToc]);

  // Manual scroll calculation — more reliable than scrollIntoView inside nested overflow containers.
  const scrollToHeading = useCallback((id: string) => {
    const root = previewScrollRef.current;
    const content = previewRef.current;
    if (!root || !content) return;
    const el = content.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) return;
    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const top = elRect.top - rootRect.top + root.scrollTop - 8;
    root.scrollTo({ top, behavior: 'smooth' });
    setActiveHeading(id);
  }, []);

  const buildHtmlDoc = () => {
    const node = previewRef.current;
    if (!node) return '';
    const clone = node.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('button').forEach((el) => el.remove());
    const content = clone.innerHTML;

    const includeToc = showToc && headings.length > 1;
    let tocHtml = '';
    if (includeToc) {
      const escape = (s: string) =>
        s
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      const items = headings
        .map(
          (h) =>
            `<li class="md-toc-l${h.level}"><a href="#${escape(h.id)}">${escape(h.text)}</a></li>`
        )
        .join('');
      tocHtml = `<nav class="md-toc"><div class="md-toc-title">On this page</div><ul class="md-toc-list">${items}</ul></nav>`;
    }

    const bodyClass = includeToc ? ' class="has-toc"' : '';
    const wrappedContent = includeToc ? `<main class="md-content">${content}</main>` : content;
    return `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Markdown Export</title><style>${EXPORT_STYLES}</style></head>\n<body${bodyClass}>${tocHtml}${wrappedContent}</body>\n</html>`;
  };

  const exportHtml = () => {
    const blob = new Blob([buildHtmlDoc()], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const html = buildHtmlDoc();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) return;
    win.addEventListener('load', () => {
      win.print();
      URL.revokeObjectURL(url);
    });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setMarkdown((ev.target?.result as string) || '');
    reader.readAsText(file);
    e.target.value = '';
  };

  const runOnEditor = useCallback((fn: (view: EditorView) => void) => {
    const view = editorRef.current?.view;
    if (!view) return;
    fn(view);
  }, []);

  const FORMAT_BUTTONS: ToolbarButton[] = [
    { icon: <Bold size={13} />, label: 'Bold (Ctrl+B)', onClick: (v) => wrapInView(v, '**'), group: 0 },
    { icon: <Italic size={13} />, label: 'Italic (Ctrl+I)', onClick: (v) => wrapInView(v, '*'), group: 0 },
    {
      icon: <Strikethrough size={13} />,
      label: 'Strikethrough',
      onClick: (v) => wrapInView(v, '~~'),
      group: 0,
    },
    {
      icon: <Heading1 size={13} />,
      label: 'Heading 1',
      onClick: (v) => prefixLinesInView(v, '# '),
      group: 1,
    },
    {
      icon: <Heading2 size={13} />,
      label: 'Heading 2',
      onClick: (v) => prefixLinesInView(v, '## '),
      group: 1,
    },
    {
      icon: <Heading3 size={13} />,
      label: 'Heading 3',
      onClick: (v) => prefixLinesInView(v, '### '),
      group: 1,
    },
    { icon: <Link2 size={13} />, label: 'Link (Ctrl+K)', onClick: (v) => insertLink(v), group: 2 },
    {
      icon: <List size={13} />,
      label: 'Bulleted list',
      onClick: (v) => prefixLinesInView(v, '- '),
      group: 2,
    },
    {
      icon: <ListOrdered size={13} />,
      label: 'Numbered list',
      onClick: (v) => prefixLinesInView(v, '1. '),
      group: 2,
    },
    {
      icon: <Quote size={13} />,
      label: 'Blockquote',
      onClick: (v) => prefixLinesInView(v, '> '),
      group: 2,
    },
    { icon: <Code size={13} />, label: 'Code block', onClick: (v) => insertCodeBlock(v), group: 3 },
    { icon: <Table size={13} />, label: 'Table', onClick: (v) => insertTable(v), group: 3 },
  ];

  const VIEW_BUTTONS: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
    { id: 'editor', icon: <FileText size={13} />, label: 'Editor' },
    { id: 'split', icon: <Columns2 size={13} />, label: 'Split' },
    { id: 'preview', icon: <Eye size={13} />, label: 'Preview' },
  ];

  const cmExtensions = useMemo(() => [cmMarkdown(), editorKeymap, EditorView.lineWrapping], []);
  const cmTheme = isDark ? oneDark : 'light';

  const editorPanel = (
    <section className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-full min-h-[500px]">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <FileText size={13} className="text-slate-400" />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Markdown Editor
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          ref={editorRef}
          value={markdown}
          onChange={setMarkdown}
          theme={cmTheme}
          extensions={cmExtensions}
          height="100%"
          style={{ height: '100%', fontSize: '14px' }}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
            autocompletion: false,
            searchKeymap: true,
          }}
          placeholder="Write markdown here..."
        />
      </div>
    </section>
  );

  const previewPanel = (
    <section className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-full min-h-[500px]">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <Eye size={13} className="text-slate-400" />
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Preview
        </span>
        <button
          onClick={() => setShowToc((v) => !v)}
          title={showToc ? 'Hide outline' : 'Show outline'}
          aria-label={showToc ? 'Hide outline' : 'Show outline'}
          aria-pressed={showToc}
          className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold shadow-sm transition-colors ${
            showToc
              ? 'bg-blue-50 border-blue-200 text-blue-600'
              : 'bg-white border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300'
          }`}
        >
          <ListTree size={11} /> Outline
        </button>
        <button
          onClick={() => setPreviewFullscreen((v) => !v)}
          title={previewFullscreen ? 'Exit fullscreen (Esc)' : 'Open preview in fullscreen'}
          aria-label={previewFullscreen ? 'Exit preview fullscreen' : 'Open preview in fullscreen'}
          aria-pressed={previewFullscreen}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold shadow-sm transition-colors ${
            previewFullscreen
              ? 'bg-blue-50 border-blue-200 text-blue-600'
              : 'bg-white border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300'
          }`}
        >
          {previewFullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          {previewFullscreen ? 'Exit' : 'Fullscreen'}
        </button>
        <button
          onClick={async () => {
            const node = previewRef.current;
            if (!node) return;
            const html = node.innerHTML;
            const source = markdown;
            let ok = false;
            try {
              if (typeof ClipboardItem !== 'undefined') {
                await navigator.clipboard.write([
                  new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([source], { type: 'text/plain' }),
                  }),
                ]);
                ok = true;
              } else {
                await navigator.clipboard.writeText(source);
                ok = true;
              }
            } catch {
              try {
                await navigator.clipboard.writeText(source);
                ok = true;
              } catch {
                /* clipboard unavailable */
              }
            }
            if (!ok) return;
            setPreviewCopied(true);
            setTimeout(() => setPreviewCopied(false), 2000);
          }}
          title="Copy as rich HTML (paste-friendly) and Markdown source"
          aria-label="Copy preview as rich HTML and Markdown source"
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-300 text-[10px] font-bold shadow-sm transition-colors"
        >
          {previewCopied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
          {previewCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {showToc && headings.length > 0 && (
          <nav
            aria-label="Document outline"
            className="hidden md:block w-48 lg:w-56 shrink-0 border-r border-slate-200 bg-slate-50/50 overflow-y-auto p-3"
          >
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 pb-2">
              On this page
            </div>
            <ul className="space-y-0.5">
              {headings.map((h: Heading, idx) => (
                <li key={`${h.id}-${idx}`}>
                  <button
                    onClick={() => scrollToHeading(h.id)}
                    className={`w-full text-left px-2 py-1 rounded text-[11px] leading-snug transition-colors truncate block ${
                      activeHeading === h.id
                        ? 'bg-blue-100 text-blue-700 font-semibold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                    style={{ paddingLeft: `${0.5 + (h.level - 1) * 0.75}rem` }}
                    title={h.text}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div ref={previewScrollRef} className="flex-1 overflow-auto p-6 scroll-smooth">
          <div ref={previewRef} className="markdown-body max-w-none">
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              components={MARKDOWN_COMPONENTS}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar Row 1: View mode, stats, file actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-white border border-slate-200 p-1 rounded-xl shadow-sm gap-0.5">
            {VIEW_BUTTONS.map((b) => (
              <button
                key={b.id}
                onClick={() => setViewMode(b.id)}
                aria-pressed={viewMode === b.id}
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

          <div className="hidden sm:flex items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
            <span>{lineCount} lines</span>
            <span className="text-blue-500">{readingTime} min read</span>
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

      {/* Toolbar Row 2: Markdown formatting (only visible when editor is shown) */}
      {viewMode !== 'preview' && (
        <div className="flex items-center gap-1 flex-wrap bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {FORMAT_BUTTONS.map((b, i) => {
            const prev = FORMAT_BUTTONS[i - 1];
            const showDivider = prev && prev.group !== b.group;
            return (
              <React.Fragment key={b.label}>
                {showDivider && <span className="w-px h-5 bg-slate-200 mx-1" />}
                <button
                  onClick={() => runOnEditor(b.onClick)}
                  title={b.label}
                  aria-label={b.label}
                  className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  {b.icon}
                </button>
              </React.Fragment>
            );
          })}
          <span className="ml-auto pr-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:inline">
            Ctrl+B · Ctrl+I · Ctrl+K · Ctrl+E
          </span>
        </div>
      )}

      {/* Panes — viewport-based height so internal scroll works for both editor and preview */}
      <div style={{ height: 'calc(100vh - 240px)', minHeight: '500px' }}>
        {viewMode === 'split' && !previewFullscreen && (
          <ResizableSplit
            left={editorPanel}
            right={previewPanel}
            storageKey="devtoolkit:markdown-split"
            className="h-full"
          />
        )}
        {viewMode === 'split' && previewFullscreen && <div className="h-full">{editorPanel}</div>}
        {viewMode === 'editor' && <div className="h-full">{editorPanel}</div>}
        {viewMode === 'preview' && !previewFullscreen && (
          <div className="h-full">{previewPanel}</div>
        )}
        {viewMode === 'preview' && previewFullscreen && (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            Preview is open in fullscreen — press Esc or click Exit to return.
          </div>
        )}
      </div>

      {previewFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Markdown preview fullscreen"
          className="fixed inset-0 z-[60] bg-white dark:bg-slate-950 p-3 sm:p-5 overflow-hidden"
        >
          <div className="h-full max-w-6xl mx-auto">{previewPanel}</div>
        </div>
      )}
    </div>
  );
}
