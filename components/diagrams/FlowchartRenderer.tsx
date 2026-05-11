import { useEffect, useMemo, useRef } from 'react';
import { layoutFlowchart, type NodeSize } from '../../utils/diagrams/layout/dagreLayout';
import type { RendererProps, RendererHandle } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { buildFlowchartSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

// SVG-first rendering. The same builder produces both the on-screen view
// and the SVG/PNG download — guaranteed WYSIWYG by construction. Drops
// the ReactFlow runtime for flowcharts; dagre is still used for layout.

const NODE_SIZE = {
  circle: { width: 84, height: 84 },
  icon: { width: 100, height: 96 },
  subroutine: { width: 220, height: 64 },
} as const;

function rectSize(label: string): NodeSize {
  const width = Math.max(160, Math.min(320, label.length * 8 + 40));
  const lines = Math.max(1, Math.ceil(label.length / 24));
  return { width, height: 48 + (lines - 1) * 18 };
}

function diamondSize(label: string): NodeSize {
  return {
    width: Math.max(140, Math.min(280, label.length * 11 + 60)),
    height: Math.max(96, Math.min(160, Math.ceil(label.length / 16) * 32 + 64)),
  };
}

type FlowchartRendererProps = RendererProps<'flowchart'>;

export default function FlowchartRenderer({ ir, dark = false, handleRef }: FlowchartRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const svg = useMemo(() => {
    const sizes = new Map<string, NodeSize>();
    for (const n of ir.nodes) {
      if (n.kind === 'user' || n.kind === 'start' || n.kind === 'end') sizes.set(n.id, NODE_SIZE.circle);
      else if (n.kind === 'icon') sizes.set(n.id, NODE_SIZE.icon);
      else if (n.kind === 'decision') sizes.set(n.id, diamondSize(n.label));
      else if (n.kind === 'queue') sizes.set(n.id, NODE_SIZE.subroutine);
      else sizes.set(n.id, rectSize(n.label));
    }
    const layout = layoutFlowchart(ir, { nodeSizes: sizes });
    return buildFlowchartSvg(ir, layout.nodePositions, { dark });
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
      className="flowchart-renderer"
      style={{ width: '100%', background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
