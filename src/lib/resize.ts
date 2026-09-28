// Svelte action reporting an element's width as it is laid out.

/** Calls `onWidth` with the element's content width now and whenever it changes. */
export function observeWidth(node: HTMLElement, onWidth: (width: number) => void) {
  const ro = new ResizeObserver((entries) => {
    const e = entries[entries.length - 1];
    if (e) onWidth(e.contentRect.width);
  });
  ro.observe(node);
  return { destroy: () => ro.disconnect() };
}
