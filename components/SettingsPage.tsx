import React from 'react';
import { EyeOff, RotateCcw } from 'lucide-react';

interface ToolItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface ToolSection {
  title?: string;
  items: ToolItem[];
}

interface Props {
  sections: ToolSection[];
  hiddenTools: string[];
  onToggle: (id: string) => void;
  onHideGroup: (ids: string[]) => void;
  onShowGroup: (ids: string[]) => void;
  onResetAll: () => void;
}

export default function SettingsPage({ sections, hiddenTools, onToggle, onHideGroup, onShowGroup, onResetAll }: Props) {
  const totalHidden = hiddenTools.length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Customize which tools appear in the sidebar.</p>
        </div>
        {totalHidden > 0 && (
          <button
            onClick={onResetAll}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <RotateCcw size={13} />
            Reset to defaults
          </button>
        )}
      </div>

      {/* Local-only notice */}
      <div className="flex items-center gap-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3">
        <span className="text-base shrink-0">🔒</span>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Settings are saved locally in your browser — they never leave your device.
        </p>
      </div>

      {/* Tool sections */}
      {sections.map((section, si) => {
        const sectionIds = section.items.map(i => i.id);
        const allHidden = sectionIds.every(id => hiddenTools.includes(id));
        const noneHidden = sectionIds.every(id => !hiddenTools.includes(id));

        return (
          <div key={si} className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-slate-700/60 rounded-2xl overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-white/[0.03]">
              <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">
                {section.title ?? 'Other'}
              </span>
              <div className="flex items-center gap-3">
                {!noneHidden && (
                  <button
                    onClick={() => onShowGroup(sectionIds)}
                    className="text-[11px] font-bold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    Enable all
                  </button>
                )}
                {!allHidden && (
                  <button
                    onClick={() => onHideGroup(sectionIds)}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    Disable all
                  </button>
                )}
              </div>
            </div>

            {/* Tool items */}
            <div className="divide-y divide-slate-100 dark:divide-slate-700/40">
              {section.items.map(item => {
                const isVisible = !hiddenTools.includes(item.id);
                return (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`shrink-0 transition-colors ${isVisible ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600'}`}>
                      {item.icon}
                    </span>
                    <span className={`flex-1 text-sm font-semibold transition-colors ${isVisible ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 line-through'}`}>
                      {item.label}
                    </span>
                    {/* Toggle switch */}
                    <button
                      onClick={() => onToggle(item.id)}
                      role="switch"
                      aria-checked={isVisible}
                      aria-label={`${isVisible ? 'Disable' : 'Enable'} ${item.label}`}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isVisible ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                        isVisible ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      }`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {totalHidden > 0 && (
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5 pb-2">
          <EyeOff size={12} />
          {totalHidden} tool{totalHidden !== 1 ? 's' : ''} hidden from the sidebar
        </p>
      )}
    </div>
  );
}
