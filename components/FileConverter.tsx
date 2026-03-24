import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import {
  Upload, Download, X, Image, Code2, Binary, Archive, Clipboard, Link2, History,
  RefreshCw, Loader2, CheckCircle2, AlertCircle, Copy, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  convertImage, convertData, fileToBase64, base64ToBlob, formatSize,
  DataConversionError,
  type ImageFormat, type DataFormat, type CsvDelimiter, type CsvQuoteChar, type DataConvertOptions, type WatermarkPosition,
} from '../utils/fileConverter';

// ── Types ──

type ConversionCategory = 'image' | 'data' | 'encode';

interface ConvertedFile {
  id: string;
  originalName: string;
  originalSize: number;
  resultBlob: Blob;
  resultName: string;
  resultSize: number;
  status: 'done' | 'error';
  error?: string;
  previewUrl?: string;
}

interface QueueItem {
  id: string;
  file: File;
  status: 'pending' | 'converting' | 'done' | 'error';
  error?: string;
  result?: ConvertedFile;
  dataFormat?: DataFormat;
}

interface ConversionHistoryItem {
  id: string;
  category: ConversionCategory;
  inputName: string;
  outputName: string;
  outputSize: number;
  createdAt: string;
  resultId?: string;
}

// ── Constants ──

const IMAGE_FORMATS: { value: ImageFormat; label: string; ext: string }[] = [
  { value: 'png', label: 'PNG', ext: '.png' },
  { value: 'jpeg', label: 'JPG', ext: '.jpg' },
  { value: 'webp', label: 'WebP', ext: '.webp' },
  { value: 'bmp', label: 'BMP', ext: '.bmp' },
  { value: 'avif', label: 'AVIF', ext: '.avif' },
];

const IMAGE_OUTPUT_OPTIONS: { id: string; label: string; value?: ImageFormat }[] = [
  { id: 'png', label: 'PNG', value: 'png' },
  { id: 'jpeg', label: 'JPG / JPEG', value: 'jpeg' },
  { id: 'webp', label: 'WEBP', value: 'webp' },
  { id: 'bmp', label: 'BMP', value: 'bmp' },
  { id: 'avif', label: 'AVIF', value: 'avif' },
  { id: 'svg', label: 'SVG' },
  { id: 'gif', label: 'GIF' },
  { id: 'ico', label: 'ICO' },
  { id: 'dds', label: 'DDS' },
  { id: 'tiff', label: 'TIFF' },
  { id: 'cur', label: 'CUR' },
  { id: 'psd', label: 'PSD' },
  { id: 'wbmp', label: 'WBMP' },
  { id: 'hdr', label: 'HDR' },
  { id: 'heic', label: 'HEIC' },
];

const DATA_FORMATS: { value: DataFormat; label: string; ext: string }[] = [
  { value: 'json', label: 'JSON', ext: '.json' },
  { value: 'csv', label: 'CSV', ext: '.csv' },
  { value: 'tsv', label: 'TSV', ext: '.tsv' },
  { value: 'xml', label: 'XML', ext: '.xml' },
  { value: 'yaml', label: 'YAML', ext: '.yaml' },
];

const DATA_MIME: Record<DataFormat, string> = {
  json: 'application/json;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  xml: 'application/xml;charset=utf-8',
  yaml: 'application/x-yaml;charset=utf-8',
};

const STORAGE_SETTINGS_KEY = 'devtoolkit:file-converter:settings:v1';
const STORAGE_HISTORY_KEY = 'devtoolkit:file-converter:history:v1';
const MB = 1024 * 1024;
const MAX_UPLOAD_BYTES: Record<ConversionCategory, number> = {
  image: 50 * MB,
  data: 20 * MB,
  encode: 30 * MB,
};

const IMAGE_SIZE_PRESETS: Array<{ value: string; label: string; width?: number; height?: number }> = [
  { value: 'original', label: 'Original' },
  { value: 'web-hero', label: 'Web Hero 1920×1080', width: 1920, height: 1080 },
  { value: 'instagram-square', label: 'Instagram 1080×1080', width: 1080, height: 1080 },
  { value: 'instagram-story', label: 'Story 1080×1920', width: 1080, height: 1920 },
  { value: 'thumbnail', label: 'Thumbnail 320×320', width: 320, height: 320 },
];

const DELIMITER_OPTIONS: Array<{ value: CsvDelimiter; label: string }> = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '|', label: 'Pipe (|)' },
  { value: '\t', label: 'Tab (\\t)' },
];

const WATERMARK_POSITIONS: Array<{ value: WatermarkPosition; label: string }> = [
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'center', label: 'Center' },
];

function csvDelimiterLabel(delimiter: CsvDelimiter): string {
  if (delimiter === '\t') return 'Tab';
  if (delimiter === ';') return 'Semicolon';
  if (delimiter === '|') return 'Pipe';
  return 'Comma';
}

function parseDelimitedPreview(
  text: string,
  delimiter: string,
  quoteChar: CsvQuoteChar,
  maxRows: number,
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === quoteChar && text[i + 1] === quoteChar) {
        field += quoteChar;
        i++;
      } else if (ch === quoteChar) {
        inQuote = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === quoteChar) {
      inQuote = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
      row.push(field);
      field = '';
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      if (rows.length >= maxRows) break;
      if (ch === '\r') i++;
      continue;
    }

    field += ch;
  }

  if (rows.length < maxRows) {
    row.push(field);
    if (row.some(cell => cell !== '')) rows.push(row);
  }

  return rows.slice(0, maxRows);
}

function truncateName(name: string, max = 80): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 3)}...`;
}

const CATEGORIES: { id: ConversionCategory; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'image', label: 'Image', icon: <Image size={16} />, desc: 'PNG, JPG, WebP, BMP' },
  { id: 'data', label: 'Data', icon: <Code2 size={16} />, desc: 'JSON, CSV, XML, YAML, TSV' },
  { id: 'encode', label: 'Encode', icon: <Binary size={16} />, desc: 'File ↔ Base64' },
];

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/bmp,image/avif,image/gif,image/svg+xml,image/tiff,image/heic,image/heif,image/vnd.adobe.photoshop,image/x-icon,image/vnd.microsoft.icon,.png,.jpg,.jpeg,.webp,.bmp,.gif,.svg,.ico,.dds,.tiff,.tif,.avif,.cur,.psd,.wbmp,.hdr,.heic,.heif';
const DATA_ACCEPT = '.json,.csv,.tsv,.xml,.yaml,.yml';

const DATA_EXT_TO_FORMAT: Record<string, DataFormat> = {
  json: 'json',
  csv: 'csv',
  tsv: 'tsv',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

const DATA_MIME_HINTS: Array<{ pattern: RegExp; format: DataFormat }> = [
  { pattern: /json/i, format: 'json' },
  { pattern: /(text\/csv|application\/csv|csv)/i, format: 'csv' },
  { pattern: /(tab-separated-values|tsv)/i, format: 'tsv' },
  { pattern: /xml/i, format: 'xml' },
  { pattern: /(yaml|yml|x-yaml)/i, format: 'yaml' },
];

function detectDataFormatFromFile(file: File): DataFormat | null {
  const extMatch = file.name.toLowerCase().match(/\.([a-z0-9]+)$/i);
  const ext = extMatch?.[1];
  if (ext && DATA_EXT_TO_FORMAT[ext]) return DATA_EXT_TO_FORMAT[ext];

  const type = file.type || '';
  const mimeHit = DATA_MIME_HINTS.find(item => item.pattern.test(type));
  return mimeHit?.format ?? null;
}

function detectDataFormatFromText(input: string): DataFormat | null {
  const text = input.trim();
  if (!text) return null;

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      JSON.parse(text);
      return 'json';
    } catch {
      // continue
    }
  }

  if (text.startsWith('<')) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      if (!doc.querySelector('parsererror')) return 'xml';
    } catch {
      // continue
    }
  }

  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const hasTsv = lines.some(line => line.includes('\t'));
  if (hasTsv) return 'tsv';

  const hasCsv = lines.some(line => line.includes(','));
  if (hasCsv) return 'csv';

  const yamlLike = lines.some(line => /^[-\s]*[A-Za-z0-9_"'.-]+\s*:\s*.+$/.test(line));
  if (yamlLike || lines[0] === '---') return 'yaml';

  return null;
}

let idCounter = 0;
const uid = () => `fc_${++idCounter}_${Date.now()}`;

// ── Example data ──

const EXAMPLE_BASE64 = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzNiODJmNiIgcng9IjE2Ii8+PHRleHQgeD0iNTAiIHk9IjU1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSIgZm9udC1zaXplPSIxNCIgZm9udC1mYW1pbHk9InN5c3RlbS11aSI+RGV2VG9vbDwvdGV4dD48L3N2Zz4=`;

// ── Component ──

const FileConverter: React.FC = () => {
  const [category, setCategory] = useState<ConversionCategory>('image');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [results, setResults] = useState<ConvertedFile[]>([]);
  const [converting, setConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [supportsAvifOutput, setSupportsAvifOutput] = useState(false);

  // Image options
  const [imgTarget, setImgTarget] = useState<ImageFormat>('webp');
  const [imgTargets, setImgTargets] = useState<ImageFormat[]>(['webp']);
  const [imgMultiOutput, setImgMultiOutput] = useState(false);
  const [imgQuality, setImgQuality] = useState(92);
  const [imgMaxWidth, setImgMaxWidth] = useState<number | ''>('');
  const [imgMaxHeight, setImgMaxHeight] = useState<number | ''>('');
  const [imgResizePreset, setImgResizePreset] = useState('original');
  const [imgStripExif, setImgStripExif] = useState(true);
  const [imgWatermarkText, setImgWatermarkText] = useState('');
  const [imgWatermarkOpacity, setImgWatermarkOpacity] = useState(22);
  const [imgWatermarkPosition, setImgWatermarkPosition] = useState<WatermarkPosition>('bottom-right');

  // Data options
  const [dataTo, setDataTo] = useState<DataFormat>('csv');
  const [dataTargets, setDataTargets] = useState<DataFormat[]>(['csv']);
  const [dataMultiOutput, setDataMultiOutput] = useState(false);
  const [dataDelimiter, setDataDelimiter] = useState<CsvDelimiter>(',');
  const [dataQuoteChar, setDataQuoteChar] = useState<CsvQuoteChar>('"');
  const [dataHasHeader, setDataHasHeader] = useState(true);
  const [dataFlattenJson, setDataFlattenJson] = useState(true);

  // Encode options
  const [encodeMode, setEncodeMode] = useState<'toBase64' | 'fromBase64'>('toBase64');
  const [base64Input, setBase64Input] = useState('');
  const [base64Output, setBase64Output] = useState('');

  // Data text mode
  const [dataTextInput, setDataTextInput] = useState('');
  const [dataTextOutput, setDataTextOutput] = useState('');
  const [copiedDataOutput, setCopiedDataOutput] = useState(false);
  const [dataPreviewSource, setDataPreviewSource] = useState<string>('');
  const [dataPreviewFormat, setDataPreviewFormat] = useState<DataFormat>('json');
  const [dataErrorInfo, setDataErrorInfo] = useState<{ message: string; line?: number; column?: number } | null>(null);

  const [history, setHistory] = useState<ConversionHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showDataAdvanced, setShowDataAdvanced] = useState(false);
  const [showImageAdvanced, setShowImageAdvanced] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──

  useEffect(() => {
    let active = true;

    const detectAvifSupport = async () => {
      try {
        if (typeof OffscreenCanvas !== 'undefined') {
          const canvas = new OffscreenCanvas(1, 1);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            if (active) setSupportsAvifOutput(false);
            return;
          }
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, 1, 1);
          const blob = await canvas.convertToBlob({ type: 'image/avif', quality: 0.8 });
          if (active) setSupportsAvifOutput(blob.type === 'image/avif' && blob.size > 0);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx || !canvas.toBlob) {
          if (active) setSupportsAvifOutput(false);
          return;
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1, 1);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/avif', 0.8));
        if (active) setSupportsAvifOutput(Boolean(blob && blob.type === 'image/avif' && blob.size > 0));
      } catch {
        if (active) setSupportsAvifOutput(false);
      }
    };

    detectAvifSupport();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!supportsAvifOutput && imgTarget === 'avif') {
      setImgTarget('webp');
    }
  }, [supportsAvifOutput, imgTarget]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const rawSettings = window.localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (rawSettings) {
        const saved = JSON.parse(rawSettings) as Partial<{
          imgTarget: ImageFormat;
          imgTargets: ImageFormat[];
          imgMultiOutput: boolean;
          imgQuality: number;
          imgMaxWidth: number | '';
          imgMaxHeight: number | '';
          imgResizePreset: string;
          imgStripExif: boolean;
          imgWatermarkText: string;
          imgWatermarkOpacity: number;
          imgWatermarkPosition: WatermarkPosition;
          dataTo: DataFormat;
          dataTargets: DataFormat[];
          dataMultiOutput: boolean;
          dataDelimiter: CsvDelimiter;
          dataQuoteChar: CsvQuoteChar;
          dataHasHeader: boolean;
          dataFlattenJson: boolean;
        }>;

        if (saved.imgTarget) setImgTarget(saved.imgTarget);
        if (Array.isArray(saved.imgTargets) && saved.imgTargets.length > 0) setImgTargets(saved.imgTargets);
        if (typeof saved.imgMultiOutput === 'boolean') setImgMultiOutput(saved.imgMultiOutput);
        if (typeof saved.imgQuality === 'number' && Number.isFinite(saved.imgQuality)) setImgQuality(Math.max(10, Math.min(100, Math.round(saved.imgQuality))));
        if (saved.imgMaxWidth === '' || typeof saved.imgMaxWidth === 'number') setImgMaxWidth(saved.imgMaxWidth);
        if (saved.imgMaxHeight === '' || typeof saved.imgMaxHeight === 'number') setImgMaxHeight(saved.imgMaxHeight);
        if (typeof saved.imgResizePreset === 'string') setImgResizePreset(saved.imgResizePreset);
        if (typeof saved.imgStripExif === 'boolean') setImgStripExif(saved.imgStripExif);
        if (typeof saved.imgWatermarkText === 'string') setImgWatermarkText(saved.imgWatermarkText);
        if (typeof saved.imgWatermarkOpacity === 'number' && Number.isFinite(saved.imgWatermarkOpacity)) {
          setImgWatermarkOpacity(Math.max(5, Math.min(70, Math.round(saved.imgWatermarkOpacity))));
        }
        if (saved.imgWatermarkPosition) setImgWatermarkPosition(saved.imgWatermarkPosition);

        if (saved.dataTo) setDataTo(saved.dataTo);
        if (Array.isArray(saved.dataTargets) && saved.dataTargets.length > 0) setDataTargets(saved.dataTargets);
        if (typeof saved.dataMultiOutput === 'boolean') setDataMultiOutput(saved.dataMultiOutput);
        if (saved.dataDelimiter) setDataDelimiter(saved.dataDelimiter);
        if (saved.dataQuoteChar) setDataQuoteChar(saved.dataQuoteChar);
        if (typeof saved.dataHasHeader === 'boolean') setDataHasHeader(saved.dataHasHeader);
        if (typeof saved.dataFlattenJson === 'boolean') setDataFlattenJson(saved.dataFlattenJson);
      }
    } catch {
      // ignore corrupted local settings
    }

    try {
      const rawHistory = window.localStorage.getItem(STORAGE_HISTORY_KEY);
      if (rawHistory) {
        const savedHistory = JSON.parse(rawHistory) as ConversionHistoryItem[];
        if (Array.isArray(savedHistory)) {
          setHistory(savedHistory.slice(0, 40));
        }
      }
    } catch {
      // ignore corrupted history
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify({
        imgTarget,
        imgTargets,
        imgMultiOutput,
        imgQuality,
        imgMaxWidth,
        imgMaxHeight,
        imgResizePreset,
        imgStripExif,
        imgWatermarkText,
        imgWatermarkOpacity,
        imgWatermarkPosition,
        dataTo,
        dataTargets,
        dataMultiOutput,
        dataDelimiter,
        dataQuoteChar,
        dataHasHeader,
        dataFlattenJson,
      }));
    } catch {
      // local storage may be unavailable
    }
  }, [
    imgTarget, imgTargets, imgMultiOutput, imgQuality, imgMaxWidth, imgMaxHeight,
    imgResizePreset, imgStripExif,
    imgWatermarkText, imgWatermarkOpacity, imgWatermarkPosition,
    dataTo, dataTargets, dataMultiOutput, dataDelimiter, dataQuoteChar, dataHasHeader, dataFlattenJson,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 40)));
    } catch {
      // local storage may be unavailable
    }
  }, [history]);

  const queuedDataFormats = useMemo<DataFormat[]>(() => {
    if (category !== 'data') return [];
    const detected = queue
      .filter(item => item.status === 'pending' || item.status === 'converting')
      .map(item => item.dataFormat)
      .filter((format): format is DataFormat => Boolean(format));
    return Array.from(new Set(detected));
  }, [category, queue]);

  const dataOutputOptions = useMemo(() => {
    if (queuedDataFormats.length === 0) return DATA_FORMATS;
    return DATA_FORMATS.filter(option => queuedDataFormats.every(input => input !== option.value));
  }, [queuedDataFormats]);

  const supportedImageTargets = useMemo(
    () => IMAGE_OUTPUT_OPTIONS
      .filter((option): option is { id: string; label: string; value: ImageFormat } => Boolean(option.value))
      .filter(option => !(option.value === 'avif' && !supportsAvifOutput))
      .map(option => option.value),
    [supportsAvifOutput],
  );

  useEffect(() => {
    if (category !== 'data') return;
    if (dataOutputOptions.length === 0) return;
    if (!dataOutputOptions.some(option => option.value === dataTo)) {
      setDataTo(dataOutputOptions[0].value);
    }
  }, [category, dataOutputOptions, dataTo]);

  useEffect(() => {
    if (!supportedImageTargets.includes(imgTarget)) {
      setImgTarget(supportedImageTargets[0] ?? 'webp');
    }
  }, [imgTarget, supportedImageTargets]);

  useEffect(() => {
    const allowed = new Set(dataOutputOptions.map(option => option.value));
    setDataTargets(prev => {
      const filtered = prev.filter(target => allowed.has(target));
      if (filtered.length > 0) return filtered;
      if (dataOutputOptions.length > 0) return [dataOutputOptions[0].value];
      return [];
    });
  }, [dataOutputOptions]);

  useEffect(() => {
    const allowed = new Set(supportedImageTargets);
    setImgTargets(prev => {
      const filtered = prev.filter(target => allowed.has(target));
      if (filtered.length > 0) return filtered;
      if (supportedImageTargets.length > 0) return [supportedImageTargets[0]];
      return [];
    });
  }, [supportedImageTargets]);

  useEffect(() => {
    const preset = IMAGE_SIZE_PRESETS.find(item => item.value === imgResizePreset);
    if (!preset) return;
    if (!preset.width || !preset.height) {
      setImgMaxWidth('');
      setImgMaxHeight('');
      return;
    }
    setImgMaxWidth(preset.width);
    setImgMaxHeight(preset.height);
  }, [imgResizePreset]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const maxBytes = MAX_UPLOAD_BYTES[category];
    const items: QueueItem[] = Array.from(files).map(file => {
      if (file.size > maxBytes) {
        return {
          id: uid(),
          file,
          status: 'error' as const,
          error: `File too large (${formatSize(file.size)}). Max ${formatSize(maxBytes)}.`,
        };
      }

      if (category === 'data') {
        const detected = detectDataFormatFromFile(file);
        if (!detected) {
          return {
            id: uid(),
            file,
            status: 'error' as const,
            error: 'Unsupported data format. Use JSON, CSV, TSV, XML, or YAML.',
          };
        }
        return {
          id: uid(),
          file,
          status: 'pending' as const,
          dataFormat: detected,
        };
      }

      return {
        id: uid(),
        file,
        status: 'pending' as const,
      };
    });
    setQueue(prev => [...prev, ...items]);
  }, [category]);

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  };

  const clearAll = () => {
    setQueue([]);
    setConversionProgress(0);
    setDataErrorInfo(null);
    setResults(prev => {
      prev.forEach(r => r.previewUrl && URL.revokeObjectURL(r.previewUrl));
      return [];
    });
    setDataPreviewSource('');
  };

  // ── Drop handler ──

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const appendHistory = useCallback((entries: ConversionHistoryItem[]) => {
    if (entries.length === 0) return;
    setHistory(prev => [...entries, ...prev].slice(0, 80));
  }, []);

  // ── Conversion ──

  const handleConvert = async () => {
    const pending = queue.filter(q => q.status === 'pending');
    if (pending.length === 0) return;
    setConverting(true);
    setConversionProgress(0);
    setDataErrorInfo(null);
    const totalItems = pending.length;
    let completedItems = 0;
    let previewAssigned = false;
    const pendingIds = new Set(pending.map(item => item.id));
    setQueue(prev => prev.map(q => pendingIds.has(q.id) ? { ...q, status: 'converting' } : q));
    const outcomes: Array<{ id: string; converted: ConvertedFile[]; error?: string }> = [];
    const dataOptions: DataConvertOptions = {
      csvDelimiter: dataDelimiter,
      csvQuoteChar: dataQuoteChar,
      csvHasHeader: dataHasHeader,
      flattenJsonForTabular: dataFlattenJson,
    };

    for (const item of pending) {
      try {
        const convertedFiles: ConvertedFile[] = [];

        if (category === 'image') {
          const targets = imgMultiOutput ? imgTargets : [imgTarget];
          if (targets.length === 0) {
            throw new Error('Select at least one output format.');
          }
          const baseName = item.file.name.replace(/\.[^.]+$/, '');

          for (const target of targets) {
            if (
              !imgStripExif
              && !imgWatermarkText.trim()
              && !imgMaxWidth
              && !imgMaxHeight
              && item.file.type === `image/${target === 'jpeg' ? 'jpeg' : target}`
            ) {
              const preservedBlob = item.file.slice(0, item.file.size, item.file.type);
              const preservedName = `${baseName}${IMAGE_FORMATS.find(f => f.value === target)?.ext || ''}`;
              convertedFiles.push({
                id: uid(),
                originalName: item.file.name,
                originalSize: item.file.size,
                resultBlob: preservedBlob,
                resultName: preservedName,
                resultSize: preservedBlob.size,
                status: 'done',
                previewUrl: URL.createObjectURL(preservedBlob),
              });
              continue;
            }

            const { blob } = await convertImage(
              item.file,
              target,
              imgQuality / 100,
              imgMaxWidth || undefined,
              imgMaxHeight || undefined,
              {
                watermarkText: imgWatermarkText.trim(),
                watermarkOpacity: imgWatermarkOpacity / 100,
                watermarkPosition: imgWatermarkPosition,
              },
            );
            const ext = IMAGE_FORMATS.find(f => f.value === target)!.ext;
            const resultName = `${baseName}${ext}`;
            convertedFiles.push({
              id: uid(),
              originalName: item.file.name,
              originalSize: item.file.size,
              resultBlob: blob,
              resultName,
              resultSize: blob.size,
              status: 'done',
              previewUrl: URL.createObjectURL(blob),
            });
          }
        } else if (category === 'data') {
          const text = await item.file.text();
          const detectedFrom = item.dataFormat ?? detectDataFormatFromFile(item.file) ?? detectDataFormatFromText(text);
          if (!detectedFrom) {
            throw new Error(`Cannot detect input format for "${item.file.name}".`);
          }

          const selectedTargets = (dataMultiOutput ? dataTargets : [dataTo]).filter(target => target !== detectedFrom);
          if (selectedTargets.length === 0) {
            throw new Error(`"${item.file.name}" has no compatible output target selected.`);
          }

          const baseName = item.file.name.replace(/\.[^.]+$/, '');
          for (const target of selectedTargets) {
            const output = convertData(text, detectedFrom, target, dataOptions);
            const ext = DATA_FORMATS.find(f => f.value === target)!.ext;
            const resultBlob = new Blob([output], { type: DATA_MIME[target] });
            const resultName = `${baseName}${ext}`;
            convertedFiles.push({
              id: uid(),
              originalName: item.file.name,
              originalSize: item.file.size,
              resultBlob,
              resultName,
              resultSize: resultBlob.size,
              status: 'done',
            });

            if (!previewAssigned) {
              setDataPreviewSource(output);
              setDataPreviewFormat(target);
              previewAssigned = true;
            }
          }
        } else {
          throw new Error('Unsupported category');
        }

        outcomes.push({ id: item.id, converted: convertedFiles });
      } catch (err) {
        let errorMessage = err instanceof Error ? err.message : 'Conversion failed';
        if (err instanceof DataConversionError) {
          setDataErrorInfo({
            message: err.detailMessage,
            line: err.line,
            column: err.column,
          });
          errorMessage = err.message;
        }
        outcomes.push({ id: item.id, converted: [], error: errorMessage });
      } finally {
        completedItems += 1;
        setConversionProgress(Math.min(100, Math.round((completedItems / totalItems) * 100)));
      }
    }

    const outcomeById = new Map(outcomes.map(outcome => [outcome.id, outcome]));
    const convertedResults = outcomes
      .flatMap(outcome => outcome.converted);

    if (convertedResults.length > 0) {
      setResults(prev => [...prev, ...convertedResults]);
      appendHistory(convertedResults.map(result => ({
        id: uid(),
        category,
        inputName: truncateName(result.originalName),
        outputName: truncateName(result.resultName),
        outputSize: result.resultSize,
        createdAt: new Date().toISOString(),
        resultId: result.id,
      })));
    }

    setQueue(prev => prev.map(q => {
      const outcome = outcomeById.get(q.id);
      if (!outcome) return q;
      if (outcome.converted.length > 0) {
        return { ...q, status: 'done', result: outcome.converted[0], error: undefined };
      }
      return { ...q, status: 'error', error: outcome.error ?? 'Conversion failed' };
    }));

    setConversionProgress(100);
    setConverting(false);
  };

  // ── Load examples ──

  const loadBase64Example = () => {
    if (encodeMode === 'fromBase64') {
      setBase64Input(EXAMPLE_BASE64);
      setBase64Output('');
    } else {
      const svg = atob(EXAMPLE_BASE64.split(',')[1]);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const file = new File([blob], 'example.svg', { type: 'image/svg+xml' });
      addFiles([file]);
    }
  };

  // ── Data text convert (no file) ──

  const handleDataTextConvert = () => {
    const input = dataTextInput ?? '';
    try {
      setDataErrorInfo(null);
      const detectedFrom = detectDataFormatFromText(input);
      if (!detectedFrom) {
        throw new Error('Cannot detect input format. Paste valid JSON, CSV, TSV, XML, or YAML.');
      }
      const preferredTarget = dataMultiOutput
        ? dataTargets.find(target => target !== detectedFrom)
        : dataTo;
      if (!preferredTarget) {
        throw new Error('Select at least one compatible output format.');
      }
      if (detectedFrom === preferredTarget) {
        throw new Error(`Input is already ${detectedFrom.toUpperCase()}. Choose another output format.`);
      }

      const output = convertData(input, detectedFrom, preferredTarget, {
        csvDelimiter: dataDelimiter,
        csvQuoteChar: dataQuoteChar,
        csvHasHeader: dataHasHeader,
        flattenJsonForTabular: dataFlattenJson,
      });
      setDataTextOutput(output);
      setDataPreviewSource(output);
      setDataPreviewFormat(preferredTarget);

      const fromExt = DATA_FORMATS.find(f => f.value === detectedFrom)?.ext || '.txt';
      const toExt = DATA_FORMATS.find(f => f.value === preferredTarget)?.ext || '.txt';
      const resultBlob = new Blob([output], { type: DATA_MIME[preferredTarget] || 'text/plain;charset=utf-8' });

      const converted: ConvertedFile = {
        id: uid(),
        originalName: `pasted-input${fromExt}`,
        originalSize: new Blob([input], { type: 'text/plain;charset=utf-8' }).size,
        resultBlob,
        resultName: `converted${toExt}`,
        resultSize: resultBlob.size,
        status: 'done',
      };

      setResults(prev => [converted, ...prev]);
      appendHistory([{
        id: uid(),
        category: 'data',
        inputName: 'pasted-input',
        outputName: converted.resultName,
        outputSize: converted.resultSize,
        createdAt: new Date().toISOString(),
        resultId: converted.id,
      }]);
    } catch (err) {
      if (err instanceof DataConversionError) {
        setDataErrorInfo({
          message: err.detailMessage,
          line: err.line,
          column: err.column,
        });
      }
      setDataTextOutput(`Error: ${err instanceof Error ? err.message : 'Conversion failed'}`);
    }
  };

  const handleCopyDataOutput = async () => {
    if (!dataTextOutput) return;
    try {
      await navigator.clipboard.writeText(dataTextOutput);
      setCopiedDataOutput(true);
      window.setTimeout(() => setCopiedDataOutput(false), 1200);
    } catch {
      setCopiedDataOutput(false);
    }
  };

  // ── Base64 ──

  const handleBase64Convert = async () => {
    if (encodeMode === 'toBase64') {
      const pending = queue.filter(q => q.status === 'pending');
      if (pending.length === 0) return;
      const file = pending[0].file;
      const b64 = await fileToBase64(file);
      setBase64Output(b64);
      setQueue(prev => prev.map(q => q.id === pending[0].id ? { ...q, status: 'done' } : q));
    } else {
      try {
        const input = base64Input ?? '';
        const blob = base64ToBlob(input);
        const ext = input.match(/data:([^;]+)/)?.[1]?.split('/')[1] || 'bin';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `decoded.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        setBase64Output(`Error: ${err instanceof Error ? err.message : 'Invalid base64'}`);
      }
    }
  };

  // ── Download helpers ──

  const downloadResult = (r: ConvertedFile) => {
    const url = URL.createObjectURL(r.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.resultName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    for (const r of results) downloadResult(r);
  };

  const downloadAllAsZip = async () => {
    if (results.length === 0) return;
    try {
      setZipping(true);
      const zip = new JSZip();
      const seen = new Map<string, number>();

      for (const result of results) {
        const current = seen.get(result.resultName) ?? 0;
        seen.set(result.resultName, current + 1);
        const finalName = current === 0
          ? result.resultName
          : `${result.resultName.replace(/(\.[^.]+)?$/, `-${current + 1}$1`)}`;
        zip.file(finalName, await result.resultBlob.arrayBuffer());
      }

      const archive = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const url = URL.createObjectURL(archive);
      const a = document.createElement('a');
      a.href = url;
      a.download = `converted-files-${stamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create ZIP archive.';
      window.alert(msg);
    } finally {
      setZipping(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const inferExtensionFromMime = (mime: string, fallback = 'bin') => {
    const normalized = mime.toLowerCase();
    if (normalized.includes('jpeg')) return 'jpg';
    if (normalized.includes('svg')) return 'svg';
    if (normalized.includes('yaml')) return 'yaml';
    if (normalized.includes('json')) return 'json';
    if (normalized.includes('csv')) return 'csv';
    if (normalized.includes('xml')) return 'xml';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('bmp')) return 'bmp';
    if (normalized.includes('gif')) return 'gif';
    if (normalized.includes('tiff')) return 'tiff';
    return fallback;
  };

  const inferMimeFromCategory = () => {
    if (category === 'image') return 'image/png';
    if (category === 'data') return 'application/octet-stream';
    return 'application/octet-stream';
  };

  const handleImportFromUrl = async () => {
    const input = window.prompt('Paste file URL');
    if (!input) return;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(input.trim());
    } catch {
      window.alert('Invalid URL.');
      return;
    }

    try {
      setImporting(true);
      const response = await fetch(parsedUrl.toString());
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}.`);
      }

      const blob = await response.blob();
      const pathnameName = decodeURIComponent(parsedUrl.pathname.split('/').filter(Boolean).pop() || '');
      const ext = inferExtensionFromMime(blob.type || inferMimeFromCategory(), category === 'data' ? 'txt' : 'bin');
      const guessedName = pathnameName || `imported-${Date.now()}.${ext}`;
      const finalName = /\.[a-z0-9]+$/i.test(guessedName) ? guessedName : `${guessedName}.${ext}`;
      addFiles([new File([blob], finalName, { type: blob.type || inferMimeFromCategory() })]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import from URL.';
      window.alert(`Import failed. ${message} If this is a CORS-protected URL, use direct upload instead.`);
    } finally {
      setImporting(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      window.alert('Clipboard read is not supported in this browser.');
      return;
    }

    try {
      setImporting(true);
      const clipboardItems = await navigator.clipboard.read();
      const imported: File[] = [];

      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (category === 'image' && type.startsWith('image/')) {
            const blob = await item.getType(type);
            const ext = inferExtensionFromMime(type, 'png');
            imported.push(new File([blob], `clipboard-${Date.now()}-${imported.length + 1}.${ext}`, { type }));
            continue;
          }

          if (category === 'data' && type === 'text/plain') {
            const blob = await item.getType(type);
            const text = await blob.text();
            const detected = detectDataFormatFromText(text);
            const ext = DATA_FORMATS.find(format => format.value === detected)?.ext || '.txt';
            imported.push(new File([text], `clipboard-${Date.now()}-${imported.length + 1}${ext}`, { type: 'text/plain' }));
            continue;
          }

          if (category === 'encode') {
            const blob = await item.getType(type);
            const ext = inferExtensionFromMime(type, 'bin');
            imported.push(new File([blob], `clipboard-${Date.now()}-${imported.length + 1}.${ext}`, { type }));
            continue;
          }
        }
      }

      if (imported.length === 0) {
        window.alert('No compatible clipboard content found.');
        return;
      }
      addFiles(imported);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard import failed.';
      window.alert(message);
    } finally {
      setImporting(false);
    }
  };

  const clearResults = () => {
    setResults(prev => {
      prev.forEach(r => r.previewUrl && URL.revokeObjectURL(r.previewUrl));
      return [];
    });
    setBase64Output('');
    setDataPreviewSource('');
  };

  // ── Accept string for file input ──

  const getAccept = () => {
    if (category === 'image') return IMAGE_ACCEPT;
    if (category === 'data') return DATA_ACCEPT;
    return '*/*';
  };

  // ── UI ──

  const normalizedDataTextInput = dataTextInput ?? '';
  const normalizedBase64Input = base64Input ?? '';
  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const queueHasPending = pendingCount > 0;
  const hasAnyResults = results.length > 0 || Boolean(base64Output);
  const selectedDataTargets = (dataMultiOutput ? dataTargets : [dataTo])
    .filter(target => dataOutputOptions.some(option => option.value === target));
  const selectedImageTargets = (imgMultiOutput ? imgTargets : [imgTarget])
    .filter(target => supportedImageTargets.includes(target));
  const effectiveDataTextTarget = dataMultiOutput ? selectedDataTargets[0] : dataTo;
  const canConvertDataBatch = category !== 'data' || !queueHasPending || selectedDataTargets.length > 0;
  const canConvertImageBatch = category !== 'image' || !queueHasPending || selectedImageTargets.length > 0;
  const canConvertCurrentBatch = canConvertDataBatch && canConvertImageBatch;
  const imageFormatMeta = IMAGE_FORMATS.find(f => f.value === imgTarget);
  const dataOutputMeta = DATA_FORMATS.find(f => f.value === dataTo);
  const dataInputLabel = queuedDataFormats.length === 0
    ? 'Upload files to detect input format'
    : queuedDataFormats.length === 1
      ? (DATA_FORMATS.find(f => f.value === queuedDataFormats[0])?.label || queuedDataFormats[0].toUpperCase())
      : `${queuedDataFormats.length} formats detected in queue`;
  const detectedTextInputFormat = useMemo(
    () => detectDataFormatFromText(normalizedDataTextInput),
    [normalizedDataTextInput],
  );
  const canConvertPastedData = Boolean(normalizedDataTextInput.trim())
    && Boolean(detectedTextInputFormat)
    && Boolean(effectiveDataTextTarget)
    && detectedTextInputFormat !== effectiveDataTextTarget;
  const supportedImageOutputOptions = IMAGE_OUTPUT_OPTIONS.filter(
    (option): option is { id: string; label: string; value: ImageFormat } => Boolean(option.value)
      && !(option.value === 'avif' && !supportsAvifOutput),
  );
  const advancedImageOutputOptions = IMAGE_OUTPUT_OPTIONS.filter(option =>
    !option.value || (option.value === 'avif' && !supportsAvifOutput),
  );
  const previewRows = useMemo(() => {
    if (!dataPreviewSource) return [] as string[];
    return dataPreviewSource.split(/\r?\n/).slice(0, 20);
  }, [dataPreviewSource]);
  const previewTable = useMemo(() => {
    if (!dataPreviewSource) return null as { headers: string[]; rows: string[][] } | null;
    if (dataPreviewFormat !== 'csv' && dataPreviewFormat !== 'tsv') return null;
    const delimiter = dataPreviewFormat === 'tsv' ? '\t' : dataDelimiter;
    const rows = parseDelimitedPreview(dataPreviewSource, delimiter, dataQuoteChar, 21);
    if (rows.length === 0) return null;
    const [headers, ...body] = rows;
    return {
      headers: headers.map((header, index) => header || `column_${index + 1}`),
      rows: body,
    };
  }, [dataPreviewSource, dataPreviewFormat, dataDelimiter, dataQuoteChar]);
  const imagePresetLabel = IMAGE_SIZE_PRESETS.find(p => p.value === imgResizePreset)?.label || 'Custom';
  const needsImageQualityControl = (imgMultiOutput ? selectedImageTargets : [imgTarget]).some(target => target !== 'png' && target !== 'bmp');
  const maxUploadSizeLabel = formatSize(MAX_UPLOAD_BYTES[category]);
  const cardClass = 'rounded-[26px] border border-slate-200/70 dark:border-slate-700/70 bg-white/75 dark:bg-slate-900/65 backdrop-blur-xl shadow-[0_28px_60px_-38px_rgba(15,23,42,0.65)]';
  const sectionLabelClass = 'text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400';
  const inputBaseClass = 'w-full text-sm border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2.5 bg-white/85 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 transition';
  const compactSelectClass = 'w-full h-11 text-sm font-medium border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 bg-white/85 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 transition';
  const subtleButtonClass = 'text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors';

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <section className={`${cardClass} relative overflow-hidden`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(191,219,254,0.55),transparent_45%),radial-gradient(120%_120%_at_100%_100%,rgba(224,231,255,0.45),transparent_48%)] dark:bg-[radial-gradient(120%_120%_at_0%_0%,rgba(59,130,246,0.2),transparent_45%),radial-gradient(120%_120%_at_100%_100%,rgba(99,102,241,0.16),transparent_48%)]" />
        <div className="relative px-5 py-6 sm:px-6 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <p className={sectionLabelClass}>Inspired Workspace</p>
              <h2 className="text-2xl sm:text-[28px] leading-tight font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                File Converter
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl">
                Clean conversion flow for images, structured data, and Base64 with instant preview and export.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-center min-w-[220px]">
              <div className="rounded-2xl border border-white/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{pendingCount}</div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Pending</div>
              </div>
              <div className="rounded-2xl border border-white/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{queue.length}</div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Queued</div>
              </div>
              <div className="rounded-2xl border border-white/70 dark:border-white/10 bg-white/80 dark:bg-slate-900/70 px-3 py-2">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{results.length}</div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Output</div>
              </div>
            </div>
          </div>

          <div className="mt-5 inline-flex flex-wrap rounded-2xl border border-white/80 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 p-1.5 gap-1.5">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setCategory(cat.id); setQueue([]); }}
                className={`min-w-[170px] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left transition-all ${
                  category === cat.id
                    ? 'bg-gradient-to-b from-white to-blue-50 dark:from-slate-800 dark:to-slate-800/70 text-slate-900 dark:text-slate-100 shadow-[0_12px_24px_-18px_rgba(59,130,246,0.7)] border border-blue-100/80 dark:border-blue-500/30'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                <span className={`${category === cat.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>{cat.icon}</span>
                <span>
                  <span className="block text-sm font-semibold">{cat.label}</span>
                  <span className="block text-[10px] tracking-wide opacity-80">{cat.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-5">
        <div className="space-y-4">
          <div className={`${cardClass} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className={sectionLabelClass}>Settings</h3>
              <div className="flex items-center gap-3">
                {category !== 'encode' && (
                  <>
                    <button
                      onClick={handleImportFromUrl}
                      disabled={importing}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:opacity-80 disabled:opacity-40 transition-opacity"
                    >
                      <Link2 size={12} />
                      Import URL
                    </button>
                    <button
                      onClick={handlePasteFromClipboard}
                      disabled={importing}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:opacity-80 disabled:opacity-40 transition-opacity"
                    >
                      <Clipboard size={12} />
                      Paste
                    </button>
                  </>
                )}
                {category === 'encode' && (
                  <button
                    onClick={loadBase64Example}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    Load Example
                  </button>
                )}
              </div>
            </div>

            {category === 'image' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 px-3 py-2.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Output Mode</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1">
                      {imgMultiOutput ? `${selectedImageTargets.length} formats selected` : 'Single format'}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={imgMultiOutput}
                      onChange={e => setImgMultiOutput(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    Multi-output
                  </label>
                </div>

                {!imgMultiOutput && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">Output Format</label>
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_108px] gap-2">
                      <select
                        value={imgTarget}
                        onChange={e => setImgTarget(e.target.value as ImageFormat)}
                        className={compactSelectClass}
                      >
                        <optgroup label="Browser Supported">
                          {supportedImageOutputOptions.map(option => (
                            <option key={option.id} value={option.value}>{option.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Advanced (Not Available Here)">
                          {advancedImageOutputOptions.map(option => (
                            <option key={option.id} value={`unsupported:${option.id}`} disabled>
                              {!option.value && option.label}
                              {option.value === 'avif' && 'AVIF (Not Supported In This Browser)'}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <div className="h-11 self-end rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/70 px-3 flex items-center justify-between">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Ext</p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{imageFormatMeta?.ext || '.img'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {imgMultiOutput && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">Output Formats</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {supportedImageOutputOptions.map(option => {
                        const checked = imgTargets.includes(option.value);
                        return (
                          <label
                            key={option.id}
                            className={`inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold cursor-pointer transition ${
                              checked
                                ? 'border-blue-400/70 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setImgTargets(prev => checked ? prev.filter(v => v !== option.value) : [...prev, option.value]);
                              }}
                              className="sr-only"
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {needsImageQualityControl && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">
                      Quality <span className="text-slate-900 dark:text-slate-100">{imgQuality}%</span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={imgQuality}
                      onChange={e => setImgQuality(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Resize Preset</label>
                    <select
                      value={imgResizePreset}
                      onChange={e => setImgResizePreset(e.target.value)}
                      className={inputBaseClass}
                    >
                      {IMAGE_SIZE_PRESETS.map(preset => (
                        <option key={preset.value} value={preset.value}>{preset.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Max Width</label>
                    <input
                      type="number"
                      value={imgMaxWidth}
                      onChange={e => setImgMaxWidth(e.target.value ? Number(e.target.value) : '')}
                      placeholder="Auto"
                      className={inputBaseClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Max Height</label>
                    <input
                      type="number"
                      value={imgMaxHeight}
                      onChange={e => setImgMaxHeight(e.target.value ? Number(e.target.value) : '')}
                      placeholder="Auto"
                      className={inputBaseClass}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/70 overflow-hidden">
                  <button
                    onClick={() => setShowImageAdvanced(prev => !prev)}
                    className="w-full px-3 py-2.5 text-left flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40"
                  >
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-[0.12em]">
                      Advanced Image Tools
                    </span>
                    {showImageAdvanced ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </button>
                  {showImageAdvanced && (
                    <div className="px-3 py-3 space-y-3 bg-white/50 dark:bg-slate-900/35">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={imgStripExif}
                            onChange={e => setImgStripExif(e.target.checked)}
                            className="rounded border-slate-300 dark:border-slate-600"
                          />
                          Strip EXIF metadata
                        </label>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">Watermark Text</label>
                        <input
                          type="text"
                          value={imgWatermarkText}
                          onChange={e => setImgWatermarkText(e.target.value)}
                          placeholder="Optional watermark"
                          className={inputBaseClass}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">
                            Watermark Opacity {imgWatermarkOpacity}%
                          </label>
                          <input
                            type="range"
                            min={5}
                            max={70}
                            value={imgWatermarkOpacity}
                            onChange={e => setImgWatermarkOpacity(Number(e.target.value))}
                            className="w-full accent-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Watermark Position</label>
                          <select
                            value={imgWatermarkPosition}
                            onChange={e => setImgWatermarkPosition(e.target.value as WatermarkPosition)}
                            className={inputBaseClass}
                          >
                            {WATERMARK_POSITIONS.map(position => (
                              <option key={position.value} value={position.value}>{position.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Preset: {imagePresetLabel}. Canvas conversion strips metadata by default. Turn off strip to keep original file only when no transform is needed.
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  In-browser output supports PNG, JPG/JPEG, WEBP, BMP, AVIF (if browser encoder is available).
                </p>
              </div>
            )}

            {category === 'data' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 px-3 py-2.5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Output Mode</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1">
                      {dataMultiOutput ? `${selectedDataTargets.length} formats selected` : 'Single format'}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dataMultiOutput}
                      onChange={e => setDataMultiOutput(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    Multi-output
                  </label>
                </div>

                {!dataMultiOutput && (
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_108px] gap-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Output Format</label>
                      <select
                        value={dataOutputOptions.length > 0 ? dataTo : ''}
                        onChange={e => setDataTo(e.target.value as DataFormat)}
                        className={compactSelectClass}
                        disabled={dataOutputOptions.length === 0}
                      >
                        {dataOutputOptions.length === 0 && (
                          <option value="" disabled>No compatible output format</option>
                        )}
                        {dataOutputOptions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                    <div className="h-11 self-end rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/70 px-3 flex items-center justify-between">
                      <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Ext</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{dataOutputMeta?.ext || '.txt'}</p>
                    </div>
                  </div>
                )}

                {dataMultiOutput && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">Output Formats</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {dataOutputOptions.map(option => {
                        const checked = dataTargets.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className={`inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold cursor-pointer transition ${
                              checked
                                ? 'border-blue-400/70 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                : 'border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setDataTargets(prev => checked ? prev.filter(v => v !== option.value) : [...prev, option.value]);
                              }}
                              className="sr-only"
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Detected Input</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1">{dataInputLabel}</p>
                </div>

                <div className="rounded-xl border border-slate-200/70 dark:border-slate-700/70 overflow-hidden">
                  <button
                    onClick={() => setShowDataAdvanced(prev => !prev)}
                    className="w-full px-3 py-2.5 text-left flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40"
                  >
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-[0.12em]">
                      Advanced Data Options
                    </span>
                    {showDataAdvanced ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </button>
                  {showDataAdvanced && (
                    <div className="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white/50 dark:bg-slate-900/35">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">CSV Delimiter</label>
                        <select
                          value={dataDelimiter}
                          onChange={e => setDataDelimiter(e.target.value as CsvDelimiter)}
                          className={inputBaseClass}
                        >
                          {DELIMITER_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Quote Character</label>
                        <select
                          value={dataQuoteChar}
                          onChange={e => setDataQuoteChar(e.target.value as CsvQuoteChar)}
                          className={inputBaseClass}
                        >
                          <option value={'"'}>"</option>
                          <option value={"'"}>'</option>
                        </select>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={dataHasHeader}
                          onChange={e => setDataHasHeader(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600"
                        />
                        First row is header
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={dataFlattenJson}
                          onChange={e => setDataFlattenJson(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600"
                        />
                        Flatten JSON when exporting CSV/TSV
                      </label>
                    </div>
                  )}
                </div>

                {dataOutputOptions.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Current queue has mixed formats that cannot share one output target. Remove some files or split the batch.
                  </p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  CSV options: {csvDelimiterLabel(dataDelimiter)} delimiter, quote {dataQuoteChar}, header {dataHasHeader ? 'on' : 'off'}.
                </p>
                {dataErrorInfo && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    Last parse error: {dataErrorInfo.message}
                    {dataErrorInfo.line && dataErrorInfo.column ? ` (line ${dataErrorInfo.line}, column ${dataErrorInfo.column})` : ''}
                  </p>
                )}
              </div>
            )}

            {category === 'encode' && (
              <div className="inline-flex rounded-xl bg-slate-100/80 dark:bg-slate-800/70 p-1 gap-1">
                <button
                  onClick={() => setEncodeMode('toBase64')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    encodeMode === 'toBase64' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  File → Base64
                </button>
                <button
                  onClick={() => setEncodeMode('fromBase64')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    encodeMode === 'fromBase64' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Base64 → File
                </button>
              </div>
            )}
          </div>

          {category === 'data' && (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
                <span className={sectionLabelClass}>Paste Input</span>
                <div className="flex items-center gap-3">
                  {detectedTextInputFormat && (
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                      Detected: {DATA_FORMATS.find(f => f.value === detectedTextInputFormat)?.label || detectedTextInputFormat.toUpperCase()}
                    </span>
                  )}
                  <button
                    onClick={handleDataTextConvert}
                    disabled={!canConvertPastedData}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-blue-500 hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    <RefreshCw size={12} /> Convert
                  </button>
                </div>
              </div>
              <textarea
                value={normalizedDataTextInput}
                onChange={e => setDataTextInput(e.target.value)}
                placeholder="Paste JSON, CSV, TSV, XML, or YAML content here..."
                className="w-full h-44 px-5 py-4 text-xs font-mono bg-transparent text-slate-700 dark:text-slate-200 resize-none focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              {dataTextOutput && (
                <>
                  <div className="px-5 py-2.5 bg-emerald-50/70 dark:bg-emerald-900/20 border-y border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-[0.16em]">
                      Output ({DATA_FORMATS.find(f => f.value === effectiveDataTextTarget)?.label || 'Data'})
                    </span>
                    <button
                      onClick={handleCopyDataOutput}
                      className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:opacity-80 transition-opacity"
                    >
                      {copiedDataOutput ? <Check size={11} /> : <Copy size={11} />}
                      {copiedDataOutput ? 'Copied' : 'Copy all'}
                    </button>
                  </div>
                  <pre className="px-5 py-4 text-xs font-mono text-slate-700 dark:text-slate-200 bg-slate-50/70 dark:bg-slate-800/35 max-h-64 overflow-auto whitespace-pre-wrap">
                    {dataTextOutput}
                  </pre>
                </>
              )}
            </div>
          )}

          {category === 'data' && dataPreviewSource && (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
                <span className={sectionLabelClass}>Preview (First 20 Rows)</span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                  {dataPreviewFormat.toUpperCase()}
                </span>
              </div>
              {previewTable ? (
                <div className="overflow-auto max-h-64">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70">
                      <tr>
                        {previewTable.headers.map((header, idx) => (
                          <th key={`${header}-${idx}`} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200/70 dark:border-slate-700/70">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewTable.rows.map((row, rowIndex) => (
                        <tr key={`row-${rowIndex}`} className="odd:bg-white/60 dark:odd:bg-slate-900/20">
                          {previewTable.headers.map((_, colIndex) => (
                            <td key={`cell-${rowIndex}-${colIndex}`} className="px-3 py-1.5 text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800">
                              {row[colIndex] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="max-h-64 overflow-auto px-5 py-4 bg-slate-50/70 dark:bg-slate-800/35">
                  {previewRows.map((line, idx) => (
                    <div key={`preview-line-${idx}`} className="grid grid-cols-[44px_1fr] gap-3 text-xs font-mono">
                      <span className="text-slate-400 dark:text-slate-500">{idx + 1}</span>
                      <span className="text-slate-700 dark:text-slate-200 break-words whitespace-pre-wrap">{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {category === 'encode' && encodeMode === 'fromBase64' && (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
                <span className={sectionLabelClass}>Base64 Input</span>
                <button
                  onClick={handleBase64Convert}
                  disabled={!normalizedBase64Input.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-blue-500 hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  <Download size={12} /> Decode
                </button>
              </div>
              <textarea
                value={normalizedBase64Input}
                onChange={e => setBase64Input(e.target.value)}
                placeholder="Paste data:... URL or raw base64 here"
                className="w-full h-44 px-5 py-4 text-xs font-mono bg-transparent text-slate-700 dark:text-slate-200 resize-none focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          )}

          {(category !== 'encode' || encodeMode === 'toBase64') && (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
              onClick={() => fileInputRef.current?.click()}
              className={`${cardClass} border-2 border-dashed border-slate-300/85 dark:border-slate-600/75 hover:border-blue-400 dark:hover:border-blue-500 px-6 py-9 text-center cursor-pointer transition-all group`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={getAccept()}
                multiple={category !== 'encode'}
                className="hidden"
                onChange={e => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-white/90 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/70 flex items-center justify-center shadow-sm">
                <Upload size={22} className="text-slate-500 dark:text-slate-300 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Drop files here or click to browse
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {category === 'image' && 'PNG, JPG/JPEG, WebP, BMP, AVIF, GIF, SVG, ICO, TIFF, HEIC, PSD...'}
                {category === 'data' && 'JSON, CSV, TSV, XML, YAML'}
                {category === 'encode' && 'Any file'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Max upload per file: {maxUploadSizeLabel}
              </p>
              {category === 'image' && (
                <p className="text-[11px] text-blue-600/90 dark:text-blue-400/90 mt-2 font-medium">
                  Multi-select is enabled for batch image conversion.
                </p>
              )}
            </div>
          )}

          {queue.length > 0 && (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
                <span className={sectionLabelClass}>Queue ({queue.length})</span>
                <button onClick={clearAll} className={subtleButtonClass}>
                  Clear all
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {queue.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{item.file.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatSize(item.file.size)}
                        {category === 'data' && item.dataFormat && (
                          <span className="ml-1.5 font-semibold text-blue-600 dark:text-blue-400">
                            · {item.dataFormat.toUpperCase()}
                          </span>
                        )}
                      </p>
                    </div>
                    {item.status === 'pending' && (
                      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 px-2 py-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-full">Pending</span>
                    )}
                    {item.status === 'converting' && (
                      <Loader2 size={14} className="animate-spin text-blue-500" />
                    )}
                    {item.status === 'done' && (
                      <CheckCircle2 size={15} className="text-emerald-500" />
                    )}
                    {item.status === 'error' && (
                      <div className="flex items-center gap-1 text-red-500">
                        <AlertCircle size={14} />
                        <span className="text-[11px] max-w-[130px] truncate">{item.error}</span>
                      </div>
                    )}
                    {item.status === 'pending' && (
                      <button onClick={() => removeFromQueue(item.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(queueHasPending || converting) && (
            <button
              onClick={category === 'encode' ? handleBase64Convert : handleConvert}
              disabled={converting || !canConvertCurrentBatch}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-semibold tracking-wide bg-gradient-to-b from-slate-900 to-slate-700 dark:from-blue-500 dark:to-indigo-500 text-white hover:opacity-95 transition-opacity shadow-[0_16px_36px_-24px_rgba(15,23,42,0.9)] disabled:opacity-45"
            >
              {converting ? (
                <><Loader2 size={16} className="animate-spin" /> Converting {conversionProgress}%</>
              ) : (
                <><RefreshCw size={15} /> Convert {pendingCount} file{pendingCount > 1 ? 's' : ''}</>
              )}
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className={`${cardClass} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
              <span className={sectionLabelClass}>Results {results.length > 0 && `(${results.length})`}</span>
              <div className="flex items-center gap-3">
                {results.length > 1 && (
                  <button
                    onClick={downloadAllAsZip}
                    disabled={zipping}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-40 transition-colors"
                  >
                    {zipping ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                    Download ZIP
                  </button>
                )}
                {results.length > 1 && (
                  <button
                    onClick={downloadAll}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    <Download size={12} /> Download All
                  </button>
                )}
                {hasAnyResults && (
                  <button
                    onClick={clearResults}
                    className={subtleButtonClass}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {results.length === 0 && !base64Output && (
              <div className="p-14 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 flex items-center justify-center mb-3">
                  <RefreshCw size={24} className="text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Converted files will appear here</p>
              </div>
            )}

            {category === 'encode' && base64Output && (
              <div className="p-5">
                <textarea
                  readOnly
                  value={base64Output}
                  className="w-full h-52 text-[11px] font-mono bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 rounded-xl p-3 text-slate-600 dark:text-slate-300 resize-none focus:outline-none"
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(base64Output); }}
                  className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                >
                  Copy to clipboard
                </button>
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto">
              {results.map(r => (
                <div key={r.id} className="p-5">
                  {r.previewUrl && r.resultBlob.type.startsWith('image/') && (
                    <div className="mb-3 bg-slate-50/80 dark:bg-slate-800/70 rounded-2xl p-2.5 flex items-center justify-center border border-slate-200/70 dark:border-slate-700/70">
                      <img
                        src={r.previewUrl}
                        alt={r.resultName}
                        className="max-h-44 max-w-full rounded-xl object-contain"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.resultName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {formatSize(r.originalSize)} → {formatSize(r.resultSize)}
                        {r.originalSize > 0 && (
                          <span className={`ml-1.5 font-semibold ${r.resultSize < r.originalSize ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            ({r.resultSize < r.originalSize ? '-' : '+'}{Math.abs(Math.round((1 - r.resultSize / r.originalSize) * 100))}%)
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => downloadResult(r)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white dark:bg-blue-500 hover:opacity-90 transition-opacity shadow-sm"
                    >
                      <Download size={12} /> Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${cardClass} overflow-hidden`}>
            <div className="px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between">
              <button
                onClick={() => setHistoryOpen(prev => !prev)}
                className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-[0.14em]"
              >
                <History size={13} />
                History {history.length > 0 && `(${history.length})`}
              </button>
              {history.length > 0 && (
                <button onClick={clearHistory} className={subtleButtonClass}>Clear</button>
              )}
            </div>
            {historyOpen && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {history.length === 0 && (
                  <div className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                    No history yet.
                  </div>
                )}
                {history.map(item => {
                  const result = results.find(r => r.id === item.resultId);
                  return (
                    <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{item.outputName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {new Date(item.createdAt).toLocaleString()} · {formatSize(item.outputSize)} · {item.category}
                        </p>
                      </div>
                      {result && (
                        <button
                          onClick={() => downloadResult(result)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-900 text-white dark:bg-blue-500 hover:opacity-90 transition-opacity"
                        >
                          Download
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileConverter;
