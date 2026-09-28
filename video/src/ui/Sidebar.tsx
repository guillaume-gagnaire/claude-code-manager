import type { FC, ReactNode } from 'react';
import { C, MONO, soft } from '../theme';
import { Dot } from './Shell';

export type AgentStatus = 'running' | 'waiting' | 'idle' | 'done' | 'error';

export interface AgentInfo {
  name: string;
  status: AgentStatus;
  model: string;
  time: string;
  tokens: string;
  cost: string;
  files: number;
}

const LABEL: Record<AgentStatus, string> = { running: 'En cours', waiting: 'Question', idle: 'Prêt', done: 'Terminé', error: 'Erreur' };
const COLOR: Record<AgentStatus, string> = { running: C.ok, waiting: C.wait, idle: C.dim, done: C.ok, error: C.del };

export const SectionHead: FC<{ label: string; count?: string; action?: ReactNode }> = ({ label, count, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 8px' }}>
    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>{label}</span>
    {count ? <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{count}</span> : null}
    <div style={{ flex: 1 }} />
    {action}
  </div>
);

export const Button: FC<{ children: ReactNode; pressed?: number; accent?: boolean }> = ({ children, pressed = 0, accent }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 28,
      padding: '0 11px',
      borderRadius: 6,
      border: `1px solid ${accent ? C.spark : C.line2}`,
      background: pressed ? soft(C.spark, 30 * pressed) : C.elev,
      fontSize: 13,
      fontWeight: 600,
      transform: `scale(${1 - 0.06 * pressed})`,
    }}
  >
    {children}
  </span>
);

export const AgentCard: FC<AgentInfo & { selected?: boolean; enter?: number; ring?: boolean }> = ({
  name,
  status,
  model,
  time,
  tokens,
  cost,
  files,
  selected,
  enter = 1,
  ring,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      padding: '11px 12px',
      borderRadius: 10,
      border: `1px solid ${selected ? C.line2 : 'transparent'}`,
      background: selected ? C.elev : 'transparent',
      opacity: Math.min(1, enter),
      transform: `translateX(${(1 - enter) * -40}px)`,
      boxShadow: ring ? `0 0 0 2px ${soft(C.wait, 70)}, 0 0 28px ${soft(C.wait, 35)}` : 'none',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Dot color={COLOR[status]} pulse={status === 'running' || status === 'waiting'} />
      <span style={{ flex: 1, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {name}
      </span>
      {status === 'waiting' ? (
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1b1512', background: C.wait, borderRadius: 9, padding: '1px 8px' }}>
          Question
        </span>
      ) : (
        <span style={{ fontSize: 12, color: COLOR[status] }}>{LABEL[status]}</span>
      )}
    </div>
    <div style={{ display: 'flex', gap: 10, paddingLeft: 17, fontFamily: MONO, fontSize: 12, color: C.muted }}>
      <span>{model}</span>
      <span style={{ color: C.dim }}>·</span>
      <span>{time}</span>
    </div>
    <div style={{ display: 'flex', gap: 10, paddingLeft: 17, fontFamily: MONO, fontSize: 12, color: C.dim }}>
      <span>{tokens} tok</span>
      <span>{cost}</span>
      <span>{files} fich.</span>
    </div>
  </div>
);

/** The "Agents" section: its head, then one card per agent. */
export const AgentsSidebar: FC<{ agents: AgentInfo[]; selected?: string | null; enters?: number[]; ring?: string }> = ({
  agents,
  selected,
  enters,
  ring,
}) => (
  <>
    <SectionHead label="Agents" count={String(agents.length)} action={<Button>+ Nouvel agent</Button>} />
    {agents.map((a, i) => (
      <AgentCard key={a.name} {...a} selected={a.name === selected} enter={enters?.[i] ?? 1} ring={a.name === ring} />
    ))}
  </>
);
