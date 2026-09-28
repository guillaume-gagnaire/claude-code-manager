import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Launch: FC = () => (
  <Stage>
    <Caption text={captionOf('launch')} />
  </Stage>
);
