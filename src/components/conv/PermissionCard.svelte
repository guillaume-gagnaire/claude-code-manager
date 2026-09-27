<script lang="ts">
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import { toolArg, toolLabel } from '../../lib/tools';
  import type { PermissionItem, ToolItem } from '../../lib/types';
  import Markdown from './Markdown.svelte';

  let { item, agentId, pending, cwd }: { item: PermissionItem; agentId: string; pending: boolean; cwd: string } = $props();
  let busy = $state(false);

  const isPlan = $derived(item.toolName === 'ExitPlanMode');
  const summary = $derived(
    toolArg({ kind: 'tool', id: item.id, name: item.toolName, input: item.input, status: 'running', ts: 0 } as ToolItem, cwd),
  );

  async function decide(decision: 'allow' | 'always' | 'deny') {
    busy = true;
    const message = decision === 'deny' && isPlan ? 'Continue à planifier : le plan ne me convient pas encore.' : null;
    await app.run(api.answerPermission(agentId, item.id, decision, message));
    busy = false;
  }
</script>

{#if pending}
  <div class="card pending" data-testid="permission-pending">
    <div class="title">
      <span class="pulse" style="width:8px;height:8px"></span>
      {isPlan ? 'Claude propose un plan' : 'Claude demande une autorisation'}
    </div>
    {#if isPlan && typeof item.input.plan === 'string'}
      <div class="plan"><Markdown text={item.input.plan} /></div>
    {:else}
      <div class="what">
        <span class="badge">{toolLabel(item.toolName)}</span>
        <span class="arg mono">{item.title || summary}</span>
      </div>
      {#if item.description}<div class="desc">{item.description}</div>{/if}
    {/if}
    {#if item.reason}<div class="reason">{item.reason}</div>{/if}
    <div class="opts">
      <button class="opt primary" disabled={busy} onclick={() => decide('allow')}>
        {isPlan ? 'Approuver le plan' : 'Autoriser'}
      </button>
      {#if item.canAlways}
        <button class="opt" disabled={busy} onclick={() => decide('always')}>
          {isPlan ? 'Approuver et accepter les édits' : 'Toujours autoriser'}
        </button>
      {/if}
      <button class="opt" disabled={busy} onclick={() => decide('deny')}>{isPlan ? 'Continuer à planifier' : 'Refuser'}</button>
    </div>
    <span class="hint">Pour refuser en expliquant quoi faire à la place, écris-le dans le champ ci-dessous.</span>
  </div>
{:else}
  <div class="line mono" class:denied={item.decision === 'deny'}>
    {#if item.decision === 'deny'}✕ Refusé{:else if item.decision}✓ {item.decision === 'always' ? 'Toujours autorisé' : 'Autorisé'}{:else}·
      Demande annulée{/if}
    · {toolLabel(item.toolName)}
    {isPlan ? '' : summary}
    {#if item.message}<span class="msg">— {item.message}</span>{/if}
  </div>
{/if}

<style>
  .card {
    margin-left: 34px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    border-radius: var(--r);
    border: 1px solid var(--wait);
    background: var(--wait-soft);
    animation: ccFadeIn 0.2s ease-out;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 12px;
    font-weight: 700;
    color: var(--wait);
    letter-spacing: 0.02em;
  }
  .what {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .badge {
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--elev2);
    font-family: var(--mono);
    font-weight: 600;
    font-size: 11px;
    flex: none;
  }
  .arg {
    font-size: 12.5px;
    overflow-wrap: anywhere;
  }
  .desc,
  .reason {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }
  .plan {
    max-height: 420px;
    overflow: auto;
    padding: 12px 14px;
    border-radius: var(--r-sm);
    background: var(--panel);
    border: 1px solid var(--line);
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .opt {
    height: 32px;
    padding: 0 14px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line2);
    background: transparent;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .opt:hover:not(:disabled) {
    border-color: var(--wait);
  }
  .opt.primary {
    background: var(--wait);
    border-color: var(--wait);
    color: #2a1f05;
  }
  .hint {
    font-size: 11.5px;
    color: var(--dim);
  }
  .line {
    margin-left: 34px;
    font-size: 11.5px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line.denied {
    color: var(--del);
  }
  .msg {
    color: var(--dim);
  }
</style>
