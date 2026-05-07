import { Fragment, useEffect, useMemo, useRef } from 'react';
import type { RendererHandle, RendererProps } from '../../utils/diagrams/registry';
import type { SequenceArrow, SequenceMessage, SequenceNote, SequenceParticipant, SequenceStep } from '../../utils/diagrams/types';
import { getDiagramTheme } from './shared/theme';

type SequenceRendererProps = RendererProps<'sequence'>;

// Layout constants — tuned to read well at standard zoom levels.
const PARTICIPANT_GAP = 200; // horizontal distance between participant lifelines
const STEP_GAP = 56; // vertical distance between consecutive steps
const HEAD_HEIGHT = 50; // top participant box
const HEAD_PAD_Y = 20; // padding above the first step
const FOOT_HEIGHT = 36; // bottom participant box (mirror of head)
const SIDE_PAD = 40; // outer canvas padding
const PART_BOX_W = 150; // participant box width
const PART_BOX_H = 36; // participant box height
const NOTE_H = 38;
const TITLE_H = 28;
const SELF_LOOP_W = 60; // width of self-message loops

export default function SequenceRenderer({ ir, dark = false, handleRef }: SequenceRendererProps) {
  const theme = getDiagramTheme(dark);
  const containerRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => computeLayout(ir.participants, ir.steps), [ir.participants, ir.steps]);

  useEffect(() => {
    if (!handleRef) return;
    const handle: RendererHandle = {
      getSvgElement: () => containerRef.current?.querySelector('svg.sequence-svg') ?? null,
    };
    handleRef.current = handle;
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [handleRef, layout]);

  const lifelineColor = dark ? '#475569' : '#cbd5e1';
  const headFill = dark ? '#1e293b' : '#f1f5f9';
  const headBorder = dark ? '#475569' : '#cbd5e1';
  const headText = dark ? '#e2e8f0' : '#1e293b';
  const arrowColor = dark ? '#94a3b8' : '#64748b';
  const labelColor = dark ? '#cbd5e1' : '#334155';
  const noteFill = dark ? '#451a03' : '#fef3c7';
  const noteBorder = dark ? '#92400e' : '#fcd34d';
  const noteText = dark ? '#fde68a' : '#78350f';
  const titleY = ir.title ? TITLE_H : 0;
  const headTopY = titleY + HEAD_PAD_Y;

  return (
    <div
      ref={containerRef}
      className="sequence-renderer"
      style={{
        width: '100%',
        background: theme.canvasBg,
        borderRadius: 12,
        padding: 16,
        overflow: 'auto',
      }}
    >
      <svg
        className="sequence-svg"
        xmlns="http://www.w3.org/2000/svg"
        width={layout.width}
        height={layout.height + titleY}
        viewBox={`0 0 ${layout.width} ${layout.height + titleY}`}
        style={{ display: 'block', minWidth: '100%', fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif' }}
      >
        {ir.title && (
          <text
            x={layout.width / 2}
            y={20}
            textAnchor="middle"
            fontSize={15}
            fontWeight={600}
            fill={headText}
          >
            {ir.title}
          </text>
        )}

        {/* Lifelines (vertical dashed) */}
        {ir.participants.map((p) => {
          const x = layout.participantX.get(p.id);
          if (x === undefined) return null;
          return (
            <line
              key={`life-${p.id}`}
              x1={x}
              x2={x}
              y1={headTopY + PART_BOX_H}
              y2={headTopY + PART_BOX_H + layout.contentH + STEP_GAP}
              stroke={lifelineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Participant heads */}
        {ir.participants.map((p) => {
          const x = layout.participantX.get(p.id);
          if (x === undefined) return null;
          return (
            <g key={`head-${p.id}`}>
              <rect
                x={x - PART_BOX_W / 2}
                y={headTopY}
                width={PART_BOX_W}
                height={PART_BOX_H}
                rx={6}
                fill={headFill}
                stroke={headBorder}
                strokeWidth={1}
              />
              <text
                x={x}
                y={headTopY + PART_BOX_H / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={headText}
              >
                {truncate(p.label, 18)}
              </text>
            </g>
          );
        })}

        {/* Steps */}
        {layout.placedSteps.map((ps, i) => {
          if (ps.step.kind === 'message') {
            const fromX = layout.participantX.get(ps.step.from)!;
            // For self-messages on the rightmost participant, flip the loop
            // to grow leftward so the label stays inside the canvas.
            const isSelf = ps.step.from === ps.step.to;
            const isRightmost =
              isSelf && fromX === Math.max(...layout.participantX.values());
            return (
              <Fragment key={i}>
                <MessageStep
                  msg={ps.step}
                  fromX={fromX}
                  toX={layout.participantX.get(ps.step.to)!}
                  y={headTopY + PART_BOX_H + ps.y}
                  arrowColor={arrowColor}
                  labelColor={labelColor}
                  selfDirection={isRightmost ? 'left' : 'right'}
                  canvasWidth={layout.width}
                />
              </Fragment>
            );
          }
          return (
            <Fragment key={i}>
              <NoteStep
                note={ps.step}
                participantXs={ps.step.participants.map((id) => layout.participantX.get(id)!).filter((x) => x !== undefined)}
                y={headTopY + PART_BOX_H + ps.y}
                fill={noteFill}
                border={noteBorder}
                textColor={noteText}
              />
            </Fragment>
          );
        })}

        {/* Participant feet (mirror of heads) */}
        {ir.participants.map((p) => {
          const x = layout.participantX.get(p.id);
          if (x === undefined) return null;
          const footY = headTopY + PART_BOX_H + layout.contentH + STEP_GAP - PART_BOX_H / 2;
          return (
            <g key={`foot-${p.id}`}>
              <rect
                x={x - PART_BOX_W / 2}
                y={footY}
                width={PART_BOX_W}
                height={PART_BOX_H}
                rx={6}
                fill={headFill}
                stroke={headBorder}
                strokeWidth={1}
              />
              <text
                x={x}
                y={footY + PART_BOX_H / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill={headText}
              >
                {truncate(p.label, 18)}
              </text>
            </g>
          );
        })}

        <ArrowDefs arrowColor={arrowColor} />
      </svg>
    </div>
  );
}

// ── Message rendering ────────────────────────────────────────────────────

function MessageStep({
  msg,
  fromX,
  toX,
  y,
  arrowColor,
  labelColor,
  selfDirection = 'right',
  canvasWidth,
}: {
  msg: SequenceMessage;
  fromX: number;
  toX: number;
  y: number;
  arrowColor: string;
  labelColor: string;
  selfDirection?: 'left' | 'right';
  canvasWidth?: number;
}) {
  const isReply = msg.arrow === 'reply';
  const isAsync = msg.arrow === 'async';
  const isCross = msg.arrow === 'cross';
  const dasharray = isReply ? '5 4' : isAsync ? '8 3' : undefined;
  const markerEnd = isCross ? 'url(#arr-cross)' : isAsync ? 'url(#arr-open)' : 'url(#arr-solid)';

  const labelX = (fromX + toX) / 2;
  const labelY = y - 8;
  const showSelf = fromX === toX;

  if (showSelf) {
    // Self-message — small loop. Direction picked by caller so loops on the
    // rightmost participant grow leftward (keeping the label inside canvas).
    const dir = selfDirection === 'left' ? -1 : 1;
    const loopEndX = fromX + dir * SELF_LOOP_W;
    // Place label on the side of the loop with more room.
    const labelText = truncate(msg.label, 28);
    const charW = 6.2;
    const approxLabelW = labelText.length * charW;
    const labelXPos =
      dir === 1
        ? // loop opens right; label sits to the right of the loop's edge
          Math.min(loopEndX + 8, (canvasWidth ?? Infinity) - approxLabelW - 4)
        : // loop opens left; label sits to the left of the loop's edge
          Math.max(loopEndX - approxLabelW - 8, 4);
    return (
      <g>
        <path
          d={`M ${fromX} ${y} h ${dir * SELF_LOOP_W} v 22 h ${-dir * SELF_LOOP_W}`}
          fill="none"
          stroke={arrowColor}
          strokeWidth={1.4}
          strokeDasharray={dasharray}
          markerEnd={markerEnd}
        />
        <text
          x={labelXPos}
          y={y + 14}
          fontSize={11}
          fill={labelColor}
          textAnchor={dir === 1 ? 'start' : 'start'}
        >
          {labelText}
        </text>
      </g>
    );
  }

  return (
    <g>
      <text
        x={labelX}
        y={labelY}
        textAnchor="middle"
        fontSize={11}
        fill={labelColor}
        fontWeight={500}
      >
        {truncate(msg.label, 60)}
      </text>
      <line
        x1={fromX}
        x2={toX}
        y1={y}
        y2={y}
        stroke={arrowColor}
        strokeWidth={1.4}
        strokeDasharray={dasharray}
        markerEnd={markerEnd}
      />
    </g>
  );
}

// ── Note rendering ───────────────────────────────────────────────────────

function NoteStep({
  note,
  participantXs,
  y,
  fill,
  border,
  textColor,
}: {
  note: SequenceNote;
  participantXs: number[];
  y: number;
  fill: string;
  border: string;
  textColor: string;
}) {
  if (participantXs.length === 0) return null;

  let x = 0;
  let w = 160;
  if (note.side === 'over') {
    const min = Math.min(...participantXs);
    const max = Math.max(...participantXs);
    w = Math.max(160, max - min + 80);
    x = min - (w - (max - min)) / 2;
  } else if (note.side === 'left') {
    x = participantXs[0] - 90 - 60;
    w = 140;
  } else {
    x = participantXs[0] + 60;
    w = 140;
  }

  return (
    <g>
      <rect
        x={x}
        y={y - 6}
        width={w}
        height={NOTE_H}
        rx={4}
        fill={fill}
        stroke={border}
        strokeWidth={1}
      />
      <text x={x + w / 2} y={y + NOTE_H / 2 - 1} textAnchor="middle" fontSize={11} fill={textColor}>
        {truncate(note.text, 50)}
      </text>
    </g>
  );
}

// ── Arrow head defs ──────────────────────────────────────────────────────

function ArrowDefs({ arrowColor }: { arrowColor: string }) {
  return (
    <defs>
      <marker id="arr-solid" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={arrowColor} />
      </marker>
      <marker id="arr-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10" fill="none" stroke={arrowColor} strokeWidth="1.5" />
      </marker>
      <marker id="arr-cross" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="9" markerHeight="9" orient="auto">
        <path d="M 0 0 L 10 10 M 10 0 L 0 10" stroke={arrowColor} strokeWidth="1.5" />
      </marker>
    </defs>
  );
}

// ── Layout computation ──────────────────────────────────────────────────

interface PlacedStep {
  step: SequenceStep;
  y: number;
}

interface LayoutResult {
  width: number;
  height: number;
  contentH: number;
  participantX: Map<string, number>;
  placedSteps: PlacedStep[];
}

function computeLayout(
  participants: SequenceParticipant[],
  steps: SequenceStep[]
): LayoutResult {
  const participantX = new Map<string, number>();
  participants.forEach((p, i) => {
    participantX.set(p.id, SIDE_PAD + PART_BOX_W / 2 + i * PARTICIPANT_GAP);
  });

  const lastX = (participants.length - 1) * PARTICIPANT_GAP + SIDE_PAD * 2 + PART_BOX_W;

  const placedSteps: PlacedStep[] = [];
  // Push the first step well clear of the participant heads so the
  // arrow's label (drawn 8px above the line) doesn't sit on top of the
  // box border.
  let y = 36;
  for (const step of steps) {
    placedSteps.push({ step, y });
    y += step.kind === 'note' ? NOTE_H + 16 : STEP_GAP;
  }

  return {
    width: lastX,
    height: HEAD_PAD_Y + PART_BOX_H + y + STEP_GAP + PART_BOX_H + FOOT_HEIGHT,
    contentH: y,
    participantX,
    placedSteps,
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// Re-export types for tooling convenience
export type { SequenceArrow };
