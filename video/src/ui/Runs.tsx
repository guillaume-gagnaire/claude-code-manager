import type { FC } from 'react';
import { C, MONO } from '../theme';
import { Cursor } from './Cursor';
import { Dot } from './Shell';
import { Button, SectionHead } from './Sidebar';

export type RunStatus = 'ready' | 'running' | 'crashed';

export interface Run {
  name: string;
  status: RunStatus;
  code?: number;
}

const LABEL = (r: Run) => (r.status === 'ready' ? 'prêt' : r.status === 'running' ? 'en cours' : `planté (code ${r.code})`);
const COLOR: Record<RunStatus, string> = { ready: C.dim, running: C.ok, crashed: C.del };

/** The "Lancement" section; `cursor` moves the pointer onto its button (t: 0 to 1), then clicks. */
export const RunsSection: FC<{
  runs: Run[];
  selected?: number;
  pressed?: number;
  cursor?: { t: number; click: number };
  glow?: number;
}> = ({ runs, selected, pressed = 0, cursor, glow = 0 }) => {
  const running = runs.filter((r) => r.status === 'running').length;
  return (
    <div
      style={{
        position: 'relative',
        borderTop: `1px solid ${C.line}`,
        marginTop: 6,
        paddingTop: 6,
        borderRadius: 10,
        boxShadow: glow ? `0 0 0 2px rgba(217, 119, 87, ${0.7 * glow}), 0 0 40px rgba(217, 119, 87, ${0.3 * glow})` : 'none',
      }}
    >
      <SectionHead
        label="Lancement"
        count={`${running}/${runs.length}`}
        action={<Button pressed={pressed}>{running ? 'Tout arrêter' : 'Tout lancer'}</Button>}
      />
      {runs.map((r, i) => (
        <div
          key={r.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            height: 36,
            padding: '0 10px 0 12px',
            borderRadius: 6,
            background: i === selected ? C.elev : 'transparent',
            border: `1px solid ${i === selected ? C.line2 : 'transparent'}`,
          }}
        >
          <Dot color={COLOR[r.status]} size={7} pulse={r.status === 'running'} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{r.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: COLOR[r.status] }}>{LABEL(r)}</span>
          <span style={{ width: 16, color: r.status === 'running' ? C.muted : C.ok, fontSize: 11 }}>
            {r.status === 'running' ? '■' : '▶'}
          </span>
        </div>
      ))}
      {cursor ? <Cursor x={236 - (1 - cursor.t) * 200} y={22 + (1 - cursor.t) * 180} click={cursor.click} /> : null}
    </div>
  );
};

/** A read-only log, as in the app's launch terminals. */
export const LogView: FC<{ lines: string[]; title: string; status: string; statusColor: string }> = ({
  lines,
  title,
  status,
  statusColor,
}) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
      <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, padding: '2px 7px', borderRadius: 4, background: C.elev2, color: C.info }}>
        PowerShell
      </span>
      <span style={{ fontFamily: MONO, fontSize: 13, color: statusColor, fontWeight: 600 }}>{status}</span>
    </div>
    <div
      style={{
        flex: 1,
        background: C.term,
        padding: '16px 22px',
        fontFamily: MONO,
        fontSize: 15,
        lineHeight: 1.6,
        color: '#d8d0c4',
        whiteSpace: 'pre',
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.startsWith('$') ? C.dim : l.includes('ready') ? '#9bd8a9' : undefined }}>
          {l || ' '}
        </div>
      ))}
    </div>
  </div>
);
