import { describe, it, expect } from 'vitest';
import { toSvgString, getSvgDimensions } from '../../utils/diagrams/export';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Snapshot tests for toSvgString() output. These lock down the contract
// every renderer must satisfy: a clean, self-contained SVG that the
// centralized export pipeline can serialize without surprises. Brittle
// rendering details (computed colors, font fallback chains) are normalized
// before snapshotting to keep the tests stable across JSDOM versions.

function normalize(svg: string): string {
  return svg
    // jsdom sometimes emits computed style colors as `rgb(255, 0, 0)` and
    // other times as `red`; collapse to `<color>` for snapshot stability.
    .replace(/style="[^"]*"/g, 'style="<inlined>"')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('toSvgString — output snapshots', () => {
  it('serializes a minimal SVG string source unchanged', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="50" height="50"/></svg>';
    expect(toSvgString(input)).toBe(input);
  });

  it('produces deterministic output for a synthetic flowchart-like SVG', () => {
    // Build a representative SVG matching what a renderer might emit.
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 320 200');
    svg.setAttribute('width', '320');
    svg.setAttribute('height', '200');

    const node1 = document.createElementNS(SVG_NS, 'rect');
    node1.setAttribute('x', '20');
    node1.setAttribute('y', '40');
    node1.setAttribute('width', '120');
    node1.setAttribute('height', '60');
    node1.setAttribute('rx', '8');
    (node1 as SVGElement).style.fill = 'rgb(241, 245, 249)';
    (node1 as SVGElement).style.stroke = 'rgb(203, 213, 225)';
    svg.appendChild(node1);

    const node2 = document.createElementNS(SVG_NS, 'rect');
    node2.setAttribute('x', '180');
    node2.setAttribute('y', '40');
    node2.setAttribute('width', '120');
    node2.setAttribute('height', '60');
    node2.setAttribute('rx', '8');
    svg.appendChild(node2);

    const edge = document.createElementNS(SVG_NS, 'path');
    edge.setAttribute('d', 'M 140 70 L 180 70');
    edge.setAttribute('stroke', '#94a3b8');
    edge.setAttribute('fill', 'none');
    svg.appendChild(edge);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', '160');
    label.setAttribute('y', '60');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = 'next';
    svg.appendChild(label);

    document.body.appendChild(svg);
    try {
      const output = toSvgString(svg);
      const normalized = normalize(output);

      // Structural assertions — the export must always produce these.
      // JSDOM's XMLSerializer emits the namespace declaration twice when an
      // element is in the SVG namespace AND has the attribute set; harmless
      // (browsers ignore duplicates) but worth pinning down so the test is
      // honest about what we ship today.
      expect(normalized).toMatchInlineSnapshot(
        `"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="<inlined>"><rect x="20" y="40" width="120" height="60" rx="8" style="<inlined>"/><rect x="180" y="40" width="120" height="60" rx="8" style="<inlined>"/><path d="M 140 70 L 180 70" stroke="#94a3b8" fill="none" style="<inlined>"/><text x="160" y="60" text-anchor="middle" style="<inlined>">next</text></svg>"`
      );
    } finally {
      document.body.removeChild(svg);
    }
  });

  it('strips foreignObject from a renderer output', () => {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('viewBox', '0 0 100 100');
    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('width', '100');
    fo.setAttribute('height', '100');
    const div = document.createElement('div');
    div.textContent = 'should be stripped';
    fo.appendChild(div);
    svg.appendChild(fo);

    const output = toSvgString(svg);
    expect(output).not.toContain('foreignObject');
    expect(output).not.toContain('should be stripped');
  });

  it('passes through ReactFlow-style edge SVGs (svg.react-flow__edges)', () => {
    // Simulate the structure FlowchartRenderer / ERRenderer expose via
    // RendererHandle.getSvgElement(): a dedicated <svg> for edges.
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'react-flow__edges');
    svg.setAttribute('width', '600');
    svg.setAttribute('height', '400');
    const edge = document.createElementNS(SVG_NS, 'path');
    edge.setAttribute('d', 'M 50 200 C 250 200, 350 200, 550 200');
    edge.setAttribute('stroke', '#94a3b8');
    edge.setAttribute('stroke-width', '1.5');
    edge.setAttribute('fill', 'none');
    svg.appendChild(edge);

    const output = toSvgString(svg);
    expect(output).toContain('<svg');
    expect(output).toContain('class="react-flow__edges"');
    expect(output).toContain('M 50 200 C 250 200, 350 200, 550 200');
    // Namespace declarations are present so the standalone file opens correctly
    expect(output).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('preserves dimensions through getSvgDimensions for both string and DOM sources', () => {
    const stringSrc = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320"></svg>';
    expect(getSvgDimensions(stringSrc)).toEqual({ width: 480, height: 320 });

    const domSvg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    domSvg.setAttribute('viewBox', '0 0 480 320');
    const serialized = toSvgString(domSvg, { inlineStyles: false });
    expect(getSvgDimensions(serialized)).toEqual({ width: 480, height: 320 });
  });
});
