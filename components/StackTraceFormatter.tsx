import { useState, useMemo, useEffect } from 'react';
import { Terminal, Layers, Copy, Check, Eye, EyeOff } from 'lucide-react';
import ResizableSplit from './ResizableSplit';

// ── Types ────────────────────────────────────────────────────────────────────

type StackLanguage = 'javascript' | 'java' | 'python' | 'dotnet' | 'go' | 'ruby' | 'unknown';
type ViewMode = 'all' | 'user';

interface StackFrame {
  raw: string;
  type: 'error' | 'frame' | 'cause' | 'context' | 'other';
  isUserCode: boolean;
}

interface ParsedTrace {
  language: StackLanguage;
  frames: StackFrame[];
}

// ── Internal frame detection ─────────────────────────────────────────────────

const INTERNAL: Record<StackLanguage, RegExp[]> = {
  javascript: [
    /node_modules\//,
    /\(node:/,
    /\(internal\//,
    /webpack[:/]/,
    /at processTicksAndRejections/,
    /react-dom/,
    /next\/dist/,
    /chunk-/,
  ],
  java: [
    /\s+at java\./,
    /\s+at javax\./,
    /\s+at sun\./,
    /\s+at com\.sun\./,
    /\s+at org\.springframework\./,
    /\s+at org\.hibernate\./,
    /\s+at org\.apache\./,
  ],
  python: [/<frozen /, /site-packages/, /lib\/python/, /importlib/],
  dotnet: [/\s+at System\./, /\s+at Microsoft\./, /mscorlib/],
  go: [/runtime\/goexit/, /runtime\.gopanic/, /testing\.tRunner/],
  ruby: [/gems\//, /lib\/ruby\//],
  unknown: [],
};

// ── Language detection ────────────────────────────────────────────────────────

function detectLanguage(input: string): StackLanguage {
  if (/^\s+at .+\(.+\.java:\d+\)/m.test(input)) return 'java';
  if (/Traceback \(most recent call last\)/m.test(input) || /^\s+File ".+", line \d+/m.test(input)) return 'python';
  if (/^\s+at .+\(.*\.(js|ts|jsx|tsx|mjs|cjs):\d+:\d+\)/m.test(input) || /^\s+at .+:\d+:\d+$/m.test(input)) return 'javascript';
  if (/^\s+at .+ in .+\.cs:line \d+/m.test(input) || /System\.\w+Exception/m.test(input) || /Microsoft\.[\w.]+(?:Exception|Error)/m.test(input)) return 'dotnet';
  if (/goroutine \d+ \[/m.test(input) || /\.go:\d+/m.test(input)) return 'go';
  if (/from .+\.rb:\d+/m.test(input) || /\.rb:\d+:in `/m.test(input)) return 'ruby';
  // JS fallback: "at something (file:line:col)"
  if (/^\s+at /m.test(input)) return 'javascript';
  return 'unknown';
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseTrace(input: string): ParsedTrace {
  const language = detectLanguage(input);
  const patterns = INTERNAL[language];
  const frames: StackFrame[] = [];

  for (const raw of input.replace(/\\n/g, '\n').split('\n')) {
    const trimmed = raw.trim();

    if (!trimmed) {
      frames.push({ raw, type: 'other', isUserCode: false });
      continue;
    }

    // Error / exception header lines
    if (/^(Caused by: )?[\w.]+(?:Error|Exception|Warning|KeyboardInterrupt|SystemExit|GeneratorExit): /i.test(trimmed) ||
        /^System\.[\w.]+(?:Exception|Error)/i.test(trimmed)) {
      frames.push({ raw, type: 'cause', isUserCode: false });
      continue;
    }

    // Python traceback header
    if (trimmed.startsWith('Traceback (most recent call last):')) {
      frames.push({ raw, type: 'error', isUserCode: false });
      continue;
    }

    // Go goroutine header
    if (/^goroutine \d+ \[/.test(trimmed)) {
      frames.push({ raw, type: 'error', isUserCode: false });
      continue;
    }

    // Frame lines
    const isFrame =
      /^\s+at /.test(raw) ||                    // JS / Java / .NET
      /^\s+File ".+", line \d+/.test(raw) ||    // Python
      /^\s+from .+:\d+:in `/.test(raw) ||       // Ruby
      /^\s+.+:\d+:in `/.test(raw) ||            // Ruby (first frame)
      /\s+.+\.go:\d+/.test(raw);                // Go

    if (isFrame) {
      const isInternal = patterns.some(p => p.test(raw));
      frames.push({ raw, type: 'frame', isUserCode: !isInternal });
      continue;
    }

    // Python code context lines (indented under File line)
    if (/^\s{4,}\S/.test(raw) && language === 'python') {
      frames.push({ raw, type: 'context', isUserCode: true });
      continue;
    }

    // Go function name lines (before file path)
    if (language === 'go' && /^\w[\w./]*\(/.test(trimmed)) {
      frames.push({ raw, type: 'context', isUserCode: true });
      continue;
    }

    // Java "... N more" lines
    if (/^\s+\.\.\. \d+ more$/.test(raw)) {
      frames.push({ raw, type: 'other', isUserCode: false });
      continue;
    }

    frames.push({ raw, type: 'other', isUserCode: false });
  }

  return { language, frames };
}

// ── Syntax highlighter ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DIM = '#8896aa';   // "at", colons, parens — slightly brighter than before

function span(color: string, text: string, bold = false): string {
  return `<span style="color:${color}${bold ? ';font-weight:700' : ''}">${text}</span>`;
}

function highlightFrame(frame: StackFrame, lang: StackLanguage): string {
  const r = frame.raw;

  if (frame.type === 'error') return span('#fb923c', esc(r), true);
  if (frame.type === 'context') return span('#fde68a', esc(r));
  if (frame.type === 'other') return span(DIM, esc(r));

  if (frame.type === 'cause') {
    const m = /^((?:Caused by: )?)([\w.]+(?:Error|Exception|Warning|KeyboardInterrupt|SystemExit|GeneratorExit))(: ?)(.*)$/i.exec(r);
    if (m) return esc(m[1]) + span('#f87171', esc(m[2]), true) + span('#94a3b8', esc(m[3])) + span('#fde68a', esc(m[4]));
    return span('#f87171', esc(r), true);
  }

  if (frame.type === 'frame') {
    if (lang === 'javascript' || lang === 'unknown') {
      // "    at Method (file:line:col)"
      const m1 = /^(\s+at )([^\s(]+)( \()(.+):(\d+):(\d+)(\))$/.exec(r);
      if (m1) return span(DIM, esc(m1[1])) + span('#93c5fd', esc(m1[2]), true) + span(DIM, esc(m1[3])) + span('#94a3b8', esc(m1[4])) + span(DIM, ':') + span('#fdba74', esc(m1[5])) + span(DIM, ':') + span('#fdba74', esc(m1[6])) + span(DIM, esc(m1[7]));
      // "    at file:line:col"
      const m2 = /^(\s+at )(.+):(\d+):(\d+)$/.exec(r);
      if (m2) return span(DIM, esc(m2[1])) + span('#94a3b8', esc(m2[2])) + span(DIM, ':') + span('#fdba74', esc(m2[3])) + span(DIM, ':') + span('#fdba74', esc(m2[4]));
    }

    if (lang === 'java') {
      // "    at pkg.Class.method(File.java:42)"
      const m1 = /^(\s+at )([\w.$]+)\.([\w$<>[\]]+)(\()([\w$.]+\.java)(?::(\d+))?(\))$/.exec(r);
      if (m1) return span(DIM, esc(m1[1])) + span(DIM, esc(m1[2])) + span(DIM, '.') + span('#93c5fd', esc(m1[3]), true) + span(DIM, esc(m1[4])) + span('#94a3b8', esc(m1[5])) + (m1[6] ? span(DIM, ':') + span('#fdba74', esc(m1[6])) : '') + span(DIM, esc(m1[7]));
    }

    if (lang === 'python') {
      // "  File "path", line 42, in method"
      const m1 = /^(\s+File ")(.*?)(")(, line )(\d+)(, in )(.+)$/.exec(r);
      if (m1) return span(DIM, esc(m1[1])) + span('#94a3b8', esc(m1[2])) + span(DIM, esc(m1[3])) + span(DIM, esc(m1[4])) + span('#fdba74', esc(m1[5])) + span(DIM, esc(m1[6])) + span('#93c5fd', esc(m1[7]), true);
    }

    if (lang === 'dotnet') {
      // "   at Method() in File.cs:line 42"
      const m1 = /^(\s+at )(.+?)( in )(.*?)(:line )(\d+)$/.exec(r);
      if (m1) return span(DIM, esc(m1[1])) + span('#93c5fd', esc(m1[2]), true) + span(DIM, esc(m1[3])) + span('#94a3b8', esc(m1[4])) + span(DIM, esc(m1[5])) + span('#fdba74', esc(m1[6]));
      // "   at Method()" — no source info
      const m2 = /^(\s+at )(.+)$/.exec(r);
      if (m2) return span(DIM, esc(m2[1])) + span('#93c5fd', esc(m2[2]), true);
    }

    if (lang === 'go') {
      // "\t/path/to/file.go:42 +0x1c2"
      const m1 = /^(\s*)(.*\.go):(\d+)(.*)$/.exec(r);
      if (m1) return esc(m1[1]) + span('#94a3b8', esc(m1[2])) + span(DIM, ':') + span('#fdba74', esc(m1[3])) + span(DIM, esc(m1[4]));
    }

    if (lang === 'ruby') {
      // "  from path/file.rb:42:in `method'"
      const m1 = /^(\s+(?:from )?)(.*?):(\d+):(in `)(.*?)(')(.*)$/.exec(r);
      if (m1) return span(DIM, esc(m1[1])) + span('#94a3b8', esc(m1[2])) + span(DIM, ':') + span('#fdba74', esc(m1[3])) + span(DIM, esc(m1[4])) + span('#93c5fd', esc(m1[5]), true) + span(DIM, esc(m1[6]) + esc(m1[7]));
    }
  }

  return span('#94a3b8', esc(r));
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LANG_LABELS: Record<StackLanguage, string> = {
  javascript: 'JavaScript / Node.js',
  java: 'Java',
  python: 'Python',
  dotnet: '.NET / C#',
  go: 'Go',
  ruby: 'Ruby',
  unknown: 'Auto-detect',
};

const LANG_COLORS: Record<StackLanguage, string> = {
  javascript: 'text-yellow-400',
  java: 'text-orange-400',
  python: 'text-blue-400',
  dotnet: 'text-purple-400',
  go: 'text-cyan-400',
  ruby: 'text-red-400',
  unknown: 'text-slate-400',
};

const SAMPLE = `TypeError: Cannot read properties of null (reading 'value')
    at InputComponent.handleChange (src/components/Input.tsx:42:13)
    at processEvent (src/utils/events.ts:18:5)
    at HTMLElement.<anonymous> (webpack-internal:///./src/index.tsx:10:3)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at react-dom/cjs/react-dom.development.js:3990:14`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function StackTraceFormatter({ initialData }: { initialData?: string | null }) {
  const [input, setInput] = useState('');

  useEffect(() => { if (initialData) setInput(initialData); }, [initialData]);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('user');

  const parsed = useMemo(() => (input.trim() ? parseTrace(input) : null), [input]);

  const filtered = useMemo(() => {
    if (!parsed) return [];
    if (viewMode === 'user') return parsed.frames.filter(f => f.type !== 'frame' || f.isUserCode);
    return parsed.frames;
  }, [parsed, viewMode]);

  const stats = useMemo(() => {
    if (!parsed) return null;
    const total = parsed.frames.filter(f => f.type === 'frame').length;
    const userCode = parsed.frames.filter(f => f.type === 'frame' && f.isUserCode).length;
    return { total, userCode, internal: total - userCode };
  }, [parsed]);

  const highlighted = useMemo(
    () => parsed ? filtered.map(f => highlightFrame(f, parsed.language)) : [],
    [filtered, parsed],
  );

  const handleCopy = () => {
    if (!parsed) return;
    navigator.clipboard.writeText(filtered.map(f => f.raw).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leftPanel = (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px] h-full">
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Terminal size={14} className="text-slate-400" /> Stack Trace Input
        </span>
        <button
          onClick={() => setInput(SAMPLE)}
          className="text-[10px] font-black text-blue-500 hover:text-blue-700 uppercase tracking-widest transition-colors"
        >
          Load Sample
        </button>
      </div>
      <textarea
        className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-slate-700 placeholder:text-slate-300 bg-white leading-relaxed"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={'Paste a stack trace here...\n\nSupported runtimes:\n  JavaScript / Node.js\n  Java / JVM\n  Python\n  .NET / C#\n  Go\n  Ruby'}
      />
      {stats && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-4 flex-wrap">
          <span className="text-[10px] font-bold text-slate-500">
            <span className="text-slate-700">{stats.total}</span> frames
          </span>
          <span className="text-[10px] font-bold text-slate-500">
            <span className="text-green-600">{stats.userCode}</span> user code
          </span>
          <span className="text-[10px] font-bold text-slate-500">
            <span className="text-slate-400">{stats.internal}</span> internal
          </span>
        </div>
      )}
    </section>
  );

  const rightPanel = (
    <section className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col flex-1 overflow-hidden min-h-[500px]">
      <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
            <Layers size={14} /> Formatted Trace
          </span>
          {parsed && (
            <span className={`text-[10px] font-black uppercase tracking-widest ${LANG_COLORS[parsed.language]}`}>
              {LANG_LABELS[parsed.language]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-700 p-0.5 rounded-lg gap-0.5">
            <button
              onClick={() => setViewMode('all')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${
                viewMode === 'all' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye size={10} /> All
            </button>
            <button
              onClick={() => setViewMode('user')}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${
                viewMode === 'user' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <EyeOff size={10} /> User Code
            </button>
          </div>
          <button
            onClick={handleCopy}
            disabled={!parsed}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        {highlighted.length > 0 ? (
          <pre className="font-mono text-[13px] whitespace-pre-wrap leading-relaxed selection:bg-blue-500 selection:text-white">
            {highlighted.map((html, i) => {
              const frame = filtered[i];
              const dimmed = frame.type === 'frame' && !frame.isUserCode;
              return (
                <span
                  key={i}
                  className={dimmed ? 'opacity-50' : ''}
                  dangerouslySetInnerHTML={{ __html: html + '\n' }}
                />
              );
            })}
          </pre>
        ) : (
          <pre className="font-mono text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">
            {'// Formatted output will appear here...'}
          </pre>
        )}
      </div>
    </section>
  );

  return <ResizableSplit left={leftPanel} right={rightPanel} storageKey="split:stack-trace" />;
}
