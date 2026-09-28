// Launch commands: each runs in its own read-only terminal, whose log outlives its runs.

import { api } from './ipc';
import { app } from './state.svelte';
import { disposeLog, launchLog } from './terminals';
import type { LaunchState, Project, RunCommand } from './types';

/** The command's log; the running process follows its size. */
export function log(commandId: string) {
  return launchLog(commandId, (cols, rows) => {
    const pty = app.launches[commandId]?.ptyId;
    if (pty) api.termResize(pty, cols, rows).catch(() => {});
  });
}

const time = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export async function startLaunch(project: Project, cmd: RunCommand) {
  const previous = app.launches[cmd.id];
  if (previous?.status === 'running') return;
  const x = log(cmd.id);
  app.launches[cmd.id] = { status: 'running', ptyId: null, name: cmd.name, stopping: false, code: null, startedAt: Date.now() };
  // A run killed in a full-screen program, or with its cursor hidden, must not leave the log so.
  const again = previous ? `\x1b[?1049l\x1b[!p\r\n\x1b[2m— relancé à ${time()} —\x1b[0m\r\n\r\n` : '';
  // Once written, the header's end is where the command starts. The process gets the log's size
  // as it is: displayed, it is already fitted.
  await new Promise<void>((done) => x.term.write(`${again}\x1b[2m$ ${cmd.command}\x1b[0m\r\n`, done));
  try {
    const size = { cols: x.term.cols, rows: x.term.rows, cursorRow: x.term.buffer.active.cursorY + 1 };
    const info = await api.runStart({ projectId: project.id, commandId: cmd.id, ...size }, (b) => x.term.write(new Uint8Array(b)));
    app.launchStarted(cmd.id, info.id);
  } catch (e) {
    x.term.write(`\x1b[31m${String(e)}\x1b[0m\r\n`);
    const l = app.launches[cmd.id];
    if (!l) return;
    Object.assign(l, { status: l.stopping ? 'stopped' : 'crashed', code: null, stopping: false });
    if (l.status === 'crashed') app.toast(`« ${cmd.name} » n'a pas pu démarrer : ${e}`, 'error');
  }
}

export function stopLaunch(commandId: string) {
  const l = app.launches[commandId];
  if (l?.status !== 'running') return;
  l.stopping = true;
  // Still starting: killed as soon as it is up.
  if (l.ptyId) api.termKill(l.ptyId).catch(() => {});
}

export async function restartLaunch(project: Project, cmd: RunCommand) {
  const run = app.launches[cmd.id];
  stopLaunch(cmd.id);
  const until = Date.now() + 10_000;
  while (app.launches[cmd.id] === run && run?.status === 'running' && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 50));
  }
  // Started again (by another restart) or removed in the meantime: nothing left to restart.
  if (app.launches[cmd.id] !== run) return;
  await startLaunch(project, cmd);
}

export async function startAll(project: Project) {
  await Promise.all(project.runCommands.map((c) => startLaunch(project, c)));
}

export function stopAll(project: Project) {
  for (const c of project.runCommands) stopLaunch(c.id);
}

/** Commands about to be killed along with their project: their exits are not crashes. Returns the undo. */
export function expectStops(commandIds: string[]) {
  const marked = commandIds.map((id) => app.launches[id]).filter((l): l is LaunchState => l?.status === 'running' && !l.stopping);
  for (const l of marked) l.stopping = true;
  return () => {
    for (const l of marked) if (l.status === 'running') l.stopping = false;
  };
}

/** Commands going away (removed, or their project closed): stopped silently, their logs dropped. */
export function forgetLaunches(commandIds: string[]) {
  for (const id of commandIds) {
    const pty = app.launches[id]?.ptyId;
    if (pty) api.termKill(pty).catch(() => {});
    delete app.launches[id];
    disposeLog(id);
  }
}

export function launchStatus(l: LaunchState | undefined): { label: string; color: string } {
  if (!l) return { label: 'prêt', color: 'var(--dim)' };
  switch (l.status) {
    case 'running':
      return l.stopping ? { label: 'arrêt…', color: 'var(--wait)' } : { label: 'en cours', color: 'var(--ok)' };
    case 'stopped':
      return { label: 'arrêté', color: 'var(--muted)' };
    case 'done':
      return { label: 'terminé', color: 'var(--muted)' };
    case 'crashed':
      return { label: l.code === null ? 'planté' : `planté (code ${l.code})`, color: 'var(--del)' };
  }
}
