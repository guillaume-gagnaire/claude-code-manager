import type { Agent } from './types';

/**
 * Starts the process of the agent the user just selected, so the first reply is fast.
 * Only a change of selection warms: an idle process stopped by the backend stays stopped
 * until the next action on the agent (message, answer…), which resumes the session.
 */
export function createWarmer(warm: (id: string) => void) {
  let last: string | null = null;
  return (a: Agent | null) => {
    const id = a?.id ?? null;
    if (id === last) return;
    last = id;
    if (a && !a.alive && !a.archived && a.status !== 'error') warm(a.id);
  };
}
