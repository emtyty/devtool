import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MySQLPlanAnalyzer } from '../../lib/plan/MySQLPlanAnalyzer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mysqlPlanJson = readFileSync(join(__dirname, '../fixtures/mysql-plan.json'), 'utf-8');

const analyzer = new MySQLPlanAnalyzer();

// ── Inline fixtures ────────────────────────────────────────────────────────────

const singleTableAllPlan = JSON.stringify({
  query_block: {
    select_id: 1,
    cost_info: { query_cost: '500.00' },
    table: {
      table_name: 'products',
      access_type: 'ALL',
      rows_examined_per_scan: 5000,
      cost_info: { read_cost: '400.00', eval_cost: '50.00', prefix_cost: '500.00' },
    },
  },
});

const constAccessPlan = JSON.stringify({
  query_block: {
    select_id: 1,
    cost_info: { query_cost: '1.00' },
    table: {
      table_name: 'users',
      access_type: 'const',
      possible_keys: ['PRIMARY'],
      key: 'PRIMARY',
      rows_examined_per_scan: 1,
      cost_info: { read_cost: '0.00', eval_cost: '0.10', prefix_cost: '1.00' },
    },
  },
});

const filesortPlan = JSON.stringify({
  query_block: {
    select_id: 1,
    cost_info: { query_cost: '200.00' },
    table: {
      table_name: 'logs',
      access_type: 'ALL',
      rows_examined_per_scan: 2000,
      cost_info: { read_cost: '150.00', eval_cost: '20.00', prefix_cost: '200.00' },
      using_filesort: true,
    },
  },
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MySQLPlanAnalyzer — dialect', () => {
  it('has dialect = mysql', () => {
    expect(analyzer.dialect).toBe('mysql');
  });
});

describe('MySQLPlanAnalyzer.extractSummary — fixture plan', () => {
  it('parses nested_loop into correct tree', () => {
    const summary = analyzer.extractSummary(mysqlPlanJson);
    // 2 tables + 1 join node = 3 nodes
    expect(summary.totalNodes).toBe(3);
  });

  it('total cost equals query_cost', () => {
    const summary = analyzer.extractSummary(mysqlPlanJson);
    expect(summary.totalCost).toBeCloseTo(1234.56, 1);
  });

  it('maps access_type ALL to Table Scan', () => {
    const summary = analyzer.extractSummary(mysqlPlanJson);
    const tableScan = summary.executionPath.find(n => n.physicalOp === 'Table Scan');
    expect(tableScan).toBeDefined();
    expect(tableScan?.objectName).toBe('orders');
  });

  it('maps access_type eq_ref to Clustered Index Seek', () => {
    const summary = analyzer.extractSummary(mysqlPlanJson);
    const seek = summary.executionPath.find(n => n.physicalOp === 'Clustered Index Seek');
    expect(seek).toBeDefined();
    expect(seek?.objectName).toBe('customers');
  });

  it('detects Table Scan red flag for ALL access type', () => {
    const summary = analyzer.extractSummary(mysqlPlanJson);
    const flag = summary.redFlags.find(f => f.type === 'Table Scan');
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe('high');
  });

  it('detects Sort Without Index red flag from using_filesort', () => {
    const summary = analyzer.extractSummary(mysqlPlanJson);
    const flag = summary.redFlags.find(f => f.type === 'Sort Without Index');
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe('high');
  });

  it('missingIndexes is always empty', () => {
    expect(analyzer.extractSummary(mysqlPlanJson).missingIndexes).toEqual([]);
  });
});

describe('MySQLPlanAnalyzer.extractSummary — inline fixtures', () => {
  it('single table ALL scan → Table Scan physicalOp', () => {
    const summary = analyzer.extractSummary(singleTableAllPlan);
    expect(summary.executionPath[0].physicalOp).toBe('Table Scan');
  });

  it('const access type → Constant Lookup physicalOp', () => {
    const summary = analyzer.extractSummary(constAccessPlan);
    expect(summary.executionPath[0].physicalOp).toBe('Constant Lookup');
  });

  it('no Table Scan flag for const access type', () => {
    const summary = analyzer.extractSummary(constAccessPlan);
    expect(summary.redFlags.find(f => f.type === 'Table Scan')).toBeUndefined();
  });

  it('using_filesort generates Sort Without Index red flag', () => {
    const summary = analyzer.extractSummary(filesortPlan);
    expect(summary.redFlags.find(f => f.type === 'Sort Without Index')).toBeDefined();
  });

  it('handles invalid JSON gracefully', () => {
    expect(() => analyzer.extractSummary('not json')).not.toThrow();
    expect(analyzer.extractSummary('not json').totalNodes).toBe(0);
  });

  it('handles missing query_block gracefully', () => {
    expect(analyzer.extractSummary('{}').totalNodes).toBe(0);
  });
});
