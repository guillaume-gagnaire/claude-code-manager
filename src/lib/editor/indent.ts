// How a file is indented, so that Tab keeps to it.

export function detectIndent(text: string): { tabs: boolean; size: number } {
  let tabs = 0;
  let spaces = 0;
  const steps = new Map<number, number>();
  let prev = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (line[0] === '\t') {
      tabs++;
      continue;
    }
    const width = line.length - line.trimStart().length;
    if (width > 0) spaces++;
    const step = Math.abs(width - prev);
    if (step > 1 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1);
    prev = width;
  }
  if (tabs > spaces) return { tabs: true, size: 4 };
  let size = 2;
  let best = 0;
  for (const [step, n] of steps) {
    if (n > best || (n === best && step < size)) {
      size = step;
      best = n;
    }
  }
  return { tabs: false, size };
}
