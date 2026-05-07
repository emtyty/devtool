// Universal flow-node component used by FlowchartRenderer.
//
// One component covers every NodeKind by reading the per-kind palette from
// shared/theme.ts and adapting the shape (circle / rounded-rect / diamond /
// cylinder) via CSS. Optional Iconify icon via @iconify/react.

import { type CSSProperties } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Icon } from '@iconify/react';
import type { NodeIR } from '../../../../utils/diagrams/types';
import { getDiagramTheme, type KindStyle } from '../theme';

// ReactFlow requires Node data to be Record<string, unknown>-compatible.
export interface FlowNodeData extends Record<string, unknown> {
  ir: NodeIR;
  dark: boolean;
}

interface FlowNodeProps {
  data: FlowNodeData;
}

export default function FlowNode({ data }: FlowNodeProps) {
  const { ir, dark } = data;
  const theme = getDiagramTheme(dark);
  const style = theme.byKind[ir.kind];

  return (
    <div className="flow-node-wrapper" style={containerStyle()}>
      <Handle type="target" position={Position.Left} style={handleStyle(style.accent)} />
      {renderShapeForKind(ir, style)}
      <Handle type="source" position={Position.Right} style={handleStyle(style.accent)} />
    </div>
  );
}

function renderShapeForKind(ir: NodeIR, style: KindStyle) {
  if (ir.kind === 'icon' && ir.icon) {
    return <IconNode iconRef={ir.icon} label={ir.label} style={style} />;
  }
  switch (ir.kind) {
    case 'user':
    case 'start':
    case 'end':
      return <CircleNode label={ir.label} style={style} />;
    case 'database':
      return <CylinderNode label={ir.label} style={style} />;
    case 'decision':
      return <DiamondNode label={ir.label} style={style} />;
    case 'queue':
      return <SubroutineNode label={ir.label} style={style} />;
    default:
      return <RectNode label={ir.label} style={style} />;
  }
}

// ── Shape variants ────────────────────────────────────────────────────────

function RectNode({ label, style }: { label: string; style: KindStyle }) {
  return (
    <div
      className="rect-node"
      style={{
        background: style.bodyBg,
        color: style.text,
        border: `1px solid ${style.border}`,
        borderLeft: `4px solid ${style.accent}`,
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        minWidth: 80,
        maxWidth: 300,
        textAlign: 'center' as const,
        lineHeight: 1.3,
        wordBreak: 'break-word',
      }}
    >
      {label}
    </div>
  );
}

function CircleNode({ label, style }: { label: string; style: KindStyle }) {
  return (
    <div
      className="circle-node"
      style={{
        background: style.bodyBg,
        color: style.text,
        border: `2px solid ${style.accent}`,
        width: 76,
        height: 76,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        textAlign: 'center' as const,
        padding: '0 8px',
      }}
    >
      {label}
    </div>
  );
}

function CylinderNode({ label, style }: { label: string; style: KindStyle }) {
  return (
    <div
      className="cylinder-node"
      style={{
        background: style.bodyBg,
        color: style.text,
        border: `1px solid ${style.border}`,
        borderTop: `2px solid ${style.accent}`,
        borderBottom: `2px solid ${style.accent}`,
        borderRadius: '50% 50% 8px 8px / 16% 16% 8px 8px',
        padding: '14px 18px 10px',
        fontSize: 13,
        fontWeight: 500,
        minWidth: 80,
        textAlign: 'center' as const,
      }}
    >
      {label}
    </div>
  );
}

function IconNode({ iconRef, label, style }: { iconRef: string; label: string; style: KindStyle }) {
  return (
    <div
      className="icon-node"
      style={{
        background: style.bodyBg,
        color: style.text,
        border: `1px solid ${style.border}`,
        borderRadius: 12,
        padding: '12px 14px 10px',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 6,
        minWidth: 84,
      }}
    >
      <Icon icon={iconRef} width={32} height={32} />
      <div style={{ fontSize: 12, fontWeight: 500, textAlign: 'center' as const }}>{label}</div>
    </div>
  );
}

// Diamond / decision node — uses CSS clip-path for the rhombus shape with
// an inner solid background. Label is centered without rotation. The outer
// width grows with the label so long phrases (e.g. "Render preview") don't
// get clipped to "Render previe…".
function DiamondNode({ label, style }: { label: string; style: KindStyle }) {
  const width = Math.max(140, Math.min(280, label.length * 11 + 60));
  const height = Math.max(96, Math.min(160, Math.ceil(label.length / 16) * 32 + 64));
  return (
    <div
      className="diamond-node"
      style={{
        position: 'relative',
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: style.bodyBg,
          border: `1.5px solid ${style.accent}`,
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          color: style.text,
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'center' as const,
          padding: '0 24px',
          maxWidth: '78%',
          lineHeight: 1.25,
          wordBreak: 'break-word',
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Subroutine / queue node — rectangle with a second inner border (mermaid's
// `[[label]]` shape). Two stacked divs avoid box-shadow inset rendering quirks.
function SubroutineNode({ label, style }: { label: string; style: KindStyle }) {
  return (
    <div
      className="subroutine-node"
      style={{
        background: style.bodyBg,
        color: style.text,
        border: `1px solid ${style.accent}`,
        borderRadius: 8,
        padding: 4,
      }}
    >
      <div
        style={{
          border: `1px solid ${style.border}`,
          borderRadius: 5,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 500,
          minWidth: 80,
          textAlign: 'center' as const,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Styling helpers ───────────────────────────────────────────────────────

function containerStyle(): CSSProperties {
  return {
    filter: 'drop-shadow(0 1px 3px rgba(15, 23, 42, 0.08))',
    transition: 'filter 120ms ease',
  } as CSSProperties;
}

function handleStyle(color: string): CSSProperties {
  return {
    background: color,
    width: 8,
    height: 8,
    border: '2px solid #ffffff',
  } as CSSProperties;
}
