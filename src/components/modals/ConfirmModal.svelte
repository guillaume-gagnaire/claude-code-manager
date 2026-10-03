<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../../lib/state.svelte';
  import Modal from './Modal.svelte';

  let {
    title,
    body,
    confirm,
    danger = false,
    option,
    alt,
    onConfirm,
  }: {
    title: string;
    body: string;
    confirm: string;
    danger?: boolean;
    option?: { label: string; value: boolean };
    alt?: { label: string; onClick: () => void | Promise<void> };
    onConfirm: (option: boolean) => void | Promise<void>;
  } = $props();

  let checked = $state(untrack(() => option?.value ?? false));
  let busy = $state(false);

  async function go() {
    busy = true;
    await onConfirm(checked);
    busy = false;
    app.modal = null;
  }
</script>

<Modal {title} width={480} onclose={() => (app.modal = null)}>
  <p class="p">{body}</p>
  {#if option}
    <label class="opt">
      <input type="checkbox" bind:checked />
      {option.label}
    </label>
  {/if}
  {#snippet footer()}
    <button class="btn ghost" onclick={() => (app.modal = null)}>Annuler</button>
    {#if alt}
      <button
        class="btn"
        disabled={busy}
        onclick={async () => {
          busy = true;
          await alt.onClick();
          busy = false;
          app.modal = null;
        }}>{alt.label}</button
      >
    {/if}
    <button class="btn {danger ? 'danger' : 'primary'}" disabled={busy} onclick={go}>{confirm}</button>
  {/snippet}
</Modal>

<style>
  .p {
    margin: 0;
    color: var(--muted);
    line-height: 1.55;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    cursor: pointer;
  }
</style>
