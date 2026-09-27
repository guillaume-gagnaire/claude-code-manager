<script lang="ts">
  import { app } from '../lib/state.svelte';
</script>

<div class="toasts">
  {#each app.toasts as t (t.id)}
    <div class="toast {t.kind}">{t.text}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 16px;
    bottom: 44px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 420px;
    pointer-events: none;
  }
  .toast {
    padding: 10px 14px;
    border-radius: var(--r);
    border: 1px solid var(--line2);
    background: var(--elev);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
    font-size: 12.5px;
    line-height: 1.45;
    white-space: pre-wrap;
    animation: ccFadeIn 0.15s ease-out;
    pointer-events: auto;
  }
  .error {
    border-color: var(--del);
  }
  .ok {
    border-color: var(--ok);
  }
</style>
