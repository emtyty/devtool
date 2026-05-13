// Dagre-based DAG layout for FlowchartIR.
//
// Takes a FlowchartIR + per-node dimensions and returns absolute positions
// for every node. Renderer-agnostic — produces plain { x, y } coordinates.

import dagre from 'dagre';
import type { FlowchartIR, FlowDirection } from '../types';

export interface NodeSize {
  width: number;
  height: number;
}

export interface LayoutResult {
  /** Absolute top-left coordinates per node id. */
  nodePositions: Map<string, { x: number; y: number }>;
  /** Bounding box of the entire graph (post-padding). */
  width: number;
  height: number;
}

export interface DagreLayoutOptions {
  /** Default node size when not provided per-node. */
  defaultNodeSize?: NodeSize;
  /** Map of nodeId → { width, height }. Falls back to defaultNodeSize. */
  nodeSizes?: Map<string, NodeSize>;
  /** Spacing between sibling nodes in the same rank. Default: 60. */
  nodeSeparation?: number;
  /** Spacing between ranks. Default: 80. */
  rankSeparation?: number;
  /** Outer margin. Default: 24. */
  margin?: number;
}

const DAGRE_RANK_DIR: Record<FlowDirection, string> = {
  TB: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

export function layoutFlowchart(ir: FlowchartIR, options: DagreLayoutOptions = {}): LayoutResult {
  const defaultSize = options.defaultNodeSize ?? { width: 180, height: 60 };
  const nodeSizes = options.nodeSizes ?? new Map<string, NodeSize>();
  const nodeSep = options.nodeSeparation ?? 60;
  const rankSep = options.rankSeparation ?? 80;
  const margin = options.margin ?? 24;

  const g = new dagre.graphlib.Graph({ multigraph: true, compound: true });
  g.setGraph({
    rankdir: DAGRE_RANK_DIR[ir.direction],
    nodesep: nodeSep,
    ranksep: rankSep,
    marginx: margin,
    marginy: margin,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Subgraph parents (compound graph)
  const subgraphIds = new Set<string>();
  if (ir.subgraphs) {
    for (const sg of ir.subgraphs) {
      g.setNode(sg.id, { label: sg.label, clusterLabelPos: 'top' });
      subgraphIds.add(sg.id);
    }
  }

  // Nodes — also track one representative child per subgraph so that any
  // edges pointing at the subgraph itself can be redirected (dagre's
  // compound layout crashes with "rank undefined" on edges to a cluster).
  const representativeChild = new Map<string, string>();
  for (const node of ir.nodes) {
    const size = nodeSizes.get(node.id) ?? defaultSize;
    g.setNode(node.id, { ...size, label: node.label });
    if (node.subgraph) {
      g.setParent(node.id, node.subgraph);
      if (!representativeChild.has(node.subgraph)) {
        representativeChild.set(node.subgraph, node.id);
      }
    }
  }

  // Edges — redirect any endpoint that is itself a subgraph (cluster) to one
  // of its children. Drop the edge entirely if the cluster is empty.
  const resolveEndpoint = (id: string): string | null => {
    if (!subgraphIds.has(id)) return id;
    return representativeChild.get(id) ?? null;
  };
  for (const edge of ir.edges) {
    const source = resolveEndpoint(edge.source);
    const target = resolveEndpoint(edge.target);
    if (!source || !target) continue;
    if (!g.hasNode(source) || !g.hasNode(target)) continue;
    g.setEdge(source, target, edge.label ? { label: edge.label } : {});
  }

  dagre.layout(g);

  const nodePositions = new Map<string, { x: number; y: number }>();
  let maxX = 0;
  let maxY = 0;
  for (const node of ir.nodes) {
    const { x, y } = g.node(node.id) as { x: number; y: number };
    const size = nodeSizes.get(node.id) ?? defaultSize;
    // dagre returns the CENTER of the node — convert to top-left
    const topLeft = { x: x - size.width / 2, y: y - size.height / 2 };
    nodePositions.set(node.id, topLeft);
    maxX = Math.max(maxX, topLeft.x + size.width);
    maxY = Math.max(maxY, topLeft.y + size.height);
  }

  return {
    nodePositions,
    width: maxX + margin,
    height: maxY + margin,
  };
}
