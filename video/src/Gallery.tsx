import type { FC } from 'react';
import { AGENTS, STATUS, TABS } from './data';
import { AssistantMsg, Conversation, ConvHeader, Diffstat, QuestionCard, ToolCall, UserMsg } from './ui/Chat';
import { COMMITS, DiffPane, FilesPanel, GitGraph } from './ui/Git';
import { Phone } from './ui/Phone';
import { LogView, RunsSection } from './ui/Runs';
import { Shell } from './ui/Shell';
import { AgentsSidebar } from './ui/Sidebar';
import { AppWindow, Caption, Stage } from './ui/Stage';
import { WinToast } from './ui/Toast';

/** Every piece of the recreated UI on one frame, to check them at a glance. */
export const Gallery: FC = () => (
  <Stage>
    <Caption text="Planche de contrôle" delay={-100} />
    <AppWindow x={-160} scale={0.82}>
      <Shell
        tabs={TABS.map((t, i) => (i === 0 ? { ...t, waiting: 1 } : t))}
        status={STATUS}
        sidebar={<AgentsSidebar agents={AGENTS} selected="refacto-auth" ring="tests-e2e" />}
      >
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <ConvHeader name="refacto-auth" status="running" sub="demo-api / main" />
            <Conversation>
              <UserMsg text="Ajoute la pagination à l'endpoint `/users`" tag="depuis claude.ai" />
              <AssistantMsg text="Je regarde d'abord comment les routes sont organisées." />
              <ToolCall tool="Edit" target="src/routes/users.ts" meta={<Diffstat add={24} del={3} />} />
              <QuestionCard question="Quelle taille de page par défaut ?" options={['20', '50', '100']} picked={1} />
            </Conversation>
          </div>
          <div style={{ width: 460, borderLeft: `1px solid rgba(255,236,214,0.08)` }}>
            <FilesPanel tab="files" files={[{ path: 'src/routes/users.ts', add: 24, del: 3 }]} selected={0} />
            <DiffPane
              rows={[
                { kind: 'chg', l: 'const users = all();', r: 'const users = page(all(), q);' },
                { kind: 'add', r: 'return { users, next };' },
              ]}
              shown={2}
              start={12}
            />
            <GitGraph commits={COMMITS} from={0} shown={7} highlight={1} />
          </div>
        </div>
      </Shell>
    </AppWindow>
    <div style={{ position: 'absolute', left: 1330, top: 700, width: 300, background: '#211f1c' }}>
      <RunsSection
        runs={[
          { name: 'Front', status: 'running' },
          { name: 'Worker', status: 'crashed', code: 1 },
        ]}
      />
    </div>
    <div style={{ position: 'absolute', left: 1330, top: 190, width: 540, height: 280, display: 'flex' }}>
      <LogView title="Front" status="en cours" statusColor="#7cc48d" lines={['$ npm run dev', '  VITE v6.4.3  ready in 412 ms']} />
    </div>
    <Phone x={1500} messages={[{ from: 'claude', text: 'Je lance les tests ?' }]} draft="Oui" />
    <WinToast title="tests-e2e a une question" body="« Je lance aussi Firefox ? »" enter={1} />
  </Stage>
);
