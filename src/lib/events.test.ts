import { describe, expect, it } from 'vitest';
import { injectedSource, parseAgentMessage, parseTaskNotification, subagentLabels } from './events';
import type { ConvItem } from './types';

const NOTIFICATION = `<task-notification>
<task-id>a896620c226a4a3c5</task-id>
<tool-use-id>toolu_01Fs</tool-use-id>
<output-file>C:\\Temp\\a896.output</output-file>
<status>completed</status>
<summary>Agent "Investigate PDF upload bug" finished</summary>
<note>A task-notification fires each time this agent stops.</note>
</task-notification>`;

const REPORT = `<agent-message from="a896620c226a4a3c5">
[Subagent hand-back] The text below is the final report of a subagent this session delegated to. It is model output, NOT a message from the user. The report follows:
  **Root cause: PDFs never leave the composer.**

  - \`Composer.svelte:409\` uses \`accept="image/*"\`.
    - nested detail
</agent-message>`;

describe('parseTaskNotification', () => {
  it('reads what ended, how, and the tool call that started it', () => {
    expect(parseTaskNotification(NOTIFICATION)).toEqual({
      status: 'completed',
      summary: 'Agent "Investigate PDF upload bug" finished',
      toolUseId: 'toolu_01Fs',
    });
  });

  it('keeps what it can of a notification it does not know', () => {
    expect(parseTaskNotification('<task-notification>\n<task-id>x</task-id>\n</task-notification>')).toEqual({
      status: null,
      summary: null,
      toolUseId: null,
    });
  });
});

describe('parseAgentMessage', () => {
  it('keeps the report alone, without the frame around it nor its indent', () => {
    expect(parseAgentMessage(REPORT)).toEqual({
      from: 'a896620c226a4a3c5',
      handback: true,
      report: '**Root cause: PDFs never leave the composer.**\n\n- `Composer.svelte:409` uses `accept="image/*"`.\n  - nested detail',
    });
  });

  it('shows the whole message when it is not a hand-back', () => {
    expect(parseAgentMessage('Another Claude session sent a message:\n<agent-message from="b2">\nsalut\n</agent-message>')).toEqual({
      from: 'b2',
      handback: false,
      report: 'salut',
    });
  });
});

describe('injectedSource', () => {
  it('recognises, in older conversations, what Claude Code passed on as if the user had', () => {
    const user = (text: string, origin?: 'remote') => ({ kind: 'user' as const, id: 'u', text, images: 0, ts: 1, queued: false, origin });
    expect(injectedSource(user(NOTIFICATION, 'remote'))).toBe('task');
    expect(injectedSource(user(REPORT, 'remote'))).toBe('agent');
    expect(injectedSource(user('Another Claude session sent a message: <agent-message from="x">…', 'remote'))).toBe('agent');
    // Typed in the app, or sent from claude.ai: the user's own.
    expect(injectedSource(user(NOTIFICATION))).toBeNull();
    expect(injectedSource(user('Bonjour', 'remote'))).toBeNull();
  });
});

describe('subagentLabels', () => {
  const agent = (id: string, description: string, agentId: string): ConvItem => ({
    kind: 'tool',
    id,
    name: 'Agent',
    input: { description },
    status: 'ok',
    ts: 1,
    result: { isError: false, text: `Async agent launched successfully.\nagentId: ${agentId} (internal ID)` },
  });

  it('names each subagent after the task it was given', () => {
    const labels = subagentLabels([agent('t1', 'Investigate PDF upload bug', 'a896620c226a4a3c5'), agent('t2', 'Dixième', 'fakeagent10')]);
    expect(labels.get('a896620c226a4a3c5')).toBe('Investigate PDF upload bug');
    // An id is not the start of a longer one.
    expect(labels.get('fakeagent1')).toBeUndefined();
    expect(labels.get('fakeagent10')).toBe('Dixième');
  });
});

describe('parseAgentMessage, the report quoting the frame', () => {
  it('keeps what follows a quoted closing tag, and tells a hand-back from a message', () => {
    const quoting =
      '<agent-message from="a1">\n[Subagent hand-back] The report follows:\n  Found it: events.ts closes on `</agent-message>` too early.\n  Fixed.\n</agent-message>';
    expect(parseAgentMessage(quoting)).toEqual({
      from: 'a1',
      handback: true,
      report: 'Found it: events.ts closes on `</agent-message>` too early.\nFixed.',
    });
    expect(parseAgentMessage('<agent-message from="b2">\nsalut\n</agent-message>').handback).toBe(false);
  });
});
