// Wrap an HTML container in a synthetic <svg> via <foreignObject>.
//
// Used by renderers whose visible output isn't a single inclusive <svg>:
//   - ReactFlow renderers (Flowchart / ER / Class / State / Mindmap) — nodes
//     are HTML divs; only the edges live in `svg.react-flow__edges`.
//   - vis-timeline renderers (Gantt / Timeline) — entirely HTML/CSS.
//
// The exported SVG is opened by the centralized export pipeline. Modern
// browsers render <foreignObject> when the SVG is loaded as `<img>` or
// inline, but PNG conversion via canvas-from-image is unreliable across
// browsers, so the same export only guarantees fidelity for SVG output.

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Build a self-contained <svg> that wraps a clone of the given container as
 * a <foreignObject>, preserving inline computed styles so the export looks
 * identical to the on-screen rendering.
 */
export function containerToSvg(
  container: HTMLElement | null,
  options: { backgroundColor?: string | null } = {}
): SVGSVGElement | null {
  if (!container || typeof window === 'undefined') return null;

  const rect = container.getBoundingClientRect();
  const width = Math.max(40, Math.ceil(rect.width));
  const height = Math.max(40, Math.ceil(rect.height));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const bg = options.backgroundColor;
  if (bg !== null && bg !== undefined) {
    const rectEl = document.createElementNS(SVG_NS, 'rect');
    rectEl.setAttribute('x', '0');
    rectEl.setAttribute('y', '0');
    rectEl.setAttribute('width', String(width));
    rectEl.setAttribute('height', String(height));
    rectEl.setAttribute('fill', bg);
    svg.appendChild(rectEl);
  }

  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', '0');
  fo.setAttribute('y', '0');
  fo.setAttribute('width', String(width));
  fo.setAttribute('height', String(height));

  const wrapper = document.createElementNS(XHTML_NS, 'div');
  wrapper.setAttribute('xmlns', XHTML_NS);
  wrapper.setAttribute('style', `width: ${width}px; height: ${height}px;`);

  // Clone the live container with its full subtree, then walk the live + clone
  // pair in parallel and copy computed styles inline. This yields a DOM that
  // is independent of the host page's CSS — required for the SVG to render
  // identically when opened standalone.
  const clone = container.cloneNode(true) as HTMLElement;
  inlineStyles(container, clone);
  wrapper.appendChild(clone);
  fo.appendChild(wrapper);
  svg.appendChild(fo);
  return svg;
}

const COPY_PROPS: readonly string[] = [
  'background',
  'background-color',
  'border',
  'border-radius',
  'box-shadow',
  'color',
  'cursor',
  'display',
  'fill',
  'fill-opacity',
  'flex',
  'flex-direction',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'height',
  'justify-content',
  'align-items',
  'letter-spacing',
  'line-height',
  'margin',
  'opacity',
  'overflow',
  'padding',
  'position',
  'stroke',
  'stroke-dasharray',
  'stroke-width',
  'text-align',
  'text-anchor',
  'text-decoration',
  'transform',
  'transform-origin',
  'visibility',
  'white-space',
  'width',
  'word-break',
  'z-index',
];

function inlineStyles(live: Element, clone: Element): void {
  const visit = (l: Element, c: Element) => {
    if (l instanceof HTMLElement && c instanceof HTMLElement) {
      const cs = window.getComputedStyle(l);
      const decls: string[] = [];
      for (const prop of COPY_PROPS) {
        const val = cs.getPropertyValue(prop);
        if (val && val !== 'auto' && val !== 'normal' && val !== 'none') {
          decls.push(`${prop}: ${val}`);
        }
      }
      if (decls.length > 0) {
        const existing = c.getAttribute('style') ?? '';
        c.setAttribute('style', existing ? `${existing}; ${decls.join('; ')}` : decls.join('; '));
      }
    }
    const ll = l.children;
    const cc = c.children;
    const n = Math.min(ll.length, cc.length);
    for (let i = 0; i < n; i++) visit(ll[i], cc[i]);
  };
  visit(live, clone);
}
