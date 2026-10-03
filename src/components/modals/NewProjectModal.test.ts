import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../lib/state.svelte';
import { fakeBackend, resetApp } from '../../test/ipc';
import NewProjectModal from './NewProjectModal.svelte';

describe('NewProjectModal', () => {
  beforeEach(() => {
    resetApp();
    app.modal = { kind: 'newProject' };
  });

  it('names the first agent’s models with the version Claude Code runs for them', () => {
    fakeBackend();
    app.models = [{ value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001' }];
    render(NewProjectModal);
    expect(screen.getByRole('button', { name: 'Haiku 4.5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sonnet' })).toBeInTheDocument();
  });
});
