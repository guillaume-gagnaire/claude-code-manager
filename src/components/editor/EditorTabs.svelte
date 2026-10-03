<script lang="ts">
  import type { FileStatus } from '../../lib/editor/tree';

  let {
    tabs,
    onselect,
    onclose,
  }: {
    tabs: { path: string; name: string; dirty: boolean; status: FileStatus | null; active: boolean }[];
    onselect: (path: string) => void;
    onclose: (path: string) => void;
  } = $props();

  const SC: Record<string, string> = { M: 'var(--wait)', A: 'var(--add)', D: 'var(--del)' };
</script>

<div class="tabs" role="tablist" aria-label="Fichiers ouverts">
  {#each tabs as t (t.path)}
    <div
      class="tab"
      class:on={t.active}
      role="tab"
      tabindex="0"
      aria-selected={t.active}
      title={t.path}
      onclick={() => onselect(t.path)}
      onkeydown={(e) => e.key === 'Enter' && onselect(t.path)}
      onauxclick={(e) => e.button === 1 && onclose(t.path)}
    >
      <span class="name" style:color={t.status ? SC[t.status] : undefined}>{t.name}</span>
      <button
        class="close"
        class:dirty={t.dirty}
        aria-label={`Fermer ${t.name}`}
        title={t.dirty ? 'Non enregistré' : 'Fermer'}
        onclick={(e) => {
          e.stopPropagation();
          onclose(t.path);
        }}><span class="dot"></span><span class="x">×</span></button
      >
    </div>
  {/each}
</div>

<style>
  .tabs {
    height: 36px;
    flex: none;
    display: flex;
    align-items: stretch;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 14px;
    border-right: 1px solid var(--line);
    border-top: 2px solid transparent;
    white-space: nowrap;
    cursor: pointer;
    color: var(--muted);
    font-size: 12.5px;
  }
  .tab.on {
    border-top-color: var(--accent);
    background: var(--term);
    color: var(--text);
  }
  .close {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--dim);
    font-size: 13px;
    cursor: pointer;
  }
  .close:hover {
    background: var(--elev2);
    color: var(--text);
  }
  .dot {
    display: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text);
  }
  .close.dirty .dot {
    display: block;
  }
  .close.dirty .x {
    display: none;
  }
  .close.dirty:hover .dot {
    display: none;
  }
  .close.dirty:hover .x {
    display: inline;
  }
</style>
