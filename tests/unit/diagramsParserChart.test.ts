import { describe, it, expect, vi } from 'vitest';
import {
  parsePieChart,
  parseQuadrantChart,
  parseJourney,
  parseSequence,
} from '../../utils/diagrams/parser';

vi.mock('mermaid', () => ({ default: { parse: vi.fn() } }));

describe('parsePieChart', () => {
  it('parses title + slices', () => {
    const ir = parsePieChart(`pie
      title Browser Share
      "Chrome" : 65
      "Firefox" : 18
      "Safari" : 12.5`);
    expect(ir.type).toBe('pie');
    expect(ir.title).toBe('Browser Share');
    expect(ir.slices).toEqual([
      { label: 'Chrome', value: 65 },
      { label: 'Firefox', value: 18 },
      { label: 'Safari', value: 12.5 },
    ]);
    expect(ir.showData).toBeUndefined();
  });

  it('detects showData flag', () => {
    const ir = parsePieChart(`pie showData
      "A" : 1`);
    expect(ir.showData).toBe(true);
  });

  it('skips comments and blanks', () => {
    const ir = parsePieChart(`pie
      %% a comment
      title T

      "X" : 1`);
    expect(ir.title).toBe('T');
    expect(ir.slices).toHaveLength(1);
  });
});

describe('parseQuadrantChart', () => {
  it('parses title, axes, quadrant labels, and points', () => {
    const ir = parseQuadrantChart(`quadrantChart
      title Reach and Engagement
      x-axis Low Reach --> High Reach
      y-axis Low Engagement --> High Engagement
      quadrant-1 We should expand
      quadrant-2 Need to promote
      quadrant-3 Re-evaluate
      quadrant-4 May be improved
      Campaign A: [0.3, 0.6]
      Campaign B: [0.45, 0.23]`);
    expect(ir.title).toBe('Reach and Engagement');
    expect(ir.xAxisLabel).toEqual({ low: 'Low Reach', high: 'High Reach' });
    expect(ir.yAxisLabel).toEqual({ low: 'Low Engagement', high: 'High Engagement' });
    expect(ir.quadrantLabels).toEqual({
      q1: 'We should expand',
      q2: 'Need to promote',
      q3: 'Re-evaluate',
      q4: 'May be improved',
    });
    expect(ir.points).toEqual([
      { label: 'Campaign A', x: 0.3, y: 0.6 },
      { label: 'Campaign B', x: 0.45, y: 0.23 },
    ]);
  });

  it('handles missing optional sections', () => {
    const ir = parseQuadrantChart(`quadrantChart
      Foo: [0.5, 0.5]`);
    expect(ir.title).toBeUndefined();
    expect(ir.points).toHaveLength(1);
  });
});

describe('parseJourney', () => {
  it('groups tasks under sections', () => {
    const ir = parseJourney(`journey
      title My day
      section Morning
        Wake up: 3: Me
        Coffee: 5: Me
      section Afternoon
        Coding: 5: Me, Cat`);
    expect(ir.title).toBe('My day');
    expect(ir.sections).toHaveLength(2);
    expect(ir.sections[0]).toEqual({
      title: 'Morning',
      tasks: [
        { label: 'Wake up', score: 3, actors: ['Me'] },
        { label: 'Coffee', score: 5, actors: ['Me'] },
      ],
    });
    expect(ir.sections[1].tasks[0].actors).toEqual(['Me', 'Cat']);
  });
});

describe('parseSequence', () => {
  it('extracts participants from messages and explicit declarations', () => {
    const ir = parseSequence(`sequenceDiagram
      participant Alice
      participant John as John Smith
      Alice->>John: Hello
      John-->>Alice: Hi
      Bob->>Alice: Surprise`);
    const ids = ir.participants.map((p) => p.id);
    expect(ids).toEqual(['Alice', 'John', 'Bob']);
    const john = ir.participants.find((p) => p.id === 'John');
    expect(john?.label).toBe('John Smith');
  });

  it('parses message arrows with their kinds', () => {
    const ir = parseSequence(`sequenceDiagram
      A->>B: sync
      B-->>A: reply
      A-)B: async
      A-xB: cross`);
    const messages = ir.steps.filter((s) => s.kind === 'message');
    expect(messages).toHaveLength(4);
    expect(messages.map((m: any) => m.arrow)).toEqual(['sync', 'reply', 'async', 'cross']);
    expect((messages[0] as any).label).toBe('sync');
  });

  it('parses notes (over / left of / right of)', () => {
    const ir = parseSequence(`sequenceDiagram
      Alice->>Bob: hi
      Note over Alice,Bob: shared note
      Note left of Alice: ping
      Note right of Bob: pong`);
    const notes = ir.steps.filter((s) => s.kind === 'note');
    expect(notes).toHaveLength(3);
    expect((notes[0] as any).side).toBe('over');
    expect((notes[0] as any).participants).toEqual(['Alice', 'Bob']);
    expect((notes[1] as any).side).toBe('left');
    expect((notes[2] as any).side).toBe('right');
  });

  it('preserves step order', () => {
    const ir = parseSequence(`sequenceDiagram
      A->>B: 1
      Note over A: between
      B-->>A: 2`);
    expect(ir.steps.map((s) => s.kind)).toEqual(['message', 'note', 'message']);
  });

  it('accepts identifiers with spaces in arrows', () => {
    const ir = parseSequence(`sequenceDiagram
      Order Service->>Order DB: INSERT
      Order DB-->>Order Service: row id`);
    const messages = ir.steps.filter((s) => s.kind === 'message');
    expect(messages).toHaveLength(2);
    expect(messages.map((m: any) => [m.from, m.to])).toEqual([
      ['Order Service', 'Order DB'],
      ['Order DB', 'Order Service'],
    ]);
    expect(ir.participants.map((p) => p.id).sort()).toEqual(['Order DB', 'Order Service']);
  });

  it('strips activation modifiers (`+`/`-`) before the target id', () => {
    const ir = parseSequence(`sequenceDiagram
      A->>+B: open
      A->>-B: close`);
    const msgs = ir.steps.filter((s) => s.kind === 'message') as any[];
    expect(msgs.map((m) => m.to)).toEqual(['B', 'B']);
    expect(ir.participants.map((p) => p.id).sort()).toEqual(['A', 'B']);
  });

  it('skips loop / alt / opt / activate keywords without breaking', () => {
    const ir = parseSequence(`sequenceDiagram
      participant A
      participant B
      loop Every minute
        A->>B: ping
      end
      alt success
        B-->>A: pong
      else failure
        B-->>A: error
      end
      activate A
      deactivate A`);
    const msgs = ir.steps.filter((s) => s.kind === 'message') as any[];
    expect(msgs).toHaveLength(3);
    expect(msgs.map((m) => m.label)).toEqual(['ping', 'pong', 'error']);
  });

  it('handles quoted participant names', () => {
    const ir = parseSequence(`sequenceDiagram
      participant "John Doe"
      participant Bob
      "John Doe"->>Bob: hi`);
    expect(ir.participants[0].id).toBe('John Doe');
    expect(ir.steps).toHaveLength(1);
  });
});
