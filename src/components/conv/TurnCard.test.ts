import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { COMMIT_AGENT_PROMPT } from '../../lib/agent-actions';
import { app } from '../../lib/state.svelte';
import type { TurnItem } from '../../lib/types';
import { agent, fakeBackend, resetApp } from '../../test/ipc';
import TurnCard from './TurnCard.svelte';

const turn = (over: Partial<TurnItem> = {}): TurnItem => ({
  kind: 'turn',
  id: 'r1',
  ts: 1,
  durationMs: 151_000,
  cost: 2.84,
  tokens: 182_400,
  isError: false,
  interrupted: false,
  error: null,
  ...over,
});

describe('TurnCard', () => {
  beforeEach(() => resetApp());

  it('shows the "task done" card with actions for the last turn of a finished agent', async () => {
    const backend = fakeBackend();
    const a = agent({ status: 'done' });
    app.git = { p1: { isRepo: true, branch: 'main', modified: 2, added: 0, deleted: 0, total: 2, agents: { a1: 2 } } };
    render(TurnCard, { item: turn(), agent: a, last: true });
    expect(screen.getByText('Tâche terminée')).toBeInTheDocument();
    expect(screen.getByText('2m 31s')).toBeInTheDocument();
    expect(screen.getByText('2 fichiers modifiés')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Commit…' }));
    expect(backend.called('send_message')[0].args).toMatchObject({ id: 'a1', text: COMMIT_AGENT_PROMPT });
    await userEvent.click(screen.getByRole('button', { name: 'Revoir les fichiers' }));
    expect(app.filesOpen).toBe(true);
  });

  it('offers a merge for worktree agents', () => {
    const a = agent({ status: 'done', worktree: { path: 'C:\\code\\.claude\\worktrees\\x', branch: 'ccm/x', baseBranch: 'main' } });
    render(TurnCard, { item: turn(), agent: a, last: true });
    expect(screen.getByRole('button', { name: 'Merger dans main…' })).toBeInTheDocument();
  });

  it('is a discreet separator for earlier turns', () => {
    render(TurnCard, { item: turn(), agent: agent({ status: 'done' }), last: false });
    expect(screen.queryByText('Tâche terminée')).not.toBeInTheDocument();
    expect(screen.getByText(/182,4 k tokens/)).toBeInTheDocument();
  });

  it('shows the error of a failed turn', () => {
    render(TurnCard, { item: turn({ isError: true, error: 'Rate limit reached' }), agent: agent({ status: 'error' }), last: true });
    expect(screen.getByText("Le tour s'est terminé en erreur")).toBeInTheDocument();
    expect(screen.getByText('Rate limit reached')).toBeInTheDocument();
  });

  it('marks an interrupted turn', () => {
    render(TurnCard, { item: turn({ interrupted: true }), agent: agent({ status: 'done' }), last: true });
    expect(screen.queryByText('Tâche terminée')).not.toBeInTheDocument();
    expect(screen.getByText(/Interrompu/)).toBeInTheDocument();
  });
});
