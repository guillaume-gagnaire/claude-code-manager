import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Stats: FC = () => (
  <Stage>
    <Caption text={captionOf('stats')} />
  </Stage>
);
