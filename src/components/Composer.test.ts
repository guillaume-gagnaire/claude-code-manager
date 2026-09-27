import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('offers the xhigh effort level and applies it to the agent', async () => {
    const { a, backend } = setup({ model: 'opus', effort: 'high' });
    await userEvent.click(screen.getByRole('button', { name: 'Très élevé' }));
    expect(backend.called('set_agent_options').at(-1)?.args).toMatchObject({ id: a.id, effort: 'xhigh' });
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
    expect(options.map((o) => o.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['/compact Compacte le contexte', '/commit Crée un commit']);
    await userEvent.keyboard('{ArrowDown}{Tab}');
    expect(textarea.value).toBe('/commit ');
  });

  it('answers a pending question with the free text instead of sending a message', async () => {
    const q = { kind: 'question', id: 'req-1', toolUseId: 't1', questions: [{ question: 'Quelle base ?', options: [] }], answers: null, ts: 1 };
    const { a, backend, textarea } = setup({ status: 'waiting', pending: ['req-1'] }, [q]);
    await waitFor(() => expect(conversationOf(a.id).loaded).toBe(true));
    await userEvent.type(textarea, 'PostgreSQL{Enter}');
    await waitFor(() => expect(backend.called('answer_question')).toHaveLength(1));
    expect(backend.called('answer_question')[0].args).toEqual({ id: a.id, requestId: 'req-1', answers: { 'Quelle base ?': 'PostgreSQL' } });
    expect(backend.called('send_message')).toHaveLength(0);
  });

  it('denies a pending permission with the typed explanation', async () => {
    const p = { kind: 'permission', id: 'req-2', toolUseId: 't2', toolName: 'Bash', input: { command: 'rm -rf dist' }, canAlways: false, defaultNo: false, decision: null, ts: 1 };
    const { a, backend, textarea } = setup({ status: 'waiting', pending: ['req-2'] }, [p]);
    await waitFor(() => expect(conversationOf(a.id).loaded).toBe(true));
    await userEvent.type(textarea, 'Utilise plutôt npm run clean{Enter}');
    await waitFor(() => expect(backend.called('answer_permission')).toHaveLength(1));
    expect(backend.called('answer_permission')[0].args).toEqual({ id: a.id, requestId: 'req-2', decision: 'deny', message: 'Utilise plutôt npm run clean' });
  });

  it('interrupts a running agent on Escape', async () => {
    const { a, backend, textarea } = setup({ status: 'running' });
    textarea.focus();
    await fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(backend.called('interrupt')).toEqual([{ cmd: 'interrupt', args: { id: a.id } }]);
  });

  it('switches the permission mode from the mode menu', async () => {
    const { a, backend } = setup({ mode: 'auto' });
    await userEvent.click(screen.getByRole('button', { name: /Mode\s*Auto/ }));
    expect(screen.getByRole('menuitemradio', { name: /Auto/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Plan/ }));
    expect(backend.called('set_agent_options').at(-1)?.args).toMatchObject({ id: a.id, mode: 'plan' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows the ask-every-time mode Claude falls back to after a plan', async () => {
    const { a, backend } = setup({ mode: 'default' });
    await userEvent.click(screen.getByRole('button', { name: /Mode\s*Demander/ }));
    expect(screen.getByRole('menuitemradio', { name: /Demander/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Auto/ }));
    expect(backend.called('set_agent_options').at(-1)?.args).toMatchObject({ id: a.id, mode: 'auto' });
  });

  it('disables effort levels and auto mode for Haiku', async () => {
    setup({ model: 'haiku', mode: 'acceptEdits' });
    expect(screen.getByRole('button', { name: 'Élevé' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Opus' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /Mode/ }));
    expect(screen.getByRole('menuitemradio', { name: /Auto/ })).toBeDisabled();
    expect(screen.getByRole('menuitemradio', { name: /Plan/ })).toBeEnabled();
  });
});
