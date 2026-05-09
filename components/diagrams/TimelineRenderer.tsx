import { useEffect, useMemo, useRef, useState } from 'react';
import type { Timeline as TimelineCls, TimelineOptions } from 'vis-timeline/standalone';

import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import type { TimelineEvent } from '../../utils/diagrams/types';
import { getDiagramTheme } from './shared/theme';
import { buildTimelineSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

type TimelineRendererProps = RendererProps<'timeline'>;

interface VisTimelineItem {
  id: string;
  group?: string;
  content: string;
  start: Date;
  end?: Date;
  className: string;
  type: 'box' | 'point';
  title: string;
}
interface VisTimelineGroup {
  id: string;
  content: string;
}

// ── Period parsing ──────────────────────────────────────────────────────
//
// Mermaid timeline diagrams use free-form `period` labels (e.g. `1989`,
// `Q1 2026`, `Day 1`, `2026-03`). We try to coerce them into a Date so
// vis-timeline can lay them out chronologically; if we fail, we fall back
// to a deterministic monotonic sequence so the items still appear in
// source order.

function parsePeriod(period: string, fallbackOrder: number): Date {
  const trimmed = period.trim();

  // Pure ISO date
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);

  // Year-month
  const ym = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) return new Date(parseInt(ym[1], 10), parseInt(ym[2], 10) - 1, 1);

  // Year only
  const yr = trimmed.match(/^(\d{4})$/);
  if (yr) return new Date(parseInt(yr[1], 10), 0, 1);

  // Q1 2026 / Q4 1999
  const quarter = trimmed.match(/^Q([1-4])\s+(\d{4})$/i);
  if (quarter) {
    const q = parseInt(quarter[1], 10);
    return new Date(parseInt(quarter[2], 10), (q - 1) * 3, 1);
  }

  // 2026 Q1 — same as above, reversed
  const quarterRev = trimmed.match(/^(\d{4})\s+Q([1-4])$/i);
  if (quarterRev) {
    const q = parseInt(quarterRev[2], 10);
    return new Date(parseInt(quarterRev[1], 10), (q - 1) * 3, 1);
  }

  // Last resort: ordinal positioning so two items in a row don't share a date
  return new Date(2000, 0, 1 + fallbackOrder * 30);
}

function buildItems(events: TimelineEvent[]): { items: VisTimelineItem[]; groups: VisTimelineGroup[] } {
  const groupSet = new Map<string, VisTimelineGroup>();
  const items: VisTimelineItem[] = events.map((e, i) => {
    const start = parsePeriod(e.period, i);
    if (e.section && !groupSet.has(e.section)) {
      groupSet.set(e.section, { id: e.section, content: e.section });
    }
    const sectionIndex = e.section ? [...groupSet.keys()].indexOf(e.section) : 0;
    return {
      id: e.id,
      group: e.section,
      content: `<div class="tl-period">${e.period}</div><div class="tl-text">${escapeHtml(e.text)}</div>`,
      start,
      type: 'box',
      className: `tl-item tl-section-${sectionIndex % 6}`,
      title: `${e.period}\n${e.text}`,
    };
  });
  return { items, groups: [...groupSet.values()] };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function TimelineRenderer({ ir, dark = false, handleRef }: TimelineRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<TimelineCls | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { items, groups, range } = useMemo(() => {
    const built = buildItems(ir.events);
    let min: Date | null = null;
    let max: Date | null = null;
    for (const it of built.items) {
      if (!min || it.start < min) min = it.start;
      if (!max || it.start > max) max = it.start;
    }
    return { items: built.items, groups: built.groups, range: { min, max } };
  }, [ir]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let tl: TimelineCls | null = null;

    (async () => {
      try {
        await import('vis-timeline/styles/vis-timeline-graph2d.min.css').catch(() => null);
        const [{ Timeline }, { DataSet }] = await Promise.all([
          import('vis-timeline/standalone'),
          import('vis-data/standalone'),
        ]);
        if (cancelled || !containerRef.current) return;

        const itemDS = new DataSet<VisTimelineItem>(items);
        const padMs = range.min && range.max
          ? Math.max(86400000 * 30, (range.max.getTime() - range.min.getTime()) * 0.1)
          : 86400000 * 30;
        const options: TimelineOptions = {
          stack: true,
          orientation: 'top',
          showCurrentTime: false,
          margin: { item: 10, axis: 8 },
          ...(range.min && range.max
            ? {
                min: new Date(range.min.getTime() - padMs),
                max: new Date(range.max.getTime() + padMs),
                start: new Date(range.min.getTime() - padMs / 2),
                end: new Date(range.max.getTime() + padMs / 2),
              }
            : {}),
        };
        tl =
          groups.length > 0
            ? new Timeline(containerRef.current, itemDS, new DataSet<VisTimelineGroup>(groups), options)
            : new Timeline(containerRef.current, itemDS, options);
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

  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () => svgStringToElement(buildTimelineSvg(ir, { dark })),
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, ir, dark]);

  return (
    <div
      style={{ background: theme.canvasBg, borderRadius: 12, padding: 12 }}
      className={dark ? 'tl-dark' : 'tl-light'}
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
          Timeline failed to load: {loadError}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', minHeight: 280 }} />
      <style>{timelineCss(dark)}</style>
    </div>
  );
}

function timelineCss(dark: boolean): string {
  const text = dark ? '#e2e8f0' : '#1e293b';
  const subtle = dark ? '#94a3b8' : '#64748b';
  const border = dark ? '#334155' : '#e2e8f0';
  return `
    .tl-light .vis-timeline, .tl-dark .vis-timeline { border: 1px solid ${border}; border-radius: 8px; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
    .tl-light .vis-text, .tl-light .vis-label { color: ${text}; }
    .tl-dark .vis-text, .tl-dark .vis-label { color: ${text}; }
    .tl-light .vis-grid.vis-vertical, .tl-dark .vis-grid.vis-vertical { border-color: ${border}; }
    .tl-light .vis-time-axis .vis-text, .tl-dark .vis-time-axis .vis-text { color: ${subtle}; }
    .tl-light .vis-foreground .vis-group, .tl-dark .vis-foreground .vis-group { border-color: ${border}; }
    .vis-item.tl-item { border-radius: 8px; padding: 6px 10px; max-width: 240px; }
    .vis-item .tl-period { font-weight: 600; font-size: 11px; opacity: 0.8; margin-bottom: 2px; }
    .vis-item .tl-text { font-size: 12px; line-height: 1.35; }
    .tl-section-0 { background-color: rgba(59,130,246,0.15); border-color: #3b82f6; color: ${text}; }
    .tl-section-1 { background-color: rgba(16,185,129,0.15); border-color: #10b981; color: ${text}; }
    .tl-section-2 { background-color: rgba(245,158,11,0.15); border-color: #f59e0b; color: ${text}; }
    .tl-section-3 { background-color: rgba(244,63,94,0.15); border-color: #f43f5e; color: ${text}; }
    .tl-section-4 { background-color: rgba(139,92,246,0.15); border-color: #8b5cf6; color: ${text}; }
    .tl-section-5 { background-color: rgba(6,182,212,0.15); border-color: #06b6d4; color: ${text}; }
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
