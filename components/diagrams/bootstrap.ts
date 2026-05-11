// One-time registration of native renderers.
//
// Imported by every consumer that wants registry dispatch (MarkdownPreview,
// DiagramGenerator). Loaders are dynamic — the actual renderer modules
// (and their ReactFlow / dagre / iconify dependencies) are not pulled into
// the importing chunk until a diagram of that type renders.

import { register } from '../../utils/diagrams/registry';

let bootstrapped = false;

export function bootstrapDiagramRenderers(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  register({
    type: 'flowchart',
    loader: () => import('./FlowchartRenderer'),
  });

  register({
    type: 'er',
    loader: () => import('./ERRenderer'),
  });

  register({
    type: 'pie',
    loader: () => import('./PieRenderer'),
  });

  register({
    type: 'quadrant',
    loader: () => import('./QuadrantRenderer'),
  });

  register({
    type: 'journey',
    loader: () => import('./JourneyRenderer'),
  });

  register({
    type: 'sequence',
    loader: () => import('./SequenceRenderer'),
  });

  register({
    type: 'class',
    loader: () => import('./ClassRenderer'),
  });

  register({
    type: 'state',
    loader: () => import('./StateRenderer'),
  });

  register({
    type: 'gantt',
    loader: () => import('./GanttRenderer'),
  });

  register({
    type: 'timeline',
    loader: () => import('./TimelineRenderer'),
  });

  register({
    type: 'mindmap',
    loader: () => import('./MindmapRenderer'),
  });

  register({
    type: 'architecture',
    loader: () => import('./ArchitectureRenderer'),
  });

  register({
    type: 'c4',
    loader: () => import('./C4Renderer'),
  });

  register({
    type: 'gitgraph',
    loader: () => import('./GitGraphRenderer'),
  });
}
