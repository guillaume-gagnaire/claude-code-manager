<script lang="ts">
  import { parseAgentMessage, parseTaskNotification, plainText } from '../../lib/events';
  import Markdown from './Markdown.svelte';

  // What Claude Code passed on to Claude by itself: `source` "task" (a background task), "agent"
  // (a subagent or another session), or another origin. `label`: the task a subagent was given.
  let { source, text, label = null }: { source: string; text: string; label?: string | null } = $props();

  const STATUS: Record<string, string> = { completed: 'terminée', failed: 'en échec', killed: 'arrêtée', stopped: 'arrêtée' };

  const task = $derived(source === 'task' ? parseTaskNotification(text) : null);
  const message = $derived(source === 'agent' ? parseAgentMessage(text) : null);
  const line = $derived.by(() => {
    if (task?.status) return { what: `Tâche de fond ${STATUS[task.status] ?? task.status}`, detail: task.summary };
    // A notification that does not say a task ended (a scheduled trigger, a check-in…).
    if (task) return { what: 'Notification', detail: task.summary ?? plainText(text) };
    return { what: `Message de Claude Code (${source})`, detail: plainText(text) };
  });
  const title = $derived.by(() => {
    if (!message) return '';
    if (message.handback) return label ? `Rapport du sous-agent « ${label} »` : 'Rapport d’un sous-agent';
    return label ? `Message de « ${label} »` : 'Message d’une autre session Claude';
  });
</script>

{#if message}
  <div class="event agent">
    <div class="head"><span class="ico" aria-hidden="true">↩</span>{title}</div>
    <Markdown text={message.report} />
  </div>
{:else}
  <div class="event line" class:failed={task?.status === 'failed'}>
    <span class="ico" aria-hidden="true">◷</span>
    <span class="what">{line.what}</span>
    {#if line.detail}<span class="detail" title={line.detail}>{line.detail}</span>{/if}
  </div>
{/if}

<style>
  .event {
    margin-left: 34px;
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--dim);
    min-width: 0;
  }
  .line .what {
    flex: none;
    color: var(--muted);
  }
  .line.failed .what {
    color: var(--del);
  }
  .detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .agent {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
    border-radius: var(--r);
    border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    background: var(--panel);
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
</style>
