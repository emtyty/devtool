import React from 'react';
import { Filter, ListFilter, Code2, Braces, FileText, ArrowRight, Shield, Zap, Lock } from 'lucide-react';

interface Props {
  onNavigate: (tab: string) => void;
}

const TOOLS = [
  {
    id: 'dataformatter',
    icon: <Filter size={20} />,
    name: 'Data Formatter',
    color: 'blue',
    desc: 'Convert raw lists into SQL IN clauses, VALUES, UNION ALL, or CSV in one click.',
    badge: 'SQL Ready',
  },
  {
    id: 'listcleaner',
    icon: <ListFilter size={20} />,
    name: 'List Cleaner',
    color: 'violet',
    desc: 'Deduplicate, sort, trim, and normalize plain-text lists with live unique/dupe counts.',
    badge: 'Dedup',
  },
  {
    id: 'sqlformatter',
    icon: <Code2 size={20} />,
    name: 'SQL Formatter',
    color: 'emerald',
    desc: 'Format or minify SQL with dialect support. Parameters highlighted in pink.',
    badge: 'Format & Minify',
  },
  {
    id: 'jsontools',
    icon: <Braces size={20} />,
    name: 'JSON Tools',
    color: 'amber',
    desc: 'Format, minify, repair broken JSON, diff two payloads, tree view, and generate TypeScript interfaces.',
    badge: 'TS Generator',
  },
  {
    id: 'markdown',
    icon: <FileText size={20} />,
    name: 'Markdown Preview',
    color: 'pink',
    desc: 'Live side-by-side Markdown editor with GFM tables, task lists, and syntax-highlighted code blocks.',
    badge: 'GFM',
  },
  {
    id: 'metadata',
    icon: <i className="fa-solid fa-fingerprint" style={{ fontSize: 20 }} />,
    name: 'Binary Metadata',
    color: 'cyan',
    desc: 'Drop any binary file to extract EXIF, XMP, IPTC and hundreds of other metadata tags via WebAssembly ExifTool.',
    badge: 'WASM',
  },
  {
    id: 'queryplan',
    icon: <i className="fa-solid fa-diagram-project" style={{ fontSize: 20 }} />,
    name: 'SQL Query Plan',
    color: 'rose',
    desc: 'Visualize SQL Server execution plans and get AI-powered analysis via your own Gemini API key.',
    badge: 'AI Powered',
  },
];

const COLOR_MAP: Record<string, { bg: string; text: string; badge: string; hover: string }> = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    badge: 'bg-blue-100 text-blue-700',    hover: 'hover:border-blue-300' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700',  hover: 'hover:border-violet-300' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', hover: 'hover:border-emerald-300' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700',   hover: 'hover:border-amber-300' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-600',    badge: 'bg-pink-100 text-pink-700',    hover: 'hover:border-pink-300' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-600',    badge: 'bg-cyan-100 text-cyan-700',    hover: 'hover:border-cyan-300' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',    badge: 'bg-rose-100 text-rose-700',    hover: 'hover:border-rose-300' },
};

const PILLARS = [
  { icon: <Lock size={18} />, title: '100% Local', desc: 'Nothing leaves your browser. No uploads, no tracking, no telemetry.' },
  { icon: <Zap size={18} />, title: 'Instant', desc: 'WebAssembly-powered engine. No round-trips. Results in milliseconds.' },
  { icon: <Shield size={18} />, title: 'Private by Design', desc: 'AI features are opt-in and use only your own API key — never ours.' },
];

const LandingPage: React.FC<Props> = ({ onNavigate }) => {
  return (
    <div className="space-y-20 py-4">

      {/* Hero */}
      <section className="text-center space-y-6 pt-8">
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest">
          <Shield size={12} />
          Zero Server · Zero Tracking · 100% Browser
        </div>
        <h2 className="text-5xl font-black tracking-tighter text-slate-900 leading-none">
          Developer tools that<br />
          <span className="text-blue-600">respect your data.</span>
        </h2>
        <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
          Seven professional-grade tools. All running locally in your browser.
          No account. No subscription. No nonsense.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => onNavigate('dataformatter')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/20"
          >
            Launch App <ArrowRight size={16} />
          </button>
          <button
            onClick={() => onNavigate('metadata')}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-6 py-3 rounded-xl transition-colors border border-slate-200 shadow-sm"
          >
            Try Binary Metadata
          </button>
        </div>
      </section>

      {/* Pillars */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PILLARS.map(p => (
          <div key={p.title} className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-3 shadow-sm">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
              {p.icon}
            </div>
            <div>
              <div className="text-sm font-black text-slate-800">{p.title}</div>
              <div className="text-xs text-slate-500 mt-1 leading-relaxed">{p.desc}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Tools grid */}
      <section className="space-y-6">
        <div className="text-center">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Everything You Need</div>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">7 Tools. One Tab.</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {TOOLS.map(tool => {
            const c = COLOR_MAP[tool.color];
            return (
              <button
                key={tool.id}
                onClick={() => onNavigate(tool.id)}
                className={`group text-left bg-white border border-slate-200 ${c.hover} rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all`}
              >
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 ${c.bg} ${c.text} rounded-xl flex items-center justify-center`}>
                    {tool.icon}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${c.badge}`}>
                    {tool.badge}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-black text-slate-800 mb-1">{tool.name}</div>
                  <p className="text-xs text-slate-500 leading-relaxed">{tool.desc}</p>
                </div>
                <div className={`flex items-center gap-1 text-xs font-bold ${c.text} mt-auto opacity-0 group-hover:opacity-100 transition-opacity`}>
                  Open tool <ArrowRight size={12} />
                </div>
              </button>
            );
          })}
          {/* filler for grid alignment when 7 cards in 4-col grid */}
          <div className="hidden xl:block" />
        </div>
      </section>

      {/* Stack */}
      <section className="bg-slate-900 rounded-3xl p-10 text-center space-y-6">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Built With</div>
        <div className="flex flex-wrap items-center justify-center gap-6">
          {[
            ['fa-brands fa-react', 'React 19'],
            ['fa-solid fa-code', 'TypeScript'],
            ['fa-solid fa-bolt', 'Vite'],
            ['fa-solid fa-wind', 'Tailwind CSS'],
            ['fa-solid fa-microchip', 'WebAssembly'],
            ['fa-solid fa-robot', 'Gemini AI'],
          ].map(([icon, label]) => (
            <div key={label} className="flex items-center gap-2 text-slate-400">
              <i className={`${icon} text-slate-500`}></i>
              <span className="text-xs font-semibold">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.3em]">
          Powered by Coding4Pizza With Love
        </p>
      </section>

    </div>
  );
};

export default LandingPage;
