import { describe, expect, it } from 'vitest';
import { branchCommits, layout } from './graph';
import type { Commit } from './types';

const c = (hash: string, parents: string[] = [], refs: string[] = []): Commit => ({
  hash,
  parents,
  author: 'Ada',
  time: 0,
  refs,
  subject: hash,
});

/** Rows as compact strings: node column, then "from>to" segments above and below the node. */
const draw = (commits: Commit[]) =>
  layout(commits).map(
    (r) => `${r.col} | ${r.top.map((s) => `${s.from}>${s.to}`).join(' ')} | ${r.bottom.map((s) => `${s.from}>${s.to}`).join(' ')}`,
  );

describe('layout', () => {
  it('keeps a linear history on one lane', () => {
    expect(draw([c('c', ['b']), c('b', ['a']), c('a')])).toEqual(['0 |  | 0>0', '0 | 0>0 | 0>0', '0 | 0>0 | ']);
  });

  it('opens a lane for a merged branch and joins it back where it forked', () => {
    // m merges x (branch) into b (main); both come from a.
    const rows = draw([c('m', ['b', 'x']), c('x', ['a']), c('b', ['a']), c('a')]);
    expect(rows).toEqual(['0 |  | 0>0 0>1', '1 | 0>0 1>1 | 0>0 1>1', '0 | 0>0 1>1 | 0>0 1>1', '0 | 0>0 1>0 | ']);
  });

  it('gives each unmerged agent branch its own lane', () => {
    const rows = layout([c('t2', ['o']), c('t1', ['o']), c('m', ['o']), c('o')]);
    expect(rows.map((r) => r.col)).toEqual([0, 1, 2, 0]);
    expect(rows[3].top.map((s) => `${s.from}>${s.to}`)).toEqual(['0>0', '1>0', '2>0']);
    expect(new Set(rows.slice(0, 3).map((r) => r.lane)).size).toBe(3);
    expect(Math.max(...rows.map((r) => r.width))).toBe(3);
  });

  it('merges into a lane that already waits for the second parent', () => {
    // m2 merges m1 (already expected on lane 1 by t) into its own line.
    const rows = draw([c('t', ['m1']), c('m2', ['b', 'm1']), c('m1', ['b']), c('b')]);
    expect(rows[1]).toBe('1 | 0>0 | 0>0 1>1 1>0');
  });

  it('frees lanes whose branch has converged', () => {
    const rows = layout([c('m', ['b', 'x']), c('x', ['a']), c('b', ['a']), c('a', ['z']), c('z')]);
    expect(rows[4].width).toBe(1);
  });
});

describe('branchCommits', () => {
  it('follows the first parents from the commit the branch points at', () => {
    const commits = [c('m', ['b', 'x'], ['HEAD', 'main']), c('x', ['a'], ['ccm/agent']), c('b', ['a']), c('a')];
    expect([...branchCommits(commits, 'ccm/agent')]).toEqual(['x', 'a']);
    expect([...branchCommits(commits, 'main')]).toEqual(['m', 'b', 'a']);
    expect(branchCommits(commits, 'unknown').size).toBe(0);
    expect(branchCommits(commits, null).size).toBe(0);
  });
});
