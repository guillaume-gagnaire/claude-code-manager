import { describe, expect, it } from 'vitest';
import { isAgentBranch, shortBranch } from './branches';

describe('agent branches', () => {
  it('are named escouade/…, or ccm/… for agents made before the rename', () => {
    expect(isAgentBranch('escouade/pagination')).toBe(true);
    expect(isAgentBranch('ccm/refacto-auth')).toBe(true);
    expect(isAgentBranch('origin/main')).toBe(false);
    expect(isAgentBranch('main')).toBe(false);
  });

  it('show without their prefix', () => {
    expect(shortBranch('escouade/pagination')).toBe('pagination');
    expect(shortBranch('ccm/refacto-auth')).toBe('refacto-auth');
    expect(shortBranch('feature/x')).toBe('feature/x');
  });
});
