import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toSvgString,
  getSvgDimensions,
  copySvgToClipboard,
  downloadSvg,
  INLINEABLE_STYLE_PROPS,
  type SvgSource,
} from '../../utils/diagrams/export';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvg(setup?: (svg: SVGSVGElement) => void): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 100 100');
  setup?.(svg);
  return svg;
}

describe('toSvgString', () => {
  it('returns string sources verbatim', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
    expect(toSvgString(svg)).toBe(svg);
  });

  it('serializes a DOM SVGSVGElement to a well-formed string', () => {
    const svg = makeSvg((s) => {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('width', '50');
      rect.setAttribute('height', '50');
      s.appendChild(rect);
    });

    const out = toSvgString(svg, { inlineStyles: false });

    expect(out).toContain('<svg');
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).toContain('<rect');
    expect(out).toContain('width="50"');
  });

  it('inserts xmlns and xmlns:xlink namespace declarations when missing', () => {
    const svg = makeSvg();
    const out = toSvgString(svg, { inlineStyles: false });
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });

  it('strips <foreignObject> by default', () => {
    const svg = makeSvg((s) => {
      const fo = document.createElementNS(SVG_NS, 'foreignObject');
      fo.setAttribute('width', '50');
      fo.setAttribute('height', '50');
      const div = document.createElement('div');
      div.textContent = 'should be stripped';
      fo.appendChild(div);
      s.appendChild(fo);
    });

    const out = toSvgString(svg);
    expect(out).not.toContain('<foreignObject');
    expect(out).not.toContain('should be stripped');
  });

  it('keeps <foreignObject> when stripForeignObject is false', () => {
    const svg = makeSvg((s) => {
      s.appendChild(document.createElementNS(SVG_NS, 'foreignObject'));
    });

    const out = toSvgString(svg, { inlineStyles: false, stripForeignObject: false });
    expect(out).toContain('foreignObject');
  });

  it('does not mutate the live source DOM (clones first)', () => {
    const svg = makeSvg((s) => {
      const fo = document.createElementNS(SVG_NS, 'foreignObject');
      s.appendChild(fo);
    });
    document.body.appendChild(svg);
    try {
      toSvgString(svg);
      // foreignObject was stripped from the OUTPUT, but original DOM still has it
      expect(svg.querySelector('foreignObject')).not.toBeNull();
    } finally {
      document.body.removeChild(svg);
    }
  });

  it('resolves a function source', () => {
    const svg = makeSvg();
    const out = toSvgString(() => svg, { inlineStyles: false });
    expect(out).toContain('<svg');
  });

  it('throws when a function source returns null', () => {
    expect(() => toSvgString(() => null)).toThrow(/null/);
  });

  it('inlines computed styles onto the cloned tree', () => {
    const svg = makeSvg((s) => {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('width', '50');
      rect.setAttribute('height', '50');
      // Inline fill — reliably reflected in getComputedStyle even in JSDOM
      (rect as SVGElement).style.fill = 'rgb(255, 0, 0)';
      s.appendChild(rect);
    });
    document.body.appendChild(svg);
    try {
      const out = toSvgString(svg);
      // Output should contain the inlined fill on the cloned rect
      expect(out).toMatch(/<rect[^>]*style="[^"]*fill: rgb\(255,\s*0,\s*0\)/);
    } finally {
      document.body.removeChild(svg);
    }
  });

  it('does not pollute the live source with additional style attributes during inlining', () => {
    const svg = makeSvg((s) => {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('width', '50');
      rect.setAttribute('height', '50');
      s.appendChild(rect);
    });
    document.body.appendChild(svg);
    try {
      const before = svg.querySelector('rect')?.getAttribute('style');
      toSvgString(svg);
      const after = svg.querySelector('rect')?.getAttribute('style');
      // toSvgString must not mutate the live element's style attribute
      expect(after).toBe(before);
    } finally {
      document.body.removeChild(svg);
    }
  });
});

describe('INLINEABLE_STYLE_PROPS', () => {
  it('includes the visual properties needed to reproduce a diagram', () => {
    expect(INLINEABLE_STYLE_PROPS).toContain('fill');
    expect(INLINEABLE_STYLE_PROPS).toContain('stroke');
    expect(INLINEABLE_STYLE_PROPS).toContain('font-family');
    expect(INLINEABLE_STYLE_PROPS).toContain('font-size');
    expect(INLINEABLE_STYLE_PROPS).toContain('opacity');
  });

  it('does not include event-related or animation properties', () => {
    // Keep the export file lean — never inline these.
    expect(INLINEABLE_STYLE_PROPS).not.toContain('animation');
    expect(INLINEABLE_STYLE_PROPS).not.toContain('transition');
    expect(INLINEABLE_STYLE_PROPS).not.toContain('pointer-events');
  });
});

describe('getSvgDimensions', () => {
  it('extracts dimensions from viewBox', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"></svg>';
    expect(getSvgDimensions(svg)).toEqual({ width: 320, height: 240 });
  });

  it('falls back to width/height attributes when viewBox is missing', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"></svg>';
    expect(getSvgDimensions(svg)).toEqual({ width: 640, height: 480 });
  });

  it('falls back to 800×600 when neither viewBox nor width/height is present', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(getSvgDimensions(svg)).toEqual({ width: 800, height: 600 });
  });

  it('handles comma-separated viewBox values', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,200,100"></svg>';
    expect(getSvgDimensions(svg)).toEqual({ width: 200, height: 100 });
  });

  it('returns fallback when viewBox is malformed', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="garbage"></svg>';
    expect(getSvgDimensions(svg)).toEqual({ width: 800, height: 600 });
  });
});

describe('copySvgToClipboard', () => {
  beforeEach(() => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockClear();
  });

  it('writes the resolved SVG string to the clipboard', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    await copySvgToClipboard(svg);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(svg);
  });

  it('serializes a DOM source before writing to the clipboard', async () => {
    const svg = makeSvg();
    await copySvgToClipboard(svg);
    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(written).toContain('<svg');
    expect(written).toContain('viewBox="0 0 100 100"');
  });

  it('accepts a function source', async () => {
    const svg = makeSvg();
    const source: SvgSource = () => svg;
    await copySvgToClipboard(source);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});

describe('downloadSvg', () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let downloadAnchor: HTMLAnchorElement | null = null;

  beforeEach(() => {
    clickSpy = vi.fn();
    const orig = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag);
      if (tag === 'a') {
        downloadAnchor = el as HTMLAnchorElement;
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el as HTMLElement;
    });
  });

  afterEach(() => {
    createElementSpy.mockRestore();
    downloadAnchor = null;
  });

  it('triggers a click on a download anchor with the requested filename', async () => {
    await downloadSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'test.svg');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(downloadAnchor?.getAttribute('download')).toBe('test.svg');
    expect(downloadAnchor?.getAttribute('href')).toMatch(/^blob:/);
  });

  it('serializes DOM sources before downloading', async () => {
    const svg = makeSvg((s) => {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('width', '20');
      s.appendChild(rect);
    });
    await downloadSvg(svg, 'dom.svg');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(downloadAnchor?.getAttribute('download')).toBe('dom.svg');
  });
});
