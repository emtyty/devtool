// Diagram-renderer registry.
//
// Maps each `DiagramType` to a lazy-loadable renderer factory. The dispatch
// component (<DiagramRenderer/>) looks up the renderer for the parsed IR
// and falls through to mermaid if none is registered.
//
// React types are imported `type`-only so this module stays free of React
// at runtime — registry consumers just shuttle data, not JSX. Renderer
// implementations live alongside the React tree in components/diagrams/.

import type { ComponentType, RefObject } from 'react';
import type {
  ArchitectureIR,
  C4IR,
  ClassDiagramIR,
  DiagramIR,
  DiagramType,
  ERDiagramIR,
  FlowchartIR,
  GanttDiagramIR,
  GitGraphIR,
  JourneyIR,
  MindmapIR,
  PieChartIR,
  QuadrantChartIR,
  SequenceIR,
  StateDiagramIR,
  TimelineIR,
} from './types';

/** What every renderer exposes via a forwarded ref so the export pipeline
 *  can serialize the diagram to SVG/PNG without knowing the renderer's
 *  internals. */
export interface RendererHandle {
  /** Returns an SVG element representing the diagram. For renderers that
   *  produce a single inclusive <svg> (Sequence, Recharts, mermaid fallback)
   *  this is the live element; for renderers that mix HTML + SVG (ReactFlow,
   *  vis-timeline) it's a synthetic <svg> wrapping the HTML as foreignObject. */
  getSvgElement(): SVGSVGElement | null;
  /** Optional HTML container reference, used by the export pipeline as a
   *  more reliable source for PNG rasterization (canvas + foreignObject is
   *  unreliable across browsers). */
  getHtmlContainer?(): HTMLElement | null;
}

/** Narrow DiagramIR to the IR variant a particular renderer accepts. */
export type IRForType<T extends DiagramType> = T extends 'flowchart'
  ? FlowchartIR
  : T extends 'er'
    ? ERDiagramIR
    : T extends 'pie'
      ? PieChartIR
      : T extends 'quadrant'
        ? QuadrantChartIR
        : T extends 'journey'
          ? JourneyIR
          : T extends 'sequence'
            ? SequenceIR
            : T extends 'class'
              ? ClassDiagramIR
              : T extends 'state'
                ? StateDiagramIR
                : T extends 'gantt'
                  ? GanttDiagramIR
                  : T extends 'timeline'
                    ? TimelineIR
                    : T extends 'mindmap'
                      ? MindmapIR
                      : T extends 'architecture'
                        ? ArchitectureIR
                        : T extends 'c4'
                          ? C4IR
                          : T extends 'gitgraph'
                            ? GitGraphIR
                            : DiagramIR;

export interface RendererProps<T extends DiagramType = DiagramType> {
  ir: IRForType<T>;
  /** Dark-mode flag; renderers honor it for color tokens. */
  dark?: boolean;
  /** Ref the renderer will populate with a RendererHandle on mount. */
  handleRef?: RefObject<RendererHandle | null>;
}

export interface RendererEntry<T extends DiagramType = DiagramType> {
  type: T;
  /** Lazy loader — only resolved when an IR of this type needs to render. */
  loader: () => Promise<{ default: ComponentType<RendererProps<T>> }>;
}

const REGISTRY = new Map<DiagramType, RendererEntry>();

export function register<T extends DiagramType>(entry: RendererEntry<T>): void {
  REGISTRY.set(entry.type, entry as RendererEntry);
}

export function getRenderer(type: DiagramType): RendererEntry | null {
  return REGISTRY.get(type) ?? null;
}

export function hasRenderer(type: DiagramType): boolean {
  return REGISTRY.has(type);
}

/** Reset the registry. Test-only. */
export function _resetRegistry(): void {
  REGISTRY.clear();
}
