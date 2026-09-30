//! Types persisted on disk and exchanged with the frontend.

use crate::resources::Resources;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Empty = auto-detect `claude` on PATH.
    pub claude_path: String,
    pub default_model: String,
    pub default_effort: String,
    pub default_mode: String,
    pub sound: bool,
    pub os_notifications: bool,
    /// Command used to open files, e.g. `code` (VS Code).
    pub editor_command: String,
    /// Stop idle Claude processes after N minutes (0 = never). Sessions stay resumable.
    pub idle_stop_minutes: u32,
    pub pwsh_path: String,
    pub bash_path: String,
    pub wsl_distro: String,
    /// HTTP(S) proxy URL, e.g. `http://user:pass@proxy:3128`. Empty = direct connection.
    pub proxy_url: String,
    /// Comma-separated hosts that bypass the proxy (NO_PROXY).
    pub no_proxy: String,
    /// Also export the proxy variables in integrated terminals.
    pub proxy_terminals: bool,
    /// Send "continue" by itself to an agent stopped by the usage limit, once the quota resets.
    pub auto_resume: bool,
}

impl Settings {
    /// Environment variables to inject into child processes for the configured proxy.
    pub fn proxy_env(&self) -> Vec<(String, String)> {
        let url = self.proxy_url.trim();
        if url.is_empty() {
            return Vec::new();
        }
        let mut env = Vec::new();
        for k in ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] {
            env.push((k.to_string(), url.to_string()));
        }
        let no = self.no_proxy.trim();
        if !no.is_empty() {
            env.push(("NO_PROXY".into(), no.to_string()));
            env.push(("no_proxy".into(), no.to_string()));
        }
        env
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            claude_path: String::new(),
            default_model: "sonnet".into(),
            default_effort: "medium".into(),
            default_mode: "auto".into(),
            sound: true,
            os_notifications: true,
            editor_command: "code".into(),
            idle_stop_minutes: 30,
            pwsh_path: String::new(),
            bash_path: String::new(),
            wsl_distro: String::new(),
            proxy_url: String::new(),
            no_proxy: "localhost,127.0.0.1".into(),
            proxy_terminals: false,
            auto_resume: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub color: String,
    #[serde(default)]
    pub worktree_per_agent: bool,
    #[serde(default)]
    pub created_at: i64,
    /// Commands that launch the project (dev servers, watchers…), each in its own read-only terminal.
    #[serde(default)]
    pub run_commands: Vec<RunCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RunCommand {
    pub id: String,
    pub name: String,
    pub command: String,
    /// Shell id ("pwsh", "powershell", "bash", "wsl").
    pub shell: String,
    /// Folder relative to the project's, empty for the project itself.
    pub cwd: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    #[default]
    Idle,
    Running,
    Waiting,
    Done,
    Error,
}

impl AgentStatus {
    pub fn is_active(self) -> bool {
        matches!(self, AgentStatus::Running | AgentStatus::Waiting)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub branch: String,
    pub base_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentMeta {
    pub id: String,
    pub project_id: String,
    pub name: String,
    /// True once the name was generated or chosen by the user.
    pub named: bool,
    pub model: String,
    pub effort: String,
    pub mode: String,
    pub session_id: Option<String>,
    pub cwd: String,
    pub worktree: Option<Worktree>,
    pub created_at: i64,
    pub archived: bool,
    pub status: AgentStatus,
    pub tokens: u64,
    pub cost: f64,
    pub active_ms: u64,
    /// Files edited by the agent, relative to its cwd with forward slashes.
    pub touched_files: Vec<String>,
    pub last_activity: i64,
    pub prompts: u32,
    /// Remote Control on: the session is also reachable from claude.ai / the Claude app, so the
    /// agent's process stays up (started with the app, never idle-stopped).
    pub remote_control: bool,
    /// Remote session to reattach to when the process restarts, and its claude.ai link.
    pub remote_session: Option<String>,
    pub remote_url: Option<String>,
    /// Stopped by the usage limit: when the agent is sent "continue" by itself (quota reset).
    pub resume_at: Option<i64>,
}

/// Agent as shown by the UI: persisted metadata plus live runtime fields.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentView {
    #[serde(flatten)]
    pub meta: AgentMeta,
    pub active_since: Option<i64>,
    pub alive: bool,
    /// Ids of the question/permission items awaiting an answer.
    pub pending: Vec<String>,
    pub context_tokens: u64,
    /// Size of the context window of the conversation's model (0 until a turn told it).
    pub context_window: u64,
    /// Tokens of the running turn so far (not yet in `tokens`, which the turn's end updates).
    pub live_tokens: u64,
    /// Estimated cost of the running turn so far, from list prices (not yet in `cost`).
    pub live_cost: f64,
    /// Remote Control link state reported by Claude Code ("ready", "connected"…).
    pub remote_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UiState {
    pub active_project: Option<String>,
    pub view: String,
    pub selected_agent: HashMap<String, String>,
    /// "split" (conversation | files) or "" (classic).
    pub layout: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedState {
    pub projects: Vec<Project>,
    pub agents: Vec<AgentMeta>,
    pub ui: UiState,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub is_repo: bool,
    /// "(detached)" for a detached HEAD.
    pub branch: String,
    /// The remote branch it tracks ("origin/main"), if any.
    pub upstream: Option<String>,
    /// The upstream no longer exists on the remote (deleted, e.g. once merged).
    pub upstream_gone: bool,
    /// Commits to push / to pull, against the upstream as last fetched.
    pub ahead: u32,
    pub behind: u32,
    pub has_remote: bool,
    /// When the repository was last fetched, ms since epoch.
    pub last_fetch: Option<i64>,
    pub modified: u32,
    pub added: u32,
    pub deleted: u32,
    pub total: u32,
    /// Dirty file count attributed to each agent of the project.
    pub agents: HashMap<String, u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub status: String,
    pub add: u32,
    pub del: u32,
    pub agent_id: Option<String>,
    /// Listed from `agent_id`'s worktree rather than the project's repository.
    pub in_worktree: bool,
}

/// One commit of the repository graph.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    /// Author date, Unix seconds.
    pub time: i64,
    /// Branches and tags pointing at it ("HEAD", "main", "origin/main", "tag: v1.0").
    pub refs: Vec<String>,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLog {
    pub commits: Vec<Commit>,
    /// The branch the agent works on (its worktree's, else the project's current branch).
    pub head: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RateWindow {
    /// 0-100.
    pub pct: f64,
    /// Epoch milliseconds.
    pub resets_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub five_hour: Option<RateWindow>,
    pub seven_day: Option<RateWindow>,
    pub today_cost: f64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum ConvOp {
    Append {
        item: Value,
    },
    Patch {
        id: String,
        patch: Value,
    },
    /// Text appended to the `text` field of an item (streaming).
    Delta {
        id: String,
        text: String,
    },
}

// Serialized and sent right away: the size gap between variants does not matter.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UiEvent {
    Agent {
        agent: AgentView,
    },
    #[serde(rename_all = "camelCase")]
    AgentRemoved {
        id: String,
        project_id: String,
    },
    #[serde(rename_all = "camelCase")]
    Conv {
        agent_id: String,
        ops: Vec<ConvOp>,
    },
    #[serde(rename_all = "camelCase")]
    Git {
        project_id: String,
        git: GitInfo,
    },
    Usage {
        usage: UsageSnapshot,
    },
    #[serde(rename_all = "camelCase")]
    Focus {
        project_id: String,
        agent_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    TerminalExit {
        id: String,
        code: Option<u32>,
    },
    Resources {
        resources: Resources,
    },
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..12].to_string()
}

/// Merges consecutive text deltas of the same item, keeping every other op in order.
pub fn coalesce_ops(ops: Vec<ConvOp>) -> Vec<ConvOp> {
    let mut out: Vec<ConvOp> = Vec::with_capacity(ops.len());
    for op in ops {
        if let (
            ConvOp::Delta { id, text },
            Some(ConvOp::Delta {
                id: last_id,
                text: last,
            }),
        ) = (&op, out.last_mut())
        {
            if id == last_id {
                last.push_str(text);
                continue;
            }
        }
        out.push(op);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn delta(id: &str, t: &str) -> ConvOp {
        ConvOp::Delta {
            id: id.into(),
            text: t.into(),
        }
    }

    #[test]
    fn consecutive_deltas_of_one_item_are_merged_in_order() {
        let ops = vec![
            delta("a", "Bon"),
            delta("a", "jour"),
            delta("b", "x"),
            delta("a", " !"),
            ConvOp::Patch {
                id: "a".into(),
                patch: json!({ "streaming": false }),
            },
            delta("a", "?"),
        ];
        let out = serde_json::to_value(coalesce_ops(ops)).unwrap();
        assert_eq!(
            out,
            json!([
                { "op": "delta", "id": "a", "text": "Bonjour" },
                { "op": "delta", "id": "b", "text": "x" },
                { "op": "delta", "id": "a", "text": " !" },
                { "op": "patch", "id": "a", "patch": { "streaming": false } },
                { "op": "delta", "id": "a", "text": "?" },
            ])
        );
    }

    #[test]
    fn ui_layout_is_kept_and_defaults_to_classic_for_older_state_files() {
        let ui: UiState =
            serde_json::from_value(json!({ "view": "project", "layout": "split" })).unwrap();
        assert_eq!(serde_json::to_value(&ui).unwrap()["layout"], "split");
        let old: UiState = serde_json::from_value(json!({ "view": "project" })).unwrap();
        assert_eq!(serde_json::to_value(&old).unwrap()["layout"], "");
    }
}

#[cfg(test)]
mod run_command_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn projects_saved_before_launch_commands_still_load() {
        let p: Project = serde_json::from_value(json!({
            "id": "p1", "name": "demo", "path": "C:/demo", "color": "red"
        }))
        .unwrap();
        assert!(p.run_commands.is_empty());
        let with = json!({ "id": "p1", "name": "demo", "path": "C:/demo", "color": "red",
            "runCommands": [{ "id": "c1", "name": "Front", "command": "npm run dev", "shell": "pwsh", "cwd": "web" }] });
        let p: Project = serde_json::from_value(with.clone()).unwrap();
        assert_eq!(p.run_commands[0].cwd, "web");
        assert_eq!(
            serde_json::to_value(&p).unwrap()["runCommands"],
            with["runCommands"]
        );
    }
}
