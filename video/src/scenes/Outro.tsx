import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Outro: FC = () => (
  <Stage>
    <Caption text={captionOf('outro')} />
  </Stage>
);
