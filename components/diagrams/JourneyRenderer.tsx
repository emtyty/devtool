import { useEffect, useMemo, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';

type JourneyRendererProps = RendererProps<'journey'>;

interface FlatTask {
  index: number;
  task: string;
  section: string;
  score: number;
  actors: string;
}

export default function JourneyRenderer({ ir, dark = false, handleRef }: JourneyRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const { rows, sectionBoundaries } = useMemo(() => {
    const flat: FlatTask[] = [];
    const boundaries: { x: number; label: string }[] = [];
    let i = 0;
    for (const section of ir.sections) {
      // Mark the start of each section (after the first) so we can render a vertical reference line.
      if (i > 0) boundaries.push({ x: i - 0.5, label: section.title });
      else boundaries.push({ x: 0, label: section.title });
      for (const task of section.tasks) {
        flat.push({
          index: i,
          task: task.label,
          section: section.title,
          score: task.score,
          actors: task.actors.join(', '),
        });
        i++;
      }
    }
    return { rows: flat, sectionBoundaries: boundaries };
  }, [ir.sections]);

  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () =>
        containerRef.current?.querySelector('svg.recharts-surface') ?? null,
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, rows]);

  return (
    <div
      ref={containerRef}
      className="journey-renderer"
      style={{
        width: '100%',
        height: 420,
        background: theme.canvasBg,
        borderRadius: 12,
        padding: 16,
        color: theme.byKind.plain.text,
      }}
    >
      {ir.title && (
        <div
          style={{
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 600,
            marginBottom: 8,
            color: theme.byKind.plain.text,
          }}
        >
          {ir.title}
        </div>
      )}
      <ResponsiveContainer width="100%" height="86%">
        <LineChart data={rows} margin={{ top: 20, right: 40, bottom: 50, left: 30 }}>
          <CartesianGrid stroke={dark ? '#1e293b' : '#e2e8f0'} strokeDasharray="3 3" />
          <XAxis
            dataKey="task"
            interval={0}
            tick={{ fontSize: 11, fill: theme.byKind.plain.text }}
            angle={-25}
            textAnchor="end"
            stroke={theme.byKind.plain.text}
          />
          <YAxis
            domain={[0, 7]}
            ticks={[1, 2, 3, 4, 5, 6, 7]}
            tick={{ fontSize: 11, fill: theme.byKind.plain.text }}
            label={{ value: 'Score', angle: -90, position: 'insideLeft', fill: theme.byKind.plain.text, fontSize: 11 }}
            stroke={theme.byKind.plain.text}
          />
          {sectionBoundaries.map((b, i) =>
            i === 0 ? null : (
              <ReferenceLine
                key={i}
                x={rows[Math.ceil(b.x)]?.task}
                stroke={theme.edgeColor}
                strokeDasharray="4 3"
                label={{ value: b.label, position: 'top', fontSize: 11, fill: theme.byKind.plain.text }}
              />
            )
          )}
          <Tooltip
            contentStyle={{
              background: dark ? '#1e293b' : '#ffffff',
              border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={((value: unknown, _name: unknown, item: unknown) => {
              const payload = (item as { payload?: FlatTask })?.payload;
              return [
                `${value as number} (${payload?.actors || '—'})`,
                payload?.section ?? '',
              ];
            }) as never}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ fill: '#3b82f6', r: 5 }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
