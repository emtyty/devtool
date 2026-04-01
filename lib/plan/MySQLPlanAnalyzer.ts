import type { PlanSummary, PlanNode, RedFlag } from '../../types';
import type { IExecutionPlanAnalyzer } from './IExecutionPlanAnalyzer';

// Maps MySQL access_type to physicalOp strings used by PlanTreeRenderer
const ACCESS_TYPE_MAP: Record<string, string> = {
  ALL:    'Table Scan',
  index:  'Index Scan',
  range:  'Index Seek',
  ref:    'Index Seek',
  eq_ref: 'Clustered Index Seek',
  const:  'Constant Lookup',
  system: 'Constant Lookup',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTableNode(tableObj: Record<string, any>, totalCost: number, counter: { id: number }, depth: number): PlanNode {
  const accessType: string = tableObj['access_type'] ?? 'ALL';
  const physicalOp = ACCESS_TYPE_MAP[accessType] ?? 'Table Scan';
  const logicalOp = accessType;

  const costInfo = tableObj['cost_info'] ?? {};
  const readCost = parseFloat(costInfo['read_cost'] ?? '0');
  const evalCost = parseFloat(costInfo['eval_cost'] ?? '0');
  const prefixCost = parseFloat(costInfo['prefix_cost'] ?? '0');

  const selfCost = readCost + evalCost;
  const subtreeCost = prefixCost || selfCost;
  const estimateRows: number = tableObj['rows_examined_per_scan'] ?? tableObj['rows_produced_per_join'] ?? 1;

  const objectName: string | undefined = tableObj['table_name'] ?? undefined;
  const predicate: string | undefined = tableObj['attached_condition'] ?? undefined;

  const attributes: Record<string, string> = {};
  const ATTR_KEYS = [
    'access_type', 'possible_keys', 'key', 'key_length',
    'filtered', 'using_index', 'using_filesort', 'using_temporary',
  ];
  for (const k of ATTR_KEYS) {
    if (tableObj[k] !== undefined) attributes[k] = String(tableObj[k]);
  }

  const nodeId = String(counter.id++);

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
    children: [],
    attributes,
    outputList: undefined,
    predicate,
    ordered: undefined,
    estimatedRowsRead: undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFromQueryBlock(block: Record<string, any>, totalCost: number, counter: { id: number }, depth = 0): PlanNode | null {
  // Wrapper operators: ordering_operation, grouping_operation, duplicates_removal
  for (const wrapper of ['ordering_operation', 'grouping_operation', 'duplicates_removal']) {
    if (block[wrapper]) {
      const child = buildFromQueryBlock(block[wrapper], totalCost, counter, depth + 1);
      if (!child) return null;
      const wrapperPhysicalOp = wrapper === 'ordering_operation' ? 'Sort'
        : wrapper === 'grouping_operation' ? 'Stream Aggregate'
        : 'Filter';
      const nodeId = String(counter.id++);
      const selfCost = 0;
      return {
        nodeId,
        physicalOp: wrapperPhysicalOp,
        logicalOp: wrapper,
        objectName: undefined,
        objectFull: undefined,
        estimateRows: child.estimateRows,
        estimateExecutions: 1,
        subtreeCost: child.subtreeCost,
        selfCost,
        costPercent: child.costPercent,
        selfCostPercent: 0,
        depth,
        children: [child],
        attributes: {},
        outputList: undefined,
        predicate: undefined,
        ordered: undefined,
        estimatedRowsRead: undefined,
      };
    }
  }

  // nested_loop: array of {table} objects forming a left-deep join spine
  if (block['nested_loop']) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: Record<string, any>[] = block['nested_loop'];
    if (items.length === 0) return null;
    if (items.length === 1) {
      return items[0].table ? buildTableNode(items[0].table, totalCost, counter, depth) : null;
    }

    // Build left-deep tree: items[0] is outer-most, each subsequent item joins to it
    // Last item is the rightmost (innermost). We build bottom-up.
    let root: PlanNode = buildTableNode(items[0].table, totalCost, counter, depth + 1);
    for (let i = 1; i < items.length; i++) {
      const right = buildTableNode(items[i].table, totalCost, counter, depth + 1);
      const joinNodeId = String(counter.id++);
      const subtreeCost = root.subtreeCost + right.subtreeCost;
      root = {
        nodeId: joinNodeId,
        physicalOp: 'Nested Loops',
        logicalOp: 'nested_loop',
        objectName: undefined,
        objectFull: undefined,
        estimateRows: right.estimateRows,
        estimateExecutions: 1,
        subtreeCost,
        selfCost: 0,
        costPercent: totalCost > 0 ? (subtreeCost / totalCost) * 100 : 0,
        selfCostPercent: 0,
        depth,
        children: [root, right],
        attributes: {},
        outputList: undefined,
        predicate: undefined,
        ordered: undefined,
        estimatedRowsRead: undefined,
      };
    }
    return root;
  }

  // Simple table access at root
  if (block['table']) {
    return buildTableNode(block['table'], totalCost, counter, depth);
  }

  return null;
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
function collectRedFlags(node: PlanNode, rawAttrs: Map<string, Record<string, any>>, totalCost: number, redFlags: RedFlag[]) {
  const raw = rawAttrs.get(node.nodeId);

  if (node.physicalOp === 'Table Scan') {
    redFlags.push({
      type: 'Table Scan',
      description: `Full table scan on ${node.objectName ?? 'table'} (access_type: ALL) — add an index on the WHERE/JOIN columns.`,
      nodeId: node.nodeId,
      severity: 'high',
    });
  }

  if (raw) {
    if (raw['using_filesort']) {
      redFlags.push({
        type: 'Sort Without Index',
        description: `${node.objectName ?? 'table'} requires a filesort — add an index that matches the ORDER BY clause.`,
        nodeId: node.nodeId,
        severity: 'high',
      });
    }

    if (raw['using_temporary']) {
      redFlags.push({
        type: 'Temporary Table',
        description: `Query uses a temporary table for ${node.objectName ?? 'this operation'} — simplify GROUP BY / DISTINCT or add a covering index.`,
        nodeId: node.nodeId,
        severity: 'medium',
      });
    }

    const accessType: string = raw['access_type'] ?? '';
    const possibleKeys = raw['possible_keys'];
    if (!possibleKeys && accessType !== 'const' && accessType !== 'system' && accessType !== 'ALL') {
      redFlags.push({
        type: 'No Usable Index',
        description: `${node.objectName ?? 'table'}: no possible keys found (access_type: ${accessType}). Consider adding an index.`,
        nodeId: node.nodeId,
        severity: 'medium',
      });
    }
  }

  if (node.nodeId !== '0' && node.selfCostPercent > 20) {
    redFlags.push({
      type: 'High-Cost Operator',
      description: `${node.physicalOp} on ${node.objectName ?? 'table'} accounts for ${node.selfCostPercent.toFixed(1)}% of total plan cost.`,
      nodeId: node.nodeId,
      severity: 'medium',
    });
  }

  for (const child of node.children) {
    collectRedFlags(child, rawAttrs, totalCost, redFlags);
  }
}

export class MySQLPlanAnalyzer implements IExecutionPlanAnalyzer {
  readonly dialect = 'mysql' as const;

  extractSummary(input: string): PlanSummary {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(input);
    } catch {
      return emptyPlanSummary();
    }

    const queryBlock = parsed['query_block'];
    if (!queryBlock) return emptyPlanSummary();

    // Determine total cost from query_block cost_info if available
    const blockCost = queryBlock['cost_info'];
    const totalCost = blockCost ? parseFloat(blockCost['query_cost'] ?? '0') : 0;

    const counter = { id: 0 };
    const rootNode = buildFromQueryBlock(queryBlock, totalCost, counter);
    if (!rootNode) return emptyPlanSummary();

    const executionPath = flattenExecutionPath(rootNode);

    // Build raw attr map for table nodes (only leaves have access_type etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawAttrs = new Map<string, Record<string, any>>();
    // We can't easily reconstruct which nodeId maps to which table without re-traversal;
    // instead attach raw during build via a side-channel approach:
    // Re-traverse the plan tree and match objectName
    function indexLeaves(node: PlanNode) {
      // leaf nodes are table nodes — we look them up by nodeId from executionPath
      for (const ep of executionPath) {
        if (ep.nodeId === node.nodeId && Object.keys(ep.attributes).length > 0) {
          // Reconstruct a minimal raw object from attributes for red flag detection
          rawAttrs.set(node.nodeId, {
            access_type: node.attributes['access_type'],
            possible_keys: node.attributes['possible_keys'] !== 'undefined' && node.attributes['possible_keys'] !== 'null'
              ? node.attributes['possible_keys'] ?? null
              : null,
            using_filesort: node.attributes['using_filesort'] === 'true',
            using_temporary: node.attributes['using_temporary'] === 'true',
          });
        }
      }
      for (const child of node.children) indexLeaves(child);
    }
    indexLeaves(rootNode);

    const opsMap: Record<string, number> = {};
    for (const n of executionPath) {
      if (n.physicalOp) opsMap[n.physicalOp] = (opsMap[n.physicalOp] || 0) + 1;
    }

    const redFlags: RedFlag[] = [];
    collectRedFlags(rootNode, rawAttrs, totalCost, redFlags);

    const seen = new Set<string>();
    const uniqueRedFlags = redFlags.filter(f => {
      const key = `${f.type}|${f.nodeId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const severityOrder = { high: 0, medium: 1, low: 2 };
    uniqueRedFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      totalNodes: counter.id,
      operations: Object.entries(opsMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      totalCost,
      statementText: '',
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
