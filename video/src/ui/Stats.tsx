import type { FC } from 'react';
import { fr } from '../anim';
import { C, MONO } from '../theme';

const DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
/** Millions of tokens per day, split by model. */
const TOKENS = [3.1, 4.8, 2.2, 5.6, 6.9, 1.4, 4.1];
const MODELS = [
  { name: 'Opus', share: 0.5, color: '#D97757' },
  { name: 'Sonnet', share: 0.35, color: 'oklch(0.74 0.12 235)' },
  { name: 'Haiku', share: 0.15, color: 'oklch(0.76 0.12 150)' },
];

/** The stats page; `grow` holds each bar's growth (0 to 1), `total` and `cost` the counters. */
export const StatsView: FC<{ grow: number[]; total: number; cost: number; avg: number }> = ({ grow, total, cost, avg }) => (
  <div style={{ flex: 1, padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: 26 }}>
    <div style={{ fontSize: 26, fontWeight: 700 }}>
      Statistiques <span style={{ color: C.dim, fontWeight: 500 }}>· 7 jours</span>
    </div>
    <div style={{ display: 'flex', gap: 18 }}>
      {[
        ['Tokens', `${fr(total, 1)} M`],
        ['Coût', `${fr(cost)} $`],
        ['Coût moyen / prompt', `${fr(avg)} $`],
      ].map(([label, value]) => (
        <div key={label} style={{ flex: 1, padding: '16px 20px', borderRadius: 12, background: C.elev, border: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 13, color: C.muted }}>{label}</div>
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 30, fontWeight: 600 }}>{value}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 18, fontSize: 13, color: C.muted }}>
      {MODELS.map((m) => (
        <span key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: m.color }} />
          {m.name}
        </span>
      ))}
    </div>
    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 28, borderBottom: `1px solid ${C.line2}`, paddingBottom: 2 }}>
      {TOKENS.map((t, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 2, height: `${(t / 7.2) * 100 * grow[i]}%` }}>
          {MODELS.map((m, k) => (
            <div
              key={m.name}
              style={{ height: `${m.share * 100}%`, background: m.color, borderRadius: k === MODELS.length - 1 ? '4px 4px 0 0' : 0 }}
            />
          ))}
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 28, marginTop: -14 }}>
      {DAYS.map((d) => (
        <span key={d} style={{ flex: 1, textAlign: 'center', fontSize: 13, color: C.dim }}>
          {d}
        </span>
      ))}
    </div>
  </div>
);
