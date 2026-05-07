import { useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Icon } from '@iconify/react';

import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import type { MindmapNode, MindmapShape } from '../../utils/diagrams/types';
import { getDiagramTheme } from './shared/theme';
import { containerToSvg } from './shared/containerToSvg';

type MindmapRendererProps = RendererProps<'mindmap'>;

interface MindmapNodeData extends Record<string, unknown> {
  node: MindmapNode;
  depth: number;
  dark: boolean;
}

const HANDLE_STYLE = { background: 'transparent', border: 'none', width: 1, height: 1, opacity: 0 } as const;

const DEPTH_PALETTE_LIGHT: { bg: string; border: string; text: string }[] = [
  { bg: '#1e293b', border: '#0f172a', text: '#f8fafc' },
  { bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
  { bg: '#dcfce7', border: '#10b981', text: '#064e3b' },
  { bg: '#fef3c7', border: '#f59e0b', text: '#78350f' },
  { bg: '#fee2e2', border: '#f43f5e', text: '#881337' },
  { bg: '#ede9fe', border: '#8b5cf6', text: '#4c1d95' },
];

const DEPTH_PALETTE_DARK: { bg: string; border: string; text: string }[] = [
  { bg: '#e2e8f0', border: '#f8fafc', text: '#0f172a' },
  { bg: 'rgba(59,130,246,0.20)', border: '#60a5fa', text: '#bfdbfe' },
  { bg: 'rgba(16,185,129,0.20)', border: '#34d399', text: '#a7f3d0' },
  { bg: 'rgba(245,158,11,0.20)', border: '#fbbf24', text: '#fde68a' },
  { bg: 'rgba(244,63,94,0.20)', border: '#fb7185', text: '#fecdd3' },
  { bg: 'rgba(139,92,246,0.20)', border: '#a78bfa', text: '#ddd6fe' },
];

function shapeStyles(shape: MindmapShape): { borderRadius: string; clipPath?: string } {
  switch (shape) {
    case 'circle':
      return { borderRadius: '50%' };
    case 'rounded':
      return { borderRadius: '999px' };
    case 'square':
      return { borderRadius: '4px' };
    case 'cloud':
      return { borderRadius: '32px 8px 32px 8px' };
    case 'bang':
      return { borderRadius: '8px', clipPath: 'polygon(0% 8%, 12% 0%, 24% 8%, 36% 0%, 48% 8%, 60% 0%, 72% 8%, 84% 0%, 100% 8%, 92% 24%, 100% 40%, 92% 56%, 100% 72%, 92% 88%, 100% 100%, 84% 92%, 72% 100%, 60% 92%, 48% 100%, 36% 92%, 24% 100%, 12% 92%, 0% 100%, 8% 84%, 0% 68%, 8% 52%, 0% 36%, 8% 20%)' };
    case 'hexagon':
      return { borderRadius: '4px', clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
    case 'default':
    default:
      return { borderRadius: '12px' };
  }
}

function MindmapNodeComponent({ data }: { data: MindmapNodeData }) {
  const { node, depth, dark } = data;
  const palette = dark ? DEPTH_PALETTE_DARK : DEPTH_PALETTE_LIGHT;
  const colors = palette[Math.min(depth, palette.length - 1)];
  const styles = shapeStyles(node.shape);
  const isRoot = depth === 0;

  return (
    <div
      style={{
        background: colors.bg,
        color: colors.text,
        border: `2px solid ${colors.border}`,
        padding: isRoot ? '12px 20px' : '8px 14px',
        fontSize: isRoot ? 14 : 12,
        fontWeight: isRoot ? 700 : 500,
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        ...styles,
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      {node.icon && <Icon icon={node.icon} width={isRoot ? 18 : 14} height={isRoot ? 18 : 14} />}
      <span>{node.label}</span>
    </div>
  );
}

const NODE_TYPES = { mindmap: MindmapNodeComponent };

// ── Radial layout ───────────────────────────────────────────────────────
//
// Place root at origin. For each depth ring, divide the angular slice the
// node inherits from its parent equally among its children. Distance grows
// linearly with depth so deeper rings spread further out.

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
      const childStart = startAngle + i * slice;
      const childEnd = childStart + slice;
      place(node.children[i], depth + 1, childStart, childEnd);
    }
  };

  // Root spans the full circle so first-level children fan out around it.
  place(root, 0, 0, Math.PI * 2);

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const p of positioned) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX + 400;
  const h = maxY - minY + 200;
  // Shift so all coords are positive
  for (const p of positioned) {
    p.x = p.x - minX + 200;
    p.y = p.y - minY + 100;
  }
  return { positioned, bounds: { w, h } };
}

function collectEdges(node: MindmapNode, edges: { source: string; target: string }[]): void {
  for (const c of node.children) {
    edges.push({ source: node.id, target: c.id });
    collectEdges(c, edges);
  }
}

export default function MindmapRenderer({ ir, dark = false, handleRef }: MindmapRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const { nodes, edges, canvasHeight } = useMemo(() => {
    const { positioned, bounds } = radialLayout(ir.root);
    const rfNodes: Node<MindmapNodeData>[] = positioned.map((p) => ({
      id: p.id,
      type: 'mindmap',
      position: { x: p.x, y: p.y },
      data: { node: p.node, depth: p.depth, dark },
      style: { background: 'transparent', border: 'none', padding: 0 },
      draggable: true,
    }));

    const rawEdges: { source: string; target: string }[] = [];
    collectEdges(ir.root, rawEdges);
    const rfEdges: Edge[] = rawEdges.map((e, i) => ({
      id: `${e.source}->${e.target}-${i}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: { stroke: theme.edgeColor, strokeWidth: 1.5 },
    }));

    return { nodes: rfNodes, edges: rfEdges, canvasHeight: Math.max(420, bounds.h + 80) };
  }, [ir, dark, theme]);

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
      className="mindmap-renderer"
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
