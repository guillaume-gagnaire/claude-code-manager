import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import UserMessage from './UserMessage.svelte';

const item = (queued: boolean) => ({ kind: 'user' as const, id: 'u1', text: 'Ajoute aussi les tests', images: 0, ts: 1, queued });

describe('UserMessage', () => {
  it('says a message sent during a turn was passed on to Claude, which takes it at its next step', () => {
    render(UserMessage, { item: item(true) });
    expect(screen.getByText('transmis pendant le tour')).toBeInTheDocument();
    expect(screen.queryByText(/en file/)).not.toBeInTheDocument();
  });

  it('shows nothing more for a message sent between turns', () => {
    render(UserMessage, { item: item(false) });
    expect(screen.queryByText('transmis pendant le tour')).not.toBeInTheDocument();
  });
});
