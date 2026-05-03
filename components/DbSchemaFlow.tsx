import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Panel,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import { Key, Link2, Download, Image as ImageIcon, Check } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { DbColumn, DbTable, ParsedSchema } from '../utils/dbSchemaParser';

const NODE_WIDTH = 240;
const ROW_HEIGHT = 26;
const HEADER_HEIGHT = 34;
const COL_GAP = 120;
const ROW_GAP = 60;

const COLOR_PK = '#d97706';
const COLOR_FK = '#0284c7';
const COLOR_REGULAR = '#475569';
const COLOR_TYPE = '#94a3b8';
const COLOR_HEADER = '#1e293b';
const COLOR_BORDER = '#e2e8f0';
const COLOR_DIVIDER = '#f1f5f9';
const COLOR_EDGE = '#a5b4fc';
const COLOR_FK_LABEL = '#94a3b8';

const HANDLE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 1,
  height: 1,
  opacity: 0,
};

type TableNodeData = { table: DbTable };

function renderColumn(col: DbColumn, idx: number) {
  const nameColor = col.isPK
    ? 'text-amber-600 dark:text-amber-400 font-semibold'
    : col.isFK
      ? 'text-sky-600 dark:text-sky-400'
      : 'text-slate-700 dark:text-slate-300';

  const divider = idx > 0 ? 'border-t border-slate-100 dark:border-slate-800' : '';

  return (
    <div
      key={col.name}
      className={`relative px-3 flex items-center justify-between gap-2 text-[11px] font-mono bg-white dark:bg-slate-900 ${divider}`}
      style={{ height: ROW_HEIGHT }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id={`${col.name}.target`}
        style={HANDLE_STYLE}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={`${col.name}.source`}
        style={HANDLE_STYLE}
      />
      <div className="flex items-center gap-2 min-w-0">
        {col.isPK ? (
          <Key size={11} className="text-amber-500 flex-shrink-0" strokeWidth={2.5} />
        ) : col.isFK ? (
          <Link2 size={11} className="text-sky-500 flex-shrink-0" strokeWidth={2.2} />
        ) : (
          <span className="text-slate-300 dark:text-slate-600 flex-shrink-0 text-sm leading-none">
            ·
          </span>
        )}
        <span className={`truncate ${nameColor}`}>{col.name}</span>
      </div>
      <span className="text-slate-400 dark:text-slate-500 text-[10px] flex-shrink-0">
        {col.type}
      </span>
    </div>
  );
}

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const { table } = data;
  return (
    <div
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm overflow-hidden"
      style={{ width: NODE_WIDTH }}
    >
      <div
        className="px-3 border-b border-slate-200 dark:border-slate-700 font-mono text-[12px] font-semibold text-slate-800 dark:text-slate-100 flex items-center"
        style={{ height: HEADER_HEIGHT }}
      >
        {table.name}
      </div>
      {table.columns.map(renderColumn)}
    </div>
  );
}

const NODE_TYPES = { table: TableNode };

function computeLayout(schema: ParsedSchema): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (schema.tables.length === 0) return positions;

  const tableMap = new Map<string, DbTable>();
  for (const t of schema.tables) tableMap.set(t.name, t);

  const outRefs = new Map<string, Set<string>>();
  for (const t of schema.tables) outRefs.set(t.name, new Set());
  for (const r of schema.relations) {
    if (r.fromTable === r.toTable) continue;
    if (outRefs.has(r.fromTable) && tableMap.has(r.toTable)) {
      outRefs.get(r.fromTable)!.add(r.toTable);
    }
  }

  const level = new Map<string, number>();
  const visiting = new Set<string>();
  const dfs = (name: string): number => {
    if (level.has(name)) return level.get(name)!;
    if (visiting.has(name)) return 0;
    visiting.add(name);
    let maxL = 0;
    for (const ref of outRefs.get(name) ?? []) {
      maxL = Math.max(maxL, dfs(ref) + 1);
    }
    visiting.delete(name);
    level.set(name, maxL);
    return maxL;
  };
  for (const t of schema.tables) dfs(t.name);

  const byLevel = new Map<number, string[]>();
  for (const [name, l] of level) {
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(name);
  }
  for (const arr of byLevel.values()) arr.sort();

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  for (const l of sortedLevels) {
    let y = 0;
    for (const name of byLevel.get(l)!) {
      const t = tableMap.get(name)!;
      positions.set(name, { x: l * (NODE_WIDTH + COL_GAP), y });
      y += HEADER_HEIGHT + t.columns.length * ROW_HEIGHT + ROW_GAP;
    }
  }

  return positions;
}

// ── SVG export ─────────────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const KEY_PATH =
  'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4';
const LINK_PATH = 'M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8';

function buildSvg(currentNodes: Node<TableNodeData>[], schema: ParsedSchema): string {
  if (currentNodes.length === 0) return '';

  const tableMap = new Map<string, DbTable>();
  for (const t of schema.tables) tableMap.set(t.name, t);

  const positions = new Map<string, { x: number; y: number; height: number }>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of currentNodes) {
    const t = node.data.table;
    const h = HEADER_HEIGHT + t.columns.length * ROW_HEIGHT;
    positions.set(t.name, { x: node.position.x, y: node.position.y, height: h });
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.position.y + h);
  }

  const padding = 40;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">`
  );
  parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff"/>`);

  // Edges (drawn first, behind tables)
  const seenEdges = new Set<string>();
  for (const rel of schema.relations) {
    const fromPos = positions.get(rel.fromTable);
    const toPos = positions.get(rel.toTable);
    if (!fromPos || !toPos) continue;
    const fromTable = tableMap.get(rel.fromTable);
    const toTable = tableMap.get(rel.toTable);
    if (!fromTable || !toTable) continue;

    const fromColIdx = fromTable.columns.findIndex((c) => c.name === rel.fromCol);
    const toColIdx = toTable.columns.findIndex((c) => c.name === rel.toCol);
    if (fromColIdx < 0 || toColIdx < 0) continue;

    const key = `${rel.fromTable}.${rel.fromCol}->${rel.toTable}.${rel.toCol}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);

    const fy = fromPos.y + HEADER_HEIGHT + fromColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const ty = toPos.y + HEADER_HEIGHT + toColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const fromCenterX = fromPos.x + NODE_WIDTH / 2;
    const toCenterX = toPos.x + NODE_WIDTH / 2;
    const goRight = toCenterX > fromCenterX;
    const fx = goRight ? fromPos.x + NODE_WIDTH : fromPos.x;
    const tx = goRight ? toPos.x : toPos.x + NODE_WIDTH;

    const dx = Math.abs(tx - fx);
    const cp = Math.max(40, dx * 0.55);
    const c1x = goRight ? fx + cp : fx - cp;
    const c2x = goRight ? tx - cp : tx + cp;

    parts.push(
      `<path d="M ${fx} ${fy} C ${c1x} ${fy}, ${c2x} ${ty}, ${tx} ${ty}" stroke="${COLOR_EDGE}" stroke-width="1.2" fill="none" stroke-dasharray="5 4"/>`
    );

    const labelX = (fx + tx) / 2;
    const labelY = (fy + ty) / 2 - 5;
    parts.push(
      `<text x="${labelX}" y="${labelY}" fill="${COLOR_FK_LABEL}" font-size="9" font-style="italic" text-anchor="middle">FK</text>`
    );
  }

  // Tables
  for (const node of currentNodes) {
    const t = node.data.table;
    const x = node.position.x;
    const y = node.position.y;
    const totalH = HEADER_HEIGHT + t.columns.length * ROW_HEIGHT;

    parts.push(`<g transform="translate(${x},${y})">`);
    parts.push(
      `<rect width="${NODE_WIDTH}" height="${totalH}" rx="6" ry="6" fill="#ffffff" stroke="${COLOR_BORDER}" stroke-width="1"/>`
    );
    parts.push(
      `<text x="14" y="${HEADER_HEIGHT / 2 + 4}" font-size="12" font-weight="600" fill="${COLOR_HEADER}">${escXml(t.name)}</text>`
    );
    parts.push(
      `<line x1="0" y1="${HEADER_HEIGHT}" x2="${NODE_WIDTH}" y2="${HEADER_HEIGHT}" stroke="${COLOR_BORDER}"/>`
    );

    for (let i = 0; i < t.columns.length; i++) {
      const col = t.columns[i];
      const rowY = HEADER_HEIGHT + i * ROW_HEIGHT;
      const textY = rowY + ROW_HEIGHT / 2 + 3;

      if (i > 0) {
        parts.push(
          `<line x1="8" y1="${rowY}" x2="${NODE_WIDTH - 8}" y2="${rowY}" stroke="${COLOR_DIVIDER}"/>`
        );
      }

      if (col.isPK) {
        parts.push(
          `<g transform="translate(10, ${rowY + ROW_HEIGHT / 2 - 6}) scale(0.5)" stroke="${COLOR_PK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="${KEY_PATH}"/></g>`
        );
      } else if (col.isFK) {
        parts.push(
          `<g transform="translate(10, ${rowY + ROW_HEIGHT / 2 - 6}) scale(0.5)" stroke="${COLOR_FK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="${LINK_PATH}"/></g>`
        );
      } else {
        parts.push(
          `<circle cx="14" cy="${rowY + ROW_HEIGHT / 2}" r="1.5" fill="#cbd5e1"/>`
        );
      }

      const nameColor = col.isPK ? COLOR_PK : col.isFK ? COLOR_FK : COLOR_REGULAR;
      const nameWeight = col.isPK ? '600' : '400';
      parts.push(
        `<text x="28" y="${textY}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="${nameWeight}" fill="${nameColor}">${escXml(col.name)}</text>`
      );
      parts.push(
        `<text x="${NODE_WIDTH - 12}" y="${textY}" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="10" fill="${COLOR_TYPE}">${escXml(col.type)}</text>`
      );
    }

    parts.push(`</g>`);
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}

// ── Inner component (uses useReactFlow, must be inside ReactFlow context) ─────

async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG image failed to load'));
      img.src = url;
    });
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 600;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
        'image/png'
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function FitOnResize({
  containerRef,
  schema,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  schema: ParsedSchema;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const refit = () => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        fitView({ padding: 0.18, duration: 0 });
      });
    };
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    refit();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [containerRef, fitView]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      fitView({ padding: 0.18, duration: 0 });
    });
    return () => cancelAnimationFrame(raf);
  }, [schema, fitView]);

  return null;
}

function FlowToolbar({ schema }: { schema: ParsedSchema }) {
  const { getNodes } = useReactFlow();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const generateSvg = useCallback(() => {
    const nodes = getNodes() as Node<TableNodeData>[];
    return buildSvg(nodes, schema);
  }, [getNodes, schema]);

  const handleCopyImage = useCallback(async () => {
    if (busy) return;
    const svg = generateSvg();
    if (!svg) return;
    setBusy(true);
    try {
      const png = await svgToPngBlob(svg, 2);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard or rendering failure — leave button state unchanged */
    } finally {
      setBusy(false);
    }
  }, [busy, generateSvg]);

  const handleDownload = useCallback(() => {
    const svg = generateSvg();
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'er-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [generateSvg]);

  return (
    <Panel position="top-right" className="!m-3">
      <div className="flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-1">
        <button
          onClick={handleCopyImage}
          disabled={busy}
          aria-label="Copy diagram as image"
          title="Copy diagram as PNG image to clipboard"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <ImageIcon size={12} />}
          <span>{copied ? 'Copied' : busy ? 'Copying…' : 'Copy Image'}</span>
        </button>
        <button
          onClick={handleDownload}
          aria-label="Download diagram as SVG"
          title="Download SVG"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Download size={12} />
          <span>Download SVG</span>
        </button>
      </div>
    </Panel>
  );
}

// ── Main exported component ────────────────────────────────────────────────────

interface DbSchemaFlowProps {
  schema: ParsedSchema;
  isDark: boolean;
}

export default function DbSchemaFlow({ schema, isDark }: DbSchemaFlowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { nodes, edges } = useMemo(() => {
    const positions = computeLayout(schema);
    const flowNodes: Node<TableNodeData>[] = schema.tables.map((table) => ({
      id: table.name,
      type: 'table',
      position: positions.get(table.name) ?? { x: 0, y: 0 },
      data: { table },
    }));

    const tableNames = new Set(schema.tables.map((t) => t.name));
    const flowEdges: Edge[] = [];
    const seen = new Set<string>();

    for (const rel of schema.relations) {
      if (!tableNames.has(rel.fromTable) || !tableNames.has(rel.toTable)) continue;
      const key = `${rel.fromTable}.${rel.fromCol}->${rel.toTable}.${rel.toCol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flowEdges.push({
        id: key,
        source: rel.fromTable,
        sourceHandle: `${rel.fromCol}.source`,
        target: rel.toTable,
        targetHandle: `${rel.toCol}.target`,
        type: 'default',
        animated: false,
        label: 'FK',
        labelBgPadding: [4, 1],
        labelBgBorderRadius: 3,
        labelStyle: {
          fontSize: 9,
          fontWeight: 600,
          fontStyle: 'italic',
          fill: COLOR_FK_LABEL,
        },
        labelBgStyle: { fill: 'transparent' },
        style: {
          stroke: COLOR_EDGE,
          strokeWidth: 1.2,
          strokeDasharray: '5 4',
        },
      });
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [schema]);

  return (
    <div ref={containerRef} className="absolute inset-0 touch-none">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnPinch
        panOnScroll={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        colorMode={isDark ? 'dark' : 'light'}
      >
        <Controls showInteractive={false} />
        <FlowToolbar schema={schema} />
        <FitOnResize containerRef={containerRef} schema={schema} />
      </ReactFlow>
    </div>
  );
}
