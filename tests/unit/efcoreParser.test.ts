import { describe, it, expect } from 'vitest';
import { parseEfCoreLog } from '../../utils/formatter';

describe('parseEfCoreLog', () => {
  it('should parse EF Core log and inline parameters', () => {
    const raw = `[Parameters=["@__p_1='200', @__ef_filter__PhotoStudioId_0='09a13814-66fb-44b8-8be8-d5778fc4b4e7', @cf_custom_array_Guid1='' (Nullable = false) (DbType = Object), @cf_custom_array_Guid2='' (Nullable = false) (DbType = Object)"], CommandType='"Text"', CommandTimeout='30']"\\n""SELECT TOP(@__p_1) [p].[ProductId], [p].[CFBarcode], [p].[ClientId]\\nFROM [Product] AS [p]\\nWHERE [p].[PhotoStudioId] = @__ef_filter__PhotoStudioId_0 AND [p].[IsDeleted] = CAST(0 AS bit) AND [p].[ClientId] IN (SELECT ID FROM @cf_custom_array_Guid2)\\nORDER BY [p].[ProductId]"`;

    const result = parseEfCoreLog(raw);
    expect(result).not.toBeNull();
    // @__p_1 should be replaced with numeric 200 (no quotes)
    expect(result).toContain('TOP(200)');
    // @__ef_filter__PhotoStudioId_0 should be replaced with quoted GUID
    expect(result).toContain("'09a13814-66fb-44b8-8be8-d5778fc4b4e7'");
    // Empty params should NOT be replaced — @cf_custom_array_Guid2 stays as-is
    expect(result).toContain('@cf_custom_array_Guid2');
    // Literal \n should become real newlines
    expect(result).toContain('\n');
    // Should not contain EF Core metadata
    expect(result).not.toContain('Parameters=');
    expect(result).not.toContain('CommandType');
    expect(result).not.toContain('CommandTimeout');
  });

  it('should return null for non-EF Core input', () => {
    expect(parseEfCoreLog('SELECT * FROM users')).toBeNull();
    expect(parseEfCoreLog('')).toBeNull();
    expect(parseEfCoreLog('{ "json": true }')).toBeNull();
  });
});
