import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { C } from '../theme';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, Diffstat, ToolCall } from '../ui/Chat';
import { COMMITS, DiffPane, FilesPanel, GitGraph, type DiffRow } from '../ui/Git';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';

const FILES = [
  { path: 'src/routes/users.ts', add: 24, del: 3 },
  { path: 'src/db/paginate.ts', add: 41, del: 0 },
  { path: 'tests/users.test.ts', add: 37, del: 2 },
];
const ROWS: DiffRow[] = [
  { kind: 'ctx', l: "router.get('/users', async (req) => {", r: "router.get('/users', async (req) => {" },
  { kind: 'chg', l: '  const users = await db.users.all();', r: '  const { limit = 50, cursor } = req.query;' },
  { kind: 'add', r: '  const page = await paginate(db.users, {' },
  { kind: 'add', r: '    limit: Math.min(limit, 100),' },
  { kind: 'add', r: '    cursor,' },
  { kind: 'add', r: '  });' },
  { kind: 'chg', l: '  return users;', r: '  return { users: page.items, next: page.next };' },
  { kind: 'ctx', l: '});', r: '});' },
];

/** Split layout with the diff, then the history, and the merge. */
export const Git: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const history = frame >= 150;
  const merged = frame >= 236;
  return (
    <Stage>
      <Caption text={captionOf('git')} />
      <AppWindow>
        <Shell
          tabs={TABS}
          status={STATUS}
          sidebar={
            <AgentsSidebar
              agents={AGENTS.slice(0, 3).map((a) => (merged && a.name === 'pagination-users' ? { ...a, status: 'done' as const } : a))}
              selected="pagination-users"
            />
          }
        >
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <ConvHeader name="pagination-users" status={merged ? 'done' : 'running'} sub="demo-api / ccm/pagination-users" />
              <Conversation>
                <AssistantMsg text="La pagination est en place, avec ses tests." />
                <ToolCall tool="Edit" target="src/db/paginate.ts" meta={<Diffstat add={41} del={0} />} />
                <ToolCall tool="Bash" target="npm test" meta={<span style={{ fontSize: 13, color: C.muted }}>48 tests</span>} />
                {merged ? <AssistantMsg text="Branche mergée dans `main` ✓" /> : null}
              </Conversation>
            </div>
            <div
              style={{
                width: 620,
                flex: 'none',
                borderLeft: `1px solid ${C.line}`,
                background: C.panel,
                opacity: Math.min(1, pop(frame, fps, 0, 18)),
              }}
            >
              <FilesPanel tab={history ? 'history' : 'files'} files={FILES} selected={0} />
              {history ? (
                <GitGraph
                  commits={COMMITS}
                  from={merged ? 0 : 1}
                  shown={Math.floor(ramp(frame, 156, 40) * 6) + (merged ? 1 : 0)}
                  highlight={1}
                />
              ) : (
                <DiffPane rows={ROWS} shown={Math.floor(ramp(frame, 20, 60) * ROWS.length)} start={14} />
              )}
            </div>
          </div>
        </Shell>
      </AppWindow>
    </Stage>
  );
};
