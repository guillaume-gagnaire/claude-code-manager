<script lang="ts">
  import { patchLines } from '../../lib/diff';
  import { hasDiff, toolArg, toolLabel, toolResultSummary } from '../../lib/tools';
  import type { ConvItem, ToolItem } from '../../lib/types';
  import Markdown from './Markdown.svelte';
  import PatchView from './PatchView.svelte';
  import Self from './ToolRow.svelte';

  let { item, cwd, childrenOf = () => [] }: { item: ToolItem; cwd: string; childrenOf?: (id: string) => ConvItem[] } = $props();
  let open = $state(false);

  const children = $derived(childrenOf(item.id));
  const arg = $derived(toolArg(item, cwd));
  const diff = $derived(hasDiff(item));
  const res = $derived(toolResultSummary(item));
  const subTools = $derived(children.filter((c) => c.kind === 'tool') as ToolItem[]);
  const subText = $derived(
    children.filter((c) => c.kind === 'text' && c.text.trim()).at(-1) as { text: string; streaming: boolean } | undefined,
  );
  const expandable = $derived(item.status !== 'running' || children.length > 0);
</script>

<div class="tool" class:err={item.status === 'error'}>
  <button class="row" onclick={() => expandable && (open = !open)} aria-expanded={open} title={arg}>
    <span class="badge">{toolLabel(item.name)}</span>
    <span class="arg">{arg}</span>
    {#if item.status === 'running'}
      <span class="spin" aria-label="en cours"></span>
    {:else if diff}
      <span class="add">+{item.result?.add}</span><span class="del">−{item.result?.del}</span>
    {:else if res}
      <span class="res">{res}</span>
    {/if}
    {#if subTools.length}<span class="res">{subTools.length} outil{subTools.length > 1 ? 's' : ''}</span>{/if}
  </button>
  {#if open}
    <div class="detail">
      {#if diff && item.result?.patch?.length}
        <PatchView lines={patchLines(item.result.patch)} />
      {:else if item.name === 'TodoWrite' && Array.isArray(item.input.todos)}
        <ul class="todos">
          {#each item.input.todos as t, i (i)}
            <li class={t.status}>
              <span>{t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '◐' : '☐'}</span>
              {t.content ?? t.activeForm}
            </li>
          {/each}
        </ul>
      {:else if children.length}
        <div class="sub">
          {#if item.input.prompt}<div class="prompt">{item.input.prompt}</div>{/if}
          {#each subTools as c (c.id)}
            <Self item={c} {cwd} {childrenOf} />
          {/each}
          {#if subText}<div class="subtext"><Markdown text={subText.text} streaming={subText.streaming} /></div>{/if}
        </div>
      {:else}
        {#if item.name === 'Bash' || item.name === 'PowerShell'}
          <pre class="out cmd">$ {item.input.command}</pre>
        {/if}
        {#if item.result?.text}
          <pre class="out">{item.result.text}</pre>
        {:else if item.name !== 'Bash'}
          <pre class="out">{JSON.stringify(item.input, null, 2)}</pre>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool {
    margin-left: 34px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--panel);
    overflow: hidden;
    min-width: 0;
  }
  .tool.err {
    border-color: color-mix(in oklch, var(--del) 45%, transparent);
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border: none;
    background: transparent;
    font-family: var(--mono);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .row:hover {
    background: color-mix(in oklch, var(--elev) 60%, transparent);
  }
  .badge {
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--elev2);
    font-weight: 600;
    font-size: 11px;
    flex: none;
  }
  .err .badge {
    color: var(--del);
  }
  .arg {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .add {
    color: var(--add);
    flex: none;
  }
  .del {
    color: var(--del);
    flex: none;
  }
  .res {
    color: var(--muted);
    flex: none;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .err .res {
    color: var(--del);
  }
  .spin {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 1.5px solid var(--line2);
    border-top-color: var(--accent);
    animation: ccSpin 0.8s linear infinite;
    flex: none;
  }
  .detail {
    border-top: 1px solid var(--line);
  }
  .out {
    margin: 0;
    padding: 10px 12px;
    max-height: 360px;
    overflow: auto;
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--term);
    color: #cfc7bb;
  }
  .out.cmd {
    color: var(--text);
    border-bottom: 1px solid var(--line);
    max-height: 120px;
  }
  .todos {
    list-style: none;
    margin: 0;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .todos li {
    display: flex;
    gap: 8px;
  }
  .todos .completed {
    color: var(--dim);
    text-decoration: line-through;
  }
  .todos .in_progress {
    color: var(--accent);
  }
  .sub {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 10px 10px 0;
  }
  .sub :global(.tool) {
    margin-left: 12px;
  }
  .prompt {
    margin-left: 12px;
    padding: 8px 12px;
    border-left: 2px solid var(--line2);
    color: var(--muted);
    font-size: 12.5px;
    white-space: pre-wrap;
    max-height: 140px;
    overflow: auto;
  }
  .subtext {
    margin-left: 12px;
    padding: 4px 4px 0 12px;
  }
</style>
