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
