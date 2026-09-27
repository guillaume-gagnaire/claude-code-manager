<script lang="ts">
  import type { UserItem } from '../../lib/types';

  let { item }: { item: UserItem } = $props();
</script>

<div class="wrap">
  <div class="bubble">
    {#if item.images > 0}
      <span class="chip">🖼 {item.images} image{item.images > 1 ? 's' : ''}</span>
    {/if}
    {item.text}
    {#if item.queued}<span class="queued">en file d'attente</span>{/if}
  </div>
</div>

<style>
  .wrap {
    display: flex;
    justify-content: flex-end;
  }
  .bubble {
    max-width: 78%;
    padding: 11px 15px;
    border-radius: var(--r);
    background: var(--user);
    font-size: 14px;
    line-height: 1.55;
    text-wrap: pretty;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .chip {
    display: inline-block;
    margin: 0 8px 4px 0;
    padding: 1px 7px;
    border-radius: 99px;
    background: var(--elev2);
    font-size: 11.5px;
    color: var(--muted);
  }
  .queued {
    display: block;
    margin-top: 6px;
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--wait);
  }
</style>
