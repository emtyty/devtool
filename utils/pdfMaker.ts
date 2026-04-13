import { PDFDocument } from 'pdf-lib';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { marked } from 'marked';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import htmlToPdfmake from 'html-to-pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

// Initialize pdfmake virtual font system once at module load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs ?? pdfFonts;

// ── Types ──────────────────────────────────────────────────────────

export type PageSize = 'A4' | 'Letter' | 'Legal';
export type Orientation = 'portrait' | 'landscape';
export type MarginSize = 'none' | 'narrow' | 'normal' | 'wide';
export type FileType = 'pdf' | 'image' | 'docx' | 'xlsx' | 'markdown' | 'html' | 'text' | 'csv';
export type ItemStatus = 'idle' | 'processing' | 'done' | 'error';

export interface PdfItem {
  id: string;
  file: File;
  fileType: FileType;
  status: ItemStatus;
  error?: string;
  availableSheets?: string[];
  selectedSheets?: string[];
}

export interface PdfSettings {
  pageSize: PageSize;
  orientation: Orientation;
  margin: MarginSize;
}

// ── Constants ──────────────────────────────────────────────────────

/** Page dimensions in PDF points (1 pt = 1/72 inch) */
const PAGE_DIMS_PT: Record<PageSize, { width: number; height: number }> = {
  A4:     { width: 595.28, height: 841.89 },
  Letter: { width: 612,    height: 792 },
  Legal:  { width: 612,    height: 1008 },
};

const MARGIN_PT: Record<MarginSize, number> = {
  none:   0,
  narrow: 18,   // 0.25 in
  normal: 54,   // 0.75 in
  wide:   72,   // 1.0 in
};

/** pdfmake expects uppercase page size identifiers */
const PDFMAKE_PAGE_SIZE: Record<PageSize, string> = {
  A4:     'A4',
  Letter: 'LETTER',
  Legal:  'LEGAL',
};

// ── Helpers ────────────────────────────────────────────────────────

function getPageDims(settings: PdfSettings): { width: number; height: number } {
  const { width, height } = PAGE_DIMS_PT[settings.pageSize];
  return settings.orientation === 'landscape'
    ? { width: height, height: width }
    : { width, height };
}

export function detectFileType(file: File): FileType | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/.test(name)) return 'image';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) return 'docx';
  if (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    name.endsWith('.xlsx')
  ) return 'xlsx';
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.html') || name.endsWith('.htm') || type === 'text/html') return 'html';
  if (name.endsWith('.txt') || type === 'text/plain') return 'text';
  if (name.endsWith('.csv') || type === 'text/csv') return 'csv';

  return null;
}

// ── Image → single-page PDF (pdf-lib native embed) ─────────────────

async function canvasEmbedImage(pdfDoc: PDFDocument, file: File) {
  const url = URL.createObjectURL(file);
  return new Promise<Awaited<ReturnType<typeof pdfDoc.embedPng>>>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(async blob => {
        if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        resolve(await pdfDoc.embedPng(bytes));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

async function imageToSinglePdfBytes(file: File, settings: PdfSettings): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];
  const cW = width - margin * 2;
  const cH = height - margin * 2;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = file.type.toLowerCase();

  let image;
  if (type === 'image/jpeg' || type === 'image/jpg') {
    image = await pdfDoc.embedJpg(bytes);
  } else if (type === 'image/png') {
    image = await pdfDoc.embedPng(bytes);
  } else {
    // WebP and other formats: convert via canvas
    image = await canvasEmbedImage(pdfDoc, file);
  }

  const { width: iW, height: iH } = image.size();
  const scale = Math.min(cW / iW, cH / iH);

  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, {
    x: margin + (cW - iW * scale) / 2,
    y: margin + (cH - iH * scale) / 2,
    width: iW * scale,
    height: iH * scale,
  });

  return pdfDoc.save();
}

// ── HTML conversion layer (one function per file type) ─────────────
// Each function returns a plain HTML string that pdfmake can consume.

async function docxToHtml(file: File): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

async function xlsxToHtml(file: File, selectedSheets: string[]): Promise<string> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const parts: string[] = [];

  for (const name of selectedSheets) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
    const rows = data
      .map((row, i) =>
        `<tr>${row.map(cell =>
          `<${i === 0 ? 'th' : 'td'}>${String(cell ?? '')}</${i === 0 ? 'th' : 'td'}>`
        ).join('')}</tr>`
      )
      .join('');
    parts.push(`<h3>Sheet: ${name}</h3><table>${rows}</table>`);
  }

  return parts.join('');
}

async function markdownToHtml(file: File): Promise<string> {
  const text = await file.text();
  return marked.parse(text, { gfm: true });
}

async function txtToHtml(file: File): Promise<string> {
  const text = await file.text();
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split('\n')
    .map(line => (line.trim() ? `<p>${line}</p>` : ''))
    .join('');
}

async function csvToHtml(file: File): Promise<string> {
  const text = await file.text();
  const { parse } = await import('papaparse');
  const result = parse<string[]>(text, { skipEmptyLines: true });
  const rows = result.data
    .map((row, i) => {
      const tag = i === 0 ? 'th' : 'td';
      return `<tr>${row.map(cell => `<${tag}>${cell}</${tag}>`).join('')}</tr>`;
    })
    .join('');
  return `<table>${rows}</table>`;
}

// ── pdfmake renderer ───────────────────────────────────────────────
// Single path: HTML string → htmlToPdfmake → pdfmake → PDF bytes (Uint8Array)
// Output always has a real text layer (selectable / searchable).

/**
 * Injects inline font-size on every <pre> block so the longest line fits
 * within the available content width.  Uses adaptive sizing (5–9 pt) so
 * narrow blocks get a readable size and very wide ASCII wireframes shrink
 * enough to avoid horizontal clipping.
 *
 * Inline styles are more reliable than htmlToPdfmake's `defaultStyles` option
 * because the library applies them directly to the generated text nodes.
 */
function scalePreBlocks(html: string, contentWidthPt: number): string {
  return html.replace(/<pre\b([^>]*?)>([\s\S]*?)<\/pre>/gi, (_, attrs: string, body: string) => {
    const plain = body
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z#0-9]+;/gi, 'x');
    const maxLen = Math.max(...plain.split('\n').map(l => l.length), 1);
    const idealSize = contentWidthPt / (maxLen * 0.6);
    const fontSize = Math.max(5, Math.min(9, Math.floor(idealSize)));
    return `<pre${attrs} style="font-size:${fontSize}pt;line-height:1.2;">${body}</pre>`;
  });
}

async function htmlToPdfBytes(html: string, settings: PdfSettings): Promise<Uint8Array> {
  const { width } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];
  const contentWidth = width - margin * 2;

  // Scale <pre> blocks (ASCII art / wide code blocks)
  let processedHtml = scalePreBlocks(html, contentWidth);

  // Constrain embedded <img> to content width so they don't overflow the page.
  // html-to-pdfmake reads the width attribute and passes it to pdfmake (in pt).
  processedHtml = processedHtml.replace(
    /<img\b([^>]*?)>/gi,
    (_, attrs) => `<img${attrs} width="${Math.floor(contentWidth)}">`,
  );

  const content = htmlToPdfmake(processedHtml);

  const docDefinition: TDocumentDefinitions = {
    pageSize: PDFMAKE_PAGE_SIZE[settings.pageSize] as TDocumentDefinitions['pageSize'],
    pageOrientation: settings.orientation,
    pageMargins: [margin, margin, margin, margin],
    content,
    defaultStyle: { fontSize: 11 },
  };

  const buffer = await pdfMake.createPdf(docDefinition).getBuffer();
  return new Uint8Array(buffer);
}

// ── Excel sheet names ──────────────────────────────────────────────

export async function getExcelSheetNames(file: File): Promise<string[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames;
}

// ── Main export ────────────────────────────────────────────────────
// Pipeline per item:
//   PDF    → pdf-lib copyPages (native, preserves everything)
//   Image  → pdf-lib embed (native, fit-to-page)
//   Others → fileToHtml() → htmlToPdfmake() → pdfmake (selectable text)
//
// All item PDFs are merged in order via pdf-lib into the final document.

export async function buildPdf(
  items: PdfItem[],
  settings: PdfSettings,
  onProgress: (msg: string) => void,
): Promise<Uint8Array> {
  const finalDoc = await PDFDocument.create();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress(`Processing ${i + 1} / ${items.length}: ${item.file.name}`);

    let itemBytes: Uint8Array;

    switch (item.fileType) {
      case 'pdf':
        itemBytes = new Uint8Array(await item.file.arrayBuffer());
        break;

      case 'image':
        itemBytes = await imageToSinglePdfBytes(item.file, settings);
        break;

      case 'docx': {
        const html = await docxToHtml(item.file);
        itemBytes = await htmlToPdfBytes(html, settings);
        break;
      }

      case 'xlsx': {
        const sheets = item.selectedSheets?.length
          ? item.selectedSheets
          : (item.availableSheets ?? []);
        const html = await xlsxToHtml(item.file, sheets);
        itemBytes = await htmlToPdfBytes(html, settings);
        break;
      }

      case 'markdown': {
        const html = await markdownToHtml(item.file);
        itemBytes = await htmlToPdfBytes(html, settings);
        break;
      }

      case 'html':
        itemBytes = await htmlToPdfBytes(await item.file.text(), settings);
        break;

      case 'text': {
        const html = await txtToHtml(item.file);
        itemBytes = await htmlToPdfBytes(html, settings);
        break;
      }

      case 'csv': {
        const html = await csvToHtml(item.file);
        itemBytes = await htmlToPdfBytes(html, settings);
        break;
      }

      default:
        throw new Error(`Unsupported file type: ${(item as PdfItem).fileType}`);
    }

    const srcDoc = await PDFDocument.load(itemBytes);
    const pages = await finalDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    pages.forEach(p => finalDoc.addPage(p));
  }

  return finalDoc.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const name = filename.trim().endsWith('.pdf') ? filename.trim() : `${filename.trim()}.pdf`;
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
