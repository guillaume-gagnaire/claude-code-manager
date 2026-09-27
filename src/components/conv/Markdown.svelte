<script lang="ts">
  import { handleMarkdownClick, highlightWithin, renderMarkdown } from '../../lib/markdown';

  let { text, streaming = false }: { text: string; streaming?: boolean } = $props();

  let el = $state<HTMLDivElement>();
  let html = $state('');
  let scheduled = false;

  // While streaming, re-render at most once per frame; highlight code once the text is final.
  $effect(() => {
    const t = text;
    if (!streaming) {
      html = renderMarkdown(t);
      return;
    }
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      html = renderMarkdown(text, false);
    });
  });

  $effect(() => {
    void html;
    if (!streaming && el) queueMicrotask(() => el && highlightWithin(el));
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="md" bind:this={el} onclick={handleMarkdownClick}>{@html html}</div>
