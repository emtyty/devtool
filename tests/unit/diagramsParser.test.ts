import { describe, it, expect, vi } from 'vitest';
import { parseFlowchart } from '../../utils/diagrams/parser';

// Note: detectDiagramType + parseToIR depend on mermaid.parse(), which itself
// boots a heavy module on first call. Those are exercised end-to-end via the
// integration path; here we focus on the synchronous flowchart parser.

vi.mock('mermaid', () => ({ default: { parse: vi.fn() } }));

describe('parseFlowchart', () => {
  it('parses direction from `flowchart TB`', () => {
    const ir = parseFlowchart('flowchart TB\n  A --> B');
    expect(ir.direction).toBe('TB');
    expect(ir.type).toBe('flowchart');
  });

  it('parses direction from `graph LR`', () => {
    const ir = parseFlowchart('graph LR\n  A --> B');
    expect(ir.direction).toBe('LR');
  });

  it('normalizes TD to TB', () => {
    const ir = parseFlowchart('flowchart TD\n  A --> B');
    expect(ir.direction).toBe('TB');
  });

  it('extracts a simple two-node flowchart', () => {
    const ir = parseFlowchart('flowchart LR\n  A --> B');
    expect(ir.nodes).toHaveLength(2);
    expect(ir.nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
    expect(ir.edges).toEqual([
      expect.objectContaining({ source: 'A', target: 'B', kind: 'solid' }),
    ]);
  });

  it('extracts node labels with rectangle shape', () => {
    const ir = parseFlowchart('flowchart LR\n  A[Customer Service]');
    const a = ir.nodes.find((n) => n.id === 'A');
    expect(a?.label).toBe('Customer Service');
    expect(a?.kind).toBe('process');
  });

  it('recognizes round, circle, decision, cylinder, queue shapes', () => {
    const src = `flowchart LR
      A(Round)
      B((Circle))
      C{Decision}
      D[(Cylinder)]
      E[[Queue]]`;
    const ir = parseFlowchart(src);
    const byId = Object.fromEntries(ir.nodes.map((n) => [n.id, n]));
    expect(byId.A.kind).toBe('service');
    expect(byId.B.kind).toBe('user');
    expect(byId.C.kind).toBe('decision');
    expect(byId.D.kind).toBe('database');
    expect(byId.E.kind).toBe('queue');
  });

  it('parses `--label-->` style edge labels', () => {
    const ir = parseFlowchart('flowchart LR\n  A -- yes --> B');
    expect(ir.edges[0]).toEqual(
      expect.objectContaining({ source: 'A', target: 'B', label: 'yes' })
    );
  });

  it('parses `|label|` style edge labels', () => {
    const ir = parseFlowchart('flowchart LR\n  A -->|click| B');
    expect(ir.edges[0]).toEqual(
      expect.objectContaining({ source: 'A', target: 'B', label: 'click' })
    );
  });

  it('recognizes dashed and thick edge variants', () => {
    const ir = parseFlowchart(`flowchart LR
      A -.-> B
      C ==> D`);
    expect(ir.edges).toHaveLength(2);
    expect(ir.edges.find((e) => e.source === 'A')?.kind).toBe('dashed');
    expect(ir.edges.find((e) => e.source === 'C')?.kind).toBe('thick');
  });

  it('captures subgraphs and assigns nodes to them', () => {
    const src = `flowchart TB
      subgraph cloud [Cloud]
        A[App]
        B[(Db)]
      end
      U((User)) --> A`;
    const ir = parseFlowchart(src);
    expect(ir.subgraphs).toEqual([{ id: 'cloud', label: 'Cloud' }]);
    const a = ir.nodes.find((n) => n.id === 'A');
    const b = ir.nodes.find((n) => n.id === 'B');
    const u = ir.nodes.find((n) => n.id === 'U');
    expect(a?.subgraph).toBe('cloud');
    expect(b?.subgraph).toBe('cloud');
    expect(u?.subgraph).toBeUndefined();
  });

  it('parses :::icon= directive into NodeIR.icon', () => {
    const ir = parseFlowchart('flowchart LR\n  Db[Database]:::icon=logos:aws-rds');
    const db = ir.nodes.find((n) => n.id === 'Db');
    expect(db?.icon).toBe('logos:aws-rds');
    expect(db?.kind).toBe('icon');
  });

  it('strips quotes around node labels', () => {
    const ir = parseFlowchart('flowchart LR\n  A["Hello, World!"]');
    expect(ir.nodes[0].label).toBe('Hello, World!');
  });

  it('skips style/class/click/comment lines without erroring', () => {
    const src = `flowchart LR
      %% this is a comment
      A --> B
      style A fill:#f9f
      classDef big stroke-width:2px
      click A "https://example.com"`;
    const ir = parseFlowchart(src);
    expect(ir.nodes).toHaveLength(2);
    expect(ir.edges).toHaveLength(1);
  });

  it('handles bare id references (no shape)', () => {
    const ir = parseFlowchart('flowchart LR\n  alpha --> beta');
    expect(ir.nodes.map((n) => n.id).sort()).toEqual(['alpha', 'beta']);
    expect(ir.nodes.every((n) => n.kind === 'plain')).toBe(true);
  });

  it('upgrades a node when its label appears later in the source', () => {
    const src = `flowchart LR
      A --> B
      B[Build]`;
    const ir = parseFlowchart(src);
    const b = ir.nodes.find((n) => n.id === 'B');
    expect(b?.label).toBe('Build');
    expect(b?.kind).toBe('process');
  });

  it('keeps each unique edge', () => {
    const src = `flowchart TB
      A --> B
      A --> C
      B --> D
      C --> D`;
    const ir = parseFlowchart(src);
    expect(ir.edges).toHaveLength(4);
  });
});
