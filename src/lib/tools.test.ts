import { describe, expect, it } from 'vitest';
import { hasDiff, toolArg, toolLabel, toolResultSummary } from './tools';
import type { ToolItem } from './types';

const CWD = 'C:\\code\\app';
const tool = (name: string, input: Record<string, unknown>, extra: Partial<ToolItem> = {}): ToolItem => ({
  kind: 'tool',
  id: 't',
  name,
  input,
  status: 'ok',
  ts: 0,
  ...extra,
});

describe('toolArg', () => {
  it.each([
    ['Bash', { command: 'npm test' }, 'npm test'],
    ['Read', { file_path: 'C:\\code\\app\\src\\a.ts' }, 'src/a.ts'],
    ['Edit', { file_path: 'C:\\code\\app\\README.md' }, 'README.md'],
    ['Grep', { pattern: 'TODO', path: 'C:\\code\\app\\src' }, 'TODO  src'],
    ['Glob', { pattern: '**/*.rs' }, '**/*.rs'],
    ['WebFetch', { url: 'https://example.com' }, 'https://example.com'],
    ['Task', { description: 'Explorer le code' }, 'Explorer le code'],
    ['TodoWrite', { todos: [{}, {}, {}] }, '3 tâches'],
    ['mcp__github__create_issue', { title: 'Bug' }, 'Bug'],
  ])('%s', (name, input, want) => expect(toolArg(tool(name, input), CWD)).toBe(want));
});

describe('toolLabel', () => {
  it('shortens MCP tool names and renames subagents', () => {
    expect(toolLabel('mcp__github__create_issue')).toBe('github·create_issue');
    expect(toolLabel('Task')).toBe('Agent');
    expect(toolLabel('Read')).toBe('Read');
  });
});

describe('toolResultSummary', () => {
  it('counts the lines read', () => {
    expect(toolResultSummary(tool('Read', {}, { result: { text: 'a\nb\nc', isError: false } }))).toBe('3 lignes');
  });
  it('counts search results, singular and empty', () => {
    expect(toolResultSummary(tool('Grep', {}, { result: { text: 'a.ts\nb.ts\n', isError: false } }))).toBe('2 résultats');
    expect(toolResultSummary(tool('Glob', {}, { result: { text: 'a.ts', isError: false } }))).toBe('1 résultat');
    expect(toolResultSummary(tool('Grep', {}, { result: { text: '', isError: false } }))).toBe('aucun résultat');
  });
  it('shows the last output line of a command', () => {
    expect(toolResultSummary(tool('Bash', {}, { result: { text: 'building…\n3 passed · 1 failed\n', isError: false } }))).toBe('3 passed · 1 failed');
  });
  it('shows the error for failed tools', () => {
    expect(toolResultSummary(tool('Bash', {}, { status: 'error', result: { text: 'npm ERR! missing script', isError: true } }))).toBe('npm ERR! missing script');
  });
  it('is empty while running', () => {
    expect(toolResultSummary(tool('Bash', {}, { status: 'running' }))).toBe('');
  });
  it('says when the turn stopped before the tool returned', () => {
    expect(toolResultSummary(tool('Bash', {}, { status: 'interrupted' }))).toBe('interrompu');
  });
});

describe('hasDiff', () => {
  it('is true only when the result carries line counts', () => {
    expect(hasDiff(tool('Edit', {}, { result: { isError: false, add: 0, del: 3 } }))).toBe(true);
    expect(hasDiff(tool('Read', {}, { result: { isError: false, text: 'x' } }))).toBe(false);
  });
});
