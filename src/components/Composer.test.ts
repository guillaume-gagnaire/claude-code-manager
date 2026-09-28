import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conversationOf } from '../lib/conversations.svelte';
import { app } from '../lib/state.svelte';
import { agent, fakeBackend, resetApp } from '../test/ipc';
import Composer from './Composer.svelte';

function setup(over: Parameters<typeof agent>[0] = {}, items: unknown[] = []) {
  const a = agent({ id: `c${Math.random()}`, ...over });
  resetApp({ agents: [a] });
  const backend = fakeBackend({
    get_conversation: () => items,
    file_suggestions: () => ['src/middleware/auth.ts', 'src/app.ts'],
    get_commands: () => [
      { name: 'compact', description: 'Compacte le contexte' },
      { name: 'commit', description: 'Crée un commit' },
    ],
  });
  render(Composer, { agent: app.agents[a.id] });
  return { a, backend, textarea: screen.getByRole('textbox') as HTMLTextAreaElement };
}

describe('Composer', () => {
  beforeEach(() => resetApp());

  it('offers the xhigh effort level in the effort menu and applies it to the agent', async () => {
    const { a, backend } = setup({ model: 'opus', effort: 'high' });
    await userEvent.click(screen.getByRole('button', { name: 'Effort : Élevé' }));
    expect(screen.getByRole('menuitemradio', { name: /^Élevé/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Très élevé/ }));
    expect(backend.called('set_agent_options').at(-1)?.args).toMatchObject({ id: a.id, effort: 'xhigh' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('picks the model from a menu rather than a row of buttons', async () => {
    const { a, backend } = setup({ model: 'sonnet' });
    expect(screen.queryByRole('button', { name: 'Opus' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Modèle : Sonnet' }));
    expect(screen.getByRole('menuitemradio', { name: /Sonnet/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Opus/ }));
    expect(backend.called('set_agent_options').at(-1)?.args).toMatchObject({ id: a.id, model: 'opus' });
    expect(screen.getByRole('button', { name: 'Modèle : Opus' })).toBeInTheDocument();
  });

  it('keeps a single menu open at a time', async () => {
    setup({ model: 'sonnet', mode: 'auto' });
    await userEvent.click(screen.getByRole('button', { name: /^Modèle/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Mode/ }));
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menuitemradio', { name: /Plan/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Mode/ }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes an open menu with Escape without interrupting Claude, even from the text field', async () => {
    const { backend, textarea } = setup({ status: 'running' });
    await userEvent.click(screen.getByRole('button', { name: /^Effort/ }));
    textarea.focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(backend.called('interrupt')).toHaveLength(0);
    await userEvent.keyboard('{Escape}');
    expect(backend.called('interrupt')).toHaveLength(1);
  });

  it('gives the focus back to the text field after a pick', async () => {
    const { textarea } = setup({ model: 'sonnet' });
    await userEvent.click(screen.getByRole('button', { name: /^Modèle/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Opus/ }));
    expect(document.activeElement).toBe(textarea);
  });

  it('closes an open menu when a dialog opens over it', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /^Mode/ }));
    app.modal = { kind: 'settings' };
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('keeps what is being typed when the agent is updated by the backend', async () => {
    const a = agent({ id: `k${Math.random()}`, status: 'running' });
    resetApp({ agents: [a] });
    fakeBackend({ get_conversation: () => [] });
    const { rerender } = render(Composer, { agent: a });
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(textarea, 'Pense aussi aux tests');
    // Every tool call / token update delivers a new agent object to the composer.
    await rerender({ agent: { ...a, tokens: 1234, status: 'waiting' } });
    expect(textarea.value).toBe('Pense aussi aux tests');
  });

  it('restores the draft of an agent after switching away and back', async () => {
    const a = agent({ id: `d${Math.random()}` });
    const b = agent({ id: `e${Math.random()}` });
    resetApp({ agents: [a, b] });
    fakeBackend({ get_conversation: () => [] });
    const first = render(Composer, { agent: app.agents[a.id] });
    await userEvent.type(screen.getByRole('textbox'), 'brouillon de A');
    first.unmount(); // App re-creates the composer for each agent ({#key})
    const second = render(Composer, { agent: app.agents[b.id] });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
    second.unmount();
    render(Composer, { agent: app.agents[a.id] });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('brouillon de A');
  });

  it('ignores Escape while a dialog is open', async () => {
    const { backend, textarea } = setup({ status: 'running' });
    app.modal = { kind: 'settings' };
    textarea.focus();
    await fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(backend.called('interrupt')).toHaveLength(0);
  });

  it('sends the typed message on Enter and clears the field', async () => {
    const { a, backend, textarea } = setup();
    await userEvent.type(textarea, 'Ajoute des tests{Enter}');
    await waitFor(() => expect(backend.called('send_message')).toHaveLength(1));
    expect(backend.called('send_message')[0].args).toMatchObject({ id: a.id, text: 'Ajoute des tests', images: [] });
    expect(textarea.value).toBe('');
  });

  it('keeps Shift+Enter as a newline', async () => {
    const { backend, textarea } = setup();
    await userEvent.type(textarea, 'ligne 1{Shift>}{Enter}{/Shift}ligne 2');
    expect(textarea.value).toBe('ligne 1\nligne 2');
    expect(backend.called('send_message')).toHaveLength(0);
  });

  it('completes @file mentions from the backend suggestions', async () => {
    const { a, backend, textarea } = setup();
    await userEvent.type(textarea, 'Relis @auth');
    await screen.findByText('auth.ts');
    expect(backend.called('file_suggestions').at(-1)?.args).toEqual({ id: a.id, query: 'auth' });
    await userEvent.keyboard('{Enter}');
    expect(textarea.value).toBe('Relis @src/middleware/auth.ts ');
    expect(backend.called('send_message')).toHaveLength(0);
  });

  it('completes slash commands only at the start of the message', async () => {
    const { textarea } = setup();
    await userEvent.type(textarea, '/com');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '/compact Compacte le contexte',
      '/commit Crée un commit',
    ]);
    await userEvent.keyboard('{ArrowDown}{Tab}');
    expect(textarea.value).toBe('/commit ');
  });

  it('answers a pending question with the free text instead of sending a message', async () => {
    const q = {
      kind: 'question',
      id: 'req-1',
      toolUseId: 't1',
      questions: [{ question: 'Quelle base ?', options: [] }],
      answers: null,
      ts: 1,
    };
    const { a, backend, textarea } = setup({ status: 'waiting', pending: ['req-1'] }, [q]);
    await waitFor(() => expect(conversationOf(a.id).loaded).toBe(true));
    await userEvent.type(textarea, 'PostgreSQL{Enter}');
    await waitFor(() => expect(backend.called('answer_question')).toHaveLength(1));
    expect(backend.called('answer_question')[0].args).toEqual({ id: a.id, requestId: 'req-1', answers: { 'Quelle base ?': 'PostgreSQL' } });
    expect(backend.called('send_message')).toHaveLength(0);
  });

  it('keeps attached images when the text answers a pending question', async () => {
    const q = {
      kind: 'question',
      id: 'req-1',
      toolUseId: 't1',
      questions: [{ question: 'Quelle base ?', options: [] }],
      answers: null,
      ts: 1,
    };
    const { a, textarea } = setup({ status: 'waiting', pending: ['req-1'] }, [q]);
    await waitFor(() => expect(conversationOf(a.id).loaded).toBe(true));
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'capture.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Joindre une image', { selector: 'input' }), png);
    await screen.findByAltText('capture.png');
    await userEvent.type(textarea, 'PostgreSQL{Enter}');
    await waitFor(() => expect(app.toasts.at(-1)?.text).toMatch(/images/));
    expect(screen.getByAltText('capture.png')).toBeInTheDocument();
  });

  it('denies a pending permission with the typed explanation', async () => {
    const p = {
      kind: 'permission',
      id: 'req-2',
      toolUseId: 't2',
      toolName: 'Bash',
      input: { command: 'rm -rf dist' },
      canAlways: false,
      defaultNo: false,
      decision: null,
      ts: 1,
    };
    const { a, backend, textarea } = setup({ status: 'waiting', pending: ['req-2'] }, [p]);
    await waitFor(() => expect(conversationOf(a.id).loaded).toBe(true));
    await userEvent.type(textarea, 'Utilise plutôt npm run clean{Enter}');
    await waitFor(() => expect(backend.called('answer_permission')).toHaveLength(1));
    expect(backend.called('answer_permission')[0].args).toEqual({
      id: a.id,
      requestId: 'req-2',
      decision: 'deny',
      message: 'Utilise plutôt npm run clean',
    });
  });

  it('interrupts a running agent on Escape', async () => {
    const { a, backend, textarea } = setup({ status: 'running' });
    textarea.focus();
    await fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(backend.called('interrupt')).toEqual([{ cmd: 'interrupt', args: { id: a.id } }]);
  });

  it('switches the permission mode from the mode menu', async () => {
    const { a, backend } = setup({ mode: 'auto' });
    await userEvent.click(screen.getByRole('button', { name: 'Mode : Auto' }));
    expect(screen.getByRole('menuitemradio', { name: /Auto/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Plan/ }));
    expect(backend.called('set_agent_options').at(-1)?.args).toMatchObject({ id: a.id, mode: 'plan' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows the ask-every-time mode Claude falls back to after a plan', async () => {
    const { a, backend } = setup({ mode: 'default' });
    await userEvent.click(screen.getByRole('button', { name: 'Mode : Demander' }));
    expect(screen.getByRole('menuitemradio', { name: /Demander/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Auto/ }));
    expect(backend.called('set_agent_options').at(-1)?.args).toMatchObject({ id: a.id, mode: 'auto' });
  });

  it('disables the effort and the auto mode for Haiku', async () => {
    setup({ model: 'haiku', mode: 'acceptEdits' });
    expect(screen.getByRole('button', { name: /^Effort/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /^Modèle/ }));
    expect(screen.getByRole('menuitemradio', { name: /Opus/ })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /^Mode/ }));
    expect(screen.getByRole('menuitemradio', { name: /Auto/ })).toBeDisabled();
    expect(screen.getByRole('menuitemradio', { name: /Plan/ })).toBeEnabled();
  });
});

describe('Composer in a narrow column (split layout)', () => {
  const Real = globalThis.ResizeObserver;
  beforeEach(() => {
    resetApp();
    // The composer reports a 400 px width, as in half of a small window.
    globalThis.ResizeObserver = class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: { width: 400 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = Real;
  });

  it('drops the menu captions to keep the send button on the same line', () => {
    setup({ model: 'sonnet', effort: 'medium', mode: 'auto' });
    const model = screen.getByRole('button', { name: 'Modèle : Sonnet' });
    expect(model).toHaveTextContent('Sonnet');
    expect(model).not.toHaveTextContent('Modèle');
    expect(screen.getByRole('button', { name: 'Mode : Auto' })).not.toHaveTextContent('Mode');
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });

  it('shrinks the stop button to its icon while Claude works', () => {
    setup({ status: 'running' });
    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop).toHaveTextContent('■');
    expect(stop).not.toHaveTextContent('Stop');
    expect(screen.getByRole('button', { name: 'Mettre en file' })).toBeInTheDocument();
  });
});
