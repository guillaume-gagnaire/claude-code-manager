import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { QuestionItem } from '../../lib/types';
import { fakeBackend, resetApp } from '../../test/ipc';
import QuestionCard from './QuestionCard.svelte';

const item = (over: Partial<QuestionItem> = {}): QuestionItem => ({
  kind: 'question',
  id: 'req-1',
  toolUseId: 't1',
  ts: 1,
  answers: null,
  questions: [
    {
      question: 'Quelle base de données ?',
      header: 'Base',
      multiSelect: false,
      options: [
        { label: 'PostgreSQL', description: 'Relationnelle' },
        { label: 'SQLite', description: 'Embarquée' },
      ],
    },
  ],
  ...over,
});

describe('QuestionCard', () => {
  beforeEach(() => resetApp());

  it('answers a single question with one click', async () => {
    const backend = fakeBackend();
    render(QuestionCard, { item: item(), agentId: 'a1', pending: true });
    expect(screen.getByText('Claude attend ta réponse')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'SQLite' }));
    expect(backend.called('answer_question')).toEqual([
      { cmd: 'answer_question', args: { id: 'a1', requestId: 'req-1', answers: { 'Quelle base de données ?': 'SQLite' } } },
    ]);
  });

  it('collects several answers before validating, multi-select joined with commas', async () => {
    const backend = fakeBackend();
    const multi = item({
      questions: [
        { question: 'Base ?', header: 'Base', options: [{ label: 'PG' }, { label: 'SQLite' }] },
        { question: 'Outils ?', header: 'Outils', multiSelect: true, options: [{ label: 'ESLint' }, { label: 'Prettier' }, { label: 'Vitest' }] },
      ],
    });
    render(QuestionCard, { item: multi, agentId: 'a1', pending: true });
    const validate = screen.getByRole('button', { name: 'Valider' });
    expect(validate).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'PG' }));
    await userEvent.click(screen.getByRole('button', { name: /ESLint/ }));
    await userEvent.click(screen.getByRole('button', { name: /Vitest/ }));
    await userEvent.click(screen.getByRole('button', { name: /ESLint/ })); // toggled off again
    await userEvent.click(screen.getByRole('button', { name: /Prettier/ }));
    expect(backend.called('answer_question')).toHaveLength(0);
    await userEvent.click(validate);
    expect(backend.called('answer_question')[0].args.answers).toEqual({ 'Base ?': 'PG', 'Outils ?': 'Vitest, Prettier' });
  });

  it('shows the recorded answer once answered', () => {
    render(QuestionCard, { item: item({ answers: { 'Quelle base de données ?': 'PostgreSQL' } }), agentId: 'a1', pending: false });
    expect(screen.getByText('→ PostgreSQL')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'SQLite' })).not.toBeInTheDocument();
  });

  it('says when the question was never answered', () => {
    render(QuestionCard, { item: item(), agentId: 'a1', pending: false });
    expect(screen.getByText('Question restée sans réponse')).toBeInTheDocument();
  });
});
