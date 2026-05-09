import { useEffect, useMemo, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import { getDiagramTheme } from './shared/theme';
import { buildPieSvg, svgStringToElement } from '../../utils/diagrams/svgBuilders';

// Slice palette — 12 hues that read well in both light + dark themes.
const PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
  '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#d946ef',
];

type PieRendererProps = RendererProps<'pie'>;

export default function PieRenderer({ ir, dark = false, handleRef }: PieRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const data = useMemo(
    () => ir.slices.map((s, i) => ({ name: s.label, value: s.value, fill: PALETTE[i % PALETTE.length] })),
    [ir.slices]
  );

  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      // Build a clean standalone SVG from the IR (Recharts' live SVG uses
      // gradients/clipPaths that don't always survive serialization).
      getSvgElement: () => svgStringToElement(buildPieSvg(ir, { dark })),
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, ir, dark]);

  return (
    <div
      ref={containerRef}
      className="pie-renderer"
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
      <ResponsiveContainer width="100%" height="90%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius="80%"
            label={ir.showData ? renderLabel : true}
            labelLine={false}
            stroke={theme.canvasBg}
            strokeWidth={2}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: dark ? '#1e293b' : '#ffffff',
              border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: theme.byKind.plain.text }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: theme.byKind.plain.text }}
            iconType="circle"
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function renderLabel(entry: { name: string; value: number; percent: number }) {
  return `${entry.name} (${(entry.percent * 100).toFixed(1)}%)`;
}
