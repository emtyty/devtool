import type { DiagramOutput, FlowchartNode } from './diagramParser';

export function buildSequenceMermaid(data: DiagramOutput['sequence']): string {
  const lines: string[] = ['sequenceDiagram'];

  for (const p of data.participants) {
    lines.push(`    participant ${p.id} as ${p.label}`);
  }

  lines.push('');

  for (const step of data.steps) {
    lines.push(`    ${step.from}->>+${step.to}: ${step.label}`);
  }

  // Add return arrows for service-to-service calls
  if (data.steps.length > 0) {
    const last = data.steps[data.steps.length - 1];
    lines.push(`    ${last.to}-->>-${data.steps[0].from}: response`);
  }

  return lines.join('\n');
}

function nodeShape(node: FlowchartNode): string {
  switch (node.type) {
    case 'database':
      return `${node.id}[(${node.label})]`;
    case 'queue':
      return `${node.id}[[${node.label}]]`;
    case 'storage':
      return `${node.id}[("${node.label}")]`;
    case 'user':
      return `${node.id}(("${node.label}"))`;
    case 'external':
      return `${node.id}{{${node.label}}}`;
    case 'client':
      return `${node.id}[/"${node.label}"\\]`;
    default:
      return `${node.id}[${node.label}]`;
  }
}

const STYLE_COLORS: Record<string, string> = {
  user: '#3b82f6,#fff,#3b82f6',
  client: '#8b5cf6,#fff,#8b5cf6',
  service: '#10b981,#fff,#10b981',
  database: '#f59e0b,#fff,#f59e0b',
  queue: '#ec4899,#fff,#ec4899',
  storage: '#06b6d4,#fff,#06b6d4',
  external: '#6b7280,#fff,#6b7280',
};

function buildStyleLines(nodes: FlowchartNode[]): string[] {
  const lines: string[] = [''];
  const typeGroups: Record<string, string[]> = {};
  for (const node of nodes) {
    if (!typeGroups[node.type]) typeGroups[node.type] = [];
    typeGroups[node.type].push(node.id);
  }
  for (const [type, ids] of Object.entries(typeGroups)) {
    const colors = STYLE_COLORS[type] || '#64748b,#fff,#64748b';
    const [fill, color, stroke] = colors.split(',');
    lines.push(`    style ${ids.join(',')} fill:${fill},color:${color},stroke:${stroke}`);
  }
  return lines;
}

export function buildFlowchartMermaid(data: DiagramOutput['flowchart']): string {
  const lines: string[] = ['flowchart LR'];
  const subgroups = data.subgroups || [];
  const hasSubgroups = subgroups.length > 0;

  if (hasSubgroups) {
    // Group nodes by subgroup
    const grouped = new Map<string, FlowchartNode[]>();
    const ungrouped: FlowchartNode[] = [];

    for (const node of data.nodes) {
      if (node.subgroup) {
        const list = grouped.get(node.subgroup) || [];
        list.push(node);
        grouped.set(node.subgroup, list);
      } else {
        ungrouped.push(node);
      }
    }

    // Render ungrouped nodes first
    for (const node of ungrouped) {
      lines.push(`    ${nodeShape(node)}`);
    }

    // Render subgroups
    for (const sg of subgroups) {
      const nodes = grouped.get(sg.id) || [];
      lines.push(`    subgraph ${sg.id}["${sg.name}"]`);
      for (const node of nodes) {
        lines.push(`        ${nodeShape(node)}`);
      }
      lines.push('    end');
    }
  } else {
    // No subgroups — flat list
    for (const node of data.nodes) {
      lines.push(`    ${nodeShape(node)}`);
    }
  }

  lines.push('');

  // Define edges
  for (const edge of data.edges) {
    if (edge.label) {
      lines.push(`    ${edge.from} -->|${edge.label}| ${edge.to}`);
    } else {
      lines.push(`    ${edge.from} --> ${edge.to}`);
    }
  }

  // Add styling
  lines.push(...buildStyleLines(data.nodes));

  return lines.join('\n');
}
