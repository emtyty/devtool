import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: ReactNode;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  tabs: Tab[];
  currentMode: string;
}

export default function CommandPalette({ isOpen, onClose, onSelect, tabs, currentMode }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = query.trim()
    ? tabs.filter(t => t.label.toLowerCase().includes(query.toLowerCase()))
    : tabs;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0); }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const confirm = useCallback((id: string) => {
    onSelect(id);
    onClose();
  }, [onSelect, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && filtered[activeIndex]) { confirm(filtered[activeIndex].id); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, filtered, activeIndex, onClose, confirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Jump to tool…"
            className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} title="Clear search"
              className="text-slate-300 hover:text-slate-500 transition-colors">
              <X size={14} />
            </button>
          )}
          <kbd className="text-[10px] font-semibold text-slate-300 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <ul ref={listRef} className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-400">No tools match "{query}"</li>
          ) : filtered.map((tab, i) => (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => confirm(tab.id)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  i === activeIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className={`shrink-0 ${i === activeIndex ? 'text-blue-500' : 'text-slate-400'}`}>
                  {tab.icon}
                </span>
                <span className="font-medium">{tab.label}</span>
                {tab.id === currentMode && (
                  <span className="ml-auto text-[10px] font-bold text-slate-300 uppercase tracking-wide">Current</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-4 text-[11px] text-slate-300">
          <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
          <span><kbd className="font-semibold">Enter</kbd> open</span>
          <span><kbd className="font-semibold">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
