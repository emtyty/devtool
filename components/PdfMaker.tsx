import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, X, FilePlus2, Download, AlertTriangle, GripVertical,
  ChevronDown, ChevronUp, Loader2, ExternalLink, CheckCircle2,
} from 'lucide-react';
import {
  buildPdf, detectFileType, downloadPdf, getExcelSheetNames,
  type PdfItem, type PdfSettings,
} from '../utils/pdfMaker';

// ── Constants ──────────────────────────────────────────────────────

const SETTINGS_KEY = 'devtoolkit:pdf-maker:settings:v1';

const DEFAULT_SETTINGS: PdfSettings = {
  pageSize: 'A4',
  orientation: 'portrait',
  margin: 'normal',
};

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF', image: 'Image', docx: 'Word', xlsx: 'Excel',
};

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  image: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  docx:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  xlsx:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const FIDELITY_WARNING =
  'Formatting may not be fully preserved — complex layouts, fonts, and styles are not guaranteed.';

// ── Helpers ────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── Component ──────────────────────────────────────────────────────

const PdfMaker: React.FC = () => {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [settings, setSettings] = useState<PdfSettings>(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [outputBytes, setOutputBytes] = useState<Uint8Array | null>(null);
  const [outputFilename, setOutputFilename] = useState('output.pdf');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [pdfEditorHidden, setPdfEditorHidden] = useState(() => {
    try {
      const hidden: string[] = JSON.parse(localStorage.getItem('devtoolkit:hidden-tools') ?? '[]');
      return hidden.includes('pdfeditor');
    } catch {
      return false;
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIndexRef = useRef<number | null>(null);

  // Keep pdfEditorHidden in sync with storage changes (e.g. user toggles in Settings)
  useEffect(() => {
    const onStorage = () => {
      try {
        const hidden: string[] = JSON.parse(localStorage.getItem('devtoolkit:hidden-tools') ?? '[]');
        setPdfEditorHidden(hidden.includes('pdfeditor'));
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Load persisted settings
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) setSettings(JSON.parse(stored));
    } catch {
      // ignore malformed stored settings
    }
  }, []);

  // Persist settings on change
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // ── File ingestion ───────────────────────────────────────────────

  const addFiles = useCallback(async (files: File[]) => {
    const newItems: PdfItem[] = [];

    for (const file of files) {
      const fileType = detectFileType(file);
      if (!fileType) continue;

      const item: PdfItem = {
        id: crypto.randomUUID(),
        file,
        fileType,
        status: 'idle',
      };

      if (fileType === 'xlsx') {
        try {
          const sheets = await getExcelSheetNames(file);
          item.availableSheets = sheets;
          item.selectedSheets = [...sheets];
        } catch {
          item.availableSheets = [];
          item.selectedSheets = [];
        }
      }

      newItems.push(item);
    }

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
      setOutputBytes(null);
      setError(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(Array.from(e.target.files));
        e.target.value = '';
      }
    },
    [addFiles],
  );

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setOutputBytes(null);
  }, []);

  // ── Drag-to-reorder ──────────────────────────────────────────────

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleCardDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    setItems(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      dragIndexRef.current = index;
      return next;
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
  }, []);

  // ── Sheet selection ──────────────────────────────────────────────

  const toggleSheet = useCallback((itemId: string, sheet: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        const selected = item.selectedSheets ?? [];
        return {
          ...item,
          selectedSheets: selected.includes(sheet)
            ? selected.filter(s => s !== sheet)
            : [...selected, sheet],
        };
      }),
    );
  }, []);

  const toggleSheetExpand = useCallback((id: string) => {
    setExpandedSheets(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  // ── Settings ─────────────────────────────────────────────────────

  const updateSetting = useCallback(<K extends keyof PdfSettings>(key: K, value: PdfSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setOutputBytes(null);
  }, []);

  // ── Generate ─────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (items.length === 0) return;
    setGenerating(true);
    setError(null);
    setOutputBytes(null);
    try {
      const bytes = await buildPdf(items, settings, msg => setProgress(msg));
      setOutputBytes(bytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF generation failed');
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }, [items, settings]);

  const handleDownload = useCallback(() => {
    if (!outputBytes) return;
    downloadPdf(outputBytes, outputFilename);
  }, [outputBytes, outputFilename]);

  const handleOpenInEditor = useCallback(() => {
    if (!outputBytes) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        sessionStorage.setItem('devtoolkit:pdf-editor:pending', reader.result as string);
      } catch {
        // sessionStorage may be unavailable in some contexts
      }
      window.history.pushState({}, '', '/pdf-editor');
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
    reader.readAsDataURL(new Blob([outputBytes], { type: 'application/pdf' }));
  }, [outputBytes]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">PDF Maker</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Combine images, PDFs, Word, and Excel files into a single PDF — entirely in your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── Left column: drop zone + file list ── */}
        <div className="lg:col-span-7 space-y-4">

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload files"
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragOver
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-slate-800/50'
            }`}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <Upload className="mx-auto mb-3 text-slate-400 dark:text-slate-500" size={32} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Drop files here or{' '}
              <span className="text-blue-600 dark:text-blue-400">browse</span>
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              PDF · JPG · PNG · WebP · DOCX · XLSX
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
            className="hidden"
            onChange={handleFileInput}
          />

          {/* File list */}
          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Files ({items.length}) — drag to reorder
              </p>

              {items.map((item, index) => {
                const isWarning = item.fileType === 'docx' || item.fileType === 'xlsx';
                const isExpanded = expandedSheets.has(item.id);

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={e => handleCardDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg select-none"
                  >
                    {/* Card header row */}
                    <div className="flex items-center gap-2 p-3">
                      <GripVertical
                        size={16}
                        className="text-slate-300 dark:text-slate-600 cursor-grab shrink-0"
                      />

                      {/* File type badge */}
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider rounded px-1.5 py-0.5 shrink-0 ${FILE_TYPE_COLORS[item.fileType]}`}
                      >
                        {FILE_TYPE_LABELS[item.fileType]}
                      </span>

                      {/* Name + size */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {item.file.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {formatBytes(item.file.size)}
                        </p>
                      </div>

                      {/* Fidelity warning icon */}
                      {isWarning && (
                        <span title={FIDELITY_WARNING}>
                          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                        </span>
                      )}

                      {/* Sheet expand toggle (xlsx only) */}
                      {item.fileType === 'xlsx' && item.availableSheets && (
                        <button
                          onClick={() => toggleSheetExpand(item.id)}
                          className="flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                        >
                          Sheets
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}

                      <button
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeItem(item.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Sheet selector (xlsx, expanded) */}
                    {item.fileType === 'xlsx' && isExpanded && item.availableSheets && (
                      <div className="px-3 pb-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                          Select sheets to include:
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                          {item.availableSheets.map(sheet => (
                            <label
                              key={sheet}
                              className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300"
                            >
                              <input
                                type="checkbox"
                                checked={item.selectedSheets?.includes(sheet) ?? false}
                                onChange={() => toggleSheet(item.id, sheet)}
                                className="accent-blue-600"
                              />
                              {sheet}
                            </label>
                          ))}
                        </div>
                        {(item.selectedSheets?.length ?? 0) === 0 && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                            Select at least one sheet.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Fidelity warning text (docx / xlsx) */}
                    {isWarning && (
                      <div className="px-3 pb-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {FIDELITY_WARNING}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right column: settings + output ── */}
        <div className="lg:col-span-5 space-y-4">

          {/* Settings panel */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Settings</h2>

            <div className="space-y-3">
              {/* Page size */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Page Size
                </label>
                <select
                  value={settings.pageSize}
                  onChange={e =>
                    updateSetting('pageSize', e.target.value as PdfSettings['pageSize'])
                  }
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="Letter">Letter (8.5 × 11 in)</option>
                  <option value="Legal">Legal (8.5 × 14 in)</option>
                </select>
              </div>

              {/* Orientation */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Orientation
                </label>
                <div className="flex gap-2">
                  {(['portrait', 'landscape'] as const).map(o => (
                    <button
                      key={o}
                      onClick={() => updateSetting('orientation', o)}
                      className={`flex-1 py-2 text-sm rounded-lg border font-medium capitalize transition-colors ${
                        settings.orientation === o
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                          : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margins */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Margins
                </label>
                <select
                  value={settings.margin}
                  onChange={e =>
                    updateSetting('margin', e.target.value as PdfSettings['margin'])
                  }
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="none">None</option>
                  <option value="narrow">Narrow (0.25 in)</option>
                  <option value="normal">Normal (0.75 in)</option>
                  <option value="wide">Wide (1 in)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Output panel */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Output</h2>

            {/* Filename */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Filename
              </label>
              <input
                type="text"
                value={outputFilename}
                onChange={e => setOutputFilename(e.target.value)}
                placeholder="output.pdf"
                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Progress */}
            {progress && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 size={14} className="animate-spin shrink-0" />
                <span className="truncate">{progress}</span>
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={items.length === 0 || generating}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 text-white disabled:text-slate-400 dark:disabled:text-slate-500 rounded-lg text-sm font-semibold transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <FilePlus2 size={16} />
                  Generate PDF
                </>
              )}
            </button>

            {/* Download + Open in Editor */}
            {outputBytes && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 size={13} />
                  PDF ready — {formatBytes(outputBytes.byteLength)}
                </p>

                <button
                  onClick={handleDownload}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <Download size={16} />
                  Download PDF
                </button>

                <button
                  onClick={pdfEditorHidden ? undefined : handleOpenInEditor}
                  disabled={pdfEditorHidden}
                  title={pdfEditorHidden ? 'PDF Editor is hidden — re-enable it in Settings' : 'Open the generated PDF in PDF Editor'}
                  className={`w-full flex items-center gap-2 py-2 px-4 border rounded-lg text-sm transition-colors ${
                    pdfEditorHidden
                      ? 'border-slate-100 dark:border-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer'
                  }`}
                >
                  <ExternalLink size={14} className="shrink-0" />
                  <span>Open in PDF Editor</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfMaker;
