import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  Table, Key, Search, ScanLine, Hash, RefreshCcw, GitMerge,
  ArrowUpDown, Filter, BarChart3, GitFork, Calculator, ChevronsUp, Box,
} from 'lucide-react';
import type { PlanNode, RedFlag } from '../types';

// ── Operator metadata ───────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{ size?: number; className?: string }>;

interface OperatorMeta {
  Icon: LucideIcon;
  iconClass: string;
  borderClass: string;
  headerClass: string;
}

function getOperatorMeta(op: string): OperatorMeta {
  switch (op) {
    case 'Table Scan':
    case 'Clustered Index Scan':
      return { Icon: Table,      iconClass: 'text-red-500',    borderClass: 'border-red-300',    headerClass: 'bg-red-50' };
    case 'Key Lookup':
      return { Icon: Key,        iconClass: 'text-orange-500', borderClass: 'border-orange-300', headerClass: 'bg-orange-50' };
    case 'Index Scan':
      return { Icon: ScanLine,   iconClass: 'text-orange-500', borderClass: 'border-orange-300', headerClass: 'bg-orange-50' };
    case 'Index Seek':
    case 'Clustered Index Seek':
      return { Icon: Search,     iconClass: 'text-emerald-600',borderClass: 'border-emerald-300',headerClass: 'bg-emerald-50' };
    case 'Hash Match':
      return { Icon: Hash,       iconClass: 'text-blue-500',   borderClass: 'border-blue-300',   headerClass: 'bg-blue-50' };
    case 'Nested Loops':
      return { Icon: RefreshCcw, iconClass: 'text-blue-500',   borderClass: 'border-blue-300',   headerClass: 'bg-blue-50' };
    case 'Merge Join':
      return { Icon: GitMerge,   iconClass: 'text-blue-500',   borderClass: 'border-blue-300',   headerClass: 'bg-blue-50' };
    case 'Sort':
    case 'Top Sort':
      return { Icon: ArrowUpDown,iconClass: 'text-violet-500', borderClass: 'border-violet-300', headerClass: 'bg-violet-50' };
    case 'Filter':
      return { Icon: Filter,     iconClass: 'text-slate-500',  borderClass: 'border-slate-300',  headerClass: 'bg-slate-50' };
    case 'Stream Aggregate':
    case 'Hash Aggregate':
      return { Icon: BarChart3,  iconClass: 'text-slate-500',  borderClass: 'border-slate-300',  headerClass: 'bg-slate-50' };
    case 'Parallelism':
    case 'Gather Streams':
    case 'Repartition Streams':
    case 'Distribute Streams':
      return { Icon: GitFork,    iconClass: 'text-slate-500',  borderClass: 'border-slate-300',  headerClass: 'bg-slate-50' };
    case 'Compute Scalar':
      return { Icon: Calculator, iconClass: 'text-slate-500',  borderClass: 'border-slate-300',  headerClass: 'bg-slate-50' };
    case 'Top':
      return { Icon: ChevronsUp, iconClass: 'text-slate-500',  borderClass: 'border-slate-300',  headerClass: 'bg-slate-50' };
    default:
      return { Icon: Box,        iconClass: 'text-slate-400',  borderClass: 'border-slate-200',  headerClass: 'bg-slate-50' };
  }
}

// ── Arrow drawing — exact port of html-query-plan's arrowPath() ─────────────

/** Logarithmic thickness from row count (same formula as original library). */
function rowsToThickness(rows: number): number {
  return Math.max(2, Math.min(Math.floor(Math.log(rows > 0 ? rows : 1)), 12));
}

/**
 * Generates SVG polygon points for a variable-width arrow.
 * Direct port of html-query-plan's arrowPath() from src/lines.ts.
 *
 * @param x1 / y1  Arrow TIP (parent's right center) — arrowhead points here
 * @param x2 / y2  Arrow TAIL (child's left center)
 * @param thickness  Stroke width in px (2–12)
 */
function arrowPolygon(x1: number, y1: number, x2: number, y2: number, thickness: number): string {
  const w2 = thickness / 2;
  const bendX = (x1 + x2) / 2;
  // Snap to straight line if very close vertically (original's 5px kink correction)
  const fy2 = Math.abs(y2 - y1) < 5 ? y1 : y2;
  // Direction flag: is the tip (parent) above or at the same level as tail (child)?
  const tipAbove = y1 <= fy2;

  const pts: [number, number][] = [
    [x1,             y1],               // arrowhead tip
    [x1 + w2 + 2,    y1 - (w2 + 2)],   // arrowhead upper corner
    [x1 + w2 + 2,    y1 - w2],         // shaft/arrowhead junction top
    [bendX + (tipAbove ?  w2 : -w2), y1  - w2], // parent-side elbow top
    [bendX + (tipAbove ?  w2 : -w2), fy2 - w2], // child-side  elbow top
    [x2,             fy2 - w2],         // child end top
    [x2,             fy2 + w2],         // child end bottom
    [bendX + (tipAbove ? -w2 :  w2), fy2 + w2], // child-side  elbow bottom
    [bendX + (tipAbove ? -w2 :  w2), y1  + w2], // parent-side elbow bottom
    [x1 + w2 + 2,    y1 + w2],         // shaft/arrowhead junction bottom
    [x1 + w2 + 2,    y1 + (w2 + 2)],   // arrowhead lower corner
    [x1,             y1],               // back to tip
  ];

  return pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
}

function convertSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024)         return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes.toFixed(0)} B`;
}

// ── Operator descriptions (ported from html-query-plan qp.xslt ToolTipDescription templates) ──

const OPERATOR_DESCRIPTIONS: Record<string, string> = {
  'Table Insert':         'Insert input rows into the table specified in Argument field.',
  'Compute Scalar':       'Compute new values from existing values in a row.',
  'Sort':                 'Sort the input.',
  'Top Sort':             'Sort the input.',
  'Clustered Index Scan': 'Scanning a clustered index, entirely or only a range.',
  'Stream Aggregate':     'Compute summary values for groups of rows in a suitably sorted stream.',
  'Hash Match':           'Use each row from the top input to build a hash table, and each row from the bottom input to probe into the hash table, outputting all matching rows.',
  'Bitmap':               'Bitmap.',
  'Clustered Index Seek': 'Scanning a particular range of rows from a clustered index.',
  'Index Seek':           'Scan a particular range of rows from a nonclustered index.',
  'Adaptive Join':        'Chooses dynamically between hash join and nested loops.',
  'Index Spool':          'Reformats the data from the input into a temporary index, which is then used for seeking with the supplied seek predicate.',
  'Key Lookup':           'Uses a supplied clustering key to lookup on a table that has a clustered index.',
  'Table Scan':           'Scan rows from a table.',
  'Nested Loops':         'For each row in the top (outer) input, scan the bottom (inner) input, and output matching rows.',
  'Top':                  'Select the first few rows based on a sort order.',
  'Index Scan':           'Scan a nonclustered index, entirely or only a range.',
  'Hash Aggregate':       'Compute summary values for groups of rows using hashing.',
  'Filter':               'Filter rows from the input based on a predicate.',
  'Merge Join':           'Merge two sorted inputs into a single sorted output.',
  'Gather Streams':       'Combines multiple parallel streams into a single serial stream.',
  'Distribute Streams':   'Splits a serial stream into multiple parallel streams.',
  'Repartition Streams':  'Repartitions rows from multiple streams into multiple streams.',
};

function getOperatorDescription(physicalOp: string, logicalOp: string): string | undefined {
  if (physicalOp === 'Parallelism') {
    return logicalOp === 'Repartition Streams'
      ? 'Repartition Streams.'
      : 'An operation involving parallelism.';
  }
  return OPERATOR_DESCRIPTIONS[physicalOp] ?? OPERATOR_DESCRIPTIONS[logicalOp];
}

// ── Attribute label formatting ──────────────────────────────────────────────

const ATTR_ORDER = [
  'PhysicalOp', 'LogicalOp', 'EstimatedExecutionMode', 'StorageType',
  'EstimatedTotalSubtreeCost', 'EstimateIO', 'EstimateCPU',
  'EstimateRebinds', 'EstimateRewinds',
  'TableCardinality', 'EstimateRows', 'AvgRowSize',
  'Parallel', 'EstimatedNumberOfExecutionsPerInstance', 'NodeId',
];

const ATTR_LABELS: Record<string, string> = {
  PhysicalOp: 'Physical Operation',
  LogicalOp: 'Logical Operation',
  EstimatedExecutionMode: 'Estimated Execution Mode',
  StorageType: 'Storage',
  EstimatedTotalSubtreeCost: 'Estimated Subtree Cost',
  EstimateIO: 'Estimated I/O Cost',
  EstimateCPU: 'Estimated CPU Cost',
  EstimateRebinds: 'Est. Rebinds',
  EstimateRewinds: 'Est. Rewinds',
  TableCardinality: 'Table Cardinality',
  EstimateRows: 'Estimated Number of Rows',
  AvgRowSize: 'Estimated Row Size',
  Parallel: 'Parallel',
  EstimatedNumberOfExecutionsPerInstance: 'Executions / Instance',
  NodeId: 'Node ID',
};

function camelToLabel(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').trim();
}

function formatAttrValue(key: string, val: string): string {
  const numericKeys = new Set(['EstimateRows', 'EstimatedTotalSubtreeCost', 'EstimateIO', 'EstimateCPU', 'AvgRowSize', 'TableCardinality']);
  if (numericKeys.has(key)) {
    const n = parseFloat(val);
    if (!isNaN(n)) return n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  }
  if (val === '1' && key === 'Parallel') return 'True';
  if (val === '0' && key === 'Parallel') return 'False';
  return val;
}

// ── Tooltip portal ──────────────────────────────────────────────────────────

interface TooltipProps {
  node: PlanNode;
  anchorRect: DOMRect;
}

function OperatorTooltip({ node, anchorRect }: TooltipProps) {
  const op = node.physicalOp || node.logicalOp;

  // Attributes table: ATTR_ORDER first, then any remaining unknown attrs, excluding PhysicalOp/LogicalOp (shown in header)
  const HEADER_SKIP = new Set(['PhysicalOp', 'LogicalOp']);
  const orderedKeys = ATTR_ORDER.filter(k => k in node.attributes && !HEADER_SKIP.has(k));
  const remainingKeys = Object.keys(node.attributes)
    .filter(k => !ATTR_ORDER.includes(k) && !HEADER_SKIP.has(k))
    .sort();
  const attrKeys = [...orderedKeys, ...remainingKeys];

  const viewportW = window.innerWidth;
  const tooltipW = 340;
  let left = anchorRect.left + anchorRect.width / 2;
  if (left + tooltipW / 2 > viewportW - 16) left = viewportW - 16 - tooltipW / 2;
  if (left - tooltipW / 2 < 16) left = 16 + tooltipW / 2;

  const style: React.CSSProperties = {
    position: 'fixed',
    left,
    top: anchorRect.bottom + 8,
    transform: 'translateX(-50%)',
    zIndex: 9999,
    width: tooltipW,
    pointerEvents: 'none',
  };

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-slate-400 shrink-0">{label}</span>
      <span className="text-slate-100 text-right break-all">{value}</span>
    </div>
  );

  return ReactDOM.createPortal(
    <div style={style} className="bg-slate-900 text-slate-100 rounded-xl shadow-2xl text-[11px] font-mono border border-slate-700">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700 bg-slate-800 rounded-t-xl">
        <div className="font-bold text-white text-xs">{op}</div>
        {node.logicalOp && node.logicalOp !== node.physicalOp && (
          <div className="text-slate-400 mt-0.5">{node.logicalOp}</div>
        )}
        {(() => { const desc = getOperatorDescription(node.physicalOp, node.logicalOp); return desc ? <div className="text-slate-300 mt-1 text-[10px] leading-relaxed font-sans">{desc}</div> : null; })()}
      </div>

      <div className="px-3 py-1.5 divide-y divide-slate-800">
        {/* Operator cost row */}
        <Row
          label="Estimated Operator Cost"
          value={<>{node.selfCost.toFixed(6)} <span className="text-slate-400">({node.selfCostPercent.toFixed(1)}%)</span></>}
        />

        {/* Estimated number of executions */}
        <Row label="Estimated Number of Executions" value={node.estimateExecutions.toLocaleString()} />

        {/* Rows to be Read — only when present (index scans with row goal) */}
        {node.estimatedRowsRead !== undefined && (
          <Row label="Estimated Number of Rows to be Read" value={node.estimatedRowsRead.toLocaleString()} />
        )}

        {/* Ordered */}
        {node.ordered !== undefined && (
          <Row label="Ordered" value={node.ordered ? 'True' : 'False'} />
        )}

        {/* All RelOp attributes */}
        {attrKeys.map(k => (
          <div key={k} className="flex justify-between gap-2 py-0.5">
            <span className="text-slate-400 shrink-0">{ATTR_LABELS[k] ?? camelToLabel(k)}</span>
            <span className="text-slate-100 text-right break-all">{formatAttrValue(k, node.attributes[k])}</span>
          </div>
        ))}
      </div>

      {/* Object */}
      {node.objectFull && (
        <div className="px-3 py-1.5 border-t border-slate-800">
          <div className="text-slate-500 text-[10px] uppercase tracking-wide mb-0.5">Object</div>
          <div className="text-blue-300 break-all leading-relaxed">{node.objectFull}</div>
        </div>
      )}

      {/* Output List */}
      {node.outputList && node.outputList.length > 0 && (
        <div className="px-3 py-1.5 border-t border-slate-800">
          <div className="text-slate-500 text-[10px] uppercase tracking-wide mb-0.5">Output List</div>
          <div className="flex flex-col gap-0.5">
            {node.outputList.map((col, i) => (
              <div key={i} className="text-slate-300 break-all leading-relaxed">{col}</div>
            ))}
          </div>
        </div>
      )}

      {/* Predicate */}
      {node.predicate && (
        <div className="px-3 py-1.5 border-t border-slate-800">
          <div className="text-slate-500 text-[10px] uppercase tracking-wide mb-0.5">Predicate</div>
          <div className="text-yellow-300 break-all leading-relaxed">{node.predicate}</div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Operator box ────────────────────────────────────────────────────────────

const FLAG_RING: Record<string, string> = {
  high:   'ring-2 ring-red-400',
  medium: 'ring-2 ring-orange-400',
  low:    'ring-1 ring-slate-400',
};

interface OperatorBoxProps {
  node: PlanNode;
  redFlagSeverity?: 'high' | 'medium' | 'low';
  isActive: boolean;
  boxRef: (el: HTMLDivElement | null) => void;
}

function OperatorBox({ node, redFlagSeverity, isActive, boxRef }: OperatorBoxProps) {
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);

  const op = node.physicalOp || node.logicalOp;
  const { Icon, iconClass, borderClass, headerClass } = getOperatorMeta(op);

  const barWidth = Math.min(100, node.selfCostPercent);
  const barColor = node.selfCostPercent > 20
    ? 'bg-red-400'
    : node.selfCostPercent > 10
      ? 'bg-yellow-400'
      : 'bg-blue-400';

  const ringClass = isActive
    ? 'ring-4 ring-blue-500 shadow-xl scale-105 z-10'
    : redFlagSeverity
      ? FLAG_RING[redFlagSeverity]
      : '';

  const setRef = (el: HTMLDivElement | null) => {
    elRef.current = el;
    boxRef(el);
  };

  return (
    <div
      ref={setRef}
      className={`relative w-44 rounded-xl border bg-white shadow-sm transition-all duration-150 cursor-default select-none ${borderClass} ${ringClass}`}
      onMouseEnter={() => elRef.current && setHoverRect(elRef.current.getBoundingClientRect())}
      onMouseLeave={() => setHoverRect(null)}
    >
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${headerClass} border-b ${borderClass}`}>
        <Icon size={20} className={`shrink-0 ${iconClass}`} />
        <span className="text-[11px] font-bold text-slate-700 truncate leading-tight">{op}</span>
      </div>
      <div className="px-3 py-2 flex flex-col gap-1.5">
        {node.objectName && (
          <span className="text-[10px] text-slate-400 font-mono truncate" title={node.objectName}>
            {node.objectName}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
          </div>
          <span className="text-[10px] font-semibold text-slate-500 w-9 text-right tabular-nums">
            {node.selfCostPercent.toFixed(1)}%
          </span>
        </div>
        <span className="text-[10px] text-slate-400 tabular-nums">
          {node.estimateRows.toLocaleString()} rows
          {node.estimateExecutions > 1 && ` · ×${node.estimateExecutions}`}
        </span>
      </div>
      {hoverRect && <OperatorTooltip node={node} anchorRect={hoverRect} />}
    </div>
  );
}

// ── Recursive node view — horizontal left→right (SSMS style) ────────────────

interface PlanNodeViewProps {
  node: PlanNode;
  redFlagMap: Map<string, 'high' | 'medium' | 'low'>;
  activeNodeId: string | null;
  nodeBoxRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

function PlanNodeView({ node, redFlagMap, activeNodeId, nodeBoxRefs }: PlanNodeViewProps) {
  const boxRef = (el: HTMLDivElement | null) => {
    if (el) nodeBoxRefs.current.set(node.nodeId, el);
    else nodeBoxRefs.current.delete(node.nodeId);
  };

  return (
    <div className="flex flex-row items-start">
      <OperatorBox
        node={node}
        redFlagSeverity={redFlagMap.get(node.nodeId)}
        isActive={activeNodeId === node.nodeId}
        boxRef={boxRef}
      />
      {node.children.length > 0 && (
        // ml-16: 64px gap for arrows (max arrow thickness 12px + arrowhead ~14px + padding)
        <div className="flex flex-col gap-6 ml-16">
          {node.children.map(child => (
            <PlanNodeView
              key={child.nodeId || `${child.physicalOp}-${child.depth}`}
              node={child}
              redFlagMap={redFlagMap}
              activeNodeId={activeNodeId}
              nodeBoxRefs={nodeBoxRefs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main renderer ───────────────────────────────────────────────────────────

interface SvgLine {
  x1: number; y1: number; // arrow TIP — parent's right center
  x2: number; y2: number; // arrow TAIL — child's left center
  rows: number;           // child's estimateRows (drives thickness)
  rowSize: number;        // child's AvgRowSize in bytes
}

interface PlanTreeRendererProps {
  root: PlanNode;
  redFlags: RedFlag[];
  activeNodeId?: string | null;
}

export function PlanTreeRenderer({ root, redFlags, activeNodeId = null }: PlanTreeRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeBoxRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [svgLines, setSvgLines] = useState<SvgLine[]>([]);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

  // Build redFlagMap: nodeId → worst severity
  const redFlagMap = new Map<string, 'high' | 'medium' | 'low'>();
  const severityOrder = { high: 0, medium: 1, low: 2 } as const;
  for (const f of redFlags) {
    if (!f.nodeId) continue;
    const existing = redFlagMap.get(f.nodeId);
    if (!existing || severityOrder[f.severity] < severityOrder[existing]) {
      redFlagMap.set(f.nodeId, f.severity);
    }
  }

  const computeLines = () => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const lines: SvgLine[] = [];

    function traverse(node: PlanNode) {
      const parentEl = nodeBoxRefs.current.get(node.nodeId);
      if (!parentEl) return;
      const parentRect = parentEl.getBoundingClientRect();

      for (const child of node.children) {
        const childEl = nodeBoxRefs.current.get(child.nodeId);
        if (!childEl) continue;
        const childRect = childEl.getBoundingClientRect();

        lines.push({
          // +1 / -1 tiny gap from node edges (matches original library)
          x1: parentRect.right  - containerRect.left + 1,
          y1: parentRect.top    + parentRect.height / 2 - containerRect.top,
          x2: childRect.left    - containerRect.left - 1,
          y2: childRect.top     + childRect.height  / 2 - containerRect.top,
          rows: child.estimateRows,
          rowSize: parseFloat(child.attributes['AvgRowSize'] || '0'),
        });
        traverse(child);
      }
    }

    traverse(root);
    setSvgLines(lines);
    setSvgSize({
      w: containerRef.current.scrollWidth,
      h: containerRef.current.scrollHeight,
    });
  };

  useLayoutEffect(() => { computeLines(); }, [root]);

  useEffect(() => {
    const onResize = () => computeLines();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [root]);

  useEffect(() => {
    if (!activeNodeId) return;
    nodeBoxRefs.current.get(activeNodeId)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [activeNodeId]);

  return (
    <div ref={containerRef} className="relative inline-block min-w-full p-6">
      {/* SVG arrows — rendered first so they're visually behind node boxes */}
      {svgLines.length > 0 && (
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          style={{ width: svgSize.w, height: svgSize.h }}
          overflow="visible"
        >
          {svgLines.map((l, i) => {
            const thickness = rowsToThickness(l.rows);
            const estDataSize = l.rows * l.rowSize;
            const title = [
              `Estimated Rows: ${l.rows.toLocaleString()}`,
              l.rowSize > 0 ? `Row Size: ${convertSize(l.rowSize)}` : null,
              l.rowSize > 0 ? `Data Size: ${convertSize(estDataSize)}` : null,
            ].filter(Boolean).join('\n');

            return (
              <polygon
                key={i}
                className="qp-modern-arrow"
                points={arrowPolygon(l.x1, l.y1, l.x2, l.y2, thickness)}
                strokeWidth="0.5"
                style={{ pointerEvents: 'all', cursor: 'default' }}
              >
                <title>{title}</title>
              </polygon>
            );
          })}
        </svg>
      )}
      {/* Operator tree — rendered after SVG so boxes are on top in z-order */}
      <PlanNodeView
        node={root}
        redFlagMap={redFlagMap}
        activeNodeId={activeNodeId}
        nodeBoxRefs={nodeBoxRefs}
      />
    </div>
  );
}
