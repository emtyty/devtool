import { describe, it, expect } from 'vitest';
import { detectDialect, analyzePlan } from '../../lib/plan/ExecutionPlanRouter';

// ── Detection cases ────────────────────────────────────────────────────────────

const sqlServerXml = `<?xml version="1.0"?>
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan">
  <BatchSequence><Batch><Statements>
    <StmtSimple StatementText="SELECT 1">
      <QueryPlan><RelOp NodeId="0" PhysicalOp="Table Scan" EstimateRows="1" EstimatedTotalSubtreeCost="0.5" /></QueryPlan>
    </StmtSimple>
  </Statements></Batch></BatchSequence>
</ShowPlanXML>`;

const pgPlanJson = JSON.stringify([{
  Plan: {
    'Node Type': 'Seq Scan',
    'Relation Name': 'orders',
    'Total Cost': 18.4,
    'Plan Rows': 840,
    'Plan Width': 32,
  },
}]);

const mysqlPlanJson = JSON.stringify({
  query_block: {
    select_id: 1,
    cost_info: { query_cost: '10.00' },
    table: {
      table_name: 'users',
      access_type: 'ALL',
      rows_examined_per_scan: 100,
      cost_info: { read_cost: '8.00', eval_cost: '1.00', prefix_cost: '10.00' },
    },
  },
});

describe('detectDialect', () => {
  it('detects SQL Server from XML with ShowPlanXML', () => {
    expect(detectDialect(sqlServerXml)).toBe('sqlserver');
  });

  it('detects SQL Server from BatchSequence keyword', () => {
    expect(detectDialect('<BatchSequence/>')).toBe('sqlserver');
  });

  it('detects PostgreSQL from JSON array with Plan.Node Type', () => {
    expect(detectDialect(pgPlanJson)).toBe('postgresql');
  });

  it('detects MySQL from JSON object with query_block', () => {
    expect(detectDialect(mysqlPlanJson)).toBe('mysql');
  });

  it('returns unknown for unrecognized input', () => {
    expect(detectDialect('hello world')).toBe('unknown');
    expect(detectDialect('{}')).toBe('unknown');
    expect(detectDialect('[]')).toBe('unknown');
  });
});

describe('analyzePlan — auto detection', () => {
  it('routes SQL Server XML correctly', () => {
    const summary = analyzePlan(sqlServerXml);
    expect(summary.totalNodes).toBeGreaterThan(0);
    expect(summary.redFlags.find(f => f.type === 'Table Scan')).toBeDefined();
  });

  it('routes PostgreSQL JSON correctly', () => {
    const summary = analyzePlan(pgPlanJson);
    expect(summary.totalNodes).toBeGreaterThan(0);
    expect(summary.executionPath[0].physicalOp).toBe('Table Scan');
  });

  it('routes MySQL JSON correctly', () => {
    const summary = analyzePlan(mysqlPlanJson);
    expect(summary.totalNodes).toBeGreaterThan(0);
    expect(summary.executionPath[0].physicalOp).toBe('Table Scan');
  });
});

describe('analyzePlan — manual hint override', () => {
  it('uses hint even when auto-detection would differ', () => {
    // Pass PG JSON but force mysql — should not crash, returns empty or minimal result
    expect(() => analyzePlan(pgPlanJson, 'mysql')).not.toThrow();
  });

  it('forces sqlserver on plaintext (falls back gracefully)', () => {
    expect(() => analyzePlan('not xml at all', 'sqlserver')).not.toThrow();
  });
});
