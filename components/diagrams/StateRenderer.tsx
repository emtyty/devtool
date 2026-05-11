import { useEffect, useMemo, useRef } from 'react';
import dagre from 'dagre';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import type { StateDiagramIR, StateNode } from '../../utils/diagrams/types';
import { getDiagramTheme } from './shared/theme';
import { buildStateSvg, svgStringToElement, type StateBuildPositions } from '../../utils/diagrams/svgBuilders';

type StateRendererProps = RendererProps<'state'>;

const COMPOSITE_HEADER_HEIGHT = 32;
const COMPOSITE_PAD = 18;

function stateNodeSize(s: StateNode): { width: number; height: number } {
  if (s.kind === 'start' || s.kind === 'end') return { width: 80, height: 32 };
  const len = (s.label || s.id).length;
  return { width: Math.max(96, len * 9 + 40), height: 44 };
}

interface InnerLayout {
  width: number;
  height: number;
  /** Per-child position relative to the composite top-left. */
  positions: Map<string, { x: number; y: number }>;
}

function layoutComposite(parentId: string, ir: StateDiagramIR): InnerLayout {
  const children = ir.states.filter((s) => s.parent === parentId);
  if (children.length === 0) {
    return { width: 200, height: COMPOSITE_HEADER_HEIGHT + 60, positions: new Map() };
  }
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 70, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const c of children) g.setNode(c.id, stateNodeSize(c));
  for (const t of ir.transitions) {
    if (t.parent !== parentId) continue;
    if (g.hasNode(t.source) && g.hasNode(t.target)) g.setEdge(t.source, t.target);
  }
  dagre.layout(g);

  let minLeft = Infinity, minTop = Infinity, maxRight = 0, maxBottom = 0;
  const tmp = new Map<string, { x: number; y: number }>();
  for (const c of children) {
    const { x, y } = g.node(c.id) as { x: number; y: number };
    const sz = stateNodeSize(c);
    const left = x - sz.width / 2;
    const top = y - sz.height / 2;
    tmp.set(c.id, { x: left, y: top });
    minLeft = Math.min(minLeft, left);
    minTop = Math.min(minTop, top);
    maxRight = Math.max(maxRight, left + sz.width);
    maxBottom = Math.max(maxBottom, top + sz.height);
  }

  // Translate so children start at (PAD, HEADER + PAD) inside the composite.
  const dx = COMPOSITE_PAD - minLeft;
  const dy = COMPOSITE_HEADER_HEIGHT + COMPOSITE_PAD - minTop;
  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, p] of tmp) positions.set(id, { x: p.x + dx, y: p.y + dy });

  return {
    width: maxRight - minLeft + COMPOSITE_PAD * 2,
    height: maxBottom - minTop + COMPOSITE_HEADER_HEIGHT + COMPOSITE_PAD * 2,
    positions,
  };
}

export default function StateRenderer({ ir, dark = false, handleRef }: StateRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const svg = useMemo(() => {
    const compositeIds = ir.states.filter((s) => s.kind === 'composite').map((s) => s.id);
    const innerLayouts = new Map<string, InnerLayout>();
    for (const id of compositeIds) innerLayouts.set(id, layoutComposite(id, ir));

    const buildPositions: StateBuildPositions = { topLevel: new Map(), children: new Map() };

    const topLevel = ir.states.filter((s) => !s.parent);
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 90, marginx: 32, marginy: 32 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const s of topLevel) {
      if (s.kind === 'composite') {
        const inner = innerLayouts.get(s.id)!;
        g.setNode(s.id, { width: inner.width, height: inner.height });
      } else {
        g.setNode(s.id, stateNodeSize(s));
      }
    }
    for (const t of ir.transitions) {
      if (t.parent) continue;
      if (g.hasNode(t.source) && g.hasNode(t.target)) g.setEdge(t.source, t.target);
    }
    dagre.layout(g);

    for (const s of topLevel) {
      const { x, y } = g.node(s.id) as { x: number; y: number };
      if (s.kind === 'composite') {
        const inner = innerLayouts.get(s.id)!;
        buildPositions.topLevel.set(s.id, {
          x: x - inner.width / 2,
          y: y - inner.height / 2,
          width: inner.width,
          height: inner.height,
        });
      } else {
        const size = stateNodeSize(s);
        buildPositions.topLevel.set(s.id, {
          x: x - size.width / 2,
          y: y - size.height / 2,
          width: size.width,
          height: size.height,
        });
      }
    }
    for (const compId of compositeIds) {
      const inner = innerLayouts.get(compId)!;
      const children = ir.states.filter((s) => s.parent === compId);
      for (const c of children) {
        const pos = inner.positions.get(c.id);
        if (!pos) continue;
        const size = stateNodeSize(c);
        buildPositions.children.set(c.id, {
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
          parent: compId,
        });
      }
    }

    return buildStateSvg(ir, buildPositions, { dark });
  }, [ir, dark]);

  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () => svgStringToElement(svg),
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);

  return (
    <div
      ref={containerRef}
      className="state-renderer"
      style={{ width: '100%', background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
