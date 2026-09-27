<script lang="ts" module>
  import type { ImageInput } from '../lib/types';

  interface Img extends ImageInput {
    url: string;
    name: string;
  }
  const drafts = new Map<string, { text: string; images: Img[] }>();
  const commandCache = new Map<string, { name: string; description: string; argumentHint?: string }[]>();
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { applyCompletion, detectTrigger, filterCommands, type Trigger } from '../lib/complete';
  import { conversationOf } from '../lib/conversations.svelte';
  import { basename, dirname } from '../lib/format';
  import { api } from '../lib/ipc';
  import { EFFORTS, MODELS, MODES, supportsAuto, supportsEffort } from '../lib/models';
  import { app } from '../lib/state.svelte';
  import type { Agent, QuestionItem } from '../lib/types';

  let { agent }: { agent: Agent } = $props();

  let text = $state('');
  let images = $state<Img[]>([]);
  let ta = $state<HTMLTextAreaElement>();
  let trigger = $state<Trigger | null>(null);
  let suggestions = $state<{ label: string; detail: string; value: string }[]>([]);
  let sel = $state(0);
  let sending = $state(false);
  let dragOver = $state(false);
  let modeOpen = $state(false);
  let prevAgent = '';
  let reqSeq = 0;

  const conv = $derived(conversationOf(agent.id));
  const pendingItem = $derived(agent.pending.length ? conv.items.find((i) => i.id === agent.pending[0]) : undefined);
  const busy = $derived(agent.status === 'running' || agent.status === 'waiting');
  const effortOk = $derived(supportsEffort(agent.model));
  const currentMode = $derived(MODES.find((m) => m.value === agent.mode));
  const placeholder = $derived(
    pendingItem
      ? pendingItem.kind === 'permission'
        ? 'Explique à Claude quoi faire à la place (refuse la demande)…'
        : 'Réponds à la question ou écris une réponse libre…'
      : conv.items.length
        ? `Envoyer un message à ${agent.name}…`
        : 'Décris la tâche à confier à Claude…',
  );

  $effect(() => {
    const id = agent.id;
    untrack(() => {
      if (prevAgent && prevAgent !== id) drafts.set(prevAgent, { text, images });
      const d = drafts.get(id);
      text = d?.text ?? '';
      images = d?.images ?? [];
      prevAgent = id;
      trigger = null;
      suggestions = [];
      queueMicrotask(autosize);
    });
  });

  $effect(() => {
    void app.focusComposer;
    queueMicrotask(() => ta?.focus());
  });

  function autosize() {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.4) + 'px';
  }

  async function refreshSuggestions() {
    if (!ta) return;
    trigger = detectTrigger(text, ta.selectionStart);
    const t = trigger;
    if (!t) {
      suggestions = [];
      return;
    }
    const seq = ++reqSeq;
    if (t.kind === 'file') {
      const files = await api.fileSuggestions(agent.id, t.query).catch(() => [] as string[]);
      if (seq !== reqSeq) return;
      suggestions = files.slice(0, 12).map((f) => ({ label: basename(f), detail: dirname(f), value: f }));
    } else {
      let cmds = commandCache.get(agent.id);
      if (!cmds) {
        cmds = await api.getCommands(agent.id).catch(() => []);
        if (cmds.length) commandCache.set(agent.id, cmds);
      }
      if (seq !== reqSeq) return;
      suggestions = filterCommands(cmds, t.query).map((c) => ({
        label: '/' + c.name + (c.argumentHint ? ' ' + c.argumentHint : ''),
        detail: c.description,
        value: c.name,
      }));
    }
    sel = 0;
  }

  function accept(i: number) {
    const s = suggestions[i];
    if (!s || !trigger || !ta) return;
    const r = applyCompletion(text, trigger, s.value);
    text = r.text;
    suggestions = [];
    trigger = null;
    queueMicrotask(() => {
      ta?.setSelectionRange(r.caret, r.caret);
      ta?.focus();
      autosize();
    });
  }

  function lastUserMessage(): string | null {
    for (let i = conv.items.length - 1; i >= 0; i--) {
      const it = conv.items[i];
      if (it.kind === 'user') return it.text;
    }
    return null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') {
        sel = (sel + 1) % suggestions.length;
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowUp') {
        sel = (sel - 1 + suggestions.length) % suggestions.length;
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        accept(sel);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        suggestions = [];
        trigger = null;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'Escape' && busy) {
      e.preventDefault();
      e.stopPropagation();
      stop();
      return;
    }
    if (e.key === 'ArrowUp' && !text) {
      const last = lastUserMessage();
      if (last) {
        text = last;
        e.preventDefault();
        queueMicrotask(autosize);
      }
    }
  }

  async function addFiles(files: Iterable<File>) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > 5 * 1024 * 1024) {
        app.toast(`${f.name} dépasse 5 Mo`, 'error');
        continue;
      }
      const url = await new Promise<string>((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsDataURL(f);
      });
      images.push({ url, name: f.name || 'image', mediaType: f.type, data: url.slice(url.indexOf(',') + 1) });
    }
  }

  function onPaste(e: ClipboardEvent) {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: DragEvent) {
    dragOver = false;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault();
      addFiles(files);
    }
  }

  async function send() {
    const body = text.trim();
    if ((!body && !images.length) || sending) return;
    sending = true;
    const sentImages = images.map(({ mediaType, data }) => ({ mediaType, data }));
    const prevText = text;
    const prevImages = images;
    text = '';
    images = [];
    drafts.delete(agent.id);
    queueMicrotask(autosize);
    let ok: unknown;
    if (pendingItem?.kind === 'question' && body) {
      const q = pendingItem as QuestionItem;
      ok = await app.run(api.answerQuestion(agent.id, q.id, Object.fromEntries(q.questions.map((x) => [x.question, body]))));
    } else if (pendingItem?.kind === 'permission' && body) {
      ok = await app.run(api.answerPermission(agent.id, pendingItem.id, 'deny', body));
    } else {
      ok = await app.run(api.sendMessage(agent.id, body, sentImages));
    }
    if (ok === undefined) {
      text = prevText;
      images = prevImages;
    }
    sending = false;
  }

  function stop() {
    app.run(api.interrupt(agent.id));
  }

  function setOption(o: { model?: string; effort?: string; mode?: string }) {
    const a = app.agents[agent.id];
    if (a) Object.assign(a, o);
    if (o.mode === 'bypassPermissions') app.toast('Mode Bypass : Claude agira sans aucune demande de permission.', 'info');
    app.run(api.setAgentOptions(agent.id, o));
  }
</script>

<div class="composer-wrap">
  <div
    class="composer"
    class:pending={!!pendingItem}
    class:drag={dragOver}
    role="group"
    ondragover={(e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        dragOver = true;
      }
    }}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
  >
    {#if suggestions.length}
      <div class="suggest" role="listbox">
        {#each suggestions as s, i (s.value)}
          <button
            class="sug"
            class:on={i === sel}
            role="option"
            aria-selected={i === sel}
            onmousedown={(e) => {
              e.preventDefault();
              accept(i);
            }}
            onmouseenter={() => (sel = i)}
          >
            <span class="sl mono">{s.label}</span>
            <span class="sd">{s.detail}</span>
          </button>
        {/each}
      </div>
    {/if}
    {#if images.length}
      <div class="imgs">
        {#each images as img, i (i)}
          <div class="img">
            <img src={img.url} alt={img.name} />
            <button class="rm" aria-label="Retirer l'image" onclick={() => images.splice(i, 1)}>×</button>
          </div>
        {/each}
      </div>
    {/if}
    <textarea
      bind:this={ta}
      bind:value={text}
      {placeholder}
      rows="2"
      spellcheck="false"
      oninput={() => {
        autosize();
        refreshSuggestions();
      }}
      onkeydown={onKeydown}
      onclick={refreshSuggestions}
      onpaste={onPaste}
      onblur={() => setTimeout(() => (suggestions = []), 120)}
    ></textarea>
    <div class="bar">
      <div class="segmented" title="Modèle">
        {#each MODELS as m (m.value)}
          <button class:on={agent.model === m.value} onclick={() => setOption({ model: m.value })}>{m.label}</button>
        {/each}
      </div>
      <div class="segmented labeled" title={effortOk ? 'Effort de réflexion' : "Haiku ne gère pas l'effort"}>
        <span class="lab">Effort</span>
        {#each EFFORTS as ef (ef.value)}
          <button
            class="accent"
            class:on={effortOk && agent.effort === ef.value}
            title={ef.title}
            disabled={!effortOk}
            onclick={() => setOption({ effort: ef.value })}>{ef.label}</button
          >
        {/each}
      </div>
      <div class="mode-wrap">
        <button class="mode" class:bypass={agent.mode === 'bypassPermissions'} aria-haspopup="menu" aria-expanded={modeOpen} onclick={() => (modeOpen = !modeOpen)}>
          <span class="lab">Mode</span>{currentMode?.label ?? agent.mode}<span class="chev">▾</span>
        </button>
        {#if modeOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="mode-backdrop" onclick={() => (modeOpen = false)}></div>
          <div class="mode-menu" role="menu">
            {#each MODES as md (md.value)}
              {@const unavailable = md.value === 'auto' && !supportsAuto(agent.model)}
              <button
                role="menuitemradio"
                aria-checked={agent.mode === md.value}
                disabled={unavailable}
                title={unavailable ? "Le mode Auto n'est pas disponible avec Haiku" : md.title}
                onclick={() => {
                  modeOpen = false;
                  setOption({ mode: md.value });
                }}
              >
                <span class="check">{agent.mode === md.value ? '✓' : ''}</span>
                <span class="ml">{md.label}</span>
                <span class="md">{unavailable ? 'indisponible avec Haiku' : md.title}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <div style="flex:1"></div>
      {#if busy}
        <button class="btn ghost stop" onclick={stop} title="Interrompre (Échap)">■ Stop</button>
      {/if}
      <span class="kbd">↵ envoyer</span>
      <button class="btn primary" disabled={sending || (!text.trim() && !images.length)} onclick={send}>
        {busy && !pendingItem ? 'Mettre en file' : 'Envoyer'}
      </button>
    </div>
  </div>
</div>

<style>
  .composer-wrap {
    flex: none;
    padding: 0 28px 20px;
  }
  .composer {
    position: relative;
    max-width: 780px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    border-radius: var(--r);
    border: 1px solid var(--line2);
    background: var(--elev);
    transition: border-color 0.15s;
  }
  .composer:focus-within {
    border-color: color-mix(in oklch, var(--accent) 55%, var(--line2));
  }
  .composer.pending {
    border-color: var(--wait);
  }
  .composer.drag {
    border-style: dashed;
    border-color: var(--accent);
  }
  textarea {
    resize: none;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    line-height: 1.5;
    padding: 14px 16px 6px;
    min-height: 58px;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 10px 16px;
  }
  .labeled {
    align-items: center;
    padding-left: 8px;
  }
  .lab {
    font-size: 11px;
    color: var(--dim);
    margin-right: 4px;
  }
  .stop {
    height: 30px;
    color: var(--del);
  }
  .mode-wrap {
    position: relative;
  }
  .mode {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line);
    background: var(--panel);
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .mode:hover {
    border-color: var(--line2);
  }
  .mode.bypass {
    border-color: color-mix(in oklch, var(--del) 55%, transparent);
    color: var(--del);
  }
  .chev {
    color: var(--dim);
    font-size: 9px;
  }
  .mode-backdrop {
    position: fixed;
    inset: 0;
    z-index: 29;
  }
  .mode-menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    z-index: 30;
    width: 330px;
    display: flex;
    flex-direction: column;
    padding: 5px;
    border-radius: var(--r);
    border: 1px solid var(--line2);
    background: var(--elev);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  }
  .mode-menu button {
    display: grid;
    grid-template-columns: 16px auto;
    column-gap: 6px;
    padding: 7px 10px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .mode-menu button:hover:not(:disabled) {
    background: var(--elev2);
  }
  .mode-menu button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .check {
    grid-row: span 2;
    color: var(--accent);
    font-size: 12px;
  }
  .ml {
    font-size: 13px;
    font-weight: 600;
  }
  .md {
    font-size: 11.5px;
    color: var(--dim);
  }
  .imgs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 14px 0;
  }
  .img {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: var(--r-sm);
    overflow: hidden;
    border: 1px solid var(--line2);
  }
  .img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .rm {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
  .suggest {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 30;
    display: flex;
    flex-direction: column;
    padding: 5px;
    max-height: 320px;
    overflow: auto;
    border-radius: var(--r);
    border: 1px solid var(--line2);
    background: var(--elev);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  }
  .sug {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 7px 10px;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .sug.on {
    background: var(--elev2);
  }
  .sl {
    font-size: 12.5px;
    flex: none;
  }
  .sd {
    font-size: 12px;
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
</style>
