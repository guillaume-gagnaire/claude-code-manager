import type { FC } from 'react';
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from 'remotion';
import { Chaos } from './scenes/Chaos';
import { Chat } from './scenes/Chat';
import { Git } from './scenes/Git';
import { Intro } from './scenes/Intro';
import { Launch } from './scenes/Launch';
import { Notify } from './scenes/Notify';
import { Outro } from './scenes/Outro';
import { Projects } from './scenes/Projects';
import { Remote } from './scenes/Remote';
import { Stats } from './scenes/Stats';
import { C } from './theme';
import { TIMELINE, type SceneId } from './timeline';

const SCENES: Record<SceneId, FC> = {
  intro: Intro,
  chaos: Chaos,
  projects: Projects,
  chat: Chat,
  notify: Notify,
  git: Git,
  launch: Launch,
  stats: Stats,
  remote: Remote,
  outro: Outro,
};

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
