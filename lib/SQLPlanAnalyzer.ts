import type { PlanSummary, RedFlag } from '../types';

export class SQLPlanAnalyzer {
  private static getElementsByLocalName(node: Element | Document, name: string): Element[] {
    const result: Element[] = [];
    const elements = node.getElementsByTagName('*');
    for (let i = 0; i < elements.length; i++) {
      const localName = elements[i].localName || elements[i].tagName.split(':').pop();
      if (localName === name) result.push(elements[i]);
    }
    return result;
  }

  static getMetrics(xmlString: string) {
    let pruned = xmlString.replace(/xmlns(:\w+)?=(['"])[^\2]*?\2/g, '');
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
      bottlenecks: [] as any[],
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
      let pruned = xmlString.replace(/xmlns(:\w+)?=(['"])[^\2]*?\2/g, '');
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
          description: `${opName} represents > 20% of the total plan cost (${(subtreeCost / totalCost * 100).toFixed(1)}%).`,
          nodeId,
        });
      }

      if (physicalOp === 'Table Scan') {
        redFlags.push({ type: 'Operator Type', description: 'Table Scan detected. Consider adding an index.', nodeId });
        if (estimateRows > 1000) {
          redFlags.push({ type: 'Access Path', description: `TableScan on a table with > 1000 estimated rows (${estimateRows}).`, nodeId });
        }
      } else if (physicalOp === 'Clustered Index Scan') {
        redFlags.push({ type: 'Operator Type', description: 'Clustered Index Scan detected. May indicate missing nonclustered index or non-SARGable predicate.', nodeId });
      } else if (logicalOp === 'Key Lookup' || physicalOp === 'Key Lookup') {
        redFlags.push({ type: 'Operator Type', description: 'Key Lookup detected. Consider adding included columns to the nonclustered index.', nodeId });
      }

      if (physicalOp === 'Index Scan' && estimateRows > 10000) {
        redFlags.push({ type: 'Access Path', description: `Index Scan on a large table (${estimateRows} estimated rows).`, nodeId });
      }

      if (estimateRows > 100000) {
        redFlags.push({ type: 'Data Movement', description: `High EstimateRows (${estimateRows}) indicating large data sets being moved.`, nodeId });
      }

      const warnings = this.getElementsByLocalName(op, 'Warnings');
      if (warnings.length > 0 && (physicalOp === 'Sort' || physicalOp === 'Hash Match')) {
        const hasSpill = warnings.some(w =>
          w.hasAttribute('SpillToTempDb') ||
          this.getElementsByLocalName(w, 'HashSpillDetails').length > 0 ||
          this.getElementsByLocalName(w, 'SortSpillDetails').length > 0
        );
        if (hasSpill) {
          redFlags.push({ type: 'Memory/CPU', description: `${physicalOp} operator has warnings indicating TempDB spills.`, nodeId });
        }
      }

      this.getElementsByLocalName(op, 'ScalarOperator').forEach(so => {
        if ((so.getAttribute('ScalarString') || '').includes('CONVERT_IMPLICIT')) {
          redFlags.push({ type: 'Implicit Conversion', description: 'Scalar Operator contains CONVERT_IMPLICIT, which breaks index SARGability.', nodeId });
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

      if (hasActualRows) {
        const delta = Math.abs(estimateRows - actualRows);
        if (delta > 1000 && (actualRows > estimateRows * 2 || estimateRows > actualRows * 2)) {
          redFlags.push({ type: 'Cardinality Mismatch', description: `Large delta between EstimateRows (${estimateRows}) and ActualRows (${actualRows}). Indicates stale statistics.`, nodeId });
        }
      }

      if (physicalOp === 'Nested Loops') {
        const nestedLoops = this.getElementsByLocalName(op, 'NestedLoops')[0];
        if (nestedLoops) {
          const childRelOps: Element[] = [];
          const children = nestedLoops.children;
          for (let i = 0; i < children.length; i++) {
            if (children[i].localName === 'RelOp' || children[i].tagName.endsWith('RelOp')) {
              childRelOps.push(children[i]);
            }
          }
          if (childRelOps.length === 2) {
            const outerRows = parseFloat(childRelOps[0].getAttribute('EstimateRows') || '0');
            const innerRows = parseFloat(childRelOps[1].getAttribute('EstimateRows') || '0');
            if (outerRows > 10000 && outerRows > innerRows * 100) {
              redFlags.push({ type: 'Join Strategy', description: `Nested Loop where outer input (${outerRows}) is significantly larger than inner input (${innerRows}).`, nodeId });
            }
          }
        }
      }
    });

    this.getElementsByLocalName(doc, 'IndexScan').forEach(scan => {
      if (scan.getAttribute('Lookup') === '1' || scan.getAttribute('Lookup') === 'true') {
        let parentRelOp: Element | null = scan;
        while (parentRelOp && parentRelOp.localName !== 'RelOp' && !parentRelOp.tagName.endsWith('RelOp')) {
          parentRelOp = parentRelOp.parentElement;
        }
        redFlags.push({
          type: 'Operator Type',
          description: 'Key Lookup detected. Consider adding included columns to the nonclustered index.',
          nodeId: parentRelOp ? parentRelOp.getAttribute('NodeId') || '' : '',
        });
      }
    });

    const uniqueRedFlags = redFlags.filter((v, i, a) =>
      a.findIndex(t => t.description === v.description && t.nodeId === v.nodeId) === i
    );

    return {
      totalNodes: relOps.length,
      operations: Object.entries(opsMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      totalCost,
      statementText,
      missingIndexes,
      redFlags: uniqueRedFlags,
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
