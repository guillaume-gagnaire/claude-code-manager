import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conversationOf } from '../lib/conversations.svelte';
import { app } from '../lib/state.svelte';
import type { Agent } from '../lib/types';
import { agent, fakeBackend, project, resetApp } from '../test/ipc';
import Conversation from './Conversation.svelte';

// jsdom has no layout: give scrollable elements a fixed geometry.
const geometry = { scrollHeight: 2000, clientHeight: 500 };
const saved: PropertyDescriptor[] = [];

beforeEach(() => {
  for (const [k, v] of Object.entries(geometry)) {
    saved.push(Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)!);
    Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v });
  }
});

afterEach(() => {
  for (const k of Object.keys(geometry)) {
    const d = saved.shift();
    if (d) Object.defineProperty(HTMLElement.prototype, k, d);
  }
});

function setup(over: Partial<Agent> = {}, items: unknown[] = []) {
  const a = agent({ id: `v${Math.random()}`, status: 'running', ...over });
  resetApp({ projects: [project()], agents: [a] });
  fakeBackend({ get_conversation: () => items });
  const r = render(Conversation, { agent: a, project: project() });
  return { a, ...r, scroller: r.container.querySelector('.scroll') as HTMLElement };
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

describe('Conversation', () => {
  it('opens scrolled to the latest message', async () => {
    const { scroller } = setup({}, [{ kind: 'user', id: 'u1', text: 'Salut', images: 0, ts: 1, queued: false }]);
    await frame();
    expect(scroller.scrollTop).toBe(2000);
  });

  it('does not yank the reader back to the bottom when the agent is updated', async () => {
    const { a, scroller, rerender } = setup();
    await frame();
    scroller.scrollTop = 100;
    scroller.dispatchEvent(new Event('scroll'));
    await rerender({ agent: { ...a, tokens: 999, contextTokens: 12 }, project: project() });
    await frame();
    expect(scroller.scrollTop).toBe(100);
  });

  describe('near the bottom', () => {
    // Resizes of the content (messages rendered as they scroll into view, streamed text).
    let resized: ((entries: unknown[]) => void)[] = [];
    const Real = globalThis.ResizeObserver;
    beforeEach(() => {
      resized = [];
      globalThis.ResizeObserver = class {
        constructor(cb: (entries: unknown[]) => void) {
          resized.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    });
    afterEach(() => {
      globalThis.ResizeObserver = Real;
    });
    // The reader scrolls with the wheel (or keys, or by dragging); the layout moves the view alone.
    const readerScrollsTo = (el: HTMLElement, top: number) => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: top - el.scrollTop }));
      layoutMovesTo(el, top);
    };
    const layoutMovesTo = (el: HTMLElement, top: number) => {
      el.scrollTop = top;
      el.dispatchEvent(new Event('scroll'));
    };
    const grows = (scroller: HTMLElement) => {
      let height = 2000;
      Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => height });
      return (h: number) => (height = h);
    };

    it('lets the reader scroll up a little without pulling them back down', async () => {
      const { scroller } = setup();
      await frame();
      // At the bottom (2000), the reader scrolls up by 10 px, still within the old 80 px magnet.
      readerScrollsTo(scroller, 1490);
      resized.forEach((cb) => cb([]));
      expect(scroller.scrollTop).toBe(1490);
    });

    it('leaves the bottom when the reader drags the scrollbar up', async () => {
      const { scroller } = setup();
      await frame();
      scroller.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      layoutMovesTo(scroller, 1300);
      window.dispatchEvent(new Event('pointerup'));
      resized.forEach((cb) => cb([]));
      expect(scroller.scrollTop).toBe(1300);
    });

    it('keeps following when the content shrinks under a view at the bottom', async () => {
      const { scroller } = setup();
      await frame();
      const height = grows(scroller);
      // The end of a turn replaces taller content (the running indicator): the browser pulls the
      // view up with it, to the new bottom. The reader did not scroll.
      height(1800);
      layoutMovesTo(scroller, 1300);
      height(2400);
      resized.forEach((cb) => cb([]));
      expect(scroller.scrollTop).toBe(2400);
    });

    it('keeps following when the message field shrinks back as the message is sent', async () => {
      const { scroller } = setup();
      await frame();
      const height = grows(scroller);
      // The taller view pulls it up, and the message is in before the scroll event is.
      height(2300);
      layoutMovesTo(scroller, 1200);
      resized.forEach((cb) => cb([]));
      expect(scroller.scrollTop).toBe(2300);
    });

    it('follows the conversation again once the reader is back at the bottom', async () => {
      const { scroller } = setup();
      await frame();
      readerScrollsTo(scroller, 1400);
      readerScrollsTo(scroller, 1495);
      resized.forEach((cb) => cb([]));
      expect(scroller.scrollTop).toBe(2000);
    });
  });

  it('says so when the conversation cannot be loaded', async () => {
    const a = agent({ id: `w${Math.random()}` });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend({
      get_conversation: () => {
        throw new Error('journal illisible');
      },
    });
    render(Conversation, { agent: a, project: project() });
    await waitFor(() => expect(conversationOf(a.id).loaded).toBe(true));
    expect(await screen.findByText(/journal illisible/)).toBeInTheDocument();
    expect(screen.queryByText('Agent prêt')).not.toBeInTheDocument();
    expect(app.agents[a.id]).toBeDefined();
  });

  it('ends a finished task with the files its last turn edited', async () => {
    const edit = (id: string, file: string, add: number) => ({
      kind: 'tool',
      id,
      name: 'Edit',
      input: { file_path: `C:\\code\\demo-api\\${file}` },
      status: 'ok',
      result: { isError: false, add, del: 1 },
      ts: 1,
    });
    const end = (id: string) => ({
      kind: 'turn',
      id,
      ts: 1,
      durationMs: 1,
      cost: 0,
      tokens: 0,
      isError: false,
      interrupted: false,
      error: null,
    });
    setup({ status: 'done' }, [edit('e1', 'old.ts', 1), end('r1'), edit('e2', 'src\\auth.ts', 5), end('r2')]);
    const recap = await screen.findByRole('list', { name: 'Fichiers modifiés' });
    expect(recap).toHaveTextContent('src/auth.ts+5−1');
    expect(recap).not.toHaveTextContent('old.ts');
  });
});

describe('Conversation header', () => {
  it('switches between the classic and the split layout', async () => {
    setup();
    const split = screen.getByRole('button', { name: 'Conversation et fichiers côte à côte' });
    const classic = screen.getByRole('button', { name: 'Disposition classique' });
    expect(classic).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(split);
    expect(app.split).toBe(true);
    expect(split).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(classic);
    expect(app.split).toBe(false);
  });

  it('keeps the files counter but no panel toggle in the split layout, where the files are always shown', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Fichiers/ }));
    expect(app.filesOpen).toBe(true);
    app.toggleLayout();
    await frame();
    expect(screen.queryByRole('button', { name: /Fichiers/ })).not.toBeInTheDocument();
    expect(screen.getByText('Fichiers')).toBeInTheDocument();
  });
});

describe('Conversation header usage', () => {
  it('counts the running turn in the tokens and the estimated cost', () => {
    setup({ tokens: 2000, cost: 0.4, liveTokens: 1000, liveCost: 0.2 });
    expect(screen.getByText('3,0 k')).toBeInTheDocument();
    expect(screen.getByText('≈ 0,60 $')).toBeInTheDocument();
  });
});
