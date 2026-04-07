import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import html2canvas from 'html2canvas';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { marked } from 'marked';

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

  // Render inside an isolated iframe so Tailwind v4's oklch() colors never
  // reach html2canvas's CSS parser (the iframe has no page stylesheets).
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${pxW}px`,
    height: '1px',
    border: 'none',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);

  const iDoc = iframe.contentDocument!;
  iDoc.open();
  iDoc.write(
    `<!DOCTYPE html><html><head><style>${RENDER_CSS}</style></head>` +
    `<body style="margin:0;padding:0;background:#fff">` +
    `<div id="${RENDER_ID}" style="width:${pxW}px;background:#fff">${html}</div>` +
    `</body></html>`,
  );
  iDoc.close();

  await new Promise<void>(r => setTimeout(r, 200));

  const wrap = iDoc.getElementById(RENDER_ID) as HTMLElement;

  // Expand iframe to full content height so getBoundingClientRect is accurate
  iframe.style.height = `${wrap.scrollHeight}px`;
  await new Promise<void>(r => setTimeout(r, 50));

  // Collect element bounds from the DOM — these define valid cut points.
  const bounds = collectElementBounds(wrap);

  const full = await html2canvas(wrap, {
    width: pxW,
    backgroundColor: '#ffffff',
    scale: 1,
    useCORS: false,
    logging: false,
    allowTaint: true,
  });

  document.body.removeChild(iframe);

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

// ── DOCX → real PDF text (editable in PDF Editor) ─────────────────
// Renders mammoth HTML as native pdf-lib text instead of rasterizing,
// so the resulting pages have a real text layer that pdf.js can extract.

type EmbeddedFont = Awaited<ReturnType<PDFDocument['embedFont']>>;

function wrapTextToLines(
  text: string,
  font: EmbeddedFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    let testWidth = maxWidth + 1;
    try { testWidth = font.widthOfTextAtSize(test, fontSize); } catch { /* non-encodable */ }
    if (testWidth > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

// ── Pseudo-HTML tag style map ──────────────────────────────────────
// Maps tag name → [fontKey, fontSize, spaceBefore, spaceAfter, indent, prefix]
// fontKey: 'regular' | 'bold' | 'italic' | 'mono'

type FontKey = 'regular' | 'bold' | 'italic' | 'mono';
interface TagStyle { font: FontKey; size: number; before: number; after: number; indent: number; prefix: string }

const PSEUDO_TAG_STYLES: Record<string, TagStyle> = {
  h1: { font: 'bold',    size: 20, before: 8, after: 6,  indent: 0, prefix: ''    },
  h2: { font: 'bold',    size: 16, before: 6, after: 5,  indent: 0, prefix: ''    },
  h3: { font: 'bold',    size: 13, before: 5, after: 4,  indent: 0, prefix: ''    },
  h4: { font: 'bold',    size: 12, before: 4, after: 3,  indent: 0, prefix: ''    },
  h5: { font: 'bold',    size: 11, before: 4, after: 3,  indent: 0, prefix: ''    },
  h6: { font: 'bold',    size: 11, before: 4, after: 3,  indent: 0, prefix: ''    },
  p:  { font: 'regular', size: 11, before: 0, after: 5,  indent: 0, prefix: ''    },
  li: { font: 'regular', size: 11, before: 0, after: 2,  indent: 8, prefix: '• '  },
  pre:{ font: 'mono',    size:  9, before: 0, after: 4,  indent: 0, prefix: ''    },
  code:{ font: 'mono',   size:  9, before: 0, after: 4,  indent: 0, prefix: ''    },
  b:  { font: 'bold',    size: 11, before: 0, after: 3,  indent: 0, prefix: ''    },
  a:  { font: 'regular', size: 11, before: 0, after: 3,  indent: 0, prefix: ''    },
  div:{ font: 'regular', size: 11, before: 0, after: 3,  indent: 0, prefix: ''    },
  blockquote: { font: 'italic', size: 11, before: 4, after: 4, indent: 16, prefix: '' },
};

// Tags checked longest-first to avoid prefix collisions (blockquote before b, pre before p)
const PSEUDO_TAG_ORDER = Object.keys(PSEUDO_TAG_STYLES).sort((a, b) => b.length - a.length);

const PSEUDO_SKIP = new Set(['head','body','html','ul','ol','br','hr']);

type DrawBlockFn = (text: string, font: EmbeddedFont, size: number, before: number, after: number, indent?: number) => void;
type FontMap = { regular: EmbeddedFont; bold: EmbeddedFont; italic: EmbeddedFont; mono: EmbeddedFont };

function renderPseudoHtml(text: string, fonts: FontMap, drawBlock: DrawBlockFn): void {
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();

    const firstWord = lower.split(/\s+/)[0];
    if (PSEUDO_SKIP.has(firstWord) || lower.startsWith('!doctype') ||
        lower.startsWith('meta ') || lower.startsWith('title') || lower.startsWith('link ')) continue;

    let drawn = false;
    for (const tag of PSEUDO_TAG_ORDER) {
      if (!lower.startsWith(tag)) continue;

      // Strip leading tag + any attribute pairs (word=value), then trailing tag
      let content = line.slice(tag.length).replace(/^\s*(?:\w[\w-]*=\S+\s+)+/, '').trim();
      if (content.toLowerCase().endsWith(tag)) content = content.slice(0, content.length - tag.length).trim();
      if (!content) { drawn = true; break; }

      const s = PSEUDO_TAG_STYLES[tag];
      drawBlock(s.prefix + content, fonts[s.font], s.size, s.before, s.after, s.indent);
      drawn = true;
      break;
    }

    if (!drawn) drawBlock(line, fonts.regular, 11, 0, 3);
  }
}

async function htmlTextToPdfPages(
  pdfDoc: PDFDocument,
  html: string,
  pageW: number,
  pageH: number,
  margin: number,
): Promise<void> {
  const cW = pageW - margin * 2;

  const fonts = {
    regular:  await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold:     await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    italic:   await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    mono:     await pdfDoc.embedFont(StandardFonts.Courier),
  };

  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - margin; // current Y, moves downward

  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
  }

  function drawLines(
    lines: string[],
    font: EmbeddedFont,
    fontSize: number,
    indent = 0,
  ) {
    const lineH = fontSize * 1.4;
    for (const line of lines) {
      ensureSpace(lineH);
      try {
        page.drawText(line, {
          x: margin + indent,
          y: y - fontSize,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      } catch { /* skip unencodable characters */ }
      y -= lineH;
    }
  }

  function drawBlock(
    text: string,
    font: EmbeddedFont,
    fontSize: number,
    spaceBefore = 0,
    spaceAfter = 5,
    indent = 0,
  ) {
    if (!text.trim()) return;
    y -= spaceBefore;
    const lines = wrapTextToLines(text, font, fontSize, cW - indent);
    drawLines(lines, font, fontSize, indent);
    y -= spaceAfter;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // No HTML elements found — try to detect pseudo-HTML (tag names without < >)
  // e.g. "h1Welcome to My Websiteh1" or "pSome text p"
  if (doc.body.children.length === 0) {
    renderPseudoHtml((doc.body.textContent ?? html), fonts, drawBlock);
    return;
  }

  for (const el of Array.from(doc.body.children)) {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() ?? '';

    switch (tag) {
      case 'h1': drawBlock(text, fonts.bold,    20, 8, 6); break;
      case 'h2': drawBlock(text, fonts.bold,    16, 6, 5); break;
      case 'h3': drawBlock(text, fonts.bold,    13, 5, 4); break;
      case 'h4':
      case 'h5':
      case 'h6': drawBlock(text, fonts.bold,    12, 4, 3); break;
      case 'p':  drawBlock(text, fonts.regular, 11, 0, 5); break;
      case 'pre': {
        for (const line of text.split('\n')) {
          const fs = 9;
          ensureSpace(fs * 1.4);
          try {
            page.drawText(line || ' ', {
              x: margin, y: y - fs, size: fs,
              font: fonts.mono, color: rgb(0, 0, 0),
            });
          } catch { /* skip */ }
          y -= fs * 1.4;
        }
        y -= 4;
        break;
      }
      case 'ul':
      case 'ol': {
        for (const li of Array.from(el.querySelectorAll(':scope > li'))) {
          const liText = li.textContent?.trim() ?? '';
          if (liText) drawBlock('• ' + liText, fonts.regular, 11, 0, 2, 8);
        }
        y -= 3;
        break;
      }
      case 'table': {
        for (const row of Array.from(el.querySelectorAll('tr'))) {
          const isHeader = !!row.querySelector('th');
          const cells = Array.from(row.querySelectorAll('td, th'));
          const rowText = cells.map(c => c.textContent?.trim() ?? '').join('   ');
          drawBlock(rowText, isHeader ? fonts.bold : fonts.regular, 10, 0, 2);
        }
        y -= 4;
        break;
      }
      case 'hr': {
        ensureSpace(12);
        page.drawLine({
          start: { x: margin,      y: y - 6 },
          end:   { x: pageW - margin, y: y - 6 },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        });
        y -= 12;
        break;
      }
    }
  }
}

// ── Word (.docx) ───────────────────────────────────────────────────

async function docxToPages(pdfDoc: PDFDocument, file: File, settings: PdfSettings): Promise<void> {
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];
  await htmlTextToPdfPages(pdfDoc, result.value, width, height, margin);
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

// ── Markdown (.md) ────────────────────────────────────────────────

async function markdownToPages(pdfDoc: PDFDocument, file: File, settings: PdfSettings): Promise<void> {
  const text = await file.text();
  const html = await marked.parse(text, { gfm: true });
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];
  await htmlTextToPdfPages(pdfDoc, html, width, height, margin);
}

// ── HTML (.html / .htm) ───────────────────────────────────────────

async function htmlFileToPages(pdfDoc: PDFDocument, file: File, settings: PdfSettings): Promise<void> {
  const raw = await file.text();
  // htmlTextToPdfPages already uses DOMParser internally and reads doc.body.children,
  // so passing the full HTML document directly is correct — no pre-sanitisation needed.
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];
  await htmlTextToPdfPages(pdfDoc, raw, width, height, margin);
}

// ── Plain text (.txt) ─────────────────────────────────────────────

async function txtToPages(pdfDoc: PDFDocument, file: File, settings: PdfSettings): Promise<void> {
  const text = await file.text();
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];
  // Wrap each line in <p> so htmlTextToPdfPages renders as plain text (no pseudo-HTML detection)
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = escaped.split('\n')
    .map(line => line.trim() ? `<p>${line}</p>` : '')
    .join('');
  await htmlTextToPdfPages(pdfDoc, html, width, height, margin);
}

// ── CSV (.csv) ────────────────────────────────────────────────────

async function csvToPages(pdfDoc: PDFDocument, file: File, settings: PdfSettings): Promise<void> {
  const text = await file.text();
  const { width, height } = getPageDims(settings);
  const margin = MARGIN_PT[settings.margin];

  const { parse } = await import('papaparse');
  const result = parse<string[]>(text, { skipEmptyLines: true });
  const rows = result.data
    .map((row, i) => {
      const cells = row.map(cell => `<${i === 0 ? 'th' : 'td'}>${cell}</${i === 0 ? 'th' : 'td'}>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  await htmlTextToPdfPages(pdfDoc, `<table>${rows}</table>`, width, height, margin);
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
      case 'markdown':
        await markdownToPages(pdf, item.file, settings);
        break;
      case 'html':
        await htmlFileToPages(pdf, item.file, settings);
        break;
      case 'text':
        await txtToPages(pdf, item.file, settings);
        break;
      case 'csv':
        await csvToPages(pdf, item.file, settings);
        break;
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
