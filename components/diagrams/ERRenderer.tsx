import { useEffect, useMemo, useRef } from 'react';
import dagre from 'dagre';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { buildErSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

// Sizing constants — kept in sync with buildErSvg's table layout.
const TABLE_NODE_WIDTH = 240;
const TABLE_HEADER_HEIGHT = 34;
const TABLE_ROW_HEIGHT = 26;

type ERRendererProps = RendererProps<'er'>;

// SVG-first ER renderer. Layout is computed with dagre; the rendered SVG
// is the same one used for SVG/PNG download.

export default function ERRenderer({ ir, dark = false, handleRef }: ERRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const svg = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 24, marginy: 24 });
    g.setDefaultEdgeLabel(() => ({}));

    const tableHeight = (cols: number) => TABLE_HEADER_HEIGHT + cols * TABLE_ROW_HEIGHT;

    for (const table of ir.schema.tables) {
      g.setNode(table.name, { width: TABLE_NODE_WIDTH, height: tableHeight(table.columns.length) });
    }
    for (const rel of ir.schema.relations) {
      if (g.hasNode(rel.fromTable) && g.hasNode(rel.toTable)) g.setEdge(rel.fromTable, rel.toTable);
    }
    dagre.layout(g);

    const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const table of ir.schema.tables) {
      const { x, y } = g.node(table.name) as { x: number; y: number };
      const h = tableHeight(table.columns.length);
      positions.set(table.name, { x: x - TABLE_NODE_WIDTH / 2, y: y - h / 2, width: TABLE_NODE_WIDTH, height: h });
    }
    return buildErSvg(ir, positions, { dark });
  }, [ir, dark]);

  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () => svgStringToElement(svg),
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, svg]);

  return (
    <div
      ref={containerRef}
      className="er-renderer"
      style={{ width: '100%', background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
