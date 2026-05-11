// Intermediate representation (IR) for diagrams.
//
// Renderers consume an IR and decide how to draw it. Parsers/builders produce
// an IR (today: from mermaid syntax via utils/diagrams/parser.ts; in the
// future: from any source — visual builder, programmatic API, JSON, etc.).
//
// The IR is intentionally renderer-agnostic. ReactFlow-based renderers and
// custom-SVG renderers must both be able to consume it. No DOM types here.

import type { ParsedSchema } from '../dbSchemaParser';

/** Category of node, used for visual styling (color, icon, shape). */
export type NodeKind =
  | 'service'
  | 'database'
  | 'queue'
  | 'storage'
  | 'user'
  | 'client'
  | 'external'
  | 'process'
  | 'decision'
  | 'start'
  | 'end'
  | 'icon' // a node whose primary identity IS the icon (cloud logo, etc.)
  | 'plain';

export interface NodeIR {
  /** Stable id used by edges to refer to this node. */
  id: string;
  /** Visible label. May contain markdown-ish bold/italic; renderers decide. */
  label: string;
  /** Visual category. Renderer maps this to shape/color/icon. */
  kind: NodeKind;
  /** Optional iconify-style ref (e.g. `logos:aws-rds`). When set, renderer
   *  shows the icon as the primary visual. */
  icon?: string;
  /** Optional subgraph this node belongs to. Maps to a cluster/group. */
  subgraph?: string;
  /** Free-form metadata for renderer-specific extensions. */
  meta?: Record<string, unknown>;
}

export type EdgeKind = 'solid' | 'dashed' | 'thick' | 'dotted' | 'invisible';
export type EdgeArrow = 'none' | 'arrow' | 'open' | 'cross' | 'circle' | 'biarrow';

export interface EdgeIR {
  /** Source node id. */
  source: string;
  /** Target node id. */
  target: string;
  /** Optional label rendered along the edge. */
  label?: string;
  /** Visual style of the edge. */
  kind?: EdgeKind;
  /** Arrow head style on each end. Default: source=none, target=arrow. */
  arrow?: { source?: EdgeArrow; target?: EdgeArrow };
}

export type FlowDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface SubgraphIR {
  id: string;
  label: string;
  /** Optional nested subgraphs. */
  subgraphs?: SubgraphIR[];
}

export interface FlowchartIR {
  type: 'flowchart';
  direction: FlowDirection;
  nodes: NodeIR[];
  edges: EdgeIR[];
  subgraphs?: SubgraphIR[];
}

/** ER diagrams reuse the existing ParsedSchema shape so DbSchemaFlow can
 *  consume the IR with zero conversion. */
export interface ERDiagramIR {
  type: 'er';
  schema: ParsedSchema;
}

// ── Chart-shaped diagram IRs (rendered with Recharts) ────────────────────

export interface PieSlice {
  label: string;
  value: number;
}
export interface PieChartIR {
  type: 'pie';
  title?: string;
  slices: PieSlice[];
  /** Whether the percentage label was opted-in via `pie showData`. */
  showData?: boolean;
}

export interface QuadrantPoint {
  label: string;
  /** Both in 0..1 range. */
  x: number;
  y: number;
}
export interface QuadrantChartIR {
  type: 'quadrant';
  title?: string;
  xAxisLabel?: { low: string; high: string };
  yAxisLabel?: { low: string; high: string };
  /** Quadrants in standard math order: 1=top-right, 2=top-left, 3=bottom-left, 4=bottom-right. */
  quadrantLabels?: { q1?: string; q2?: string; q3?: string; q4?: string };
  points: QuadrantPoint[];
}

export interface JourneyTask {
  label: string;
  score: number; // typically 1..7
  actors: string[];
}
export interface JourneySection {
  title: string;
  tasks: JourneyTask[];
}
export interface JourneyIR {
  type: 'journey';
  title?: string;
  sections: JourneySection[];
}

// ── Sequence diagram IR (custom React renderer) ──────────────────────────

export type SequenceArrow = 'sync' | 'reply' | 'async' | 'cross';

export interface SequenceParticipant {
  id: string;
  label: string;
}
export interface SequenceMessage {
  kind: 'message';
  from: string;
  to: string;
  arrow: SequenceArrow;
  label: string;
}
export interface SequenceNote {
  kind: 'note';
  /** Side relative to the participant(s) the note is anchored to. */
  side: 'left' | 'right' | 'over';
  participants: string[];
  text: string;
}
export type SequenceStep = SequenceMessage | SequenceNote;

export interface SequenceIR {
  type: 'sequence';
  title?: string;
  participants: SequenceParticipant[];
  steps: SequenceStep[];
}

/** Discriminated union of every native IR type the renderer registry knows
 *  how to draw. Other diagram types still fall through to the mermaid
 *  fallback path until a renderer is registered for them. */
// ── Class diagram IR (rendered with ReactFlow) ──────────────────────────

export type ClassMemberKind = 'attribute' | 'method';
export type ClassVisibility = 'public' | 'private' | 'protected' | 'package';

export interface ClassMember {
  kind: ClassMemberKind;
  visibility?: ClassVisibility;
  name: string;
  /** Type for attributes; return-or-empty for methods. */
  returnType?: string;
  /** Comma-separated parameter list (string for now; we don't model them). */
  parameters?: string;
}

export interface ClassNode {
  id: string;
  label: string;
  members: ClassMember[];
  /** Stereotype like `<<interface>>` or `<<abstract>>`. */
  stereotype?: string;
}

export type ClassRelationKind =
  | 'inheritance' // A <|-- B  (B extends A)
  | 'composition' // A *-- B
  | 'aggregation' // A o-- B
  | 'association' // A -- B
  | 'dependency' // A <.. B
  | 'realization'; // A <|.. B

export interface ClassRelation {
  source: string;
  target: string;
  kind: ClassRelationKind;
  label?: string;
}

export interface ClassDiagramIR {
  type: 'class';
  classes: ClassNode[];
  relations: ClassRelation[];
}

// ── State diagram IR (rendered with ReactFlow) ──────────────────────────

export interface StateNode {
  id: string;
  label: string;
  /** Special states: [*] start/end markers; `composite` wraps nested states. */
  kind: 'state' | 'start' | 'end' | 'choice' | 'composite';
  /** Parent composite-state id; top-level states have none. */
  parent?: string;
}

export interface StateTransition {
  source: string;
  target: string;
  /** Optional guard / event label. */
  label?: string;
  /** The composite (if any) this transition lives inside. */
  parent?: string;
}

export interface StateDiagramIR {
  type: 'state';
  states: StateNode[];
  transitions: StateTransition[];
}

// ── Gantt diagram IR (rendered with vis-timeline) ───────────────────────

export type GanttItemStatus = 'default' | 'active' | 'done' | 'crit' | 'milestone';

export interface GanttTask {
  id: string;
  label: string;
  /** ISO date string (YYYY-MM-DD or full ISO). */
  start: string;
  /** ISO date string (exclusive end). For milestones equals start. */
  end: string;
  status: GanttItemStatus;
  /** Group / section the task belongs to. */
  section?: string;
}

export interface GanttDiagramIR {
  type: 'gantt';
  title?: string;
  /** Original `dateFormat` directive — informational, parser already
   *  normalizes start/end to ISO. */
  dateFormat?: string;
  /** Optional axis format passed to the timeline renderer. */
  axisFormat?: string;
  tasks: GanttTask[];
}

// ── Timeline diagram IR (rendered with vis-timeline) ────────────────────

export interface TimelineEvent {
  id: string;
  /** Period label, e.g. "2003" / "Q1 2026" / "Day 1". */
  period: string;
  /** Free text describing the event(s) at this period. */
  text: string;
  /** Section this event belongs to, if any. */
  section?: string;
}

export interface TimelineIR {
  type: 'timeline';
  title?: string;
  events: TimelineEvent[];
}

// ── Mindmap diagram IR (rendered with ReactFlow radial) ─────────────────

export type MindmapShape = 'default' | 'square' | 'rounded' | 'circle' | 'cloud' | 'bang' | 'hexagon';

export interface MindmapNode {
  id: string;
  label: string;
  shape: MindmapShape;
  children: MindmapNode[];
  /** Optional iconify-style ref. */
  icon?: string;
}

export interface MindmapIR {
  type: 'mindmap';
  root: MindmapNode;
}

// ── Architecture-beta IR ────────────────────────────────────────────────
//
// Mirrors mermaid v11's architecture-beta syntax:
//   architecture-beta
//     group api(cloud)[API]
//     service db(database)[DB] in api
//     service web(server)[Web]
//     db:L --> R:web

export type ArchSide = 'L' | 'R' | 'T' | 'B';

export interface ArchitectureNode {
  id: string;
  label: string;
  kind: 'group' | 'service';
  /** Iconify-style ref (e.g. `logos:aws-rds`, `cloud`, `database`). */
  icon?: string;
  /** Parent group id when nested. */
  parent?: string;
}

export interface ArchitectureEdge {
  source: string;
  target: string;
  sourceSide?: ArchSide;
  targetSide?: ArchSide;
  label?: string;
}

export interface ArchitectureIR {
  type: 'architecture';
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

// ── C4 model IR ──────────────────────────────────────────────────────────
//
// Mirrors mermaid's C4 syntax. Variants C4Context / C4Container /
// C4Component / C4Deployment share the same node + relation primitives.

export type C4Variant = 'context' | 'container' | 'component' | 'deployment';
export type C4ElementKind =
  | 'person'
  | 'person-external'
  | 'system'
  | 'system-external'
  | 'system-db'
  | 'system-queue'
  | 'container'
  | 'container-external'
  | 'container-db'
  | 'container-queue'
  | 'component'
  | 'component-external'
  | 'component-db'
  | 'component-queue'
  | 'boundary'
  | 'system-boundary'
  | 'container-boundary'
  | 'enterprise-boundary'
  | 'node';

export interface C4Element {
  id: string;
  kind: C4ElementKind;
  label: string;
  technology?: string;
  description?: string;
  parent?: string;
}

export interface C4Relation {
  source: string;
  target: string;
  label?: string;
  technology?: string;
}

export interface C4IR {
  type: 'c4';
  variant: C4Variant;
  title?: string;
  elements: C4Element[];
  relations: C4Relation[];
}

// ── GitGraph IR ──────────────────────────────────────────────────────────
//
// Mirrors a subset of mermaid's gitGraph syntax. Each entry is a discrete
// operation that mutates the graph state at parse-time. The builder walks
// these to compute swim-lane positions.

export type GitGraphOp =
  | { kind: 'commit'; id?: string; type?: 'NORMAL' | 'REVERSE' | 'HIGHLIGHT'; tag?: string }
  | { kind: 'branch'; name: string }
  | { kind: 'checkout'; name: string }
  | { kind: 'merge'; from: string; tag?: string }
  | { kind: 'cherry-pick'; commitId: string };

export interface GitGraphIR {
  type: 'gitgraph';
  title?: string;
  ops: GitGraphOp[];
}

export type DiagramIR =
  | FlowchartIR
  | ERDiagramIR
  | PieChartIR
  | QuadrantChartIR
  | JourneyIR
  | SequenceIR
  | ClassDiagramIR
  | StateDiagramIR
  | GanttDiagramIR
  | TimelineIR
  | MindmapIR
  | ArchitectureIR
  | C4IR
  | GitGraphIR;

export type DiagramType = DiagramIR['type'];

/** Surface-level diagram-type label inferred from a mermaid source string.
 *  Includes types that have no native renderer yet (`'unsupported'`).
 *  Used by the registry to decide whether to dispatch native or fall back. */
export type RecognizedDiagramType =
  | DiagramType
  | 'sequence'
  | 'class'
  | 'state'
  | 'gantt'
  | 'pie'
  | 'quadrant'
  | 'mindmap'
  | 'gitgraph'
  | 'timeline'
  | 'journey'
  | 'c4'
  | 'architecture'
  | 'unsupported';

/** A successful parse: the inferred type plus (when supported natively) the
 *  IR. `ir === null` means "we recognized the type but don't have a native
 *  renderer; fall back to mermaid". */
export interface ParseSuccess {
  ok: true;
  type: RecognizedDiagramType;
  ir: DiagramIR | null;
}

export interface ParseFailure {
  ok: false;
  error: string;
  /** Original source preserved so the fallback renderer can still try. */
  source: string;
}

export type ParseResult = ParseSuccess | ParseFailure;
