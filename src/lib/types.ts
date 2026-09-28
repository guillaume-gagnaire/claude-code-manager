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
  ts: number;
  queued: boolean;
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

export interface ImageInput {
  mediaType: string;
  data: string;
}
