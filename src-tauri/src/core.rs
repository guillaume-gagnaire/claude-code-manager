//! Application core: projects, agents and their Claude processes, git, usage, persistence.

use crate::agent::{AgentHandle, AgentRt, Effects, NotifyKind};
use crate::claude::{self, ClaudeProcess, SpawnOpts};
use crate::git::{self, GitService};
use crate::hub::Hub;
use crate::model::*;
use crate::notify;
use crate::paths::{self, DataDir};
use crate::pty::PtyManager;
use crate::stats::Stats;
use crate::usage;
use anyhow::{anyhow, bail, Context, Result};
use parking_lot::{Mutex, RwLock};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Runtime, Wry};
use tokio::sync::mpsc;

/// The Claude process exited while starting; the exit handler recorded why in the conversation.
#[derive(Debug)]
pub struct StartupFailure;

impl std::fmt::Display for StartupFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Claude Code n'a pas pu démarrer : voir le détail dans la conversation.")
    }
}

impl std::error::Error for StartupFailure {}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInput {
    pub media_type: String,
    pub data: String,
}

pub struct Core<R: Runtime = Wry> {
    pub app: AppHandle<R>,
    pub data: DataDir,
    pub hub: Hub,
    pub settings: RwLock<Settings>,
    pub projects: RwLock<Vec<Project>>,
    pub ui: RwLock<UiState>,
    pub agents: RwLock<HashMap<String, AgentHandle>>,
    pub stats: Stats,
    pub usage: Mutex<UsageSnapshot>,
    pub git: GitService,
    pub git_cache: RwLock<HashMap<String, GitInfo>>,
    pub pty: PtyManager,
    spawn_locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    /// Serializes agent creation so that concurrent creations get distinct names.
    create_lock: tokio::sync::Mutex<()>,
    conv_buffer: Mutex<HashMap<String, Vec<ConvOp>>>,
    conv_flush: tokio::sync::Notify,
    last_oauth_call: Mutex<Option<i64>>,
    git_inflight: Mutex<std::collections::HashSet<String>>,
    toplevels: Mutex<HashMap<String, Option<String>>>,
    dirty: AtomicBool,
    waiting: AtomicUsize,
    pub quitting: AtomicBool,
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let text = std::fs::read_to_string(path).ok()?;
    match serde_json::from_str(&text) {
        Ok(v) => Some(v),
        Err(e) => {
            log::error!("invalid {}: {e}", path.display());
            let _ = std::fs::copy(path, path.with_extension("broken.json"));
            None
        }
    }
}

const CLAUDE_BASE_ARGS: &[&str] = &[
    "--output-format",
    "stream-json",
    "--verbose",
    "--input-format",
    "stream-json",
    "--permission-prompt-tool",
    "stdio",
    "--include-partial-messages",
    "--thinking-display",
    "summarized",
    "--allow-dangerously-skip-permissions",
];

pub fn supports_effort(model: &str) -> bool {
    !model.to_lowercase().contains("haiku")
}

pub(crate) fn claude_args(m: &AgentMeta) -> Vec<String> {
    let mut a: Vec<String> = CLAUDE_BASE_ARGS.iter().map(|s| s.to_string()).collect();
    a.extend(["--model".into(), m.model.clone()]);
    if supports_effort(&m.model) {
        a.extend(["--effort".into(), m.effort.clone()]);
    }
    a.extend(["--permission-mode".into(), m.mode.clone()]);
    if let Some(s) = &m.session_id {
        a.push(format!("--resume={s}"));
    }
    a
}

/// Kebab-case ASCII slug from free text (accents folded).
pub fn slugify(s: &str) -> String {
    let folded: String = s
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'à' | 'á' | 'â' | 'ä' | 'ã' => 'a',
            'ç' => 'c',
            'è' | 'é' | 'ê' | 'ë' => 'e',
            'ì' | 'í' | 'î' | 'ï' => 'i',
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' => 'o',
            'ù' | 'ú' | 'û' | 'ü' => 'u',
            'ÿ' => 'y',
            'ñ' => 'n',
            c if c.is_ascii_alphanumeric() => c,
            _ => '-',
        })
        .collect();
    let mut out = String::new();
    for part in folded.split('-').filter(|p| !p.is_empty()) {
        if out.len() + part.len() + 1 > 40 {
            break;
        }
        if !out.is_empty() {
            out.push('-');
        }
        out.push_str(part);
    }
    out
}

fn sub_prefix(root: &str, sub: &str) -> String {
    let norm = |s: &str| s.replace('\\', "/").trim_end_matches('/').to_lowercase();
    if norm(root) == norm(sub) {
        String::new()
    } else {
        let rel = paths::relative_slash(root, sub);
        if rel.contains(':') {
            String::new()
        } else {
            format!("{rel}/")
        }
    }
}

impl<R: Runtime> Core<R> {
    pub fn load(app: AppHandle<R>, data: DataDir) -> (Arc<Self>, mpsc::UnboundedReceiver<String>) {
        if let Err(e) = data.ensure() {
            log::error!("cannot create data dir: {e}");
        }
        let settings: Settings = read_json(&data.settings_file()).unwrap_or_default();
        let state: PersistedState = read_json(&data.state_file()).unwrap_or_default();
        let conv_dir = data.conversations();
        let agents = state
            .agents
            .into_iter()
            .map(|m| {
                (
                    m.id.clone(),
                    Arc::new(Mutex::new(AgentRt::new(m, &conv_dir))),
                )
            })
            .collect();
        let (git, rx) = GitService::new();
        let core = Arc::new(Self {
            stats: Stats::open(&data.stats_db()),
            app,
            data,
            hub: Hub::default(),
            settings: RwLock::new(settings),
            projects: RwLock::new(state.projects),
            ui: RwLock::new(state.ui),
            agents: RwLock::new(agents),
            usage: Mutex::new(UsageSnapshot::default()),
            git,
            git_cache: RwLock::default(),
            pty: PtyManager::default(),
            spawn_locks: Mutex::default(),
            create_lock: tokio::sync::Mutex::new(()),
            conv_buffer: Mutex::default(),
            conv_flush: tokio::sync::Notify::new(),
            last_oauth_call: Mutex::new(None),
            git_inflight: Mutex::default(),
            toplevels: Mutex::default(),
            dirty: AtomicBool::new(false),
            waiting: AtomicUsize::new(usize::MAX),
            quitting: AtomicBool::new(false),
        });
        core.usage.lock().today_cost = core.stats.today_cost();
        (core, rx)
    }

    pub fn start(self: &Arc<Self>, git_rx: mpsc::UnboundedReceiver<String>) {
        for p in self.projects.read().iter() {
            self.git.watch(&p.id, &p.path);
        }
        let c = self.clone();
        tauri::async_runtime::spawn(async move { c.git_loop(git_rx).await });
        let c = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                c.conv_flush.notified().await;
                tokio::time::sleep(Duration::from_millis(16)).await;
                c.flush_conv();
            }
        });
        let c = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(400)).await;
                if c.dirty.swap(false, Ordering::AcqRel) {
                    c.save_now();
                }
            }
        });
        let c = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(2)).await;
            loop {
                c.refresh_usage().await;
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        });
        let c = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(60)).await;
                c.stop_idle_processes();
            }
        });
        self.update_tray();
    }

    // ---------- persistence ----------

    fn snapshot(&self) -> PersistedState {
        let mut agents: Vec<AgentMeta> = self
            .agents
            .read()
            .values()
            .map(|h| h.lock().meta.clone())
            .collect();
        agents.sort_by_key(|m| m.created_at);
        // One lock at a time (each guard ends with its statement).
        let projects = self.projects.read().clone();
        let ui = self.ui.read().clone();
        PersistedState {
            projects,
            agents,
            ui,
        }
    }

    pub fn save_now(&self) {
        let state = self.snapshot();
        match serde_json::to_vec_pretty(&state) {
            Ok(bytes) => {
                if let Err(e) = paths::write_atomic(&self.data.state_file(), &bytes) {
                    log::error!("cannot save state: {e}");
                }
            }
            Err(e) => log::error!("cannot serialize state: {e}"),
        }
    }

    pub fn request_save(&self) {
        self.dirty.store(true, Ordering::Release);
    }

    pub fn save_settings(&self, s: Settings) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(&s)?;
        paths::write_atomic(&self.data.settings_file(), &bytes)?;
        *self.settings.write() = s;
        Ok(())
    }

    // ---------- lookups ----------

    pub fn agent(&self, id: &str) -> Result<AgentHandle> {
        self.agents
            .read()
            .get(id)
            .cloned()
            .ok_or_else(|| anyhow!("agent introuvable"))
    }

    pub fn project(&self, id: &str) -> Result<Project> {
        self.projects
            .read()
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or_else(|| anyhow!("projet introuvable"))
    }

    pub fn agent_views(&self) -> Vec<AgentView> {
        let mut v: Vec<AgentView> = self
            .agents
            .read()
            .values()
            .map(|h| h.lock().view())
            .collect();
        v.sort_by_key(|a| a.meta.created_at);
        v
    }

    fn project_agents(&self, project_id: &str) -> Vec<AgentHandle> {
        self.agents
            .read()
            .values()
            .filter(|h| h.lock().meta.project_id == project_id)
            .cloned()
            .collect()
    }

    fn emit_agent(&self, h: &AgentHandle) {
        let view = h.lock().view();
        self.hub.emit(UiEvent::Agent { agent: view });
        self.update_tray();
    }

    fn spawn_lock(&self, id: &str) -> Arc<tokio::sync::Mutex<()>> {
        self.spawn_locks
            .lock()
            .entry(id.to_string())
            .or_default()
            .clone()
    }

    async fn toplevel(&self, path: &str) -> Option<String> {
        if let Some(t) = self.toplevels.lock().get(path) {
            return t.clone();
        }
        let t = git::toplevel(path).await;
        self.toplevels.lock().insert(path.to_string(), t.clone());
        t
    }

    // ---------- effects of agent activity ----------

    /// Streaming deltas are buffered and sent at most every 16 ms (merged); any other op first
    /// flushes the agent's buffered deltas so the UI sees every op in order.
    fn emit_conv(&self, agent_id: &str, ops: Vec<ConvOp>) {
        let only_deltas = ops.iter().all(|o| matches!(o, ConvOp::Delta { .. }));
        let mut buf = self.conv_buffer.lock();
        let was_empty = buf.is_empty();
        let pending = buf.entry(agent_id.to_string()).or_default();
        pending.extend(ops);
        if only_deltas {
            if was_empty {
                self.conv_flush.notify_one();
            }
            return;
        }
        let ops = coalesce_ops(std::mem::take(pending));
        buf.remove(agent_id);
        drop(buf);
        self.hub.emit(UiEvent::Conv {
            agent_id: agent_id.to_string(),
            ops,
        });
    }

    /// Sends every buffered delta now.
    pub fn flush_conv(&self) {
        let drained: Vec<(String, Vec<ConvOp>)> = self.conv_buffer.lock().drain().collect();
        for (agent_id, ops) in drained {
            self.hub.emit(UiEvent::Conv {
                agent_id,
                ops: coalesce_ops(ops),
            });
        }
    }

    fn apply(
        self: &Arc<Self>,
        id: &str,
        project_id: &str,
        name: &str,
        fx: Effects,
        view: Option<AgentView>,
    ) {
        if !fx.ops.is_empty() {
            self.emit_conv(id, fx.ops);
        }
        let changed = view.is_some();
        if let Some(v) = view {
            self.hub.emit(UiEvent::Agent { agent: v });
        }
        if !fx.turns.is_empty() {
            self.stats.record_turns(id, project_id, &fx.turns);
            let mut u = self.usage.lock();
            u.today_cost = self.stats.today_cost();
            self.hub.emit(UiEvent::Usage { usage: u.clone() });
        }
        if let Some((five, week)) = fx.rate {
            let mut u = self.usage.lock();
            if five.is_some() {
                u.five_hour = five;
            }
            if week.is_some() {
                u.seven_day = week;
            }
            u.updated_at = now_ms();
            self.hub.emit(UiEvent::Usage { usage: u.clone() });
        }
        if fx.files_changed {
            self.git.refresh(project_id);
        }
        if fx.save {
            self.request_save();
        }
        if changed {
            self.update_tray();
        }
        if let Some(kind) = fx.notify {
            self.notify_agent(kind, project_id, id, name);
        }
    }

    fn on_frame(self: &Arc<Self>, h: &AgentHandle, gen: u64, frame: Value) {
        let mut fx = Effects::default();
        let (id, pid, name, view) = {
            let mut rt = h.lock();
            if rt.gen != gen {
                return;
            }
            rt.handle_frame(&frame, &mut fx);
            let view = fx.agent_changed.then(|| rt.view());
            (
                rt.meta.id.clone(),
                rt.meta.project_id.clone(),
                rt.meta.name.clone(),
                view,
            )
        };
        self.apply(&id, &pid, &name, fx, view);
    }

    fn on_exit(self: &Arc<Self>, h: &AgentHandle, gen: u64, code: Option<i32>, stderr: String) {
        let mut fx = Effects::default();
        let (id, pid, name, view) = {
            let mut rt = h.lock();
            rt.on_exit(gen, code, &stderr, &mut fx);
            (
                rt.meta.id.clone(),
                rt.meta.project_id.clone(),
                rt.meta.name.clone(),
                rt.view(),
            )
        };
        if self.quitting.load(Ordering::Acquire) {
            return;
        }
        self.apply(&id, &pid, &name, fx, Some(view));
    }

    fn notify_agent(
        self: &Arc<Self>,
        kind: NotifyKind,
        project_id: &str,
        agent_id: &str,
        agent_name: &str,
    ) {
        let settings = self.settings.read().clone();
        if settings.sound {
            notify::play_chime();
        }
        if notify::window_attended(&self.app) {
            return;
        }
        notify::flash(&self.app);
        if settings.os_notifications {
            let project = self.project(project_id).map(|p| p.name).unwrap_or_default();
            let body = match kind {
                NotifyKind::Question => "Claude attend ta réponse",
                NotifyKind::Done => "Tâche terminée",
                NotifyKind::Error => "Erreur : l'agent s'est arrêté",
            };
            let (app, pid, aid) = (
                self.app.clone(),
                project_id.to_string(),
                agent_id.to_string(),
            );
            let hub_core = Arc::downgrade(self);
            notify::toast(
                &self.app,
                &format!("{project} · {agent_name}"),
                body,
                move || {
                    notify::show_main(&app);
                    if let Some(c) = hub_core.upgrade() {
                        c.hub.emit(UiEvent::Focus {
                            project_id: pid.clone(),
                            agent_id: Some(aid.clone()),
                        });
                    }
                },
            );
        }
    }

    pub fn update_tray(&self) {
        let n = self
            .agents
            .read()
            .values()
            .filter(|h| h.lock().meta.status == AgentStatus::Waiting)
            .count();
        if self.waiting.swap(n, Ordering::AcqRel) == n {
            return;
        }
        if let Some(tray) = self.app.tray_by_id("main") {
            let _ = tray.set_icon(notify::tray_icon(&self.app, n));
            let tip = match n {
                0 => "Claude Code Manager".to_string(),
                1 => "Claude Code Manager — 1 agent en attente".to_string(),
                n => format!("Claude Code Manager — {n} agents en attente"),
            };
            let _ = tray.set_tooltip(Some(tip));
        }
    }

    // ---------- claude processes ----------

    /// Returns the agent's live process, starting it (with --resume) when needed.
    pub async fn ensure_process(self: &Arc<Self>, id: &str) -> Result<Arc<ClaudeProcess>> {
        let resumed = self.agent(id)?.lock().meta.session_id.is_some();
        match self.start_process(id).await {
            // The session could not be resumed: its exit handler dropped the session id, so a
            // second start opens a new session instead.
            Err(e)
                if resumed
                    && e.is::<StartupFailure>()
                    && self.agent(id)?.lock().meta.session_id.is_none() =>
            {
                self.start_process(id).await
            }
            other => other,
        }
    }

    async fn start_process(self: &Arc<Self>, id: &str) -> Result<Arc<ClaudeProcess>> {
        let h = self.agent(id)?;
        let lock = self.spawn_lock(id);
        let _guard = lock.lock().await;
        if let Some(p) = h.lock().proc.clone() {
            if p.is_alive() {
                return Ok(p);
            }
        }
        let settings = self.settings.read().clone();
        let program = claude::resolve_binary(&settings.claude_path).ok_or_else(|| {
            anyhow!("Claude Code introuvable. Installe-le ou indique son chemin dans les réglages.")
        })?;
        let (opts, gen) = {
            let mut rt = h.lock();
            rt.gen += 1;
            let opts = SpawnOpts {
                program,
                cwd: rt.meta.cwd.clone(),
                args: claude_args(&rt.meta),
                env: settings.proxy_env(),
            };
            (opts, rt.gen)
        };
        if !Path::new(&opts.cwd).is_dir() {
            bail!("Le dossier {} n'existe plus", opts.cwd);
        }
        let (w1, w2) = (Arc::downgrade(self), Arc::downgrade(self));
        let (h1, h2) = (h.clone(), h.clone());
        let proc = ClaudeProcess::spawn(
            opts,
            move |frame| {
                if let Some(c) = w1.upgrade() {
                    c.on_frame(&h1, gen, frame);
                }
            },
            move |code, stderr| {
                if let Some(c) = w2.upgrade() {
                    c.on_exit(&h2, gen, code, stderr);
                }
            },
        )?;
        h.lock().attach(proc.clone());
        self.emit_agent(&h);
        match proc
            .control(json!({ "subtype": "initialize" }), Duration::from_secs(90))
            .await
        {
            Ok(resp) => {
                h.lock().commands = resp["commands"].as_array().cloned().unwrap_or_default()
            }
            Err(_) if !proc.is_alive() => return Err(StartupFailure.into()),
            Err(e) => log::warn!("initialize failed: {e}"),
        }
        Ok(proc)
    }

    /// Starts the agent's process in the background so the first message answers fast.
    pub fn warm(self: &Arc<Self>, id: &str) {
        let Ok(h) = self.agent(id) else { return };
        {
            let rt = h.lock();
            if rt.proc.is_some() || rt.meta.archived || rt.meta.status == AgentStatus::Error {
                return;
            }
        }
        let (c, id) = (self.clone(), id.to_string());
        tauri::async_runtime::spawn(async move {
            if let Err(e) = c.ensure_process(&id).await {
                log::warn!("warm-up failed: {e:#}");
            }
        });
    }

    /// Stops the processes of agents idle for longer than the configured delay. The session
    /// and the conversation stay: the next action on the agent resumes it (--resume).
    pub(crate) fn stop_idle_processes(&self) {
        let minutes = self.settings.read().idle_stop_minutes;
        if minutes == 0 {
            return;
        }
        let limit = now_ms() - minutes as i64 * 60_000;
        let agents: Vec<AgentHandle> = self.agents.read().values().cloned().collect();
        for h in agents {
            let stopped = {
                let mut rt = h.lock();
                let idle = rt.proc.is_some()
                    && !rt.meta.status.is_active()
                    && rt.meta.last_activity < limit;
                if idle {
                    rt.detach()
                } else {
                    None
                }
            };
            if let Some(p) = stopped {
                p.close_input();
                self.emit_agent(&h);
            }
        }
    }

    pub fn shutdown(&self) {
        self.quitting.store(true, Ordering::Release);
        for h in self.agents.read().values() {
            let mut rt = h.lock();
            if let Some(p) = rt.proc.take() {
                p.close_input();
                p.kill();
            }
        }
        self.pty.kill_all();
        self.save_now();
    }

    pub async fn send_message(
        self: &Arc<Self>,
        id: &str,
        text: String,
        images: Vec<ImageInput>,
    ) -> Result<()> {
        // Two attempts: the process may die between being started and receiving the message.
        for attempt in 0..2 {
            let proc = self.ensure_process(id).await?;
            if self.deliver(id, &proc, &text, &images)? {
                return Ok(());
            }
            log::warn!("message not delivered (attempt {attempt}): the process exited");
        }
        bail!("Claude Code s'est arrêté pendant l'envoi du message : voir le détail dans la conversation.")
    }

    /// Sends the message to `proc` if it is still the agent's live process, then records it.
    fn deliver(
        self: &Arc<Self>,
        id: &str,
        proc: &Arc<ClaudeProcess>,
        text: &str,
        images: &[ImageInput],
    ) -> Result<bool> {
        let h = self.agent(id)?;
        let mut fx = Effects::default();
        let (pid, name, view, first) = {
            let mut rt = h.lock();
            if !rt.proc.as_ref().is_some_and(|p| Arc::ptr_eq(p, proc)) || !proc.is_alive() {
                return Ok(false);
            }
            let uid = uuid::Uuid::new_v4().to_string();
            let content = if images.is_empty() {
                Value::String(text.to_string())
            } else {
                let mut blocks: Vec<Value> = images
                    .iter()
                    .map(|i| json!({ "type": "image", "source": { "type": "base64", "media_type": i.media_type, "data": i.data } }))
                    .collect();
                if !text.is_empty() {
                    blocks.push(json!({ "type": "text", "text": text }));
                }
                Value::Array(blocks)
            };
            let frame = json!({ "type": "user", "message": { "role": "user", "content": content }, "parent_tool_use_id": null, "uuid": uid });
            if proc.send(&frame).is_err() {
                return Ok(false);
            }
            rt.push_user(&uid, text, images.len() as u32, &mut fx);
            let first = !rt.meta.named && rt.meta.prompts == 1;
            (
                rt.meta.project_id.clone(),
                rt.meta.name.clone(),
                rt.view(),
                first,
            )
        };
        self.stats.record_prompt(id, &pid);
        self.apply(id, &pid, &name, fx, Some(view));
        if first && !text.trim().is_empty() && !text.trim_start().starts_with('/') {
            let (c, id, text) = (self.clone(), id.to_string(), text.to_string());
            tauri::async_runtime::spawn(async move { c.auto_name(&id, &text).await });
        }
        Ok(true)
    }

    pub async fn interrupt(self: &Arc<Self>, id: &str) -> Result<()> {
        let h = self.agent(id)?;
        let proc = {
            let mut rt = h.lock();
            // Only a running turn can be interrupted; a stale flag would hide the next turn's end.
            let active = rt.meta.status.is_active();
            rt.interrupted = active;
            rt.proc.clone().filter(|_| active)
        };
        if let Some(p) = proc {
            if let Err(e) = p
                .control(json!({ "subtype": "interrupt" }), Duration::from_secs(15))
                .await
            {
                h.lock().interrupted = false;
                return Err(e);
            }
        }
        Ok(())
    }

    fn with_agent<T>(
        self: &Arc<Self>,
        id: &str,
        f: impl FnOnce(&mut AgentRt, &mut Effects) -> Result<T>,
    ) -> Result<T> {
        let h = self.agent(id)?;
        let mut fx = Effects::default();
        let (out, pid, name, view) = {
            let mut rt = h.lock();
            let out = f(&mut rt, &mut fx)?;
            (
                out,
                rt.meta.project_id.clone(),
                rt.meta.name.clone(),
                rt.view(),
            )
        };
        self.apply(id, &pid, &name, fx, Some(view));
        Ok(out)
    }

    pub fn answer_question(
        self: &Arc<Self>,
        id: &str,
        request_id: &str,
        answers: Value,
    ) -> Result<()> {
        self.with_agent(id, |rt, fx| rt.answer_question(request_id, answers, fx))
    }

    pub fn answer_permission(
        self: &Arc<Self>,
        id: &str,
        request_id: &str,
        decision: &str,
        message: Option<String>,
    ) -> Result<()> {
        self.with_agent(id, |rt, fx| {
            rt.answer_permission(request_id, decision, message, fx)
        })
    }

    pub async fn set_agent_options(
        self: &Arc<Self>,
        id: &str,
        model: Option<String>,
        effort: Option<String>,
        mode: Option<String>,
    ) -> Result<()> {
        let h = self.agent(id)?;
        let proc = {
            let mut rt = h.lock();
            if let Some(m) = &model {
                rt.meta.model = m.clone();
            }
            if let Some(e) = &effort {
                rt.meta.effort = e.clone();
            }
            if let Some(m) = &mode {
                rt.meta.mode = m.clone();
            }
            rt.proc.clone()
        };
        self.emit_agent(&h);
        self.request_save();
        if let Some(p) = proc {
            let t = Duration::from_secs(15);
            if let Some(m) = model {
                p.control(json!({ "subtype": "set_model", "model": m }), t)
                    .await?;
            }
            let current_model = h.lock().meta.model.clone();
            if let Some(e) = effort.filter(|_| supports_effort(&current_model)) {
                p.control(
                    json!({ "subtype": "apply_flag_settings", "settings": { "effortLevel": e } }),
                    t,
                )
                .await?;
            }
            if let Some(m) = mode {
                p.control(json!({ "subtype": "set_permission_mode", "mode": m }), t)
                    .await?;
            }
        }
        Ok(())
    }

    // ---------- agents lifecycle ----------

    pub async fn create_agent(
        self: &Arc<Self>,
        project_id: &str,
        model: Option<String>,
    ) -> Result<AgentView> {
        let _creating = self.create_lock.lock().await;
        let project = self.project(project_id)?;
        let settings = self.settings.read().clone();
        let existing: Vec<String> = self
            .project_agents(project_id)
            .iter()
            .map(|h| h.lock().meta.name.clone())
            .collect();
        let mut n = existing.len() + 1;
        while existing.iter().any(|e| *e == format!("agent-{n}")) {
            n += 1;
        }
        let name = format!("agent-{n}");
        let mut meta = AgentMeta {
            id: new_id(),
            project_id: project_id.to_string(),
            name: name.clone(),
            model: model.unwrap_or(settings.default_model.clone()),
            effort: settings.default_effort.clone(),
            mode: settings.default_mode.clone(),
            cwd: project.path.clone(),
            created_at: now_ms(),
            last_activity: now_ms(),
            ..Default::default()
        };
        let mut warning = None;
        if project.worktree_per_agent {
            match git::worktree_add(&project.path, &name).await {
                Ok((path, branch, base)) => {
                    meta.cwd = path.clone();
                    meta.worktree = Some(Worktree {
                        path,
                        branch,
                        base_branch: base,
                    });
                }
                Err(e) => {
                    warning = Some(format!(
                        "Worktree non créé, l'agent travaille dans le dossier du projet : {e}"
                    ))
                }
            }
        }
        let id = meta.id.clone();
        let h = Arc::new(Mutex::new(AgentRt::new(meta, &self.data.conversations())));
        if let Some(w) = warning {
            let mut fx = Effects::default();
            h.lock().notice("warn", w, &mut fx);
        }
        self.agents.write().insert(id.clone(), h.clone());
        self.ui
            .write()
            .selected_agent
            .insert(project_id.to_string(), id.clone());
        self.request_save();
        self.emit_agent(&h);
        self.git.refresh(project_id);
        self.warm(&id);
        let view = h.lock().view();
        Ok(view)
    }

    async fn auto_name(self: &Arc<Self>, id: &str, prompt: &str) {
        match self.generate_name(prompt).await {
            Ok(slug) if !slug.is_empty() => {
                if let Err(e) = self.apply_generated_name(id, &slug).await {
                    log::warn!("auto-naming failed: {e:#}");
                }
            }
            Ok(_) => {}
            Err(e) => log::warn!("auto-naming failed: {e:#}"),
        }
    }

    async fn generate_name(&self, prompt: &str) -> Result<String> {
        use tokio::io::AsyncWriteExt;
        let settings = self.settings.read().clone();
        let program =
            claude::resolve_binary(&settings.claude_path).context("claude introuvable")?;
        let mut cmd = tokio::process::Command::new(program);
        cmd.args([
            "-p",
            "--model",
            "haiku",
            "--output-format",
            "json",
            "--no-session-persistence",
            "--tools",
            "",
            "--setting-sources",
            "",
            "--system-prompt",
            "Tu nommes des tâches de développement. Réponds UNIQUEMENT par un slug kebab-case de 2 ou 3 mots \
             (minuscules ASCII, sans accents) qui résume la tâche, par exemple refacto-auth ou tests-e2e. Aucun autre texte.",
        ])
        .current_dir(std::env::temp_dir())
        .envs(settings.proxy_env())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
        #[cfg(windows)]
        cmd.creation_flags(claude::CREATE_NO_WINDOW);
        let mut child = cmd.spawn()?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(claude::truncate(prompt, 2000).as_bytes())
                .await?;
        }
        let out = tokio::time::timeout(Duration::from_secs(90), child.wait_with_output()).await??;
        let v: Value = serde_json::from_slice(&out.stdout)?;
        let raw = v["result"]
            .as_str()
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        Ok(slugify(&raw))
    }

    async fn apply_generated_name(self: &Arc<Self>, id: &str, slug: &str) -> Result<()> {
        let h = self.agent(id)?;
        let project_id = h.lock().meta.project_id.clone();
        let taken: Vec<String> = self
            .project_agents(&project_id)
            .iter()
            .filter(|a| a.lock().meta.id != id)
            .map(|a| a.lock().meta.name.clone())
            .collect();
        let mut name = slug.to_string();
        let mut n = 2;
        while taken.contains(&name) {
            name = format!("{slug}-{n}");
            n += 1;
        }
        let (worktree, proc) = {
            let mut rt = h.lock();
            if rt.meta.named {
                return Ok(());
            }
            rt.meta.name = name.clone();
            rt.meta.named = true;
            (rt.meta.worktree.clone(), rt.proc.clone())
        };
        self.emit_agent(&h);
        self.request_save();
        if let Some(wt) = worktree {
            let project = self.project(&project_id)?;
            let branch = format!("ccm/{name}");
            if !git::branch_exists(&project.path, &branch).await
                && git::rename_current_branch(&wt.path, &branch).await.is_ok()
            {
                if let Some(w) = h.lock().meta.worktree.as_mut() {
                    w.branch = branch;
                }
                self.request_save();
            }
        }
        if let Some(p) = proc {
            let _ = p
                .control(
                    json!({ "subtype": "rename_session", "title": name, "source": "host" }),
                    Duration::from_secs(10),
                )
                .await;
        }
        Ok(())
    }

    pub async fn rename_agent(self: &Arc<Self>, id: &str, name: &str) -> Result<()> {
        let name = name.trim();
        if name.is_empty() {
            bail!("nom vide");
        }
        let h = self.agent(id)?;
        let proc = {
            let mut rt = h.lock();
            rt.meta.name = name.to_string();
            rt.meta.named = true;
            rt.proc.clone()
        };
        self.emit_agent(&h);
        self.request_save();
        if let Some(p) = proc {
            let _ = p
                .control(
                    json!({ "subtype": "rename_session", "title": name, "source": "host" }),
                    Duration::from_secs(10),
                )
                .await;
        }
        Ok(())
    }

    pub async fn archive_agent(self: &Arc<Self>, id: &str, archived: bool) -> Result<()> {
        if archived {
            // Stop the current turn first: closing stdin alone lets it run to completion.
            let running = {
                let h = self.agent(id)?;
                let rt = h.lock();
                rt.proc.clone().filter(|_| rt.meta.status.is_active())
            };
            if let Some(p) = running {
                let _ = p
                    .control(
                        json!({ "subtype": "interrupt", "cancel_queued": true }),
                        Duration::from_secs(5),
                    )
                    .await;
            }
        }
        let lock = self.spawn_lock(id);
        let _guard = lock.lock().await;
        self.with_agent(id, |rt, fx| {
            rt.meta.archived = archived;
            if archived {
                if let Some(p) = rt.detach() {
                    p.close_input();
                }
                rt.clear_pending(fx);
                if rt.meta.status.is_active() {
                    rt.set_status(AgentStatus::Done, fx);
                }
            }
            fx.save = true;
            Ok(())
        })?;
        let pid = self.agent(id)?.lock().meta.project_id.clone();
        self.git.refresh(&pid);
        Ok(())
    }

    /// Removes the agent. Worktree cleanup is best effort: a problem there is returned as a
    /// warning, the agent is removed regardless.
    pub async fn delete_agent(
        self: &Arc<Self>,
        id: &str,
        remove_worktree: bool,
    ) -> Result<Option<String>> {
        // Wait for an in-flight start (warm-up) so that its process is killed too.
        let lock = self.spawn_lock(id);
        let _guard = lock.lock().await;
        let h = self
            .agents
            .write()
            .remove(id)
            .ok_or_else(|| anyhow!("agent introuvable"))?;
        let (pid, worktree) = {
            let mut rt = h.lock();
            rt.gen += 1;
            if let Some(p) = rt.proc.take() {
                p.kill();
            }
            rt.conv.delete_file();
            (rt.meta.project_id.clone(), rt.meta.worktree.clone())
        };
        self.spawn_locks.lock().remove(id);
        {
            let mut ui = self.ui.write();
            if ui.selected_agent.get(&pid).map(String::as_str) == Some(id) {
                ui.selected_agent.remove(&pid);
            }
        }
        self.hub.emit(UiEvent::AgentRemoved {
            id: id.to_string(),
            project_id: pid.clone(),
        });
        self.request_save();
        self.update_tray();
        let mut warning = None;
        if let (true, Some(wt), Ok(project)) = (remove_worktree, worktree, self.project(&pid)) {
            // Give the killed process tree a moment to release its handles on the worktree.
            tokio::time::sleep(Duration::from_millis(300)).await;
            if let Err(e) = git::worktree_remove(&project.path, &wt.path, &wt.branch).await {
                warning = Some(format!(
                    "Agent supprimé, mais le worktree n'a pas pu être nettoyé : {e:#}"
                ));
            }
        }
        self.git.refresh(&pid);
        Ok(warning)
    }

    pub async fn merge_agent(self: &Arc<Self>, id: &str, squash: bool) -> Result<String> {
        let h = self.agent(id)?;
        let (pid, name, wt) = {
            let rt = h.lock();
            (
                rt.meta.project_id.clone(),
                rt.meta.name.clone(),
                rt.meta.worktree.clone(),
            )
        };
        let wt = wt.ok_or_else(|| anyhow!("cet agent n'a pas de worktree"))?;
        let project = self.project(&pid)?;
        if git::has_tracked_changes(&project.path).await? {
            bail!("Le dépôt principal a des modifications non commitées : commite-les ou mets-les de côté avant de merger.");
        }
        let dirty = git::status(&wt.path).await?.entries.len();
        if dirty > 0 {
            bail!("L'agent a {dirty} fichier(s) non commité(s) : demande-lui de commiter avant de merger.");
        }
        if git::ahead_count(&project.path, &wt.branch).await == 0 {
            bail!(
                "Rien à merger : la branche {} n'a pas de nouveau commit.",
                wt.branch
            );
        }
        let message = if squash {
            let subjects = git::text(
                &project.path,
                &["log", "--format=- %s", &format!("HEAD..{}", wt.branch)],
            )
            .await
            .unwrap_or_default();
            format!("{name}\n\n{subjects}")
        } else {
            format!("Merge branch '{}'", wt.branch)
        };
        let out = git::merge(&project.path, &wt.branch, squash, &message).await?;
        self.git.refresh(&pid);
        Ok(out)
    }

    // ---------- projects ----------

    pub async fn create_project(
        self: &Arc<Self>,
        path: &str,
        name: &str,
        color: &str,
        worktree_per_agent: bool,
        first_agent: Option<String>,
    ) -> Result<Project> {
        let path = path.trim().trim_end_matches(['\\', '/']).to_string();
        if !Path::new(&path).is_dir() {
            bail!("Le dossier {path} n'existe pas");
        }
        if git::toplevel(&path).await.is_none() {
            git::init_repo(&path).await.context("git init")?;
        }
        let project = Project {
            id: new_id(),
            name: if name.trim().is_empty() {
                Path::new(&path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "projet".into())
            } else {
                name.trim().to_string()
            },
            path,
            color: color.to_string(),
            worktree_per_agent,
            created_at: now_ms(),
        };
        self.projects.write().push(project.clone());
        {
            let mut ui = self.ui.write();
            ui.active_project = Some(project.id.clone());
            ui.view = "project".into();
        }
        self.request_save();
        self.git.watch(&project.id, &project.path);
        if let Some(model) = first_agent {
            self.create_agent(&project.id, Some(model)).await?;
        }
        Ok(project)
    }

    pub fn update_project(&self, p: Project) -> Result<()> {
        let mut projects = self.projects.write();
        let cur = projects
            .iter_mut()
            .find(|x| x.id == p.id)
            .ok_or_else(|| anyhow!("projet introuvable"))?;
        cur.name = p.name;
        cur.color = p.color;
        cur.worktree_per_agent = p.worktree_per_agent;
        drop(projects);
        self.request_save();
        Ok(())
    }

    pub fn reorder_projects(&self, ids: &[String]) {
        let mut projects = self.projects.write();
        projects.sort_by_key(|p| ids.iter().position(|i| *i == p.id).unwrap_or(usize::MAX));
        drop(projects);
        self.request_save();
    }

    pub fn remove_project(self: &Arc<Self>, id: &str) -> Result<()> {
        let agents: Vec<String> = self
            .project_agents(id)
            .iter()
            .map(|h| h.lock().meta.id.clone())
            .collect();
        for aid in agents {
            // Bound first: the map guard must not live across the agent lock and the I/O below.
            let removed = self.agents.write().remove(&aid);
            if let Some(h) = removed {
                let mut rt = h.lock();
                rt.gen += 1;
                if let Some(p) = rt.proc.take() {
                    p.kill();
                }
                rt.conv.delete_file();
            }
            self.hub.emit(UiEvent::AgentRemoved {
                id: aid,
                project_id: id.to_string(),
            });
        }
        self.pty.kill_project(id);
        self.git.unwatch(id);
        self.projects.write().retain(|p| p.id != id);
        // Read before taking the ui lock: never hold ui while waiting on projects.
        let fallback = self.projects.read().first().map(|p| p.id.clone());
        {
            let mut ui = self.ui.write();
            ui.selected_agent.remove(id);
            if ui.active_project.as_deref() == Some(id) {
                ui.active_project = fallback;
            }
        }
        self.request_save();
        self.update_tray();
        Ok(())
    }

    // ---------- git ----------

    async fn git_loop(self: Arc<Self>, mut rx: mpsc::UnboundedReceiver<String>) {
        let mut due: HashMap<String, Instant> = HashMap::new();
        let mut last: HashMap<String, Instant> = HashMap::new();
        loop {
            let next = due.values().min().copied();
            tokio::select! {
                msg = rx.recv() => {
                    let Some(pid) = msg else { break };
                    let now = Instant::now();
                    let earliest = last.get(&pid).map(|t| *t + Duration::from_millis(700)).unwrap_or(now);
                    due.entry(pid).or_insert_with(|| earliest.max(now + Duration::from_millis(150)));
                }
                _ = tokio::time::sleep_until(next.unwrap_or_else(Instant::now).into()), if next.is_some() => {
                    let now = Instant::now();
                    let ready: Vec<String> = due.iter().filter(|(_, t)| **t <= now).map(|(k, _)| k.clone()).collect();
                    for pid in ready {
                        // A refresh still running for this project (large repo): try again later
                        // rather than overlapping and publishing results out of order.
                        if !self.git_inflight.lock().insert(pid.clone()) {
                            due.insert(pid, now + Duration::from_millis(250));
                            continue;
                        }
                        due.remove(&pid);
                        last.insert(pid.clone(), now);
                        self.git.take_flag(&pid);
                        let c = self.clone();
                        tauri::async_runtime::spawn(async move {
                            c.compute_git(&pid).await;
                            c.git_inflight.lock().remove(&pid);
                        });
                    }
                }
            }
        }
    }

    pub(crate) async fn compute_git(self: &Arc<Self>, project_id: &str) {
        let Ok(project) = self.project(project_id) else {
            return;
        };
        let info = match self.toplevel(&project.path).await {
            None => GitInfo::default(),
            Some(root) => {
                let st = git::status(&root).await.unwrap_or_default();
                let prefix = sub_prefix(&root, &project.path);
                let mut info = GitInfo {
                    is_repo: true,
                    branch: st.branch.clone(),
                    ..Default::default()
                };
                let tally = |c: char, info: &mut GitInfo| match c {
                    'A' => info.added += 1,
                    'D' => info.deleted += 1,
                    _ => info.modified += 1,
                };
                for e in &st.entries {
                    tally(e.status, &mut info);
                }
                let agents: Vec<(String, Option<Worktree>, Vec<String>)> = self
                    .project_agents(project_id)
                    .iter()
                    .map(|h| {
                        let rt = h.lock();
                        (
                            rt.meta.id.clone(),
                            rt.meta.worktree.clone(),
                            rt.meta.touched_files.clone(),
                        )
                    })
                    .collect();
                for (aid, wt, touched) in agents {
                    let count = match wt {
                        Some(wt) => match git::status(&wt.path).await {
                            Ok(ws) => {
                                for e in &ws.entries {
                                    tally(e.status, &mut info);
                                }
                                ws.entries.len() as u32
                            }
                            Err(_) => 0,
                        },
                        None => touched
                            .iter()
                            .filter(|t| {
                                let full = format!("{prefix}{t}");
                                st.entries
                                    .iter()
                                    .any(|e| e.path.eq_ignore_ascii_case(&full))
                            })
                            .count() as u32,
                    };
                    info.agents.insert(aid, count);
                }
                info.total = info.modified + info.added + info.deleted;
                info
            }
        };
        self.git.invalidate_files();
        self.git_cache
            .write()
            .insert(project_id.to_string(), info.clone());
        self.hub.emit(UiEvent::Git {
            project_id: project_id.to_string(),
            git: info,
        });
    }

    /// Dirty files for the files panel. `agent_id` + scope "agent" restricts to one agent.
    pub async fn git_files(
        self: &Arc<Self>,
        project_id: &str,
        agent_id: Option<String>,
    ) -> Result<Vec<FileChange>> {
        let project = self.project(project_id)?;
        let root = self
            .toplevel(&project.path)
            .await
            .ok_or_else(|| anyhow!("pas un dépôt git"))?;
        let prefix = sub_prefix(&root, &project.path);
        let agents: Vec<(String, Option<Worktree>, Vec<String>)> = self
            .project_agents(project_id)
            .iter()
            .map(|h| {
                let rt = h.lock();
                (
                    rt.meta.id.clone(),
                    rt.meta.worktree.clone(),
                    rt.meta.touched_files.clone(),
                )
            })
            .filter(|(id, _, _)| agent_id.as_ref().is_none_or(|a| a == id))
            .collect();
        let mut out = Vec::new();
        let main = if agents.iter().all(|(_, wt, _)| wt.is_some()) && agent_id.is_some() {
            Vec::new()
        } else {
            git::file_changes(&root).await?
        };
        let owner = |path: &str| {
            agents
                .iter()
                .find(|(_, wt, touched)| {
                    wt.is_none()
                        && touched
                            .iter()
                            .any(|t| format!("{prefix}{t}").eq_ignore_ascii_case(path))
                })
                .map(|(id, _, _)| id.clone())
        };
        for mut f in main {
            f.agent_id = owner(&f.path);
            if agent_id.is_none() || f.agent_id.is_some() {
                out.push(f);
            }
        }
        for (id, wt, _) in &agents {
            if let Some(wt) = wt {
                for mut f in git::file_changes(&wt.path).await.unwrap_or_default() {
                    f.agent_id = Some(id.clone());
                    out.push(f);
                }
            }
        }
        Ok(out)
    }

    pub async fn git_diff(
        self: &Arc<Self>,
        project_id: &str,
        agent_id: Option<String>,
        paths: Vec<String>,
    ) -> Result<String> {
        let project = self.project(project_id)?;
        let worktree = match &agent_id {
            Some(a) => self.agent(a)?.lock().meta.worktree.clone(),
            None => None,
        };
        let root = match worktree {
            Some(wt) => wt.path,
            None => self
                .toplevel(&project.path)
                .await
                .ok_or_else(|| anyhow!("pas un dépôt git"))?,
        };
        git::diff(&root, &paths).await
    }

    pub async fn file_suggestions(
        self: &Arc<Self>,
        agent_id: &str,
        query: &str,
    ) -> Result<Vec<String>> {
        let cwd = self.agent(agent_id)?.lock().meta.cwd.clone();
        let files = self.git.file_index(&cwd).await;
        Ok(git::fuzzy_files(&files, query, 40))
    }

    // ---------- usage ----------

    pub async fn refresh_usage(self: &Arc<Self>) {
        let proc = self
            .agents
            .read()
            .values()
            .find_map(|h| h.lock().proc.clone());
        let mut windows = None;
        if let Some(p) = proc {
            if let Ok(v) = p
                .control(
                    json!({ "subtype": "get_usage", "skip_behaviors": true }),
                    Duration::from_secs(20),
                )
                .await
            {
                if v["rate_limits"].is_object() {
                    windows = Some(usage::parse_windows(&v["rate_limits"]));
                }
            }
        }
        if windows.is_none() && usage::oauth_due(*self.last_oauth_call.lock(), now_ms()) {
            *self.last_oauth_call.lock() = Some(now_ms());
            let settings = self.settings.read().clone();
            match usage::fetch_oauth(&settings).await {
                Ok(w) => windows = Some(w),
                Err(e) => log::debug!("usage endpoint: {e:#}"),
            }
        }
        let snapshot = {
            let mut u = self.usage.lock();
            if let Some((five, week)) = windows {
                u.five_hour = five.or(u.five_hour);
                u.seven_day = week.or(u.seven_day);
                u.updated_at = now_ms();
            }
            u.today_cost = self.stats.today_cost();
            u.clone()
        };
        self.hub.emit(UiEvent::Usage { usage: snapshot });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs() {
        assert_eq!(slugify("Migration JWT rotation"), "migration-jwt-rotation");
        assert_eq!(
            slugify("  réparer l'écran d'accueil! "),
            "reparer-l-ecran-d-accueil"
        );
        assert!(slugify(&"mot ".repeat(30)).len() <= 40);
    }

    #[test]
    fn args_for_haiku_skip_effort() {
        let m = AgentMeta {
            model: "haiku".into(),
            effort: "high".into(),
            mode: "auto".into(),
            session_id: Some("s1".into()),
            ..Default::default()
        };
        let a = claude_args(&m);
        assert!(!a.contains(&"--effort".to_string()));
        assert!(a.contains(&"--resume=s1".to_string()));
        let m = AgentMeta {
            model: "opus".into(),
            effort: "max".into(),
            mode: "plan".into(),
            ..Default::default()
        };
        let a = claude_args(&m);
        assert!(a.windows(2).any(|w| w == ["--effort", "max"]));
    }

    #[test]
    fn sub_prefixes() {
        assert_eq!(sub_prefix("C:/code/app", "C:\\code\\app"), "");
        assert_eq!(
            sub_prefix("C:/code/mono", "C:/code/mono/packages/web"),
            "packages/web/"
        );
    }
}
