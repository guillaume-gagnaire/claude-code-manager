import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, Diffstat, ToolCall, UserMsg } from '../ui/Chat';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';

/** Project tabs, then agents fill the sidebar; one of them ends up with a question. */
export const Projects: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const asks = frame >= 210;
  const tabs = TABS.map((t, i) => ({
    ...t,
    enter: pop(frame, fps, 4 + i * 10),
    delta: Math.round((t.delta ?? 0) * ramp(frame, 40, 50)),
    waiting: asks && i === 0 ? 1 : 0,
  }));
  const agents = AGENTS.map((a) => (asks && a.name === 'tests-e2e' ? { ...a, status: 'waiting' as const } : a));
  return (
    <Stage>
      <Caption text={captionOf('projects')} />
      <AppWindow>
        <Shell
          tabs={tabs}
          status={{ ...STATUS, active: asks ? 2 : 3, waiting: asks ? 1 : 0 }}
          sidebar={
            <AgentsSidebar
              agents={agents}
              selected="refacto-auth"
              enters={agents.map((_, i) => pop(frame, fps, 40 + i * 14))}
              ring={asks ? 'tests-e2e' : undefined}
            />
          }
        >
          <ConvHeader name="refacto-auth" status="running" sub="demo-api / main" />
          <Conversation>
            <UserMsg text="Refactore l'auth pour passer aux tokens JWT, sans casser les sessions existantes." enter={pop(frame, fps, 60)} />
            {frame > 80 ? (
              <AssistantMsg text="D'accord. Je cartographie l'existant : middleware, routes et stockage des sessions." />
            ) : null}
            <ToolCall tool="Read" target="src/auth/middleware.ts" enter={pop(frame, fps, 110)} />
            <ToolCall
              tool="Grep"
              target="session"
              meta={<span style={{ fontSize: 13, color: '#a8a095' }}>14 fichiers</span>}
              enter={pop(frame, fps, 135)}
            />
            <ToolCall tool="Edit" target="src/auth/jwt.ts" meta={<Diffstat add={58} del={0} />} running enter={pop(frame, fps, 160)} />
          </Conversation>
        </Shell>
      </AppWindow>
    </Stage>
  );
};
