import React from 'react';
import { Shield, Lock, Eye, Server, Key, Cookie, RefreshCw } from 'lucide-react';

const SECTIONS = [
  {
    icon: <Server size={18} />,
    title: 'Zero Server Processing',
    color: 'blue',
    points: [
      'Every tool runs entirely inside your browser — no data is ever uploaded or transmitted.',
      'JSON, SQL, Markdown, and list data you paste never leave your device.',
      'Binary files dropped for metadata extraction are read locally via WebAssembly (ExifTool compiled to WASM). They are never sent to any server.',
    ],
  },
  {
    icon: <Key size={18} />,
    title: 'AI Features Are Strictly Opt-In',
    color: 'violet',
    points: [
      'The SQL Query Plan AI analysis feature requires you to provide your own Google Gemini API key.',
      'Your API key is stored only in your browser\'s localStorage — it never passes through our servers.',
      'You can clear your key at any time from within the tool.',
      'No AI calls are made without your explicit action.',
    ],
  },
  {
    icon: <Eye size={18} />,
    title: 'No Tracking or Analytics',
    color: 'emerald',
    points: [
      'We do not use Google Analytics, Mixpanel, Hotjar, or any other analytics service.',
      'We do not collect page views, click events, session data, or usage telemetry.',
      'We do not run any third-party tracking scripts.',
    ],
  },
  {
    icon: <Cookie size={18} />,
    title: 'No Cookies',
    color: 'amber',
    points: [
      'DevToolKit sets no cookies of any kind.',
      'The only browser storage used is localStorage, exclusively to persist your opt-in Gemini API key and any UI preferences you set (e.g. SQL dialect).',
    ],
  },
  {
    icon: <Lock size={18} />,
    title: 'No Account Required',
    color: 'pink',
    points: [
      'There is no sign-up, no login, and no user account system.',
      'We collect no personal information whatsoever — no name, email, IP address, or device fingerprint.',
    ],
  },
  {
    icon: <RefreshCw size={18} />,
    title: 'Open Source & Auditable',
    color: 'cyan',
    points: [
      'The full source code is publicly available on GitHub.',
      'You can audit exactly what runs in your browser at any time.',
      'No obfuscated or minified code hidden from inspection in development.',
    ],
  },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-100' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-600',    border: 'border-pink-100' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-600',    border: 'border-cyan-100' },
};

const PrivacyPage: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto space-y-10 py-4">

      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 mx-auto">
          <Shield size={26} className="text-white" />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">Privacy Policy</h2>
        <p className="text-slate-500 text-sm leading-relaxed max-w-lg mx-auto">
          DevToolKit is built on a simple principle: <strong className="text-slate-700">your data belongs to you</strong>.
          Everything runs locally in your browser. We have no servers processing your data,
          no accounts storing your information, and no trackers watching your behavior.
        </p>
        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-4 py-1.5 rounded-full">
          <Shield size={12} />
          Last updated: March 2026
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {SECTIONS.map(section => {
          const c = COLOR_MAP[section.color];
          return (
            <div key={section.title} className={`bg-white border ${c.border} rounded-2xl p-6 shadow-sm`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-9 h-9 ${c.bg} ${c.text} rounded-xl flex items-center justify-center shrink-0`}>
                  {section.icon}
                </div>
                <h3 className="text-sm font-black text-slate-800">{section.title}</h3>
              </div>
              <ul className="space-y-2">
                {section.points.map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${c.bg.replace('bg-', 'bg-').replace('50', '400')} shrink-0`}
                      style={{ background: 'currentColor' }}
                    />
                    <span className={c.text.replace('600', '600')} style={{ color: 'inherit' }}>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Summary box */}
      <div className="bg-slate-900 rounded-2xl p-8 text-center space-y-3">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">The Short Version</div>
        <p className="text-white font-bold text-lg leading-snug">
          We never see your data.<br />
          <span className="text-slate-400 font-normal text-sm">Because it never leaves your computer.</span>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          {['No uploads', 'No tracking', 'No cookies', 'No account', 'No telemetry'].map(label => (
            <span key={label} className="text-[10px] font-bold text-slate-500 bg-slate-800 px-3 py-1 rounded-full">
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="text-center text-xs text-slate-400">
        Questions? Open an issue on{' '}
        <a
          href="https://github.com/emtyty/devtool"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600 font-semibold"
        >
          GitHub
        </a>
        .
      </div>

    </div>
  );
};

export default PrivacyPage;
