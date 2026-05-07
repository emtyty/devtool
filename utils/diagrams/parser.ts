// Mermaid syntax → DiagramIR adapter.
//
// Strategy: use `mermaid.parse()` for type detection (cheap and reliable),
// then for natively-supported types (flowchart) walk the source ourselves
// with a focused recursive parser. We intentionally do NOT depend on
// mermaid's internal AST API — that's unstable across versions.
//
// For types we don't natively render yet (sequence, gantt, ER from mermaid
// syntax, etc.), we return `ir: null` and let the caller fall back to
// `mermaid.render()`.
//
// Supported flowchart syntax (subset of mermaid v11):
//   - Header:        flowchart TB|TD|BT|LR|RL  /  graph TB|TD|BT|LR|RL
//   - Basic nodes:   id  /  id[Rect]  /  id(Round)  /  id((Circle))
//                    id{Diamond}  /  id[(Cylinder)]  /  id>Tag]
//   - Edges:         A --> B,  A --- B,  A -.-> B,  A ==> B
//                    Labeled:  A -- text --> B   /   A -->|text| B
//   - Subgraphs:     subgraph name [Title?] ... end
//   - Icon directive (project extension):  Foo[Database]:::icon=logos:aws-rds
//
// Out of scope (caller can extend later):
//   - Multi-source/target shorthand (A & B --> C & D)
//   - `class`/`classDef`/`style`/`linkStyle`/`click`
//   - Asymmetric/parallelogram/trapezoid shapes

import mermaid from 'mermaid';
import type {
  ClassDiagramIR,
  ClassMember,
  ClassNode,
  ClassRelation,
  ClassRelationKind,
  ClassVisibility,
  ERDiagramIR,
  EdgeIR,
  EdgeKind,
  FlowDirection,
  FlowchartIR,
  GanttDiagramIR,
  GanttItemStatus,
  GanttTask,
  JourneyIR,
  JourneySection,
  MindmapIR,
  MindmapNode,
  MindmapShape,
  NodeIR,
  NodeKind,
  ParseResult,
  PieChartIR,
  QuadrantChartIR,
  QuadrantPoint,
  RecognizedDiagramType,
  SequenceArrow,
  SequenceIR,
  SequenceMessage,
  SequenceNote,
  SequenceStep,
  StateDiagramIR,
  StateNode,
  SubgraphIR,
  TimelineEvent,
  TimelineIR,
} from './types';
import type { DbColumn, DbRelation, DbTable, ParsedSchema } from '../dbSchemaParser';

// ── Type detection ───────────────────────────────────────────────────────

const HEADER_KEYWORDS: { re: RegExp; type: RecognizedDiagramType }[] = [
  { re: /^(flowchart|graph)\b/i, type: 'flowchart' },
  { re: /^erdiagram\b/i, type: 'er' },
  { re: /^sequencediagram\b/i, type: 'sequence' },
  { re: /^classdiagram\b/i, type: 'class' },
  { re: /^statediagram(-v2)?\b/i, type: 'state' },
  { re: /^gantt\b/i, type: 'gantt' },
  { re: /^pie\b/i, type: 'pie' },
  { re: /^quadrantchart\b/i, type: 'quadrant' },
  { re: /^mindmap\b/i, type: 'mindmap' },
  { re: /^gitgraph\b/i, type: 'gitgraph' },
  { re: /^timeline\b/i, type: 'timeline' },
  { re: /^journey\b/i, type: 'journey' },
  { re: /^c4(context|container|component|deployment)/i, type: 'c4' },
  { re: /^architecture(-beta)?\b/i, type: 'architecture' },
];

export async function detectDiagramType(source: string): Promise<RecognizedDiagramType | null> {
  // Strip BOM and leading directive lines (`%%{init: ...}%%`) before
  // looking at the first content line.
  const clean = source.replace(/^﻿/, '');
  const firstLine = clean
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('%%'));
  if (!firstLine) return null;
  for (const { re, type } of HEADER_KEYWORDS) {
    if (re.test(firstLine)) return type;
  }
  // Ambiguous header — let mermaid.parse confirm the type. If mermaid
  // recognizes it as anything (even a type we don't know), return
  // 'unsupported' so the caller routes through the mermaid fallback rather
  // than reporting a hard parse failure.
  try {
    const result = await mermaid.parse(clean, { suppressErrors: true });
    if (!result) return 'unsupported';
    const dt = result.diagramType?.toLowerCase() ?? '';
    for (const { type } of HEADER_KEYWORDS) {
      if (dt.includes(type)) return type;
    }
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export async function parseToIR(source: string): Promise<ParseResult> {
  const type = await detectDiagramType(source);
  if (type === null) {
    return { ok: false, source, error: 'Unrecognized diagram type' };
  }
  try {
    switch (type) {
      case 'flowchart':
        return { ok: true, type, ir: parseFlowchart(source) };
      case 'pie':
        return { ok: true, type, ir: parsePieChart(source) };
      case 'quadrant':
        return { ok: true, type, ir: parseQuadrantChart(source) };
      case 'journey':
        return { ok: true, type, ir: parseJourney(source) };
      case 'sequence':
        return { ok: true, type, ir: parseSequence(source) };
      case 'class':
        return { ok: true, type, ir: parseClassDiagram(source) };
      case 'state':
        return { ok: true, type, ir: parseStateDiagram(source) };
      case 'er':
        return { ok: true, type, ir: parseMermaidERDiagram(source) };
      case 'gantt':
        return { ok: true, type, ir: parseGantt(source) };
      case 'timeline':
        return { ok: true, type, ir: parseTimeline(source) };
      case 'mindmap':
        return { ok: true, type, ir: parseMindmap(source) };
      default:
        // Recognized but no native renderer yet — caller falls back to mermaid.
        return { ok: true, type, ir: null };
    }
  } catch (err) {
    return {
      ok: false,
      source,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Flowchart parser ─────────────────────────────────────────────────────

interface NodeDecl {
  id: string;
  label: string;
  kind: NodeKind;
  icon?: string;
}

const HEADER_RE = /^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i;
const SUBGRAPH_OPEN_RE = /^subgraph\s+([\w-]+)(?:\s*\[(.+?)\])?/i;
const EDGE_LINE_REGEX = /-{2,}>|-{2,}|-\.-+>|={2,}>|-{2,}-|=={2,}/;

export function parseFlowchart(source: string): FlowchartIR {
  const rawLines = source.split('\n');
  if (rawLines.length === 0) throw new Error('Empty flowchart source');

  let direction: FlowDirection = 'TB';
  const nodes = new Map<string, NodeIR>();
  const edges: EdgeIR[] = [];
  const subgraphs: SubgraphIR[] = [];
  const subgraphStack: string[] = [];

  const ensureNode = (decl: NodeDecl): NodeIR => {
    const existing = nodes.get(decl.id);
    if (existing) {
      // Upgrade label / kind if better info shows up later
      if (decl.label && (decl.label !== decl.id || !existing.label)) existing.label = decl.label;
      if (decl.kind !== 'plain' && existing.kind === 'plain') existing.kind = decl.kind;
      if (decl.icon) {
        existing.icon = decl.icon;
        existing.kind = 'icon';
      }
      return existing;
    }
    const node: NodeIR = {
      id: decl.id,
      label: decl.label,
      kind: decl.icon ? 'icon' : decl.kind,
    };
    if (decl.icon) node.icon = decl.icon;
    if (subgraphStack.length > 0) node.subgraph = subgraphStack[subgraphStack.length - 1];
    nodes.set(decl.id, node);
    return node;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line || line.startsWith('%%')) continue;

    // First non-empty line — header
    if (i === 0 || (nodes.size === 0 && edges.length === 0 && subgraphs.length === 0)) {
      const m = line.match(HEADER_RE);
      if (m) {
        const dir = m[1].toUpperCase();
        direction = (dir === 'TD' ? 'TB' : dir) as FlowDirection;
        continue;
      }
    }

    // Subgraph open
    const subOpen = line.match(SUBGRAPH_OPEN_RE);
    if (subOpen) {
      const id = subOpen[1];
      const label = subOpen[2] ?? id;
      subgraphs.push({ id, label });
      subgraphStack.push(id);
      continue;
    }
    if (/^end\b/i.test(line)) {
      subgraphStack.pop();
      continue;
    }

    // Skip directives we don't model
    if (/^(direction|class|classDef|style|linkStyle|click)\b/i.test(line)) continue;

    // Edge or lone node?
    if (EDGE_LINE_REGEX.test(line)) {
      const edge = parseEdge(line);
      if (edge) {
        const from = parseNodeDecl(edge.from);
        const to = parseNodeDecl(edge.to);
        ensureNode(from);
        ensureNode(to);
        const e: EdgeIR = { source: from.id, target: to.id, kind: edge.kind };
        if (edge.label) e.label = edge.label;
        edges.push(e);
        continue;
      }
    }

    // Lone node declaration
    const decl = parseNodeDecl(line);
    if (decl.id) ensureNode(decl);
  }

  return {
    type: 'flowchart',
    direction,
    nodes: [...nodes.values()],
    edges,
    subgraphs,
  };
}

// ── Node-declaration parser (id + shape + optional :::modifier) ──────────

function splitClassDirective(text: string): { core: string; icon?: string } {
  const idx = text.indexOf(':::');
  if (idx === -1) return { core: text };
  const core = text.slice(0, idx).trim();
  const rest = text.slice(idx + 3).trim();
  // Look for `icon=foo:bar` token
  const iconMatch = rest.match(/(?:^|[\s,])icon\s*=\s*([\w:_-]+)/);
  return { core, icon: iconMatch?.[1] };
}

function parseNodeDecl(text: string): NodeDecl {
  const trimmed = text.trim();
  const { core, icon } = splitClassDirective(trimmed);

  const shapes: { re: RegExp; kind: NodeKind }[] = [
    { re: /^([\w-]+)\(\(([^)]*)\)\)$/, kind: 'user' }, // ((circle))
    { re: /^([\w-]+)\[\(([^)]*)\)\]$/, kind: 'database' }, // [(cylinder)]
    { re: /^([\w-]+)\[\[([^\]]*)\]\]$/, kind: 'queue' }, // [[subroutine]]
    { re: /^([\w-]+)\[\/([^/]*)\/\]$/, kind: 'process' }, // [/parallelogram/]
    { re: /^([\w-]+)\[\\([^\\]*)\\\]$/, kind: 'process' }, // [\..\]
    { re: /^([\w-]+)\{([^}]*)\}$/, kind: 'decision' }, // {decision}
    { re: /^([\w-]+)>([^\]]*)\]$/, kind: 'plain' }, // >tag]
    { re: /^([\w-]+)\(([^)]*)\)$/, kind: 'service' }, // (rounded)
    { re: /^([\w-]+)\[([^\]]*)\]$/, kind: 'process' }, // [rect]
  ];

  for (const { re, kind } of shapes) {
    const m = core.match(re);
    if (m) {
      return {
        id: m[1],
        label: stripQuotes(m[2]) || m[1],
        kind,
        icon,
      };
    }
  }

  // Bare id
  const bare = core.match(/^([\w-]+)$/);
  if (bare) {
    return { id: bare[1], label: bare[1], kind: 'plain', icon };
  }

  // Couldn't parse — return placeholder so the parent loop can skip cleanly
  return { id: '', label: '', kind: 'plain' };
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ── Edge parser ──────────────────────────────────────────────────────────

interface ParsedEdge {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
}

function parseEdge(line: string): ParsedEdge | null {
  // Order matters — most specific first.
  // Labeled with `-- label -->` / `-. label .->` / `== label ==>`
  const labeled: { re: RegExp; kind: EdgeKind }[] = [
    { re: /^(.+?)\s*--\s*([^-][^|]*?)\s*-{1,2}>\s*(.+)$/, kind: 'solid' },
    { re: /^(.+?)\s*-\.\s*([^.][^|]*?)\s*\.-+>\s*(.+)$/, kind: 'dashed' },
    { re: /^(.+?)\s*==\s*([^=][^|]*?)\s*={1,2}>\s*(.+)$/, kind: 'thick' },
  ];
  for (const { re, kind } of labeled) {
    const m = line.match(re);
    if (m) return { from: m[1].trim(), to: m[3].trim(), label: m[2].trim(), kind };
  }

  // Unlabeled or `|label|` syntax: `A --> |label| B`
  const unlabeled: { re: RegExp; kind: EdgeKind }[] = [
    { re: /^(.+?)\s*-\.-+>\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: 'dashed' },
    { re: /^(.+?)\s*={2,}>\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: 'thick' },
    { re: /^(.+?)\s*-{2,}>\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: 'solid' },
    { re: /^(.+?)\s*-{2,}\s*(?:\|([^|]+)\|\s*)?(.+)$/, kind: 'solid' },
  ];
  for (const { re, kind } of unlabeled) {
    const m = line.match(re);
    if (m) {
      const label = m[2]?.trim();
      return { from: m[1].trim(), to: m[3].trim(), label: label || undefined, kind };
    }
  }
  return null;
}

// ── Pie chart parser ─────────────────────────────────────────────────────
//   pie [showData]
//     title Some Title
//     "Slice A" : 42
//     "Slice B" : 17

const PIE_SLICE_RE = /^"([^"]+)"\s*:\s*([\d.]+)/;

export function parsePieChart(source: string): PieChartIR {
  const lines = source.split('\n').map((l) => l.trim());
  const ir: PieChartIR = { type: 'pie', slices: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('%%')) continue;
    if (/^pie\b/i.test(line)) {
      if (/\bshowData\b/i.test(line)) ir.showData = true;
      continue;
    }
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const sliceMatch = line.match(PIE_SLICE_RE);
    if (sliceMatch) {
      const value = parseFloat(sliceMatch[2]);
      if (!isNaN(value)) ir.slices.push({ label: sliceMatch[1], value });
    }
  }
  return ir;
}

// ── Quadrant chart parser ────────────────────────────────────────────────

const QUADRANT_POINT_RE = /^([^:]+):\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/;

export function parseQuadrantChart(source: string): QuadrantChartIR {
  const lines = source.split('\n').map((l) => l.trim());
  const ir: QuadrantChartIR = { type: 'quadrant', points: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('%%')) continue;
    if (/^quadrantchart\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const xAxisMatch = line.match(/^x-axis\s+(.+?)\s*-->\s*(.+)$/i);
    if (xAxisMatch) {
      ir.xAxisLabel = { low: xAxisMatch[1].trim(), high: xAxisMatch[2].trim() };
      continue;
    }
    const yAxisMatch = line.match(/^y-axis\s+(.+?)\s*-->\s*(.+)$/i);
    if (yAxisMatch) {
      ir.yAxisLabel = { low: yAxisMatch[1].trim(), high: yAxisMatch[2].trim() };
      continue;
    }
    const qMatch = line.match(/^quadrant-([1-4])\s+(.+)$/i);
    if (qMatch) {
      ir.quadrantLabels = ir.quadrantLabels ?? {};
      ir.quadrantLabels[`q${qMatch[1]}` as 'q1' | 'q2' | 'q3' | 'q4'] = qMatch[2].trim();
      continue;
    }
    const pt = line.match(QUADRANT_POINT_RE);
    if (pt) {
      const x = parseFloat(pt[2]);
      const y = parseFloat(pt[3]);
      if (!isNaN(x) && !isNaN(y)) {
        ir.points.push({ label: pt[1].trim(), x, y } satisfies QuadrantPoint);
      }
    }
  }
  return ir;
}

// ── Journey parser ───────────────────────────────────────────────────────

const JOURNEY_TASK_RE = /^([^:]+?)\s*:\s*([\d.]+)\s*:\s*(.+)$/;

export function parseJourney(source: string): JourneyIR {
  const lines = source.split('\n').map((l) => l.replace(/^\s+/, ''));
  const ir: JourneyIR = { type: 'journey', sections: [] };
  let currentSection: JourneySection | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('%%')) continue;
    if (/^journey\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      currentSection = { title: sectionMatch[1].trim(), tasks: [] };
      ir.sections.push(currentSection);
      continue;
    }
    const taskMatch = line.match(JOURNEY_TASK_RE);
    if (taskMatch && currentSection) {
      const score = parseFloat(taskMatch[2]);
      const actors = taskMatch[3]
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      currentSection.tasks.push({ label: taskMatch[1].trim(), score, actors });
    }
  }
  return ir;
}

// ── Sequence parser ──────────────────────────────────────────────────────
//
// Parses a permissive subset of mermaid's sequenceDiagram syntax. Covers:
//   - participant / actor declarations (with `as` aliases, optional quotes)
//   - arrows: ->, -->, ->>, -->>, -x, -)
//   - activation modifiers (`A->>+B: msg` / `A->>-B: msg`)
//   - notes: `Note over A,B: text` / left of / right of
//   - control-flow keywords (loop/alt/opt/par/end/activate/deactivate) — skipped
//
// Arrows are matched by SCANNING for the arrow token rather than via a strict
// id regex so participants with spaces in their name (`Order Service`) work
// even when the source uses the spaceful name as the id.

// Ordered most-specific (longest) first so `-->>` doesn't get misread as `->`.
const SEQ_ARROW_TOKENS: { token: string; arrow: SequenceArrow }[] = [
  { token: '-->>', arrow: 'reply' },
  { token: '->>', arrow: 'sync' },
  { token: '-->', arrow: 'reply' },
  { token: '->', arrow: 'sync' },
  { token: '-x', arrow: 'cross' },
  { token: '-)', arrow: 'async' },
];

interface SequenceArrowMatch {
  from: string;
  to: string;
  arrow: SequenceArrow;
  label: string;
}

function matchSequenceArrow(line: string): SequenceArrowMatch | null {
  // Find the FIRST arrow token in the line. Try longest tokens first so
  // `-->>` matches before `->>` / `-->` / `->`.
  let bestIdx = -1;
  let bestToken: (typeof SEQ_ARROW_TOKENS)[number] | null = null;
  for (const t of SEQ_ARROW_TOKENS) {
    const idx = line.indexOf(t.token);
    if (idx === -1) continue;
    if (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && t.token.length > (bestToken?.token.length ?? 0))) {
      bestIdx = idx;
      bestToken = t;
    }
  }
  if (bestIdx === -1 || !bestToken) return null;

  const from = line.slice(0, bestIdx).trim();
  const rest = line.slice(bestIdx + bestToken.token.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) return null;
  let to = rest.slice(0, colonIdx).trim();
  const label = rest.slice(colonIdx + 1).trim();
  if (!from || !to || !label) return null;

  // Strip leading activation modifier from `to` (e.g. `+Auth` → `Auth`).
  if (to.startsWith('+') || to.startsWith('-')) to = to.slice(1).trim();
  return { from, to, arrow: bestToken.arrow, label };
}

export function parseSequence(source: string): SequenceIR {
  const lines = source.split('\n').map((l) => l.trim());
  const ir: SequenceIR = { type: 'sequence', participants: [], steps: [] };
  const ensureParticipant = (id: string, label?: string) => {
    const existing = ir.participants.find((p) => p.id === id);
    if (existing) {
      if (label && existing.label === existing.id) existing.label = label;
      return;
    }
    ir.participants.push({ id, label: label ?? id });
  };

  for (const line of lines) {
    if (!line || line.startsWith('%%')) continue;
    if (/^sequencediagram\b/i.test(line)) continue;

    // Skip control-flow keywords / activations — we don't model them yet but
    // we shouldn't try to parse them as messages either.
    if (/^(loop|alt|opt|par|else|critical|break|rect|end|activate|deactivate|autonumber|box)\b/i.test(line)) continue;

    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }

    // Participant: `participant ID` or `participant ID as Label` or
    //              `participant "Quoted Name"` or `actor User`.
    const partMatch = line.match(/^(?:participant|actor)\s+(.+)$/i);
    if (partMatch) {
      const rest = partMatch[1].trim();
      const asMatch = rest.match(/^(.+?)\s+as\s+(.+)$/i);
      if (asMatch) {
        ensureParticipant(stripQuotes(asMatch[1].trim()), stripQuotes(asMatch[2].trim()));
      } else {
        ensureParticipant(stripQuotes(rest));
      }
      continue;
    }

    const noteMatch = line.match(/^note\s+(left of|right of|over)\s+([^:]+)\s*:\s*(.+)$/i);
    if (noteMatch) {
      const sideRaw = noteMatch[1].toLowerCase();
      const side = sideRaw.startsWith('left') ? 'left' : sideRaw.startsWith('right') ? 'right' : 'over';
      const participants = noteMatch[2]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      participants.forEach((p) => ensureParticipant(p));
      const note: SequenceNote = { kind: 'note', side, participants, text: noteMatch[3].trim() };
      ir.steps.push(note);
      continue;
    }

    const arrowMatch = matchSequenceArrow(line);
    if (arrowMatch) {
      ensureParticipant(arrowMatch.from);
      ensureParticipant(arrowMatch.to);
      const msg: SequenceMessage = {
        kind: 'message',
        from: arrowMatch.from,
        to: arrowMatch.to,
        arrow: arrowMatch.arrow,
        label: arrowMatch.label,
      };
      ir.steps.push(msg);
    }
  }
  return ir;
}

// Re-export Step type for renderer convenience
export type { SequenceStep };

// ── Class diagram parser ─────────────────────────────────────────────────
//   classDiagram
//     Animal <|-- Duck
//     class Animal {
//       +int age
//       +String gender
//       +isMammal()
//     }

const CLASS_VISIBILITY: Record<string, ClassVisibility> = {
  '+': 'public',
  '-': 'private',
  '#': 'protected',
  '~': 'package',
};

const CLASS_REL_PATTERNS: { re: RegExp; kind: ClassRelationKind; reversed?: boolean }[] = [
  { re: /^([\w-]+)\s*<\|--\s*([\w-]+)$/, kind: 'inheritance', reversed: true },
  { re: /^([\w-]+)\s*--\|>\s*([\w-]+)$/, kind: 'inheritance' },
  { re: /^([\w-]+)\s*<\|\.\.\s*([\w-]+)$/, kind: 'realization', reversed: true },
  { re: /^([\w-]+)\s*\.\.\|>\s*([\w-]+)$/, kind: 'realization' },
  { re: /^([\w-]+)\s*\*--\s*([\w-]+)$/, kind: 'composition' },
  { re: /^([\w-]+)\s*o--\s*([\w-]+)$/, kind: 'aggregation' },
  { re: /^([\w-]+)\s*<\.\.\s*([\w-]+)$/, kind: 'dependency', reversed: true },
  { re: /^([\w-]+)\s*\.\.>\s*([\w-]+)$/, kind: 'dependency' },
  { re: /^([\w-]+)\s*--\s*([\w-]+)$/, kind: 'association' },
];

export function parseClassDiagram(source: string): ClassDiagramIR {
  const lines = source.split('\n').map((l) => l.trim());
  const classes = new Map<string, ClassNode>();
  const relations: ClassRelation[] = [];

  const ensureClass = (id: string): ClassNode => {
    let cls = classes.get(id);
    if (!cls) {
      cls = { id, label: id, members: [] };
      classes.set(id, cls);
    }
    return cls;
  };

  // Track open `class X { ... }` block
  let currentClassBody: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('%%')) continue;
    if (/^classdiagram\b/i.test(line)) continue;

    if (currentClassBody) {
      if (/^\}\s*$/.test(line)) {
        currentClassBody = null;
        continue;
      }
      const member = parseClassMember(line);
      if (member) ensureClass(currentClassBody).members.push(member);
      continue;
    }

    // class X { ... }  — same-line opening
    const sameLine = line.match(/^class\s+([\w-]+)\s*\{(.*)\}\s*$/);
    if (sameLine) {
      const cls = ensureClass(sameLine[1]);
      const inner = sameLine[2].split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
      for (const part of inner) {
        const m = parseClassMember(part);
        if (m) cls.members.push(m);
      }
      continue;
    }

    // class X {  — multi-line
    const open = line.match(/^class\s+([\w-]+)\s*\{$/);
    if (open) {
      ensureClass(open[1]);
      currentClassBody = open[1];
      continue;
    }

    // class X — declaration only
    const decl = line.match(/^class\s+([\w-]+)$/);
    if (decl) {
      ensureClass(decl[1]);
      continue;
    }

    // X : +member  — mermaid-style member declaration
    const memberDecl = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (memberDecl && !line.includes('-->') && !line.includes('--')) {
      const m = parseClassMember(memberDecl[2]);
      if (m) ensureClass(memberDecl[1]).members.push(m);
      continue;
    }

    // Try relations (most specific first)
    let labelPart: string | undefined;
    let relLine = line;
    const labelMatch = line.match(/^(.+?)\s*:\s*(.+)$/);
    if (labelMatch && /(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|o--|<\.\.|\.\.>|--)/.test(labelMatch[1])) {
      relLine = labelMatch[1];
      labelPart = labelMatch[2].trim();
    }
    for (const { re, kind, reversed } of CLASS_REL_PATTERNS) {
      const m = relLine.match(re);
      if (m) {
        const a = m[1];
        const b = m[2];
        ensureClass(a);
        ensureClass(b);
        relations.push({
          source: reversed ? b : a,
          target: reversed ? a : b,
          kind,
          label: labelPart,
        });
        break;
      }
    }
  }

  return { type: 'class', classes: [...classes.values()], relations };
}

function parseClassMember(text: string): ClassMember | null {
  const t = text.trim();
  if (!t) return null;
  let visibility: ClassVisibility | undefined;
  let body = t;
  const first = body[0];
  if (first in CLASS_VISIBILITY) {
    visibility = CLASS_VISIBILITY[first];
    body = body.slice(1).trim();
  }
  // Method: ends with parens (with optional return type after)
  const methodMatch = body.match(/^([\w-]+)\(([^)]*)\)(?:\s*([\w<>[\]]+))?$/);
  if (methodMatch) {
    return {
      kind: 'method',
      visibility,
      name: methodMatch[1],
      parameters: methodMatch[2] || undefined,
      returnType: methodMatch[3] || undefined,
    };
  }
  // Attribute: "Type name" OR "name : Type"
  const colonMatch = body.match(/^([\w-]+)\s*:\s*([\w<>[\]]+)$/);
  if (colonMatch) {
    return { kind: 'attribute', visibility, name: colonMatch[1], returnType: colonMatch[2] };
  }
  const typeNameMatch = body.match(/^([\w<>[\]]+)\s+([\w-]+)$/);
  if (typeNameMatch) {
    return { kind: 'attribute', visibility, name: typeNameMatch[2], returnType: typeNameMatch[1] };
  }
  // Bare name fallback
  return { kind: 'attribute', visibility, name: body };
}

// ── State diagram parser ─────────────────────────────────────────────────
//   stateDiagram-v2
//     [*] --> Still
//     Still --> Moving : start
//     Moving --> [*]

export function parseStateDiagram(source: string): StateDiagramIR {
  const lines = source.split('\n').map((l) => l.trim());
  const states = new Map<string, StateNode>();
  const transitions: StateDiagramIR['transitions'] = [];
  // Stack of composite-state ids; top of stack is the current parent.
  const parentStack: string[] = [];

  const currentParent = (): string | undefined =>
    parentStack.length > 0 ? parentStack[parentStack.length - 1] : undefined;

  // Markers are scoped per composite so each composite gets its own
  // start/end (otherwise [*] inside a composite collapses onto the global
  // start marker and the diagram's structure breaks).
  const markerId = (kind: 'start' | 'end', parent?: string) =>
    parent ? `__${kind}_${parent}` : `__${kind}`;

  const ensureMarker = (kind: 'start' | 'end'): StateNode => {
    const parent = currentParent();
    const id = markerId(kind, parent);
    let s = states.get(id);
    if (!s) {
      s = { id, label: '', kind, parent };
      states.set(id, s);
    }
    return s;
  };

  const ensureState = (id: string): StateNode => {
    let s = states.get(id);
    if (s) return s;
    s = { id, label: id, kind: 'state', parent: currentParent() };
    states.set(id, s);
    return s;
  };

  for (const line of lines) {
    if (!line || line.startsWith('%%')) continue;
    if (/^statediagram(-v2)?\b/i.test(line)) continue;

    // Composite state opening: `state X {`
    const compositeOpen = line.match(/^state\s+([\w-]+)\s*\{$/);
    if (compositeOpen) {
      const id = compositeOpen[1];
      const existing = states.get(id);
      if (existing) {
        existing.kind = 'composite';
      } else {
        states.set(id, { id, label: id, kind: 'composite', parent: currentParent() });
      }
      parentStack.push(id);
      continue;
    }
    // Composite close
    if (line === '}') {
      parentStack.pop();
      continue;
    }

    const arrow = line.match(/^(\[\*\]|[\w-]+)\s*-->\s*(\[\*\]|[\w-]+)(?:\s*:\s*(.+))?$/);
    if (arrow) {
      const src = arrow[1] === '[*]' ? ensureMarker('start') : ensureState(arrow[1]);
      const tgt = arrow[2] === '[*]' ? ensureMarker('end') : ensureState(arrow[2]);
      transitions.push({
        source: src.id,
        target: tgt.id,
        label: arrow[3]?.trim(),
        parent: currentParent(),
      });
      continue;
    }

    // State: stateName : description
    const stateLabel = line.match(/^([\w-]+)\s*:\s*(.+)$/);
    if (stateLabel) {
      const s = ensureState(stateLabel[1]);
      s.label = stateLabel[2].trim();
      continue;
    }

    // Bare state declaration
    if (/^[\w-]+$/.test(line)) ensureState(line);
  }

  return { type: 'state', states: [...states.values()], transitions };
}

// ── Mermaid erDiagram parser → ParsedSchema ──────────────────────────────
//   erDiagram
//     CUSTOMER ||--o{ ORDER : places
//     CUSTOMER {
//       string name
//       string email PK
//     }

export function parseMermaidERDiagram(source: string): ERDiagramIR {
  const lines = source.split('\n').map((l) => l.trim());
  const tables = new Map<string, DbTable>();
  const relations: DbRelation[] = [];

  const ensureTable = (name: string): DbTable => {
    let t = tables.get(name);
    if (!t) {
      t = { name, columns: [] };
      tables.set(name, t);
    }
    return t;
  };

  let currentTableBody: string | null = null;

  for (const line of lines) {
    if (!line || line.startsWith('%%')) continue;
    if (/^erdiagram\b/i.test(line)) continue;

    if (currentTableBody) {
      if (/^\}\s*$/.test(line)) {
        currentTableBody = null;
        continue;
      }
      // Column: "type name [PK|FK]" or "type name PK,FK"
      const col = line.match(/^([\w-]+)\s+([\w-]+)(?:\s+(.+))?$/);
      if (col) {
        const flags = (col[3] ?? '').toUpperCase();
        const column: DbColumn = {
          name: col[2],
          type: col[1],
          isPK: /\bPK\b/.test(flags),
          isFK: /\bFK\b/.test(flags),
          isNullable: !/\bNOT NULL\b/.test(flags),
          isUnique: /\bUK\b/.test(flags) || /\bUNIQUE\b/.test(flags),
        };
        ensureTable(currentTableBody).columns.push(column);
      }
      continue;
    }

    // Table block opening:  TABLE { ... }
    const blockOpen = line.match(/^([A-Z][\w-]*)\s*\{$/);
    if (blockOpen) {
      ensureTable(blockOpen[1]);
      currentTableBody = blockOpen[1];
      continue;
    }

    // Relation:  CUSTOMER ||--o{ ORDER : places
    const rel = line.match(/^([A-Z][\w-]*)\s+([|}{o\-.]+)\s+([A-Z][\w-]*)\s*:\s*(.+)$/);
    if (rel) {
      const fromTable = rel[1];
      const toTable = rel[3];
      const cardinality = rel[2];
      ensureTable(fromTable);
      ensureTable(toTable);
      // Use the relation label as the FK column name surrogate
      relations.push({
        fromTable,
        fromCol: rel[4].trim(),
        toTable,
        toCol: rel[4].trim(),
        nullable: cardinality.includes('o'),
      });
    }
  }

  const schema: ParsedSchema = {
    tables: [...tables.values()],
    relations,
    inputFormat: 'unknown',
  };
  return { type: 'er', schema };
}

// ── Gantt parser ─────────────────────────────────────────────────────────
//   gantt
//     title A Gantt Diagram
//     dateFormat YYYY-MM-DD
//     section Section
//       Task A      :a1, 2026-01-01, 30d
//       Task B      :after a1, 20d
//       Done task   :done, des2, 2026-01-08, 5d
//       Active task :active, des3, after des2, 10d
//       Critical    :crit, des4, 2026-01-22, 2d
//       Milestone   :milestone, m1, 2026-02-01, 0d

const GANTT_TASK_LINE_RE = /^([^:]+?)\s*:\s*(.+)$/;

interface GanttIntermediate {
  id: string;
  label: string;
  status: GanttItemStatus;
  /** Either an ISO date or `after <id>`; resolved in pass 2. */
  startSpec: string;
  /** `<n>d`, `<n>h`, or an ISO date marking the end. */
  durationOrEnd: string;
  section?: string;
}

const STATUS_TOKENS: Record<string, GanttItemStatus> = {
  done: 'done',
  active: 'active',
  crit: 'crit',
  milestone: 'milestone',
};

export function parseGantt(source: string): GanttDiagramIR {
  const lines = source.split('\n').map((l) => l.trim());
  const ir: GanttDiagramIR = { type: 'gantt', tasks: [] };
  const intermediates: GanttIntermediate[] = [];
  let currentSection: string | undefined;
  let anonCounter = 0;

  for (const line of lines) {
    if (!line || line.startsWith('%%')) continue;
    if (/^gantt\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const dateMatch = line.match(/^dateFormat\s+(.+)$/i);
    if (dateMatch) {
      ir.dateFormat = dateMatch[1].trim();
      continue;
    }
    const axisMatch = line.match(/^axisFormat\s+(.+)$/i);
    if (axisMatch) {
      ir.axisFormat = axisMatch[1].trim();
      continue;
    }
    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    // Skip directives we don't model
    if (/^(excludes|includes|todayMarker|click|tickInterval|weekday)\b/i.test(line)) continue;

    const taskMatch = line.match(GANTT_TASK_LINE_RE);
    if (!taskMatch) continue;
    const label = taskMatch[1].trim();
    const parts = taskMatch[2].split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    let status: GanttItemStatus = 'default';
    let id: string | undefined;
    let startSpec: string | undefined;
    let durationOrEnd: string | undefined;

    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower in STATUS_TOKENS) {
        status = STATUS_TOKENS[lower];
        continue;
      }
      if (id === undefined && /^[\w-]+$/.test(part) && !isDateLike(part) && !/^\d/.test(part)) {
        id = part;
        continue;
      }
      if (startSpec === undefined) {
        startSpec = part;
        continue;
      }
      if (durationOrEnd === undefined) {
        durationOrEnd = part;
        continue;
      }
    }
    if (!startSpec || !durationOrEnd) continue;
    intermediates.push({
      id: id ?? `__gantt_${anonCounter++}`,
      label,
      status,
      startSpec,
      durationOrEnd,
      section: currentSection,
    });
  }

  // Pass 2: resolve `after <id>` and durations into ISO start/end.
  const byId = new Map<string, GanttTask>();
  for (const it of intermediates) {
    const start = resolveGanttDate(it.startSpec, byId);
    if (!start) continue;
    let end = resolveGanttDate(it.durationOrEnd, byId);
    if (!end) {
      end = applyGanttDuration(start, it.durationOrEnd);
    }
    if (!end) continue;
    if (it.status === 'milestone') end = start;
    const task: GanttTask = {
      id: it.id,
      label: it.label,
      start: toIsoDay(start),
      end: toIsoDay(end),
      status: it.status,
      section: it.section,
    };
    ir.tasks.push(task);
    byId.set(it.id, task);
  }
  return ir;
}

function isDateLike(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(s);
}

function resolveGanttDate(spec: string, byId: Map<string, GanttTask>): Date | null {
  if (isDateLike(spec)) {
    const d = new Date(spec);
    return isNaN(d.getTime()) ? null : d;
  }
  const after = spec.match(/^after\s+(.+)$/i);
  if (after) {
    const refIds = after[1].split(/\s+/);
    let max: Date | null = null;
    for (const refId of refIds) {
      const ref = byId.get(refId);
      if (!ref) continue;
      const d = new Date(ref.end);
      if (!max || d.getTime() > max.getTime()) max = d;
    }
    return max;
  }
  return null;
}

function applyGanttDuration(start: Date, dur: string): Date | null {
  const m = dur.match(/^(\d+(?:\.\d+)?)\s*(d|h|w|m|y)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const result = new Date(start);
  switch (unit) {
    case 'h':
      result.setHours(result.getHours() + n);
      break;
    case 'd':
      result.setDate(result.getDate() + n);
      break;
    case 'w':
      result.setDate(result.getDate() + n * 7);
      break;
    case 'm':
      result.setMonth(result.getMonth() + n);
      break;
    case 'y':
      result.setFullYear(result.getFullYear() + n);
      break;
    default:
      return null;
  }
  return result;
}

function toIsoDay(d: Date): string {
  return d.toISOString();
}

// ── Timeline parser ──────────────────────────────────────────────────────
//   timeline
//     title History of Web
//     section Pre-2000
//       1989 : Tim Berners-Lee invents the Web
//       1993 : Mosaic browser
//     section 2000s
//       2003 : MySpace
//       2004 : Facebook : Gmail

export function parseTimeline(source: string): TimelineIR {
  const lines = source.split('\n');
  const ir: TimelineIR = { type: 'timeline', events: [] };
  let currentSection: string | undefined;
  let counter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) continue;
    if (/^timeline\b/i.test(line)) continue;
    const titleMatch = line.match(/^title\s+(.+)$/i);
    if (titleMatch) {
      ir.title = titleMatch[1].trim();
      continue;
    }
    const sectionMatch = line.match(/^section\s+(.+)$/i);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    // `period : event [: event2 : event3]`
    const parts = line.split(':').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const period = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const event: TimelineEvent = {
        id: `__tl_${counter++}`,
        period,
        text: parts[i],
        section: currentSection,
      };
      ir.events.push(event);
    }
  }
  return ir;
}

// ── Mindmap parser ───────────────────────────────────────────────────────
//   mindmap
//   root((Mindmap))
//     Origins
//       Long history
//       Popularisation
//         British popular psychology author Tony Buzan
//     Research
//       On effectiveness<br/>and features
//       On Automatic creation
//
// Uses leading-whitespace indentation to determine parent/child links.

const MINDMAP_SHAPE_PATTERNS: { re: RegExp; shape: MindmapShape }[] = [
  { re: /^([\w-]*)\(\(([^)]*)\)\)$/, shape: 'circle' }, // ((text))
  { re: /^([\w-]*)\)\)([^(]*)\(\($/, shape: 'bang' }, // ))text(( bang
  { re: /^([\w-]*)\)([^(]*)\($/, shape: 'cloud' }, // )text( cloud
  { re: /^([\w-]*)\{\{([^}]*)\}\}$/, shape: 'hexagon' }, // {{text}}
  { re: /^([\w-]*)\(([^)]*)\)$/, shape: 'rounded' }, // (text)
  { re: /^([\w-]*)\[([^\]]*)\]$/, shape: 'square' }, // [text]
];

interface RawMindmapLine {
  indent: number;
  raw: string;
}

export function parseMindmap(source: string): MindmapIR {
  const rawLines = source.split('\n');
  const stripped: RawMindmapLine[] = [];

  let inHeader = true;
  for (const line of rawLines) {
    if (line.trim().length === 0) continue;
    if (inHeader && /^\s*mindmap\b/i.test(line)) {
      inHeader = false;
      continue;
    }
    inHeader = false;
    if (line.trim().startsWith('%%')) continue;
    const indent = (line.match(/^\s*/)?.[0]?.length ?? 0);
    stripped.push({ indent, raw: line.trim() });
  }

  if (stripped.length === 0) {
    return {
      type: 'mindmap',
      root: { id: '__mm_0', label: 'Mindmap', shape: 'default', children: [] },
    };
  }

  let counter = 0;
  const makeNode = (raw: string): MindmapNode => {
    let label = raw;
    let shape: MindmapShape = 'default';
    let icon: string | undefined;

    // Strip `::icon(...)` suffix (mermaid icon syntax)
    const iconMatch = label.match(/^(.*?)\s*::icon\(([^)]+)\)\s*$/);
    if (iconMatch) {
      label = iconMatch[1].trim();
      icon = iconMatch[2].trim();
    }

    for (const { re, shape: s } of MINDMAP_SHAPE_PATTERNS) {
      const m = label.match(re);
      if (m) {
        label = m[2].trim() || m[1].trim();
        shape = s;
        break;
      }
    }
    const node: MindmapNode = {
      id: `__mm_${counter++}`,
      label,
      shape,
      children: [],
    };
    if (icon) node.icon = icon;
    return node;
  };

  // Build tree using indent levels. Root = first line's indent.
  const rootEntry = stripped[0];
  const root = makeNode(rootEntry.raw);
  const stack: { indent: number; node: MindmapNode }[] = [{ indent: rootEntry.indent, node: root }];

  for (let i = 1; i < stripped.length; i++) {
    const { indent, raw } = stripped[i];
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack.length > 0 ? stack[stack.length - 1].node : root;
    const node = makeNode(raw);
    parent.children.push(node);
    stack.push({ indent, node });
  }

  return { type: 'mindmap', root };
}
