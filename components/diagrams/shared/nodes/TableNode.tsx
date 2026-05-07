// Table node for the ER renderer.
//
// Mirrors the visual language of DbSchemaFlow but is registry-friendly:
// it consumes a single `DbTable` from the IR, exposes the same handle
// shape on every column row so dagre-style FK edges connect cleanly.

import { Fragment } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Key, Link2 } from 'lucide-react';
import type { DbColumn, DbTable } from '../../../../utils/dbSchemaParser';

export const TABLE_NODE_WIDTH = 240;
export const TABLE_ROW_HEIGHT = 26;
export const TABLE_HEADER_HEIGHT = 34;

export interface TableNodeData extends Record<string, unknown> {
  table: DbTable;
  dark: boolean;
}

const HANDLE_STYLE = {
  background: 'transparent',
  border: 'none',
  width: 1,
  height: 1,
  opacity: 0,
} as const;

interface TableNodeProps {
  data: TableNodeData;
}

export default function TableNode({ data }: TableNodeProps) {
  const { table, dark } = data;
  return (
    <div
      style={{
        width: TABLE_NODE_WIDTH,
        background: dark ? '#0f172a' : '#ffffff',
        border: dark ? '1px solid #334155' : '1px solid #e2e8f0',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: TABLE_HEADER_HEIGHT,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          fontFamily: '"Fira Code", ui-monospace, monospace',
          fontSize: 12,
          fontWeight: 600,
          color: dark ? '#e2e8f0' : '#1e293b',
          background: dark ? '#1e293b' : '#f8fafc',
          borderBottom: dark ? '1px solid #334155' : '1px solid #e2e8f0',
        }}
      >
        {/* Table-level fallback handles for relations that don't reference a
         *  specific column (e.g. mermaid ER `A ||--o{ B : label`). */}
        <Handle type="target" position={Position.Left} id="__table.target" style={HANDLE_STYLE} />
        <Handle type="source" position={Position.Right} id="__table.source" style={HANDLE_STYLE} />
        {table.name}
      </div>
      {table.columns.map((col, idx) => (
        <Fragment key={col.name}>
          <ColumnRow col={col} idx={idx} dark={dark} />
        </Fragment>
      ))}
    </div>
  );
}

function ColumnRow({ col, idx, dark }: { col: DbColumn; idx: number; dark: boolean }) {
  const dividerColor = dark ? '#1e293b' : '#f1f5f9';
  const nameColor = col.isPK
    ? '#d97706'
    : col.isFK
      ? '#0284c7'
      : dark
        ? '#cbd5e1'
        : '#475569';
  return (
    <div
      style={{
        position: 'relative',
        height: TABLE_ROW_HEIGHT,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        background: dark ? '#0f172a' : '#ffffff',
        borderTop: idx > 0 ? `1px solid ${dividerColor}` : 'none',
        fontFamily: '"Fira Code", ui-monospace, monospace',
        fontSize: 11,
      }}
    >
      <Handle type="target" position={Position.Left} id={`${col.name}.target`} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id={`${col.name}.source`} style={HANDLE_STYLE} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {col.isPK ? (
          <Key size={11} color="#d97706" strokeWidth={2.5} />
        ) : col.isFK ? (
          <Link2 size={11} color="#0284c7" strokeWidth={2.2} />
        ) : (
          <span style={{ color: dark ? '#475569' : '#cbd5e1', fontSize: 14, lineHeight: 1 }}>·</span>
        )}
        <span style={{ color: nameColor, fontWeight: col.isPK ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {col.name}
        </span>
      </div>
      <span style={{ color: dark ? '#64748b' : '#94a3b8', fontSize: 10, flexShrink: 0 }}>
        {col.type}
      </span>
    </div>
  );
}
