import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, PDFDict, PDFName, PDFStream, StandardFonts, rgb, degrees } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

// CMap + standard font URLs for CJK and international character support
const PDFJS_CMAP_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/cmaps/';
const PDFJS_STANDARD_FONTS_URL =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/standard_fonts/';

function getDocumentOptions(data: Uint8Array) {
  return {
    data,
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true as const,
    standardFontDataUrl: PDFJS_STANDARD_FONTS_URL,
  };
}

export interface PdfPageData {
  originalIndex: number; // 0-based index in the source document
  thumbnail: string;     // small JPEG data URL for sidebar
  width: number;
  height: number;
}

export interface PdfTextItem {
  index: number;
  str: string;
  // Viewport coordinates (pixels at view scale)
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  // PDF user-space coordinates (for export, scale-independent)
  pdfX: number;
  pdfY: number;
  pdfWidth: number;
  pdfFontSize: number; // in PDF points
  pdfRotation: number; // in degrees
}

export interface EditedPageView {
  dataUrl: string;
  textItems: PdfTextItem[];
  viewWidth: number;
  viewHeight: number;
}

// Map<originalPageIndex, Map<textItemIndex, newText>>
export type TextEdits = Map<number, Map<number, string>>;

export async function loadPdfPages(file: File): Promise<PdfPageData[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument(getDocumentOptions(data)).promise;
  const pages: PdfPageData[] = [];

  for (let i = 0; i < pdf.numPages; i++) {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: 0.25 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    await page.render({ canvas, viewport }).promise;

    pages.push({
      originalIndex: i,
      thumbnail: canvas.toDataURL('image/jpeg', 0.7),
      width: canvas.width,
      height: canvas.height,
    });
  }

  return pages;
}

export async function loadPageForEditing(
  file: File,
  originalIndex: number,
  scale = 1.5,
): Promise<EditedPageView> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument(getDocumentOptions(data)).promise;
  const page = await pdf.getPage(originalIndex + 1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvas, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/png');

  // Extract text items with viewport + PDF coordinates
  const textContent = await page.getTextContent();
  // styles map: fontName → { fontFamily, ... }
  const styles: Record<string, { fontFamily?: string }> =
    (textContent as any).styles ?? {};

  const textItems: PdfTextItem[] = [];
  let idx = 0;

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str.trim()) continue;

    const tx = item.transform as number[];
    // tx = [a (scaleX), b (skewY), c (skewX), d (scaleY), e (translateX), f (translateY)]
    // Font height is the magnitude of the vertical axis: sqrt(d² + c²)
    const pdfFontSize = Math.sqrt(tx[3] * tx[3] + tx[2] * tx[2]);
    if (pdfFontSize < 2) continue; // skip sub-pixel items

    // Convert PDF coords → viewport coords (handles Y-flip + scale + rotation)
    const [vx, vy] = viewport.convertToViewportPoint(tx[4], tx[5]);
    const fontSizePx = Math.max(pdfFontSize * scale, 4);
    const itemWidthPx = Math.max(item.width * scale, fontSizePx * 0.5);

    // Rotation angle from transform matrix
    const pdfRotation =
      (Math.atan2(tx[1], tx[0]) * (180 / Math.PI));

    // Font family: use exact CSS font-family from pdfjs (includes embedded @font-face names),
    // fall back to fontName heuristic only if pdfjs has no style info
    let fontFamily = 'sans-serif';
    const styleFontFamily = styles[(item as any).fontName]?.fontFamily ?? '';
    if (styleFontFamily) {
      fontFamily = styleFontFamily; // exact pdfjs CSS font-family (e.g. 'IPAGothic, sans-serif')
    } else {
      const fontName = ((item as any).fontName ?? '').toLowerCase();
      if (fontName.includes('times') || (fontName.includes('serif') && !fontName.includes('sans')))
        fontFamily = 'serif';
      else if (fontName.includes('courier') || fontName.includes('mono'))
        fontFamily = 'monospace';
    }

    textItems.push({
      index: idx++,
      str: item.str,
      x: vx,
      y: vy - fontSizePx, // baseline → top-of-text-box
      width: itemWidthPx,
      height: fontSizePx * 1.3,
      fontSize: fontSizePx,
      fontFamily,
      pdfX: tx[4],
      pdfY: tx[5],
      pdfWidth: item.width,
      pdfFontSize,
      pdfRotation,
    });
  }

  return { dataUrl, textItems, viewWidth: canvas.width, viewHeight: canvas.height };
}

// ── Embedded font extraction ─────────────────────────────────────────────────
// Returns a map of PDF font resource name (e.g. "F1") → raw TTF/OTF bytes.
// Only TrueType (FontFile2) and OpenType/CFF (FontFile3) are extractable;
// Type1 (FontFile) is skipped because pdf-lib cannot re-embed raw Type1 data.
// Most modern PDFs use subset fonts — extracted bytes are valid but only contain
// glyphs present in the original document. New characters not in the subset will
// render as missing glyphs (.notdef boxes) with no error.
async function extractEmbeddedFonts(srcDoc: PDFDocument): Promise<Map<string, Uint8Array>> {
  const result = new Map<string, Uint8Array>();
  try {
    for (const page of srcDoc.getPages()) {
      const resources = page.node.get(PDFName.of('Resources'));
      if (!(resources instanceof PDFDict)) continue;

      const fontDict = srcDoc.context.lookupMaybe(
        resources.get(PDFName.of('Font')),
        PDFDict,
      );
      if (!fontDict) continue;

      for (const [nameObj, ref] of fontDict.entries()) {
        const fontName = nameObj.asString?.() ?? String(nameObj);
        if (result.has(fontName)) continue; // already extracted from another page

        const fontDictEntry = srcDoc.context.lookupMaybe(ref, PDFDict);
        if (!fontDictEntry) continue;

        const descriptor = srcDoc.context.lookupMaybe(
          fontDictEntry.get(PDFName.of('FontDescriptor')),
          PDFDict,
        );
        if (!descriptor) continue;

        // TrueType: FontFile2
        const ttf = srcDoc.context.lookupMaybe(
          descriptor.get(PDFName.of('FontFile2')),
          PDFStream,
        );
        if (ttf) { result.set(fontName, ttf.getContents()); continue; }

        // OpenType/CFF: FontFile3
        const otf = srcDoc.context.lookupMaybe(
          descriptor.get(PDFName.of('FontFile3')),
          PDFStream,
        );
        if (otf) { result.set(fontName, otf.getContents()); }
      }
    }
  } catch {
    // Non-critical — fall back to standard fonts if extraction fails
  }
  return result;
}

export async function exportPdf(
  file: File,
  pages: PdfPageData[],
  textEdits: TextEdits = new Map(),
): Promise<void> {
  const data = new Uint8Array(await file.arrayBuffer());
  const srcDoc = await PDFDocument.load(data);
  const newDoc = await PDFDocument.create();

  const hasEdits = textEdits.size > 0;

  // Always embed standard fallback fonts
  let helvetica: Awaited<ReturnType<typeof newDoc.embedFont>> | undefined;
  let timesRoman: typeof helvetica | undefined;
  let courier: typeof helvetica | undefined;
  if (hasEdits) {
    [helvetica, timesRoman, courier] = await Promise.all([
      newDoc.embedFont(StandardFonts.Helvetica),
      newDoc.embedFont(StandardFonts.TimesRoman),
      newDoc.embedFont(StandardFonts.Courier),
    ]);
  }

  // Extract embedded fonts from the source PDF and re-embed into the new doc.
  // Keyed by PDF resource name (e.g. "F1", "F2"). Falls back to standard fonts
  // if a font can't be extracted or re-embedded (Type1, corrupted stream, etc.).
  const embeddedFontCache = new Map<string, Awaited<ReturnType<typeof newDoc.embedFont>>>();
  if (hasEdits) {
    const rawFonts = await extractEmbeddedFonts(srcDoc);
    for (const [name, bytes] of rawFonts) {
      try {
        embeddedFontCache.set(name, await newDoc.embedFont(bytes));
      } catch {
        // Unsupported format or corrupted stream — will fall back to standard font
      }
    }
  }

  const indices = pages.map(p => p.originalIndex);
  const copiedPages = await newDoc.copyPages(srcDoc, indices);

  // Load pdfjs doc (with cMap support) for text extraction during export
  const pdfjsDoc = hasEdits
    ? await pdfjsLib.getDocument(getDocumentOptions(data.slice(0))).promise
    : null;

  for (let i = 0; i < copiedPages.length; i++) {
    const pdfPage = copiedPages[i];
    newDoc.addPage(pdfPage);

    const editsForPage = textEdits.get(pages[i].originalIndex);
    if (!editsForPage || editsForPage.size === 0 || !pdfjsDoc) continue;

    const srcPage = await pdfjsDoc.getPage(pages[i].originalIndex + 1);
    const textContent = await srcPage.getTextContent();
    const styles: Record<string, { fontFamily?: string }> =
      (textContent as any).styles ?? {};

    let textIdx = 0;
    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue;

      const newText = editsForPage.get(textIdx);
      if (newText !== undefined && newText !== item.str) {
        const tx = item.transform as number[];
        const pdfX = tx[4];
        const pdfY = tx[5];
        // Use vertical axis magnitude for correct font size (matches original pdfExporter)
        const pdfFontSize = Math.max(Math.sqrt(tx[3] * tx[3] + tx[2] * tx[2]), 6);
        const pdfWidth = Math.max(item.width, pdfFontSize * 0.5);
        // Text rotation angle in degrees (atan2(skewY, scaleX))
        const pdfRotation = Math.atan2(tx[1], tx[0]) * (180 / Math.PI);
        const theta = pdfRotation * (Math.PI / 180);
        // Offset rect origin by descender to correctly mask below-baseline glyphs
        const descender = pdfFontSize * 0.25;
        const rectOriginX = pdfX + descender * Math.sin(theta);
        const rectOriginY = pdfY - descender * Math.cos(theta);

        // Resolve font: prefer extracted embedded font, fall back to closest standard font.
        // The PDF resource name for this text item is item.fontName (e.g. "F1", "F2").
        const pdfResourceName = (item as any).fontName as string | undefined;
        let font = embeddedFontCache.get(pdfResourceName ?? '');

        if (!font) {
          // Embedded font not available — pick the closest standard font by name heuristic
          let fontFamily = 'sans-serif';
          const styleFontFamily = styles[pdfResourceName ?? '']?.fontFamily ?? '';
          if (styleFontFamily) {
            const f = styleFontFamily.toLowerCase();
            if (f.includes('serif') && !f.includes('sans')) fontFamily = 'serif';
            else if (f.includes('mono') || f.includes('courier')) fontFamily = 'monospace';
          } else {
            const fn = (pdfResourceName ?? '').toLowerCase();
            if (fn.includes('times') || (fn.includes('serif') && !fn.includes('sans')))
              fontFamily = 'serif';
            else if (fn.includes('courier') || fn.includes('mono')) fontFamily = 'monospace';
          }
          font = fontFamily === 'serif' ? timesRoman! : fontFamily === 'monospace' ? courier! : helvetica!;
        }

        const lines = newText.split('\n');

        // Measure widest line in the substituted font so the mask always covers
        // the replacement text, regardless of font metric differences.
        const maxNewTextWidth = lines.reduce((max, line) => {
          const w = font.widthOfTextAtSize(line || ' ', pdfFontSize);
          return Math.max(max, w);
        }, 0);
        const maskWidth = Math.max(pdfWidth, maxNewTextWidth) + 6;

        // If the single-line replacement is wider than the original slot, scale
        // the font down to fit (stops text spilling over adjacent content).
        let drawFontSize = pdfFontSize;
        if (lines.length === 1 && maxNewTextWidth > pdfWidth && pdfWidth > 0) {
          drawFontSize = Math.max(pdfFontSize * (pdfWidth / maxNewTextWidth), pdfFontSize * 0.5);
        }

        // Mask original text with a rotated white rectangle sized to the wider of
        // original or replacement text.
        pdfPage.drawRectangle({
          x: rectOriginX,
          y: rectOriginY,
          width: maskWidth,
          height: Math.max(pdfFontSize * 1.4, pdfFontSize * 1.2),
          color: rgb(1, 1, 1),
          opacity: 1,
          rotate: degrees(pdfRotation),
        });

        // Draw replacement text at same baseline, with same rotation
        lines.forEach((lineText, lineIdx) => {
          pdfPage.drawText(lineText, {
            x: pdfX,
            y: pdfY - lineIdx * drawFontSize * 1.2,
            size: drawFontSize,
            font,
            color: rgb(0, 0, 0),
            rotate: degrees(pdfRotation),
          });
        });
      }
      textIdx++;
    }
  }

  const bytes = await newDoc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = file.name.replace(/\.pdf$/i, '') + '_edited.pdf';
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
