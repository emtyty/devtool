// Pure utility — no React imports

export type NodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface DiagramNode {
  id: string;
  label: string;
  kind: NodeKind;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  children: DiagramNode[];
  primitiveEntries: { key: string; value: unknown }[];
  parentId: string | null;
  defaultCollapsed: boolean;
}

export interface DiagramEdge {
  fromId: string;
  toId: string;
  path: string; // SVG path string (cubic bezier)
  color: string;
}

export interface DiagramLayout {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  totalWidth: number;
  totalHeight: number;
  nodeMap: Map<string, DiagramNode>;
}

// Layout constants
const NODE_WIDTH = 260;
const NODE_HEADER_H = 36;
const PRIMITIVE_ROW_H = 22;
const MAX_VISIBLE_ENTRIES = 8;
const NODE_V_GAP = 18;
const NODE_H_GAP = 80;
const EDGE_COLORS = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#e11d48', '#6366f1'];

function nodeHeight(primitiveEntries: { key: string; value: unknown }[]): number {
  return NODE_HEADER_H + Math.min(primitiveEntries.length, MAX_VISIBLE_ENTRIES) * PRIMITIVE_ROW_H + 12;
}

function getKind(value: unknown): NodeKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'object') return 'object';
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'null';
}

function buildTree(
  value: unknown,
  id: string,
  label: string,
  depth: number,
  parentId: string | null,
): DiagramNode {
  const kind = getKind(value);

  if (kind === 'array') {
    const arr = value as unknown[];
    const primitiveEntries: { key: string; value: unknown }[] = [];
    const children: DiagramNode[] = [];

    arr.forEach((item, i) => {
      const itemKind = getKind(item);
      if (itemKind === 'object' || itemKind === 'array') {
        children.push(buildTree(item, `${id}[${i}]`, `[${i}]`, depth + 1, id));
      } else {
        primitiveEntries.push({ key: `[${i}]`, value: item });
      }
    });

    const height = nodeHeight(primitiveEntries);
    return {
      id,
      label,
      kind,
      depth,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height,
      children,
      primitiveEntries,
      parentId,
      defaultCollapsed: false,
    };
  }

  if (kind === 'object') {
    const obj = value as Record<string, unknown>;
    const primitiveEntries: { key: string; value: unknown }[] = [];
    const children: DiagramNode[] = [];

    Object.entries(obj).forEach(([k, v]) => {
      const vKind = getKind(v);
      if (vKind === 'object' || vKind === 'array') {
        children.push(buildTree(v, `${id}.${k}`, k, depth + 1, id));
      } else {
        primitiveEntries.push({ key: k, value: v });
      }
    });

    const height = nodeHeight(primitiveEntries);
    return {
      id,
      label,
      kind,
      depth,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height,
      children,
      primitiveEntries,
      parentId,
      defaultCollapsed: false,
    };
  }

  // Primitive root
  const primitiveEntries = [{ key: '', value }];
  const height = nodeHeight(primitiveEntries);
  return {
    id,
    label,
    kind,
    depth,
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height,
    children: [],
    primitiveEntries,
    parentId,
    defaultCollapsed: false,
  };
}

function computeSubtreeHeight(node: DiagramNode, collapsedIds: Set<string>): number {
  const isCollapsed = collapsedIds.has(node.id);
  if (isCollapsed || node.children.length === 0) {
    return node.height;
  }
  const childHeights = node.children.map(c => computeSubtreeHeight(c, collapsedIds));
  return childHeights.reduce((sum, h) => sum + h, 0) + (node.children.length - 1) * NODE_V_GAP;
}

function computeLayout(
  node: DiagramNode,
  collapsedIds: Set<string>,
  top: number,
): number {
  const subtreeH = computeSubtreeHeight(node, collapsedIds);

  // Center the node in its allocated vertical space
  node.x = node.depth * (NODE_WIDTH + NODE_H_GAP);
  node.y = top + (subtreeH - node.height) / 2;

  const isCollapsed = collapsedIds.has(node.id);
  if (!isCollapsed && node.children.length > 0) {
    let childTop = top;
    for (const child of node.children) {
      const childSubtreeH = computeSubtreeHeight(child, collapsedIds);
      computeLayout(child, collapsedIds, childTop);
      childTop += childSubtreeH + NODE_V_GAP;
    }
  }

  return subtreeH;
}

function collectVisibleNodes(
  node: DiagramNode,
  collapsedIds: Set<string>,
  result: DiagramNode[],
): void {
  result.push(node);
  if (!collapsedIds.has(node.id)) {
    for (const child of node.children) {
      collectVisibleNodes(child, collapsedIds, result);
    }
  }
}

function shiftDepths(node: DiagramNode, delta: number): void {
  node.depth += delta;
  for (const child of node.children) {
    shiftDepths(child, delta);
  }
}

export function buildDiagramLayout(data: unknown, collapsedIds?: Set<string>): DiagramLayout {
  const collapsed = collapsedIds ?? new Set<string>();

  const root = buildTree(data, 'root', 'root', 0, null);

  // Skip the root wrapper node when it has children — promote children to depth 0
  let topNodes: DiagramNode[];
  if (root.children.length > 0 && root.primitiveEntries.length === 0) {
    topNodes = root.children;
    topNodes.forEach(n => {
      n.parentId = null;
      shiftDepths(n, -1);
    });
  } else {
    topNodes = [root];
  }

  // Layout all top-level nodes stacked vertically
  let top = 0;
  for (const topNode of topNodes) {
    const subtreeH = computeSubtreeHeight(topNode, collapsed);
    computeLayout(topNode, collapsed, top);
    top += subtreeH + NODE_V_GAP;
  }

  const nodes: DiagramNode[] = [];
  for (const topNode of topNodes) {
    collectVisibleNodes(topNode, collapsed, nodes);
  }

  const nodeMap = new Map<string, DiagramNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  const edges: DiagramEdge[] = [];
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const parent = nodeMap.get(node.parentId);
    if (!parent) continue;

    const px = parent.x + NODE_WIDTH;
    const py = parent.y + parent.height / 2;
    const cx = node.x;
    const cy = node.y + node.height / 2;

    const path = `M ${px} ${py} C ${px + NODE_H_GAP / 2} ${py} ${cx - NODE_H_GAP / 2} ${cy} ${cx} ${cy}`;
    const color = EDGE_COLORS[parent.depth % EDGE_COLORS.length];

    edges.push({ fromId: parent.id, toId: node.id, path, color });
  }

  let totalWidth = 0;
  let totalHeight = 0;
  for (const n of nodes) {
    totalWidth = Math.max(totalWidth, n.x + n.width);
    totalHeight = Math.max(totalHeight, n.y + n.height);
  }

  return { nodes, edges, totalWidth, totalHeight, nodeMap };
}
