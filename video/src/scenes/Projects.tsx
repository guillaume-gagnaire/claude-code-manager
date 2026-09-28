import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Projects: FC = () => (
  <Stage>
    <Caption text={captionOf('projects')} />
  </Stage>
);
