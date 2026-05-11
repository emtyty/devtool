import {
  useEffect,
  useState,
  lazy,
  Suspense,
  type LazyExoticComponent,
  type ComponentType,
  type RefObject,
} from 'react';
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
  /** Mermaid-syntax source string. */
  source: string;
  /** Dark-mode flag; threaded through to the underlying renderer. */
  dark?: boolean;
  /** Ref to populate with a RendererHandle so the export toolbar can grab the SVG. */
  handleRef?: RefObject<RendererHandle | null>;
  /** Optional `onError` for parse / render failures. */
  onError?: (message: string) => void;
}

/**
 * Dispatch component. Parses the source to a DiagramIR, then delegates to
 * the matching renderer in the registry.
 *
 * Every diagram type the registry knows about renders natively — there is
 * no mermaid fallback. Unrecognized sources surface a clear error.
 */
export default function DiagramRenderer({ source, dark, handleRef, onError }: DiagramRendererProps) {
  const [parsed, setParsed] = useState<ParseResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setParsed(null);
    parseToIR(source).then((result) => {
      if (cancelled) return;
      if (!result.ok && onError) onError(result.error);
      setParsed(result);
    });
    return () => {
      cancelled = true;
    };
  }, [source, onError]);

  if (!parsed) {
    return <div className="my-4 text-slate-400 text-xs italic">Parsing diagram…</div>;
  }

  if (!parsed.ok) {
    return (
      <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-mono">
        Diagram parse error: {parsed.error}
      </div>
    );
  }

  if (!parsed.ir) {
    return (
      <div className="my-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-mono">
        Diagram type "{parsed.type}" is not supported.
      </div>
    );
  }

  const ir: DiagramIR = parsed.ir;
  const lazyRenderer = getLazyRenderer(ir.type);
  if (!lazyRenderer) {
    return (
      <div className="my-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-mono">
        No renderer registered for "{ir.type}".
      </div>
    );
  }

  const Component = lazyRenderer;
  return (
    <Suspense fallback={<div className="my-4 text-slate-400 text-xs italic">Loading renderer…</div>}>
      <Component ir={ir} dark={dark} handleRef={handleRef} />
    </Suspense>
  );
}
