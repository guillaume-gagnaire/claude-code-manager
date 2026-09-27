<script lang="ts">
  import { menu } from '../lib/menu.svelte';

  let el = $state<HTMLDivElement>();
  let pos = $state({ x: 0, y: 0 });

  $effect(() => {
    const m = menu.open;
    if (!m || !el) return;
    const r = el.getBoundingClientRect();
    pos = {
      x: Math.min(m.x, window.innerWidth - r.width - 8),
      y: m.y + r.height > window.innerHeight - 8 ? Math.max(8, m.y - r.height) : m.y,
    };
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && menu.open && (menu.close(), e.stopPropagation())} onblur={() => menu.close()} />

{#if menu.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={() => menu.close()} oncontextmenu={(e) => (e.preventDefault(), menu.close())}></div>
  <div class="menu" bind:this={el} style:left="{pos.x || menu.open.x}px" style:top="{pos.y || menu.open.y}px" role="menu">
    {#each menu.open.items as item, i (i)}
      {#if item.separator}
        <div class="sep"></div>
      {:else}
        <button
          role="menuitem"
          class:danger={item.danger}
          disabled={item.disabled}
          onclick={() => {
            menu.close();
            item.onClick?.();
          }}
        >
          <span>{item.label}</span>
          {#if item.hint}<span class="hint">{item.hint}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
  }
  .menu {
    position: fixed;
    z-index: 91;
    min-width: 190px;
    display: flex;
    flex-direction: column;
    padding: 5px;
    border-radius: var(--r);
    border: 1px solid var(--line2);
    background: var(--elev);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
    animation: ccFadeIn 0.08s ease-out;
  }
  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--elev2);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .danger {
    color: var(--del);
  }
  .hint {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--dim);
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--line);
  }
</style>
