import type { FC, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { fr } from '../anim';
import { C, hue, MONO, soft, UI } from '../theme';
import { Logo } from './Logo';

export interface Tab {
  name: string;
  hue: number;
  delta?: number;
  waiting?: number;
  running?: boolean;
  /** Appearance, 0 to 1. */
  enter?: number;
}

export interface Status {
  active: number;
  waiting: number;
  done: number;
  /** Quotas, in %. */
  session: number;
  weekly: number;
  cost: number;
  estimated?: boolean;
}

export const Dot: FC<{ color: string; size?: number; pulse?: boolean }> = ({ color, size = 8, pulse }) => {
  const frame = useCurrentFrame();
  const k = pulse ? (frame % 30) / 30 : 0;
  return (
    <span
      style={{
        display: 'inline-block',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: pulse ? `0 0 0 ${k * 7}px ${soft(color, (1 - k) * 45)}` : 'none',
      }}
    />
  );
};

const TitleBar: FC<{ tabs: Tab[]; active: number }> = ({ tabs, active }) => {
  const frame = useCurrentFrame();
  return (
    <header
      style={{
        height: 48,
        flex: 'none',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 4,
        padding: '0 14px',
        background: C.bar,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div style={{ alignSelf: 'center', paddingRight: 12, display: 'flex' }}>
        <Logo size={26} />
      </div>
      {tabs.map((t, i) => {
        const e = t.enter ?? 1;
        if (e <= 0) return null;
        const on = i === active;
        return (
          <div
            key={t.name}
            style={{
              height: 38,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '0 15px',
              borderRadius: '9px 9px 0 0',
              background: on ? C.bg : 'transparent',
              border: `1px solid ${on ? C.line2 : 'transparent'}`,
              borderBottom: 'none',
              fontSize: 15,
              fontWeight: 600,
              color: on ? C.text : C.muted,
              opacity: Math.min(1, e),
              transform: `translateY(${(1 - e) * 20}px)`,
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 3, background: hue(t.hue) }} />
            {t.name}
            {t.running ? <Dot color={C.ok} size={6} /> : null}
            {t.delta ? (
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, background: C.elev, padding: '1px 6px', borderRadius: 4 }}>
                Δ {t.delta}
              </span>
            ) : null}
            {t.waiting ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: '#1b1512',
                  background: C.wait,
                  borderRadius: 9,
                  padding: '0 7px',
                  boxShadow: `0 0 0 ${3 + 3 * Math.sin(frame / 4)}px ${soft(C.wait, 30)}`,
                }}
              >
                {t.waiting}
              </span>
            ) : null}
          </div>
        );
      })}
      <div style={{ width: 30, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 20 }}>
        +
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ alignSelf: 'center', display: 'flex', gap: 24, color: C.muted, fontSize: 14, fontFamily: UI }}>
        <span>Stats</span>
        <span>—</span>
        <span>☐</span>
        <span>✕</span>
      </div>
    </header>
  );
};

const Quota: FC<{ label: string; pct: number }> = ({ label, pct }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    {label}
    <span style={{ width: 80, height: 6, borderRadius: 3, background: C.elev2, overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: C.spark }} />
    </span>
    <b style={{ color: C.text }}>{Math.round(pct)} %</b>
  </span>
);

const StatusBar: FC<Status & { glow: number }> = ({ active, waiting, done, session, weekly, cost, estimated, glow }) => (
  <footer
    style={{
      height: 34,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      padding: '0 18px',
      borderTop: `1px solid ${C.line}`,
      background: C.bar,
      fontFamily: MONO,
      fontSize: 13,
      color: C.muted,
      boxShadow: glow ? `inset 0 0 0 2px ${soft(C.spark, 80 * glow)}, 0 0 ${40 * glow}px ${soft(C.spark, 40 * glow)}` : 'none',
    }}
  >
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Dot color={C.ok} /> {active} actif
    </span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Dot color={C.wait} /> {waiting} en attente
    </span>
    <span>
      <span style={{ color: C.ok }}>✓</span> {done} terminé
    </span>
    <span style={{ color: C.line2 }}>|</span>
    <Quota label="Session 5 h" pct={session} />
    <Quota label="Hebdo" pct={weekly} />
    <span style={{ color: C.line2 }}>|</span>
    <span>
      Aujourd'hui{' '}
      <b style={{ color: C.text }}>
        {estimated ? '≈ ' : ''}
        {fr(cost)} $
      </b>
    </span>
  </footer>
);

/** The app: tabs, sidebar, main area, status bar. */
export const Shell: FC<{
  tabs: Tab[];
  active?: number;
  sidebar?: ReactNode;
  children?: ReactNode;
  status: Status;
  glowStatus?: number;
}> = ({ tabs, active = 0, sidebar, children, status, glowStatus = 0 }) => (
  <div
    style={{
      width: '100%',
      height: '100%',
      borderRadius: 14,
      overflow: 'hidden',
      background: C.bg,
      border: `1px solid ${C.line2}`,
      boxShadow: '0 40px 120px rgba(0, 0, 0, 0.6)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: UI,
      color: C.text,
    }}
  >
    <TitleBar tabs={tabs} active={active} />
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {sidebar !== undefined ? (
        <aside
          style={{
            width: 300,
            flex: 'none',
            background: C.panel,
            borderRight: `1px solid ${C.line}`,
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 10px',
            gap: 6,
          }}
        >
          {sidebar}
        </aside>
      ) : null}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>{children}</main>
    </div>
    <StatusBar {...status} glow={glowStatus} />
  </div>
);
