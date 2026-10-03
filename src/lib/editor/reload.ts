// A text read again from disk replaces only what differs, so that the cursor, the selections and the
// history of what was typed keep following the text they were on.

const isHigh = (code: number) => code >= 0xd800 && code < 0xdc00;
const isLow = (code: number) => code >= 0xdc00 && code < 0xe000;

/** The one change turning `current` into `next`: the common start and end are kept. Null when they are the same. */
export function reloadChange(current: string, next: string): { from: number; to: number; insert: string } | null {
  if (current === next) return null;
  const room = Math.min(current.length, next.length);
  let start = 0;
  while (start < room && current.charCodeAt(start) === next.charCodeAt(start)) start++;
  let end = 0;
  while (end < room - start && current.charCodeAt(current.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end++;
  // A character made of two code units is replaced whole.
  if (start > 0 && isHigh(current.charCodeAt(start - 1))) start--;
  if (end > 0 && isLow(current.charCodeAt(current.length - end))) end--;
  return { from: start, to: current.length - end, insert: next.slice(start, next.length - end) };
}
