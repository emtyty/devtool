// Pure SVG builder for the Modern Plan Tree view. Mirrors PlanTreeRenderer's
// left→right tree layout (parent aligned with first child via items-start).
//
// Tooltip content matches OperatorTooltip in PlanTreeRenderer.tsx:
//   - Header: physicalOp + logicalOp (if different) + operator description
//   - Stats: Operator Cost, Executions, Rows-to-be-Read, Ordered, all RelOp
//     attributes from ATTR_ORDER, then any remaining attributes
//   - Sections: Object (blue), Output List, Predicate (yellow)
//
// Z-order: arrows → boxes → (trigger overlays + tooltips). The hover-trigger
// is a transparent rect drawn ON TOP of every box AFTER all boxes/arrows are
// rendered, so when a tooltip activates it draws above everything.
//
// Tooltip strategy:
//   - <title> on each box → browser-native popup, works in every viewer.
//   - CSS :hover overlay → richer panel when opened in a browser, via the
//     adjacent-sibling selector .qp-trigger:hover + .qp-tip.

import type { PlanNode, PlanSummary, RedFlag } from '../types';

// ── Layout constants ────────────────────────────────────────────────────
const BOX_W = 208;
const BOX_H = 100;
const HEADER_H = 36;
const BOX_PAD = 12;
const ICON_SIZE = 20;
const H_GAP = 84;
const V_GAP = 30;
const PAD = 32;
// Plan Summary canvas width — sized to about 90% of a typical 1440-1920 px
// display so the summary feels substantial when the SVG is opened directly
// in a browser. Each column gets ~670 px which lets long SQL / DDL wrap less.
const SUMMARY_W = 1400;
const SUMMARY_GAP = 48; // space between tree and summary block

// ── Tooltip constants — mirrors OperatorTooltip in PlanTreeRenderer.tsx ─
// HTML reference: w=340, font-mono text-[11px], header bg-slate-800, body
// bg-slate-900, slate-700 outer border, slate-800 inner dividers between
// rows and sections.
const TOOLTIP_W = 340;
const TIP_PAD_X = 12;
const WRAP_CHARS_DESC = 60; // sans-serif 10px in 316px content
const WRAP_CHARS_MONO = 48; // monospace 11px in 316px content (break-all)
const HEADER_PAD_Y = 8;
const BODY_PAD_Y = 6;
const TITLE_H = 17;
const SUBLABEL_H = 15;
const DESC_LINE_H = 15;
const STAT_H = 17; // 11px mono + py-0.5 + divider
const SECTION_LABEL_H = 14;
const VALUE_LINE_H = 15;
const SECTION_GAP = 6; // py-1.5 padding above each non-stats section

// ── Operator metadata (kept in sync with PlanTreeRenderer.tsx) ──────────
const ATTR_ORDER = [
  'PhysicalOp',
  'LogicalOp',
  'EstimatedExecutionMode',
  'StorageType',
  'EstimatedTotalSubtreeCost',
  'EstimateIO',
  'EstimateCPU',
  'EstimateRebinds',
  'EstimateRewinds',
  'TableCardinality',
  'EstimateRows',
  'AvgRowSize',
  'Parallel',
  'EstimatedNumberOfExecutionsPerInstance',
  'NodeId',
];

const ATTR_LABELS: Record<string, string> = {
  PhysicalOp: 'Physical Operation',
  LogicalOp: 'Logical Operation',
  EstimatedExecutionMode: 'Estimated Execution Mode',
  StorageType: 'Storage',
  EstimatedTotalSubtreeCost: 'Estimated Subtree Cost',
  EstimateIO: 'Estimated I/O Cost',
  EstimateCPU: 'Estimated CPU Cost',
  EstimateRebinds: 'Est. Rebinds',
  EstimateRewinds: 'Est. Rewinds',
  TableCardinality: 'Table Cardinality',
  EstimateRows: 'Estimated Number of Rows',
  AvgRowSize: 'Estimated Row Size',
  Parallel: 'Parallel',
  EstimatedNumberOfExecutionsPerInstance: 'Executions / Instance',
  NodeId: 'Node ID',
};

const OPERATOR_DESCRIPTIONS: Record<string, string> = {
  'Table Insert': 'Insert input rows into the table specified in Argument field.',
  'Compute Scalar': 'Compute new values from existing values in a row.',
  Sort: 'Sort the input.',
  'Top Sort': 'Sort the input.',
  'Clustered Index Scan': 'Scanning a clustered index, entirely or only a range.',
  'Stream Aggregate': 'Compute summary values for groups of rows in a suitably sorted stream.',
  'Hash Match':
    'Use each row from the top input to build a hash table, and each row from the bottom input to probe into the hash table, outputting all matching rows.',
  Bitmap: 'Bitmap.',
  'Clustered Index Seek': 'Scanning a particular range of rows from a clustered index.',
  'Index Seek': 'Scan a particular range of rows from a nonclustered index.',
  'Adaptive Join': 'Chooses dynamically between hash join and nested loops.',
  'Index Spool':
    'Reformats the data from the input into a temporary index, which is then used for seeking with the supplied seek predicate.',
  'Key Lookup': 'Uses a supplied clustering key to lookup on a table that has a clustered index.',
  'Table Scan': 'Scan rows from a table.',
  'Nested Loops':
    'For each row in the top (outer) input, scan the bottom (inner) input, and output matching rows.',
  Top: 'Select the first few rows based on a sort order.',
  'Index Scan': 'Scan a nonclustered index, entirely or only a range.',
  'Hash Aggregate': 'Compute summary values for groups of rows using hashing.',
  Filter: 'Filter rows from the input based on a predicate.',
  'Merge Join': 'Merge two sorted inputs into a single sorted output.',
  'Gather Streams': 'Combines multiple parallel streams into a single serial stream.',
  'Distribute Streams': 'Splits a serial stream into multiple parallel streams.',
  'Repartition Streams': 'Repartitions rows from multiple streams into multiple streams.',
  'Constant Lookup': 'Returns a single row by constant value — extremely fast.',
  Concatenation: 'Appends multiple result sets (UNION ALL).',
  Spool: 'Materializes intermediate results into a temporary structure.',
};

function camelToLabel(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').trim();
}

function formatAttrValue(key: string, val: string): string {
  const numericKeys = new Set([
    'EstimateRows',
    'EstimatedTotalSubtreeCost',
    'EstimateIO',
    'EstimateCPU',
    'AvgRowSize',
    'TableCardinality',
  ]);
  if (numericKeys.has(key)) {
    const n = parseFloat(val);
    if (!isNaN(n)) return n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  }
  if (val === '1' && key === 'Parallel') return 'True';
  if (val === '0' && key === 'Parallel') return 'False';
  return val;
}

function getOperatorDescription(physicalOp: string, logicalOp: string): string | undefined {
  if (physicalOp === 'Parallelism') {
    return logicalOp === 'Repartition Streams' ? 'Repartition Streams.' : 'An operation involving parallelism.';
  }
  return OPERATOR_DESCRIPTIONS[physicalOp] ?? OPERATOR_DESCRIPTIONS[logicalOp];
}

// ── Box styles ──────────────────────────────────────────────────────────
// Mirrors getOperatorMeta() in PlanTreeRenderer.tsx — header bg + border
// per operator type, plus a lucide icon. Header text is always slate-700;
// the colored signal comes from the icon (matches React rendering exactly).
interface OpStyle {
  border: string;
  headerBg: string;
  iconStroke: string;
  iconName: keyof typeof ICONS;
}

// Lucide icon path-fragment data (extracted from lucide-react v0.576).
// All icons use viewBox 0 0 24 24, fill=none, stroke=currentColor (set per use),
// stroke-width=2, stroke-linecap=round, stroke-linejoin=round.
const ICONS = {
  table:
    '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
  key:
    '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  scanLine:
    '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  hash:
    '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  refreshCcw:
    '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  gitMerge:
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  arrowUpDown:
    '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  filter:
    '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
  barChart3:
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  gitFork:
    '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/>',
  calculator:
    '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  chevronsUp: '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
  box:
    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  alertTriangle:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
} as const;

const OP_STYLES: Record<string, OpStyle> = {
  'Table Scan': { border: '#fca5a5', headerBg: '#fef2f2', iconStroke: '#ef4444', iconName: 'table' },
  'Clustered Index Scan': { border: '#fca5a5', headerBg: '#fef2f2', iconStroke: '#ef4444', iconName: 'table' },
  'Key Lookup': { border: '#fdba74', headerBg: '#fff7ed', iconStroke: '#f97316', iconName: 'key' },
  'Index Scan': { border: '#fdba74', headerBg: '#fff7ed', iconStroke: '#f97316', iconName: 'scanLine' },
  'Bitmap Heap Scan': { border: '#fdba74', headerBg: '#fff7ed', iconStroke: '#f97316', iconName: 'scanLine' },
  'Bitmap Index Scan': { border: '#fdba74', headerBg: '#fff7ed', iconStroke: '#f97316', iconName: 'scanLine' },
  'Index Seek': { border: '#86efac', headerBg: '#f0fdf4', iconStroke: '#10b981', iconName: 'search' },
  'Clustered Index Seek': { border: '#86efac', headerBg: '#f0fdf4', iconStroke: '#10b981', iconName: 'search' },
  'Constant Lookup': { border: '#86efac', headerBg: '#f0fdf4', iconStroke: '#10b981', iconName: 'search' },
  'Hash Match': { border: '#93c5fd', headerBg: '#eff6ff', iconStroke: '#3b82f6', iconName: 'hash' },
  Hash: { border: '#93c5fd', headerBg: '#eff6ff', iconStroke: '#3b82f6', iconName: 'hash' },
  'Nested Loops': { border: '#93c5fd', headerBg: '#eff6ff', iconStroke: '#3b82f6', iconName: 'refreshCcw' },
  'Nested Loop': { border: '#93c5fd', headerBg: '#eff6ff', iconStroke: '#3b82f6', iconName: 'refreshCcw' },
  'Merge Join': { border: '#93c5fd', headerBg: '#eff6ff', iconStroke: '#3b82f6', iconName: 'gitMerge' },
  Sort: { border: '#c4b5fd', headerBg: '#f5f3ff', iconStroke: '#8b5cf6', iconName: 'arrowUpDown' },
  'Top Sort': { border: '#c4b5fd', headerBg: '#f5f3ff', iconStroke: '#8b5cf6', iconName: 'arrowUpDown' },
  Filter: { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'filter' },
  'Stream Aggregate': { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'barChart3' },
  'Hash Aggregate': { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'barChart3' },
  Parallelism: { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'gitFork' },
  'Gather Streams': { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'gitFork' },
  'Repartition Streams': { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'gitFork' },
  'Distribute Streams': { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'gitFork' },
  Concatenation: { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'gitFork' },
  'Compute Scalar': { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'calculator' },
  Top: { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'chevronsUp' },
  Spool: { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'box' },
  Materialize: { border: '#cbd5e1', headerBg: '#f8fafc', iconStroke: '#64748b', iconName: 'box' },
};

const DEFAULT_STYLE: OpStyle = {
  border: '#e2e8f0',
  headerBg: '#f8fafc',
  iconStroke: '#94a3b8',
  iconName: 'box',
};

function renderIcon(iconName: keyof typeof ICONS, x: number, y: number, size: number, stroke: string): string {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[iconName]}</svg>`;
}

const FLAG_RING: Record<'high' | 'medium' | 'low', { color: string; width: number; pad: number }> = {
  high: { color: '#f87171', width: 3, pad: 4 },
  medium: { color: '#fb923c', width: 2, pad: 3 },
  low: { color: '#94a3b8', width: 1, pad: 2 },
};

// ── Helpers ─────────────────────────────────────────────────────────────
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function costBarColor(pct: number): string {
  if (pct > 20) return '#f87171';
  if (pct > 10) return '#fbbf24';
  return '#60a5fa';
}

function rowsToThickness(rows: number): number {
  return Math.max(2, Math.min(Math.floor(Math.log(rows > 0 ? rows : 1)), 12));
}

function arrowPolygon(x1: number, y1: number, x2: number, y2: number, thickness: number): string {
  const w2 = thickness / 2;
  const bendX = (x1 + x2) / 2;
  const fy2 = Math.abs(y2 - y1) < 5 ? y1 : y2;
  const tipAbove = y1 <= fy2;

  const pts: [number, number][] = [
    [x1, y1],
    [x1 + w2 + 2, y1 - (w2 + 2)],
    [x1 + w2 + 2, y1 - w2],
    [bendX + (tipAbove ? w2 : -w2), y1 - w2],
    [bendX + (tipAbove ? w2 : -w2), fy2 - w2],
    [x2, fy2 - w2],
    [x2, fy2 + w2],
    [bendX + (tipAbove ? -w2 : w2), fy2 + w2],
    [bendX + (tipAbove ? -w2 : w2), y1 + w2],
    [x1 + w2 + 2, y1 + w2],
    [x1 + w2 + 2, y1 + (w2 + 2)],
    [x1, y1],
  ];

  return pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
}

// Word-wrap by spaces (used for descriptions which have natural breaks).
function wrapWords(text: string, maxChars: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (let word of words) {
    while (word.length > maxChars) {
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Break-all wrapping (matches CSS word-break: break-all on the React side).
// Used for monospace identifier-like content where long unbreakable tokens
// must wrap mid-character.
function wrapBreakAll(text: string, maxChars: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    lines.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
  }
  if (remaining) lines.push(remaining);
  return lines;
}

// ── Tree layout ─────────────────────────────────────────────────────────
interface Layout {
  node: PlanNode;
  x: number;
  y: number;
  children: Layout[];
}

function getSubtreeHeight(node: PlanNode): number {
  if (node.children.length === 0) return BOX_H;
  const total = node.children.reduce(
    (acc, c, i) => acc + getSubtreeHeight(c) + (i > 0 ? V_GAP : 0),
    0
  );
  return Math.max(BOX_H, total);
}

function positionTree(node: PlanNode, x: number, yTop: number): Layout {
  const children: Layout[] = [];
  let cursor = yTop;
  for (const child of node.children) {
    children.push(positionTree(child, x + BOX_W + H_GAP, cursor));
    cursor += getSubtreeHeight(child) + V_GAP;
  }
  return { node, x, y: yTop, children };
}

function flatten(layout: Layout): Layout[] {
  const out: Layout[] = [layout];
  for (const c of layout.children) out.push(...flatten(c));
  return out;
}

// ── Tooltip model — structured to mirror OperatorTooltip's HTML layout ──
// The HTML version has 3 distinct vertical regions, each with its own
// padding and a slate-800 separator above the body sections:
//   1. Header band (slate-800 bg)        — title, sublabel, description
//   2. Stats body (slate-900 bg)         — divided rows of label/value
//   3. Sections (Object / Output / Predicate, separated by slate-800 line)

interface TipStat {
  label: string;
  value: string;
}

interface TipModel {
  title: string;
  sublabel?: string;
  descLines: string[];
  stats: TipStat[];
  objectLines: string[];
  outputLines: string[];
  predicateLines: string[];
}

function buildTipModel(node: PlanNode): TipModel {
  const op = node.physicalOp || node.logicalOp;
  const sublabel =
    node.logicalOp && node.logicalOp !== node.physicalOp ? node.logicalOp : undefined;
  const desc = getOperatorDescription(node.physicalOp, node.logicalOp);
  const descLines = desc ? wrapWords(desc, WRAP_CHARS_DESC) : [];

  const stats: TipStat[] = [
    {
      label: 'Estimated Operator Cost',
      value: `${node.selfCost.toFixed(6)} (${node.selfCostPercent.toFixed(1)}%)`,
    },
    { label: 'Estimated Number of Executions', value: node.estimateExecutions.toLocaleString() },
  ];
  if (node.estimatedRowsRead !== undefined) {
    stats.push({
      label: 'Estimated Number of Rows to be Read',
      value: node.estimatedRowsRead.toLocaleString(),
    });
  }
  if (node.ordered !== undefined) {
    stats.push({ label: 'Ordered', value: node.ordered ? 'True' : 'False' });
  }
  const HEADER_SKIP = new Set(['PhysicalOp', 'LogicalOp']);
  const orderedKeys = ATTR_ORDER.filter((k) => k in node.attributes && !HEADER_SKIP.has(k));
  const remainingKeys = Object.keys(node.attributes)
    .filter((k) => !ATTR_ORDER.includes(k) && !HEADER_SKIP.has(k))
    .sort();
  for (const k of [...orderedKeys, ...remainingKeys]) {
    stats.push({
      label: ATTR_LABELS[k] ?? camelToLabel(k),
      value: formatAttrValue(k, node.attributes[k]),
    });
  }

  const objectLines = node.objectFull ? wrapBreakAll(node.objectFull, WRAP_CHARS_MONO) : [];
  const outputLines: string[] = [];
  if (node.outputList) {
    for (const item of node.outputList) outputLines.push(...wrapBreakAll(item, WRAP_CHARS_MONO));
  }
  const predicateLines = node.predicate ? wrapBreakAll(node.predicate, WRAP_CHARS_MONO) : [];

  return {
    title: op,
    sublabel,
    descLines,
    stats,
    objectLines,
    outputLines,
    predicateLines,
  };
}

interface TipLayout {
  totalH: number;
  headerH: number; // height of header band (slate-800)
  statsTop: number; // y where stats body starts
  statsH: number; // height of stats body
  sections: { kind: 'object' | 'output' | 'predicate'; top: number; height: number }[];
}

function layoutTip(m: TipModel): TipLayout {
  // Header
  let headerH = HEADER_PAD_Y;
  headerH += TITLE_H;
  if (m.sublabel) headerH += SUBLABEL_H;
  if (m.descLines.length > 0) headerH += 4 + m.descLines.length * DESC_LINE_H;
  headerH += HEADER_PAD_Y;

  // Stats body
  const statsTop = headerH;
  let statsH = BODY_PAD_Y;
  for (const _ of m.stats) statsH += STAT_H;
  statsH += BODY_PAD_Y;

  // Optional sections (each preceded by a slate-800 divider line)
  const sections: TipLayout['sections'] = [];
  let cursor = statsTop + statsH;
  if (m.objectLines.length > 0) {
    const h =
      SECTION_GAP + SECTION_LABEL_H + 2 + m.objectLines.length * VALUE_LINE_H + SECTION_GAP;
    sections.push({ kind: 'object', top: cursor, height: h });
    cursor += h;
  }
  if (m.outputLines.length > 0) {
    const h =
      SECTION_GAP + SECTION_LABEL_H + 2 + m.outputLines.length * VALUE_LINE_H + SECTION_GAP;
    sections.push({ kind: 'output', top: cursor, height: h });
    cursor += h;
  }
  if (m.predicateLines.length > 0) {
    const h =
      SECTION_GAP + SECTION_LABEL_H + 2 + m.predicateLines.length * VALUE_LINE_H + SECTION_GAP;
    sections.push({ kind: 'predicate', top: cursor, height: h });
    cursor += h;
  }

  return { totalH: cursor, headerH, statsTop, statsH, sections };
}

function renderTip(m: TipModel, layout: TipLayout): string[] {
  const parts: string[] = [];
  const W = TOOLTIP_W;
  const innerR = W - TIP_PAD_X;

  // ── Header band (slate-800, rounded top corners only) ─────────────────
  parts.push(
    `<path class="qp-tip-header" d="M 0 12 Q 0 0 12 0 L ${W - 12} 0 Q ${W} 0 ${W} 12 L ${W} ${layout.headerH} L 0 ${layout.headerH} Z"/>`
  );
  // Header bottom border (slate-700)
  parts.push(
    `<line class="qp-tip-header-border" x1="0" y1="${layout.headerH}" x2="${W}" y2="${layout.headerH}"/>`
  );

  let y = HEADER_PAD_Y + 12; // baseline for first line
  parts.push(`<text class="qp-tip-title" x="${TIP_PAD_X}" y="${y}">${escXml(m.title)}</text>`);
  y += TITLE_H - 12;
  if (m.sublabel) {
    parts.push(
      `<text class="qp-tip-sublabel" x="${TIP_PAD_X}" y="${y + 11}">${escXml(m.sublabel)}</text>`
    );
    y += SUBLABEL_H;
  }
  if (m.descLines.length > 0) {
    y += 4;
    for (const line of m.descLines) {
      parts.push(
        `<text class="qp-tip-desc" x="${TIP_PAD_X}" y="${y + 10}">${escXml(line)}</text>`
      );
      y += DESC_LINE_H;
    }
  }

  // ── Stats body (divided rows, slate-800 separators) ──────────────────
  let rowY = layout.statsTop + BODY_PAD_Y;
  for (let i = 0; i < m.stats.length; i++) {
    const s = m.stats[i];
    if (i > 0) {
      // divide-y slate-800 line above each row except the first
      parts.push(
        `<line class="qp-tip-row-divider" x1="${TIP_PAD_X}" y1="${rowY}" x2="${innerR}" y2="${rowY}"/>`
      );
    }
    parts.push(
      `<text class="qp-tip-row-label" x="${TIP_PAD_X}" y="${rowY + 12}">${escXml(s.label)}</text>`
    );
    parts.push(
      `<text class="qp-tip-row-value" x="${innerR}" y="${rowY + 12}" text-anchor="end">${escXml(s.value)}</text>`
    );
    rowY += STAT_H;
  }

  // ── Optional sections (Object / Output / Predicate) ──────────────────
  for (const section of layout.sections) {
    // Section divider (slate-800) above
    parts.push(
      `<line class="qp-tip-section-border" x1="0" y1="${section.top}" x2="${W}" y2="${section.top}"/>`
    );
    let sy = section.top + SECTION_GAP;
    const labelText =
      section.kind === 'object' ? 'OBJECT' : section.kind === 'output' ? 'OUTPUT LIST' : 'PREDICATE';
    parts.push(
      `<text class="qp-tip-section" x="${TIP_PAD_X}" y="${sy + 10}">${labelText}</text>`
    );
    sy += SECTION_LABEL_H + 2;
    const lines =
      section.kind === 'object'
        ? m.objectLines
        : section.kind === 'output'
          ? m.outputLines
          : m.predicateLines;
    const cls =
      section.kind === 'object'
        ? 'qp-tip-object'
        : section.kind === 'output'
          ? 'qp-tip-output'
          : 'qp-tip-predicate';
    for (const line of lines) {
      parts.push(`<text class="${cls}" x="${TIP_PAD_X}" y="${sy + 11}">${escXml(line)}</text>`);
      sy += VALUE_LINE_H;
    }
  }

  return parts;
}

interface TipPlacement {
  x: number;
  y: number;
  height: number;
  model: TipModel;
  layout: TipLayout;
}

// ── Plan Summary block — mirrors PlanSummaryPanel from QueryPlanViewer ──
// Layout: 2-column grid below a "Plan Summary" title.
//   LEFT  → Execution Order (table of execution path nodes)
//   RIGHT → Issues, Missing Indexes, Operations, Statement, Key Metrics
const SUMMARY_PAD_X = 24;
const SUMMARY_PAD_Y = 24;
const SUMMARY_COL_GAP = 24;
const SUMMARY_INTRA_GAP = 22; // vertical gap between sections in a column

const SEVERITY_BADGE: Record<'high' | 'medium' | 'low', { bg: string; fg: string }> = {
  high: { bg: '#fee2e2', fg: '#b91c1c' }, // bg-red-100 text-red-700
  medium: { bg: '#ffedd5', fg: '#c2410c' }, // bg-orange-100 text-orange-700
  low: { bg: '#f1f5f9', fg: '#64748b' }, // bg-slate-100 text-slate-500
};

interface Block {
  parts: string[];
  height: number;
}

// Helper: render a section header (with optional alert icon and count) at y=0.
// Returns parts and the height consumed (default 24).
function sectionHeader(label: string, opts: { count?: number; alertColor?: string; titleColor?: string } = {}): Block {
  const parts: string[] = [];
  let textX = 0;
  if (opts.alertColor) {
    parts.push(renderIcon('alertTriangle', 0, -1, 14, opts.alertColor));
    textX = 20;
  }
  const text = opts.count !== undefined ? `${label} (${opts.count})` : label;
  const fill = opts.titleColor ?? '#64748b';
  parts.push(
    `<text x="${textX}" y="11" font-size="11" font-weight="700" letter-spacing="0.08em" fill="${fill}">${escXml(text.toUpperCase())}</text>`
  );
  return { parts, height: 24 };
}

// ── Execution Order table (left column) ───────────────────────────────
function buildExecutionPath(nodes: PlanNode[], width: number): Block {
  if (nodes.length === 0) return { parts: [], height: 0 };
  const parts: string[] = [];
  let y = 0;

  // Header
  parts.push(
    `<text x="0" y="${y + 11}" font-size="12" font-weight="500" fill="#64748b">Execution Order</text>`
  );
  parts.push(
    `<text x="115" y="${y + 11}" font-size="10" fill="#94a3b8">leaves first (right → left)</text>`
  );
  y += 22;

  // Card with rows
  const rowH = 30;
  const cardH = nodes.length * rowH;
  const cardY = y;
  parts.push(
    `<rect x="0" y="${cardY}" width="${width}" height="${cardH}" rx="8" ry="8" fill="#ffffff" stroke="#e2e8f0"/>`
  );

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const op = node.physicalOp || node.logicalOp;
    const rowY = cardY + i * rowH;

    // Row divider above each row except the first
    if (i > 0) {
      parts.push(
        `<line x1="0" y1="${rowY}" x2="${width}" y2="${rowY}" stroke="#f1f5f9" stroke-width="1"/>`
      );
    }

    // 01, 02, ...
    const idxText = String(i + 1).padStart(2, '0');
    parts.push(
      `<text x="14" y="${rowY + rowH / 2 + 4}" font-size="10" fill="#94a3b8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${idxText}</text>`
    );

    // Operator badge — colored per operator type
    const style = OP_STYLES[op] ?? DEFAULT_STYLE;
    const badgeText = truncate(op, 18);
    const badgeW = badgeText.length * 6.6 + 14;
    const badgeX = 38;
    const badgeY = rowY + (rowH - 18) / 2;
    parts.push(
      `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="18" rx="4" ry="4" fill="${style.headerBg}" stroke="${style.border}"/>`
    );
    parts.push(
      `<text x="${badgeX + badgeW / 2}" y="${badgeY + 12}" font-size="10" font-weight="600" fill="#334155" text-anchor="middle">${escXml(badgeText)}</text>`
    );

    // Object name (truncated to fit)
    const objX = badgeX + badgeW + 8;
    const costColW = 76;
    const objMaxW = width - objX - costColW - 12;
    if (node.objectName) {
      const maxChars = Math.max(4, Math.floor(objMaxW / 7));
      parts.push(
        `<text x="${objX}" y="${rowY + rowH / 2 + 4}" font-size="10" fill="#64748b" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escXml(truncate(node.objectName, maxChars))}</text>`
      );
    }

    // Cost bar + percent (right-aligned)
    const barW = 50;
    const barX = width - 12 - 36 - 6 - barW;
    const barY = rowY + rowH / 2 - 3;
    const fillW = Math.min(100, node.selfCostPercent) / 100 * barW;
    const barColor = node.selfCostPercent > 20 ? '#f87171' : node.selfCostPercent > 10 ? '#fbbf24' : '#93c5fd';
    parts.push(
      `<rect x="${barX}" y="${barY}" width="${barW}" height="6" rx="3" ry="3" fill="#e2e8f0"/>`
    );
    parts.push(
      `<rect x="${barX}" y="${barY}" width="${fillW.toFixed(1)}" height="6" rx="3" ry="3" fill="${barColor}"/>`
    );
    parts.push(
      `<text x="${width - 12}" y="${rowY + rowH / 2 + 4}" font-size="10" font-weight="600" fill="#475569" text-anchor="end">${node.selfCostPercent.toFixed(1)}%</text>`
    );
  }

  y = cardY + cardH;
  return { parts, height: y };
}

// ── Issues ────────────────────────────────────────────────────────────
function buildIssues(redFlags: RedFlag[], width: number): Block {
  if (redFlags.length === 0) return { parts: [], height: 0 };
  const parts: string[] = [];
  const wrapText = Math.max(20, Math.floor((width - 110) / 6.5));

  // Header
  const hdr = sectionHeader('Issues', { count: redFlags.length, alertColor: '#ef4444' });
  parts.push(...hdr.parts);
  let y = hdr.height;

  // Pre-compute heights
  const items = redFlags.map((f) => {
    const descLines = wrapWords(f.description, wrapText);
    const height = Math.max(48, 12 + 18 + descLines.length * 15 + 12);
    return { f, descLines, height };
  });
  const cardH = items.reduce((acc, it) => acc + it.height, 0);
  parts.push(
    `<rect x="0" y="${y}" width="${width}" height="${cardH}" rx="8" ry="8" fill="#ffffff" stroke="#e2e8f0"/>`
  );

  let itemY = y;
  for (let i = 0; i < items.length; i++) {
    const { f, descLines, height } = items[i];
    if (i > 0) {
      parts.push(
        `<line x1="12" y1="${itemY}" x2="${width - 12}" y2="${itemY}" stroke="#f1f5f9" stroke-width="1"/>`
      );
    }
    const sev = SEVERITY_BADGE[f.severity];
    const badgeText = f.severity.toUpperCase();
    const badgeW = badgeText.length * 6.5 + 10;
    const badgeX = 12;
    const badgeY = itemY + 12;
    parts.push(
      `<rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="16" rx="3" ry="3" fill="${sev.bg}"/>`
    );
    parts.push(
      `<text x="${badgeX + badgeW / 2}" y="${badgeY + 11}" font-size="9" font-weight="700" fill="${sev.fg}" text-anchor="middle" letter-spacing="0.05em">${escXml(badgeText)}</text>`
    );

    // Type label
    const tx = badgeX + badgeW + 10;
    parts.push(
      `<text x="${tx}" y="${itemY + 24}" font-size="12" font-weight="600" fill="#334155">${escXml(f.type)}</text>`
    );

    // Description
    let dy = itemY + 42;
    for (const dl of descLines) {
      parts.push(
        `<text x="${tx}" y="${dy}" font-size="11" fill="#64748b">${escXml(dl)}</text>`
      );
      dy += 15;
    }

    // Node ID (right-aligned)
    if (f.nodeId) {
      parts.push(
        `<text x="${width - 12}" y="${itemY + 24}" font-size="10" fill="#94a3b8" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">#${escXml(f.nodeId)}</text>`
      );
    }
    itemY += height;
  }

  return { parts, height: y + cardH };
}

// ── Missing Indexes ───────────────────────────────────────────────────
function buildIndexes(missingIndexes: string[], width: number): Block {
  if (missingIndexes.length === 0) return { parts: [], height: 0 };
  const parts: string[] = [];
  const wrapMono = Math.max(20, Math.floor((width - 24) / 7));

  const hdr = sectionHeader('Missing Indexes', { count: missingIndexes.length, alertColor: '#f59e0b', titleColor: '#d97706' });
  parts.push(...hdr.parts);
  let y = hdr.height;

  for (let i = 0; i < missingIndexes.length; i++) {
    const lines = wrapBreakAll(missingIndexes[i], wrapMono);
    const blockH = 12 + lines.length * 16 + 12;
    parts.push(
      `<rect x="0" y="${y}" width="${width}" height="${blockH}" rx="6" ry="6" fill="#fffbeb" stroke="#fde68a"/>`
    );
    let ty = y + 12;
    for (const ln of lines) {
      parts.push(
        `<text x="12" y="${ty + 11}" font-size="11" fill="#78350f" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escXml(ln)}</text>`
      );
      ty += 16;
    }
    y += blockH + 8;
  }
  return { parts, height: y - 8 };
}

// ── Operations ────────────────────────────────────────────────────────
function buildOperations(operations: { name: string; count: number }[], width: number): Block {
  if (operations.length === 0) return { parts: [], height: 0 };
  const parts: string[] = [];

  const hdr = sectionHeader('Operations');
  parts.push(...hdr.parts);
  let y = hdr.height;

  const rowH = 22;
  const cardH = 12 + operations.length * rowH + 12;
  parts.push(
    `<rect x="0" y="${y}" width="${width}" height="${cardH}" rx="6" ry="6" fill="#f8fafc" stroke="#e2e8f0"/>`
  );
  let opY = y + 12;
  for (const op of operations) {
    parts.push(
      `<text x="14" y="${opY + 14}" font-size="12" fill="#475569">${escXml(op.name)}</text>`
    );
    const countText = String(op.count);
    const badgeW = Math.max(28, countText.length * 8 + 12);
    const badgeX = width - 14 - badgeW;
    parts.push(
      `<rect x="${badgeX}" y="${opY + 3}" width="${badgeW}" height="18" rx="3" ry="3" fill="#ffffff" stroke="#e2e8f0"/>`
    );
    parts.push(
      `<text x="${badgeX + badgeW / 2}" y="${opY + 16}" font-size="11" font-weight="600" fill="#475569" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escXml(countText)}</text>`
    );
    opY += rowH;
  }
  return { parts, height: y + cardH };
}

// ── Statement ─────────────────────────────────────────────────────────
function buildStatement(statementText: string, width: number): Block {
  if (!statementText) return { parts: [], height: 0 };
  const parts: string[] = [];
  const wrapMono = Math.max(20, Math.floor((width - 28) / 7));

  const hdr = sectionHeader('Statement');
  parts.push(...hdr.parts);
  let y = hdr.height;

  const lines = wrapBreakAll(statementText.replace(/\s+/g, ' ').trim(), wrapMono);
  const cardH = 12 + lines.length * 16 + 12;
  parts.push(
    `<rect x="0" y="${y}" width="${width}" height="${cardH}" rx="6" ry="6" fill="#f8fafc" stroke="#e2e8f0"/>`
  );
  let sy = y + 12;
  for (const ln of lines) {
    parts.push(
      `<text x="14" y="${sy + 11}" font-size="11" fill="#1e293b" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escXml(ln)}</text>`
    );
    sy += 16;
  }
  return { parts, height: y + cardH };
}

// ── Key Metrics ──────────────────────────────────────────────────────
function buildMetrics(totalNodes: number, totalCost: number, width: number): Block {
  const parts: string[] = [];
  const hdr = sectionHeader('Key Metrics');
  parts.push(...hdr.parts);
  let y = hdr.height;

  const cardH = 56;
  const cardW = (width - 8) / 2;
  parts.push(
    `<rect x="0" y="${y}" width="${cardW}" height="${cardH}" rx="6" ry="6" fill="#f8fafc" stroke="#e2e8f0"/>`
  );
  parts.push(`<text x="14" y="${y + 18}" font-size="11" fill="#64748b">Total Nodes</text>`);
  parts.push(
    `<text x="14" y="${y + 42}" font-size="18" font-weight="700" fill="#1e293b">${totalNodes}</text>`
  );
  const tcX = cardW + 8;
  parts.push(
    `<rect x="${tcX}" y="${y}" width="${cardW}" height="${cardH}" rx="6" ry="6" fill="#f8fafc" stroke="#e2e8f0"/>`
  );
  parts.push(
    `<text x="${tcX + 14}" y="${y + 18}" font-size="11" fill="#64748b">Total Cost</text>`
  );
  parts.push(
    `<text x="${tcX + 14}" y="${y + 42}" font-size="18" font-weight="700" fill="#1e293b">${totalCost.toFixed(4)}</text>`
  );
  return { parts, height: y + cardH };
}

// Stack a list of section blocks vertically with a gap between non-empty
// blocks; returns a single block translated into one column.
function stackVertical(blocks: Block[], gap: number): Block {
  const parts: string[] = [];
  let y = 0;
  let first = true;
  for (const b of blocks) {
    if (b.height === 0) continue;
    if (!first) y += gap;
    parts.push(`<g transform="translate(0,${y})">${b.parts.join('')}</g>`);
    y += b.height;
    first = false;
  }
  return { parts, height: y };
}

interface SummaryRender {
  parts: string[];
  width: number;
  height: number;
}

function buildSummaryBlock(summary: PlanSummary): SummaryRender {
  const W = SUMMARY_W;
  const contentW = W - SUMMARY_PAD_X * 2;
  const colW = (contentW - SUMMARY_COL_GAP) / 2;

  // Build columns
  const leftCol = stackVertical(
    [buildExecutionPath(summary.executionPath, colW)],
    SUMMARY_INTRA_GAP
  );
  const rightCol = stackVertical(
    [
      buildIssues(summary.redFlags, colW),
      buildIndexes(summary.missingIndexes, colW),
      buildOperations(summary.operations, colW),
      buildStatement(summary.statementText, colW),
      buildMetrics(summary.totalNodes, summary.totalCost, colW),
    ],
    SUMMARY_INTRA_GAP
  );

  const titleH = 36;
  const colsTop = SUMMARY_PAD_Y + titleH;
  const colsH = Math.max(leftCol.height, rightCol.height);
  const totalH = colsTop + colsH + SUMMARY_PAD_Y;

  const parts: string[] = [];
  // Outer card
  parts.push(
    `<rect x="0" y="0" width="${W}" height="${totalH}" rx="12" ry="12" fill="#ffffff" stroke="#e2e8f0"/>`
  );
  // Title
  parts.push(
    `<text x="${SUMMARY_PAD_X}" y="${SUMMARY_PAD_Y + 18}" font-size="18" font-weight="600" fill="#0f172a">Plan Summary</text>`
  );
  // Left column
  parts.push(
    `<g transform="translate(${SUMMARY_PAD_X},${colsTop})">${leftCol.parts.join('')}</g>`
  );
  // Right column
  parts.push(
    `<g transform="translate(${SUMMARY_PAD_X + colW + SUMMARY_COL_GAP},${colsTop})">${rightCol.parts.join('')}</g>`
  );

  return { parts, width: W, height: totalH };
}

// ── Main ────────────────────────────────────────────────────────────────
export function buildPlanSvg(summary: PlanSummary): string {
  const root = summary.planTree;
  if (!root) return '';
  const redFlags = summary.redFlags;
  const layout = positionTree(root, 0, 0);
  const all = flatten(layout);

  const flagMap = new Map<string, 'high' | 'medium' | 'low'>();
  const sevOrder = { high: 0, medium: 1, low: 2 } as const;
  for (const f of redFlags) {
    if (!f.nodeId) continue;
    const ex = flagMap.get(f.nodeId);
    if (!ex || sevOrder[f.severity] < sevOrder[ex]) flagMap.set(f.nodeId, f.severity);
  }

  // Box bounds
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of all) {
    minX = Math.min(minX, l.x);
    minY = Math.min(minY, l.y);
    maxX = Math.max(maxX, l.x + BOX_W);
    maxY = Math.max(maxY, l.y + BOX_H);
  }

  // Pre-compute tooltip placement and grow the canvas to fit each one.
  const tipPlacements = new Map<string, TipPlacement>();
  for (const l of all) {
    const model = buildTipModel(l.node);
    const layout = layoutTip(model);
    let tipX = l.x - 4;
    if (tipX + TOOLTIP_W > maxX + 240) tipX = maxX + 240 - TOOLTIP_W;
    if (tipX < minX - 240) tipX = minX - 240;
    const tipY = l.y + BOX_H + 8;
    tipPlacements.set(l.node.nodeId, { x: tipX, y: tipY, height: layout.totalH, model, layout });
    minX = Math.min(minX, tipX);
    maxX = Math.max(maxX, tipX + TOOLTIP_W);
    maxY = Math.max(maxY, tipY + layout.totalH);
  }

  // Pre-compute summary block (positioned below the tree).
  const summaryBlock = buildSummaryBlock(summary);
  const summaryX = minX; // align to left edge of canvas content
  const treeBottom = Math.max(...all.map((l) => l.y + BOX_H));
  const summaryY = treeBottom + SUMMARY_GAP;
  maxX = Math.max(maxX, summaryX + summaryBlock.width);
  maxY = Math.max(maxY, summaryY + summaryBlock.height);

  const W = Math.round(maxX - minX + PAD * 2);
  const H = Math.round(maxY - minY + PAD * 2);
  const offsetX = PAD - minX;
  const offsetY = PAD - minY;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">`
  );

  parts.push(
    `<defs>
      <filter id="qp-shadow" x="-10%" y="-10%" width="120%" height="130%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
        <feOffset dx="0" dy="1" result="offsetblur"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>`
  );

  parts.push(
    `<style>
      .qp-trigger { fill: #ffffff; fill-opacity: 0; cursor: default; pointer-events: all; }
      .qp-tip { opacity: 0; pointer-events: none; transition: opacity 120ms ease; }
      .qp-tip * { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .qp-trigger:hover + .qp-tip,
      .qp-tip:hover { opacity: 1; pointer-events: auto; }
      .qp-tip-bg { fill: #0f172a; stroke: #334155; stroke-width: 1; filter: url(#qp-shadow); }
      .qp-tip-header { fill: #1e293b; }
      .qp-tip-header-border { stroke: #334155; stroke-width: 1; }
      .qp-tip-title { fill: #ffffff; font-size: 12px; font-weight: 700; }
      .qp-tip-sublabel { fill: #94a3b8; font-size: 11px; }
      .qp-tip-desc { fill: #cbd5e1; font-size: 10px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
      .qp-tip-row-divider { stroke: #1e293b; stroke-width: 1; }
      .qp-tip-section-border { stroke: #1e293b; stroke-width: 1; }
      .qp-tip-row-label { fill: #94a3b8; font-size: 11px; }
      .qp-tip-row-value { fill: #f1f5f9; font-size: 11px; }
      .qp-tip-section { fill: #64748b; font-size: 10px; font-weight: 600; letter-spacing: 0.025em; font-family: ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; }
      .qp-tip-object { fill: #93c5fd; font-size: 11px; }
      .qp-tip-output { fill: #cbd5e1; font-size: 11px; }
      .qp-tip-predicate { fill: #fde047; font-size: 11px; }
    </style>`
  );

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<g transform="translate(${offsetX},${offsetY})">`);

  // ── LAYER 1: ARROWS ─────────────────────────────────────────────────
  for (const l of all) {
    for (const child of l.children) {
      const x1 = l.x + BOX_W;
      const y1 = l.y + BOX_H / 2;
      const x2 = child.x;
      const y2 = child.y + BOX_H / 2;
      const thickness = rowsToThickness(child.node.estimateRows);
      parts.push(
        `<polygon points="${arrowPolygon(x1, y1, x2, y2, thickness)}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="0.5">`
      );
      parts.push(`<title>Estimated Rows: ${child.node.estimateRows.toLocaleString()}</title>`);
      parts.push(`</polygon>`);
    }
  }

  // ── LAYER 2: BOXES (with <title> fallback) ───────────────────────────
  for (const l of all) {
    const op = l.node.physicalOp || l.node.logicalOp;
    const style = OP_STYLES[op] ?? DEFAULT_STYLE;
    const flagSev = flagMap.get(l.node.nodeId);

    parts.push(`<g transform="translate(${l.x},${l.y})">`);

    if (flagSev) {
      const ring = FLAG_RING[flagSev];
      parts.push(
        `<rect x="${-ring.pad}" y="${-ring.pad}" width="${BOX_W + ring.pad * 2}" height="${BOX_H + ring.pad * 2}" rx="14" ry="14" fill="none" stroke="${ring.color}" stroke-width="${ring.width}"/>`
      );
    }

    parts.push(
      `<rect x="0" y="0" width="${BOX_W}" height="${BOX_H}" rx="11" ry="11" fill="#ffffff" stroke="${style.border}" stroke-width="1" filter="url(#qp-shadow)"/>`
    );

    // Header band — rounded top corners, flat bottom (border-b separates from body)
    parts.push(
      `<path d="M 1 12 Q 1 1 12 1 L ${BOX_W - 12} 1 Q ${BOX_W - 1} 1 ${BOX_W - 1} 12 L ${BOX_W - 1} ${HEADER_H} L 1 ${HEADER_H} Z" fill="${style.headerBg}" stroke="${style.border}" stroke-width="1"/>`
    );
    // Lucide icon — colored per operator type, matches React's <Icon size={20} className={iconClass}/>
    parts.push(renderIcon(style.iconName, BOX_PAD, (HEADER_H - ICON_SIZE) / 2, ICON_SIZE, style.iconStroke));
    // Operator name — slate-700, 11px bold (matches React's text-[11px] font-bold text-slate-700)
    const textX = BOX_PAD + ICON_SIZE + 8; // gap-2 = 8px
    const maxTextChars = Math.floor((BOX_W - textX - BOX_PAD) / 6.6);
    parts.push(
      `<text x="${textX}" y="${HEADER_H / 2 + 4}" font-size="11" font-weight="700" fill="#334155">${escXml(truncate(op, maxTextChars))}</text>`
    );

    let bodyY = HEADER_H + 16;
    if (l.node.objectName) {
      parts.push(
        `<text x="14" y="${bodyY}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" fill="#94a3b8">${escXml(truncate(l.node.objectName, 30))}</text>`
      );
      bodyY += 14;
    }

    const barWidth = Math.min(100, l.node.selfCostPercent);
    const fullBarW = BOX_W - 70;
    parts.push(
      `<rect x="14" y="${bodyY + 4}" width="${fullBarW}" height="4" rx="2" ry="2" fill="#f1f5f9"/>`
    );
    parts.push(
      `<rect x="14" y="${bodyY + 4}" width="${((fullBarW * barWidth) / 100).toFixed(1)}" height="4" rx="2" ry="2" fill="${costBarColor(l.node.selfCostPercent)}"/>`
    );
    parts.push(
      `<text x="${BOX_W - 14}" y="${bodyY + 9}" font-size="10" font-weight="600" fill="#64748b" text-anchor="end">${l.node.selfCostPercent.toFixed(1)}%</text>`
    );
    bodyY += 14;

    const rowsLabel =
      `${l.node.estimateRows.toLocaleString()} rows` +
      (l.node.estimateExecutions > 1 ? ` · ×${l.node.estimateExecutions}` : '');
    parts.push(
      `<text x="14" y="${bodyY + 9}" font-size="10" fill="#94a3b8">${escXml(rowsLabel)}</text>`
    );

    // <title> fallback — works in every viewer
    const titleLines = [op];
    if (l.node.logicalOp && l.node.logicalOp !== l.node.physicalOp) titleLines.push(l.node.logicalOp);
    titleLines.push(`Cost: ${l.node.selfCost.toFixed(6)} (${l.node.selfCostPercent.toFixed(1)}%)`);
    titleLines.push(`Rows: ${l.node.estimateRows.toLocaleString()}`);
    titleLines.push(`Executions: ${l.node.estimateExecutions}`);
    if (l.node.objectFull) titleLines.push(`Object: ${l.node.objectFull}`);
    if (l.node.predicate) titleLines.push(`Predicate: ${l.node.predicate}`);
    parts.push(`<title>${escXml(titleLines.join('\n'))}</title>`);

    parts.push(`</g>`);
  }

  // ── LAYER 2.5: PLAN SUMMARY (below the tree) ────────────────────────
  parts.push(`<g transform="translate(${summaryX},${summaryY})">`);
  parts.push(...summaryBlock.parts);
  parts.push(`</g>`);

  // ── LAYER 3: HOVER TRIGGERS + RICH TOOLTIPS (drawn last = on top) ───
  for (const l of all) {
    const tip = tipPlacements.get(l.node.nodeId)!;

    parts.push(
      `<rect class="qp-trigger" x="${l.x}" y="${l.y}" width="${BOX_W}" height="${BOX_H}" rx="11" ry="11"/>`
    );
    parts.push(`<g class="qp-tip" transform="translate(${tip.x},${tip.y})">`);
    // Body bg (slate-900) — rounded corners; the header band paints over the
    // top portion in slate-800 inside the same clipped region.
    parts.push(
      `<rect class="qp-tip-bg" x="0" y="0" width="${TOOLTIP_W}" height="${tip.height}" rx="12" ry="12"/>`
    );
    parts.push(...renderTip(tip.model, tip.layout));
    parts.push(`</g>`);
  }

  parts.push(`</g>`);
  parts.push(`</svg>`);

  return parts.join('\n');
}

export function downloadPlanSvg(summary: PlanSummary): void {
  const svg = buildPlanSvg(summary);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'query-plan.svg';
  a.click();
  URL.revokeObjectURL(url);
}
