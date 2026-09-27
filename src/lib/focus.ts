// Focus management for dialogs: take the focus, keep Tab inside, give the focus back on close.

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function trapFocus(node: HTMLElement) {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focusables = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && !el.closest('[hidden]'));
  (node.querySelector<HTMLElement>('[autofocus]') ?? focusables()[0] ?? node).focus();

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) {
      e.preventDefault();
      node.focus();
      return;
    }
    const [first, last] = [list[0], list[list.length - 1]];
    const active = document.activeElement;
    if (!node.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener('keydown', onKeydown);
  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      if (previous?.isConnected) previous.focus();
    },
  };
}
