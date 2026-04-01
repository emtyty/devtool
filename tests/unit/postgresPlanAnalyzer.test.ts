import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PostgreSQLPlanAnalyzer } from '../../lib/plan/PostgreSQLPlanAnalyzer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pgPlanJson = readFileSync(join(__dirname, '../fixtures/pg-plan.json'), 'utf-8');

const analyzer = new PostgreSQLPlanAnalyzer();

// ── Inline fixtures ────────────────────────────────────────────────────────────

const seqScanPlan = JSON.stringify([{
  Plan: {
    'Node Type': 'Seq Scan',
    'Relation Name': 'orders',
    'Total Cost': 18.40,
    'Plan Rows': 840,
    'Plan Width': 32,
  },
}]);

const indexOnlyScanPlan = JSON.stringify([{
  Plan: {
    'Node Type': 'Index Only Scan',
    'Relation Name': 'orders',
    'Total Cost': 5.0,
    'Plan Rows': 100,
    'Plan Width': 16,
    'Index Cond': '(id = $1)',
  },
}]);

const analyzePlan = JSON.stringify([{
  Plan: {
    'Node Type': 'Seq Scan',
    'Relation Name': 'big_table',
    'Total Cost': 100.0,
    'Plan Rows': 1000,
    'Plan Width': 32,
    'Actual Rows': 50000,
  },
}]);

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PostgreSQLPlanAnalyzer — dialect', () => {
  it('has dialect = postgresql', () => {
    expect(analyzer.dialect).toBe('postgresql');
  });
});

describe('PostgreSQLPlanAnalyzer.extractSummary — fixture plan', () => {
  it('parses node count correctly', () => {
    const summary = analyzer.extractSummary(pgPlanJson);
    // Hash Join + Seq Scan (orders) + Hash + Seq Scan (customers) = 4 nodes
    expect(summary.totalNodes).toBe(4);
  });

  it('total cost equals root node Total Cost', () => {
    const summary = analyzer.extractSummary(pgPlanJson);
    expect(summary.totalCost).toBeCloseTo(42.80, 2);
  });

  it('detects Seq Scan as Table Scan physicalOp', () => {
    const summary = analyzer.extractSummary(pgPlanJson);
    const seqScans = summary.executionPath.filter(n => n.physicalOp === 'Table Scan');
    expect(seqScans.length).toBeGreaterThanOrEqual(1);
    // Both 'orders' and 'customers (c)' map to Table Scan
    const objectNames = seqScans.map(n => n.objectName);
    expect(objectNames).toContain('orders');
  });

  it('maps Hash Join to Hash Match', () => {
    const summary = analyzer.extractSummary(pgPlanJson);
    const hashMatch = summary.executionPath.find(n => n.physicalOp === 'Hash Match');
    expect(hashMatch).toBeDefined();
  });

  it('stores predicate from Filter field', () => {
    const summary = analyzer.extractSummary(pgPlanJson);
    const withFilter = summary.executionPath.find(n => n.predicate !== undefined);
    expect(withFilter?.predicate).toContain('USA');
  });

  it('flags Seq Scan as high-severity red flag', () => {
    const summary = analyzer.extractSummary(pgPlanJson);
    const seqScanFlag = summary.redFlags.find(f => f.type === 'Table Scan');
    expect(seqScanFlag).toBeDefined();
    expect(seqScanFlag?.severity).toBe('high');
  });

  it('missingIndexes is always empty for PostgreSQL', () => {
    const summary = analyzer.extractSummary(pgPlanJson);
    expect(summary.missingIndexes).toEqual([]);
  });
});

describe('PostgreSQLPlanAnalyzer.extractSummary — inline fixtures', () => {
  it('Seq Scan → Table Scan physicalOp', () => {
    const summary = analyzer.extractSummary(seqScanPlan);
    expect(summary.executionPath[0].physicalOp).toBe('Table Scan');
  });

  it('Index Only Scan → Index Seek physicalOp', () => {
    const summary = analyzer.extractSummary(indexOnlyScanPlan);
    expect(summary.executionPath[0].physicalOp).toBe('Index Seek');
    expect(summary.executionPath[0].predicate).toBe('(id = $1)');
  });

  it('Seq Scan generates Table Scan red flag', () => {
    const summary = analyzer.extractSummary(seqScanPlan);
    expect(summary.redFlags.find(f => f.type === 'Table Scan')).toBeDefined();
  });

  it('detects cardinality mismatch from EXPLAIN ANALYZE output', () => {
    const summary = analyzer.extractSummary(analyzePlan);
    const mismatch = summary.redFlags.find(f => f.type === 'Cardinality Mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe('medium'); // 50× off (< 100× threshold for high)
  });

  it('handles invalid JSON gracefully', () => {
    expect(() => analyzer.extractSummary('not json')).not.toThrow();
    const summary = analyzer.extractSummary('not json');
    expect(summary.totalNodes).toBe(0);
  });

  it('handles empty array gracefully', () => {
    const summary = analyzer.extractSummary('[]');
    expect(summary.totalNodes).toBe(0);
  });
});
