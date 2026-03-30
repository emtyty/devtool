import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Download, Trash2, RotateCcw, GripVertical, FileText, Loader2 } from 'lucide-react';
import {
  loadPdfPages,
  loadPageForEditing,
  exportPdf,
  PdfPageData,
  PdfTextItem,
  EditedPageView,
  TextEdits,
} from '../utils/pdfEditor';

const VIEW_SCALE = 1.5;

// ── Drop Zone ──────────────────────────────────────────────────────

interface DropZoneProps {
  onFile: (f: File) => void;
  error: string | null;
}

const DropZone: React.FC<DropZoneProps> = ({ onFile, error }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">PDF Editor</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Edit text, sort or delete pages, then export a new PDF — everything runs in your browser.
        </p>
      </div>

      <div
        onDrop={e => {
          e.preventDefault();
          setIsDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onDragOver={e => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
          isDragOver
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10'
            : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-white/5'
        }`}
      >
        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-500/15 rounded-2xl flex items-center justify-center">
          <FileText size={32} className="text-blue-500" />
        </div>
        <div className="text-center">
          <p className="font-bold text-slate-700 dark:text-slate-200">Drop a PDF here</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">or click to browse</p>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Upload size={14} className="text-slate-400" />
          <span className="text-xs text-slate-400 dark:text-slate-500">PDF files only</span>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4 space-y-2">
        <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          What you can do
        </p>
        <ul className="text-sm text-slate-500 dark:text-slate-400 space-y-1.5">
          <li className="flex items-center gap-2">
            <span className="text-blue-400 text-xs font-bold">T</span>
            Click on any text in the PDF to edit it
          </li>
          <li className="flex items-center gap-2">
            <GripVertical size={14} className="text-blue-400 shrink-0" />
            Drag pages to reorder them
          </li>
          <li className="flex items-center gap-2">
            <Trash2 size={14} className="text-red-400 shrink-0" />
            Delete unwanted pages
          </li>
          <li className="flex items-center gap-2">
            <Download size={14} className="text-emerald-500 shrink-0" />
            Save as a new PDF file
          </li>
        </ul>
      </div>
    </div>
  );
};

// ── Sidebar Thumbnail ──────────────────────────────────────────────

interface SidebarThumbProps {
  page: PdfPageData;
  index: number;
  total: number;
  isSelected: boolean;
  hasEdits: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDelete: () => void;
}

const SidebarThumb: React.FC<SidebarThumbProps> = ({
  page,
  index,
  total,
  isSelected,
  hasEdits,
  onClick,
  onDragStart,
  onDrop,
  onDelete,
}) => {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={e => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => {
        setDragOver(false);
        onDrop();
      }}
      onClick={onClick}
      className={`group relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 shadow-md shadow-blue-200/50 dark:shadow-blue-900/30'
          : dragOver
          ? 'border-blue-400 scale-105'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <img
        src={page.thumbnail}
        alt={`Page ${index + 1}`}
        className="w-full block bg-white"
        draggable={false}
      />

      {/* Delete on hover */}
      <button
        onClick={e => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-red-500 hover:bg-red-600 text-white rounded p-0.5 transition-all cursor-pointer shadow"
        title="Delete page"
      >
        <Trash2 size={10} />
      </button>

      {/* Edited indicator */}
      {hasEdits && (
        <div className="absolute top-1 left-1 w-2 h-2 bg-yellow-400 rounded-full" title="Has edits" />
      )}

      {/* Page number */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-1">
        <span className="text-white text-[9px] font-bold">
          {index + 1}/{total}
        </span>
      </div>
    </div>
  );
};

// ── Text Overlay (single item) ─────────────────────────────────────
// Mirrors original PdfPage.tsx: contentEditable div that is text-transparent
// by default (PDF canvas shows the real text beneath), turns bg-white/text-black
// on focus and stays that way after editing so the change is visible.

interface TextOverlayProps {
  item: PdfTextItem;
  currentText: string;
  isEdited: boolean;
  onSave: (text: string) => void;
}

const TextOverlay: React.FC<TextOverlayProps> = ({ item, currentText, isEdited, onSave }) => {
  const [isFocused, setIsFocused] = useState(false);
  const hasEditedRef = useRef(false);

  return (
    <div
      contentEditable
      suppressContentEditableWarning
      onFocus={() => {
        setIsFocused(true);
        hasEditedRef.current = false;
      }}
      onInput={() => {
        hasEditedRef.current = true;
      }}
      onBlur={e => {
        setIsFocused(false);
        if (hasEditedRef.current) {
          onSave(e.currentTarget.textContent ?? '');
          hasEditedRef.current = false;
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).blur();
        }
        if (e.key === 'Escape') {
          (e.currentTarget as HTMLDivElement).blur();
        }
      }}
      className={`absolute flex items-center whitespace-pre outline-none rounded-sm transition-colors duration-150 ${
        isEdited
          ? 'bg-white text-black z-10'
          : 'text-transparent hover:bg-black/5 cursor-text z-10 focus:bg-white focus:text-black focus:z-20 focus:ring-1 focus:ring-blue-400/50'
      }`}
      style={{
        left: item.x,
        top: item.y,
        minWidth: item.width,
        height: item.height,
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        lineHeight: 1,
        padding: '0 2px',
        marginLeft: '-2px',
        caretColor: isFocused ? 'auto' : 'transparent',
      }}
    >
      {currentText}
    </div>
  );
};

// ── Page Edit View ─────────────────────────────────────────────────

interface PageEditViewProps {
  pageView: EditedPageView;
  pageOriginalIndex: number;
  edits: Map<number, string> | undefined;
  onTextEdit: (pageOriginalIndex: number, textItemIndex: number, newText: string) => void;
}

const PageEditView: React.FC<PageEditViewProps> = ({
  pageView,
  pageOriginalIndex,
  edits,
  onTextEdit,
}) => {
  return (
    <div className="p-6 flex justify-center">
      <div
        className="relative shadow-xl bg-white"
        style={{ width: pageView.viewWidth, height: pageView.viewHeight }}
      >
        <img
          src={pageView.dataUrl}
          alt="PDF page"
          className="block w-full h-full select-none pointer-events-none"
          draggable={false}
        />

        {pageView.textItems.map(item => {
          const currentText = edits?.get(item.index) ?? item.str;
          const isEdited = edits?.has(item.index) && edits.get(item.index) !== item.str;
          return (
            <TextOverlay
              key={item.index}
              item={item}
              currentText={currentText}
              isEdited={!!isEdited}
              onSave={text => onTextEdit(pageOriginalIndex, item.index, text)}
            />
          );
        })}
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────

const PdfEditor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PdfPageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [textEdits, setTextEdits] = useState<TextEdits>(new Map());
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [pageView, setPageView] = useState<EditedPageView | null>(null);
  const [loadingPageView, setLoadingPageView] = useState(false);

  const dragPageIndex = useRef<number | null>(null);

  const selectedOriginalIndex = pages[selectedPageIdx]?.originalIndex ?? -1;

  const loadFile = useCallback(async (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
      setError('Please select a PDF file.');
      return;
    }
    setError(null);
    setLoading(true);
    setFile(f);
    setTextEdits(new Map());
    setSelectedPageIdx(0);
    setPageView(null);
    try {
      const p = await loadPdfPages(f);
      setPages(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PDF.');
      setFile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load selected page for editing whenever it changes
  useEffect(() => {
    if (!file || selectedOriginalIndex < 0) return;
    let cancelled = false;

    setLoadingPageView(true);
    setPageView(null);

    loadPageForEditing(file, selectedOriginalIndex, VIEW_SCALE)
      .then(view => {
        if (!cancelled) setPageView(view);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render page.');
      })
      .finally(() => {
        if (!cancelled) setLoadingPageView(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, selectedOriginalIndex]);

  const movePage = useCallback((fromIndex: number, toIndex: number) => {
    setPages(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setSelectedPageIdx(prev => {
      if (prev === fromIndex) return toIndex;
      if (prev > fromIndex && prev <= toIndex) return prev - 1;
      if (prev < fromIndex && prev >= toIndex) return prev + 1;
      return prev;
    });
  }, []);

  const deletePage = useCallback((index: number) => {
    setPages(prev => prev.filter((_, i) => i !== index));
    setSelectedPageIdx(prev => {
      if (index < prev) return prev - 1;
      if (index === prev) return Math.max(0, prev - 1);
      return prev;
    });
  }, []);

  const updateTextEdit = useCallback(
    (pageOriginalIndex: number, textItemIndex: number, newText: string) => {
      setTextEdits((prev: TextEdits) => {
        const next = new Map<number, Map<number, string>>(prev);
        if (!next.has(pageOriginalIndex)) {
          next.set(pageOriginalIndex, new Map<number, string>());
        }
        const pageEdits = next.get(pageOriginalIndex)!;
        pageEdits.set(textItemIndex, newText);
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setFile(null);
    setPages([]);
    setError(null);
    setTextEdits(new Map());
    setPageView(null);
    setSelectedPageIdx(0);
  }, []);

  const save = useCallback(async () => {
    if (!file || pages.length === 0) return;
    setSaving(true);
    try {
      await exportPdf(file, pages, textEdits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save PDF.');
    } finally {
      setSaving(false);
    }
  }, [file, pages, textEdits]);

  if (!file && !loading) {
    return <DropZone onFile={loadFile} error={error} />;
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 size={40} className="text-blue-500 animate-spin" />
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          Loading pages...
        </p>
      </div>
    );
  }

  let editCount = 0;
  textEdits.forEach((m: Map<number, string>) => {
    editCount += m.size;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">PDF Editor</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">{file?.name}</span>
            {' — '}
            {pages.length} page{pages.length !== 1 ? 's' : ''}
            {editCount > 0 && (
              <span className="ml-2 text-yellow-600 dark:text-yellow-400 font-semibold">
                · {editCount} edit{editCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            New file
          </button>
          <button
            onClick={save}
            disabled={saving || pages.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Save PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {pages.length === 0 ? (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          All pages deleted. Click <strong>New file</strong> to start over.
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Sidebar — page thumbnails */}
          <div className="w-28 shrink-0 flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-200px)] pr-1">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1 shrink-0">
              Pages
            </p>
            {pages.map((page, index) => (
              <SidebarThumb
                key={`${page.originalIndex}-${index}`}
                page={page}
                index={index}
                total={pages.length}
                isSelected={index === selectedPageIdx}
                hasEdits={textEdits.has(page.originalIndex)}
                onClick={() => setSelectedPageIdx(index)}
                onDragStart={() => {
                  dragPageIndex.current = index;
                }}
                onDrop={() => {
                  if (dragPageIndex.current !== null && dragPageIndex.current !== index) {
                    movePage(dragPageIndex.current, index);
                  }
                  dragPageIndex.current = null;
                }}
                onDelete={() => deletePage(index)}
              />
            ))}
          </div>

          {/* Main editing area */}
          <div className="flex-1 bg-slate-100 dark:bg-slate-900/50 rounded-2xl overflow-auto max-h-[calc(100vh-200px)]">
            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-white/60 dark:bg-black/20 rounded-t-2xl">
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Page {selectedPageIdx + 1} of {pages.length}
              </span>
              <span className="text-slate-200 dark:text-slate-700">·</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Click on text to edit it
              </span>
            </div>

            {loadingPageView ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 size={32} className="text-blue-500 animate-spin" />
              </div>
            ) : pageView ? (
              <PageEditView
                pageView={pageView}
                pageOriginalIndex={pages[selectedPageIdx].originalIndex}
                edits={textEdits.get(pages[selectedPageIdx].originalIndex)}
                onTextEdit={updateTextEdit}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfEditor;
