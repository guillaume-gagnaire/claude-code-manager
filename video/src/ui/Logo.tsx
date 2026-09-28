import type { FC } from 'react';
import { C } from '../theme';

/** The app logo. `stack` reveals the back, middle and front windows, `spark` the spark (0 to 1). */
export const Logo: FC<{ size: number; stack?: [number, number, number]; spark?: number; spin?: number }> = ({
  size,
  stack = [1, 1, 1],
  spark = 1,
  spin = 0,
}) => {
  const [back, mid, front] = stack;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
      <rect
        x="26"
        y="8"
        width="66"
        height="66"
        rx="14"
        fill="none"
        stroke={C.spark}
        strokeOpacity={0.35 * Math.min(1, back)}
        strokeWidth="5"
        transform={`translate(${(1 - back) * -18} ${(1 - back) * 18})`}
      />
      <rect
        x="17"
        y="17"
        width="66"
        height="66"
        rx="14"
        fill="none"
        stroke={C.spark}
        strokeOpacity={0.6 * Math.min(1, mid)}
        strokeWidth="5"
        transform={`translate(${(1 - mid) * -9} ${(1 - mid) * 9})`}
      />
      <rect
        x="8"
        y="26"
        width="66"
        height="66"
        rx="14"
        fill="#1b1512"
        stroke={C.spark}
        strokeWidth="5"
        opacity={Math.min(1, front)}
        transform={`translate(41 59) scale(${0.6 + 0.4 * front}) translate(-41 -59)`}
      />
      <g
        transform={`translate(41 59) rotate(${(1 - spark) * -120 + spin}) scale(${Math.max(0, spark)})`}
        stroke={C.spark}
        strokeLinecap="round"
      >
        <path d="M0 -20V20M-20 0H20" strokeWidth="6.2" />
        <path d="M-11.8 -11.8L11.8 11.8M-11.8 11.8L11.8 -11.8" strokeWidth="5" />
      </g>
    </svg>
  );
};
