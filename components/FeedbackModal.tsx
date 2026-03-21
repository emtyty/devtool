import { useState, useEffect, useCallback } from 'react';
import { X, Star, ExternalLink, Copy, Check, MessageSquarePlus, ImagePlus } from 'lucide-react';

interface Contributor {
  login: string;
  avatar_url: string;
}

const GITHUB_REPO = 'https://github.com/emtyty/devtool';

const TOOL_LABELS: { id: string; label: string }[] = [
  { id: 'smartdetect',   label: 'Smart Detector' },
  { id: 'dataformatter', label: 'Data Formatter' },
  { id: 'listcleaner',   label: 'List Cleaner' },
  { id: 'sqlformatter',  label: 'SQL Formatter' },
  { id: 'jsontools',     label: 'JSON Tools' },
  { id: 'markdown',      label: 'Markdown Preview' },
  { id: 'stacktrace',    label: 'Stack Trace Formatter' },
  { id: 'mockdata',      label: 'Mock Data Generator' },
  { id: 'jwtdecode',     label: 'JWT Decode' },
  { id: 'texttools',     label: 'Text Tools' },
  { id: 'epoch',         label: 'Epoch Converter' },
  { id: 'color',         label: 'Color Converter' },
  { id: 'cron',          label: 'Cron Builder' },
  { id: 'logs',          label: 'Log Analyzer' },
  { id: 'textdiff',      label: 'Text Compare' },
  { id: 'diagram',       label: 'Diagram Generator' },
  { id: 'metadata',      label: 'Binary Metadata' },
  { id: 'queryplan',     label: 'Query Plan Viewer' },
  { id: 'general',       label: 'General / Other' },
];

const TYPES = [
  { id: 'bug',     label: '🐛 Bug Report',      ghLabel: 'bug' },
  { id: 'feature', label: '✨ Feature Request',  ghLabel: 'enhancement' },
  { id: 'ux',      label: '🎨 UX Improvement',   ghLabel: 'ux' },
  { id: 'general', label: '💬 General Feedback', ghLabel: 'question' },
];

const TYPE_FIELDS: Record<string, { label: string; placeholder: string }> = {
  bug:     { label: 'Describe the bug',      placeholder: 'Steps to reproduce:\n1. \n2. \n\nExpected:\n\nActual:\n' },
  feature: { label: 'Describe the feature',  placeholder: 'Use case / problem it solves:\n\nProposed solution:\n' },
  ux:      { label: 'Describe the UX issue', placeholder: 'Current experience:\n\nHow it should work:\n' },
  general: { label: 'Your message',          placeholder: 'Share your thoughts, suggestions, or questions…' },
};

const MAX_CHARS = 2000;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentTool?: string;
}

export default function FeedbackModal({ isOpen, onClose, currentTool }: Props) {
  const [tool, setTool] = useState(currentTool ?? 'general');
  const [type, setType] = useState('bug');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [assignee, setAssignee] = useState('');

  // Sync tool when currentTool changes externally
  useEffect(() => {
    if (isOpen) { setTool(currentTool ?? 'general'); setSubmitted(false); }
  }, [isOpen, currentTool]);

  // Fetch contributors once
  useEffect(() => {
    if (!isOpen || contributors.length > 0) return;
    fetch('https://api.github.com/repos/emtyty/devtool/contributors')
      .then(r => r.json())
      .then((data: Contributor[]) => Array.isArray(data) && setContributors(data))
      .catch(() => {});
  }, [isOpen, contributors.length]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const buildBody = useCallback(() => {
    const toolLabel = TOOL_LABELS.find(t => t.id === tool)?.label ?? tool;
    const typeLabel = TYPES.find(t => t.id === type)?.label ?? type;
    const stars = rating > 0 ? '⭐'.repeat(rating) + ` (${rating}/5)` : '_Not rated_';
    return [
      `**Tool:** ${toolLabel}`,
      `**Type:** ${typeLabel}`,
      `**Rating:** ${stars}`,
      ...(assignee ? [`**Assignee:** @${assignee}`] : []),
      '',
      '**Description:**',
      message.trim() || '_No description provided._',
      '',
      '---',
      '*Submitted via DevToolKit in-app feedback*',
    ].join('\n');
  }, [tool, type, rating, message, assignee]);

  const buildTitle = useCallback(() => {
    const toolLabel = TOOL_LABELS.find(t => t.id === tool)?.label ?? tool;
    const typeLabel = TYPES.find(t => t.id === type)?.label.replace(/^.+?\s/, '') ?? type;
    const prefix = message.trim().slice(0, 60);
    return `[${toolLabel}] ${typeLabel}${prefix ? ': ' + prefix : ''}`;
  }, [tool, type, message]);

  const openGitHubIssue = useCallback(() => {
    const ghLabel = TYPES.find(t => t.id === type)?.ghLabel ?? 'question';
    const url = new URL(`${GITHUB_REPO}/issues/new`);
    url.searchParams.set('title', buildTitle());
    url.searchParams.set('body', buildBody());
    url.searchParams.set('labels', ghLabel);
    if (assignee) url.searchParams.set('assignees', assignee);
    window.open(url.toString(), '_blank', 'noopener');
    // Reset form after submit
    setSubmitted(true);
    setMessage('');
    setRating(0);
    setAssignee('');
  }, [type, assignee, buildTitle, buildBody]);

  const copyToClipboard = useCallback(async () => {
    const text = `### ${buildTitle()}\n\n${buildBody()}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildTitle, buildBody]);

  if (!isOpen) return null;

  const activeRating = hoverRating || rating;
  const field = TYPE_FIELDS[type] ?? TYPE_FIELDS.general;

  // ── Success state ──
  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center">
              <Check size={28} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 mb-1">GitHub issue opened!</h2>
              <p className="text-sm text-slate-500">Your feedback was pre-filled in a new tab.</p>
            </div>
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-700 text-left w-full">
              <ImagePlus size={14} className="shrink-0 mt-0.5" />
              <span>Tip: You can attach <strong>screenshots or screen recordings</strong> directly on the GitHub issue page before submitting.</span>
            </div>
            <button type="button" onClick={() => { setSubmitted(false); onClose(); }}
              className="mt-1 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <MessageSquarePlus size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800">Send Feedback</h2>
              <p className="text-[11px] text-slate-400">Help us improve DevToolKit</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">

          {/* Tool */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Tool</label>
            <select
              value={tool}
              onChange={e => setTool(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            >
              {TOOL_LABELS.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => setType(t.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold text-left transition-all border ${
                    type === t.id
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee */}
          {contributors.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">
                Assign to <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {contributors.map(c => (
                  <button key={c.login} type="button"
                    onClick={() => setAssignee(a => a === c.login ? '' : c.login)}
                    title={`@${c.login}`}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-semibold transition-all ${
                      assignee === c.login
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}>
                    <img src={c.avatar_url} alt={c.login} className="w-4 h-4 rounded-full" />
                    {c.login}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rating */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">
              Rating <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button"
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(r => r === n ? 0 : n)}
                  className="transition-transform hover:scale-110">
                  <Star size={22}
                    className={`transition-colors ${n <= activeRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-[11px] text-slate-400 font-semibold">
                  {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating]}
                </span>
              )}
            </div>
          </div>

          {/* Message — dynamic label & placeholder based on type */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-wide">{field.label}</label>
              <span className={`text-[11px] font-semibold tabular-nums ${message.length > MAX_CHARS * 0.9 ? 'text-red-400' : 'text-slate-300'}`}>
                {message.length}/{MAX_CHARS}
              </span>
            </div>
            <textarea
              value={message}
              onChange={e => e.target.value.length <= MAX_CHARS && setMessage(e.target.value)}
              placeholder={field.placeholder}
              rows={5}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <button type="button" onClick={openGitHubIssue}
              disabled={!message.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all">
              <ExternalLink size={14} /> Open GitHub Issue
            </button>
            <button type="button" onClick={copyToClipboard}
              disabled={!message.trim()}
              title="Copy as Markdown"
              className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-xl transition-all">
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 text-center">
            No GitHub account?{' '}
            <span className="font-semibold">Copy</span> the feedback and paste it anywhere —
            email, Slack, or{' '}
            <a href={`${GITHUB_REPO}/issues`} target="_blank" rel="noopener noreferrer"
              className="text-blue-500 hover:underline">open an issue manually</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
