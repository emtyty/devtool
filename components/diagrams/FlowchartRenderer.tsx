import { useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
  type EdgeMarker,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutFlowchart } from '../../utils/diagrams/layout/dagreLayout';
import type { RendererProps, RendererHandle } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { containerToSvg } from './shared/containerToSvg';
import FlowNode, { type FlowNodeData } from './shared/nodes/FlowNode';

const NODE_TYPES = { flow: FlowNode };

// Per-NodeKind sizes — kept in sync with FlowNode's actual rendering so dagre
// reserves the right amount of space and longer labels don't get clipped.
const NODE_SIZE = {
  circle: { width: 84, height: 84 },
  icon: { width: 100, height: 96 },
  subroutine: { width: 220, height: 64 },
} as const;

function rectSize(label: string): { width: number; height: number } {
  // Width grows with label length, capped so long sentences wrap at ~3 lines.
  const width = Math.max(160, Math.min(320, label.length * 8 + 40));
  const lines = Math.max(1, Math.ceil(label.length / 24));
  const height = 48 + (lines - 1) * 18;
  return { width, height };
}

function diamondSize(label: string): { width: number; height: number } {
  const width = Math.max(140, Math.min(280, label.length * 11 + 60));
  const height = Math.max(96, Math.min(160, Math.ceil(label.length / 16) * 32 + 64));
  return { width, height };
}

type FlowchartRendererProps = RendererProps<'flowchart'>;

export default function FlowchartRenderer({ ir, dark = false, handleRef }: FlowchartRendererProps) {
  const theme = getDiagramTheme(dark);

  const { nodes, edges, canvasHeight } = useMemo(() => {
    // Compute per-node dimensions based on kind (so dagre doesn't overlap shapes)
    const sizes = new Map<string, { width: number; height: number }>();
    for (const n of ir.nodes) {
      if (n.kind === 'user' || n.kind === 'start' || n.kind === 'end') sizes.set(n.id, NODE_SIZE.circle);
      else if (n.kind === 'icon') sizes.set(n.id, NODE_SIZE.icon);
      else if (n.kind === 'decision') sizes.set(n.id, diamondSize(n.label));
      else if (n.kind === 'queue') sizes.set(n.id, NODE_SIZE.subroutine);
      else sizes.set(n.id, rectSize(n.label));
    }
    const layout = layoutFlowchart(ir, { nodeSizes: sizes });

    const rfNodes: Node<FlowNodeData>[] = ir.nodes.map((node) => {
      const pos = layout.nodePositions.get(node.id) ?? { x: 0, y: 0 };
      return {
        id: node.id,
        type: 'flow',
        position: pos,
        data: { ir: node, dark },
        // Hide ReactFlow's default node frame (we render our own shape)
        style: { background: 'transparent', border: 'none', padding: 0 },
        draggable: true,
      };
    });

    const rfEdges: Edge[] = ir.edges.map((edge, i) => {
      const marker: EdgeMarker = {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: theme.edgeColor,
      };
      return {
        id: `${edge.source}->${edge.target}-${i}`,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'smoothstep',
        animated: edge.kind === 'dashed',
        style: {
          stroke: theme.edgeColor,
          strokeWidth: edge.kind === 'thick' ? 2.5 : 1.5,
          strokeDasharray: edge.kind === 'dashed' ? '6 4' : edge.kind === 'dotted' ? '2 3' : undefined,
        },
        markerEnd: marker,
        labelBgStyle: {
          fill: theme.edgeLabelBg,
          fillOpacity: 0.95,
        },
        labelStyle: {
          fill: theme.edgeLabel,
          fontSize: 11,
          fontWeight: 500,
        },
      };
    });

    return {
      nodes: rfNodes,
      edges: rfEdges,
      canvasHeight: Math.max(360, layout.height + 40),
    };
  }, [ir, dark, theme]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Expose the underlying <svg> element to the centralized export pipeline.
  // ReactFlow renders its edges into an SVG inside the container; we surface
  // that element so DiagramExportToolbar can serialize it.
  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () => containerToSvg(containerRef.current, { backgroundColor: theme.canvasBg }),
      getHtmlContainer: () => containerRef.current,
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, nodes, edges, theme.canvasBg]);

  return (
    <div
      ref={containerRef}
      className="flowchart-renderer"
      style={{
        width: '100%',
        height: canvasHeight,
        background: theme.canvasBg,
        borderRadius: 12,
      }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          panOnScroll
          zoomOnScroll
          zoomOnPinch
          minZoom={0.2}
          maxZoom={2.5}
        >
          <Background gap={24} color={dark ? '#1e293b' : '#e2e8f0'} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
