import { useEffect, useMemo, useRef } from 'react';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import type { MindmapNode } from '../../utils/diagrams/types';
import { getDiagramTheme } from './shared/theme';
import { buildMindmapSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

type MindmapRendererProps = RendererProps<'mindmap'>;

interface PositionedNode {
  id: string;
  node: MindmapNode;
  x: number;
  y: number;
  depth: number;
}

function radialLayout(root: MindmapNode): { positioned: PositionedNode[]; bounds: { w: number; h: number } } {
  const positioned: PositionedNode[] = [];
  const RING_DISTANCE = 180;

  const place = (node: MindmapNode, depth: number, startAngle: number, endAngle: number) => {
    const angle = (startAngle + endAngle) / 2;
    const x = depth === 0 ? 0 : Math.cos(angle) * RING_DISTANCE * depth;
    const y = depth === 0 ? 0 : Math.sin(angle) * RING_DISTANCE * depth;
    positioned.push({ id: node.id, node, x, y, depth });
    if (node.children.length === 0) return;
    const span = endAngle - startAngle;
    const slice = span / node.children.length;
    for (let i = 0; i < node.children.length; i++) {
      place(node.children[i], depth + 1, startAngle + i * slice, startAngle + (i + 1) * slice);
    }
  };

  place(root, 0, 0, Math.PI * 2);

  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const p of positioned) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  for (const p of positioned) {
    p.x = p.x - minX + 200;
    p.y = p.y - minY + 100;
  }
  return { positioned, bounds: { w: maxX - minX + 400, h: maxY - minY + 200 } };
}

export default function MindmapRenderer({ ir, dark = false, handleRef }: MindmapRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const svg = useMemo(() => {
    const { positioned } = radialLayout(ir.root);
    const positions = new Map<string, { x: number; y: number; width: number; height: number; depth: number }>();
    for (const p of positioned) {
      const isRoot = p.depth === 0;
      const labelLen = p.node.label.length;
      const w = Math.max(isRoot ? 100 : 70, labelLen * (isRoot ? 9 : 7) + 40);
      const h = isRoot ? 44 : 32;
      positions.set(p.id, { x: p.x, y: p.y, width: w, height: h, depth: p.depth });
    }
    return buildMindmapSvg(ir, positions, { dark });
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
      className="mindmap-renderer"
      style={{ width: '100%', background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
