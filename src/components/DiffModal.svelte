<script lang="ts">
  import { parseUnifiedDiff, splitRows, type DiffFile, type DiffLine } from '../lib/diff';
  import { api } from '../lib/ipc';
  import { trapFocus } from '../lib/focus';
  import { app } from '../lib/state.svelte';

  let { projectId, agentId, paths, title }: { projectId: string; agentId: string | null; paths: string[]; title: string } = $props();

  let files = $state<DiffFile[]>([]);
  let current = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let split = $state(localStorage.getItem('ccm.diffSplit') === '1');

  $effect(() => {
    api
      .gitDiff(projectId, agentId, paths)
      .then((d) => {
        files = parseUnifiedDiff(d);
        loading = false;
      })
      .catch((e) => {
        error = String(e);
        loading = false;
      });
  });

  const file = $derived(files[current]);
  const lines = $derived<DiffLine[]>(
    file ? file.hunks.flatMap((h) => [{ kind: 'meta', text: h.header, oldNo: null, newNo: null } as DiffLine, ...h.lines]) : [],
  );

  function toggleSplit() {
    split = !split;
    localStorage.setItem('ccm.diffSplit', split ? '1' : '0');
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="overlay" onclick={() => (app.modal = null)}>
  <div class="win" use:trapFocus onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1" aria-label={title}>
    <div class="head">
      <span class="t">{title}</span>
      <span class="n mono">{files.length} fichier{files.length > 1 ? 's' : ''}</span>
      <div style="flex:1"></div>
      <div class="segmented">
        <button class:on={!split} onclick={() => split && toggleSplit()}>Unifié</button>
        <button class:on={split} onclick={() => !split && toggleSplit()}>Côte à côte</button>
      </div>
      <button class="icon-btn" title="Fermer (Échap)" onclick={() => (app.modal = null)}>×</button>
    </div>
    <div class="body">
      {#if files.length > 1}
        <nav class="files">
          {#each files as f, i (f.path)}
            <button class:on={i === current} onclick={() => (current = i)}>
              <span class="st" class:a={f.status === 'A'} class:d={f.status === 'D'}>{f.status}</span>
              <span class="p mono">{f.path}</span>
              <span class="add mono">+{f.add}</span><span class="del mono">−{f.del}</span>
            </button>
          {/each}
        </nav>
      {/if}
      <div class="diff">
        {#if loading}
          <div class="msg">Chargement…</div>
        {:else if error}
          <div class="msg">{error}</div>
        {:else if !file}
          <div class="msg">Aucune différence.</div>
        {:else if file.binary}
          <div class="msg">Fichier binaire.</div>
        {:else}
          <div class="fhead mono">{file.path} <span class="add">+{file.add}</span> <span class="del">−{file.del}</span></div>
          {#if split}
            <div class="rows">
              {#each splitRows(lines) as r, i (i)}
                <div class="srow">
                  {#each [r.left, r.right] as l, side (side)}
                    <div class="cell {l ? (l.kind === 'ctx' ? '' : l.kind) : 'void'}">
                      <span class="no">{l && l.kind !== 'meta' ? (side === 0 ? (l.oldNo ?? '') : (l.newNo ?? '')) : ''}</span>
                      <span class="txt">{l?.text ?? ''}</span>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          {:else}
            <div class="rows">
              {#each lines as l, i (i)}
                <div class="urow {l.kind}">
                  <span class="no">{l.oldNo ?? ''}</span>
                  <span class="no">{l.newNo ?? ''}</span>
                  <span class="sign">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}</span>
                  <span class="txt">{l.text}</span>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(12, 10, 8, 0.6);
    backdrop-filter: blur(3px);
  }
  .win {
    width: calc(100vw - 80px);
    height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line2);
    border-radius: 14px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px 12px 20px;
    border-bottom: 1px solid var(--line);
  }
  .t {
    font-size: 15px;
    font-weight: 700;
  }
  .n {
    font-size: 11px;
    color: var(--dim);
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .files {
    width: 300px;
    flex: none;
    overflow: auto;
    border-right: 1px solid var(--line);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .files button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .files button:hover,
  .files button.on {
    background: var(--elev);
  }
  .st {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    color: var(--wait);
    flex: none;
  }
  .st.a {
    color: var(--add);
  }
  .st.d {
    color: var(--del);
  }
  .p {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
  .add {
    color: var(--add);
    font-size: 11px;
  }
  .del {
    color: var(--del);
    font-size: 11px;
  }
  .diff {
    flex: 1;
    overflow: auto;
    background: var(--term);
    min-width: 0;
  }
  .msg {
    padding: 40px;
    text-align: center;
    color: var(--muted);
  }
  .fhead {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 8px 14px;
    font-size: 12px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }
  .rows {
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.55;
    min-width: max-content;
  }
  .urow {
    display: flex;
    white-space: pre;
  }
  .no {
    width: 48px;
    flex: none;
    padding-right: 8px;
    text-align: right;
    color: var(--dim);
    user-select: none;
  }
  .sign {
    width: 18px;
    flex: none;
    text-align: center;
    user-select: none;
  }
  .txt {
    padding-right: 20px;
  }
  .urow.add,
  .cell.add {
    background: color-mix(in oklch, var(--add) 14%, transparent);
  }
  .urow.del,
  .cell.del {
    background: color-mix(in oklch, var(--del) 14%, transparent);
  }
  .urow.add .sign {
    color: var(--add);
  }
  .urow.del .sign {
    color: var(--del);
  }
  .urow.meta,
  .cell.meta {
    color: var(--info);
    background: color-mix(in oklch, var(--info) 8%, transparent);
  }
  .srow {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-width: max-content;
  }
  .cell {
    display: flex;
    white-space: pre;
    min-width: 50vw;
    border-right: 1px solid var(--line);
  }
  .cell.void {
    background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255, 255, 255, 0.02) 6px 12px);
  }
</style>
