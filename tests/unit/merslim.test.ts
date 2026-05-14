import { describe, it, expect } from 'vitest';
import { parseToIR, toSvgString, getSvgDimensions } from 'merslim';

describe('merslim integration', () => {
  it('parses a simple flowchart to IR', async () => {
    const result = await parseToIR('flowchart LR\n  A --> B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.type).toBe('flowchart');
  });

  it('parses a sequence diagram to IR', async () => {
    const result = await parseToIR('sequenceDiagram\n  A->>B: hello');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.type).toBe('sequence');
  });

  it('round-trips an SVG string with xmlns declaration', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
    const out = toSvgString(input);
    expect(out).toContain('<svg');
    expect(out).toContain('viewBox="0 0 100 100"');
  });

  it('reads dimensions from viewBox', () => {
    const dims = getSvgDimensions(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"></svg>'
    );
    expect(dims).toEqual({ width: 320, height: 240 });
  });
});
