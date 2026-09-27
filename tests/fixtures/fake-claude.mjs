#!/usr/bin/env node
// Test double of the `claude` CLI in `--input-format/--output-format stream-json` mode.
// It replays the frame shapes documented in docs/PROTOCOL.md. The user message text picks the
// scenario: "question", "permission", "edit", "slow", "crash", "grandchild"; anything else is a
// plain reply. A `--resume=missing…` session fails like an unknown session does.
// Every launch appends {argv, cwd} to $FAKE_CLAUDE_LOG, by default
// <tmp>/fake-claude-<cwd with non-alphanumerics replaced by _>.jsonl.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const argv = process.argv.slice(2);
const logFile = process.env.FAKE_CLAUDE_LOG || path.join(os.tmpdir(), `fake-claude-${process.cwd().replace(/[^a-zA-Z0-9]/g, '_')}.jsonl`);
fs.appendFileSync(logFile, JSON.stringify({ argv, cwd: process.cwd(), proxy: process.env.HTTPS_PROXY ?? null }) + '\n');

const resume = argv.find((a) => a.startsWith('--resume='))?.slice('--resume='.length);
if (resume?.startsWith('missing')) {
  process.stderr.write(`No conversation found with session ID: ${resume}\n`);
  process.exit(1);
}
const sessionId = resume ?? `sess-${process.pid}`;
const model = argv[argv.indexOf('--model') + 1] ?? 'sonnet';
const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 };
let msg = 0;
let pendingAnswer = null;
let slowTimer = null;

const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const ok = (id, response = {}) => out({ type: 'control_response', response: { subtype: 'success', request_id: id, response } });

function assistant(block, id = `msg_${process.pid}_${++msg}`) {
  out({ type: 'assistant', message: { id, role: 'assistant', content: [block] }, parent_tool_use_id: null, session_id: sessionId });
  return id;
}

function streamText(text) {
  const id = `msg_${process.pid}_${++msg}`;
  const ev = (event) => out({ type: 'stream_event', event, parent_tool_use_id: null, session_id: sessionId });
  ev({
    type: 'message_start',
    message: { id, usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 } },
  });
  ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  for (const part of text.match(/.{1,6}/gs) ?? []) ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } });
  assistant({ type: 'text', text }, id);
  ev({ type: 'content_block_stop', index: 0 });
  ev({ type: 'message_stop' });
}

function result({ isError = false, subtype = 'success' } = {}) {
  usage.inputTokens += 100;
  usage.outputTokens += 20;
  usage.cacheReadInputTokens += 1000;
  usage.costUSD = Math.round((usage.costUSD + 0.05) * 1e6) / 1e6;
  out({
    type: 'result',
    subtype,
    is_error: isError,
    duration_ms: 1200,
    session_id: sessionId,
    result: isError ? 'Erreur simulée' : 'ok',
    modelUsage: { [`claude-${model}-test`]: { ...usage, canonicalModel: `claude-${model}-test` } },
  });
  out({
    type: 'rate_limit_event',
    rate_limit_info: {
      unifiedWindows: { five_hour: { utilization: 0.12, resetsAt: 1790558400 }, seven_day: { utilization: 0.34, resetsAt: 1790805600 } },
    },
  });
}

function toolResult(toolUseId, content, extra = {}) {
  out({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: false }] },
    parent_tool_use_id: null,
    ...extra,
  });
}

function onUser(text) {
  out({ type: 'system', subtype: 'init', session_id: sessionId, model, cwd: process.cwd(), permissionMode: 'default' });
  if (text.includes('crash')) process.exit(3);
  if (text.includes('grandchild')) {
    // Like a dev server started by the Bash tool: must die with the agent's process tree.
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
    streamText(`pid:${child.pid}`);
    result();
    return;
  }
  if (text.includes('question')) {
    const tuid = `toolu_q${msg}`;
    assistant({ type: 'tool_use', id: tuid, name: 'AskUserQuestion', input: {} });
    const input = {
      questions: [
        {
          question: 'Quelle base de données ?',
          header: 'Base',
          multiSelect: false,
          options: [
            { label: 'PostgreSQL', description: 'Relationnelle' },
            { label: 'SQLite', description: 'Embarquée' },
          ],
        },
      ],
    };
    pendingAnswer = { id: 'req_question', tuid, kind: 'question' };
    out({
      type: 'control_request',
      request_id: 'req_question',
      request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input, tool_use_id: tuid, requires_user_interaction: true },
    });
    return;
  }
  if (text.includes('permission')) {
    const tuid = `toolu_p${msg}`;
    const input = { command: 'rm -rf build', description: 'Supprime le dossier build' };
    assistant({ type: 'tool_use', id: tuid, name: 'Bash', input });
    pendingAnswer = { id: 'req_perm', tuid, kind: 'permission' };
    out({
      type: 'control_request',
      request_id: 'req_perm',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input,
        tool_use_id: tuid,
        decision_reason: 'Commande destructive',
        permission_suggestions: [
          { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'rm -rf build' }], behavior: 'allow', destination: 'localSettings' },
        ],
      },
    });
    return;
  }
  if (text.includes('edit')) {
    const tuid = `toolu_e${msg}`;
    const file = path.join(process.cwd(), 'src', 'app.ts');
    assistant({ type: 'tool_use', id: tuid, name: 'Edit', input: { file_path: file, old_string: 'a', new_string: 'b' } });
    toolResult(tuid, 'The file has been updated.', {
      tool_use_result: {
        filePath: file,
        structuredPatch: [
          { oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-const a = 1;', '+const a = 2;', '+const b = 3;'] },
        ],
      },
    });
    streamText('Fichier modifié.');
    result();
    return;
  }
  if (text.includes('slow')) {
    streamText('Je commence…');
    slowTimer = setTimeout(() => result(), 30_000);
    return;
  }
  streamText(`Bonjour, tu as dit : ${text}`);
  result();
}

function onControlResponse(resp) {
  if (!pendingAnswer || resp.request_id !== pendingAnswer.id) return;
  const p = pendingAnswer;
  pendingAnswer = null;
  const r = resp.response ?? {};
  if (p.kind === 'question') {
    const answers = r.updatedInput?.answers ?? {};
    toolResult(p.tuid, `Réponses : ${JSON.stringify(answers)}`, { tool_use_result: { answers } });
    streamText(`Choix retenu : ${Object.values(answers).join(', ')}`);
  } else if (r.behavior === 'allow') {
    toolResult(p.tuid, 'build supprimé', { tool_use_result: { stdout: 'build supprimé', stderr: '', interrupted: false } });
    streamText(r.updatedPermissions ? 'Commande exécutée (règle enregistrée).' : 'Commande exécutée.');
  } else {
    out({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: p.tuid, content: `Refusé : ${r.message}`, is_error: true }] },
      parent_tool_use_id: null,
    });
    streamText(`Compris : ${r.message}`);
  }
  result();
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  const m = JSON.parse(line);
  if (m.type === 'control_response') return onControlResponse(m.response);
  if (m.type === 'control_request') {
    const r = m.request;
    switch (r.subtype) {
      case 'initialize':
        return ok(m.request_id, {
          commands: [
            { name: 'compact', description: 'Compacte le contexte', argumentHint: '' },
            { name: 'review', description: 'Revue de code', argumentHint: '[pr]' },
          ],
          models: [],
          account: {},
        });
      case 'get_usage':
        return ok(m.request_id, {
          rate_limits: {
            five_hour: { utilization: 12, resets_at: '2026-09-28T01:20:00+00:00' },
            seven_day: { utilization: 34, resets_at: '2026-09-30T22:00:00+00:00' },
          },
        });
      case 'interrupt':
        clearTimeout(slowTimer);
        ok(m.request_id, { still_queued: [] });
        return result({ isError: true, subtype: 'error_during_execution' });
      default:
        return ok(m.request_id);
    }
  }
  if (m.type === 'user')
    onUser(typeof m.message.content === 'string' ? m.message.content : m.message.content.map((b) => b.text ?? '').join(' '));
});
rl.on('close', () => process.exit(0));
