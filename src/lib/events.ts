// What Claude Code passes on to Claude by itself: a background task that ended, a subagent's
// message. Shown as such, not as messages from the user.

import type { ConvItem, UserItem } from './types';

function tag(text: string, name: string): string | null {
  return text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1].trim() || null;
}

export function parseTaskNotification(text: string) {
  return { status: tag(text, 'status'), summary: tag(text, 'summary'), toolUseId: tag(text, 'tool-use-id') };
}

/** The report of a subagent, without the frame Claude Code wraps it in nor its indent. */
export function parseAgentMessage(text: string): { from: string | null; report: string } {
  const from = text.match(/<agent-message from="([^"]+)"/)?.[1] ?? null;
  const body = text.match(/<agent-message[^>]*>([\s\S]*?)(?:<\/agent-message>|$)/)?.[1] ?? text;
  const follows = body.indexOf('The report follows:');
  if (follows < 0) return { from, report: body.trim() };
  const lines = body.slice(follows + 'The report follows:'.length).split('\n');
  return {
    from,
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

/** The task a subagent was given (its Agent tool call answered with its id). */
export function subagentLabel(items: ConvItem[], from: string | null): string | null {
  if (!from) return null;
  const call = items.find(
    (i) => i.kind === 'tool' && (i.name === 'Agent' || i.name === 'Task') && i.result?.text?.includes(`agentId: ${from}`),
  );
  const description = call?.kind === 'tool' ? call.input?.description : null;
  return typeof description === 'string' && description ? description : null;
}
