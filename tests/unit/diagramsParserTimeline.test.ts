import { describe, it, expect, vi } from 'vitest';
import { parseGantt, parseTimeline, parseMindmap } from '../../utils/diagrams/parser';

vi.mock('mermaid', () => ({ default: { parse: vi.fn() } }));

describe('parseGantt', () => {
  it('parses tasks with explicit ISO start and a duration', () => {
    const ir = parseGantt(`gantt
      title Sample
      dateFormat YYYY-MM-DD
      section Phase 1
        Task A : a1, 2026-01-01, 30d
        Task B : a2, 2026-01-15, 10d`);
    expect(ir.type).toBe('gantt');
    expect(ir.title).toBe('Sample');
    expect(ir.dateFormat).toBe('YYYY-MM-DD');
    expect(ir.tasks).toHaveLength(2);
    expect(ir.tasks[0]).toMatchObject({ id: 'a1', label: 'Task A', section: 'Phase 1', status: 'default' });
    expect(ir.tasks[0].start.startsWith('2026-01-01')).toBe(true);
    // 30d after Jan 1 is Jan 31 (whichever timezone)
    expect(ir.tasks[0].end.startsWith('2026-01-31')).toBe(true);
    expect(ir.tasks[1]).toMatchObject({ id: 'a2', label: 'Task B' });
  });

  it('resolves "after <id>" to the previous task end', () => {
    const ir = parseGantt(`gantt
      dateFormat YYYY-MM-DD
        Task A : a1, 2026-02-01, 5d
        Task B : after a1, 3d`);
    expect(ir.tasks[1].start).toBe(ir.tasks[0].end);
  });

  it('captures status tokens (active / done / crit / milestone)', () => {
    const ir = parseGantt(`gantt
      dateFormat YYYY-MM-DD
        Done    : done, d1, 2026-01-01, 3d
        Active  : active, a1, 2026-01-04, 3d
        Crit    : crit, c1, 2026-01-07, 1d
        Mile    : milestone, m1, 2026-01-10, 0d`);
    expect(ir.tasks.map((t) => t.status)).toEqual(['done', 'active', 'crit', 'milestone']);
    // Milestone start === end
    const ms = ir.tasks[3];
    expect(ms.start).toBe(ms.end);
  });

  it('skips tasks where start cannot be resolved', () => {
    const ir = parseGantt(`gantt
        Bad task : nope, weird stuff`);
    expect(ir.tasks).toHaveLength(0);
  });
});

describe('parseTimeline', () => {
  it('parses periods grouped under sections', () => {
    const ir = parseTimeline(`timeline
      title History of the Web
      section Pre-2000
        1989 : Tim Berners-Lee invents the Web
        1993 : Mosaic browser
      section 2000s
        2003 : MySpace
        2004 : Facebook : Gmail`);
    expect(ir.title).toBe('History of the Web');
    expect(ir.events).toHaveLength(5);
    expect(ir.events[0]).toMatchObject({ period: '1989', text: 'Tim Berners-Lee invents the Web', section: 'Pre-2000' });
    // Two events in one line: `2004 : Facebook : Gmail`
    const events2004 = ir.events.filter((e) => e.period === '2004');
    expect(events2004.map((e) => e.text)).toEqual(['Facebook', 'Gmail']);
  });

  it('handles a flat timeline without sections', () => {
    const ir = parseTimeline(`timeline
      Day 1 : Kickoff
      Day 2 : Workshop`);
    expect(ir.events).toHaveLength(2);
    expect(ir.events[0].section).toBeUndefined();
    expect(ir.events[0].period).toBe('Day 1');
  });
});

describe('parseMindmap', () => {
  it('builds a tree using indentation', () => {
    const ir = parseMindmap(`mindmap
      root((Mindmap))
        Origins
          Long history
        Research
          Effectiveness`);
    expect(ir.type).toBe('mindmap');
    expect(ir.root.label).toBe('Mindmap');
    expect(ir.root.shape).toBe('circle');
    expect(ir.root.children.map((c) => c.label)).toEqual(['Origins', 'Research']);
    expect(ir.root.children[0].children.map((c) => c.label)).toEqual(['Long history']);
    expect(ir.root.children[1].children.map((c) => c.label)).toEqual(['Effectiveness']);
  });

  it('captures shape variants', () => {
    const ir = parseMindmap(`mindmap
      root((root))
        sq[Square]
        rd(Round)
        hx{{Hex}}`);
    const labels = ir.root.children.map((c) => ({ label: c.label, shape: c.shape }));
    expect(labels).toEqual([
      { label: 'Square', shape: 'square' },
      { label: 'Round', shape: 'rounded' },
      { label: 'Hex', shape: 'hexagon' },
    ]);
  });

  it('parses ::icon(...) suffix into an icon ref', () => {
    const ir = parseMindmap(`mindmap
      root((root))
        Cloud ::icon(logos:aws-rds)`);
    expect(ir.root.children[0].label).toBe('Cloud');
    expect(ir.root.children[0].icon).toBe('logos:aws-rds');
  });

  it('returns an empty fallback for empty input', () => {
    const ir = parseMindmap('mindmap');
    expect(ir.root.label).toBe('Mindmap');
    expect(ir.root.children).toEqual([]);
  });
});
