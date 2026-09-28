import type { FC } from 'react';
import { Composition } from 'remotion';
import { Gallery } from './Gallery';
import { Presentation } from './Presentation';
import { Shot } from './Shot';
import { FPS, TOTAL_FRAMES } from './timeline';

export const Root: FC = () => (
  <>
    <Composition id="Presentation" component={Presentation} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    <Composition id="Gallery" component={Gallery} durationInFrames={60} fps={FPS} width={1920} height={1080} />
    <Composition
      id="Shot"
      component={Shot}
      durationInFrames={300}
      fps={FPS}
      width={1920}
      height={960}
      defaultProps={{ scene: 'projects' as const }}
    />
  </>
);
