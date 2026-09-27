// xterm.js instances live outside of components so switching views keeps their scrollback.

import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { openUrl } from '@tauri-apps/plugin-opener';
import { api } from './ipc';
import { isAppShortcut } from './shortcuts';
import type { TermInfo } from './types';

export interface XTerm {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  host: HTMLDivElement;
}

const xterms = new Map<string, XTerm>();
let parking: HTMLDivElement | null = null;

function parkingLot(): HTMLDivElement {
  if (!parking) {
    parking = document.createElement('div');
    parking.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:500px;visibility:hidden;';
    document.body.appendChild(parking);
  }
  return parking;
}

/** Resolves any CSS color (oklch, color-mix, var()) to #rrggbb through a 1px canvas. */
export function resolveColor(css: string): string {
  const probe = document.createElement('div');
  probe.style.color = css;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function terminalTheme(): ITheme {
  return {
    background: resolveColor('var(--term)'),
    foreground: '#ede7df',
    cursor: resolveColor('var(--accent)'),
    cursorAccent: '#1b1512',
    selectionBackground: resolveColor('color-mix(in oklch, var(--accent) 35%, transparent)') + '99',
    black: '#2a2724',
    red: '#e2735f',
    green: '#7cc48d',
    yellow: '#e9c46a',
    blue: '#6fa8dc',
    magenta: '#c792ea',
    cyan: '#6cc5c1',
    white: '#d8d0c4',
    brightBlack: '#6f685f',
    brightRed: '#f08c78',
    brightGreen: '#9bd8a9',
    brightYellow: '#f4d68a',
    brightBlue: '#8fbfea',
    brightMagenta: '#d9aef2',
    brightCyan: '#8ad8d4',
    brightWhite: '#f5efe7',
  };
}

export async function openTerminal(projectId: string, shell: string, name: string): Promise<TermInfo> {
  const term = new Terminal({
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: 12.5,
    lineHeight: 1.2,
    cursorBlink: true,
    allowProposedApi: true,
    scrollback: 10000,
    theme: terminalTheme(),
  });
  const host = document.createElement('div');
  host.style.cssText = 'width:100%;height:100%;';
  parkingLot().appendChild(host);
  const fit = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fit);
  term.loadAddon(search);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
  term.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri).catch(() => {})));
  term.open(host);
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // Falls back to the DOM renderer.
  }
  fit.fit();

  let info: TermInfo;
  try {
    info = await api.termSpawn({ projectId, shell, name, cols: term.cols, rows: term.rows }, (buf) => term.write(new Uint8Array(buf)));
  } catch (e) {
    // Nothing to attach to: free the xterm instance, its WebGL context and its host.
    term.dispose();
    host.remove();
    throw e;
  }
  term.onData((d) => api.termWrite(info.id, d).catch(() => {}));
  term.onResize(({ cols, rows }) => api.termResize(info.id, cols, rows).catch(() => {}));
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    // Navigation shortcuts go to the app (the event keeps bubbling to its window handler).
    if (isAppShortcut(e)) return false;
    // Windows Terminal conventions: Ctrl+C copies when there is a selection, Ctrl+V pastes.
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
      return false;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'v') return false;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
      if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection());
      return false;
    }
    return true;
  });
  xterms.set(info.id, { term, fit, search, host });
  return info;
}

export function getXTerm(id: string): XTerm | undefined {
  return xterms.get(id);
}

/** Moves the terminal's DOM into `container` (or back to the parking lot). */
export function mountTerminal(id: string, container: HTMLElement | null) {
  const x = xterms.get(id);
  if (!x) return;
  (container ?? parkingLot()).appendChild(x.host);
  if (container) {
    x.term.options.theme = terminalTheme();
    requestAnimationFrame(() => {
      try {
        x.fit.fit();
      } catch {
        /* not measurable yet */
      }
      x.term.focus();
    });
  }
}

export function disposeTerminal(id: string) {
  const x = xterms.get(id);
  if (!x) return;
  x.term.dispose();
  x.host.remove();
  xterms.delete(id);
  api.termKill(id).catch(() => {});
}
