import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, QuestionCard } from '../ui/Chat';
import { Keys } from '../ui/Keys';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';
import { WinToast } from '../ui/Toast';

/** An agent waits: badge, Windows notification, Ctrl+J jumps to it. */
export const Notify: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const asks = frame >= 16;
  const jumped = frame >= 138;
  const agents = AGENTS.map((a) => (asks && a.name === 'tests-e2e' ? { ...a, status: 'waiting' as const } : a));
  const keys = pop(frame, fps, 100, 16) - ramp(frame, 150, 14);
  return (
    <Stage>
      <Caption text={captionOf('notify')} />
      <AppWindow>
        <Shell
          tabs={TABS.map((t, i) => (i === 0 && asks ? { ...t, waiting: 1 } : t))}
          status={{ ...STATUS, active: 2, waiting: asks ? 1 : 0 }}
          sidebar={
            <AgentsSidebar
              agents={agents}
              selected={jumped ? 'tests-e2e' : 'refacto-auth'}
              ring={asks && !jumped ? 'tests-e2e' : undefined}
            />
          }
        >
          {jumped ? (
            <>
              <ConvHeader name="tests-e2e" status="waiting" sub="demo-api / main" />
              <Conversation>
                <AssistantMsg text="Les 18 scénarios passent sur Chrome." />
                <QuestionCard
                  question="Je lance aussi les tests sur Firefox ?"
                  options={['Oui', 'Non, Chrome suffit']}
                  enter={pop(frame, fps, 142)}
                />
              </Conversation>
            </>
          ) : (
            <>
              <ConvHeader name="refacto-auth" status="running" sub="demo-api / main" />
              <Conversation>
                <AssistantMsg text="Je remplace le middleware de session par une vérification du JWT." />
              </Conversation>
            </>
          )}
        </Shell>
      </AppWindow>
      <Keys keys={['Ctrl', 'J']} enter={Math.max(0, keys)} press={ramp(frame, 124, 6) - ramp(frame, 132, 6)} />
      <WinToast
        title="tests-e2e a une question"
        body="« Je lance aussi les tests sur Firefox ? »"
        enter={pop(frame, fps, 36, 16) - ramp(frame, 150, 16)}
      />
    </Stage>
  );
};
