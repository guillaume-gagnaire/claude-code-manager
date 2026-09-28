import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop, ramp } from '../anim';
import { AGENTS, STATUS, TABS } from '../data';
import { C } from '../theme';
import { captionOf } from '../timeline';
import { LogView, RunsSection, type Run } from '../ui/Runs';
import { Shell } from '../ui/Shell';
import { AgentsSidebar } from '../ui/Sidebar';
import { AppWindow, Caption, Stage } from '../ui/Stage';
import { AppToast } from '../ui/Toast';

const LOG = [
  '$ npm run dev',
  '',
  '> demo-api@2.3.0 dev',
  '> vite',
  '',
  '  VITE v6.4.3  ready in 412 ms',
  '',
  '  ➜  Local:   http://localhost:5173/',
  '  ➜  Network: use --host to expose',
  '',
  '  12:04:31 [vite] page reload src/routes/users.ts',
];

/** « Tout lancer »: three commands start, one crashes and says so. */
export const Launch: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const started = (i: number) => frame >= 46 + i * 6;
  const crashed = frame >= 150;
  const runs: Run[] = [
    { name: 'Front', status: started(0) ? 'running' : 'ready' },
    { name: 'API', status: started(1) ? 'running' : 'ready' },
    { name: 'Worker', status: crashed ? 'crashed' : started(2) ? 'running' : 'ready', code: 1 },
  ];
  const shownLines = frame < 50 ? 0 : Math.min(LOG.length, Math.floor((frame - 50) / 6) + 1);
  return (
    <Stage>
      <Caption text={captionOf('launch')} />
      <AppWindow>
        <Shell
          tabs={TABS}
          status={STATUS}
          sidebar={
            <>
              <AgentsSidebar agents={AGENTS.slice(0, 2)} />
              <RunsSection
                runs={runs}
                selected={0}
                pressed={ramp(frame, 36, 4) - ramp(frame, 42, 4)}
                cursor={frame < 70 ? { t: ramp(frame, 8, 26), click: ramp(frame, 38, 14) } : undefined}
                glow={ramp(frame, 0, 20)}
              />
            </>
          }
        >
          <LogView
            title="Front"
            status={started(0) ? 'en cours' : 'prêt'}
            statusColor={started(0) ? C.ok : C.dim}
            lines={LOG.slice(0, shownLines)}
          />
          <AppToast text="« Worker » s'est arrêté en erreur (code 1)" enter={pop(frame, fps, 152, 16)} />
        </Shell>
      </AppWindow>
    </Stage>
  );
};
