import type { FC } from 'react';
import { captionOf } from '../timeline';
import { Caption, Stage } from '../ui/Stage';

export const Chat: FC = () => (
  <Stage>
    <Caption text={captionOf('chat')} />
  </Stage>
);
