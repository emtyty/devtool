import { useEffect, useMemo, useRef } from 'react';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { buildGitGraphSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

type GitGraphRendererProps = RendererProps<'gitgraph'>;

export default function GitGraphRenderer({ ir, dark = false, handleRef }: GitGraphRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const svg = useMemo(() => buildGitGraphSvg(ir, { dark }), [ir, dark]);

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
      className="gitgraph-renderer"
      style={{ width: '100%', background: theme.canvasBg, borderRadius: 12, padding: 12, overflow: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
