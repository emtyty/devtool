import type { PlanSummary, PlanNode, RedFlag } from '../../types';
import type { IExecutionPlanAnalyzer } from './IExecutionPlanAnalyzer';

export class SQLServerPlanAnalyzer implements IExecutionPlanAnalyzer {
  readonly dialect = 'sqlserver' as const;

  extractSummary(input: string): PlanSummary {
    return SQLServerPlanAnalyzer.extractSummary(input);
  }

  private static getElementsByLocalName(node: Element | Document, name: string): Element[] {
    const result: Element[] = [];
    const elements = node.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const localName = elements[i].localName || elements[i].tagName.split(':').pop();
      if (localName === name) result.push(elements[i]);
    }
    return result;
  }

  private static getDirectChildRelOps(relOp: Element): Element[] {
    const children: Element[] = [];
    function traverse(node: Element) {
      for (const child of Array.from(node.children)) {
        const localName = child.localName || child.tagName.split(':').pop();
        if (localName === 'RelOp') {
          children.push(child);
        } else {
          traverse(child);
        }
      }
    }
    traverse(relOp);
    return children;
  }

  private static buildPlanNode(relOp: Element, totalCost: number, depth = 0): PlanNode {
    const physicalOp = relOp.getAttribute('PhysicalOp') || '';
    const logicalOp = relOp.getAttribute('LogicalOp') || '';
    const nodeId = relOp.getAttribute('NodeId') || '';
    const estimateRows = parseFloat(relOp.getAttribute('EstimateRows') || '0');
    const subtreeCost = parseFloat(relOp.getAttribute('EstimatedTotalSubtreeCost') || '0');
    const rewinds = parseFloat(relOp.getAttribute('EstimateRewinds') || '0');
    const rebinds = parseFloat(relOp.getAttribute('EstimateRebinds') || '0');
    const estimateExecutions = rewinds + rebinds + 1;

    const attributes: Record<string, string> = {};
    for (let i = 0; i < relOp.attributes.length; i++) {
      const a = relOp.attributes[i];
      attributes[a.localName || a.name] = a.value;
    }

    let objectName: string | undefined;
    let objectFull: string | undefined;
    const objectEls = this.getElementsByLocalName(relOp, 'Object');
    for (const obj of objectEls) {
      const db     = obj.getAttribute('Database') || '';
      const schema = obj.getAttribute('Schema')   || '';
      const table  = obj.getAttribute('Table')    || '';
      const index  = obj.getAttribute('Index')    || '';
      const alias  = obj.getAttribute('Alias')    || '';
      if (table) {
        objectName = index ? `${table}.${index}` : table;
        const parts = [db, schema, table, index, alias].filter(Boolean).map(v => `[${v}]`);
        objectFull = parts.join('.');
        break;
      }
    }

    const outputList: string[] = [];
    const outputListEl = this.getElementsByLocalName(relOp, 'OutputList')[0];
    if (outputListEl) {
      this.getElementsByLocalName(outputListEl, 'ColumnReference').forEach(cr => {
        const parts = ['Database', 'Schema', 'Table', 'Alias', 'Column']
          .map(a => cr.getAttribute(a))
          .filter((v): v is string => !!v)
          .map(v => `[${v}]`);
        if (parts.length) outputList.push(parts.join('.'));
      });
    }

    const SKIP_INNER = new Set([
      'OutputList', 'RunTimeInformation', 'Warnings', 'MissingIndexes',
      'StatisticsInfo', 'MemoryFractions', 'OptimizerHardwareDependentProperties',
      'TraceFlags', 'WaitStats', 'QueryTimeStats',
    ]);
    let innerEl: Element | undefined;
    for (const child of Array.from(relOp.children)) {
      const localName = child.localName || child.tagName.split(':').pop() || '';
      if (!SKIP_INNER.has(localName)) { innerEl = child; break; }
    }

    let ordered: boolean | undefined;
    let estimatedRowsRead: number | undefined;
    let predicate: string | undefined;
    if (innerEl) {
      const orderedVal = innerEl.getAttribute('Ordered');
      if (orderedVal !== null) ordered = orderedVal === 'true' || orderedVal === '1';
      const rr = innerEl.getAttribute('EstimatedRowsRead');
      if (rr !== null) estimatedRowsRead = parseFloat(rr);
      const predEl = this.getElementsByLocalName(innerEl, 'Predicate')[0];
      if (predEl) {
        const so = this.getElementsByLocalName(predEl, 'ScalarOperator')[0];
        const ss = so?.getAttribute('ScalarString');
        if (ss) predicate = ss;
      }
    }

    const childRelOps = this.getDirectChildRelOps(relOp);
    const children = childRelOps.map(c => this.buildPlanNode(c, totalCost, depth + 1));

    const childrenSubtreeCost = children.reduce((sum, c) => sum + c.subtreeCost, 0);
    const selfCost = Math.max(0, subtreeCost - childrenSubtreeCost);

    return {
      nodeId,
      physicalOp,
      logicalOp,
      objectName,
      objectFull,
      estimateRows,
      estimateExecutions,
      subtreeCost,
      selfCost,
      costPercent: totalCost > 0 ? (subtreeCost / totalCost) * 100 : 0,
      selfCostPercent: totalCost > 0 ? (selfCost / totalCost) * 100 : 0,
      depth,
      children,
      attributes,
      outputList: outputList.length > 0 ? outputList : undefined,
      predicate,
      ordered,
      estimatedRowsRead,
    };
  }

  private static flattenExecutionPath(node: PlanNode): PlanNode[] {
    const result: PlanNode[] = [];
    for (const child of [...node.children].reverse()) {
      result.push(...this.flattenExecutionPath(child));
    }
    result.push(node);
    return result;
  }

  static getMetrics(xmlString: string) {
    let pruned = xmlString.replace(/xmlns(:\w+)?=(?:"[^"]*"|'[^']*')/g, '');
    pruned = pruned.replace(/<\/?\w+:/g, (match) => match.startsWith('</') ? '</' : '<');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(pruned, 'text/xml');

    const stmt = xmlDoc.querySelector('StmtSimple');
    const queryPlan = xmlDoc.querySelector('QueryPlan');

    const metrics = {
      statement: stmt?.getAttribute('StatementText')?.substring(0, 200) + '...',
      cost: parseFloat(stmt?.getAttribute('StatementSubtreeCost') || '0'),
      memGrant: parseInt(queryPlan?.getAttribute('MemoryGrant') || '0', 10),
      parallelism: parseInt(queryPlan?.getAttribute('DegreeOfParallelism') || '0', 10),
      bottlenecks: [] as { type: string | null; subtreeCost: number; estRows: number }[],
      warnings: [] as string[],
    };

    const ops = Array.from(xmlDoc.querySelectorAll('RelOp'));
    metrics.bottlenecks = ops
      .map(op => ({
        type: op.getAttribute('PhysicalOp'),
        subtreeCost: parseFloat(op.getAttribute('EstimatedTotalSubtreeCost') || '0'),
        estRows: parseFloat(op.getAttribute('EstimateRows') || '0'),
      }))
      .sort((a, b) => b.subtreeCost - a.subtreeCost)
      .slice(0, 3);

    const warnings = xmlDoc.querySelectorAll('Warnings');
    warnings.forEach(w => {
      if (w.hasAttribute('NoJoinPredicate')) metrics.warnings.push('Missing Join Predicate');
      if (w.querySelector('ColumnsWithNoStatistics')) metrics.warnings.push('Stale Statistics');
      if (w.querySelector('SpillToTempdb')) metrics.warnings.push('TempDB Spill');
    });

    return metrics;
  }

  static pruneExecutionPlan(xmlString: string): string {
    try {
      let pruned = xmlString.replace(/xmlns(:\w+)?=(?:"[^"]*"|'[^']*')/g, '');
      pruned = pruned.replace(/<\/?\w+:/g, (match) => match.startsWith('</') ? '</' : '<');

      const parser = new DOMParser();
      const doc = parser.parseFromString(pruned, 'text/xml');

      const removeTags = (tagName: string) => {
        const elements = doc.getElementsByTagName(tagName);
        for (let i = elements.length - 1; i >= 0; i--) {
          elements[i].parentNode?.removeChild(elements[i]);
        }
      };

      removeTags('RunTimeInformation');
      removeTags('MemoryFractions');
      removeTags('OptimizerHardwareDependentProperties');
      removeTags('TraceFlags');
      removeTags('WaitStats');
      removeTags('QueryTimeStats');

      const serializer = new XMLSerializer();
      let result = serializer.serializeToString(doc);

      const MAX_LENGTH = 30000;
      if (result.length > MAX_LENGTH) {
        result = result.substring(0, MAX_LENGTH) + '\n<!-- TRUNCATED FOR AI ANALYSIS -->';
      }

      return result;
    } catch {
      return xmlString.substring(0, 30000);
    }
  }

  static extractSummary(xmlString: string): PlanSummary {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    const stmtSimple = this.getElementsByLocalName(doc, 'StmtSimple')[0];
    const statementText = stmtSimple ? stmtSimple.getAttribute('StatementText') || '' : '';

    const missingIndexes: string[] = [];
    this.getElementsByLocalName(doc, 'MissingIndex').forEach(node => {
      const schema = node.getAttribute('Schema') || '';
      const table = node.getAttribute('Table') || '';
      const equalityCols: string[] = [];
      const inequalityCols: string[] = [];
      const includeCols: string[] = [];
      this.getElementsByLocalName(node, 'ColumnGroup').forEach(cg => {
        const usage = cg.getAttribute('Usage');
        const cols = this.getElementsByLocalName(cg, 'Column').map(c => c.getAttribute('Name') || '');
        if (usage === 'EQUALITY') equalityCols.push(...cols);
        if (usage === 'INEQUALITY') inequalityCols.push(...cols);
        if (usage === 'INCLUDE') includeCols.push(...cols);
      });
      let indexStr = `CREATE NONCLUSTERED INDEX [<Name of Missing Index, sysname,>] ON ${schema}.${table}`;
      const indexCols = [...equalityCols, ...inequalityCols];
      if (indexCols.length > 0) indexStr += ` (${indexCols.join(', ')})`;
      if (includeCols.length > 0) indexStr += ` INCLUDE (${includeCols.join(', ')})`;
      missingIndexes.push(indexStr);
    });

    const relOps = this.getElementsByLocalName(doc, 'RelOp');
    const totalCost = relOps.length > 0
      ? parseFloat(relOps[0].getAttribute('EstimatedTotalSubtreeCost') || '0')
      : 0;

    const rootNode = relOps.length > 0 ? this.buildPlanNode(relOps[0], totalCost) : null;
    const executionPath = rootNode ? this.flattenExecutionPath(rootNode) : [];

    const queryPlan = this.getElementsByLocalName(doc, 'QueryPlan')[0];
    const dop = queryPlan ? parseInt(queryPlan.getAttribute('DegreeOfParallelism') || '1', 10) : 1;

    const opsMap: Record<string, number> = {};
    const redFlags: RedFlag[] = [];

    relOps.forEach(op => {
      const physicalOp = op.getAttribute('PhysicalOp') || '';
      const logicalOp = op.getAttribute('LogicalOp') || '';
      const nodeId = op.getAttribute('NodeId') || '';
      const estimateRows = parseFloat(op.getAttribute('EstimateRows') || '0');
      const subtreeCost = parseFloat(op.getAttribute('EstimatedTotalSubtreeCost') || '0');

      const opName = physicalOp || logicalOp;
      if (opName) opsMap[opName] = (opsMap[opName] || 0) + 1;

      if (totalCost > 0 && nodeId !== '0' && subtreeCost / totalCost > 0.2) {
        redFlags.push({
          type: 'High-Cost Operator',
          description: `${opName} accounts for ${(subtreeCost / totalCost * 100).toFixed(1)}% of total plan cost (subtree).`,
          nodeId,
          severity: subtreeCost / totalCost > 0.5 ? 'high' : 'medium',
        });
      }

      if (physicalOp === 'Table Scan') {
        redFlags.push({ type: 'Table Scan', description: 'Full table scan — no usable index. Add a covering index.', nodeId, severity: 'high' });
      } else if (physicalOp === 'Clustered Index Scan') {
        redFlags.push({ type: 'Index Scan', description: 'Clustered index scan — may indicate a missing nonclustered index or non-SARGable predicate.', nodeId, severity: 'high' });
      } else if (physicalOp === 'Key Lookup' || logicalOp === 'Key Lookup') {
        redFlags.push({ type: 'Key Lookup', description: 'Key lookup against the clustered index. Add included columns to the nonclustered index to eliminate this.', nodeId, severity: 'high' });
      } else if (physicalOp === 'Index Scan') {
        redFlags.push({ type: 'Index Scan', description: `Nonclustered index scan (${estimateRows.toLocaleString()} rows). Check for non-SARGable predicates.`, nodeId, severity: estimateRows > 10000 ? 'high' : 'medium' });
      }

      const warnings = this.getElementsByLocalName(op, 'Warnings');
      if (warnings.length > 0) {
        const hasSpill = warnings.some(w =>
          w.hasAttribute('SpillToTempDb') ||
          this.getElementsByLocalName(w, 'HashSpillDetails').length > 0 ||
          this.getElementsByLocalName(w, 'SortSpillDetails').length > 0
        );
        if (hasSpill) {
          redFlags.push({ type: 'TempDB Spill', description: `${opName} is spilling to TempDB — insufficient memory grant or very large data set.`, nodeId, severity: 'high' });
        }

        const hasMissingJoin = warnings.some(w => w.hasAttribute('NoJoinPredicate'));
        if (hasMissingJoin) {
          redFlags.push({ type: 'Missing Join Predicate', description: 'Join has no predicate — this is a cross join or accidental cartesian product.', nodeId, severity: 'high' });
        }
      }

      this.getElementsByLocalName(op, 'ScalarOperator').forEach(so => {
        if ((so.getAttribute('ScalarString') || '').includes('CONVERT_IMPLICIT')) {
          redFlags.push({ type: 'Implicit Conversion', description: 'CONVERT_IMPLICIT detected — data type mismatch prevents index use. Fix column types or cast explicitly.', nodeId, severity: 'high' });
        }
      });

      let actualRows = 0;
      let hasActualRows = false;
      this.getElementsByLocalName(op, 'RunTimeCountersPerThread').forEach(rtc => {
        if (rtc.hasAttribute('ActualRows')) {
          actualRows += parseFloat(rtc.getAttribute('ActualRows') || '0');
          hasActualRows = true;
        }
      });
      if (hasActualRows && estimateRows > 0) {
        const ratio = actualRows > estimateRows ? actualRows / estimateRows : estimateRows / actualRows;
        if (ratio >= 5) {
          redFlags.push({
            type: 'Cardinality Mismatch',
            description: `Estimated ${estimateRows.toLocaleString()} rows, actual ${actualRows.toLocaleString()} rows (${ratio.toFixed(0)}× off). Update statistics.`,
            nodeId,
            severity: ratio >= 100 ? 'high' : 'medium',
          });
        }
      }

      if (physicalOp === 'Nested Loops') {
        const nestedLoops = this.getElementsByLocalName(op, 'NestedLoops')[0];
        if (nestedLoops) {
          const childRelOps: Element[] = [];
          const ch = nestedLoops.children;
          for (let i = 0; i < ch.length; i++) {
            if (ch[i].localName === 'RelOp' || ch[i].tagName.endsWith('RelOp')) childRelOps.push(ch[i]);
          }
          if (childRelOps.length === 2) {
            const outerRows = parseFloat(childRelOps[0].getAttribute('EstimateRows') || '0');
            const innerRows = parseFloat(childRelOps[1].getAttribute('EstimateRows') || '0');
            if (outerRows > 10000 && outerRows > innerRows * 100) {
              redFlags.push({ type: 'Join Strategy', description: `Nested Loops: outer has ${outerRows.toLocaleString()} rows vs inner ${innerRows.toLocaleString()} — consider a Hash or Merge join.`, nodeId, severity: 'medium' });
            }
          }
        }
      }
    });

    if (dop > 1) {
      redFlags.push({ type: 'Parallelism', description: `Plan runs with DOP ${dop}. Verify this is intentional and that MAXDOP settings are appropriate.`, severity: 'low' });
    }

    const seen = new Set<string>();
    const uniqueRedFlags = redFlags.filter(v => {
      const key = `${v.type}|${v.nodeId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const severityOrder = { high: 0, medium: 1, low: 2 };
    uniqueRedFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      totalNodes: relOps.length,
      operations: Object.entries(opsMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      totalCost,
      statementText,
      missingIndexes,
      redFlags: uniqueRedFlags,
      executionPath,
      planTree: rootNode,
    };
  }

  static generateAIPayload(beforeXml: string, afterXml: string) {
    return {
      before: this.getMetrics(beforeXml),
      after: this.getMetrics(afterXml),
      refinedPlan: this.pruneExecutionPlan(afterXml),
    };
  }
}
