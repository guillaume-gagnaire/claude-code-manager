import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Remote: FC = () => (
  <Stage>
    <Caption text={captionOf('remote')} />
  </Stage>
);
