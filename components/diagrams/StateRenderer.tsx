import { useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import type { StateDiagramIR, StateNode } from '../../utils/diagrams/types';
import { getDiagramTheme } from './shared/theme';
import { containerToSvg } from './shared/containerToSvg';

interface StateNodeData extends Record<string, unknown> {
  state: StateNode;
  dark: boolean;
}

interface CompositeNodeData extends Record<string, unknown> {
  state: StateNode;
  dark: boolean;
  width: number;
  height: number;
}

const HANDLE_STYLE = { background: 'transparent', border: 'none', width: 1, height: 1, opacity: 0 } as const;
const COMPOSITE_HEADER_HEIGHT = 32;
const COMPOSITE_PAD = 18;

function StateBox({ data }: { data: StateNodeData }) {
  const { state, dark } = data;
  const isMarker = state.kind === 'start' || state.kind === 'end';

  if (isMarker) {
    const fill = state.kind === 'start' ? (dark ? '#e2e8f0' : '#0f172a') : 'transparent';
    const border = dark ? '#e2e8f0' : '#0f172a';
    return (
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: fill,
          border: `2px solid ${border}`,
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {state.kind === 'end' && (
          <div
            style={{
              position: 'absolute',
              inset: 4,
              borderRadius: '50%',
              background: dark ? '#e2e8f0' : '#0f172a',
            }}
          />
        )}
        <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
        <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      </div>
    );
  }

  return (
    <div
      style={{
        background: dark ? '#1e293b' : '#ffffff',
        color: dark ? '#e2e8f0' : '#1e293b',
        border: `1.5px solid ${dark ? '#475569' : '#cbd5e1'}`,
        borderRadius: 14,
        padding: '10px 18px',
        fontSize: 13,
        fontWeight: 500,
        minWidth: 80,
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      {state.label || state.id}
    </div>
  );
}

function CompositeBox({ data }: { data: CompositeNodeData }) {
  const { state, dark, width, height } = data;
  return (
    <div
      style={{
        width,
        height,
        background: dark ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
        border: `1.5px solid ${dark ? '#475569' : '#cbd5e1'}`,
        borderRadius: 14,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      <div
        style={{
          height: COMPOSITE_HEADER_HEIGHT,
          padding: '0 16px',
          background: dark ? '#1e293b' : '#f1f5f9',
          borderBottom: `1px solid ${dark ? '#475569' : '#cbd5e1'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 600,
          fontSize: 13,
          color: dark ? '#e2e8f0' : '#1e293b',
        }}
      >
        {state.label || state.id}
      </div>
    </div>
  );
}

const NODE_TYPES = { state: StateBox, composite: CompositeBox };

type StateRendererProps = RendererProps<'state'>;

function stateNodeSize(state: StateNode): { width: number; height: number } {
  // Markers render at 24x24 visually but we reserve a wider footprint in
  // dagre so the [*]→state edge stays short and clearly attached, instead
  // of bending across other nodes' columns.
  if (state.kind === 'start' || state.kind === 'end') return { width: 80, height: 32 };
  const labelLen = (state.label || state.id).length;
  return { width: Math.max(96, labelLen * 9 + 40), height: 44 };
}

interface InnerLayout {
  width: number;
  height: number;
  /** Per-child position relative to the composite's top-left. */
  positions: Map<string, { x: number; y: number }>;
}

/** Lay out a composite's children with dagre and return the bounding box. */
function layoutComposite(
  parentId: string,
  ir: StateDiagramIR
): InnerLayout {
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

  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = 0;
  let maxBottom = 0;
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

  const { nodes, edges, canvasHeight } = useMemo(() => {
    // Pre-compute inner layout for each composite so we know its size.
    const compositeIds = ir.states.filter((s) => s.kind === 'composite').map((s) => s.id);
    const innerLayouts = new Map<string, InnerLayout>();
    for (const id of compositeIds) innerLayouts.set(id, layoutComposite(id, ir));

    // Outer dagre: top-level nodes (composites + non-composite parents=undefined).
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

    // Build ReactFlow nodes — composites first so children referencing
    // them via parentId resolve correctly.
    const rfNodes: Node[] = [];
    for (const s of topLevel) {
      const { x, y } = g.node(s.id) as { x: number; y: number };
      if (s.kind === 'composite') {
        const inner = innerLayouts.get(s.id)!;
        rfNodes.push({
          id: s.id,
          type: 'composite',
          position: { x: x - inner.width / 2, y: y - inner.height / 2 },
          data: { state: s, dark, width: inner.width, height: inner.height } as CompositeNodeData,
          style: { width: inner.width, height: inner.height, background: 'transparent', border: 'none', padding: 0 },
          draggable: true,
        });
      } else {
        const size = stateNodeSize(s);
        rfNodes.push({
          id: s.id,
          type: 'state',
          position: { x: x - size.width / 2, y: y - size.height / 2 },
          data: { state: s, dark } as StateNodeData,
          style: { background: 'transparent', border: 'none', padding: 0 },
          draggable: true,
        });
      }
    }
    // Children — positions are relative to the composite (handled by parentId).
    for (const compId of compositeIds) {
      const inner = innerLayouts.get(compId)!;
      const children = ir.states.filter((s) => s.parent === compId);
      for (const c of children) {
        const pos = inner.positions.get(c.id);
        if (!pos) continue;
        rfNodes.push({
          id: c.id,
          type: 'state',
          position: pos,
          parentId: compId,
          extent: 'parent',
          data: { state: c, dark } as StateNodeData,
          style: { background: 'transparent', border: 'none', padding: 0 },
          draggable: true,
        });
      }
    }

    const rfEdges: Edge[] = ir.transitions.map((t, i) => ({
      id: `${t.source}->${t.target}-${i}`,
      source: t.source,
      target: t.target,
      label: t.label,
      type: 'smoothstep',
      style: { stroke: theme.edgeColor, strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: theme.edgeColor },
      labelBgStyle: { fill: theme.edgeLabelBg, fillOpacity: 0.95 },
      labelStyle: { fill: theme.edgeLabel, fontSize: 11, fontWeight: 500 },
    }));

    let maxBottom = 0;
    for (const n of rfNodes) {
      if (n.parentId) continue;
      const h =
        n.type === 'composite'
          ? (n.data as CompositeNodeData).height
          : 80;
      maxBottom = Math.max(maxBottom, n.position.y + h);
    }
    return { nodes: rfNodes, edges: rfEdges, canvasHeight: Math.max(360, maxBottom + 60) };
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
      className="state-renderer"
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
