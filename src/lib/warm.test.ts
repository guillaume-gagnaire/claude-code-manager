import { describe, expect, it } from 'vitest';
import { agent } from '../test/ipc';
import { createWarmer } from './warm';

describe('createWarmer', () => {
  function setup() {
    const warmed: string[] = [];
    return { warmed, onSelect: createWarmer((id) => warmed.push(id)) };
  }

  it('starts the process of a newly selected agent that is not running', () => {
    const { warmed, onSelect } = setup();
    onSelect(agent({ id: 'a1', alive: false }));
    expect(warmed).toEqual(['a1']);
  });

  it('does not restart the selected agent when its idle process stops', () => {
    const { warmed, onSelect } = setup();
    onSelect(agent({ id: 'a1', alive: true }));
    onSelect(agent({ id: 'a1', alive: false }));
    expect(warmed).toEqual([]);
  });

  it('warms again after switching away and back', () => {
    const { warmed, onSelect } = setup();
    onSelect(agent({ id: 'a1', alive: false }));
    onSelect(agent({ id: 'a2', alive: true }));
    onSelect(agent({ id: 'a1', alive: false }));
    expect(warmed).toEqual(['a1', 'a1']);
  });

  it('never warms archived agents or agents in error', () => {
    const { warmed, onSelect } = setup();
    onSelect(agent({ id: 'a1', alive: false, archived: true }));
    onSelect(agent({ id: 'a2', alive: false, status: 'error' }));
    onSelect(null);
    expect(warmed).toEqual([]);
  });
});
