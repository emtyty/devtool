import { Fragment } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { ClassMember, ClassNode as ClassNodeIR, ClassVisibility } from '../../../../utils/diagrams/types';

const VIS_SYMBOL: Record<ClassVisibility, string> = {
  public: '+',
  private: '-',
  protected: '#',
  package: '~',
};

export interface ClassNodeData extends Record<string, unknown> {
  cls: ClassNodeIR;
  dark: boolean;
}

const HANDLE_STYLE = { background: 'transparent', border: 'none', width: 1, height: 1, opacity: 0 } as const;

interface Props {
  data: ClassNodeData;
}

export default function ClassNodeComponent({ data }: Props) {
  const { cls, dark } = data;
  const attributes = cls.members.filter((m) => m.kind === 'attribute');
  const methods = cls.members.filter((m) => m.kind === 'method');

  const bg = dark ? '#0f172a' : '#ffffff';
  const border = dark ? '#475569' : '#cbd5e1';
  const headerBg = dark ? '#1e293b' : '#f1f5f9';
  const text = dark ? '#e2e8f0' : '#1e293b';
  const subtle = dark ? '#94a3b8' : '#64748b';
  const divider = dark ? '#1e293b' : '#e2e8f0';

  return (
    <div
      style={{
        minWidth: 200,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
        fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />

      <div style={{ padding: '8px 12px', background: headerBg, borderBottom: `1px solid ${border}`, textAlign: 'center' }}>
        {cls.stereotype && (
          <div style={{ color: subtle, fontSize: 10, fontStyle: 'italic' }}>
            «{cls.stereotype}»
          </div>
        )}
        <div style={{ color: text, fontWeight: 600, fontSize: 13 }}>{cls.label}</div>
      </div>

      {attributes.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: methods.length > 0 ? `1px solid ${divider}` : 'none' }}>
          {attributes.map((m, i) => (
            <Fragment key={i}>
              <MemberRow member={m} text={text} subtle={subtle} />
            </Fragment>
          ))}
        </div>
      )}
      {methods.length > 0 && (
        <div style={{ padding: '6px 12px' }}>
          {methods.map((m, i) => (
            <Fragment key={i}>
              <MemberRow member={m} text={text} subtle={subtle} />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, text, subtle }: { member: ClassMember; text: string; subtle: string }) {
  const sym = member.visibility ? VIS_SYMBOL[member.visibility] : '';
  const sig =
    member.kind === 'method'
      ? `${member.name}(${member.parameters ?? ''})${member.returnType ? `: ${member.returnType}` : ''}`
      : `${member.name}${member.returnType ? `: ${member.returnType}` : ''}`;
  return (
    <div
      style={{
        fontFamily: '"Fira Code", ui-monospace, monospace',
        fontSize: 11,
        color: text,
        display: 'flex',
        gap: 4,
      }}
    >
      <span style={{ color: subtle, width: 8 }}>{sym}</span>
      <span style={{ flex: 1 }}>{sig}</span>
    </div>
  );
}
