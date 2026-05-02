import React, { useState, useRef, useEffect } from 'react';

interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultLeftPercent?: number;
  minLeftPercent?: number;
  maxLeftPercent?: number;
  gap?: number; // px
  storageKey?: string;
  className?: string;
}

export default function ResizableSplit({
  left,
  right,
  defaultLeftPercent = 50,
  minLeftPercent = 20,
  maxLeftPercent = 82,
  gap = 8,
  storageKey,
  className = '',
}: ResizableSplitProps) {
  const [leftPercent, setLeftPercent] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      if (saved) return Number(saved);
    }
    return defaultLeftPercent;
  });
  const leftPercentRef = useRef(leftPercent);
  const [isLg, setIsLg] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsLg(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleWidthPx = gap + 8;

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startLeft = leftPercent;
    const rect = containerRef.current!.getBoundingClientRect();

    const onMove = (ev: PointerEvent) => {
      const deltaPct = ((ev.clientX - startX) / rect.width) * 100;
      const next = Math.min(maxLeftPercent, Math.max(minLeftPercent, startLeft + deltaPct));
      leftPercentRef.current = next;
      setLeftPercent(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (storageKey) {
        localStorage.setItem(storageKey, String(leftPercentRef.current));
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={containerRef}
      className={`flex ${isLg ? 'flex-row' : 'flex-col gap-6'} ${className}`.trim()}
    >
      {/* Left panel */}
      <div
        className="flex flex-col"
        style={isLg ? { width: `calc(${leftPercent}% - ${handleWidthPx / 2}px)` } : undefined}
      >
        {left}
      </div>

      {/* Drag handle — visible on lg+, supports mouse + touch + stylus via Pointer Events */}
      {isLg && (
        <div
          className="flex items-center justify-center shrink-0 cursor-col-resize group select-none"
          onPointerDown={onPointerDown}
          style={{ width: `${handleWidthPx}px`, touchAction: 'none' }}
        >
          <div className="w-1 self-stretch rounded-full bg-slate-200 group-hover:bg-blue-400 transition-colors duration-150" />
        </div>
      )}

      {/* Right panel */}
      <div
        className="flex flex-col"
        style={isLg ? { width: `calc(${100 - leftPercent}% - ${handleWidthPx / 2}px)` } : undefined}
      >
        {right}
      </div>
    </div>
  );
}
