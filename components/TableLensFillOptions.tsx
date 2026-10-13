import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { Copy, ListOrdered } from 'lucide-react';

import type { FillMode } from '@/utils/tableLensFill';

interface TableLensFillOptionsProps {
  /** Viewport rect of the last filled cell — the menu opens just below it */
  anchor: DOMRect;
  mode: FillMode;
  onChange: (mode: FillMode) => void;
  onClose: () => void;
}

const MENU_W = 200;
const MENU_H = 36;
const MARGIN = 8;

const OPTIONS: { mode: FillMode; label: string; Icon: typeof Copy }[] = [
  { mode: 'copy', label: 'Copy cells', Icon: Copy },
  { mode: 'series', label: 'Fill series', Icon: ListOrdered },
];

/** Excel-style "Auto Fill Options" — switch a just-applied fill between copying and continuing a series */
export default function TableLensFillOptions({ anchor, mode, onChange, onClose }: TableLensFillOptionsProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - MENU_W - MARGIN));
  const fitsBelow = anchor.bottom + MENU_H + MARGIN < window.innerHeight;
  const top = fitsBelow ? anchor.bottom + 4 : anchor.top - MENU_H - 4;

  return createPortal(
    <div
      ref={ref}
      role="group"
      aria-label="Auto fill options"
      style={{ position: 'fixed', left, top, zIndex: 9999 }}
      className="flex items-center gap-0.5 p-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl"
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
            mode === m
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Icon size={12} /> {label}
        </button>
      ))}
    </div>,
    document.body
  );
}
