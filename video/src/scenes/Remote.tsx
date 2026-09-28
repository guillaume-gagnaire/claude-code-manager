import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp, typed } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { C } from '../theme';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, UserMsg } from '../ui/Chat';
import { Phone } from '../ui/Phone';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';

const ASK = "J'ai fini la refacto de l'auth. Je lance les tests ?";
const REPLY = 'Oui, et ajoute les tests Firefox';

/** The same session on a phone: a message sent from it shows up in the app. */
export const Remote: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = pop(frame, fps, 0, 18);
  const sent = frame >= 122;
  const arrived = frame >= 140;
  return (
    <Stage>
      <Caption text={captionOf('remote')} />
      <AppWindow x={-190 * Math.min(1, slide)} scale={1 - 0.1 * Math.min(1, slide)}>
        <Shell
          tabs={TABS}
          status={STATUS}
          sidebar={
            <AgentsSidebar
              agents={AGENTS.slice(0, 3).map((a) => (!arrived && a.name === 'refacto-auth' ? { ...a, status: 'done' as const } : a))}
              selected="refacto-auth"
            />
          }
        >
          <ConvHeader name="refacto-auth" status={arrived ? 'running' : 'done'} sub="demo-api / main" />
          <Conversation>
            <AssistantMsg text={ASK} />
            <UserMsg text={REPLY} tag="depuis claude.ai" enter={pop(frame, fps, 140)} />
          </Conversation>
        </Shell>
      </AppWindow>
      {sent && !arrived ? (
        <div
          style={{
            position: 'absolute',
            left: 1480 - 280 * ramp(frame, 122, 18),
            top: 560,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: C.spark,
            boxShadow: `0 0 24px ${C.spark}`,
          }}
        />
      ) : null}
      <Phone
        x={1920 - 480 * Math.min(1, pop(frame, fps, 10, 18))}
        messages={[{ from: 'claude', text: ASK }, ...(sent ? [{ from: 'me' as const, text: REPLY }] : [])]}
        draft={sent ? '' : typed(REPLY, frame, fps, 60, 28)}
      />
    </Stage>
  );
};
