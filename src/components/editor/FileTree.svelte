<script lang="ts">
  import type { TreeRow } from '../../lib/editor/tree';

  let {
    rows,
    active,
    ontoggle,
    onopen,
  }: { rows: TreeRow[]; active: string | null; ontoggle: (dir: string) => void; onopen: (path: string) => void } = $props();

  const SC: Record<string, string> = { M: 'var(--wait)', A: 'var(--add)', D: 'var(--del)' };
</script>

<div class="tree" role="tree" aria-label="Fichiers">
  {#each rows as r (r.kind + ':' + r.path)}
    {#if r.kind === 'dir'}
      <button
        class="row dir"
        role="treeitem"
        aria-expanded={r.open}
        aria-selected="false"
        style:padding-left="{8 + r.depth * 14}px"
        onclick={() => ontoggle(r.path)}
      >
        <span class="chev">{r.open ? '▾' : '▸'}</span>
        <span class="name">{r.name}</span>
        {#if r.changedInside}<span class="st" style:color="var(--wait)">•</span>{/if}
      </button>
    {:else}
      <button
        class="row"
        class:on={r.path === active}
        role="treeitem"
        aria-selected={r.path === active}
        title={r.path}
        style:padding-left="{8 + r.depth * 14}px"
        style:color={r.status ? SC[r.status] : undefined}
        onclick={() => onopen(r.path)}
      >
        <span class="chev"></span>
        <span class="name">{r.name}</span>
        {#if r.status}<span class="st mono">{r.status}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .tree {
    display: flex;
    flex-direction: column;
    padding: 0 6px 12px;
  }
  .row {
    width: 100%;
    flex: none;
    height: 26px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-right: 8px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .row:hover {
    background: var(--elev);
  }
  .row.on {
    background: var(--elev2);
    font-weight: 600;
  }
  .row.dir {
    color: var(--muted);
    font-weight: 600;
  }
  .chev {
    width: 10px;
    flex: none;
    font-size: 9px;
    color: var(--dim);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .st {
    font-size: 10.5px;
    font-weight: 700;
  }
</style>
