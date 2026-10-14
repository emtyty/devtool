import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { ClipboardPaste, X } from 'lucide-react';

import { nextColumnName, validateColumnName } from '@/utils/tableLensColumns';
import { parseClipboardGrid } from '@/utils/tableLensPaste';

const NEW_COLUMN = '\0__new__';

export interface PasteDialogResult {
  text: string;
  /** Target column, or null to create `newColumnName` */
  column: string | null;
  newColumnName: string;
  start: 'top' | 'selected';
  addRows: boolean;
}

interface TableLensPasteDialogProps {
  /** Visible columns in display order */
  columns: string[];
  /** Every column name, for validating a new column's name */
  allColumns: string[];
  initialColumn: string;
  /** 1-based on-screen row of the selected cell, if a cell is selected */
  selectedRowNumber: number | null;
  /** Rows currently on screen (after filters) */
  rowCount: number;
  onApply: (result: PasteDialogResult) => void;
  onClose: () => void;
}

function describePlan(lines: number, available: number, addRows: boolean) {
  const update = Math.min(lines, Math.max(0, available));
  const add = addRows ? lines - update : 0;
  return { update, add, skipped: lines - update - add };
}

/** Paste a list (one value per line, or tab-separated columns) into a column, optionally adding rows */
export default function TableLensPasteDialog({
  columns,
  allColumns,
  initialColumn,
  selectedRowNumber,
  rowCount,
  onApply,
  onClose,
}: TableLensPasteDialogProps) {
  const [text, setText] = useState('');
  const [column, setColumn] = useState(initialColumn || columns[0] || NEW_COLUMN);
  const [newName, setNewName] = useState(() => nextColumnName(allColumns));
  const [start, setStart] = useState<'top' | 'selected'>(selectedRowNumber ? 'selected' : 'top');
  const [addRows, setAddRows] = useState(true);

  const grid = useMemo(() => parseClipboardGrid(text), [text]);
  const width = grid.reduce((max, line) => Math.max(max, line.length), 0);
  const isNew = column === NEW_COLUMN;
  const nameError = isNew ? validateColumnName(newName, allColumns) : null;
  const startPos = start === 'selected' && selectedRowNumber ? selectedRowNumber - 1 : 0;
  const plan = describePlan(grid.length, rowCount - startPos, addRows);
  const canApply = grid.length > 0 && !nameError;

  const apply = () => {
    if (!canApply) return;
    onApply({ text, column: isNew ? null : column, newColumnName: newName.trim(), start, addRows });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Keep table shortcuts (undo, grid navigation) out of the dialog
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) apply();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-dialog-title"
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3
            id="paste-dialog-title"
            className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100"
          >
            <ClipboardPaste size={15} className="text-blue-500" /> Paste values
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Values to paste"
            placeholder={'One value per line…\nTab-separated values fill the columns to the right.'}
            className="w-full h-48 resize-y p-3 font-mono text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-400"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1 font-bold text-slate-500 dark:text-slate-400">
              Column
              <select
                value={column}
                onChange={(e) => setColumn(e.target.value)}
                className="font-normal border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={NEW_COLUMN}>+ New column…</option>
              </select>
            </label>
            {isNew && (
              <label className="flex flex-col gap-1 font-bold text-slate-500 dark:text-slate-400">
                New column name
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  aria-invalid={!!nameError}
                  className={`font-normal border rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none ${
                    nameError ? 'border-red-400' : 'border-slate-200 dark:border-slate-700 focus:border-blue-400'
                  }`}
                />
              </label>
            )}
            <fieldset className="flex flex-col gap-1">
              <legend className="font-bold text-slate-500 dark:text-slate-400 mb-1">Start at</legend>
              <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  checked={start === 'top'}
                  onChange={() => setStart('top')}
                  className="accent-blue-600"
                />
                First row
              </label>
              <label
                className={`flex items-center gap-2 ${selectedRowNumber ? 'text-slate-600 dark:text-slate-300 cursor-pointer' : 'text-slate-300 dark:text-slate-600'}`}
              >
                <input
                  type="radio"
                  disabled={!selectedRowNumber}
                  checked={start === 'selected'}
                  onChange={() => setStart('selected')}
                  className="accent-blue-600"
                />
                Selected row{selectedRowNumber ? ` (#${selectedRowNumber})` : ' (select a cell first)'}
              </label>
            </fieldset>
            <label className="flex items-center gap-2 self-end text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={addRows}
                onChange={(e) => setAddRows(e.target.checked)}
                className="accent-blue-600"
              />
              Add rows if the list is longer than the table
            </label>
          </div>

          <div
            aria-live="polite"
            className="text-xs rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400"
          >
            {nameError ? (
              <span className="text-red-500 dark:text-red-400">{nameError}</span>
            ) : grid.length === 0 ? (
              'Paste or type the values above.'
            ) : (
              <>
                {grid.length.toLocaleString()} line{grid.length > 1 ? 's' : ''}
                {width > 1 && ` × ${width} columns`} → update <b>{plan.update.toLocaleString()}</b> row
                {plan.update === 1 ? '' : 's'}
                {plan.add > 0 && (
                  <>
                    , add <b>{plan.add.toLocaleString()}</b> new
                  </>
                )}
                {plan.skipped > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    , {plan.skipped.toLocaleString()} won't fit
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            Ctrl+Enter to paste · follows the current sort and filter
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={!canApply}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg ${
                canApply
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              Paste
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
