import { Fragment, useEffect, useMemo, useRef, type ComponentProps } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { buildQuadrantSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

type QuadrantRendererProps = RendererProps<'quadrant'>;

const QUADRANT_TINTS = {
  q1: '#10b98120', // top-right (success-y green)
  q2: '#f59e0b20', // top-left
  q3: '#ef444420', // bottom-left
  q4: '#3b82f620', // bottom-right
} as const;

export default function QuadrantRenderer({ ir, dark = false, handleRef }: QuadrantRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => ir.points.map((p) => ({ ...p })), [ir.points]);

  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () => svgStringToElement(buildQuadrantSvg(ir, { dark })),
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, ir, dark]);

  const labels = ir.quadrantLabels ?? {};
  const xAxis = ir.xAxisLabel ?? { low: 'Low', high: 'High' };
  const yAxis = ir.yAxisLabel ?? { low: 'Low', high: 'High' };

  return (
    <div
      ref={containerRef}
      className="quadrant-renderer"
      style={{
        width: '100%',
        height: 480,
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
        <ScatterChart margin={{ top: 24, right: 30, bottom: 56, left: 88 }}>
          <CartesianGrid stroke={dark ? '#1e293b' : '#e2e8f0'} />
          {/* Quadrant tinted areas + text labels. Each quadrant is a ReferenceArea
              with the matching label rendered as a centered SVG text via the
              `label` prop (avoids LabelList typing constraints). */}
          {/* Recharts' Props generic narrows x1/x2/y1/y2 to literal number
              types when passed inline; widen to `number` so the four
              quadrants share one component instantiation. */}
          {([
            { x1: 0 as number, x2: 0.5 as number, y1: 0 as number, y2: 0.5 as number, fill: QUADRANT_TINTS.q3, label: labels.q3 ?? '' },
            { x1: 0.5 as number, x2: 1 as number, y1: 0 as number, y2: 0.5 as number, fill: QUADRANT_TINTS.q4, label: labels.q4 ?? '' },
            { x1: 0 as number, x2: 0.5 as number, y1: 0.5 as number, y2: 1 as number, fill: QUADRANT_TINTS.q2, label: labels.q2 ?? '' },
            { x1: 0.5 as number, x2: 1 as number, y1: 0.5 as number, y2: 1 as number, fill: QUADRANT_TINTS.q1, label: labels.q1 ?? '' },
          ]).map((q, i) => (
            <Fragment key={i}>
              {/* Cast props through `unknown` because Recharts' Props generic
                  for ReferenceArea narrows the label-prop type in a way that
                  rejects our positioned-label config. The runtime contract
                  is satisfied — just the static check disagrees. */}
              {(() => {
                const props = {
                  x1: q.x1,
                  x2: q.x2,
                  y1: q.y1,
                  y2: q.y2,
                  fill: q.fill,
                  fillOpacity: 1,
                  label: {
                    value: q.label,
                    position: 'center',
                    fontSize: 13,
                    fontWeight: 500,
                    fill: theme.byKind.plain.text,
                  },
                } as unknown as ComponentProps<typeof ReferenceArea>;
                return <ReferenceArea {...props} />;
              })()}
            </Fragment>
          ))}
          {/* X axis: numeric domain with no tick labels — we draw start/end
              endpoint labels manually below the chart so they don't collide
              with the Y-axis labels at the corners. */}
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 1]}
            ticks={[0, 1]}
            tick={false}
            axisLine={{ stroke: theme.byKind.plain.text }}
            label={{
              value: xAxis.low + '  ←—————→  ' + xAxis.high,
              position: 'insideBottom',
              offset: -28,
              fontSize: 12,
              fill: theme.byKind.plain.text,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, 1]}
            ticks={[0, 1]}
            tick={false}
            axisLine={{ stroke: theme.byKind.plain.text }}
            label={{
              value: yAxis.low + '  ←—————→  ' + yAxis.high,
              angle: -90,
              position: 'insideLeft',
              offset: -16,
              fontSize: 12,
              fill: theme.byKind.plain.text,
              style: { textAnchor: 'middle' },
            }}
          />
          <Tooltip
            contentStyle={{
              background: dark ? '#1e293b' : '#ffffff',
              border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Scatter data={data} fill="#3b82f6">
            <LabelList dataKey="label" position="top" style={{ fontSize: 11, fill: theme.byKind.plain.text }} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
