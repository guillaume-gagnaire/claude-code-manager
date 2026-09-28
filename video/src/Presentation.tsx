import type { FC } from 'react';
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from 'remotion';
import { SCENES } from './scenes';
import { C } from './theme';
import { TIMELINE } from './timeline';

export const Presentation: FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {TIMELINE.map((s) => {
      const Scene = SCENES[s.id];
      return (
        <Sequence key={s.id} name={s.id} from={s.from} durationInFrames={s.durationInFrames}>
          <Scene />
        </Sequence>
      );
    })}
    <Html5Audio src={staticFile('music.wav')} />
  </AbsoluteFill>
);
