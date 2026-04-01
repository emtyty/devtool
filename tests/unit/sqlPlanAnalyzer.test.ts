import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SQLServerPlanAnalyzer as SQLPlanAnalyzer } from '../../lib/plan/SQLServerPlanAnalyzer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── XML Fixtures ─────────────────────────────────────────────────────────────

const planXml = readFileSync(join(__dirname, '../fixtures/plan.xml'), 'utf-8');
const planAfterXml = readFileSync(join(__dirname, '../fixtures/plan-after.xml'), 'utf-8');

/** Minimal XML with a table scan only */
const tableScanXml = `
<ShowPlanXML>
  <BatchSequence><Batch><Statements>
    <StmtSimple StatementText="SELECT * FROM t">
      <QueryPlan>
        <RelOp NodeId="0" PhysicalOp="Table Scan" LogicalOp="Table Scan"
               EstimatedTotalSubtreeCost="1.5" EstimateRows="500">
        </RelOp>
      </QueryPlan>
    </StmtSimple>
  </Statements></Batch></BatchSequence>
</ShowPlanXML>`;

/** Minimal XML with multiple ops */
const multiOpXml = `
<ShowPlanXML>
  <BatchSequence><Batch><Statements>
    <StmtSimple StatementText="SELECT * FROM a JOIN b ON a.id = b.id">
      <QueryPlan>
        <RelOp NodeId="0" PhysicalOp="Nested Loops" LogicalOp="Inner Join"
               EstimatedTotalSubtreeCost="2.0" EstimateRows="100">
          <NestedLoops>
            <RelOp NodeId="1" PhysicalOp="Index Seek" LogicalOp="Index Seek"
                   EstimatedTotalSubtreeCost="0.5" EstimateRows="50" />
            <RelOp NodeId="2" PhysicalOp="Index Seek" LogicalOp="Index Seek"
                   EstimatedTotalSubtreeCost="0.3" EstimateRows="2" />
          </NestedLoops>
        </RelOp>
      </QueryPlan>
    </StmtSimple>
  </Statements></Batch></BatchSequence>
</ShowPlanXML>`;

/** XML with Key Lookup */
const keyLookupXml = `
<ShowPlanXML>
  <BatchSequence><Batch><Statements>
    <StmtSimple StatementText="SELECT * FROM t WHERE col = 1">
      <QueryPlan>
        <RelOp NodeId="0" PhysicalOp="Key Lookup" LogicalOp="Key Lookup"
               EstimatedTotalSubtreeCost="0.8" EstimateRows="10">
        </RelOp>
      </QueryPlan>
    </StmtSimple>
  </Statements></Batch></BatchSequence>
</ShowPlanXML>`;

// ─── extractSummary ───────────────────────────────────────────────────────────

describe('SQLPlanAnalyzer.extractSummary', () => {
  it('U-SQL-01: counts total RelOp nodes correctly', () => {
    const summary = SQLPlanAnalyzer.extractSummary(tableScanXml);
    expect(summary.totalNodes).toBe(1);
  });

  it('counts 3 nodes in multiOpXml', () => {
    const summary = SQLPlanAnalyzer.extractSummary(multiOpXml);
    expect(summary.totalNodes).toBe(3);
  });

  it('U-SQL-02: total cost equals first RelOp EstimatedTotalSubtreeCost', () => {
    const summary = SQLPlanAnalyzer.extractSummary(tableScanXml);
    expect(summary.totalCost).toBeCloseTo(1.5, 5);
  });

  it('U-SQL-03: groups operations by PhysicalOp', () => {
    const summary = SQLPlanAnalyzer.extractSummary(multiOpXml);
    const opNames = summary.operations.map(o => o.name);
    expect(opNames).toContain('Index Seek');
    const seekOp = summary.operations.find(o => o.name === 'Index Seek');
    expect(seekOp?.count).toBe(2);
  });

  it('U-SQL-04: detects Table Scan red flag', () => {
    const summary = SQLPlanAnalyzer.extractSummary(tableScanXml);
    const types = summary.redFlags.map(f => f.type);
    expect(types).toContain('Table Scan');
    const flag = summary.redFlags.find(f => f.type === 'Table Scan');
    expect(flag).toBeDefined();
  });

  it('U-SQL-05: detects Key Lookup red flag', () => {
    const summary = SQLPlanAnalyzer.extractSummary(keyLookupXml);
    const flag = summary.redFlags.find(f => f.type === 'Key Lookup');
    expect(flag).toBeDefined();
  });

  it('U-SQL-07: parses missing index and generates CREATE INDEX', () => {
    const summary = SQLPlanAnalyzer.extractSummary(planXml);
    expect(summary.missingIndexes.length).toBeGreaterThan(0);
    const idx = summary.missingIndexes[0];
    expect(idx).toContain('CREATE NONCLUSTERED INDEX');
    expect(idx).toContain('[dbo]');
    expect(idx).toContain('[Users]');
    expect(idx).toContain('[Id]');
    expect(idx).toContain('INCLUDE');
  });

  it('statementText is extracted correctly', () => {
    const summary = SQLPlanAnalyzer.extractSummary(planXml);
    expect(summary.statementText).toContain('SELECT');
    expect(summary.statementText).toContain('Users');
  });

  it('U-SQL-09: handles invalid/empty XML gracefully without throwing', () => {
    expect(() => SQLPlanAnalyzer.extractSummary('not xml at all')).not.toThrow();
    expect(() => SQLPlanAnalyzer.extractSummary('')).not.toThrow();
  });

  it('returns zero nodes and cost for empty XML', () => {
    const summary = SQLPlanAnalyzer.extractSummary('<root/>');
    expect(summary.totalNodes).toBe(0);
    expect(summary.totalCost).toBe(0);
    expect(summary.missingIndexes).toEqual([]);
    expect(summary.redFlags).toEqual([]);
  });

  it('after-plan has no table scan red flags', () => {
    const summary = SQLPlanAnalyzer.extractSummary(planAfterXml);
    const tableScanFlag = summary.redFlags.find(f => f.description.includes('Table Scan'));
    expect(tableScanFlag).toBeUndefined();
  });
});

// ─── pruneExecutionPlan ───────────────────────────────────────────────────────

describe('SQLPlanAnalyzer.pruneExecutionPlan', () => {
  it('U-SQL-08: output length is under 30,000 characters', () => {
    const result = SQLPlanAnalyzer.pruneExecutionPlan(planXml);
    expect(result.length).toBeLessThanOrEqual(30000);
  });

  it('removes RunTimeInformation tags', () => {
    const xml = `<root><RunTimeInformation><RunTimeCountersPerThread /></RunTimeInformation><RelOp/></root>`;
    const result = SQLPlanAnalyzer.pruneExecutionPlan(xml);
    expect(result).not.toContain('RunTimeInformation');
  });

  it('returns a string even for invalid XML', () => {
    const result = SQLPlanAnalyzer.pruneExecutionPlan('not xml');
    expect(typeof result).toBe('string');
  });
});

// ─── getMetrics ───────────────────────────────────────────────────────────────

describe('SQLPlanAnalyzer.getMetrics', () => {
  it('returns cost from StatementSubtreeCost attribute', () => {
    const metrics = SQLPlanAnalyzer.getMetrics(planXml);
    expect(metrics.cost).toBeGreaterThan(0);
  });

  it('returns top 3 bottleneck operators sorted by subtree cost', () => {
    const metrics = SQLPlanAnalyzer.getMetrics(planXml);
    expect(Array.isArray(metrics.bottlenecks)).toBe(true);
    expect(metrics.bottlenecks.length).toBeLessThanOrEqual(3);
  });
});
