import { useEffect } from 'react';
import { X, Sparkles, Zap, Bug, Palette } from 'lucide-react';

interface Entry {
  version: string;
  date: string;
  items: { type: 'new' | 'improved' | 'fixed' | 'ux'; text: string }[];
}

const CHANGELOG: Entry[] = [
  {
    version: '1.6',
    date: 'Mar 2026',
    items: [
      { type: 'new',      text: 'Feedback modal — report bugs, request features, rate tools' },
      { type: 'new',      text: 'Assign GitHub issues to contributors directly from the app' },
      { type: 'ux',       text: 'Form auto-resets and shows screenshot tip after submitting' },
    ],
  },
  {
    version: '1.5',
    date: 'Mar 2026',
    items: [
      { type: 'new',      text: 'Text Compare — inline character-level diff highlighting' },
      { type: 'new',      text: 'Prev / next hunk navigation with keyboard-friendly controls' },
      { type: 'new',      text: 'Drag & drop files into either side of the diff editor' },
      { type: 'new',      text: 'Expand context per hunk + word wrap toggle' },
      { type: 'improved', text: 'Proper unified diff hunk headers (@@ -a,b +c,d @@)' },
    ],
  },
  {
    version: '1.4',
    date: 'Feb 2026',
    items: [
      { type: 'new',      text: 'Smart Detect — auto-detects input type and routes to the right tool' },
      { type: 'new',      text: 'Diagram Generator powered by Mermaid.js' },
      { type: 'improved', text: 'Log Analyzer optimized for 100k+ lines with virtual rendering' },
      { type: 'ux',       text: 'Sidebar Feedback button always pinned at the bottom' },
    ],
  },
  {
    version: '1.3',
    date: 'Jan 2026',
    items: [
      { type: 'new',      text: 'Query Plan Viewer with Gemini AI analysis (opt-in)' },
      { type: 'new',      text: 'Binary Metadata Explorer via ExifTool WebAssembly' },
      { type: 'fixed',    text: 'JWT Decode: handle tokens with non-standard padding' },
    ],
  },
  {
    version: '1.2',
    date: 'Dec 2025',
    items: [
      { type: 'new',      text: 'Mock Data Generator with faker.js (JSON / CSV / SQL output)' },
      { type: 'new',      text: 'Stack Trace Formatter for .NET, JS, Java, Python, Go, Ruby' },
      { type: 'improved', text: 'JSON Tools: auto-repair malformed JSON with jsonrepair' },
    ],
  },
];

const TYPE_CONFIG = {
  new:      { icon: Sparkles, color: 'text-blue-600',    bg: 'bg-blue-50',    label: 'New' },
  improved: { icon: Zap,      color: 'text-violet-600',  bg: 'bg-violet-50',  label: 'Improved' },
  fixed:    { icon: Bug,      color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Fixed' },
  ux:       { icon: Palette,  color: 'text-amber-600',   bg: 'bg-amber-50',   label: 'UX' },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangelogModal({ isOpen, onClose }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-black text-slate-800">What's New</h2>
            <p className="text-[11px] text-slate-400">DevToolKit release history</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
            <X size={15} />
          </button>
        </div>

        {/* Entries */}
        <div className="overflow-y-auto px-6 py-5 space-y-6">
          {CHANGELOG.map((entry, i) => (
            <div key={entry.version}>
              <div className="flex items-baseline gap-3 mb-3">
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${i === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  v{entry.version}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">{entry.date}</span>
                {i === 0 && <span className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Latest</span>}
              </div>
              <ul className="space-y-2">
                {entry.items.map((item, j) => {
                  const cfg = TYPE_CONFIG[item.type];
                  const Icon = cfg.icon;
                  return (
                    <li key={j} className="flex items-start gap-2.5">
                      <span className={`inline-flex items-center gap-1 shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color} mt-0.5`}>
                        <Icon size={10} />
                        {cfg.label}
                      </span>
                      <span className="text-sm text-slate-600">{item.text}</span>
                    </li>
                  );
                })}
              </ul>
              {i < CHANGELOG.length - 1 && <div className="mt-6 border-t border-slate-100" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
