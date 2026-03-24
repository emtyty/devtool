// ── Image conversion (Canvas API) ──

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'bmp' | 'avif';
export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface ImageConvertOptions {
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkPosition?: WatermarkPosition;
}

const IMAGE_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

function isHeicLike(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.includes('heic') || type.includes('heif')) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

function isPsdLike(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.includes('photoshop') || type.includes('psd')) return true;
  return /\.psd$/i.test(file.name);
}

function isTiffLike(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.includes('tiff')) return true;
  return /\.(tif|tiff)$/i.test(file.name);
}

function isSvgLike(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.includes('svg')) return true;
  return /\.svg$/i.test(file.name);
}

function parseSvgLength(value?: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.endsWith('%')) return null;
  const match = trimmed.match(/^-?\d*\.?\d+(?:e[+-]?\d+)?/i);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function getSvgFallbackDimensions(svgText: string): { width: number; height: number } {
  const tagMatch = svgText.match(/<svg\b[^>]*>/i);
  const svgTag = tagMatch?.[0] ?? '';

  let width = parseSvgLength(svgTag.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1]);
  let height = parseSvgLength(svgTag.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1]);

  const viewBox = svgTag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if (viewBox && (!width || !height)) {
    const parts = viewBox
      .trim()
      .split(/[,\s]+/)
      .map(Number)
      .filter(v => Number.isFinite(v));
    if (parts.length === 4) {
      const vbWidth = parts[2];
      const vbHeight = parts[3];
      if (!width && vbWidth > 0) width = vbWidth;
      if (!height && vbHeight > 0) height = vbHeight;
    }
  }

  const safeWidth = Math.max(1, Math.round(width ?? 1024));
  const safeHeight = Math.max(1, Math.round(height ?? safeWidth));
  return { width: safeWidth, height: safeHeight };
}

function normalizeSvgMarkup(svgText: string, fallback: { width: number; height: number }): string {
  const cleaned = svgText.replace(/^\uFEFF/, '').trim();
  if (!/<svg[\s>]/i.test(cleaned)) {
    throw new Error('SVG root tag is missing.');
  }

  return cleaned.replace(/<svg\b([^>]*)>/i, (match, attrs: string) => {
    let nextAttrs = attrs;
    if (!/\bxmlns\s*=/.test(nextAttrs)) {
      nextAttrs += ' xmlns="http://www.w3.org/2000/svg"';
    }
    if (!/\bxmlns:xlink\s*=/.test(nextAttrs)) {
      nextAttrs += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
    }
    if (!/\bwidth\s*=/.test(nextAttrs)) {
      nextAttrs += ` width="${fallback.width}"`;
    }
    if (!/\bheight\s*=/.test(nextAttrs)) {
      nextAttrs += ` height="${fallback.height}"`;
    }
    return `<svg${nextAttrs}>`;
  });
}

type PixelDataLike = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
};

async function canvasLikeToPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' });
  }

  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to export PSD canvas.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function pixelDataToPngBlob(pixelData: PixelDataLike): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(pixelData.width, pixelData.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context for PSD fallback.');
    const clamped = pixelData.data instanceof Uint8ClampedArray
      ? pixelData.data
      : new Uint8ClampedArray(pixelData.data);
    const imageData = new ImageData(clamped, pixelData.width, pixelData.height);
    ctx.putImageData(imageData, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }

  const canvas = document.createElement('canvas');
  canvas.width = pixelData.width;
  canvas.height = pixelData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas context for PSD fallback.');
  const clamped = pixelData.data instanceof Uint8ClampedArray
    ? pixelData.data
    : new Uint8ClampedArray(pixelData.data);
  const imageData = new ImageData(clamped, pixelData.width, pixelData.height);
  ctx.putImageData(imageData, 0, 0);
  return canvasLikeToPngBlob(canvas);
}

async function drawImageSourceToPngBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(source, 0, 0, width, height);
      if (typeof canvas.convertToBlob === 'function') {
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        if (blob.size > 0) return blob;
      }
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('No DOM canvas available for SVG fallback.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas context for SVG fallback.');
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await canvasLikeToPngBlob(canvas);
  if (blob.size === 0) throw new Error('SVG fallback returned empty output.');
  return blob;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function drawTextWatermark(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  opacity: number,
  position: WatermarkPosition,
): void {
  const content = text.trim();
  if (!content) return;

  const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.04));
  const padding = Math.max(10, Math.round(fontSize * 0.65));
  ctx.save();
  ctx.font = `600 ${fontSize}px "SF Pro Display", "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(content);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = Math.ceil((metrics.actualBoundingBoxAscent || fontSize * 0.72) + (metrics.actualBoundingBoxDescent || fontSize * 0.28));

  let x = padding;
  let y = padding;

  if (position === 'top-right' || position === 'bottom-right') {
    x = width - textWidth - padding;
  } else if (position === 'center') {
    x = Math.round((width - textWidth) / 2);
  }

  if (position === 'bottom-left' || position === 'bottom-right') {
    y = height - textHeight - padding;
  } else if (position === 'center') {
    y = Math.round((height - textHeight) / 2);
  }

  const tx = Math.max(0, x);
  const ty = Math.max(0, y);
  const boxWidth = Math.min(width - tx, textWidth + padding);
  const boxHeight = Math.min(height - ty, textHeight + Math.round(padding * 0.5));

  ctx.globalAlpha = Math.min(0.95, Math.max(0.05, opacity));
  ctx.fillStyle = '#000000';
  ctx.fillRect(tx - Math.round(padding * 0.35), ty - Math.round(padding * 0.2), boxWidth, boxHeight);

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = Math.min(1, Math.max(0.1, opacity + 0.1));
  ctx.fillText(content, tx, ty + Math.round(boxHeight / 2));
  ctx.restore();
}

async function loadImageFromSrc(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image element could not load SVG source.'));
    img.src = src;
  });
}

async function decodeHeicWithFallback(file: File): Promise<Blob> {
  const mod = await import('heic2any');
  const heic2any = mod.default as unknown as (options: {
    blob: Blob;
    toType?: string;
    quality?: number;
    multiple?: boolean;
  }) => Promise<Blob | Blob[]>;

  const result = await heic2any({
    blob: file,
    toType: 'image/png',
    quality: 0.96,
  });

  const blob = Array.isArray(result) ? result[0] : result;
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('HEIC decode fallback returned empty output.');
  }
  return blob;
}

async function decodePsdWithFallback(file: File): Promise<Blob> {
  const mod = await import('ag-psd');
  const readPsd = mod.readPsd as (
    buffer: ArrayBuffer,
    options?: {
      skipLayerImageData?: boolean;
      skipThumbnail?: boolean;
      skipCompositeImageData?: boolean;
      useImageData?: boolean;
    },
  ) => { canvas?: HTMLCanvasElement | OffscreenCanvas; imageData?: PixelDataLike };

  const psd = readPsd(await file.arrayBuffer(), {
    skipLayerImageData: true,
    skipThumbnail: true,
    useImageData: false,
  });

  if (psd.canvas) {
    const blob = await canvasLikeToPngBlob(psd.canvas);
    if (blob.size === 0) throw new Error('PSD canvas output is empty.');
    return blob;
  }

  if (psd.imageData) {
    const blob = await pixelDataToPngBlob(psd.imageData);
    if (blob.size === 0) throw new Error('PSD pixel output is empty.');
    return blob;
  }

  throw new Error('PSD fallback did not produce any bitmap output.');
}

async function decodeTiffWithFallback(file: File): Promise<Blob> {
  const mod = await import('utif');
  const UTIF = (mod.default ?? mod) as {
    decode: (buffer: ArrayBuffer) => Array<Record<string, unknown>>;
    decodeImage: (buffer: ArrayBuffer, ifd: Record<string, unknown>) => void;
    toRGBA8: (ifd: Record<string, unknown>) => Uint8Array;
  };

  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) {
    throw new Error('No TIFF image directory found.');
  }

  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);

  const rgba = UTIF.toRGBA8(ifd);
  const widthRaw = (ifd as { width?: unknown; t256?: unknown }).width ?? (ifd as { t256?: unknown }).t256;
  const heightRaw = (ifd as { height?: unknown; t257?: unknown }).height ?? (ifd as { t257?: unknown }).t257;
  const width = Number(Array.isArray(widthRaw) ? widthRaw[0] : widthRaw);
  const height = Number(Array.isArray(heightRaw) ? heightRaw[0] : heightRaw);

  if (!width || !height || !rgba?.length) {
    throw new Error('Invalid TIFF raster data.');
  }

  const blob = await pixelDataToPngBlob({ width, height, data: rgba });
  if (blob.size === 0) throw new Error('TIFF fallback returned empty output.');
  return blob;
}

async function decodeSvgWithFallback(file: File): Promise<Blob> {
  const svgText = await file.text();
  if (!svgText.trim()) throw new Error('SVG input is empty.');
  const fallbackSize = getSvgFallbackDimensions(svgText);
  const normalizedSvg = normalizeSvgMarkup(svgText, fallbackSize);
  const svgBlob = new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' });

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(svgBlob);
    const width = Math.max(1, Math.round(bitmap.width || fallbackSize.width));
    const height = Math.max(1, Math.round(bitmap.height || fallbackSize.height));
    return await drawImageSourceToPngBlob(bitmap, width, height);
  } catch {
    if (bitmap) bitmap.close();
    bitmap = null;
  } finally {
    if (bitmap) bitmap.close();
  }

  const objectUrl = URL.createObjectURL(svgBlob);
  const dataUrlUtf8 = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalizedSvg)}`;
  const dataUrlBase64 = `data:image/svg+xml;base64,${utf8ToBase64(normalizedSvg)}`;
  const candidates = [objectUrl, dataUrlUtf8, dataUrlBase64];
  let lastError: unknown = null;

  try {
    for (const src of candidates) {
      try {
        const image = await loadImageFromSrc(src);
        const width = Math.max(1, Math.round(image.naturalWidth || fallbackSize.width));
        const height = Math.max(1, Math.round(image.naturalHeight || fallbackSize.height));
        return await drawImageSourceToPngBlob(image, width, height);
      } catch (error) {
        lastError = error;
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const reason = lastError instanceof Error ? ` ${lastError.message}` : '';
  throw new Error(`Failed to parse SVG input.${reason}`);
}

export async function convertImage(
  file: File,
  targetFormat: ImageFormat,
  quality: number = 0.92,
  maxWidth?: number,
  maxHeight?: number,
  options: ImageConvertOptions = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (isHeicLike(file)) {
      try {
        const decoded = await decodeHeicWithFallback(file);
        bitmap = await createImageBitmap(decoded);
      } catch {
        throw new Error('Failed to decode HEIC/HEIF input in browser fallback.');
      }
    } else if (isPsdLike(file)) {
      try {
        const decoded = await decodePsdWithFallback(file);
        bitmap = await createImageBitmap(decoded);
      } catch {
        throw new Error('Failed to decode PSD input in browser fallback.');
      }
    } else if (isTiffLike(file)) {
      try {
        const decoded = await decodeTiffWithFallback(file);
        bitmap = await createImageBitmap(decoded);
      } catch {
        throw new Error('Failed to decode TIFF input in browser fallback.');
      }
    } else if (isSvgLike(file)) {
      try {
        const decoded = await decodeSvgWithFallback(file);
        bitmap = await createImageBitmap(decoded);
      } catch (error) {
        const reason = error instanceof Error ? ` ${error.message}` : '';
        throw new Error(`Failed to decode SVG input in browser fallback.${reason}`);
      }
    } else {
      throw new Error(
        'This image format cannot be decoded in this browser. Try PNG/JPG/WEBP/BMP/AVIF/SVG/HEIC/PSD/TIFF input or use a server-side converter for DDS/HDR/CUR/WBMP.',
      );
    }
  }
  let w = bitmap.width;
  let h = bitmap.height;

  if (maxWidth && w > maxWidth) {
    h = Math.round(h * (maxWidth / w));
    w = maxWidth;
  }
  if (maxHeight && h > maxHeight) {
    w = Math.round(w * (maxHeight / h));
    h = maxHeight;
  }

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  if (targetFormat === 'jpeg' || targetFormat === 'bmp') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  if (options.watermarkText?.trim()) {
    drawTextWatermark(
      ctx,
      w,
      h,
      options.watermarkText,
      options.watermarkOpacity ?? 0.22,
      options.watermarkPosition ?? 'bottom-right',
    );
  }

  let blob: Blob;
  try {
    blob = await canvas.convertToBlob({
      type: IMAGE_MIME[targetFormat],
      quality: targetFormat === 'png' ? undefined : quality,
    });
  } catch {
    throw new Error(`This browser cannot encode ${targetFormat.toUpperCase()} output.`);
  }

  if (blob.size === 0) {
    throw new Error(`Failed to encode ${targetFormat.toUpperCase()} output.`);
  }

  if (targetFormat === 'avif' && blob.type !== IMAGE_MIME.avif) {
    throw new Error('AVIF output is not supported by this browser yet.');
  }

  return { blob, width: w, height: h };
}

// ── Data format conversion ──

export type DataFormat = 'json' | 'csv' | 'xml' | 'yaml' | 'tsv';
export type CsvDelimiter = ',' | ';' | '|' | '\t';
export type CsvQuoteChar = '"' | "'";

export interface DataConvertOptions {
  csvDelimiter?: CsvDelimiter;
  csvQuoteChar?: CsvQuoteChar;
  csvHasHeader?: boolean;
  flattenJsonForTabular?: boolean;
}

type DataErrorLocation = {
  line?: number;
  column?: number;
};

export class DataConversionError extends Error {
  source: DataFormat;
  line?: number;
  column?: number;
  detailMessage: string;

  constructor(source: DataFormat, detailMessage: string, location?: DataErrorLocation) {
    const line = location?.line;
    const column = location?.column;
    const withLocation = line && column
      ? `${detailMessage} (line ${line}, column ${column})`
      : detailMessage;
    super(withLocation);
    this.name = 'DataConversionError';
    this.source = source;
    this.line = line;
    this.column = column;
    this.detailMessage = detailMessage;
  }
}

function offsetToLineColumn(text: string, offset: number): DataErrorLocation {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let column = 1;

  for (let i = 0; i < safeOffset; i++) {
    if (text[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function extractJsonErrorLocation(message: string, input: string): DataErrorLocation {
  const match = message.match(/\bposition\s+(\d+)/i);
  if (!match) return {};
  const offset = Number(match[1]);
  if (!Number.isFinite(offset)) return {};
  return offsetToLineColumn(input, offset);
}

function extractXmlErrorLocation(message: string): DataErrorLocation {
  const lineColumn = message.match(/line\s+(\d+)\D+column\s+(\d+)/i);
  if (lineColumn) {
    const line = Number(lineColumn[1]);
    const column = Number(lineColumn[2]);
    if (Number.isFinite(line) && Number.isFinite(column)) return { line, column };
  }

  const lineOnly = message.match(/line\s+(\d+)/i);
  if (lineOnly) {
    const line = Number(lineOnly[1]);
    if (Number.isFinite(line)) return { line };
  }

  return {};
}

function normalizeDataParseError(error: unknown, input: string, source: DataFormat): DataConversionError {
  if (error instanceof DataConversionError) return error;
  const raw = error instanceof Error ? error.message : 'Unknown parser error';
  let detail = raw;
  let location: DataErrorLocation = {};

  if (source === 'json') {
    location = extractJsonErrorLocation(raw, input);
    detail = raw.replace(/\s+in JSON at position \d+/i, '').trim();
    if (!detail) detail = 'Invalid JSON input.';
  } else if (source === 'xml') {
    location = extractXmlErrorLocation(raw);
    detail = raw.replace(/^Invalid XML:\s*/i, '').trim() || 'Invalid XML input.';
  } else if (source === 'yaml') {
    detail = raw.trim() || 'Invalid YAML input.';
  } else if (source === 'csv' || source === 'tsv') {
    detail = raw.trim() || `Invalid ${source.toUpperCase()} input.`;
  }

  return new DataConversionError(source, detail, location);
}

// Delimited parser (handles custom quote chars and escaped quotes)
function parseDelimited(text: string, delimiter: string, quoteChar: CsvQuoteChar): string[][] {
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
    } else {
      if (ch === quoteChar) {
        inQuote = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(field);
        field = '';
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        if (ch === '\r') i++;
      } else {
        field += ch;
      }
    }
  }

  row.push(field);
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

function csvToObjects(
  text: string,
  delimiter: string,
  quoteChar: CsvQuoteChar,
  hasHeader: boolean,
): Record<string, string>[] {
  const rows = parseDelimited(text, delimiter, quoteChar);
  if (rows.length === 0) return [];

  const firstRow = rows[0] ?? [];
  const maxColumns = Math.max(...rows.map(r => r.length), firstRow.length, 1);
  const headers = hasHeader
    ? Array.from({ length: maxColumns }, (_, i) => (firstRow[i] || `column_${i + 1}`).trim() || `column_${i + 1}`)
    : Array.from({ length: maxColumns }, (_, i) => `column_${i + 1}`);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
    return obj;
  }).filter(record => Object.values(record).some(value => value !== ''));
}

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function objectsToDelimited(
  data: Record<string, unknown>[],
  delimiter: string,
  quoteChar: CsvQuoteChar,
  includeHeader: boolean,
): string {
  if (data.length === 0) return '';

  const headers = Array.from(data.reduce((set, row) => {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set<string>()));

  if (headers.length === 0) return '';

  const escape = (v: unknown) => {
    const s = normalizeCellValue(v);
    const needsQuote = s.includes(delimiter) || s.includes(quoteChar) || s.includes('\n') || s.includes('\r');
    if (!needsQuote) return s;
    const escapedQuote = quoteChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalized = s.replace(new RegExp(escapedQuote, 'g'), `${quoteChar}${quoteChar}`);
    return `${quoteChar}${normalized}${quoteChar}`;
  };

  const lines: string[] = [];
  if (includeHeader) {
    lines.push(headers.map(escape).join(delimiter));
  }

  for (const row of data) {
    lines.push(headers.map(h => escape(row[h])).join(delimiter));
  }

  return lines.join('\n');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenRecordValue(
  value: unknown,
  prefix: string,
  out: Record<string, unknown>,
): void {
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      out[prefix] = '{}';
      return;
    }
    entries.forEach(([key, nested]) => {
      flattenRecordValue(nested, prefix ? `${prefix}.${key}` : key, out);
    });
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      out[prefix] = '[]';
      return;
    }
    const primitiveOnly = value.every(item => !isPlainObject(item) && !Array.isArray(item));
    if (primitiveOnly) {
      out[prefix] = value.map(normalizeCellValue).join('|');
      return;
    }
    value.forEach((item, index) => {
      flattenRecordValue(item, prefix ? `${prefix}.${index}` : String(index), out);
    });
    return;
  }

  out[prefix || 'value'] = value;
}

function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, value]) => flattenRecordValue(value, key, out));
  return out;
}

function toTabularRows(data: unknown, flattenJsonForTabular: boolean): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((item) => {
      if (isPlainObject(item)) {
        return flattenJsonForTabular ? flattenRecord(item) : item;
      }
      if (Array.isArray(item)) {
        return { value: flattenJsonForTabular ? item.map(normalizeCellValue).join('|') : item };
      }
      return { value: item };
    });
  }

  if (isPlainObject(data)) {
    return [flattenJsonForTabular ? flattenRecord(data) : data];
  }

  if (data === null || data === undefined) return [];
  return [{ value: data }];
}

// Simple YAML serializer (flat + arrays)
function jsonToYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return `${pad}null`;
  if (typeof obj === 'string') return obj.includes('\n') ? `|$\n${obj.split('\n').map(l => pad + '  ' + l).join('\n')}` : (obj.includes(':') || obj.includes('#') || obj === '' ? `"${obj.replace(/"/g, '\\"')}"` : obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item);
        const first = entries[0];
        const rest = entries.slice(1);
        let line = `${pad}- ${first[0]}: ${jsonToYaml(first[1], indent + 2)}`;
        for (const [k, v] of rest) {
          line += `\n${pad}  ${k}: ${jsonToYaml(v, indent + 2)}`;
        }
        return line;
      }
      return `${pad}- ${jsonToYaml(item, indent + 1)}`;
    }).join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries.map(([k, v]) => {
      const val = jsonToYaml(v, indent + 1);
      if (typeof v === 'object' && v !== null && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)) {
        return `${pad}${k}:\n${val}`;
      }
      return `${pad}${k}: ${val}`;
    }).join('\n');
  }
  return String(obj);
}

// Simple YAML parser (handles common cases)
function yamlToJson(yaml: string): unknown {
  const lines = yaml.split('\n');
  // Minimal: try JSON.parse first (in case it's already JSON)
  try { return JSON.parse(yaml); } catch { /* continue */ }

  const result: Record<string, unknown> = {};
  let currentKey = '';
  let currentArray: unknown[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const arrayMatch = trimmed.match(/^-\s*(.*)/);
    if (arrayMatch && currentKey) {
      if (!currentArray) {
        currentArray = [];
        result[currentKey] = currentArray;
      }
      currentArray.push(parseYamlValue(arrayMatch[1]));
      continue;
    }

    const kvMatch = trimmed.match(/^([^:]+):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      currentArray = null;
      if (val) {
        result[currentKey] = parseYamlValue(val);
      }
    }
  }
  return result;
}

function parseYamlValue(val: string): unknown {
  if (val === 'null' || val === '~') return null;
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
    return val.slice(1, -1);
  if (val.startsWith('[')) { try { return JSON.parse(val); } catch { return val; } }
  if (val.startsWith('{')) { try { return JSON.parse(val); } catch { return val; } }
  return val;
}

// JSON → XML
function jsonToXml(obj: unknown, rootTag = 'root', indent = 0): string {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return `${pad}<${rootTag}/>`;
  if (typeof obj !== 'object') return `${pad}<${rootTag}>${escapeXml(String(obj))}</${rootTag}>`;
  if (Array.isArray(obj)) {
    return obj.map(item => jsonToXml(item, 'item', indent)).join('\n');
  }
  const entries = Object.entries(obj as Record<string, unknown>);
  const inner = entries.map(([k, v]) => {
    const tag = k.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (Array.isArray(v)) {
      return v.map(item => jsonToXml(item, tag, indent + 1)).join('\n');
    }
    return jsonToXml(v, tag, indent + 1);
  }).join('\n');
  return `${pad}<${rootTag}>\n${inner}\n${pad}</${rootTag}>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// XML → JSON (simple parser)
function xmlToJson(xml: string): unknown {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const errors = doc.querySelector('parsererror');
  if (errors) throw new Error('Invalid XML: ' + errors.textContent?.slice(0, 100));
  return xmlNodeToJson(doc.documentElement);
}

function xmlNodeToJson(node: Element): unknown {
  const children = Array.from(node.children);
  if (children.length === 0) {
    const text = node.textContent?.trim() || '';
    if (!text) return null;
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return text;
  }

  // Group children by tag name
  const groups: Record<string, Element[]> = {};
  for (const child of children) {
    const tag = child.tagName;
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(child);
  }

  const result: Record<string, unknown> = {};
  for (const [tag, elements] of Object.entries(groups)) {
    if (elements.length > 1) {
      result[tag] = elements.map(xmlNodeToJson);
    } else {
      result[tag] = xmlNodeToJson(elements[0]);
    }
  }
  return result;
}

// ── Main data converter ──

export function convertData(
  input: string,
  from: DataFormat,
  to: DataFormat,
  options: DataConvertOptions = {},
): string {
  if (from === to) return input;
  const csvDelimiter = options.csvDelimiter ?? ',';
  const csvQuoteChar = options.csvQuoteChar ?? '"';
  const csvHasHeader = options.csvHasHeader ?? true;
  const flattenJsonForTabular = options.flattenJsonForTabular ?? true;

  // Step 1: parse input to intermediate JSON-like structure
  let data: unknown;

  try {
    switch (from) {
      case 'json':
        data = JSON.parse(input);
        break;
      case 'csv':
        data = csvToObjects(input, csvDelimiter, csvQuoteChar, csvHasHeader);
        break;
      case 'tsv':
        data = csvToObjects(input, '\t', csvQuoteChar, csvHasHeader);
        break;
      case 'xml':
        data = xmlToJson(input);
        break;
      case 'yaml':
        data = yamlToJson(input);
        break;
    }
  } catch (error) {
    throw normalizeDataParseError(error, input, from);
  }

  // Step 2: serialize to target format
  switch (to) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'csv':
      return objectsToDelimited(
        toTabularRows(data, flattenJsonForTabular),
        csvDelimiter,
        csvQuoteChar,
        csvHasHeader,
      );
    case 'tsv':
      return objectsToDelimited(
        toTabularRows(data, flattenJsonForTabular),
        '\t',
        csvQuoteChar,
        csvHasHeader,
      );
    case 'xml':
      return `<?xml version="1.0" encoding="UTF-8"?>\n${jsonToXml(data, 'root')}`;
    case 'yaml':
      return jsonToYaml(data);
  }
}

// ── Markdown → HTML ──

export function markdownToHtml(md: string): string {
  let html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links & images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Blockquotes
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr />')
    // Unordered lists
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Line breaks → paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  html = `<p>${html}</p>`;
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  // Wrap lists
  html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  return html;
}

// ── Base64 ↔ File ──

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(dataUrl: string): Blob {
  const [meta, data] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── File size formatting ──

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
