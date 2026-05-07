import { useState, type MouseEvent } from 'react';
import { Copy, Check, Download, FileImage, ImageDown } from 'lucide-react';
import {
  copySvgToClipboard,
  copyPngToClipboard,
  downloadSvg,
  downloadPng,
  type SvgSource,
} from '../../utils/diagrams/export';

// Shared 4-button toolbar (Copy SVG, Copy PNG, Download SVG, Download PNG)
// for any diagram-rendering surface. Renderer-agnostic: accepts any
// SvgSource (string, SVGSVGElement, or function returning one).
//
// Visual style mirrors the original inline buttons that lived in
// MarkdownPreview.MermaidBlock so existing surfaces look unchanged after
// migration.

interface DiagramExportToolbarProps {
  source: SvgSource;
  /** Filename prefix (no extension). Default: "diagram". */
  filenameBase?: string;
  /** PNG canvas resolution multiplier. Default: 2. */
  pngScale?: number;
  /** PNG background color. Pass `null` for transparent. Default: white. */
  pngBackground?: string | null;
  /** Outer container class (positioning, opacity, etc.). */
  className?: string;
  /** Called when an export operation throws. Default: silent. */
  onError?: (error: Error) => void;
}

type FlashState = 'idle' | 'svg-copied' | 'png-copied';

export default function DiagramExportToolbar({
  source,
  filenameBase = 'diagram',
  pngScale = 2,
  pngBackground,
  className = '',
  onError,
}: DiagramExportToolbarProps) {
  const [flash, setFlash] = useState<FlashState>('idle');

  const flashAndReset = (state: Exclude<FlashState, 'idle'>) => {
    setFlash(state);
    setTimeout(() => setFlash('idle'), 2000);
  };

  const safe = async (fn: () => Promise<void>, e: MouseEvent) => {
    e.stopPropagation();
    try {
      await fn();
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleCopySvg = (e: MouseEvent) =>
    safe(async () => {
      await copySvgToClipboard(source);
      flashAndReset('svg-copied');
    }, e);

  const handleCopyPng = (e: MouseEvent) =>
    safe(async () => {
      await copyPngToClipboard(source, { scale: pngScale, background: pngBackground });
      flashAndReset('png-copied');
    }, e);

  const handleDownloadSvg = (e: MouseEvent) =>
    safe(() => downloadSvg(source, `${filenameBase}.svg`), e);

  const handleDownloadPng = (e: MouseEvent) =>
    safe(
      () => downloadPng(source, `${filenameBase}.png`, { scale: pngScale, background: pngBackground }),
      e
    );

  const buttonClass =
    'flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 text-[10px] font-bold shadow-sm transition-colors';

  return (
    <div className={`flex gap-1 ${className}`} role="toolbar" aria-label="Diagram export">
      <button
        type="button"
        onClick={handleCopySvg}
        className={buttonClass}
        aria-label="Copy SVG markup to clipboard"
        title="Copy SVG markup"
      >
        {flash === 'svg-copied' ? (
          <Check size={11} className="text-green-500" />
        ) : (
          <Copy size={11} />
        )}
        {flash === 'svg-copied' ? 'Copied!' : 'SVG'}
      </button>
      <button
        type="button"
        onClick={handleCopyPng}
        className={buttonClass}
        aria-label="Copy diagram as PNG to clipboard"
        title="Copy as PNG image"
      >
        {flash === 'png-copied' ? (
          <Check size={11} className="text-green-500" />
        ) : (
          <FileImage size={11} />
        )}
        {flash === 'png-copied' ? 'Copied!' : 'PNG'}
      </button>
      <button
        type="button"
        onClick={handleDownloadSvg}
        className={buttonClass}
        aria-label="Download diagram as SVG file"
        title="Download SVG"
      >
        <Download size={11} /> SVG
      </button>
      <button
        type="button"
        onClick={handleDownloadPng}
        className={buttonClass}
        aria-label="Download diagram as PNG file"
        title="Download PNG"
      >
        <ImageDown size={11} /> PNG
      </button>
    </div>
  );
}
