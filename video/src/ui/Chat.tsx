import type { FC, ReactNode } from 'react';
import { C, MONO, soft } from '../theme';
import { Cursor } from './Cursor';
import { Dot } from './Shell';

/** Text with `inline code`. */
const Rich: FC<{ text: string }> = ({ text }) => (
  <>
    {text.split('`').map((part, i) =>
      i % 2 ? (
        <code key={i} style={{ fontFamily: MONO, fontSize: '0.86em', background: C.elev2, padding: '1px 6px', borderRadius: 4 }}>
          {part}
        </code>
      ) : (
        <span key={i}>{part}</span>
      ),
    )}
  </>
);

export const ConvHeader: FC<{ name: string; status: 'running' | 'waiting' | 'done'; sub: string }> = ({ name, status, sub }) => (
  <div
    style={{
      height: 64,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 28px',
      borderBottom: `1px solid ${C.line}`,
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: status === 'waiting' ? C.wait : C.ok }}>
          <Dot color={status === 'waiting' ? C.wait : C.ok} size={7} pulse={status !== 'done'} />
          {status === 'running' ? 'En cours' : status === 'waiting' ? 'Question' : 'Terminé'}
        </span>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{sub}</span>
    </div>
  </div>
);

export const Conversation: FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 14, padding: '22px 36px' }}>
    {children}
  </div>
);

/** Appearance of a message: fades and slides up. */
const enterStyle = (e: number) => ({ opacity: Math.min(1, e), transform: `translateY(${(1 - Math.min(1, e)) * 16}px)` });

export const UserMsg: FC<{ text: string; tag?: string; enter?: number }> = ({ text, tag, enter = 1 }) =>
  enter <= 0 ? null : (
    <div
      style={{
        alignSelf: 'flex-end',
        maxWidth: '72%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 5,
        ...enterStyle(enter),
      }}
    >
      <div style={{ background: C.user, borderRadius: 14, padding: '11px 16px', fontSize: 17, lineHeight: 1.45 }}>
        <Rich text={text} />
      </div>
      {tag ? <span style={{ fontSize: 12, color: C.info }}>{tag}</span> : null}
    </div>
  );

export const AssistantMsg: FC<{ text: string }> = ({ text }) =>
  text ? (
    <div style={{ fontSize: 17, lineHeight: 1.55, maxWidth: '88%' }}>
      <Rich text={text} />
    </div>
  ) : null;

export const Diffstat: FC<{ add: number; del: number }> = ({ add, del }) => (
  <span style={{ fontFamily: MONO, fontSize: 13 }}>
    <span style={{ color: C.ok }}>+{add}</span> <span style={{ color: C.del }}>−{del}</span>
  </span>
);

const GLYPH: Record<string, string> = { Read: '◇', Edit: '✎', Bash: '$', Grep: '⌕', Write: '+' };

export const ToolCall: FC<{ tool: string; target: string; meta?: ReactNode; running?: boolean; enter?: number }> = ({
  tool,
  target,
  meta,
  running,
  enter = 1,
}) =>
  enter <= 0 ? null : (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 40,
        padding: '0 14px',
        borderRadius: 8,
        border: `1px solid ${C.line}`,
        background: soft(C.elev, 60),
        fontSize: 14,
        ...enterStyle(enter),
      }}
    >
      <span style={{ width: 18, textAlign: 'center', color: C.spark, fontFamily: MONO }}>{GLYPH[tool] ?? '•'}</span>
      <b>{tool}</b>
      <span style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>{target}</span>
      <div style={{ flex: 1 }} />
      {meta}
      {running ? <Dot color={C.ok} size={7} pulse /> : <span style={{ color: C.ok }}>✓</span>}
    </div>
  );

/** Claude's question, its options; `cursor` moves the pointer from afar onto option `target` (t: 0 to 1), then clicks. */
export const QuestionCard: FC<{
  question: string;
  options: string[];
  picked?: number | null;
  enter?: number;
  cursor?: { target: number; t: number; click: number };
}> = ({ question, options, picked = null, enter = 1, cursor }) =>
  enter <= 0 ? null : (
    <div
      style={{
        position: 'relative',
        borderRadius: 12,
        border: `1px solid ${soft(C.wait, 60)}`,
        background: soft(C.wait, 7),
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        ...enterStyle(enter),
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.wait }}>
        Question de Claude
      </span>
      <span style={{ fontSize: 18, fontWeight: 600 }}>{question}</span>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        {options.map((o, i) => (
          <span
            key={o}
            style={{
              minWidth: 120,
              height: 40,
              padding: '0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: `1px solid ${picked === i ? C.spark : C.line2}`,
              background: picked === i ? C.spark : cursor && cursor.target === i && cursor.t >= 1 ? C.elev2 : C.elev,
              color: picked === i ? '#1b1512' : C.text,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {o}
          </span>
        ))}
      </div>
      {cursor ? (
        <Cursor x={18 + cursor.target * 130 + 70 + (1 - cursor.t) * 320} y={112 + (1 - cursor.t) * 140} click={cursor.click} />
      ) : null}
    </div>
  );
