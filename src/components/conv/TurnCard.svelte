<script lang="ts">
  import { commitViaAgent, mergeAgent, openFiles } from '../../lib/agent-actions';
  import { fDur, fTok, fUsd, plural } from '../../lib/format';
  import { app } from '../../lib/state.svelte';
  import type { Agent, TurnItem } from '../../lib/types';

  let { item, agent, last }: { item: TurnItem; agent: Agent; last: boolean } = $props();

  const files = $derived(app.git[agent.projectId]?.agents[agent.id] ?? 0);
  const big = $derived(last && agent.status === 'done' && !item.isError && !item.interrupted);
</script>

{#if item.isError}
  <div class="card error">
    <div class="title"><span class="dot" style="width:8px;height:8px;background:var(--del)"></span>Le tour s'est terminé en erreur</div>
    {#if item.error}<pre class="err">{item.error}</pre>{/if}
  </div>
{:else if big}
  <div class="card done" data-testid="turn-done">
    <div class="title ok"><span class="check">✓</span>Tâche terminée</div>
    <div class="stats mono">
      <span>{fDur(item.durationMs ?? 0)}</span><span>{fTok(item.tokens)} tokens</span><span>{fUsd(item.cost)}</span><span
        >{plural(files, 'fichier modifié', 'fichiers modifiés')}</span
      >
    </div>
    <div class="actions">
      <button class="btn" onclick={() => openFiles('agent')}>Revoir les fichiers</button>
      <button class="btn primary" onclick={() => commitViaAgent(agent)}>Commit…</button>
      {#if agent.worktree}
        <button class="btn" onclick={() => mergeAgent(agent)}>Merger dans {agent.worktree.baseBranch}…</button>
      {/if}
    </div>
  </div>
{:else}
  <div class="sep mono">
    <span class="line"></span>
    {item.interrupted ? 'Interrompu' : fDur(item.durationMs ?? 0)} · {fTok(item.tokens)} tokens · {fUsd(item.cost)}
    <span class="line"></span>
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
    border: 1px solid var(--line2);
    background: var(--panel);
    animation: ccFadeIn 0.2s ease-out;
  }
  .card.error {
    border-color: color-mix(in oklch, var(--del) 55%, transparent);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--del);
  }
  .title.ok {
    color: var(--ok);
  }
  .check {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--ok);
    color: var(--bg);
    font-size: 9px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 22px;
    font-size: 12px;
    color: var(--muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .err {
    margin: 0;
    font-family: var(--mono);
    font-size: 12px;
    white-space: pre-wrap;
    color: var(--muted);
    max-height: 200px;
    overflow: auto;
  }
  .sep {
    margin-left: 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 10.5px;
    color: var(--dim);
    white-space: nowrap;
  }
  .line {
    flex: 1;
    height: 1px;
    background: var(--line);
  }
</style>
