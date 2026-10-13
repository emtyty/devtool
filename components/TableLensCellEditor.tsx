import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type CommitMove = 'none' | 'down' | 'right' | 'left';

interface TableLensCellEditorProps {
  /** Viewport rect of the cell being edited — the editor opens on top of it */
  anchor: DOMRect;
  value: string;
  onChange: (value: string) => void;
  onCommit: (move: CommitMove) => void;
  onCancel: () => void;
}

const MIN_W = 320;
const MAX_H = 300;
const MARGIN = 8;

/** Floating multi-line cell editor. Enter saves, Shift/Alt+Enter adds a line, Tab saves and moves, Esc cancels. */
export default function TableLensCellEditor({ anchor, value, onChange, onCommit, onCancel }: TableLensCellEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Guards against a second commit from the blur that follows Enter/Tab/Esc
  const doneRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Auto-grow with content, from the cell height up to MAX_H
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, anchor.height), MAX_H)}px`;
  }, [value, anchor.height]);

  const finish = (fn: () => void) => {
    if (doneRef.current) return;
    doneRef.current = true;
    fn();
  };

  const insertNewline = (el: HTMLTextAreaElement) => {
    const { selectionStart: start, selectionEnd: end } = el;
    onChange(`${value.slice(0, start)}\n${value.slice(end)}`);
    requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Keep table-level shortcuts (undo, navigation) out of the editor
    e.stopPropagation();
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      insertNewline(e.currentTarget);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finish(() => onCommit('down'));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finish(() => onCommit(e.shiftKey ? 'left' : 'right'));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(onCancel);
    }
  };

  const width = Math.min(Math.max(anchor.width, MIN_W), window.innerWidth - MARGIN * 2);
  const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN));
  // Near the bottom of the viewport, grow upward from the cell's bottom edge instead
  const growUp = anchor.top + MAX_H > window.innerHeight - MARGIN;
  const position = growUp ? { bottom: window.innerHeight - anchor.bottom } : { top: anchor.top };

  return createPortal(
    <div
      data-cell-editor
      onMouseDown={(e) => {
        if (e.target !== ref.current) e.preventDefault();
      }}
      style={{ position: 'fixed', left, width, zIndex: 9999, ...position }}
      className="bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-md shadow-xl overflow-hidden"
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => finish(() => onCommit('none'))}
        aria-label="Edit cell"
        rows={1}
        className="block w-full resize-none bg-transparent px-2.5 py-1.5 text-xs leading-relaxed outline-none text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words"
      />
      <div className="px-2.5 py-1 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500 select-none">
        Enter save · Shift+Enter new line · Tab next · Esc cancel
      </div>
    </div>,
    document.body
  );
}
