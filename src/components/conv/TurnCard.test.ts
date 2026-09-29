import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TurnItem } from '../../lib/types';
import { agent, resetApp } from '../../test/ipc';
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

  it('ends the last turn of a finished agent with the recap of the files it edited, and nothing to click', () => {
    const a = agent({ status: 'done', worktree: { path: 'C:\\code\\.claude\\worktrees\\x', branch: 'ccm/x', baseBranch: 'main' } });
    const edits = [
      { path: 'src/auth.ts', add: 12, del: 3 },
      { path: 'notes.md', add: 4, del: 0 },
    ];
    render(TurnCard, { item: turn(), agent: a, last: true, edits });
    expect(screen.getByText('Tâche terminée')).toBeInTheDocument();
    expect(screen.getByText('2m 31s')).toBeInTheDocument();
    expect(screen.getByText('2 fichiers modifiés')).toBeInTheDocument();
    const recap = screen.getAllByRole('listitem');
    expect(recap.map((li) => li.textContent)).toEqual(['src/auth.ts+12−3', 'notes.md+4−0']);
    // No commit, merge nor review to propose.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says when the turn edited no file', () => {
    render(TurnCard, { item: turn(), agent: agent({ status: 'done' }), last: true });
    expect(screen.getByText('0 fichier modifié')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
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
