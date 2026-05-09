import { useEffect, useMemo, useRef } from 'react';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { buildGanttSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

type GanttRendererProps = RendererProps<'gantt'>;

// On-screen rendering = export rendering. We reuse `buildGanttSvg` (the same
// builder that produces SVG/PNG downloads) and inline the SVG markup. This
// keeps "what you see is what you export" guaranteed by construction, and
// drops the vis-timeline dependency for Gantt diagrams.

export default function GanttRenderer({ ir, dark = false, handleRef }: GanttRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const svg = useMemo(() => buildGanttSvg(ir, { dark }), [ir, dark]);

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
      className="gantt-renderer"
      style={{ width: '100%', background: theme.canvasBg, borderRadius: 12, padding: 12, overflowX: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
