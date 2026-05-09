import { useEffect, useMemo, useRef } from 'react';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { buildTimelineSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

type TimelineRendererProps = RendererProps<'timeline'>;

// On-screen rendering = export rendering. See GanttRenderer for the rationale.

export default function TimelineRenderer({ ir, dark = false, handleRef }: TimelineRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const svg = useMemo(() => buildTimelineSvg(ir, { dark }), [ir, dark]);

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
      className="timeline-renderer"
      style={{ width: '100%', background: theme.canvasBg, borderRadius: 12, padding: 12, overflowX: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
