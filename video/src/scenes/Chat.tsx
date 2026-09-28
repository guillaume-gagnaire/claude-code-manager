import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp, typed } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { AssistantMsg, Conversation, ConvHeader, Diffstat, QuestionCard, ToolCall, UserMsg } from '../ui/Chat';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';

const FIRST = "Je regarde d'abord comment les routes sont organisées.";
const LAST = 'Parfait : 50 éléments par page, et `?limit=` pour changer.';

/** A turn of the conversation: text, tools, a question answered in one click. */
export const Chat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const picked = frame >= 192 ? 1 : null;
  return (
    <Stage>
      <Caption text={captionOf('chat')} />
      <AppWindow>
        <Shell tabs={TABS} status={STATUS} sidebar={<AgentsSidebar agents={AGENTS} selected="pagination-users" />}>
          <ConvHeader name="pagination-users" status="running" sub="demo-api / main" />
          <Conversation>
            <UserMsg text="Ajoute la pagination à l'endpoint `/users`" enter={pop(frame, fps, 4)} />
            <AssistantMsg text={typed(FIRST, frame, fps, 20)} />
            <ToolCall tool="Read" target="src/routes/users.ts" enter={pop(frame, fps, 62)} />
            <ToolCall tool="Edit" target="src/routes/users.ts" meta={<Diffstat add={24} del={3} />} enter={pop(frame, fps, 82)} />
            <ToolCall
              tool="Bash"
              target="npm test"
              meta={frame >= 132 ? <span style={{ fontSize: 13, color: '#a8a095' }}>42 tests</span> : null}
              running={frame < 132}
              enter={pop(frame, fps, 102)}
            />
            <QuestionCard
              question="Quelle taille de page par défaut ?"
              options={['20', '50', '100']}
              picked={picked}
              enter={pop(frame, fps, 145)}
              cursor={frame >= 160 && frame < 215 ? { target: 1, t: ramp(frame, 160, 28), click: ramp(frame, 190, 14) } : undefined}
            />
            {picked !== null ? <AssistantMsg text={typed(LAST, frame, fps, 212)} /> : null}
          </Conversation>
        </Shell>
      </AppWindow>
    </Stage>
  );
};
