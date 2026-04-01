import type { PlanSummary } from '../../types';

export type SupportedDialect = 'sqlserver' | 'postgresql' | 'mysql';

export interface IExecutionPlanAnalyzer {
  readonly dialect: SupportedDialect;
  extractSummary(input: string): PlanSummary;
}
