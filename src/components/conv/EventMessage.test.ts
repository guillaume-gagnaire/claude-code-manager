import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import EventMessage from './EventMessage.svelte';

const NOTIFICATION =
  '<task-notification>\n<task-id>b1</task-id>\n<status>completed</status>\n<summary>Background command "npm test" completed (exit code 0)</summary>\n</task-notification>';
const REPORT =
  '<agent-message from="a42">\n[Subagent hand-back] … The report follows:\n  **Cause trouvée** dans `Composer.svelte`.\n</agent-message>';

describe('EventMessage', () => {
  it('shows a background task that ended as a discreet line, not as a message of the user', () => {
    const { container } = render(EventMessage, { source: 'task', text: NOTIFICATION });
    expect(screen.getByText('Tâche de fond terminée')).toBeInTheDocument();
    expect(screen.getByText('Background command "npm test" completed (exit code 0)')).toBeInTheDocument();
    expect(container.querySelector('.bubble')).toBeNull();
    expect(container).not.toHaveTextContent('<task-notification>');
  });

  it('says when a background task failed', () => {
    render(EventMessage, { source: 'task', text: NOTIFICATION.replace('completed</status>', 'failed</status>') });
    expect(screen.getByText('Tâche de fond en échec')).toBeInTheDocument();
  });

  it('shows the report of a subagent under its task, rendered', () => {
    const { container } = render(EventMessage, { source: 'agent', text: REPORT, label: 'Investigate PDF upload bug' });
    expect(screen.getByText('Rapport du sous-agent « Investigate PDF upload bug »')).toBeInTheDocument();
    expect(screen.getByText('Cause trouvée').tagName).toBe('STRONG');
    expect(container).not.toHaveTextContent('Subagent hand-back');
    expect(container.querySelector('.bubble')).toBeNull();
  });

  it('names an unknown subagent plainly', () => {
    render(EventMessage, { source: 'agent', text: REPORT });
    expect(screen.getByText('Message d’un sous-agent')).toBeInTheDocument();
  });
});
