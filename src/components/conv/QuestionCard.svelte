<script lang="ts">
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { Question, QuestionItem } from '../../lib/types';

  let { item, agentId, pending }: { item: QuestionItem; agentId: string; pending: boolean } = $props();

  let picks = $state<Record<string, string[]>>({});
  let busy = $state(false);

  const needsConfirm = $derived(item.questions.length > 1 || item.questions.some((q) => q.multiSelect));
  const complete = $derived(item.questions.every((q) => (picks[q.question] ?? []).length > 0));

  function choose(q: Question, label: string) {
    const cur = picks[q.question] ?? [];
    if (q.multiSelect) {
      picks[q.question] = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
      return;
    }
    picks[q.question] = [label];
    if (!needsConfirm) submit();
  }

  async function submit() {
    if (busy) return;
    busy = true;
    const answers = Object.fromEntries(item.questions.map((q) => [q.question, (picks[q.question] ?? []).join(', ')]));
    await app.run(api.answerQuestion(agentId, item.id, answers));
    busy = false;
  }
</script>

{#if pending}
  <div class="card pending" data-testid="question-pending">
    <div class="title"><span class="pulse" style="width:8px;height:8px"></span>Claude attend ta réponse</div>
    {#each item.questions as q, qi (qi)}
      <div class="q">
        {#if q.header && item.questions.length > 1}<span class="chip">{q.header}</span>{/if}
        <div class="text">{q.question}</div>
        <div class="opts">
          {#each q.options as o, j (j)}
            {@const on = (picks[q.question] ?? []).includes(o.label)}
            <button
              class="opt"
              class:primary={j === 0 && !needsConfirm}
              class:on
              title={o.description}
              disabled={busy}
              onclick={() => choose(q, o.label)}
            >
              {#if q.multiSelect}<span class="box">{on ? '☑' : '☐'}</span>{/if}{o.label}
            </button>
          {/each}
        </div>
        {#if q.options.some((o) => o.description)}
          <div class="descs">
            {#each q.options as o, j (j)}
              {#if o.description}<div><b>{o.label}</b> — {o.description}</div>{/if}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    <div class="foot">
      <span class="hint">ou réponds librement dans le champ ci-dessous</span>
      {#if needsConfirm}
        <button class="btn primary" disabled={!complete || busy} onclick={submit}>Valider</button>
      {/if}
    </div>
  </div>
{:else if item.answers}
  <div class="card done">
    {#each item.questions as q, qi (qi)}
      <div class="done-q">{q.question}</div>
      <div class="ans mono">→ {item.answers[q.question] ?? '—'}</div>
    {/each}
  </div>
{:else}
  <div class="card done">
    {#each item.questions as q, qi (qi)}<div class="done-q">{q.question}</div>{/each}
    <div class="ans mono" style="color:var(--dim)">Question restée sans réponse</div>
  </div>
{/if}

<style>
  .card {
    margin-left: 34px;
    display: flex;
    flex-direction: column;
    border-radius: var(--r);
  }
  .pending {
    gap: 12px;
    padding: 16px 18px;
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
  .q {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .chip {
    align-self: flex-start;
    font-family: var(--mono);
    font-size: 10.5px;
    padding: 2px 7px;
    border-radius: 99px;
    background: var(--elev2);
    color: var(--muted);
  }
  .text {
    font-size: 14px;
    line-height: 1.55;
    text-wrap: pretty;
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .opt:hover:not(:disabled) {
    filter: brightness(1.08);
    border-color: var(--wait);
  }
  .opt.primary,
  .opt.on {
    background: var(--wait);
    border-color: var(--wait);
    color: #2a1f05;
  }
  .box {
    font-size: 13px;
  }
  .descs {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: var(--muted);
    line-height: 1.45;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .hint {
    font-size: 11.5px;
    color: var(--dim);
  }
  .done {
    gap: 6px;
    padding: 12px 16px;
    border: 1px solid var(--line);
  }
  .done-q {
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted);
    text-wrap: pretty;
  }
  .ans {
    font-size: 11.5px;
  }
</style>
