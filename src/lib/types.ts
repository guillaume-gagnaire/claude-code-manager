// Mirrors the Rust types in src-tauri/src/model.rs.

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'done' | 'error';

export interface Settings {
  claudePath: string;
  defaultModel: string;
  defaultEffort: string;
  defaultMode: string;
  sound: boolean;
  osNotifications: boolean;
  editorCommand: string;
  idleStopMinutes: number;
  pwshPath: string;
  bashPath: string;
  wslDistro: string;
  proxyUrl: string;
  noProxy: string;
  proxyTerminals: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string;
  worktreePerAgent: boolean;
  createdAt: number;
  /** Commands that launch the project, each in its own read-only terminal. */
  runCommands: RunCommand[];
}

export interface RunCommand {
  id: string;
  name: string;
  command: string;
  /** Shell id: pwsh, powershell, bash, wsl. */
  shell: string;
  /** Folder relative to the project's, empty for the project itself. */
  cwd: string;
}

export type LaunchStatus = 'running' | 'stopped' | 'done' | 'crashed';

/** A launch command's latest run (none before its first launch). */
export interface LaunchState {
  status: LaunchStatus;
  /** Terminal of the running process. */
  ptyId: string | null;
  name: string;
  /** Stopped on purpose: its exit is not a crash. */
  stopping: boolean;
  code: number | null;
  startedAt: number;
}

export interface Worktree {
  path: string;
  branch: string;
  baseBranch: string;
}

export interface Agent {
  id: string;
  projectId: string;
  name: string;
  named: boolean;
  model: string;
  effort: string;
  mode: string;
  sessionId: string | null;
  cwd: string;
  worktree: Worktree | null;
  createdAt: number;
  archived: boolean;
  status: AgentStatus;
  tokens: number;
  cost: number;
  activeMs: number;
  touchedFiles: string[];
  lastActivity: number;
  prompts: number;
  activeSince: number | null;
  alive: boolean;
  pending: string[];
  contextTokens: number;
  /** Tokens of the running turn so far; `tokens` includes them once the turn ends. */
  liveTokens: number;
  /** Estimated cost (list prices) of the running turn so far; `cost` gets the exact figure at its end. */
  liveCost: number;
  /** Remote Control: reachable from claude.ai / the Claude app (its process stays up). */
  remoteControl: boolean;
  remoteSession: string | null;
  /** The session on claude.ai. */
  remoteUrl: string | null;
  /** Link state reported by Claude Code ("ready", "connected"…), null without a live link. */
  remoteState: string | null;
}

export interface UiState {
  activeProject: string | null;
  view: string;
  selectedAgent: Record<string, string>;
  /** 'split': conversation on the left half, uncommitted files and their diff on the right. */
  layout?: '' | 'split';
}

export interface GitInfo {
  isRepo: boolean;
  branch: string;
  modified: number;
  added: number;
  deleted: number;
  total: number;
  agents: Record<string, number>;
}

export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  /** Author date, Unix seconds. */
  time: number;
  /** Branches and tags pointing at it ("HEAD", "main", "origin/main", "tag: v1.0"). */
  refs: string[];
  subject: string;
}

export interface GitLog {
  commits: Commit[];
  /** The branch the agent works on. */
  head: string | null;
}

export interface FileChange {
  path: string;
  status: 'M' | 'A' | 'D';
  add: number;
  del: number;
  agentId: string | null;
}

export interface RateWindow {
  pct: number;
  resetsAt: number | null;
}

export interface Usage {
  fiveHour: RateWindow | null;
  sevenDay: RateWindow | null;
  todayCost: number;
  updatedAt: number;
}

export interface EditorInfo {
  id: string;
  label: string;
  /** Its value for the "Éditeur" setting. */
  command: string;
}

export interface ShellInfo {
  id: string;
  label: string;
  path: string;
}

export interface TermInfo {
  id: string;
  projectId: string;
  name: string;
  shell: string;
}

export interface PatchHunk {
  oldStart: number;
  newStart: number;
  lines: string[];
}

export interface ToolResult {
  text?: string;
  isError: boolean;
  add?: number;
  del?: number;
  patch?: PatchHunk[];
  filePath?: string;
}

export interface QuestionOption {
  label: string;
  description?: string;
  preview?: string;
}

export interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

interface Base {
  id: string;
  parent?: string | null;
}

export interface UserItem extends Base {
  kind: 'user';
  text: string;
  images: number;
  /** Names of the other attached files (PDF, text); absent from older logs. */
  files?: string[];
  ts: number;
  queued: boolean;
  /** "remote": sent from claude.ai / the Claude app (Remote Control). */
  origin?: 'remote';
}
export interface TextItem extends Base {
  kind: 'text';
  text: string;
  streaming: boolean;
}
export interface ThinkingItem extends Base {
  kind: 'thinking';
  text: string;
  streaming: boolean;
}
export interface ToolItem extends Base {
  kind: 'tool';
  name: string;
  input: Record<string, any>;
  status: 'running' | 'ok' | 'error' | 'interrupted';
  result?: ToolResult;
  ts: number;
}
export interface QuestionItem extends Base {
  kind: 'question';
  toolUseId: string;
  questions: Question[];
  answers: Record<string, string> | null;
  cancelled?: boolean;
  ts: number;
}
export interface PermissionItem extends Base {
  kind: 'permission';
  toolUseId: string;
  toolName: string;
  title?: string | null;
  description?: string | null;
  input: Record<string, any>;
  reason?: string | null;
  canAlways: boolean;
  defaultNo: boolean;
  decision: 'allow' | 'always' | 'deny' | null;
  message?: string | null;
  cancelled?: boolean;
  ts: number;
}
export interface TurnItem extends Base {
  kind: 'turn';
  ts: number;
  durationMs: number | null;
  cost: number;
  tokens: number;
  isError: boolean;
  interrupted: boolean;
  error: string | null;
}
export interface NoticeItem extends Base {
  kind: 'notice';
  ts: number;
  level: 'info' | 'warn' | 'error';
  text: string;
}

export type ConvItem = UserItem | TextItem | ThinkingItem | ToolItem | QuestionItem | PermissionItem | TurnItem | NoticeItem;

export type ConvOp =
  | { op: 'append'; item: ConvItem }
  | { op: 'patch'; id: string; patch: Record<string, unknown> }
  | { op: 'delta'; id: string; text: string };

export type UiEvent =
  | { type: 'agent'; agent: Agent }
  | { type: 'agentRemoved'; id: string; projectId: string }
  | { type: 'conv'; agentId: string; ops: ConvOp[] }
  | { type: 'git'; projectId: string; git: GitInfo }
  | { type: 'usage'; usage: Usage }
  | { type: 'focus'; projectId: string; agentId: string | null }
  | { type: 'terminalExit'; id: string; code: number | null };

export interface InitialState {
  projects: Project[];
  agents: Agent[];
  ui: UiState;
  settings: Settings;
  usage: Usage;
  git: Record<string, GitInfo>;
  shells: ShellInfo[];
  editors: EditorInfo[];
  terminals: TermInfo[];
  claudeFound: boolean;
  version: string;
}

export interface Bucket {
  label: string;
  start: number;
  input: number;
  cache: number;
  output: number;
  cost: number;
  prompts: number;
}

export interface Share {
  key: string;
  tokens: number;
  cost: number;
}

export interface StatsView {
  range: string;
  buckets: Bucket[];
  tokens: number;
  tokensPrev: number;
  cost: number;
  costAll: number;
  firstTs: number | null;
  prompts: number;
  byProject: Share[];
  byModel: Share[];
}

export interface FolderInfo {
  exists: boolean;
  isRepo: boolean;
  branch: string;
  dirty: number;
  name: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint?: string;
}

/** A file attached to a message: `data` is base64 for images and PDFs, the text itself for
 * text files (`text/plain`). */
export interface Attachment {
  name: string;
  mediaType: string;
  data: string;
}
