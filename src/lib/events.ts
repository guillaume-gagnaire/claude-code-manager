// What Claude Code passes on to Claude by itself: a background task that ended, a subagent's
// message, an MCP channel's… Shown as such, not as messages from the user.

import type { ConvItem, UserItem } from './types';

function tag(text: string, name: string): string | null {
  return text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1].trim() || null;
}

export function parseTaskNotification(text: string) {
  return { status: tag(text, 'status'), summary: tag(text, 'summary'), toolUseId: tag(text, 'tool-use-id') };
}

/** A notification's words, without its tags. */
export function plainText(text: string): string {
  return text
    .replace(/<\/?[a-z][\w-]*[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The message of a subagent (a hand-back: its report) or of another session, without the frame
 * Claude Code wraps it in nor its indent.
 */
export function parseAgentMessage(text: string): { from: string | null; handback: boolean; report: string } {
  const from = text.match(/<agent-message from="([^"]+)"/)?.[1] ?? null;
  const open = text.match(/<agent-message[^>]*>/);
  let body = text;
  if (open?.index !== undefined) {
    // The last closing tag: a report may quote the tag itself.
    const close = text.lastIndexOf('</agent-message>');
    const start = open.index + open[0].length;
    body = text.slice(start, close > start ? close : undefined);
  }
  const handback = body.includes('[Subagent hand-back]');
  const follows = body.indexOf('The report follows:');
  if (follows < 0) return { from, handback, report: body.trim() };
  const lines = body.slice(follows + 'The report follows:'.length).split('\n');
  return {
    from,
    handback,
    report: lines
      .map((l) => l.replace(/^ {2}/, ''))
      .join('\n')
      .trim(),
  };
}

/** In conversations saved before events had their own kind, they were messages "from claude.ai". */
export function injectedSource(item: UserItem): 'task' | 'agent' | null {
  if (item.origin !== 'remote') return null;
  const t = item.text.trimStart();
  if (t.startsWith('<task-notification>')) return 'task';
  if (t.startsWith('<agent-message') || t.startsWith('Another Claude session sent a message:')) return 'agent';
  return null;
}

/** Each subagent's task, by its id (given by the Agent tool call that launched it). */
export function subagentLabels(items: ConvItem[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const i of items) {
    if (i.kind !== 'tool' || (i.name !== 'Agent' && i.name !== 'Task')) continue;
    const id = i.result?.text?.match(/agentId: ([\w-]+)/)?.[1];
    const description = i.input?.description;
    if (id && typeof description === 'string' && description) labels.set(id, description);
  }
  return labels;
}
