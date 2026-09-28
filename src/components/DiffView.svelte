<script lang="ts">
  import { splitRows, type DiffLine } from '../lib/diff';

  // Diff lines, unified (merged, red and green lines) or side by side.
  let { lines, split }: { lines: DiffLine[]; split: boolean } = $props();
</script>

{#if split}
  <!-- Side by side wraps long lines so both columns stay aligned in narrow panes. -->
  <div class="rows">
    {#each splitRows(lines) as r, i (i)}
      <div class="srow">
        {#each [r.left, r.right] as l, side (side)}
          <div class="cell {l ? (l.kind === 'ctx' ? '' : l.kind) : 'void'}">
            <span class="no">{l && l.kind !== 'meta' ? (side === 0 ? (l.oldNo ?? '') : (l.newNo ?? '')) : ''}</span>
            <span class="txt">{l?.text ?? ''}</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{:else}
  <div class="rows unified">
    {#each lines as l, i (i)}
      <div class="urow {l.kind}">
        <span class="no">{l.oldNo ?? ''}</span>
        <span class="no">{l.newNo ?? ''}</span>
        <span class="sign">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}</span>
        <span class="txt">{l.text}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .rows {
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.55;
  }
  .rows.unified {
    min-width: max-content;
  }
  .urow {
    display: flex;
    white-space: pre;
  }
  .no {
    width: 48px;
    flex: none;
    padding-right: 8px;
    text-align: right;
    color: var(--dim);
    user-select: none;
  }
  .sign {
    width: 18px;
    flex: none;
    text-align: center;
    user-select: none;
  }
  .txt {
    padding-right: 20px;
  }
  .urow.add,
  .cell.add {
    background: color-mix(in oklch, var(--add) 14%, transparent);
  }
  .urow.del,
  .cell.del {
    background: color-mix(in oklch, var(--del) 14%, transparent);
  }
  .urow.add .sign {
    color: var(--add);
  }
  .urow.del .sign {
    color: var(--del);
  }
  .urow.meta,
  .cell.meta {
    color: var(--info);
    background: color-mix(in oklch, var(--info) 8%, transparent);
  }
  .srow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .cell {
    display: flex;
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border-right: 1px solid var(--line);
  }
  .cell .txt {
    flex: 1;
    min-width: 0;
    padding-right: 12px;
  }
  .cell.void {
    background: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255, 255, 255, 0.02) 6px 12px);
  }
</style>
