<script lang="ts">
  import { parseAgentMessage, parseTaskNotification } from '../../lib/events';
  import Markdown from './Markdown.svelte';

  // What Claude Code passed on to Claude by itself. `label`: the task a subagent was given.
  let { source, text, label = null }: { source: 'task' | 'agent'; text: string; label?: string | null } = $props();

  const STATUS: Record<string, string> = { completed: 'terminée', failed: 'en échec', killed: 'arrêtée', stopped: 'arrêtée' };

  const task = $derived(source === 'task' ? parseTaskNotification(text) : null);
  const report = $derived(source === 'agent' ? parseAgentMessage(text).report : '');
</script>

{#if task}
  <div class="event task" class:failed={task.status === 'failed'}>
    <span class="ico" aria-hidden="true">◷</span>
    <span class="what">Tâche de fond {STATUS[task.status ?? ''] ?? task.status ?? 'terminée'}</span>
    {#if task.summary}<span class="sum">{task.summary}</span>{/if}
  </div>
{:else}
  <div class="event agent">
    <div class="head">
      <span class="ico" aria-hidden="true">↩</span>{label ? `Rapport du sous-agent « ${label} »` : 'Message d’un sous-agent'}
    </div>
    <Markdown text={report} />
  </div>
{/if}

<style>
  .event {
    margin-left: 34px;
  }
  .task {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--dim);
    min-width: 0;
  }
  .task .what {
    flex: none;
    color: var(--muted);
  }
  .task.failed .what {
    color: var(--del);
  }
  .sum {
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
