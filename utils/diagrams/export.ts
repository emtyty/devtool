// Centralized SVG/PNG export pipeline for diagrams.
//
// Single source of truth — replaces the parallel implementations that used
// to live inline in MarkdownPreview's MermaidBlock and DiagramGenerator.
// Renderer-agnostic by design: anything that produces a live <svg> element
// or a serialized SVG string can plug in.
//
// "Same look and feel" guarantee: when the source is a live DOM element,
// computed CSS styles are walked and copied to inline `style="…"` attributes
// on a cloned tree before serialization. The exported file therefore renders
// identically in any viewer (browser, Inkscape, Office) without depending on
// the host page's stylesheet.

export type SvgSource =
  | string
  | SVGSVGElement
  | (() => SVGSVGElement | null);

export interface PngOptions {
  /** Canvas resolution multiplier. Default: 2 (Retina-friendly). */
  scale?: number;
  /** Background color. Pass `null` for transparent. Default: `'#ffffff'`. */
  background?: string | null;
}

export interface SvgStringOptions {
  /**
   * When the source is a DOM element, copy `getComputedStyle()` values onto
   * inline `style="…"` attributes so the standalone SVG carries its own
   * presentation. Set to `false` if the source is already self-contained
   * (e.g. SVG built by a custom renderer that emits inline attributes).
   * Default: true.
   */
  inlineStyles?: boolean;
  /**
   * Strip <foreignObject> elements from the output. Required for canvas-based
   * PNG conversion (browsers can't rasterize foreignObject). Default: true.
   */
  stripForeignObject?: boolean;
}

// Visual-only CSS properties we capture during style inlining. Conservative
// list — animations, transitions, and event-related properties are excluded.
// Order matters loosely (later properties win in some CSS rules), but for
// plain `style="…"` attribute output the order is presentational only.
export const INLINEABLE_STYLE_PROPS: readonly string[] = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'opacity',
  'visibility',
  'display',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'letter-spacing',
  'color',
  'cursor',
];

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

function resolveSource(source: SvgSource): SVGSVGElement | string {
  if (typeof source === 'string') return source;
  if (typeof source === 'function') {
    const el = source();
    if (!el) throw new Error('SVG source resolver returned null');
    return el;
  }
  return source;
}

// Walks `live` and `clone` in parallel (they have identical structure because
// `clone` was just produced by cloneNode(true) on `live`). Reads computed
// styles from the live element and writes them as inline `style` attributes
// on the matching clone element. Mutates `clone`; never mutates `live`.
function inlineStylesOnClone(live: Element, clone: Element): void {
  if (typeof window === 'undefined' || !window.getComputedStyle) return;

  const visit = (l: Element, c: Element) => {
    const computed = window.getComputedStyle(l);
    const decls: string[] = [];
    for (const prop of INLINEABLE_STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && value !== '' && value !== 'none' && value !== 'normal') {
        // Skip default values that bloat output without changing rendering
        decls.push(`${prop}: ${value}`);
      }
    }
    if (decls.length > 0) {
      const existing = c.getAttribute('style') ?? '';
      const merged = existing ? `${existing}; ${decls.join('; ')}` : decls.join('; ');
      c.setAttribute('style', merged);
    }
    const liveChildren = l.children;
    const cloneChildren = c.children;
    const n = Math.min(liveChildren.length, cloneChildren.length);
    for (let i = 0; i < n; i++) visit(liveChildren[i], cloneChildren[i]);
  };

  visit(live, clone);
}

/**
 * Convert any `SvgSource` to a self-contained SVG string.
 *
 * Pipeline for DOM sources:
 *   1. Clone the element (no live-DOM mutation)
 *   2. Ensure xmlns / xmlns:xlink namespace declarations are present
 *   3. Walk live + clone in parallel and inline computed styles onto the clone
 *   4. Strip <foreignObject> children (break canvas-based PNG conversion)
 *   5. Serialize via XMLSerializer
 */
export function toSvgString(source: SvgSource, options: SvgStringOptions = {}): string {
  const inlineStyles = options.inlineStyles !== false;
  const stripForeignObject = options.stripForeignObject !== false;

  const resolved = resolveSource(source);
  if (typeof resolved === 'string') return resolved;

  const clone = resolved.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', SVG_NS);
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', XLINK_NS);

  if (inlineStyles) inlineStylesOnClone(resolved, clone);
  if (stripForeignObject) clone.querySelectorAll('foreignObject').forEach((el) => el.remove());

  return new XMLSerializer().serializeToString(clone);
}

/**
 * Extracts intrinsic dimensions from an SVG string.
 * Preference: viewBox → width/height attributes → fallback (800×600).
 *
 * Uses regex rather than DOMParser to stay bulletproof across XML namespace
 * quirks (jsdom's DOMParser is fussier than browser DOMParser about
 * `image/svg+xml` parse mode + querySelector).
 */
export function getSvgDimensions(svg: string): { width: number; height: number } {
  const fallback = { width: 800, height: 600 };

  const vbMatch = svg.match(/viewBox\s*=\s*["']([^"']+)["']/);
  if (vbMatch) {
    const parts = vbMatch[1]
      .split(/[\s,]+/)
      .map((p) => parseFloat(p))
      .filter((n) => !isNaN(n));
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  // width / height attributes on the root <svg> element. The negative
  // lookbehind isn't supported in older engines, so we anchor to `<svg`.
  const rootMatch = svg.match(/<svg\b[^>]*>/);
  if (rootMatch) {
    const root = rootMatch[0];
    const wMatch = root.match(/\swidth\s*=\s*["']([^"']+)["']/);
    const hMatch = root.match(/\sheight\s*=\s*["']([^"']+)["']/);
    const w = wMatch ? parseFloat(wMatch[1]) : NaN;
    const h = hMatch ? parseFloat(hMatch[1]) : NaN;
    return {
      width: !isNaN(w) && w > 0 ? w : fallback.width,
      height: !isNaN(h) && h > 0 ? h : fallback.height,
    };
  }

  return fallback;
}

/** Convert an SVG string to a PNG `Blob` via an offscreen `<canvas>`. */
export async function svgToPngBlob(svg: string, options: PngOptions = {}): Promise<Blob> {
  const scale = options.scale ?? 2;
  const background = options.background === undefined ? '#ffffff' : options.background;
  const { width, height } = getSvgDimensions(svg);

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG image for PNG conversion'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    if (background !== null) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob() returned null'))),
        'image/png'
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  // Defer cleanup — `a.click()` schedules the download asynchronously, and
  // revoking the blob URL synchronously cancels it in some browsers.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

/** Download the SVG as a file. Preserves <foreignObject> so renderers that
 *  embed HTML (ReactFlow nodes, vis-timeline) export their full visual,
 *  not just the edges layer. */
export async function downloadSvg(source: SvgSource, filename: string): Promise<void> {
  const svg = toSvgString(source, { stripForeignObject: false });
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, filename);
}

/** Download the diagram as PNG. */
export async function downloadPng(
  source: SvgSource,
  filename: string,
  options: PngOptions = {}
): Promise<void> {
  const svg = toSvgString(source);
  const blob = await svgToPngBlob(svg, options);
  triggerDownload(blob, filename);
}

/** Copy the SVG markup to the clipboard as plain text. */
export async function copySvgToClipboard(source: SvgSource): Promise<void> {
  const svg = toSvgString(source, { stripForeignObject: false });
  await navigator.clipboard.writeText(svg);
}

/** Copy the diagram to the clipboard as a PNG image. */
export async function copyPngToClipboard(source: SvgSource, options: PngOptions = {}): Promise<void> {
  const svg = toSvgString(source);
  const blob = await svgToPngBlob(svg, options);
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard image write not supported in this environment');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
