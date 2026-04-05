import { PDFDocument } from 'pdf-lib';
import html2canvas from 'html2canvas';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────

export type PageSize = 'A4' | 'Letter' | 'Legal';
export type Orientation = 'portrait' | 'landscape';
export type MarginSize = 'none' | 'narrow' | 'normal' | 'wide';
export type FileType = 'pdf' | 'image' | 'docx' | 'xlsx';
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

  return null;
}

// ── Image handling ─────────────────────────────────────────────────

async function canvasEmbedImage(pdfDoc: PDFDocument, file: File) {
  const url = URL.createObjectURL(file);
  return new Promise<Awaited<ReturnType<typeof pdfDoc.embedPng>>>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas context unavailable')); return; }
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

async function imageToPage(pdfDoc: PDFDocument, file: File, settings: PdfSettings): Promise<void> {
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
  const dW = iW * scale;
  const dH = iH * scale;

  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, {
    x: margin + (cW - dW) / 2,
    y: margin + (cH - dH) / 2,
    width: dW,
    height: dH,
  });
}

// ── PDF merging ────────────────────────────────────────────────────

async function embedPdfPages(pdfDoc: PDFDocument, file: File): Promise<void> {
  const srcDoc = await PDFDocument.load(await file.arrayBuffer());
  const pages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
  pages.forEach(p => pdfDoc.addPage(p));
}

// ── DOM-based page cut-point detection ────────────────────────────

interface ElementBounds {
  top: number;
  bottom: number;
}

/**
 * Collects top and bottom edges of every block-level element inside `wrap`,
 * in canvas pixel coordinates (relative to wrap's top).
 */
function collectElementBounds(wrap: HTMLElement): ElementBounds[] {
  const wrapRect = wrap.getBoundingClientRect();

  const SELECTOR = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'pre', 'hr', 'table',
    'ul > li', 'ol > li',
  ].join(', ');

  const bounds: ElementBounds[] = [];
  wrap.querySelectorAll(SELECTOR).forEach(el => {
    const r = el.getBoundingClientRect();
    const top = Math.round(r.top - wrapRect.top);
    const bottom = Math.round(r.bottom - wrapRect.top);
    if (bottom > top && bottom > 0) bounds.push({ top, bottom });
  });

  return bounds.sort((a, b) => a.top - b.top);
}

/**
 * Returns the best page-break Y coordinate at or before `targetY`.
 *
 * Cuts at the bottom of the last element that fits before targetY.
 * Next page then starts at the TOP of the next element (not bottom).
 *
 * Falls back to targetY when nothing fits (element taller than a full page).
 */
function findSafeCutPoint(
  targetY: number,
  bounds: ElementBounds[],
  minY: number,
): number {
  // Elements whose bottom fits before targetY
  const candidates = bounds.filter(b => b.bottom <= targetY && b.bottom > minY);
  if (candidates.length === 0) return targetY;

  // Cut after the last element that fits
  let best = candidates[candidates.length - 1];

  // Orphan check: if the last element is tiny (e.g. isolated heading),
  // use the one before it as cut point
  const ORPHAN_PX = 80;
  if (candidates.length > 1) {
    const prev = candidates[candidates.length - 2];
    if (best.bottom - prev.bottom < ORPHAN_PX) {
      best = prev;
    }
  }

  return best.bottom;
}


// ── HTML → paged canvases → PDF pages ──────────────────────────────

const RENDER_ID = 'pdf-maker-render-root';

const RENDER_CSS = `
  #${RENDER_ID} {
    box-sizing: border-box;
    font-family: Arial, Helvetica, sans-serif !important;
    font-size: 13px !important;
    line-height: 1.6;
    color: #111;
    background: #fff;
    padding: 8px;
  }
  #${RENDER_ID} * { box-sizing: border-box; }
  #${RENDER_ID} h1 { font-size: 22px !important; font-weight: bold !important; margin: 16px 0 8px !important; line-height: 1.3 !important; }
  #${RENDER_ID} h2 { font-size: 18px !important; font-weight: bold !important; margin: 14px 0 6px !important; line-height: 1.3 !important; }
  #${RENDER_ID} h3 { font-size: 15px !important; font-weight: bold !important; margin: 12px 0 5px !important; line-height: 1.3 !important; }
  #${RENDER_ID} h4, #${RENDER_ID} h5, #${RENDER_ID} h6 { font-size: 13px !important; font-weight: bold !important; margin: 10px 0 4px !important; }
  #${RENDER_ID} p { margin: 5px 0; font-size: 13px; }
  #${RENDER_ID} strong, #${RENDER_ID} b { font-weight: bold; }
  #${RENDER_ID} em, #${RENDER_ID} i { font-style: italic; }
  #${RENDER_ID} u { text-decoration: underline; }
  #${RENDER_ID} pre {
    font-family: 'Courier New', Courier, monospace !important;
    font-size: 11px !important;
    white-space: pre-wrap !important;
    word-break: break-word !important;
    background: #f8f8f8;
    border: 1px solid #e0e0e0;
    padding: 6px 8px;
    margin: 6px 0;
    line-height: 1.4;
  }
  #${RENDER_ID} code { font-family: 'Courier New', Courier, monospace !important; font-size: 11px !important; }
  #${RENDER_ID} table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  #${RENDER_ID} td, #${RENDER_ID} th { border: 1px solid #ccc; padding: 4px 8px; vertical-align: top; font-size: 12px; }
  #${RENDER_ID} th { background: #f5f5f5; font-weight: bold; }
  #${RENDER_ID} img { max-width: 100%; height: auto; }
  #${RENDER_ID} ul, #${RENDER_ID} ol { margin: 4px 0; padding-left: 22px; }
  #${RENDER_ID} li { margin: 2px 0; font-size: 13px; }
  #${RENDER_ID} a { color: #1a6bbf; }
  #${RENDER_ID} hr { border: none; border-top: 1px solid #ccc; margin: 10px 0; }
`;

async function htmlToPagedCanvases(
  html: string,
  pagePtW: number,
  pagePtH: number,
  marginPt: number,
): Promise<HTMLCanvasElement[]> {
  const cW = pagePtW - marginPt * 2;
  const cH = pagePtH - marginPt * 2;
  const DPR = 2; // render at 2× for sharper output
  const pxW = Math.round(cW * DPR);
  const pxPageH = Math.round(cH * DPR);

  // Inject scoped styles into <head> for reliable rendering
  const styleEl = document.createElement('style');
  styleEl.textContent = RENDER_CSS;
  document.head.appendChild(styleEl);

  const wrap = document.createElement('div');
  wrap.id = RENDER_ID;
  Object.assign(wrap.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${pxW}px`,
    background: '#ffffff',
  });
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  await new Promise<void>(r => setTimeout(r, 200));

  // Collect element bounds from the DOM — these define valid cut points.
  // Must be done before html2canvas (which removes the element from layout).
  const bounds = collectElementBounds(wrap);

  const full = await html2canvas(wrap, {
    width: pxW,
    backgroundColor: '#ffffff',
    scale: 1,
    useCORS: false,
    logging: false,
    allowTaint: true,
  });

  document.body.removeChild(wrap);
  document.head.removeChild(styleEl);

  const chunks: HTMLCanvasElement[] = [];
  const totalH = full.height;

  let y = 0;
  while (y < totalH) {
    const rawEnd = y + pxPageH;
    if (rawEnd >= totalH) {
      // Last page — take whatever remains
      const h = totalH - y;
      if (h > 0) {
        const chunk = document.createElement('canvas');
        chunk.width = pxW;
        chunk.height = h;
        const ctx = chunk.getContext('2d');
        if (ctx) ctx.drawImage(full, 0, y, pxW, h, 0, 0, pxW, h);
        chunks.push(chunk);
      }
      break;
    }

    const cutY = findSafeCutPoint(rawEnd, bounds, y);
    const h = cutY - y;

    if (h > 0) {
      const chunk = document.createElement('canvas');
      chunk.width = pxW;
      chunk.height = h;
      const ctx = chunk.getContext('2d');
      if (ctx) ctx.drawImage(full, 0, y, pxW, h, 0, 0, pxW, h);
      chunks.push(chunk);
    }

    // Next page starts at the TOP of the next element after cutY
    const next = bounds.find((b: ElementBounds) => b.top >= cutY);
    y = next ? next.top : cutY;

    // Safety: if we didn't advance, force forward to avoid infinite loop
    if (y <= cutY) y = rawEnd;
  }

  return chunks;
}

async function canvasesToPdfPages(
  pdfDoc: PDFDocument,
  canvases: HTMLCanvasElement[],
  settings: PdfSettings,
): Promise<void> {
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];
  const cW = width - margin * 2;
  const cH = height - margin * 2;

  for (const canvas of canvases) {
    const b64 = canvas.toDataURL('image/png').split(',')[1];
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const img = await pdfDoc.embedPng(bytes);
    const { width: iW, height: iH } = img.size();
    const scale = Math.min(cW / iW, cH / iH);

    const page = pdfDoc.addPage([width, height]);
    page.drawImage(img, {
      x: margin + (cW - iW * scale) / 2,
      y: margin + (cH - iH * scale) / 2,
      width: iW * scale,
      height: iH * scale,
    });
  }
}

// ── Word (.docx) ───────────────────────────────────────────────────

async function docxToPages(pdfDoc: PDFDocument, file: File, settings: PdfSettings): Promise<void> {
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];
  const canvases = await htmlToPagedCanvases(result.value, width, height, margin);
  await canvasesToPdfPages(pdfDoc, canvases, settings);
}

// ── Excel (.xlsx) ──────────────────────────────────────────────────

export async function getExcelSheetNames(file: File): Promise<string[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return wb.SheetNames;
}

async function xlsxToPages(
  pdfDoc: PDFDocument,
  file: File,
  selectedSheets: string[],
  settings: PdfSettings,
): Promise<void> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];

  for (const name of selectedSheets) {
    const ws = wb.Sheets[name];
    if (!ws) continue;

    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as string[][];
    const rows = data
      .map(row => `<tr>${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}</tr>`)
      .join('');

    const html = `<div style="font-weight:bold;font-size:14px;margin-bottom:6px;color:#333;">Sheet: ${name}</div><table>${rows}</table>`;

    const canvases = await htmlToPagedCanvases(html, width, height, margin);
    await canvasesToPdfPages(pdfDoc, canvases, settings);
  }
}

// ── Main export ────────────────────────────────────────────────────

export async function buildPdf(
  items: PdfItem[],
  settings: PdfSettings,
  onProgress: (msg: string) => void,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress(`Processing ${i + 1} / ${items.length}: ${item.file.name}`);

    switch (item.fileType) {
      case 'image':
        await imageToPage(pdf, item.file, settings);
        break;
      case 'pdf':
        await embedPdfPages(pdf, item.file);
        break;
      case 'docx':
        await docxToPages(pdf, item.file, settings);
        break;
      case 'xlsx': {
        const sheets = item.selectedSheets?.length
          ? item.selectedSheets
          : (item.availableSheets ?? []);
        await xlsxToPages(pdf, item.file, sheets, settings);
        break;
      }
    }
  }

  return pdf.save();
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
