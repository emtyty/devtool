import { describe, it, expect, vi } from 'vitest';
import {
  parseClassDiagram,
  parseStateDiagram,
  parseMermaidERDiagram,
} from '../../utils/diagrams/parser';

vi.mock('mermaid', () => ({ default: { parse: vi.fn() } }));

describe('parseClassDiagram', () => {
  it('parses an inline class block with attributes and methods', () => {
    const ir = parseClassDiagram(`classDiagram
      class Animal {
        +String name
        -int age
        +isMammal() bool
      }`);
    expect(ir.classes).toHaveLength(1);
    const animal = ir.classes[0];
    expect(animal.id).toBe('Animal');
    expect(animal.members).toHaveLength(3);
    expect(animal.members[0]).toMatchObject({ kind: 'attribute', visibility: 'public', name: 'name', returnType: 'String' });
    expect(animal.members[1]).toMatchObject({ kind: 'attribute', visibility: 'private', name: 'age' });
    expect(animal.members[2]).toMatchObject({ kind: 'method', visibility: 'public', name: 'isMammal', returnType: 'bool' });
  });

  it('parses inheritance with the base on the left of <|--', () => {
    const ir = parseClassDiagram(`classDiagram
      Animal <|-- Duck`);
    expect(ir.relations).toHaveLength(1);
    expect(ir.relations[0]).toEqual({
      source: 'Duck',
      target: 'Animal',
      kind: 'inheritance',
      label: undefined,
    });
  });

  it('parses composition, aggregation, and association arrows', () => {
    const ir = parseClassDiagram(`classDiagram
      Car *-- Engine
      Library o-- Book
      User -- Account`);
    const kinds = ir.relations.map((r) => r.kind);
    expect(kinds).toEqual(['composition', 'aggregation', 'association']);
  });

  it('parses relation with label after a colon', () => {
    const ir = parseClassDiagram(`classDiagram
      A <|-- B : extends`);
    expect(ir.relations[0].label).toBe('extends');
  });

  it('handles X : member syntax', () => {
    const ir = parseClassDiagram(`classDiagram
      class Animal
      Animal : +String name
      Animal : +eat()`);
    const animal = ir.classes[0];
    expect(animal.members.length).toBe(2);
    expect(animal.members[0].name).toBe('name');
    expect(animal.members[1].kind).toBe('method');
  });
});

describe('parseStateDiagram', () => {
  it('builds states + transitions, including [*] start and end markers', () => {
    const ir = parseStateDiagram(`stateDiagram-v2
      [*] --> Still
      Still --> Moving : start
      Moving --> Crash
      Crash --> [*]`);

    // States: __start, Still, Moving, Crash, __end
    const stateLabels = ir.states.map((s) => s.label);
    expect(stateLabels).toContain('Still');
    expect(stateLabels).toContain('Moving');
    expect(stateLabels).toContain('Crash');
    const startMarker = ir.states.find((s) => s.kind === 'start');
    const endMarker = ir.states.find((s) => s.kind === 'end');
    expect(startMarker).toBeDefined();
    expect(endMarker).toBeDefined();

    expect(ir.transitions).toHaveLength(4);
    const labeled = ir.transitions.find((t) => t.label === 'start');
    expect(labeled?.target).toBe('Moving');
  });

  it('captures `state : label` declarations as state labels', () => {
    const ir = parseStateDiagram(`stateDiagram-v2
      Loading : Loading data...
      Ready : Ready to go
      Loading --> Ready`);
    expect(ir.states.find((s) => s.id === 'Loading')?.label).toBe('Loading data...');
    expect(ir.states.find((s) => s.id === 'Ready')?.label).toBe('Ready to go');
  });

  it('parses composite states with `state X { ... }` blocks', () => {
    const ir = parseStateDiagram(`stateDiagram-v2
      [*] --> Draft
      Draft --> Processing : submit
      Processing --> Done : finished
      Done --> [*]
      state Processing {
          [*] --> Picking
          Picking --> Packing
          Packing --> [*]
      }`);
    const processing = ir.states.find((s) => s.id === 'Processing');
    expect(processing?.kind).toBe('composite');
    const childIds = ir.states.filter((s) => s.parent === 'Processing').map((s) => s.id).sort();
    expect(childIds).toContain('Picking');
    expect(childIds).toContain('Packing');
    // Each composite gets its own scoped start/end markers.
    expect(childIds).toContain('__start_Processing');
    expect(childIds).toContain('__end_Processing');
    // Top-level [*] markers stay global.
    expect(ir.states.some((s) => s.id === '__start')).toBe(true);
    expect(ir.states.some((s) => s.id === '__end')).toBe(true);
    // Inner transitions are tagged with parent.
    const inner = ir.transitions.filter((t) => t.parent === 'Processing');
    expect(inner.length).toBeGreaterThanOrEqual(3);
    // Outer transition Draft → Processing references the composite, not a child.
    const outer = ir.transitions.find((t) => t.source === 'Draft' && t.target === 'Processing');
    expect(outer).toBeDefined();
  });
});

describe('parseMermaidERDiagram', () => {
  it('extracts tables, columns, and relations', () => {
    const ir = parseMermaidERDiagram(`erDiagram
      CUSTOMER ||--o{ ORDER : places
      CUSTOMER {
        string name PK
        string email
      }
      ORDER {
        int orderId PK
        date date
      }`);
    expect(ir.type).toBe('er');
    expect(ir.schema.tables).toHaveLength(2);
    const customer = ir.schema.tables.find((t) => t.name === 'CUSTOMER');
    expect(customer?.columns).toHaveLength(2);
    expect(customer?.columns[0]).toMatchObject({ name: 'name', type: 'string', isPK: true });
    expect(ir.schema.relations).toHaveLength(1);
    expect(ir.schema.relations[0]).toMatchObject({
      fromTable: 'CUSTOMER',
      toTable: 'ORDER',
    });
  });

  it('marks nullable cardinality (`o`) on relations', () => {
    const ir = parseMermaidERDiagram(`erDiagram
      A ||--o{ B : has`);
    expect(ir.schema.relations[0].nullable).toBe(true);
  });
});
