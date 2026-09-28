import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Notify: FC = () => (
  <Stage>
    <Caption text={captionOf('notify')} />
  </Stage>
);
