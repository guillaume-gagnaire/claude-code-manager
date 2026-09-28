import { Channel, invoke } from '@tauri-apps/api/core';
import type {
  Agent,
  ConvItem,
  FileChange,
  FolderInfo,
  GitLog,
  ImageInput,
  InitialState,
  Project,
  Settings,
  ShellInfo,
  SlashCommand,
  StatsView,
  TermInfo,
  UiEvent,
  UiState,
} from './types';

export const api = {
  subscribe: (onEvent: (e: UiEvent) => void) => {
    const channel = new Channel<UiEvent>();
    channel.onmessage = onEvent;
    return invoke<InitialState>('subscribe', { channel });
  },
  setUi: (ui: UiState) => invoke<void>('set_ui', { ui }),
  saveSettings: (settings: Settings) => invoke<ShellInfo[]>('save_settings', { settings }),
  inspectFolder: (path: string) => invoke<FolderInfo>('inspect_folder', { path }),
  createProject: (a: { path: string; name: string; color: string; worktreePerAgent: boolean; firstAgent: string | null }) =>
    invoke<Project>('create_project', a),
  updateProject: (project: Project) => invoke<void>('update_project', { project }),
  reorderProjects: (ids: string[]) => invoke<void>('reorder_projects', { ids }),
  removeProject: (id: string) => invoke<void>('remove_project', { id }),
  createAgent: (projectId: string, model: string | null = null) => invoke<Agent>('create_agent', { projectId, model }),
  warmAgent: (id: string) => invoke<void>('warm_agent', { id }),
  getConversation: (id: string) => invoke<ConvItem[]>('get_conversation', { id }),
  sendMessage: (id: string, text: string, images: ImageInput[] = []) => invoke<void>('send_message', { id, text, images }),
  interrupt: (id: string) => invoke<void>('interrupt', { id }),
  answerQuestion: (id: string, requestId: string, answers: Record<string, string>) =>
    invoke<void>('answer_question', { id, requestId, answers }),
  answerPermission: (id: string, requestId: string, decision: 'allow' | 'always' | 'deny', message: string | null = null) =>
    invoke<void>('answer_permission', { id, requestId, decision, message }),
  setAgentOptions: (id: string, o: { model?: string; effort?: string; mode?: string }) =>
    invoke<void>('set_agent_options', { id, model: o.model ?? null, effort: o.effort ?? null, mode: o.mode ?? null }),
  renameAgent: (id: string, name: string) => invoke<void>('rename_agent', { id, name }),
  archiveAgent: (id: string, archived: boolean) => invoke<void>('archive_agent', { id, archived }),
  deleteAgent: (id: string, removeWorktree: boolean) => invoke<string | null>('delete_agent', { id, removeWorktree }),
  mergeAgent: (id: string, squash: boolean) => invoke<string>('merge_agent', { id, squash }),
  getCommands: (id: string) => invoke<SlashCommand[]>('get_commands', { id }),
  fileSuggestions: (id: string, query: string) => invoke<string[]>('file_suggestions', { id, query }),
  gitFiles: (projectId: string, agentId: string | null) => invoke<FileChange[]>('git_files', { projectId, agentId }),
  gitDiff: (projectId: string, agentId: string | null, paths: string[]) => invoke<string>('git_diff', { projectId, agentId, paths }),
  gitLog: (projectId: string, agentId: string | null) => invoke<GitLog>('git_log', { projectId, agentId }),
  gitShow: (projectId: string, hash: string) => invoke<string>('git_show', { projectId, hash }),
  setRemoteControl: (id: string, enabled: boolean) => invoke<void>('set_remote_control', { id, enabled }),
  stats: (range: string) => invoke<StatsView>('stats', { range }),
  refreshUsage: () => invoke<void>('refresh_usage'),
  openInEditor: (path: string) => invoke<void>('open_in_editor', { path }),
  termSpawn: (a: { projectId: string; shell: string; name: string; cols: number; rows: number }, onData: (d: ArrayBuffer) => void) => {
    const output = new Channel<ArrayBuffer>();
    output.onmessage = onData;
    return invoke<TermInfo>('term_spawn', { ...a, output });
  },
  runStart: (
    a: { projectId: string; commandId: string; cols: number; rows: number; cursorRow: number },
    onData: (d: ArrayBuffer) => void,
  ) => {
    const output = new Channel<ArrayBuffer>();
    output.onmessage = onData;
    return invoke<TermInfo>('run_start', { ...a, output });
  },
  termWrite: (id: string, data: string) => invoke<void>('term_write', { id, data }),
  termResize: (id: string, cols: number, rows: number) => invoke<void>('term_resize', { id, cols, rows }),
  termKill: (id: string) => invoke<void>('term_kill', { id }),
  playChime: () => invoke<void>('play_chime'),
  quit: () => invoke<void>('quit_app'),
};
