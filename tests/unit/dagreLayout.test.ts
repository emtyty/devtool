import { describe, it, expect } from 'vitest';
import { layoutFlowchart } from '../../utils/diagrams/layout/dagreLayout';
import type { FlowchartIR } from '../../utils/diagrams/types';

const baseFlowchart = (extras: Partial<FlowchartIR> = {}): FlowchartIR => ({
  type: 'flowchart',
  direction: 'LR',
  nodes: [],
  edges: [],
  ...extras,
});

describe('layoutFlowchart', () => {
  it('positions every node and reports a bounding box', () => {
    const ir = baseFlowchart({
      nodes: [
        { id: 'A', label: 'A', kind: 'process' },
        { id: 'B', label: 'B', kind: 'process' },
        { id: 'C', label: 'C', kind: 'process' },
      ],
      edges: [
        { source: 'A', target: 'B', kind: 'solid' },
        { source: 'B', target: 'C', kind: 'solid' },
      ],
    });

    const result = layoutFlowchart(ir);
    expect(result.nodePositions.size).toBe(3);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('lays out LR direction with nodes ordered left to right', () => {
    const ir = baseFlowchart({
      direction: 'LR',
      nodes: [
        { id: 'A', label: 'A', kind: 'process' },
        { id: 'B', label: 'B', kind: 'process' },
      ],
      edges: [{ source: 'A', target: 'B', kind: 'solid' }],
    });
    const result = layoutFlowchart(ir);
    const a = result.nodePositions.get('A')!;
    const b = result.nodePositions.get('B')!;
    expect(a.x).toBeLessThan(b.x);
  });

  it('lays out TB direction with nodes ordered top to bottom', () => {
    const ir = baseFlowchart({
      direction: 'TB',
      nodes: [
        { id: 'A', label: 'A', kind: 'process' },
        { id: 'B', label: 'B', kind: 'process' },
      ],
      edges: [{ source: 'A', target: 'B', kind: 'solid' }],
    });
    const result = layoutFlowchart(ir);
    const a = result.nodePositions.get('A')!;
    const b = result.nodePositions.get('B')!;
    expect(a.y).toBeLessThan(b.y);
  });

  it('respects per-node sizes from the map', () => {
    const ir = baseFlowchart({
      nodes: [
        { id: 'A', label: 'A', kind: 'process' },
        { id: 'B', label: 'B', kind: 'process' },
      ],
      edges: [{ source: 'A', target: 'B', kind: 'solid' }],
    });
    const sizes = new Map([
      ['A', { width: 300, height: 150 }],
      ['B', { width: 80, height: 40 }],
    ]);
    const result = layoutFlowchart(ir, { nodeSizes: sizes });
    expect(result.nodePositions.size).toBe(2);
    // A is the wider node — final canvas width should reflect it
    expect(result.width).toBeGreaterThan(300);
  });

  it('skips edges whose endpoints are unknown', () => {
    const ir = baseFlowchart({
      nodes: [{ id: 'A', label: 'A', kind: 'process' }],
      edges: [
        { source: 'A', target: 'X', kind: 'solid' }, // X doesn't exist
      ],
    });
    const result = layoutFlowchart(ir);
    expect(result.nodePositions.size).toBe(1);
  });

  it('treats subgraphs as compound parents', () => {
    const ir = baseFlowchart({
      direction: 'TB',
      nodes: [
        { id: 'A', label: 'A', kind: 'process', subgraph: 'cloud' },
        { id: 'B', label: 'B', kind: 'process', subgraph: 'cloud' },
        { id: 'C', label: 'C', kind: 'process' },
      ],
      edges: [
        { source: 'A', target: 'B', kind: 'solid' },
        { source: 'B', target: 'C', kind: 'solid' },
      ],
      subgraphs: [{ id: 'cloud', label: 'Cloud' }],
    });
    const result = layoutFlowchart(ir);
    expect(result.nodePositions.has('A')).toBe(true);
    expect(result.nodePositions.has('B')).toBe(true);
    expect(result.nodePositions.has('C')).toBe(true);
  });
});
