import { createContext, useContext, type FC, type ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { pop } from '../anim';
import { C, UI } from '../theme';

/** The backdrop of every scene: dark, with a warm glow. */
export const Stage: FC<{ children?: ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(1300px 760px at 50% 62%, color-mix(in oklch, ${C.spark} 13%, ${C.bg}), ${C.bg} 72%)`,
      fontFamily: UI,
      color: C.text,
      overflow: 'hidden',
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Off for the website's images: they show the interface alone. */
export const CaptionsContext = createContext(true);

/** The scene's text, word by word. */
export const Caption: FC<{ text: string; delay?: number; top?: number; size?: number }> = ({ text, delay = 4, top = 62, size = 50 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!useContext(CaptionsContext)) return null;
  return (
    <div
      style={{ position: 'absolute', top, left: 0, right: 0, textAlign: 'center', fontSize: size, fontWeight: 700, letterSpacing: -0.5 }}
    >
      {text.split(' ').map((w, i) => {
        const p = pop(frame, fps, delay + i * 3, 16);
        return (
          <span
            key={i}
            style={{ display: 'inline-block', margin: '0 0.13em', opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 28}px)` }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** The app's window on the stage (1500×844, under the caption). */
export const AppWindow: FC<{ enter?: number; x?: number; scale?: number; children: ReactNode }> = ({
  enter = 1,
  x = 0,
  scale = 1,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: 210 + x,
      top: 190,
      width: 1500,
      height: 844,
      opacity: Math.min(1, enter),
      transform: `scale(${scale * (0.9 + 0.1 * Math.min(1, enter))})`,
      transformOrigin: '50% 50%',
    }}
  >
    {children}
  </div>
);
