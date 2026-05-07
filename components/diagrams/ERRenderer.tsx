import { useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import TableNode, {
  TABLE_HEADER_HEIGHT,
  TABLE_NODE_WIDTH,
  TABLE_ROW_HEIGHT,
  type TableNodeData,
} from './shared/nodes/TableNode';
import { getDiagramTheme } from './shared/theme';
import { containerToSvg } from './shared/containerToSvg';

const NODE_TYPES = { table: TableNode };

type ERRendererProps = RendererProps<'er'>;

export default function ERRenderer({ ir, dark = false, handleRef }: ERRendererProps) {
  const theme = getDiagramTheme(dark);
  const { nodes, edges, canvasHeight } = useMemo(() => {
    return buildLayout(ir.schema, dark, theme.edgeColor);
  }, [ir, dark, theme.edgeColor]);

  const containerRef = useRef<HTMLDivElement>(null);

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
      className="er-renderer"
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

// Lay out tables left-to-right with dagre, then build ReactFlow nodes/edges.
function buildLayout(
  schema: { tables: { name: string; columns: { name: string }[] }[]; relations: { fromTable: string; fromCol: string; toTable: string; toCol: string }[] },
  dark: boolean,
  edgeColor: string
) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const tableHeight = (cols: number) => TABLE_HEADER_HEIGHT + cols * TABLE_ROW_HEIGHT;

  for (const table of schema.tables) {
    g.setNode(table.name, { width: TABLE_NODE_WIDTH, height: tableHeight(table.columns.length) });
  }
  for (const rel of schema.relations) {
    if (g.hasNode(rel.fromTable) && g.hasNode(rel.toTable)) {
      g.setEdge(rel.fromTable, rel.toTable);
    }
  }
  dagre.layout(g);

  const nodes: Node<TableNodeData>[] = schema.tables.map((table) => {
    const { x, y } = g.node(table.name) as { x: number; y: number };
    const h = tableHeight(table.columns.length);
    return {
      id: table.name,
      type: 'table',
      position: { x: x - TABLE_NODE_WIDTH / 2, y: y - h / 2 },
      data: { table: table as TableNodeData['table'], dark },
      style: { background: 'transparent', border: 'none', padding: 0, width: TABLE_NODE_WIDTH },
      draggable: true,
    };
  });

  // For mermaid-sourced ER diagrams the parser may set fromCol/toCol to a
  // synthetic placeholder (the relation label) when no real FK column is
  // declared. Only attach per-column handles when the column actually exists
  // on the table; otherwise let ReactFlow use the table-level default.
  const tableColumns = new Map<string, Set<string>>();
  for (const t of schema.tables) {
    tableColumns.set(t.name, new Set(t.columns.map((c) => c.name)));
  }
  const hasColumn = (table: string, col: string) => tableColumns.get(table)?.has(col) ?? false;

  const seenEdges = new Set<string>();
  const edges: Edge[] = [];
  for (const rel of schema.relations) {
    const key = `${rel.fromTable}.${rel.fromCol}->${rel.toTable}.${rel.toCol}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    const useSourceHandle = hasColumn(rel.fromTable, rel.fromCol);
    const useTargetHandle = hasColumn(rel.toTable, rel.toCol);
    const edge: Edge = {
      id: key,
      source: rel.fromTable,
      target: rel.toTable,
      type: 'smoothstep',
      style: {
        stroke: edgeColor,
        strokeWidth: 1.4,
        strokeDasharray: '5 4',
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: edgeColor,
      },
      label: useSourceHandle ? 'FK' : rel.fromCol,
      labelStyle: { fill: dark ? '#94a3b8' : '#64748b', fontSize: 10, fontStyle: 'italic' },
      labelBgStyle: { fill: dark ? '#0f172a' : '#ffffff', fillOpacity: 0.9 },
    };
    edge.sourceHandle = useSourceHandle ? `${rel.fromCol}.source` : '__table.source';
    edge.targetHandle = useTargetHandle ? `${rel.toCol}.target` : '__table.target';
    edges.push(edge);
  }

  // Bounding box height
  let maxBottom = 0;
  for (const n of nodes) maxBottom = Math.max(maxBottom, n.position.y + tableHeight(schema.tables.find((t) => t.name === n.id)!.columns.length));
  return { nodes, edges, canvasHeight: Math.max(360, maxBottom + 60) };
}
