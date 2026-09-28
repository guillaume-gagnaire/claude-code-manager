import type { FC } from 'react';
import { C, MONO, soft } from '../theme';
import { Diffstat } from './Chat';

export const FilesPanel: FC<{ tab: 'files' | 'history'; files: { path: string; add: number; del: number }[]; selected: number }> = ({
  tab,
  files,
  selected,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <div
      style={{ display: 'flex', gap: 18, padding: '14px 18px 10px', borderBottom: `1px solid ${C.line}`, fontSize: 14, fontWeight: 600 }}
    >
      <span
        style={{
          color: tab === 'files' ? C.text : C.dim,
          borderBottom: tab === 'files' ? `2px solid ${C.spark}` : 'none',
          paddingBottom: 6,
        }}
      >
        Non commités {files.length}
      </span>
      <span
        style={{
          color: tab === 'history' ? C.text : C.dim,
          borderBottom: tab === 'history' ? `2px solid ${C.spark}` : 'none',
          paddingBottom: 6,
        }}
      >
        Historique
      </span>
    </div>
    {tab === 'files'
      ? files.map((f, i) => (
          <div
            key={f.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '0 10px',
              padding: '7px 10px',
              borderRadius: 6,
              background: i === selected ? C.elev : 'transparent',
              fontFamily: MONO,
              fontSize: 13,
            }}
          >
            <span style={{ color: C.wait }}>M</span>
            <span style={{ flex: 1 }}>{f.path}</span>
            <Diffstat add={f.add} del={f.del} />
          </div>
        ))
      : null}
  </div>
);

export interface DiffRow {
  kind: 'ctx' | 'chg' | 'add';
  l?: string;
  r?: string;
}

/** A side-by-side diff; `shown` rows are visible. */
export const DiffPane: FC<{ rows: DiffRow[]; shown: number; start: number }> = ({ rows, shown, start }) => (
  <div
    style={{ margin: '10px 14px', borderRadius: 8, border: `1px solid ${C.line}`, overflow: 'hidden', fontFamily: MONO, fontSize: 12.5 }}
  >
    {rows.slice(0, shown).map((row, i) => (
      <div key={i} style={{ display: 'flex', minHeight: 24 }}>
        {(['l', 'r'] as const).map((side) => {
          const text = row[side];
          const bg =
            row.kind === 'ctx' || text === undefined
              ? 'transparent'
              : side === 'l'
                ? soft(C.del, row.kind === 'chg' ? 16 : 0)
                : soft(C.ok, 16);
          return (
            <div
              key={side}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                display: 'flex',
                background: bg,
                borderLeft: side === 'r' ? `1px solid ${C.line}` : 'none',
              }}
            >
              <span style={{ width: 34, flex: 'none', textAlign: 'right', paddingRight: 8, color: C.dim }}>
                {text === undefined ? '' : start + i}
              </span>
              <span style={{ whiteSpace: 'pre', color: C.text }}>{text ?? ''}</span>
            </div>
          );
        })}
      </div>
    ))}
  </div>
);

export interface Commit {
  lane: number;
  msg: string;
  hash: string;
  refs?: string[];
}

/** Newest first. Lane 0: main; lane 1: the agent's branch; lane 2: another agent. */
export const COMMITS: Commit[] = [
  { lane: 0, msg: 'Merge ccm/pagination-users', hash: 'f1a07b3', refs: ['main'] },
  { lane: 1, msg: 'Pagination de /users (limit, curseur)', hash: 'a3f9c21', refs: ['ccm/pagination-users'] },
  { lane: 1, msg: 'Tests de la pagination', hash: '7be01d4' },
  { lane: 0, msg: 'Corrige le login OAuth', hash: '19ce8a0' },
  { lane: 2, msg: 'Docs : endpoints v2', hash: 'c04d7f2', refs: ['ccm/docs-api'] },
  { lane: 1, msg: 'Prépare le modèle User', hash: '5d2e9ab' },
  { lane: 0, msg: 'Release 1.4.0', hash: 'e8a1f30', refs: ['v1.4.0'] },
];

const LANE = [C.muted, C.spark, 'oklch(0.72 0.12 200)'];

/** The git graph; rows before `from` (the merge) are hidden, `shown` rows appear from there. */
export const GitGraph: FC<{ commits: Commit[]; from: number; shown: number; highlight: number }> = ({
  commits,
  from,
  shown,
  highlight,
}) => {
  const rows = commits.slice(from, from + shown);
  const y = (i: number) => 26 + i * 50;
  const x = (lane: number) => 28 + lane * 30;
  const last = commits.length - 1 - from;
  const lanes = [0, 1, 2].map((lane) => rows.map((c, i) => (c.lane === lane ? i : -1)).filter((i) => i >= 0));
  return (
    <div style={{ position: 'relative', margin: '8px 14px' }}>
      <svg width="120" height={y(Math.max(rows.length, 1))} style={{ position: 'absolute', left: 0, top: 0 }}>
        {lanes.map((idx, lane) => {
          if (!idx.length) return null;
          const top = lane === 0 ? 0 : idx[0];
          const bottom = lane === 0 ? rows.length - 1 : Math.min(idx[idx.length - 1] + 1, last);
          const color = lane === highlight ? C.spark : LANE[lane];
          const width = lane === highlight ? 4 : 2.5;
          return (
            <g key={lane} stroke={color} strokeWidth={width} fill="none">
              <line x1={x(lane)} y1={y(top)} x2={x(lane)} y2={y(Math.max(top, bottom - (lane ? 1 : 0)))} />
              {lane && bottom <= rows.length - 1 ? (
                <path d={`M${x(lane)} ${y(bottom - 1)} C ${x(lane)} ${y(bottom) - 10}, ${x(0)} ${y(bottom) - 30}, ${x(0)} ${y(bottom)}`} />
              ) : null}
            </g>
          );
        })}
        {from === 0 && rows.length > 1 ? (
          <path
            d={`M${x(1)} ${y(1)} C ${x(1)} ${y(0) + 20}, ${x(0)} ${y(0) + 30}, ${x(0)} ${y(0)}`}
            stroke={C.spark}
            strokeWidth={4}
            fill="none"
          />
        ) : null}
        {rows.map((c, i) => (
          <circle
            key={c.hash}
            cx={x(c.lane)}
            cy={y(i)}
            r={c.lane === highlight ? 8 : 6.5}
            fill={C.bg}
            stroke={c.lane === highlight ? C.spark : LANE[c.lane]}
            strokeWidth={3}
          />
        ))}
      </svg>
      <div style={{ paddingLeft: 120 }}>
        {rows.map((c) => (
          <div
            key={c.hash}
            style={{ height: 50, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden' }}
          >
            {c.refs?.map((r) => (
              <span
                key={r}
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: r.startsWith('ccm/pagination') ? soft(C.spark, 25) : C.elev2,
                  color: r.startsWith('ccm/pagination') ? C.spark : C.muted,
                }}
              >
                {r}
              </span>
            ))}
            <span
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: c.lane === highlight ? C.text : C.muted,
                fontWeight: c.lane === highlight ? 600 : 400,
              }}
            >
              {c.msg}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{c.hash}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
