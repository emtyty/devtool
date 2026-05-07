import {
  useEffect,
  useState,
  useRef,
  lazy,
  Suspense,
  type LazyExoticComponent,
  type ComponentType,
  type RefObject,
} from 'react';
import mermaid from 'mermaid';
import { parseToIR } from '../../utils/diagrams/parser';
import {
  getRenderer,
  type RendererHandle,
  type RendererProps,
} from '../../utils/diagrams/registry';
import type { DiagramIR, DiagramType, ParseResult } from '../../utils/diagrams/types';

// Cache lazy-loaded renderer components by diagram type so React.lazy is
// invoked exactly once per type, not every render.
const LAZY_RENDERERS = new Map<DiagramType, LazyExoticComponent<ComponentType<RendererProps>>>();

function getLazyRenderer(type: DiagramType) {
  let lazyComp = LAZY_RENDERERS.get(type);
  if (lazyComp) return lazyComp;
  const entry = getRenderer(type);
  if (!entry) return null;
  lazyComp = lazy(entry.loader as () => Promise<{ default: ComponentType<RendererProps> }>);
  LAZY_RENDERERS.set(type, lazyComp);
  return lazyComp;
}

interface DiagramRendererProps {
  /** Mermaid source. */
  source: string;
  /** Dark-mode flag; threaded through to the underlying renderer. */
  dark?: boolean;
  /** Ref to populate with a RendererHandle so the export toolbar can grab the SVG. */
  handleRef?: RefObject<RendererHandle | null>;
  /** Optional `onError` for parse / render failures. */
  onError?: (message: string) => void;
}

/**
 * Dispatch component. Parses the source to a DiagramIR, then either:
 *   - delegates to the matching renderer in the registry (native path), or
 *   - falls back to mermaid.render() (legacy path).
 */
export default function DiagramRenderer({ source, dark, handleRef, onError }: DiagramRendererProps) {
  const [parsed, setParsed] = useState<ParseResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setParsed(null);
    parseToIR(source).then((result) => {
      if (cancelled) return;
      // Don't propagate parse failures to the consumer — a parser miss just
      // means we route through the mermaid fallback (which is more lenient).
      // Only mermaid's own failures are real render errors worth showing.
      setParsed(result);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (!parsed) {
    return <div className="my-4 text-slate-400 text-xs italic">Parsing diagram…</div>;
  }

  // Use mermaid fallback when:
  //   - parse failed (mermaid may handle a syntax we don't),
  //   - or the type is recognized but has no native renderer,
  //   - or the IR's specific type isn't registered.
  let lazyRenderer: ReturnType<typeof getLazyRenderer> = null;
  let ir: DiagramIR | null = null;
  if (parsed.ok && parsed.ir) {
    ir = parsed.ok ? parsed.ir : null;
    lazyRenderer = ir ? getLazyRenderer(ir.type) : null;
  }

  if (!lazyRenderer || !ir) {
    return <MermaidFallback source={source} handleRef={handleRef} onError={onError} />;
  }

  const Component = lazyRenderer;
  return (
    <Suspense fallback={<div className="my-4 text-slate-400 text-xs italic">Loading renderer…</div>}>
      <Component ir={ir} dark={dark} handleRef={handleRef} />
    </Suspense>
  );
}

// ── Mermaid fallback ─────────────────────────────────────────────────────

let mermaidCounter = 0;

function MermaidFallback({
  source,
  handleRef,
  onError,
}: {
  source: string;
  handleRef?: RefObject<RendererHandle | null>;
  onError?: (message: string) => void;
}) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-fb-${++mermaidCounter}`;
    mermaid
      .render(id, source)
      .then(({ svg: rendered }) => {
        if (cancelled) return;
        const clean = rendered
          .replace(/<rect[^>]*class="[^"]*background[^"]*"[^>]*\/?>/g, '')
          .replace(/(<svg[^>]*>)\s*<rect[^>]*fill="[^"]*"[^>]*\/?>/g, '$1');
        setSvg(clean);
        setError('');
        document.getElementById(id)?.remove();
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        onError?.(message);
        document.getElementById(id)?.remove();
      });
    return () => {
      cancelled = true;
    };
  }, [source, onError]);

  // Expose the rendered <svg> element to the export toolbar
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      getSvgElement: () => containerRef.current?.querySelector('svg') ?? null,
    };
    return () => {
      if (handleRef.current && handleRef.current.getSvgElement) handleRef.current = null;
    };
  }, [handleRef, svg]);

  if (error) {
    return (
      <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-mono">
        Mermaid error: {error}
      </div>
    );
  }
  if (!svg) {
    return <div className="my-4 text-slate-400 text-xs italic">Rendering diagram…</div>;
  }
  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />;
}
