import type { PlanSummary } from '../../types';
import type { SupportedDialect } from './IExecutionPlanAnalyzer';
import { SQLServerPlanAnalyzer } from './SQLServerPlanAnalyzer';
import { PostgreSQLPlanAnalyzer } from './PostgreSQLPlanAnalyzer';
import { MySQLPlanAnalyzer } from './MySQLPlanAnalyzer';

const sqlServerAnalyzer = new SQLServerPlanAnalyzer();
const postgresAnalyzer = new PostgreSQLPlanAnalyzer();
const mysqlAnalyzer = new MySQLPlanAnalyzer();

export function detectDialect(input: string): SupportedDialect | 'unknown' {
  const s = input.trimStart();

  // SQL Server: XML-based
  if (s.startsWith('<') || s.includes('ShowPlanXML') || s.includes('BatchSequence')) {
    return 'sqlserver';
  }

  // Try JSON-based formats
  try {
    const parsed = JSON.parse(s);
    // PostgreSQL: EXPLAIN (FORMAT JSON) → array with Plan.Node Type
    if (Array.isArray(parsed) && parsed[0]?.Plan?.['Node Type']) {
      return 'postgresql';
    }
    // MySQL: EXPLAIN FORMAT=JSON → object with query_block
    if (parsed?.query_block) {
      return 'mysql';
    }
  } catch {
    // not JSON
  }

  return 'unknown';
}

export function analyzePlan(input: string, hint?: SupportedDialect): PlanSummary {
  const dialect = hint ?? detectDialect(input);

  switch (dialect) {
    case 'postgresql':
      return postgresAnalyzer.extractSummary(input);
    case 'mysql':
      return mysqlAnalyzer.extractSummary(input);
    case 'sqlserver':
    default:
      return SQLServerPlanAnalyzer.extractSummary(input);
  }
}
