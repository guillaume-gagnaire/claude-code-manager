<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../../lib/state.svelte';
  import Modal from './Modal.svelte';

  let { title, value, onSubmit }: { title: string; value: string; onSubmit: (v: string) => void | Promise<void> } = $props();
  let v = $state(untrack(() => value));

  async function go() {
    if (!v.trim()) return;
    await onSubmit(v.trim());
    app.modal = null;
  }
</script>

<Modal {title} width={420} onclose={() => (app.modal = null)}>
  <!-- svelte-ignore a11y_autofocus -->
  <input class="field" bind:value={v} autofocus onkeydown={(e) => e.key === 'Enter' && go()} />
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (app.modal = null)}>Annuler</button>
    <button class="btn primary" disabled={!v.trim()} onclick={go}>Renommer</button>
  {/snippet}
</Modal>
