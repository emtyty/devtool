// Hand-built standalone SVG generators for each diagram type.
//
// The export pipeline previously cloned the live ReactFlow / vis-timeline DOM
// into a <foreignObject>. Browsers rasterize that unreliably (security
// constraints when an SVG-as-image references foreign HTML), so PNG export
// produced blank or partial output.
//
// db-schema solved the same problem by drawing the SVG by hand from its IR
// + dagre positions (see components/DbSchemaFlow.tsx#buildSvg). These
// builders apply the same approach to every native renderer:
//   - Pure SVG primitives (rect, line, path, text). No HTML, no foreignObject.
//   - Self-contained: ships with its own font-family and inline colors.
//   - Identical visual style to the on-screen renderer — colors, shapes, and
//     layout positions all match.

import type {
  ArchitectureIR,
  ArchitectureNode,
  C4Element,
  C4ElementKind,
  C4IR,
  ClassDiagramIR,
  ClassMember,
  ClassNode,
  ERDiagramIR,
  EdgeIR,
  FlowchartIR,
  GanttDiagramIR,
  GitGraphIR,
  JourneyIR,
  MindmapIR,
  MindmapNode,
  NodeIR,
  NodeKind,
  PieChartIR,
  QuadrantChartIR,
  StateDiagramIR,
  StateNode,
  TimelineIR,
} from './types';
import dagre from 'dagre';

// ── XML escaping ────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Color palettes (kept in sync with components/diagrams/shared/theme.ts) ─

interface KindColors {
  border: string;
  headerBg: string;
  accent: string;
  bodyBg: string;
  text: string;
}

const LIGHT_KIND: Record<NodeKind, KindColors> = {
  service:  { border: '#86efac', headerBg: '#ecfdf5', accent: '#10b981', bodyBg: '#ffffff', text: '#064e3b' },
  database: { border: '#fcd34d', headerBg: '#fffbeb', accent: '#f59e0b', bodyBg: '#ffffff', text: '#78350f' },
  queue:    { border: '#fda4af', headerBg: '#fff1f2', accent: '#f43f5e', bodyBg: '#ffffff', text: '#881337' },
  storage:  { border: '#67e8f9', headerBg: '#ecfeff', accent: '#06b6d4', bodyBg: '#ffffff', text: '#164e63' },
  user:     { border: '#93c5fd', headerBg: '#eff6ff', accent: '#3b82f6', bodyBg: '#ffffff', text: '#1e3a8a' },
  client:   { border: '#c4b5fd', headerBg: '#f5f3ff', accent: '#8b5cf6', bodyBg: '#ffffff', text: '#4c1d95' },
  external: { border: '#cbd5e1', headerBg: '#f1f5f9', accent: '#64748b', bodyBg: '#ffffff', text: '#334155' },
  process:  { border: '#bfdbfe', headerBg: '#eff6ff', accent: '#60a5fa', bodyBg: '#ffffff', text: '#1e3a8a' },
  decision: { border: '#c4b5fd', headerBg: '#f5f3ff', accent: '#8b5cf6', bodyBg: '#faf5ff', text: '#4c1d95' },
  start:    { border: '#86efac', headerBg: '#ecfdf5', accent: '#10b981', bodyBg: '#ffffff', text: '#064e3b' },
  end:      { border: '#fda4af', headerBg: '#fff1f2', accent: '#f43f5e', bodyBg: '#ffffff', text: '#881337' },
  icon:     { border: '#cbd5e1', headerBg: '#ffffff', accent: '#64748b', bodyBg: '#ffffff', text: '#1e293b' },
  plain:    { border: '#cbd5e1', headerBg: '#f8fafc', accent: '#64748b', bodyBg: '#ffffff', text: '#1e293b' },
};

const DARK_KIND: Record<NodeKind, KindColors> = {
  service:  { border: '#10b981', headerBg: 'rgba(16,185,129,0.12)', accent: '#34d399', bodyBg: '#1e293b', text: '#a7f3d0' },
  database: { border: '#f59e0b', headerBg: 'rgba(245,158,11,0.12)', accent: '#fbbf24', bodyBg: '#1e293b', text: '#fde68a' },
  queue:    { border: '#f43f5e', headerBg: 'rgba(244,63,94,0.12)', accent: '#fb7185', bodyBg: '#1e293b', text: '#fecdd3' },
  storage:  { border: '#06b6d4', headerBg: 'rgba(6,182,212,0.12)', accent: '#22d3ee', bodyBg: '#1e293b', text: '#a5f3fc' },
  user:     { border: '#3b82f6', headerBg: 'rgba(59,130,246,0.12)', accent: '#60a5fa', bodyBg: '#1e293b', text: '#bfdbfe' },
  client:   { border: '#8b5cf6', headerBg: 'rgba(139,92,246,0.12)', accent: '#a78bfa', bodyBg: '#1e293b', text: '#ddd6fe' },
  external: { border: '#64748b', headerBg: 'rgba(100,116,139,0.12)', accent: '#94a3b8', bodyBg: '#1e293b', text: '#cbd5e1' },
  process:  { border: '#60a5fa', headerBg: 'rgba(96,165,250,0.12)', accent: '#93c5fd', bodyBg: '#1e293b', text: '#bfdbfe' },
  decision: { border: '#8b5cf6', headerBg: 'rgba(139,92,246,0.12)', accent: '#a78bfa', bodyBg: '#1e293b', text: '#ddd6fe' },
  start:    { border: '#10b981', headerBg: 'rgba(16,185,129,0.12)', accent: '#34d399', bodyBg: '#1e293b', text: '#a7f3d0' },
  end:      { border: '#f43f5e', headerBg: 'rgba(244,63,94,0.12)', accent: '#fb7185', bodyBg: '#1e293b', text: '#fecdd3' },
  icon:     { border: '#475569', headerBg: '#1e293b', accent: '#94a3b8', bodyBg: '#1e293b', text: '#e2e8f0' },
  plain:    { border: '#475569', headerBg: '#1e293b', accent: '#94a3b8', bodyBg: '#1e293b', text: '#e2e8f0' },
};

interface PaletteCommon {
  canvasBg: string;
  edgeColor: string;
  edgeLabel: string;
  edgeLabelBg: string;
  text: string;
  subtle: string;
  border: string;
}
const LIGHT_COMMON: PaletteCommon = {
  canvasBg: '#ffffff',
  edgeColor: '#94a3b8',
  edgeLabel: '#475569',
  edgeLabelBg: '#ffffff',
  text: '#1e293b',
  subtle: '#64748b',
  border: '#cbd5e1',
};
const DARK_COMMON: PaletteCommon = {
  canvasBg: '#0f172a',
  edgeColor: '#64748b',
  edgeLabel: '#cbd5e1',
  edgeLabelBg: '#1e293b',
  text: '#e2e8f0',
  subtle: '#94a3b8',
  border: '#475569',
};

function palette(dark: boolean) {
  return {
    common: dark ? DARK_COMMON : LIGHT_COMMON,
    byKind: dark ? DARK_KIND : LIGHT_KIND,
  };
}

const FONT_FAMILY = '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO_FAMILY = '"Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace';

// ── Sizing helpers (kept in sync with renderers) ────────────────────────

function flowchartNodeSize(node: NodeIR): { width: number; height: number } {
  if (node.kind === 'user' || node.kind === 'start' || node.kind === 'end') {
    return { width: 84, height: 84 };
  }
  if (node.kind === 'icon') return { width: 100, height: 96 };
  if (node.kind === 'decision') {
    const len = node.label.length;
    return {
      width: Math.max(140, Math.min(280, len * 11 + 60)),
      height: Math.max(96, Math.min(160, Math.ceil(len / 16) * 32 + 64)),
    };
  }
  if (node.kind === 'queue') return { width: 220, height: 64 };
  // rect (default)
  const len = node.label.length;
  const lines = Math.max(1, Math.ceil(len / 24));
  return {
    width: Math.max(160, Math.min(320, len * 8 + 40)),
    height: 48 + (lines - 1) * 18,
  };
}

function stateNodeSize(s: StateNode): { width: number; height: number } {
  if (s.kind === 'start' || s.kind === 'end') return { width: 24, height: 24 };
  const len = (s.label || s.id).length;
  return { width: Math.max(96, len * 9 + 40), height: 44 };
}

// Wrap text to multiple `<tspan>` lines for readability inside boxes.
function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function tspans(lines: string[], x: number, lineHeight: number): string {
  return lines
    .map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escXml(l)}</tspan>`)
    .join('');
}

// ── Edge geometry ───────────────────────────────────────────────────────

interface BBox { x: number; y: number; width: number; height: number; }

function attachPoint(box: BBox, towards: { x: number; y: number }): { x: number; y: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  // Find intersection with the box edge
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const tx = Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

interface BuildOptions {
  dark?: boolean;
  /** Outer canvas padding around the bounding box. Default: 32. */
  padding?: number;
}

// ── Common SVG header / arrow marker ────────────────────────────────────

function arrowDef(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`;
}

function svgOpen(viewX: number, viewY: number, w: number, h: number, bg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewX} ${viewY} ${w} ${h}" width="${w}" height="${h}" font-family='${FONT_FAMILY}'><rect x="${viewX}" y="${viewY}" width="${w}" height="${h}" fill="${bg}"/>`;
}

// ── Flowchart ────────────────────────────────────────────────────────────

export function buildFlowchartSvg(
  ir: FlowchartIR,
  positions: Map<string, { x: number; y: number }>,
  options: BuildOptions = {}
): string {
  const { common, byKind } = palette(options.dark ?? false);
  const padding = options.padding ?? 40;

  const boxes = new Map<string, BBox>();
  for (const node of ir.nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const size = flowchartNodeSize(node);
    boxes.set(node.id, { x: pos.x, y: pos.y, width: size.width, height: size.height });
  }

  if (boxes.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + '</svg>';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  const parts: string[] = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg));
  parts.push(`<defs>${arrowDef('arr', common.edgeColor)}</defs>`);

  // Edges
  for (const e of ir.edges) {
    const a = boxes.get(e.source);
    const b = boxes.get(e.target);
    if (!a || !b) continue;
    parts.push(buildEdgePath(a, b, e, common));
  }

  // Nodes
  for (const node of ir.nodes) {
    const box = boxes.get(node.id);
    if (!box) continue;
    parts.push(buildFlowNode(node, box, byKind[node.kind]));
  }

  parts.push('</svg>');
  return parts.join('');
}

function buildEdgePath(a: BBox, b: BBox, edge: EdgeIR, common: PaletteCommon): string {
  const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const p1 = attachPoint(a, bc);
  const p2 = attachPoint(b, ac);
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  const horizontal = dx > dy;
  const cp = Math.max(30, (horizontal ? dx : dy) * 0.45);
  const c1 = horizontal ? { x: p1.x + Math.sign(p2.x - p1.x) * cp, y: p1.y } : { x: p1.x, y: p1.y + Math.sign(p2.y - p1.y) * cp };
  const c2 = horizontal ? { x: p2.x - Math.sign(p2.x - p1.x) * cp, y: p2.y } : { x: p2.x, y: p2.y - Math.sign(p2.y - p1.y) * cp };

  const dash = edge.kind === 'dashed' ? ' stroke-dasharray="6 4"' : edge.kind === 'dotted' ? ' stroke-dasharray="2 3"' : '';
  const sw = edge.kind === 'thick' ? 2.5 : 1.5;

  const path = `<path d="M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}" stroke="${common.edgeColor}" stroke-width="${sw}" fill="none"${dash} marker-end="url(#arr)"/>`;

  if (!edge.label) return path;
  // Label centered along the curve at t=0.5 (Bezier midpoint)
  const lx = 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x;
  const ly = 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y;
  const text = escXml(edge.label);
  // Approximate label background width
  const w = text.length * 6.5 + 12;
  return (
    path +
    `<rect x="${lx - w / 2}" y="${ly - 9}" width="${w}" height="16" fill="${common.edgeLabelBg}" rx="3"/>` +
    `<text x="${lx}" y="${ly + 3}" text-anchor="middle" font-size="11" font-weight="500" fill="${common.edgeLabel}">${text}</text>`
  );
}

function buildFlowNode(node: NodeIR, box: BBox, c: KindColors): string {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  if (node.kind === 'decision') {
    const left = box.x, right = box.x + box.width, top = box.y, bottom = box.y + box.height;
    const points = `${cx},${top} ${right},${cy} ${cx},${bottom} ${left},${cy}`;
    const lines = wrapText(node.label, 18);
    return (
      `<polygon points="${points}" fill="${c.bodyBg}" stroke="${c.accent}" stroke-width="1.5"/>` +
      `<text x="${cx}" y="${cy - (lines.length - 1) * 7}" text-anchor="middle" font-size="12" font-weight="600" fill="${c.text}">${tspans(lines, cx, 14)}</text>`
    );
  }

  if (node.kind === 'database') {
    // cylinder
    const rx = box.width / 2;
    const ry = 8;
    const top = box.y;
    const bottom = box.y + box.height;
    const path = `M ${box.x} ${top + ry} A ${rx} ${ry} 0 0 0 ${box.x + box.width} ${top + ry} L ${box.x + box.width} ${bottom - ry} A ${rx} ${ry} 0 0 1 ${box.x} ${bottom - ry} Z`;
    const ellipse = `<ellipse cx="${cx}" cy="${top + ry}" rx="${rx}" ry="${ry}" fill="none" stroke="${c.accent}" stroke-width="2"/>`;
    return (
      `<path d="${path}" fill="${c.bodyBg}" stroke="${c.border}" stroke-width="1"/>` +
      ellipse +
      `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="13" font-weight="500" fill="${c.text}">${escXml(node.label)}</text>`
    );
  }

  if (node.kind === 'user' || node.kind === 'start' || node.kind === 'end') {
    const r = Math.min(box.width, box.height) / 2;
    const lines = wrapText(node.label, 12);
    return (
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.bodyBg}" stroke="${c.accent}" stroke-width="2"/>` +
      `<text x="${cx}" y="${cy + 4 - (lines.length - 1) * 7}" text-anchor="middle" font-size="12" font-weight="600" fill="${c.text}">${tspans(lines, cx, 14)}</text>`
    );
  }

  if (node.kind === 'queue') {
    // double-rect (subroutine)
    return (
      `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" fill="${c.bodyBg}" stroke="${c.accent}" stroke-width="1"/>` +
      `<rect x="${box.x + 4}" y="${box.y + 4}" width="${box.width - 8}" height="${box.height - 8}" rx="5" fill="none" stroke="${c.border}" stroke-width="1"/>` +
      `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" font-weight="500" fill="${c.text}">${escXml(node.label)}</text>`
    );
  }

  // Default rect (with left accent stripe)
  const lines = wrapText(node.label, 24);
  return (
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="10" fill="${c.bodyBg}" stroke="${c.border}" stroke-width="1"/>` +
    `<rect x="${box.x}" y="${box.y}" width="4" height="${box.height}" fill="${c.accent}"/>` +
    `<text x="${cx}" y="${cy + 4 - (lines.length - 1) * 8}" text-anchor="middle" font-size="13" font-weight="500" fill="${c.text}">${tspans(lines, cx, 16)}</text>`
  );
}

// ── State diagram ────────────────────────────────────────────────────────

export interface StateBuildPositions {
  /** Top-level nodes: absolute top-left. */
  topLevel: Map<string, { x: number; y: number; width: number; height: number }>;
  /** Children inside composites: position relative to composite top-left. */
  children: Map<string, { x: number; y: number; width: number; height: number; parent: string }>;
}

export function buildStateSvg(
  ir: StateDiagramIR,
  positions: StateBuildPositions,
  options: BuildOptions = {}
): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;

  const boxes = new Map<string, BBox>();
  for (const [id, p] of positions.topLevel) {
    boxes.set(id, p);
  }
  for (const [id, p] of positions.children) {
    const parent = boxes.get(p.parent);
    if (!parent) continue;
    boxes.set(id, { x: parent.x + p.x, y: parent.y + p.y, width: p.width, height: p.height });
  }

  if (boxes.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + '</svg>';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  const parts: string[] = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg));
  parts.push(`<defs>${arrowDef('arr', common.edgeColor)}</defs>`);

  // Composite frames first (so they sit BEHIND children)
  for (const s of ir.states) {
    if (s.kind !== 'composite') continue;
    const box = boxes.get(s.id);
    if (!box) continue;
    parts.push(
      `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="14" fill="${dark ? 'rgba(15,23,42,0.5)' : '#ffffff'}" stroke="${common.border}" stroke-width="1.5"/>` +
      `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="32" rx="14" fill="${dark ? '#1e293b' : '#f1f5f9'}"/>` +
      `<rect x="${box.x}" y="${box.y + 18}" width="${box.width}" height="14" fill="${dark ? '#1e293b' : '#f1f5f9'}"/>` +
      `<line x1="${box.x}" y1="${box.y + 32}" x2="${box.x + box.width}" y2="${box.y + 32}" stroke="${common.border}" stroke-width="1"/>` +
      `<text x="${box.x + box.width / 2}" y="${box.y + 21}" text-anchor="middle" font-size="13" font-weight="600" fill="${common.text}">${escXml(s.label || s.id)}</text>`
    );
  }

  // Edges
  for (const t of ir.transitions) {
    const a = boxes.get(t.source);
    const b = boxes.get(t.target);
    if (!a || !b) continue;
    parts.push(buildEdgePath(a, b, { source: t.source, target: t.target, label: t.label, kind: 'solid' }, common));
  }

  // Non-composite states
  for (const s of ir.states) {
    if (s.kind === 'composite') continue;
    const box = boxes.get(s.id);
    if (!box) continue;
    parts.push(buildStateBox(s, box, common, dark));
  }

  parts.push('</svg>');
  return parts.join('');
}

function buildStateBox(s: StateNode, box: BBox, common: PaletteCommon, dark: boolean): string {
  if (s.kind === 'start' || s.kind === 'end') {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const r = 12;
    const fill = s.kind === 'start' ? (dark ? '#e2e8f0' : '#0f172a') : (dark ? '#0f172a' : '#ffffff');
    const stroke = dark ? '#e2e8f0' : '#0f172a';
    const inner = s.kind === 'end'
      ? `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="${dark ? '#e2e8f0' : '#0f172a'}"/>`
      : '';
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${inner}`;
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return (
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="14" fill="${dark ? '#1e293b' : '#ffffff'}" stroke="${common.border}" stroke-width="1.5"/>` +
    `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(s.label || s.id)}</text>`
  );
}

// ── Class diagram ────────────────────────────────────────────────────────

export function buildClassSvg(
  ir: ClassDiagramIR,
  positions: Map<string, { x: number; y: number; width: number; height: number }>,
  options: BuildOptions = {}
): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;

  if (positions.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + '</svg>';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  const parts: string[] = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg));
  parts.push(`<defs>${arrowDef('arr', common.edgeColor)}</defs>`);

  // Edges
  for (const rel of ir.relations) {
    const a = positions.get(rel.source);
    const b = positions.get(rel.target);
    if (!a || !b) continue;
    const aBox: BBox = { x: a.x, y: a.y, width: a.width, height: a.height };
    const bBox: BBox = { x: b.x, y: b.y, width: b.width, height: b.height };
    const dashed = rel.kind === 'dependency' || rel.kind === 'realization';
    parts.push(buildEdgePath(aBox, bBox, { source: rel.source, target: rel.target, label: rel.label, kind: dashed ? 'dashed' : 'solid' }, common));
  }

  // Class nodes
  for (const cls of ir.classes) {
    const p = positions.get(cls.id);
    if (!p) continue;
    parts.push(buildClassNode(cls, p, common, dark));
  }

  parts.push('</svg>');
  return parts.join('');
}

const VIS_SYMBOL: Record<string, string> = { public: '+', private: '-', protected: '#', package: '~' };

function buildClassNode(cls: ClassNode, p: { x: number; y: number; width: number; height: number }, common: PaletteCommon, dark: boolean): string {
  const headerH = 30;
  const rowH = 18;
  const attrs = cls.members.filter((m) => m.kind === 'attribute');
  const methods = cls.members.filter((m) => m.kind === 'method');

  const parts: string[] = [];
  parts.push(`<g transform="translate(${p.x},${p.y})">`);
  parts.push(`<rect width="${p.width}" height="${p.height}" rx="8" fill="${dark ? '#0f172a' : '#ffffff'}" stroke="${common.border}" stroke-width="1"/>`);
  parts.push(`<rect width="${p.width}" height="${headerH}" rx="8" fill="${dark ? '#1e293b' : '#f1f5f9'}"/>`);
  parts.push(`<rect y="${headerH - 8}" width="${p.width}" height="8" fill="${dark ? '#1e293b' : '#f1f5f9'}"/>`);
  parts.push(`<line x1="0" y1="${headerH}" x2="${p.width}" y2="${headerH}" stroke="${common.border}"/>`);
  parts.push(`<text x="${p.width / 2}" y="${headerH / 2 + 5}" text-anchor="middle" font-size="13" font-weight="600" fill="${common.text}">${escXml(cls.label)}</text>`);

  let y = headerH + 14;
  for (const m of attrs) {
    parts.push(buildClassMember(m, y, p.width, common));
    y += rowH;
  }
  if (attrs.length > 0 && methods.length > 0) {
    parts.push(`<line x1="6" y1="${y - 6}" x2="${p.width - 6}" y2="${y - 6}" stroke="${common.border}" stroke-dasharray="3 2"/>`);
    y += 4;
  }
  for (const m of methods) {
    parts.push(buildClassMember(m, y, p.width, common));
    y += rowH;
  }
  parts.push('</g>');
  return parts.join('');
}

function buildClassMember(m: ClassMember, y: number, width: number, common: PaletteCommon): string {
  const sym = m.visibility ? VIS_SYMBOL[m.visibility] ?? '' : '';
  const sig = m.kind === 'method'
    ? `${m.name}(${m.parameters ?? ''})${m.returnType ? `: ${m.returnType}` : ''}`
    : `${m.name}${m.returnType ? `: ${m.returnType}` : ''}`;
  return (
    `<text x="10" y="${y}" font-family='${MONO_FAMILY}' font-size="11" fill="${common.subtle}">${escXml(sym)}</text>` +
    `<text x="22" y="${y}" font-family='${MONO_FAMILY}' font-size="11" fill="${common.text}">${escXml(sig.length > 32 ? sig.slice(0, 31) + '…' : sig)}</text>`
  );
  void width;
}

// ── ER diagram ───────────────────────────────────────────────────────────
//
// Mirrors components/DbSchemaFlow.tsx#buildSvg, parameterized over a
// position map and the dark flag.

export function buildErSvg(
  ir: ERDiagramIR,
  positions: Map<string, { x: number; y: number; width: number; height: number }>,
  options: BuildOptions = {}
): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  const HEADER_H = 34;
  const ROW_H = 26;

  if (positions.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + '</svg>';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  const parts: string[] = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg));
  parts.push(`<defs>${arrowDef('arr', common.edgeColor)}</defs>`);

  // Edges (column-to-column when possible, else table-to-table)
  for (const rel of ir.schema.relations) {
    const fromTable = ir.schema.tables.find((t) => t.name === rel.fromTable);
    const toTable = ir.schema.tables.find((t) => t.name === rel.toTable);
    if (!fromTable || !toTable) continue;
    const fromPos = positions.get(rel.fromTable);
    const toPos = positions.get(rel.toTable);
    if (!fromPos || !toPos) continue;

    const fromColIdx = fromTable.columns.findIndex((c) => c.name === rel.fromCol);
    const toColIdx = toTable.columns.findIndex((c) => c.name === rel.toCol);
    const fy = fromColIdx >= 0
      ? fromPos.y + HEADER_H + fromColIdx * ROW_H + ROW_H / 2
      : fromPos.y + fromPos.height / 2;
    const ty = toColIdx >= 0
      ? toPos.y + HEADER_H + toColIdx * ROW_H + ROW_H / 2
      : toPos.y + toPos.height / 2;
    const goRight = (toPos.x + toPos.width / 2) > (fromPos.x + fromPos.width / 2);
    const fx = goRight ? fromPos.x + fromPos.width : fromPos.x;
    const tx = goRight ? toPos.x : toPos.x + toPos.width;
    const cp = Math.max(40, Math.abs(tx - fx) * 0.55);
    const c1x = goRight ? fx + cp : fx - cp;
    const c2x = goRight ? tx - cp : tx + cp;
    parts.push(`<path d="M ${fx} ${fy} C ${c1x} ${fy}, ${c2x} ${ty}, ${tx} ${ty}" stroke="${common.edgeColor}" stroke-width="1.4" fill="none" stroke-dasharray="5 4" marker-end="url(#arr)"/>`);
    const lx = (fx + tx) / 2;
    const ly = (fy + ty) / 2 - 5;
    parts.push(`<text x="${lx}" y="${ly}" font-size="9" font-style="italic" fill="${common.subtle}" text-anchor="middle">${escXml(fromColIdx >= 0 ? 'FK' : rel.fromCol)}</text>`);
  }

  // Tables
  for (const table of ir.schema.tables) {
    const p = positions.get(table.name);
    if (!p) continue;
    parts.push(`<g transform="translate(${p.x},${p.y})">`);
    parts.push(`<rect width="${p.width}" height="${p.height}" rx="8" fill="${dark ? '#0f172a' : '#ffffff'}" stroke="${common.border}" stroke-width="1"/>`);
    parts.push(`<rect width="${p.width}" height="${HEADER_H}" rx="8" fill="${dark ? '#1e293b' : '#f8fafc'}"/>`);
    parts.push(`<rect y="${HEADER_H - 8}" width="${p.width}" height="8" fill="${dark ? '#1e293b' : '#f8fafc'}"/>`);
    parts.push(`<line x1="0" y1="${HEADER_H}" x2="${p.width}" y2="${HEADER_H}" stroke="${common.border}"/>`);
    parts.push(`<text x="12" y="${HEADER_H / 2 + 5}" font-family='${MONO_FAMILY}' font-size="12" font-weight="600" fill="${common.text}">${escXml(table.name)}</text>`);
    for (let i = 0; i < table.columns.length; i++) {
      const col = table.columns[i];
      const rowY = HEADER_H + i * ROW_H;
      const textY = rowY + ROW_H / 2 + 3;
      if (i > 0) {
        parts.push(`<line x1="8" y1="${rowY}" x2="${p.width - 8}" y2="${rowY}" stroke="${dark ? '#1e293b' : '#f1f5f9'}"/>`);
      }
      const nameColor = col.isPK ? '#d97706' : col.isFK ? '#0284c7' : (dark ? '#cbd5e1' : '#475569');
      const marker = col.isPK ? '🔑' : col.isFK ? '↗' : '·';
      parts.push(`<text x="14" y="${textY}" font-size="10" fill="${nameColor}">${marker}</text>`);
      parts.push(`<text x="28" y="${textY}" font-family='${MONO_FAMILY}' font-size="11" font-weight="${col.isPK ? '600' : '400'}" fill="${nameColor}">${escXml(col.name)}</text>`);
      parts.push(`<text x="${p.width - 12}" y="${textY}" text-anchor="end" font-family='${MONO_FAMILY}' font-size="10" fill="${common.subtle}">${escXml(col.type)}</text>`);
    }
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('');
}

// ── Mindmap ──────────────────────────────────────────────────────────────

export function buildMindmapSvg(
  ir: MindmapIR,
  positions: Map<string, { x: number; y: number; width: number; height: number; depth: number }>,
  options: BuildOptions = {}
): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 60;

  if (positions.size === 0) return svgOpen(0, 0, 100, 100, common.canvasBg) + '</svg>';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  const parts: string[] = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg));

  // Edges (parent → child)
  const collect = (node: MindmapNode) => {
    const p = positions.get(node.id);
    if (!p) return;
    for (const c of node.children) {
      const cp = positions.get(c.id);
      if (!cp) continue;
      const fx = p.x + p.width / 2;
      const fy = p.y + p.height / 2;
      const tx = cp.x + cp.width / 2;
      const ty = cp.y + cp.height / 2;
      const c1x = fx + (tx - fx) * 0.4;
      const c2x = fx + (tx - fx) * 0.6;
      parts.push(`<path d="M ${fx} ${fy} C ${c1x} ${fy}, ${c2x} ${ty}, ${tx} ${ty}" stroke="${common.edgeColor}" stroke-width="1.5" fill="none"/>`);
      collect(c);
    }
  };
  collect(ir.root);

  const palettes = [
    dark
      ? { bg: '#e2e8f0', border: '#f8fafc', text: '#0f172a' }
      : { bg: '#1e293b', border: '#0f172a', text: '#f8fafc' },
    dark
      ? { bg: 'rgba(59,130,246,0.20)', border: '#60a5fa', text: '#bfdbfe' }
      : { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
    dark
      ? { bg: 'rgba(16,185,129,0.20)', border: '#34d399', text: '#a7f3d0' }
      : { bg: '#dcfce7', border: '#10b981', text: '#064e3b' },
    dark
      ? { bg: 'rgba(245,158,11,0.20)', border: '#fbbf24', text: '#fde68a' }
      : { bg: '#fef3c7', border: '#f59e0b', text: '#78350f' },
    dark
      ? { bg: 'rgba(244,63,94,0.20)', border: '#fb7185', text: '#fecdd3' }
      : { bg: '#fee2e2', border: '#f43f5e', text: '#881337' },
    dark
      ? { bg: 'rgba(139,92,246,0.20)', border: '#a78bfa', text: '#ddd6fe' }
      : { bg: '#ede9fe', border: '#8b5cf6', text: '#4c1d95' },
  ];

  // Nodes
  const renderNode = (node: MindmapNode) => {
    const p = positions.get(node.id);
    if (!p) return;
    const c = palettes[Math.min(p.depth, palettes.length - 1)];
    const isRoot = p.depth === 0;
    const radius = node.shape === 'circle' ? Math.min(p.width, p.height) / 2 : node.shape === 'rounded' ? 999 : node.shape === 'square' ? 4 : 12;
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${radius}" ry="${radius}" fill="${c.bg}" stroke="${c.border}" stroke-width="2"/>`
    );
    parts.push(
      `<text x="${p.x + p.width / 2}" y="${p.y + p.height / 2 + 4}" text-anchor="middle" font-size="${isRoot ? 14 : 12}" font-weight="${isRoot ? 700 : 500}" fill="${c.text}">${escXml(node.label)}</text>`
    );
    for (const child of node.children) renderNode(child);
  };
  renderNode(ir.root);

  parts.push('</svg>');
  return parts.join('');
}

// ── Gantt ────────────────────────────────────────────────────────────────

export function buildGanttSvg(ir: GanttDiagramIR, options: BuildOptions = {}): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 24;
  if (ir.tasks.length === 0) return svgOpen(0, 0, 200, 60, common.canvasBg) + '</svg>';

  const sections = new Map<string, typeof ir.tasks>();
  for (const t of ir.tasks) {
    const s = t.section ?? 'Tasks';
    if (!sections.has(s)) sections.set(s, []);
    sections.get(s)!.push(t);
  }

  const rowH = 30;
  const sectionHeaderH = 24;
  const labelW = 160;
  const chartW = 760;
  const headerH = 36;
  const totalRows = ir.tasks.length;
  const totalSections = sections.size;
  const titleH = ir.title ? 32 : 0;
  const bodyH = headerH + totalSections * sectionHeaderH + totalRows * rowH;
  const width = padding * 2 + labelW + chartW;
  const height = padding * 2 + titleH + bodyH;

  let minTime = Infinity, maxTime = -Infinity;
  for (const t of ir.tasks) {
    minTime = Math.min(minTime, new Date(t.start).getTime());
    maxTime = Math.max(maxTime, new Date(t.end).getTime());
  }
  if (!isFinite(minTime) || !isFinite(maxTime) || maxTime === minTime) maxTime = minTime + 86400000;
  const timeToX = (t: number) => padding + labelW + ((t - minTime) / (maxTime - minTime)) * chartW;

  const colors: Record<string, { fill: string; stroke: string; text: string }> = dark
    ? {
        default: { fill: 'rgba(59,130,246,0.30)', stroke: '#60a5fa', text: '#bfdbfe' },
        active: { fill: 'rgba(245,158,11,0.30)', stroke: '#fbbf24', text: '#fde68a' },
        done: { fill: 'rgba(16,185,129,0.30)', stroke: '#34d399', text: '#a7f3d0' },
        crit: { fill: 'rgba(244,63,94,0.30)', stroke: '#fb7185', text: '#fecdd3' },
        milestone: { fill: 'rgba(139,92,246,0.40)', stroke: '#a78bfa', text: '#ddd6fe' },
      }
    : {
        default: { fill: '#bfdbfe', stroke: '#3b82f6', text: '#1e3a8a' },
        active: { fill: '#fde68a', stroke: '#f59e0b', text: '#78350f' },
        done: { fill: '#a7f3d0', stroke: '#10b981', text: '#064e3b' },
        crit: { fill: '#fecaca', stroke: '#f43f5e', text: '#881337' },
        milestone: { fill: '#ddd6fe', stroke: '#8b5cf6', text: '#4c1d95' },
      };

  const parts: string[] = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  // Time axis (start, mid, end)
  const axisY = padding + titleH + headerH - 4;
  for (const ratio of [0, 0.5, 1]) {
    const x = padding + labelW + ratio * chartW;
    const time = minTime + (maxTime - minTime) * ratio;
    const date = new Date(time);
    const label = `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)}`;
    parts.push(`<text x="${x}" y="${axisY}" text-anchor="middle" font-size="10" fill="${common.subtle}">${escXml(label)}</text>`);
    parts.push(`<line x1="${x}" y1="${axisY + 4}" x2="${x}" y2="${padding + titleH + bodyH}" stroke="${common.border}" stroke-dasharray="2 3"/>`);
  }

  let cy = padding + titleH + headerH;
  for (const [section, tasks] of sections) {
    parts.push(`<rect x="${padding}" y="${cy}" width="${labelW + chartW}" height="${sectionHeaderH}" fill="${dark ? '#1e293b' : '#f8fafc'}"/>`);
    parts.push(`<text x="${padding + 8}" y="${cy + 16}" font-size="11" font-weight="600" fill="${common.text}">${escXml(section)}</text>`);
    cy += sectionHeaderH;
    for (const t of tasks) {
      const x1 = timeToX(new Date(t.start).getTime());
      const x2 = timeToX(new Date(t.end).getTime());
      const c = colors[t.status] ?? colors.default;
      parts.push(`<text x="${padding + 8}" y="${cy + rowH / 2 + 4}" font-size="11" fill="${common.text}">${escXml(t.label)}</text>`);
      if (t.status === 'milestone') {
        const cx = x1;
        const my = cy + rowH / 2;
        parts.push(`<polygon points="${cx},${my - 7} ${cx + 7},${my} ${cx},${my + 7} ${cx - 7},${my}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`);
      } else {
        const w = Math.max(4, x2 - x1);
        parts.push(`<rect x="${x1}" y="${cy + 6}" width="${w}" height="${rowH - 12}" rx="4" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1"/>`);
      }
      cy += rowH;
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

// ── Timeline ─────────────────────────────────────────────────────────────

export function buildTimelineSvg(ir: TimelineIR, options: BuildOptions = {}): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 24;

  if (ir.events.length === 0) return svgOpen(0, 0, 200, 60, common.canvasBg) + '</svg>';

  // Group events by section (preserving order)
  const sectionsMap = new Map<string, typeof ir.events>();
  for (const e of ir.events) {
    const s = e.section ?? '';
    if (!sectionsMap.has(s)) sectionsMap.set(s, []);
    sectionsMap.get(s)!.push(e);
  }

  const titleH = ir.title ? 32 : 0;
  const sectionHeaderH = 28;
  const eventH = 56;
  const rows: { type: 'section' | 'event'; data: string | typeof ir.events[number] }[] = [];
  for (const [section, events] of sectionsMap) {
    if (section) rows.push({ type: 'section', data: section });
    for (const e of events) rows.push({ type: 'event', data: e });
  }

  const lineX = padding + 80;
  const eventBoxX = lineX + 24;
  const eventBoxW = 480;
  const width = padding * 2 + 80 + 24 + eventBoxW;
  let height = padding * 2 + titleH;
  for (const r of rows) height += r.type === 'section' ? sectionHeaderH : eventH;
  height += 20;

  const sectionColors = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4'];

  const parts: string[] = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  // Vertical timeline line
  parts.push(`<line x1="${lineX}" y1="${padding + titleH}" x2="${lineX}" y2="${height - padding}" stroke="${common.border}" stroke-width="2"/>`);

  let cy = padding + titleH + 8;
  let sectionIndex = -1;
  for (const r of rows) {
    if (r.type === 'section') {
      sectionIndex++;
      parts.push(`<text x="${padding}" y="${cy + 16}" font-size="11" font-weight="700" fill="${common.subtle}">${escXml(r.data as string)}</text>`);
      cy += sectionHeaderH;
    } else {
      const e = r.data as (typeof ir.events)[number];
      const color = sectionColors[Math.max(0, sectionIndex) % sectionColors.length];
      // Period dot
      parts.push(`<circle cx="${lineX}" cy="${cy + eventH / 2}" r="6" fill="${color}" stroke="${common.canvasBg}" stroke-width="2"/>`);
      parts.push(`<text x="${lineX - 12}" y="${cy + eventH / 2 + 4}" text-anchor="end" font-size="11" font-weight="600" fill="${common.text}">${escXml(e.period)}</text>`);
      // Event card
      parts.push(`<rect x="${eventBoxX}" y="${cy + 4}" width="${eventBoxW}" height="${eventH - 12}" rx="8" fill="${dark ? 'rgba(30,41,59,0.6)' : '#f8fafc'}" stroke="${color}" stroke-width="1"/>`);
      const lines = wrapText(e.text, 60);
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        parts.push(`<text x="${eventBoxX + 12}" y="${cy + 22 + i * 14}" font-size="11" fill="${common.text}">${escXml(lines[i])}</text>`);
      }
      cy += eventH;
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

// ── Pie chart ────────────────────────────────────────────────────────────

const PIE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
  '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#d946ef',
];

export function buildPieSvg(ir: PieChartIR, options: BuildOptions = {}): string {
  const { common } = palette(options.dark ?? false);
  const padding = options.padding ?? 20;
  const titleH = ir.title ? 32 : 0;
  const legendW = 200;
  const radius = 160;
  const cx = padding + radius + 16;
  const cy = padding + titleH + radius + 16;
  const width = padding * 2 + radius * 2 + 32 + legendW;
  const height = padding * 2 + titleH + radius * 2 + 32;

  const total = ir.slices.reduce((s, sl) => s + sl.value, 0);
  const parts: string[] = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }

  if (total === 0 || ir.slices.length === 0) {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${common.border}"/>`);
    parts.push('</svg>');
    return parts.join('');
  }

  // Slices
  let startAngle = -Math.PI / 2;
  ir.slices.forEach((slice, i) => {
    const fraction = slice.value / total;
    const endAngle = startAngle + fraction * Math.PI * 2;
    const fill = PIE_PALETTE[i % PIE_PALETTE.length];
    if (fraction >= 0.999) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${common.canvasBg}" stroke-width="2"/>`);
    } else {
      const x1 = cx + Math.cos(startAngle) * radius;
      const y1 = cy + Math.sin(startAngle) * radius;
      const x2 = cx + Math.cos(endAngle) * radius;
      const y2 = cy + Math.sin(endAngle) * radius;
      const largeArc = fraction > 0.5 ? 1 : 0;
      parts.push(
        `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${fill}" stroke="${common.canvasBg}" stroke-width="2"/>`
      );
    }
    // In-slice percentage label (only if slice is big enough to fit text)
    if (ir.showData && fraction >= 0.04) {
      const mid = (startAngle + endAngle) / 2;
      const lx = cx + Math.cos(mid) * radius * 0.65;
      const ly = cy + Math.sin(mid) * radius * 0.65;
      parts.push(
        `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#ffffff">${(fraction * 100).toFixed(1)}%</text>`
      );
    }
    startAngle = endAngle;
  });

  // Legend
  const legendX = cx + radius + 24;
  let legendY = padding + titleH + 16;
  ir.slices.forEach((slice, i) => {
    const fill = PIE_PALETTE[i % PIE_PALETTE.length];
    const pct = ((slice.value / total) * 100).toFixed(1);
    parts.push(`<rect x="${legendX}" y="${legendY - 10}" width="14" height="14" rx="2" fill="${fill}"/>`);
    parts.push(`<text x="${legendX + 22}" y="${legendY + 1}" font-size="12" fill="${common.text}">${escXml(slice.label)}</text>`);
    parts.push(`<text x="${legendX + 22}" y="${legendY + 16}" font-size="10" fill="${common.subtle}">${slice.value} · ${pct}%</text>`);
    legendY += 32;
  });

  parts.push('</svg>');
  return parts.join('');
}

// ── Quadrant chart ───────────────────────────────────────────────────────

export function buildQuadrantSvg(ir: QuadrantChartIR, options: BuildOptions = {}): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 60;
  const titleH = ir.title ? 32 : 0;
  const chartW = 700;
  const chartH = 500;
  // Reserve extra horizontal space for the Y-axis endpoint labels (e.g.
  // "High Impact" / "Low Impact"), which extend leftward from the chart's
  // left edge with text-anchor="end".
  const yAxis = ir.yAxisLabel ?? { low: 'Low', high: 'High' };
  const xAxis = ir.xAxisLabel ?? { low: 'Low', high: 'High' };
  const longestYLabel = Math.max(yAxis.low.length, yAxis.high.length);
  const leftPadding = Math.max(padding, longestYLabel * 7 + 24);
  const width = leftPadding + chartW + padding;
  const height = padding * 2 + titleH + chartH;
  const x0 = leftPadding;
  const y0 = padding + titleH;

  const tints = dark
    ? { q1: 'rgba(16,185,129,0.18)', q2: 'rgba(245,158,11,0.18)', q3: 'rgba(244,63,94,0.18)', q4: 'rgba(59,130,246,0.18)' }
    : { q1: '#10b98120', q2: '#f59e0b20', q3: '#ef444420', q4: '#3b82f620' };

  const parts: string[] = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }

  const halfW = chartW / 2;
  const halfH = chartH / 2;
  // Quadrant fills (Q3 bottom-left, Q4 bottom-right, Q2 top-left, Q1 top-right)
  parts.push(`<rect x="${x0}" y="${y0 + halfH}" width="${halfW}" height="${halfH}" fill="${tints.q3}"/>`);
  parts.push(`<rect x="${x0 + halfW}" y="${y0 + halfH}" width="${halfW}" height="${halfH}" fill="${tints.q4}"/>`);
  parts.push(`<rect x="${x0}" y="${y0}" width="${halfW}" height="${halfH}" fill="${tints.q2}"/>`);
  parts.push(`<rect x="${x0 + halfW}" y="${y0}" width="${halfW}" height="${halfH}" fill="${tints.q1}"/>`);

  // Cross axes
  parts.push(`<line x1="${x0}" y1="${y0 + halfH}" x2="${x0 + chartW}" y2="${y0 + halfH}" stroke="${common.border}" stroke-width="1"/>`);
  parts.push(`<line x1="${x0 + halfW}" y1="${y0}" x2="${x0 + halfW}" y2="${y0 + chartH}" stroke="${common.border}" stroke-width="1"/>`);

  // Quadrant labels
  const labels = ir.quadrantLabels ?? {};
  if (labels.q1) parts.push(`<text x="${x0 + halfW + halfW / 2}" y="${y0 + halfH / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(labels.q1)}</text>`);
  if (labels.q2) parts.push(`<text x="${x0 + halfW / 2}" y="${y0 + halfH / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(labels.q2)}</text>`);
  if (labels.q3) parts.push(`<text x="${x0 + halfW / 2}" y="${y0 + halfH + halfH / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(labels.q3)}</text>`);
  if (labels.q4) parts.push(`<text x="${x0 + halfW + halfW / 2}" y="${y0 + halfH + halfH / 2}" text-anchor="middle" font-size="13" font-weight="500" fill="${common.text}">${escXml(labels.q4)}</text>`);

  // Axis endpoint labels (outside the chart). `leftPadding` was sized to
  // fit the widest Y-axis label so they don't get clipped at viewBox edge.
  parts.push(`<text x="${x0}" y="${y0 + chartH + 24}" text-anchor="start" font-size="12" fill="${common.text}">${escXml(xAxis.low)}</text>`);
  parts.push(`<text x="${x0 + chartW}" y="${y0 + chartH + 24}" text-anchor="end" font-size="12" fill="${common.text}">${escXml(xAxis.high)}</text>`);
  parts.push(`<text x="${x0 - 12}" y="${y0 + chartH}" text-anchor="end" font-size="12" fill="${common.text}">${escXml(yAxis.low)}</text>`);
  parts.push(`<text x="${x0 - 12}" y="${y0 + 12}" text-anchor="end" font-size="12" fill="${common.text}">${escXml(yAxis.high)}</text>`);

  // Points
  for (const p of ir.points) {
    const px = x0 + p.x * chartW;
    const py = y0 + (1 - p.y) * chartH; // y is inverted (1 = top)
    parts.push(`<circle cx="${px}" cy="${py}" r="6" fill="#3b82f6" stroke="${common.canvasBg}" stroke-width="2"/>`);
    parts.push(`<text x="${px}" y="${py - 12}" text-anchor="middle" font-size="11" font-weight="500" fill="${common.text}">${escXml(p.label)}</text>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

// ── Journey ──────────────────────────────────────────────────────────────

export function buildJourneySvg(ir: JourneyIR, options: BuildOptions = {}): string {
  const { common } = palette(options.dark ?? false);
  const padding = options.padding ?? 40;
  const titleH = ir.title ? 32 : 0;
  const SECTION_HEADER_H = 32;
  const TASK_H = 36;
  const labelW = 200;
  const chartW = 600;
  const SCORE_MAX = 7;

  const allTasks: { sectionTitle: string; sectionIdx: number; label: string; score: number; actors: string[] }[] = [];
  ir.sections.forEach((s, idx) => {
    s.tasks.forEach((t) => allTasks.push({ sectionTitle: s.title, sectionIdx: idx, label: t.label, score: t.score, actors: t.actors }));
  });

  const totalH = padding * 2 + titleH + ir.sections.length * SECTION_HEADER_H + allTasks.length * TASK_H + 40;
  const width = padding * 2 + labelW + chartW;
  const height = totalH;

  const sectionColors = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4'];

  const parts: string[] = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }

  // Score axis labels at top of chart area
  const chartX = padding + labelW;
  const axisY = padding + titleH + 14;
  for (let s = 1; s <= SCORE_MAX; s++) {
    const x = chartX + ((s - 1) / (SCORE_MAX - 1)) * chartW;
    parts.push(`<text x="${x}" y="${axisY}" text-anchor="middle" font-size="10" fill="${common.subtle}">${s}</text>`);
  }

  let cy = padding + titleH + SECTION_HEADER_H;
  ir.sections.forEach((section, idx) => {
    const color = sectionColors[idx % sectionColors.length];
    parts.push(`<rect x="${padding}" y="${cy - SECTION_HEADER_H + 4}" width="${labelW + chartW}" height="${SECTION_HEADER_H - 4}" fill="${color}20" rx="6"/>`);
    parts.push(`<text x="${padding + 10}" y="${cy - 12}" font-size="12" font-weight="600" fill="${common.text}">${escXml(section.title)}</text>`);

    section.tasks.forEach((task) => {
      // Task label on left
      parts.push(`<text x="${padding + 10}" y="${cy + TASK_H / 2 + 4}" font-size="12" fill="${common.text}">${escXml(task.label)}</text>`);
      // Score dot on the score axis
      const scoreClamped = Math.max(1, Math.min(SCORE_MAX, task.score));
      const dotX = chartX + ((scoreClamped - 1) / (SCORE_MAX - 1)) * chartW;
      const dotY = cy + TASK_H / 2;
      // Connecting line (gray) under the dot
      parts.push(`<line x1="${chartX}" y1="${dotY}" x2="${chartX + chartW}" y2="${dotY}" stroke="${common.border}" stroke-dasharray="2 3"/>`);
      parts.push(`<circle cx="${dotX}" cy="${dotY}" r="8" fill="${color}" stroke="${common.canvasBg}" stroke-width="2"/>`);
      parts.push(`<text x="${dotX}" y="${dotY + 3}" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">${task.score}</text>`);
      // Actors
      if (task.actors.length > 0) {
        const actorsText = task.actors.join(', ');
        parts.push(`<text x="${dotX + 14}" y="${dotY + 4}" font-size="10" fill="${common.subtle}">${escXml(actorsText)}</text>`);
      }
      cy += TASK_H;
    });
    cy += SECTION_HEADER_H;
  });

  parts.push('</svg>');
  return parts.join('');
}

// ── Architecture-beta ────────────────────────────────────────────────────

const ARCH_ICON_TINT: Record<string, { fill: string; border: string }> = {
  aws:        { fill: '#fff5e6', border: '#ff9900' },
  google:     { fill: '#e8f0fe', border: '#4285f4' },
  azure:      { fill: '#e3f2fd', border: '#0078d4' },
  cloudflare: { fill: '#fff4e0', border: '#f48120' },
  docker:     { fill: '#e7f3ff', border: '#2496ed' },
  kubernetes: { fill: '#eaf1ff', border: '#326ce5' },
  redis:      { fill: '#fde7e3', border: '#dc382d' },
  postgresql: { fill: '#e3f2fa', border: '#336791' },
  mongodb:    { fill: '#e8f5e9', border: '#47a248' },
  cloud:      { fill: '#f0f4ff', border: '#6366f1' },
  database:   { fill: '#fff7ed', border: '#f59e0b' },
  disk:       { fill: '#ecfeff', border: '#06b6d4' },
  server:     { fill: '#ecfdf5', border: '#10b981' },
  internet:   { fill: '#eff6ff', border: '#3b82f6' },
};

function archTint(icon: string | undefined, dark: boolean): { fill: string; border: string } {
  if (!icon) return dark ? { fill: '#1e293b', border: '#475569' } : { fill: '#ffffff', border: '#cbd5e1' };
  const key = Object.keys(ARCH_ICON_TINT).find((k) => icon.toLowerCase().includes(k));
  const base = key ? ARCH_ICON_TINT[key] : { fill: '#ffffff', border: '#cbd5e1' };
  if (!dark) return base;
  // Dark mode — use the border color tinted background
  return { fill: `${base.border}25`, border: base.border };
}

export function buildArchitectureSvg(ir: ArchitectureIR, options: BuildOptions = {}): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;

  const SERVICE_W = 130;
  const SERVICE_H = 80;

  // Group children by parent
  const byParent = new Map<string | undefined, ArchitectureNode[]>();
  for (const n of ir.nodes) {
    const k = n.parent;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(n);
  }

  // Layout each group's children with dagre
  const groupBounds = new Map<string, { width: number; height: number; positions: Map<string, { x: number; y: number }> }>();
  for (const node of ir.nodes) {
    if (node.kind !== 'group') continue;
    const children = byParent.get(node.id) ?? [];
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 50, marginx: 16, marginy: 16 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const c of children) {
      g.setNode(c.id, { width: SERVICE_W, height: SERVICE_H });
    }
    // Include only edges where both endpoints are children of this group
    const childIds = new Set(children.map((c) => c.id));
    for (const e of ir.edges) {
      if (childIds.has(e.source) && childIds.has(e.target) && g.hasNode(e.source) && g.hasNode(e.target)) {
        g.setEdge(e.source, e.target);
      }
    }
    if (children.length > 0) dagre.layout(g);

    const positions = new Map<string, { x: number; y: number }>();
    let minLeft = Infinity, minTop = Infinity, maxRight = 0, maxBottom = 0;
    for (const c of children) {
      const { x, y } = g.node(c.id) as { x: number; y: number };
      const left = x - SERVICE_W / 2;
      const top = y - SERVICE_H / 2;
      positions.set(c.id, { x: left, y: top });
      minLeft = Math.min(minLeft, left);
      minTop = Math.min(minTop, top);
      maxRight = Math.max(maxRight, left + SERVICE_W);
      maxBottom = Math.max(maxBottom, top + SERVICE_H);
    }
    const HEADER = 28;
    const PAD = 16;
    const dx = PAD - (isFinite(minLeft) ? minLeft : 0);
    const dy = HEADER + PAD - (isFinite(minTop) ? minTop : 0);
    const offset = new Map<string, { x: number; y: number }>();
    for (const [id, p] of positions) offset.set(id, { x: p.x + dx, y: p.y + dy });
    groupBounds.set(node.id, {
      width: Math.max(220, (isFinite(maxRight - minLeft) ? maxRight - minLeft : 0) + PAD * 2),
      height: Math.max(120, (isFinite(maxBottom - minTop) ? maxBottom - minTop : 0) + HEADER + PAD * 2),
      positions: offset,
    });
  }

  // Outer layout: top-level services + groups
  const topLevel = ir.nodes.filter((n) => !n.parent);
  const outer = new dagre.graphlib.Graph();
  outer.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 80, marginx: 32, marginy: 32 });
  outer.setDefaultEdgeLabel(() => ({}));
  for (const n of topLevel) {
    if (n.kind === 'group') {
      const b = groupBounds.get(n.id)!;
      outer.setNode(n.id, { width: b.width, height: b.height });
    } else {
      outer.setNode(n.id, { width: SERVICE_W, height: SERVICE_H });
    }
  }
  for (const e of ir.edges) {
    // For inter-group / top-level edges
    if (outer.hasNode(e.source) && outer.hasNode(e.target)) outer.setEdge(e.source, e.target);
  }
  dagre.layout(outer);

  const abs = new Map<string, { x: number; y: number; width: number; height: number; kind: 'group' | 'service'; node: ArchitectureNode }>();
  for (const n of topLevel) {
    const { x, y } = outer.node(n.id) as { x: number; y: number };
    const w = n.kind === 'group' ? groupBounds.get(n.id)!.width : SERVICE_W;
    const h = n.kind === 'group' ? groupBounds.get(n.id)!.height : SERVICE_H;
    abs.set(n.id, { x: x - w / 2, y: y - h / 2, width: w, height: h, kind: n.kind, node: n });
  }
  // Children
  for (const n of ir.nodes) {
    if (!n.parent) continue;
    const parentBox = abs.get(n.parent);
    if (!parentBox) continue;
    const pos = groupBounds.get(n.parent)?.positions.get(n.id);
    if (!pos) continue;
    abs.set(n.id, { x: parentBox.x + pos.x, y: parentBox.y + pos.y, width: SERVICE_W, height: SERVICE_H, kind: n.kind, node: n });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of abs.values()) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  const parts: string[] = [];
  parts.push(svgOpen(minX, minY, width, height, common.canvasBg));
  parts.push(`<defs>${arrowDef('arr', common.edgeColor)}</defs>`);

  // Groups first (under children + edges)
  for (const n of ir.nodes) {
    if (n.kind !== 'group') continue;
    const b = abs.get(n.id);
    if (!b) continue;
    const tint = archTint(n.icon, dark);
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="12" fill="${tint.fill}" stroke="${tint.border}" stroke-width="1.5" stroke-dasharray="6 4"/>`
    );
    parts.push(`<text x="${b.x + 14}" y="${b.y + 18}" font-size="12" font-weight="700" fill="${common.text}">${escXml(n.label)}</text>`);
    if (n.icon) {
      parts.push(`<text x="${b.x + b.width - 14}" y="${b.y + 18}" text-anchor="end" font-size="9" fill="${common.subtle}">${escXml(n.icon)}</text>`);
    }
  }

  // Edges
  for (const e of ir.edges) {
    const a = abs.get(e.source);
    const b = abs.get(e.target);
    if (!a || !b) continue;
    parts.push(buildEdgePath(a, b, { source: e.source, target: e.target, label: e.label, kind: 'solid' }, common));
  }

  // Services
  for (const n of ir.nodes) {
    if (n.kind !== 'service') continue;
    const b = abs.get(n.id);
    if (!b) continue;
    const tint = archTint(n.icon, dark);
    parts.push(
      `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="10" fill="${tint.fill}" stroke="${tint.border}" stroke-width="1.5"/>`
    );
    // Icon placeholder badge (top-center)
    parts.push(`<circle cx="${b.x + b.width / 2}" cy="${b.y + 22}" r="14" fill="${tint.border}" opacity="0.85"/>`);
    if (n.icon) {
      const short = n.icon.split(':').pop()!.slice(0, 3).toUpperCase();
      parts.push(`<text x="${b.x + b.width / 2}" y="${b.y + 26}" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">${escXml(short)}</text>`);
    }
    parts.push(`<text x="${b.x + b.width / 2}" y="${b.y + 56}" text-anchor="middle" font-size="12" font-weight="600" fill="${common.text}">${escXml(n.label)}</text>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

// ── C4 model ────────────────────────────────────────────────────────────

interface C4Style {
  fill: string;
  border: string;
  text: string;
  badge: string;
  badgeText: string;
  /** Cylinder / queue shape variant */
  shape: 'rect' | 'person' | 'cylinder' | 'queue' | 'boundary' | 'node';
  dashed?: boolean;
}

function c4StyleFor(kind: C4ElementKind, dark: boolean): C4Style {
  const isExternal = kind.endsWith('-external');
  // Color tiers — Person, System, Container, Component
  const base = kind.startsWith('person')
    ? { fill: dark ? 'rgba(8, 80, 134, 0.4)' : '#08427b', text: '#ffffff' }
    : kind.startsWith('system')
      ? { fill: dark ? 'rgba(17, 102, 187, 0.4)' : '#1168bd', text: '#ffffff' }
      : kind.startsWith('container')
        ? { fill: dark ? 'rgba(67, 130, 245, 0.4)' : '#438dd5', text: '#ffffff' }
        : kind.startsWith('component')
          ? { fill: dark ? 'rgba(133, 187, 245, 0.4)' : '#85bbf0', text: '#0f172a' }
          : { fill: dark ? 'rgba(148, 163, 184, 0.3)' : '#9ca3af', text: '#0f172a' };

  let shape: C4Style['shape'] = 'rect';
  if (kind.startsWith('person')) shape = 'person';
  else if (kind.endsWith('-db')) shape = 'cylinder';
  else if (kind.endsWith('-queue')) shape = 'queue';
  else if (kind.endsWith('boundary')) shape = 'boundary';
  else if (kind === 'node') shape = 'node';

  return {
    fill: isExternal ? (dark ? 'rgba(100, 116, 139, 0.4)' : '#999999') : base.fill,
    border: isExternal ? '#64748b' : '#073b6f',
    text: base.text,
    badge: '#0f172a40',
    badgeText: '#ffffff',
    shape,
    dashed: shape === 'boundary' || shape === 'node',
  };
}

function c4BadgeLabel(kind: C4ElementKind): string {
  if (kind.startsWith('person')) return 'Person';
  if (kind.endsWith('-external')) {
    if (kind.startsWith('system')) return 'External System';
    if (kind.startsWith('container')) return 'External Container';
    if (kind.startsWith('component')) return 'External Component';
  }
  if (kind.endsWith('-db')) return kind.startsWith('system') ? 'System' : kind.startsWith('container') ? 'Container' : 'Component';
  if (kind.endsWith('-queue')) return kind.startsWith('system') ? 'System' : kind.startsWith('container') ? 'Container' : 'Component';
  if (kind === 'system') return 'System';
  if (kind === 'container') return 'Container';
  if (kind === 'component') return 'Component';
  if (kind === 'node') return 'Deployment Node';
  return 'Boundary';
}

export function buildC4Svg(ir: C4IR, options: BuildOptions = {}): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  const titleH = ir.title ? 32 : 0;

  const ELEM_W = 200;
  const ELEM_H = 110;

  const nonBoundary = ir.elements.filter((e) => !c4StyleFor(e.kind, dark).shape.includes('boundary') && c4StyleFor(e.kind, dark).shape !== 'node');
  const boundaries = ir.elements.filter((e) => {
    const s = c4StyleFor(e.kind, dark);
    return s.shape === 'boundary' || s.shape === 'node';
  });

  // Outer dagre layout for all elements
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const el of nonBoundary) g.setNode(el.id, { width: ELEM_W, height: ELEM_H });
  for (const rel of ir.relations) {
    if (g.hasNode(rel.source) && g.hasNode(rel.target)) g.setEdge(rel.source, rel.target);
  }
  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const el of nonBoundary) {
    const { x, y } = g.node(el.id) as { x: number; y: number };
    positions.set(el.id, { x: x - ELEM_W / 2, y: y - ELEM_H / 2, width: ELEM_W, height: ELEM_H });
  }

  // Compute boundary bounding boxes from their children
  for (const b of boundaries) {
    const children = ir.elements.filter((e) => e.parent === b.id);
    const childPositions = children.map((c) => positions.get(c.id)).filter((p): p is { x: number; y: number; width: number; height: number } => !!p);
    if (childPositions.length === 0) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of childPositions) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.width);
      maxY = Math.max(maxY, p.y + p.height);
    }
    positions.set(b.id, { x: minX - 20, y: minY - 28, width: maxX - minX + 40, height: maxY - minY + 48 });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  minX -= padding; minY -= padding - titleH; maxX += padding; maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY) + titleH;
  const viewMinY = minY - titleH;

  const parts: string[] = [];
  parts.push(svgOpen(minX, viewMinY, width, height, common.canvasBg));
  parts.push(`<defs>${arrowDef('arr', common.edgeColor)}</defs>`);
  if (ir.title) {
    parts.push(`<text x="${minX + width / 2}" y="${viewMinY + 22}" text-anchor="middle" font-size="16" font-weight="700" fill="${common.text}">${escXml(ir.title)}</text>`);
  }

  // Boundaries first (under everything else)
  for (const b of boundaries) {
    const p = positions.get(b.id);
    if (!p) continue;
    const style = c4StyleFor(b.kind, dark);
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="8" fill="none" stroke="${style.border}" stroke-width="2" stroke-dasharray="8 4"/>`
    );
    parts.push(`<text x="${p.x + 12}" y="${p.y + 18}" font-size="11" font-weight="700" fill="${common.text}">${escXml(b.label)}</text>`);
    parts.push(`<text x="${p.x + 12}" y="${p.y + 32}" font-size="9" fill="${common.subtle}" font-style="italic">[${escXml(c4BadgeLabel(b.kind))}]</text>`);
  }

  // Relations
  for (const rel of ir.relations) {
    const a = positions.get(rel.source);
    const b = positions.get(rel.target);
    if (!a || !b) continue;
    const labelLine = rel.label ?? '';
    const techLine = rel.technology ? `[${rel.technology}]` : '';
    parts.push(
      buildEdgePath(a, b, { source: rel.source, target: rel.target, label: [labelLine, techLine].filter(Boolean).join(' '), kind: 'solid' }, common)
    );
  }

  // Elements (non-boundaries)
  for (const el of nonBoundary) {
    const p = positions.get(el.id);
    if (!p) continue;
    parts.push(buildC4Element(el, p, dark));
  }

  parts.push('</svg>');
  return parts.join('');
}

function buildC4Element(el: C4Element, p: { x: number; y: number; width: number; height: number }, dark: boolean): string {
  const style = c4StyleFor(el.kind, dark);
  const cx = p.x + p.width / 2;
  const parts: string[] = [];

  if (style.shape === 'person') {
    // Head + body
    const headR = 14;
    parts.push(
      `<rect x="${p.x}" y="${p.y + headR + 8}" width="${p.width}" height="${p.height - headR - 8}" rx="10" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`
    );
    parts.push(`<circle cx="${cx}" cy="${p.y + headR + 4}" r="${headR}" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`);
  } else if (style.shape === 'cylinder') {
    const ry = 8;
    parts.push(
      `<path d="M ${p.x} ${p.y + ry} A ${p.width / 2} ${ry} 0 0 0 ${p.x + p.width} ${p.y + ry} L ${p.x + p.width} ${p.y + p.height - ry} A ${p.width / 2} ${ry} 0 0 1 ${p.x} ${p.y + p.height - ry} Z" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`
    );
    parts.push(`<ellipse cx="${cx}" cy="${p.y + ry}" rx="${p.width / 2}" ry="${ry}" fill="none" stroke="${style.border}" stroke-width="1.5"/>`);
  } else if (style.shape === 'queue') {
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${p.height / 2}" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`
    );
  } else {
    parts.push(
      `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="8" fill="${style.fill}" stroke="${style.border}" stroke-width="1.5"/>`
    );
  }

  // Inner text: badge + label + tech + description
  const badgeY = p.y + (style.shape === 'person' ? 36 : 18);
  parts.push(`<text x="${cx}" y="${badgeY}" text-anchor="middle" font-size="9" font-style="italic" font-weight="600" fill="${style.text}" opacity="0.85">[${escXml(c4BadgeLabel(el.kind))}]</text>`);
  parts.push(`<text x="${cx}" y="${badgeY + 18}" text-anchor="middle" font-size="13" font-weight="700" fill="${style.text}">${escXml(el.label)}</text>`);
  if (el.technology) {
    parts.push(`<text x="${cx}" y="${badgeY + 32}" text-anchor="middle" font-size="10" font-style="italic" fill="${style.text}" opacity="0.85">[${escXml(el.technology)}]</text>`);
  }
  if (el.description) {
    const lines = wrapText(el.description, 28);
    const startY = badgeY + (el.technology ? 48 : 36);
    for (let i = 0; i < Math.min(lines.length, 2); i++) {
      parts.push(`<text x="${cx}" y="${startY + i * 12}" text-anchor="middle" font-size="10" fill="${style.text}" opacity="0.92">${escXml(lines[i])}</text>`);
    }
  }
  return parts.join('');
}

// ── GitGraph ─────────────────────────────────────────────────────────────

interface GitCommit {
  id: string;
  branch: string;
  parents: string[];
  tag?: string;
  type: 'NORMAL' | 'REVERSE' | 'HIGHLIGHT';
  isMerge?: boolean;
}

export function buildGitGraphSvg(ir: GitGraphIR, options: BuildOptions = {}): string {
  const { common } = palette(options.dark ?? false);
  const dark = options.dark ?? false;
  const padding = options.padding ?? 40;
  const titleH = ir.title ? 32 : 0;

  // Walk ops to compute commits + branches.
  const commits: GitCommit[] = [];
  const branchOrder: string[] = ['main'];
  const branchHead = new Map<string, string | null>(); // branch → latest commit id
  branchHead.set('main', null);
  let currentBranch = 'main';
  let counter = 0;

  for (const op of ir.ops) {
    if (op.kind === 'branch') {
      if (!branchOrder.includes(op.name)) branchOrder.push(op.name);
      branchHead.set(op.name, branchHead.get(currentBranch) ?? null);
      currentBranch = op.name;
    } else if (op.kind === 'checkout') {
      currentBranch = op.name;
      if (!branchOrder.includes(op.name)) branchOrder.push(op.name);
      if (!branchHead.has(op.name)) branchHead.set(op.name, null);
    } else if (op.kind === 'commit') {
      const id = op.id ?? `c${++counter}`;
      const parent = branchHead.get(currentBranch);
      const commit: GitCommit = {
        id,
        branch: currentBranch,
        parents: parent ? [parent] : [],
        tag: op.tag,
        type: op.type ?? 'NORMAL',
      };
      commits.push(commit);
      branchHead.set(currentBranch, id);
    } else if (op.kind === 'merge') {
      const id = `merge-${++counter}`;
      const a = branchHead.get(currentBranch);
      const b = branchHead.get(op.from);
      const commit: GitCommit = {
        id,
        branch: currentBranch,
        parents: [a, b].filter((p): p is string => !!p),
        tag: op.tag,
        type: 'NORMAL',
        isMerge: true,
      };
      commits.push(commit);
      branchHead.set(currentBranch, id);
    } else if (op.kind === 'cherry-pick') {
      const id = `cherry-${++counter}`;
      const parent = branchHead.get(currentBranch);
      commits.push({
        id,
        branch: currentBranch,
        parents: parent ? [parent] : [],
        type: 'HIGHLIGHT',
      });
      branchHead.set(currentBranch, id);
    }
  }

  const BRANCH_GAP = 60;
  const COMMIT_GAP = 70;
  const branchIdx = new Map<string, number>(branchOrder.map((b, i) => [b, i]));
  const branchX = (b: string) => padding + 90 + (branchIdx.get(b) ?? 0) * BRANCH_GAP;

  const commitPositions = new Map<string, { x: number; y: number }>();
  commits.forEach((c, i) => {
    commitPositions.set(c.id, { x: branchX(c.branch), y: padding + titleH + 40 + i * COMMIT_GAP });
  });

  const width = padding * 2 + 90 + branchOrder.length * BRANCH_GAP + 200;
  const height = padding * 2 + titleH + 60 + commits.length * COMMIT_GAP;

  const branchColors = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#ec4899'];
  const branchColor = (b: string) => branchColors[(branchIdx.get(b) ?? 0) % branchColors.length];

  const parts: string[] = [];
  parts.push(svgOpen(0, 0, width, height, common.canvasBg));
  if (ir.title) {
    parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="${common.text}">${escXml(ir.title)}</text>`);
  }
  // Branch labels at top
  for (const b of branchOrder) {
    const x = branchX(b);
    const y = padding + titleH + 16;
    parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="11" font-weight="700" fill="${branchColor(b)}">${escXml(b)}</text>`);
    // Branch swim-line
    parts.push(`<line x1="${x}" y1="${y + 8}" x2="${x}" y2="${height - padding}" stroke="${branchColor(b)}" stroke-width="2" opacity="0.3"/>`);
  }

  // Parent connections
  for (const c of commits) {
    const cp = commitPositions.get(c.id);
    if (!cp) continue;
    for (const pid of c.parents) {
      const pp = commitPositions.get(pid);
      if (!pp) continue;
      const sameLane = pp.x === cp.x;
      const stroke = branchColor(c.branch);
      if (sameLane) {
        parts.push(`<line x1="${pp.x}" y1="${pp.y}" x2="${cp.x}" y2="${cp.y}" stroke="${stroke}" stroke-width="2"/>`);
      } else {
        // Curve from parent commit to child
        const midY = (pp.y + cp.y) / 2;
        parts.push(`<path d="M ${pp.x} ${pp.y} C ${pp.x} ${midY}, ${cp.x} ${midY}, ${cp.x} ${cp.y}" stroke="${stroke}" stroke-width="2" fill="none"/>`);
      }
    }
  }

  // Commit nodes
  for (const c of commits) {
    const cp = commitPositions.get(c.id);
    if (!cp) continue;
    const color = branchColor(c.branch);
    const r = 9;
    if (c.type === 'REVERSE') {
      parts.push(`<rect x="${cp.x - r}" y="${cp.y - r}" width="${r * 2}" height="${r * 2}" fill="${dark ? '#0f172a' : '#ffffff'}" stroke="${color}" stroke-width="2"/>`);
    } else if (c.type === 'HIGHLIGHT') {
      parts.push(`<rect x="${cp.x - r}" y="${cp.y - r}" width="${r * 2}" height="${r * 2}" rx="3" fill="${color}" stroke="${color}" stroke-width="2"/>`);
    } else if (c.isMerge) {
      parts.push(`<circle cx="${cp.x}" cy="${cp.y}" r="${r}" fill="${dark ? '#0f172a' : '#ffffff'}" stroke="${color}" stroke-width="2.5"/>`);
      parts.push(`<circle cx="${cp.x}" cy="${cp.y}" r="${r - 4}" fill="${color}"/>`);
    } else {
      parts.push(`<circle cx="${cp.x}" cy="${cp.y}" r="${r}" fill="${color}" stroke="${dark ? '#0f172a' : '#ffffff'}" stroke-width="2"/>`);
    }
    // Commit id label
    const labelX = padding + 90 + branchOrder.length * BRANCH_GAP + 24;
    parts.push(`<text x="${labelX}" y="${cp.y + 4}" font-family='${MONO_FAMILY}' font-size="11" fill="${common.text}">${escXml(c.id)}</text>`);
    if (c.tag) {
      const tagX = labelX + c.id.length * 7 + 12;
      parts.push(`<rect x="${tagX}" y="${cp.y - 8}" width="${c.tag.length * 6.5 + 12}" height="16" rx="3" fill="${color}" opacity="0.85"/>`);
      parts.push(`<text x="${tagX + 6}" y="${cp.y + 4}" font-size="10" font-weight="700" fill="#ffffff">${escXml(c.tag)}</text>`);
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

// ── Helper: parse SVG string into element ───────────────────────────────

/** Parse an SVG string to an SVGSVGElement so it can flow through the
 *  centralized export pipeline (which expects a DOM element). */
export function svgStringToElement(svg: string): SVGSVGElement | null {
  if (typeof window === 'undefined' || !window.DOMParser) return null;
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.tagName !== 'svg') return null;
  // Import into the live document so the element behaves normally.
  const imported = document.importNode(root, true) as unknown as SVGSVGElement;
  return imported;
}
