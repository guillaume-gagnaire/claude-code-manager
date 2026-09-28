import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Git: FC = () => (
  <Stage>
    <Caption text={captionOf('git')} />
  </Stage>
);
