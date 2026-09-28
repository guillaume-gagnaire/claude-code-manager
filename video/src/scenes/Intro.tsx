import type { FC } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { pop } from '../anim';
import { C } from '../theme';
import { captionOf } from '../timeline';
import { Logo } from '../ui/Logo';
import { Caption, Stage } from '../ui/Stage';

/** The logo builds up window by window, then the name. */
export const Intro: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = pop(frame, fps, 60, 16);
  const sub = pop(frame, fps, 72, 16);
  return (
    <Stage>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          paddingBottom: 150,
        }}
      >
        <Logo
          size={250}
          stack={[pop(frame, fps, 24), pop(frame, fps, 12), pop(frame, fps, 0)]}
          spark={pop(frame, fps, 36, 10)}
          spin={frame * 0.4}
        />
        <div
          style={{
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: -6,
            lineHeight: 1,
            opacity: Math.min(1, title),
            transform: `translateY(${(1 - title) * 40}px)`,
          }}
        >
          CCM
        </div>
        <div
          style={{ fontSize: 46, fontWeight: 500, color: C.muted, opacity: Math.min(1, sub), transform: `translateY(${(1 - sub) * 30}px)` }}
        >
          Claude Code Manager
        </div>
      </div>
      <Caption text={captionOf('intro')} delay={100} top={860} />
    </Stage>
  );
};
