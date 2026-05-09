import { useEffect, useMemo, useRef, useState } from 'react';
import type { Timeline as TimelineCls, TimelineOptions } from 'vis-timeline/standalone';

import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import type { GanttItemStatus, GanttTask } from '../../utils/diagrams/types';
import { getDiagramTheme } from './shared/theme';
import { buildGanttSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

type GanttRendererProps = RendererProps<'gantt'>;

interface VisGanttItem {
  id: string;
  group: string;
  content: string;
  start: Date;
  end?: Date;
  className: string;
  type: 'range' | 'point';
  title: string;
}
interface VisGanttGroup {
  id: string;
  content: string;
}

const STATUS_CLASS: Record<GanttItemStatus, string> = {
  default: 'gantt-default',
  active: 'gantt-active',
  done: 'gantt-done',
  crit: 'gantt-crit',
  milestone: 'gantt-milestone',
};

function buildItems(tasks: GanttTask[]): { items: VisGanttItem[]; groups: VisGanttGroup[] } {
  const groupSet = new Map<string, VisGanttGroup>();
  const items: VisGanttItem[] = tasks.map((t) => {
    const group = t.section ?? 'Tasks';
    if (!groupSet.has(group)) {
      groupSet.set(group, { id: group, content: group });
    }
    const isMilestone = t.status === 'milestone';
    return {
      id: t.id,
      group,
      content: t.label,
      start: new Date(t.start),
      end: isMilestone ? undefined : new Date(t.end),
      className: STATUS_CLASS[t.status],
      type: isMilestone ? 'point' : 'range',
      title: `${t.label}\n${t.start.slice(0, 10)} → ${t.end.slice(0, 10)}`,
    };
  });
  return { items, groups: [...groupSet.values()] };
}

export default function GanttRenderer({ ir, dark = false, handleRef }: GanttRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<TimelineCls | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { items, groups, range } = useMemo(() => {
    const built = buildItems(ir.tasks);
    let min: Date | null = null;
    let max: Date | null = null;
    for (const t of ir.tasks) {
      const s = new Date(t.start);
      const e = new Date(t.end);
      if (!min || s < min) min = s;
      if (!max || e > max) max = e;
    }
    return {
      items: built.items,
      groups: built.groups,
      range: { min, max },
    };
  }, [ir]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let tl: TimelineCls | null = null;

    (async () => {
      try {
        // Lazy-load vis-timeline + its CSS so any resolution failure surfaces
        // here rather than blowing up the whole renderer module on import.
        await import('vis-timeline/styles/vis-timeline-graph2d.min.css').catch(() => null);
        const [{ Timeline }, { DataSet }] = await Promise.all([
          import('vis-timeline/standalone'),
          import('vis-data/standalone'),
        ]);
        if (cancelled || !containerRef.current) return;

        const itemDS = new DataSet<VisGanttItem>(items);
        const groupDS = new DataSet<VisGanttGroup>(groups);
        const padMs = range.min && range.max
          ? Math.max(86400000, (range.max.getTime() - range.min.getTime()) * 0.05)
          : 86400000;
        const options: TimelineOptions = {
          stack: true,
          orientation: 'top',
          showCurrentTime: false,
          zoomMin: 1000 * 60 * 60,
          zoomMax: 1000 * 60 * 60 * 24 * 365 * 5,
          margin: { item: 6, axis: 8 },
          ...(range.min && range.max
            ? {
                min: new Date(range.min.getTime() - padMs),
                max: new Date(range.max.getTime() + padMs),
                start: new Date(range.min.getTime() - padMs / 2),
                end: new Date(range.max.getTime() + padMs / 2),
              }
            : {}),
          groupOrder: 'content',
        };
        tl = new Timeline(containerRef.current, itemDS, groupDS, options);
        timelineRef.current = tl;
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (tl) tl.destroy();
      timelineRef.current = null;
    };
  }, [items, groups, range]);

  // Export: build a standalone SVG directly from the IR (no DOM cloning).
  // The on-screen vis-timeline DOM uses HTML+CSS, which doesn't rasterize
  // reliably through canvas; the IR-driven SVG is pure primitives and
  // converts to PNG cleanly.
  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () => svgStringToElement(buildGanttSvg(ir, { dark })),
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, ir, dark]);

  return (
    <div
      style={{ background: theme.canvasBg, borderRadius: 12, padding: 12 }}
      className={dark ? 'gantt-dark' : 'gantt-light'}
    >
      {ir.title && (
        <div style={{ color: dark ? '#e2e8f0' : '#1e293b', fontSize: 14, fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
          {ir.title}
        </div>
      )}
      {loadError && (
        <div
          role="alert"
          style={{
            margin: '8px 0',
            padding: 10,
            borderRadius: 8,
            background: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: dark ? '#fecdd3' : '#881337',
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          Gantt failed to load: {loadError}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', minHeight: 280 }} />
      <style>{ganttCss(dark)}</style>
    </div>
  );
}

function ganttCss(dark: boolean): string {
  const text = dark ? '#e2e8f0' : '#1e293b';
  const subtle = dark ? '#94a3b8' : '#64748b';
  const border = dark ? '#334155' : '#e2e8f0';
  return `
    .gantt-light .vis-timeline, .gantt-dark .vis-timeline { border: 1px solid ${border}; border-radius: 8px; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
    .gantt-light .vis-text, .gantt-light .vis-label, .gantt-light .vis-item-content { color: ${text}; }
    .gantt-dark .vis-text, .gantt-dark .vis-label, .gantt-dark .vis-item-content { color: ${text}; }
    .gantt-light .vis-grid.vis-vertical, .gantt-dark .vis-grid.vis-vertical { border-color: ${border}; }
    .gantt-light .vis-time-axis .vis-grid.vis-minor, .gantt-dark .vis-time-axis .vis-grid.vis-minor { border-color: ${border}; }
    .gantt-light .vis-time-axis .vis-text, .gantt-dark .vis-time-axis .vis-text { color: ${subtle}; }
    .gantt-light .vis-foreground .vis-group, .gantt-dark .vis-foreground .vis-group { border-color: ${border}; }
    .gantt-light .vis-labelset .vis-label, .gantt-dark .vis-labelset .vis-label { border-color: ${border}; }
    .vis-item.gantt-default { background-color: #93c5fd; border-color: #3b82f6; color: #1e3a8a; }
    .vis-item.gantt-active { background-color: #fbbf24; border-color: #f59e0b; color: #78350f; }
    .vis-item.gantt-done { background-color: #6ee7b7; border-color: #10b981; color: #064e3b; }
    .vis-item.gantt-crit { background-color: #fda4af; border-color: #f43f5e; color: #881337; }
    .vis-item.gantt-milestone { background-color: #c4b5fd; border-color: #8b5cf6; color: #4c1d95; }
    .gantt-dark .vis-item.gantt-default { background-color: rgba(59,130,246,0.30); border-color: #60a5fa; color: #bfdbfe; }
    .gantt-dark .vis-item.gantt-active { background-color: rgba(245,158,11,0.30); border-color: #fbbf24; color: #fde68a; }
    .gantt-dark .vis-item.gantt-done { background-color: rgba(16,185,129,0.30); border-color: #34d399; color: #a7f3d0; }
    .gantt-dark .vis-item.gantt-crit { background-color: rgba(244,63,94,0.30); border-color: #fb7185; color: #fecdd3; }
    .gantt-dark .vis-item.gantt-milestone { background-color: rgba(139,92,246,0.30); border-color: #a78bfa; color: #ddd6fe; }
  `;
}

function buildExportSvg(container: HTMLDivElement | null, dark: boolean): SVGSVGElement | null {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const width = Math.max(600, Math.ceil(rect.width));
  const height = Math.max(200, Math.ceil(rect.height));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', dark ? '#0f172a' : '#f8fafc');
  svg.appendChild(bg);

  const fo = document.createElementNS(ns, 'foreignObject');
  fo.setAttribute('width', String(width));
  fo.setAttribute('height', String(height));
  fo.setAttribute('x', '0');
  fo.setAttribute('y', '0');
  const xhtml = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
  xhtml.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  xhtml.appendChild(container.cloneNode(true) as Node);
  fo.appendChild(xhtml);
  svg.appendChild(fo);
  return svg;
}
