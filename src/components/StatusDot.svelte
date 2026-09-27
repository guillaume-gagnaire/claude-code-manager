<script lang="ts">
  import type { AgentStatus } from '../lib/types';

  let { status, size = 8 }: { status: AgentStatus; size?: number } = $props();
</script>

{#if status === 'done'}
  <span class="check" style:width="{size + 6}px" style:height="{size + 6}px" style:font-size="{size}px">✓</span>
{:else if status === 'waiting'}
  <span class="pulse" style:width="{size}px" style:height="{size}px"></span>
{:else if status === 'error'}
  <span class="dot" style:width="{size}px" style:height="{size}px" style:background="var(--del)"></span>
{:else}
  <span
    class="dot"
    class:running={status === 'running'}
    style:width="{size}px"
    style:height="{size}px"
    style:background={status === 'running' ? 'var(--ok)' : 'var(--dim)'}
  ></span>
{/if}

<style>
  .check {
    border-radius: 50%;
    background: var(--ok);
    color: var(--bg);
    font-weight: 800;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    margin: -3px;
  }
  .running {
    box-shadow: 0 0 0 0 oklch(0.76 0.12 150 / 0.5);
    animation: run 2s ease-out infinite;
  }
  @keyframes run {
    0% {
      box-shadow: 0 0 0 0 oklch(0.76 0.12 150 / 0.55);
    }
    70%,
    100% {
      box-shadow: 0 0 0 5px oklch(0.76 0.12 150 / 0);
    }
  }
</style>
