// Tints the UI surfaces with the active project's color, as the design's applyTheme() does.

const DEFAULT = 'oklch(0.72 0.12 48)';

export const PROJECT_COLORS = [48, 300, 200, 150, 250, 0, 25, 70, 110, 175, 225, 275, 325]
  .map((h) => `oklch(0.72 0.12 ${h})`)
  .concat(['oklch(0.8 0.02 60)']);

let applied = '';

export function applyTheme(color: string | null) {
  const c = color ?? DEFAULT;
  const tint = color !== null;
  const key = c + (tint ? ':t' : ':n');
  if (applied === key) return;
  applied = key;
  const st = document.documentElement.style;
  const mix = (pct: number, base: string) => (tint ? `color-mix(in oklch, ${c} ${pct}%, ${base})` : base);
  st.setProperty('--accent', c);
  st.setProperty('--accent-soft', `color-mix(in oklch, ${c} 38%, transparent)`);
  st.setProperty('--bg', mix(7, '#191715'));
  st.setProperty('--panel', mix(11, '#1e1c1a'));
  st.setProperty('--elev', mix(14, '#272422'));
  st.setProperty('--elev2', mix(18, '#302d2a'));
  st.setProperty('--user', mix(22, '#2c2926'));
  st.setProperty('--line', mix(22, 'rgba(255,236,214,.08)'));
  st.setProperty('--line2', mix(35, 'rgba(255,236,214,.15)'));
  st.setProperty('--term', mix(5, '#121110'));
}

/** Resolved background color for canvases that cannot read CSS variables (xterm WebGL). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
