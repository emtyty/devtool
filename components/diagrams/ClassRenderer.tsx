import { useEffect, useMemo, useRef } from 'react';
import dagre from 'dagre';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { buildClassSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

type ClassRendererProps = RendererProps<'class'>;

function classBoxSize(memberCount: number) {
  return { width: 220, height: Math.max(64, 40 + memberCount * 18) };
}

export default function ClassRenderer({ ir, dark = false, handleRef }: ClassRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const svg = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80, marginx: 24, marginy: 24 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const cls of ir.classes) g.setNode(cls.id, classBoxSize(cls.members.length));
    for (const rel of ir.relations) {
      if (g.hasNode(rel.source) && g.hasNode(rel.target)) g.setEdge(rel.source, rel.target);
    }
    dagre.layout(g);

    const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const cls of ir.classes) {
      const { x, y } = g.node(cls.id) as { x: number; y: number };
      const size = classBoxSize(cls.members.length);
      positions.set(cls.id, { x: x - size.width / 2, y: y - size.height / 2, width: size.width, height: size.height });
    }
    return buildClassSvg(ir, positions, { dark });
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
      className="class-renderer"
      style={{ width: '100%', background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
