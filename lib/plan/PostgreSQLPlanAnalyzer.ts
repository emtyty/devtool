import type { PlanSummary, PlanNode, RedFlag } from '../../types';
import type { IExecutionPlanAnalyzer } from './IExecutionPlanAnalyzer';

// Maps PostgreSQL "Node Type" values to the physicalOp strings used by PlanTreeRenderer
const NODE_TYPE_MAP: Record<string, string> = {
  'Seq Scan':          'Table Scan',
  'Index Scan':        'Index Scan',
  'Index Only Scan':   'Index Seek',
  'Bitmap Index Scan': 'Index Scan',
  'Bitmap Heap Scan':  'Index Scan',
  'Hash Join':         'Hash Match',
  'Nested Loop':       'Nested Loops',
  'Merge Join':        'Merge Join',
  'Sort':              'Sort',
  'Aggregate':         'Stream Aggregate',
  'Hash Aggregate':    'Hash Aggregate',
  'Limit':             'Top',
  'Append':            'Concatenation',
  'Materialize':       'Spool',
  'Result':            'Compute Scalar',
  'Hash':              'Hash',
};

function mapNodeType(nodeType: string): string {
  return NODE_TYPE_MAP[nodeType] ?? nodeType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPlanNode(pgNode: Record<string, any>, totalCost: number, counter: { id: number }, depth = 0): PlanNode {
  const nodeType: string = pgNode['Node Type'] ?? '';
  const physicalOp = mapNodeType(nodeType);
  const logicalOp = nodeType; // keep original as logicalOp

  const nodeId = String(counter.id++);
  const subtreeCost: number = pgNode['Total Cost'] ?? 0;
  const estimateRows: number = pgNode['Plan Rows'] ?? 0;

  // Relation name + alias
  const relationName: string = pgNode['Relation Name'] ?? '';
  const alias: string = pgNode['Alias'] ?? '';
  const objectName = relationName
    ? alias && alias !== relationName
      ? `${relationName} (${alias})`
      : relationName
    : undefined;

  // Predicate: prefer Filter, then Index Cond, then Recheck Cond
  const predicate: string | undefined =
    pgNode['Filter'] ?? pgNode['Index Cond'] ?? pgNode['Recheck Cond'] ?? undefined;

  // Collect interesting attributes for tooltip
  const attributes: Record<string, string> = {};
  const ATTR_KEYS = [
    'Startup Cost', 'Plan Width', 'Join Type', 'Hash Cond',
    'Sort Key', 'Actual Rows', 'Actual Total Time', 'Sort Method',
    'Node Type',
  ];
  for (const k of ATTR_KEYS) {
    if (pgNode[k] !== undefined) {
      attributes[k] = Array.isArray(pgNode[k]) ? pgNode[k].join(', ') : String(pgNode[k]);
    }
  }

  // Recurse into children (Plans array)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pgChildren: Record<string, any>[] = pgNode['Plans'] ?? [];
  const children = pgChildren.map(c => buildPlanNode(c, totalCost, counter, depth + 1));

  const childrenSubtreeCost = children.reduce((sum, c) => sum + c.subtreeCost, 0);
  const selfCost = Math.max(0, subtreeCost - childrenSubtreeCost);

  return {
    nodeId,
    physicalOp,
    logicalOp,
    objectName,
    objectFull: undefined,
    estimateRows,
    estimateExecutions: 1,
    subtreeCost,
    selfCost,
    costPercent: totalCost > 0 ? (subtreeCost / totalCost) * 100 : 0,
    selfCostPercent: totalCost > 0 ? (selfCost / totalCost) * 100 : 0,
    depth,
    children,
    attributes,
    outputList: undefined,
    predicate,
    ordered: undefined,
    estimatedRowsRead: undefined,
  };
}

function flattenExecutionPath(node: PlanNode): PlanNode[] {
  const result: PlanNode[] = [];
  for (const child of [...node.children].reverse()) {
    result.push(...flattenExecutionPath(child));
  }
  result.push(node);
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectRedFlags(node: PlanNode, pgNodeMap: Map<string, Record<string, any>>, totalCost: number, redFlags: RedFlag[]) {
  const pgNode = pgNodeMap.get(node.nodeId);

  // Table Scan (Seq Scan mapped)
  if (node.physicalOp === 'Table Scan') {
    redFlags.push({
      type: 'Table Scan',
      description: `Sequential scan on ${node.objectName ?? 'table'} — no usable index. Consider adding an index.`,
      nodeId: node.nodeId,
      severity: 'high',
    });
  }

  // Disk spill via Sort Method
  if (pgNode) {
    const sortMethod: string = pgNode['Sort Method'] ?? '';
    if (sortMethod.toLowerCase().includes('disk')) {
      redFlags.push({
        type: 'Spill to Disk',
        description: `Sort spilled to disk (Sort Method: ${sortMethod}) — increase work_mem.`,
        nodeId: node.nodeId,
        severity: 'high',
      });
    }

    // Cardinality mismatch (only available with EXPLAIN ANALYZE)
    const actualRows: number | undefined = pgNode['Actual Rows'];
    if (actualRows !== undefined && node.estimateRows > 0) {
      const ratio = actualRows > node.estimateRows
        ? actualRows / node.estimateRows
        : node.estimateRows / actualRows;
      if (ratio >= 5) {
        redFlags.push({
          type: 'Cardinality Mismatch',
          description: `Estimated ${node.estimateRows.toLocaleString()} rows, actual ${actualRows.toLocaleString()} rows (${ratio.toFixed(0)}× off). Run ANALYZE to update statistics.`,
          nodeId: node.nodeId,
          severity: ratio >= 100 ? 'high' : 'medium',
        });
      }
    }

    // Nested loop with large outer side
    if (node.physicalOp === 'Nested Loops' && node.children.length >= 1) {
      const outerRows = node.children[0].estimateRows;
      if (outerRows > 10000) {
        redFlags.push({
          type: 'Join Strategy',
          description: `Nested Loop outer side has ${outerRows.toLocaleString()} estimated rows — consider a Hash Join or Merge Join.`,
          nodeId: node.nodeId,
          severity: 'medium',
        });
      }
    }
  }

  // High self-cost operator (skip root node id=0)
  if (node.nodeId !== '0' && node.selfCostPercent > 20) {
    redFlags.push({
      type: 'High-Cost Operator',
      description: `${node.physicalOp} accounts for ${node.selfCostPercent.toFixed(1)}% of total plan cost.`,
      nodeId: node.nodeId,
      severity: 'medium',
    });
  }

  for (const child of node.children) {
    collectRedFlags(child, pgNodeMap, totalCost, redFlags);
  }
}

export class PostgreSQLPlanAnalyzer implements IExecutionPlanAnalyzer {
  readonly dialect = 'postgresql' as const;

  extractSummary(input: string): PlanSummary {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(input);
    } catch {
      return emptyPlanSummary();
    }

    // EXPLAIN (FORMAT JSON) returns an array; each element has a "Plan" key
    const planEntry = Array.isArray(parsed) ? parsed[0] : parsed;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rootPgNode: Record<string, any> | undefined = planEntry?.Plan;
    if (!rootPgNode) return emptyPlanSummary();

    const totalCost: number = rootPgNode['Total Cost'] ?? 0;
    const counter = { id: 0 };
    const rootNode = buildPlanNode(rootPgNode, totalCost, counter);
    const executionPath = flattenExecutionPath(rootNode);

    // Build a map from nodeId → raw pg node for red flag detection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pgNodeMap = new Map<string, Record<string, any>>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function indexPgNodes(pgNode: Record<string, any>, planNode: PlanNode) {
      pgNodeMap.set(planNode.nodeId, pgNode);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pgChildren: Record<string, any>[] = pgNode['Plans'] ?? [];
      pgChildren.forEach((c, i) => {
        if (planNode.children[i]) indexPgNodes(c, planNode.children[i]);
      });
    }
    indexPgNodes(rootPgNode, rootNode);

    // Collect operations summary
    const opsMap: Record<string, number> = {};
    for (const n of executionPath) {
      if (n.physicalOp) opsMap[n.physicalOp] = (opsMap[n.physicalOp] || 0) + 1;
    }

    const redFlags: RedFlag[] = [];
    collectRedFlags(rootNode, pgNodeMap, totalCost, redFlags);

    // Deduplicate
    const seen = new Set<string>();
    const uniqueRedFlags = redFlags.filter(f => {
      const key = `${f.type}|${f.nodeId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const severityOrder = { high: 0, medium: 1, low: 2 };
    uniqueRedFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Statement text from planning info (not always present)
    const statementText: string = planEntry?.['Query Text'] ?? '';

    return {
      totalNodes: counter.id,
      operations: Object.entries(opsMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      totalCost,
      statementText,
      missingIndexes: [],
      redFlags: uniqueRedFlags,
      executionPath,
      planTree: rootNode,
    };
  }
}

function emptyPlanSummary(): PlanSummary {
  return {
    totalNodes: 0,
    operations: [],
    totalCost: 0,
    statementText: '',
    missingIndexes: [],
    redFlags: [],
    executionPath: [],
    planTree: null,
  };
}
