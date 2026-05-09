import { useEffect, useMemo, useRef } from 'react';
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
import dagre from 'dagre';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import type { ClassRelationKind } from '../../utils/diagrams/types';
import { getDiagramTheme } from './shared/theme';
import { buildClassSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';
import ClassNodeComponent, { type ClassNodeData } from './shared/nodes/ClassNode';

const NODE_TYPES = { class: ClassNodeComponent };

type ClassRendererProps = RendererProps<'class'>;

function classBoxSize(memberCount: number) {
  return { width: 220, height: Math.max(64, 40 + memberCount * 18) };
}

function relationStyle(kind: ClassRelationKind, edgeColor: string): {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  markerEnd?: EdgeMarker;
} {
  const arrow: EdgeMarker = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: edgeColor };
  const open: EdgeMarker = { type: MarkerType.Arrow, width: 18, height: 18, color: edgeColor };
  switch (kind) {
    case 'inheritance':
      return { stroke: edgeColor, strokeWidth: 1.5, markerEnd: open };
    case 'realization':
      return { stroke: edgeColor, strokeWidth: 1.5, strokeDasharray: '6 4', markerEnd: open };
    case 'composition':
      return { stroke: edgeColor, strokeWidth: 1.8, markerEnd: arrow };
    case 'aggregation':
      return { stroke: edgeColor, strokeWidth: 1.5, markerEnd: open };
    case 'dependency':
      return { stroke: edgeColor, strokeWidth: 1.4, strokeDasharray: '4 4', markerEnd: arrow };
    case 'association':
    default:
      return { stroke: edgeColor, strokeWidth: 1.4 };
  }
}

export default function ClassRenderer({ ir, dark = false, handleRef }: ClassRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const { nodes, edges, canvasHeight, svgPositions } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80, marginx: 24, marginy: 24 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const cls of ir.classes) {
      g.setNode(cls.id, classBoxSize(cls.members.length));
    }
    for (const rel of ir.relations) {
      if (g.hasNode(rel.source) && g.hasNode(rel.target)) g.setEdge(rel.source, rel.target);
    }
    dagre.layout(g);

    const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
    const rfNodes: Node<ClassNodeData>[] = ir.classes.map((cls) => {
      const { x, y } = g.node(cls.id) as { x: number; y: number };
      const size = classBoxSize(cls.members.length);
      const px = x - size.width / 2;
      const py = y - size.height / 2;
      positions.set(cls.id, { x: px, y: py, width: size.width, height: size.height });
      return {
        id: cls.id,
        type: 'class',
        position: { x: px, y: py },
        data: { cls, dark },
        style: { background: 'transparent', border: 'none', padding: 0 },
        draggable: true,
      };
    });

    const rfEdges: Edge[] = ir.relations.map((rel, i) => {
      const style = relationStyle(rel.kind, theme.edgeColor);
      return {
        id: `${rel.source}->${rel.target}-${i}`,
        source: rel.source,
        target: rel.target,
        label: rel.label,
        type: 'smoothstep',
        style: { stroke: style.stroke, strokeWidth: style.strokeWidth, strokeDasharray: style.strokeDasharray },
        markerEnd: style.markerEnd,
        labelBgStyle: { fill: theme.edgeLabelBg, fillOpacity: 0.95 },
        labelStyle: { fill: theme.edgeLabel, fontSize: 11 },
      };
    });

    let maxBottom = 0;
    for (const n of rfNodes) {
      const cls = ir.classes.find((c) => c.id === n.id);
      maxBottom = Math.max(maxBottom, n.position.y + classBoxSize(cls?.members.length ?? 0).height);
    }
    return { nodes: rfNodes, edges: rfEdges, canvasHeight: Math.max(360, maxBottom + 60), svgPositions: positions };
  }, [ir, dark, theme]);

  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () => svgStringToElement(buildClassSvg(ir, svgPositions, { dark })),
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, ir, svgPositions, dark]);

  return (
    <div
      ref={containerRef}
      className="class-renderer"
      style={{ width: '100%', height: canvasHeight, background: theme.canvasBg, borderRadius: 12 }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
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
