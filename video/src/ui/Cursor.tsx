import type { FC } from 'react';
import { soft } from '../theme';

/** A mouse pointer at (x, y); `click` (0 to 1) draws its ripple. */
export const Cursor: FC<{ x: number; y: number; click?: number }> = ({ x, y, click = 0 }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 10 }}>
    {click > 0 && click < 1 ? (
      <span
        style={{
          position: 'absolute',
          left: -26 * click,
          top: -26 * click,
          width: 52 * click,
          height: 52 * click,
          borderRadius: '50%',
          border: `3px solid ${soft('#ffffff', (1 - click) * 90)}`,
        }}
      />
    ) : null}
    <svg
      width="26"
      height="32"
      viewBox="0 0 26 32"
      style={{ position: 'absolute', left: -3, top: -2, filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))' }}
    >
      <path d="M3 2 L3 26 L9 20 L13 30 L17 28 L13 18 L22 18 Z" fill="#ffffff" stroke="#1b1512" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  </div>
);
