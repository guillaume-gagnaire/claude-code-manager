import type { FC } from 'react';
import { useCurrentFrame } from 'remotion';
import { count, ramp } from '../anim';
import { STATUS, TABS } from '../data';
import { captionOf } from '../timeline';
import { Shell } from '../ui/Shell';
import { AppWindow, Caption, Stage } from '../ui/Stage';
import { StatsView } from '../ui/Stats';

/** Live cost and quotas in the status bar, stats of the week. */
export const Stats: FC = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Caption text={captionOf('stats')} />
      <AppWindow>
        <Shell
          tabs={TABS}
          status={{
            ...STATUS,
            cost: count(frame, 20, 180, 3.48, 5.12),
            session: count(frame, 20, 180, 22, 38),
            weekly: count(frame, 20, 180, 36, 41),
          }}
          glowStatus={ramp(frame, 110, 20)}
        >
          <StatsView
            grow={[0, 1, 2, 3, 4, 5, 6].map((i) => ramp(frame, 10 + i * 7, 30))}
            total={count(frame, 10, 90, 0, 28.1)}
            cost={count(frame, 10, 90, 0, 42.17)}
            avg={count(frame, 10, 90, 0, 0.31)}
          />
        </Shell>
      </AppWindow>
    </Stage>
  );
};
