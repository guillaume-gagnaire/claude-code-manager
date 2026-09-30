<script lang="ts">
  import { fDur, fTok, fUsd, fWhen, plural } from '../../lib/format';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { FileEdit } from '../../lib/tools';
  import type { Agent, TurnItem } from '../../lib/types';

  // `edits`: the files this turn edited, recapped once the agent is done.
  let { item, agent, last, edits = [] }: { item: TurnItem; agent: Agent; last: boolean; edits?: FileEdit[] } = $props();

  const big = $derived(last && agent.status === 'done' && !item.isError && !item.interrupted);
</script>

{#if item.isError}
  <div class="card error">
    <div class="title"><span class="dot" style="width:8px;height:8px;background:var(--del)"></span>Le tour s'est terminé en erreur</div>
    {#if item.error}<pre class="err">{item.error}</pre>{/if}
    {#if last && agent.resumeAt}
      <div class="resume">
        <span>Reprise automatique {fWhen(agent.resumeAt, app.now)}</span>
        <button class="btn small" onclick={() => app.run(api.cancelResume(agent.id))}>Annuler la reprise</button>
      </div>
    {/if}
  </div>
{:else if big}
  <div class="card done" data-testid="turn-done">
    <div class="title ok"><span class="check">✓</span>Tâche terminée</div>
    <div class="stats mono">
      <span>{fDur(item.durationMs ?? 0)}</span><span>{fTok(item.tokens)} tokens</span><span>{fUsd(item.cost)}</span><span
        >{plural(edits.length, 'fichier modifié', 'fichiers modifiés')}</span
      >
    </div>
    {#if edits.length}
      <ul class="recap mono" aria-label="Fichiers modifiés">
        {#each edits as e (e.path)}
          <li><span class="path">{e.path}</span><span class="add">+{e.add}</span><span class="del">−{e.del}</span></li>
        {/each}
      </ul>
    {/if}
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
  .recap {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
  }
  .recap li {
    display: flex;
    gap: 10px;
    min-width: 0;
  }
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .add {
    color: var(--add);
  }
  .del {
    color: var(--del);
  }
  .resume {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12.5px;
    color: var(--text);
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
