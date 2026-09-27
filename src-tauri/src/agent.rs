//! Runtime state of one agent: turns raw Claude Code frames into conversation items,
//! tracks status, pending questions/permissions and per-turn usage.

use crate::claude::{truncate, ClaudeProcess};
use crate::conv::Conv;
use crate::model::*;
use crate::paths::relative_slash;
use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::Arc;

pub type AgentHandle = Arc<parking_lot::Mutex<AgentRt>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotifyKind {
    Question,
    Done,
    Error,
}

#[derive(Debug, Clone, Default)]
pub struct TurnRow {
    pub model: String,
    pub input: u64,
    pub cache: u64,
    pub output: u64,
    pub cost: f64,
}

/// Side effects collected while the agent lock is held, applied once it is released.
#[derive(Default)]
pub struct Effects {
    pub ops: Vec<ConvOp>,
    pub agent_changed: bool,
    pub save: bool,
    pub notify: Option<NotifyKind>,
    pub turns: Vec<TurnRow>,
    pub rate: Option<(Option<RateWindow>, Option<RateWindow>)>,
    pub files_changed: bool,
}

struct Block {
    index: u64,
    item_id: String,
    kind: &'static str,
    finalized: bool,
}

struct PendingReq {
    item_id: String,
    tool_use_id: String,
    input: Value,
    suggestions: Value,
}

#[derive(Debug, Clone, Default)]
struct Counters {
    input: u64,
    output: u64,
    cache: u64,
    cost: f64,
}

pub struct AgentRt {
    pub meta: AgentMeta,
    pub proc: Option<Arc<ClaudeProcess>>,
    pub gen: u64,
    pub conv: Conv,
    pub active_since: Option<i64>,
    pub context_tokens: u64,
    pub commands: Vec<Value>,
    pub interrupted: bool,
    pub saw_init: bool,
    blocks: HashMap<String, Vec<Block>>,
    current_msg: HashMap<String, String>,
    pending: HashMap<String, PendingReq>,
    last_usage: HashMap<String, Counters>,
    queued: u32,
}

const MAX_TEXT: usize = 8000;
const MAX_INPUT_STR: usize = 4000;
const MAX_PATCH_LINES: usize = 800;

impl AgentRt {
    pub fn new(mut meta: AgentMeta) -> Self {
        // A turn cannot survive an app restart.
        if meta.status.is_active() {
            meta.status = AgentStatus::Done;
        }
        Self {
            conv: Conv::new(&meta.id),
            meta,
            proc: None,
            gen: 0,
            active_since: None,
            context_tokens: 0,
            commands: Vec::new(),
            interrupted: false,
            saw_init: false,
            blocks: HashMap::new(),
            current_msg: HashMap::new(),
            pending: HashMap::new(),
            last_usage: HashMap::new(),
            queued: 0,
        }
    }

    pub fn view(&self) -> AgentView {
        AgentView {
            meta: self.meta.clone(),
            active_since: self.active_since,
            alive: self.proc.is_some(),
            pending: self.pending.keys().cloned().collect(),
            context_tokens: self.context_tokens,
        }
    }

    /// Resets per-process bookkeeping when a new `claude` process is attached.
    pub fn attach(&mut self, proc: Arc<ClaudeProcess>) {
        self.proc = Some(proc);
        self.blocks.clear();
        self.current_msg.clear();
        self.pending.clear();
        self.last_usage.clear();
        self.saw_init = false;
        self.queued = 0;
    }

    fn push(&mut self, op: ConvOp, fx: &mut Effects) {
        self.conv.apply(&op);
        fx.ops.push(op);
    }

    fn append(&mut self, item: Value, fx: &mut Effects) {
        self.push(ConvOp::Append { item }, fx);
    }

    fn patch(&mut self, id: &str, patch: Value, fx: &mut Effects) {
        self.push(ConvOp::Patch { id: id.to_string(), patch }, fx);
    }

    pub fn notice(&mut self, level: &str, text: impl Into<String>, fx: &mut Effects) {
        let item = json!({ "kind": "notice", "id": new_id(), "ts": now_ms(), "level": level, "text": text.into() });
        self.append(item, fx);
    }

    pub fn set_status(&mut self, status: AgentStatus, fx: &mut Effects) {
        if self.meta.status == status {
            return;
        }
        let now = now_ms();
        let (was, is) = (self.meta.status.is_active(), status.is_active());
        if was && !is {
            if let Some(since) = self.active_since.take() {
                self.meta.active_ms += (now - since).max(0) as u64;
            }
        } else if !was && is {
            self.active_since = Some(now);
        }
        self.meta.status = status;
        self.meta.last_activity = now;
        fx.agent_changed = true;
        fx.save = true;
    }

    /// Records a user message; returns its item id (also used as the frame uuid).
    pub fn push_user(&mut self, text: &str, images: u32, fx: &mut Effects) -> (String, bool) {
        let queued = self.meta.status.is_active();
        let id = uuid::Uuid::new_v4().to_string();
        let item = json!({ "kind": "user", "id": id, "text": text, "images": images, "ts": now_ms(), "queued": queued });
        self.append(item, fx);
        if queued {
            self.queued += 1;
        } else {
            self.set_status(AgentStatus::Running, fx);
        }
        self.meta.prompts += 1;
        self.meta.last_activity = now_ms();
        fx.agent_changed = true;
        fx.save = true;
        (id, queued)
    }

    pub fn clear_pending(&mut self, fx: &mut Effects) {
        let ids: Vec<String> = self.pending.drain().map(|(_, p)| p.item_id).collect();
        for id in ids {
            self.patch(&id, json!({ "cancelled": true }), fx);
        }
    }

    #[cfg(test)]
    pub fn has_pending(&self, request_id: &str) -> bool {
        self.pending.contains_key(request_id)
    }

    pub fn answer_question(&mut self, request_id: &str, answers: Value, fx: &mut Effects) -> Result<()> {
        let proc = self.proc.clone().ok_or_else(|| anyhow!("Claude ne tourne plus pour cet agent"))?;
        let p = self.pending.remove(request_id).ok_or_else(|| anyhow!("question introuvable"))?;
        let mut input = p.input.clone();
        input["answers"] = answers.clone();
        proc.respond(request_id, json!({ "behavior": "allow", "updatedInput": input, "toolUseID": p.tool_use_id }))?;
        self.patch(&p.item_id, json!({ "answers": answers }), fx);
        self.after_answer(fx);
        Ok(())
    }

    pub fn answer_permission(&mut self, request_id: &str, decision: &str, message: Option<String>, fx: &mut Effects) -> Result<()> {
        let proc = self.proc.clone().ok_or_else(|| anyhow!("Claude ne tourne plus pour cet agent"))?;
        let p = self.pending.remove(request_id).ok_or_else(|| anyhow!("demande introuvable"))?;
        let response = match decision {
            "allow" => json!({ "behavior": "allow", "updatedInput": p.input, "toolUseID": p.tool_use_id }),
            "always" => json!({
                "behavior": "allow", "updatedInput": p.input, "toolUseID": p.tool_use_id,
                "updatedPermissions": p.suggestions,
            }),
            _ => json!({
                "behavior": "deny", "toolUseID": p.tool_use_id,
                "message": message.clone().filter(|m| !m.trim().is_empty())
                    .unwrap_or_else(|| "L'utilisateur a refusé cette action.".into()),
            }),
        };
        proc.respond(request_id, response)?;
        self.patch(&p.item_id, json!({ "decision": decision, "message": message }), fx);
        self.after_answer(fx);
        Ok(())
    }

    fn after_answer(&mut self, fx: &mut Effects) {
        if self.pending.is_empty() && self.meta.status == AgentStatus::Waiting {
            self.set_status(AgentStatus::Running, fx);
        }
        fx.agent_changed = true;
    }

    /// The process exited. `gen` guards against a stale exit of a replaced process.
    pub fn on_exit(&mut self, gen: u64, code: Option<i32>, stderr: &str, fx: &mut Effects) {
        if gen != self.gen {
            return;
        }
        self.proc = None;
        self.clear_pending(fx);
        if !self.saw_init && stderr.contains("No conversation found") {
            self.meta.session_id = None;
            self.notice("warn", "Session Claude introuvable : une nouvelle session sera démarrée au prochain message.", fx);
            self.set_status(AgentStatus::Done, fx);
        } else if self.meta.status.is_active() || !self.saw_init {
            let detail = if stderr.trim().is_empty() { String::new() } else { format!("\n\n{}", truncate(stderr.trim(), 2000)) };
            let code = code.map(|c| c.to_string()).unwrap_or_else(|| "?".into());
            self.notice("error", format!("Claude Code s'est arrêté (code {code}).{detail}"), fx);
            self.set_status(AgentStatus::Error, fx);
            fx.notify = Some(NotifyKind::Error);
        }
        fx.agent_changed = true;
    }

    pub fn handle_frame(&mut self, f: &Value, fx: &mut Effects) {
        match f["type"].as_str().unwrap_or("") {
            "system" => self.on_system(f, fx),
            "stream_event" => self.on_stream(f, fx),
            "assistant" => self.on_assistant(f, fx),
            "user" => self.on_user(f, fx),
            "result" => self.on_result(f, fx),
            "control_request" => self.on_control_request(f, fx),
            "control_cancel_request" => self.on_cancel(f, fx),
            "rate_limit_event" => fx.rate = Some(parse_rate_event(&f["rate_limit_info"])),
            _ => {}
        }
    }

    fn on_system(&mut self, f: &Value, fx: &mut Effects) {
        match f["subtype"].as_str().unwrap_or("") {
            "init" => {
                if let Some(sid) = f["session_id"].as_str() {
                    if self.meta.session_id.as_deref() != Some(sid) {
                        if self.saw_init {
                            self.notice("info", "Nouvelle conversation Claude (contexte vidé)", fx);
                        }
                        self.meta.session_id = Some(sid.to_string());
                        fx.save = true;
                    }
                }
                self.saw_init = true;
            }
            "status" => {
                if let Some(mode) = f["permissionMode"].as_str() {
                    if self.meta.mode != mode && mode != "default" {
                        self.meta.mode = mode.to_string();
                        fx.agent_changed = true;
                        fx.save = true;
                    }
                }
            }
            "compact_boundary" => self.notice("info", "Contexte compacté", fx),
            "local_command_output" => {
                let text = f["content"].as_str().unwrap_or("").to_string();
                if !text.trim().is_empty() {
                    self.notice("info", strip_tags(&text), fx);
                }
            }
            _ => {}
        }
    }

    fn on_stream(&mut self, f: &Value, fx: &mut Effects) {
        let ev = &f["event"];
        let parent = f["parent_tool_use_id"].as_str().map(str::to_string);
        let pkey = parent.clone().unwrap_or_default();
        match ev["type"].as_str().unwrap_or("") {
            "message_start" => {
                let Some(mid) = ev["message"]["id"].as_str() else { return };
                self.current_msg.insert(pkey, mid.to_string());
                self.blocks.entry(mid.to_string()).or_default();
                if parent.is_none() {
                    let u = &ev["message"]["usage"];
                    self.context_tokens = [&u["input_tokens"], &u["cache_read_input_tokens"], &u["cache_creation_input_tokens"]]
                        .iter()
                        .filter_map(|v| v.as_u64())
                        .sum();
                    fx.agent_changed = true;
                }
                // A turn started without a user message from us (queued message, background task).
                if !self.meta.status.is_active() {
                    self.set_status(AgentStatus::Running, fx);
                }
            }
            "content_block_start" => {
                let Some(mid) = self.current_msg.get(&pkey).cloned() else { return };
                let index = ev["index"].as_u64().unwrap_or(0);
                let cb = &ev["content_block"];
                let (kind, item) = match cb["type"].as_str().unwrap_or("") {
                    "text" => ("text", json!({ "kind": "text", "id": format!("{mid}:{index}"), "text": "", "parent": parent, "streaming": true })),
                    "thinking" => ("thinking", json!({ "kind": "thinking", "id": format!("{mid}:{index}"), "text": "", "parent": parent, "streaming": true })),
                    "tool_use" | "server_tool_use" => (
                        "tool",
                        json!({
                            "kind": "tool", "id": cb["id"], "name": cb["name"], "input": {}, "status": "running",
                            "parent": parent, "ts": now_ms(),
                        }),
                    ),
                    _ => return,
                };
                let item_id = item["id"].as_str().unwrap_or_default().to_string();
                self.append(item, fx);
                self.blocks.entry(mid).or_default().push(Block { index, item_id, kind, finalized: false });
            }
            "content_block_delta" => {
                let Some(mid) = self.current_msg.get(&pkey) else { return };
                let index = ev["index"].as_u64().unwrap_or(0);
                let Some(block) = self.blocks.get(mid).and_then(|b| b.iter().find(|b| b.index == index)) else { return };
                let d = &ev["delta"];
                let text = match d["type"].as_str().unwrap_or("") {
                    "text_delta" => d["text"].as_str(),
                    "thinking_delta" => d["thinking"].as_str(),
                    _ => None,
                };
                if let Some(text) = text.filter(|t| !t.is_empty()) {
                    let id = block.item_id.clone();
                    self.push(ConvOp::Delta { id, text: text.to_string() }, fx);
                }
            }
            _ => {}
        }
    }

    fn on_assistant(&mut self, f: &Value, fx: &mut Effects) {
        let msg = &f["message"];
        let mid = msg["id"].as_str().unwrap_or("").to_string();
        let parent = f["parent_tool_use_id"].as_str().map(str::to_string);
        if let Some(err) = f["error"].as_str() {
            let text = msg["content"][0]["text"].as_str().unwrap_or(err).to_string();
            self.notice("error", text, fx);
            return;
        }
        let Some(content) = msg["content"].as_array() else { return };
        for block in content {
            let kind = match block["type"].as_str().unwrap_or("") {
                "text" => "text",
                "thinking" | "redacted_thinking" => "thinking",
                "tool_use" | "server_tool_use" => "tool",
                _ => continue,
            };
            let streamed = self
                .blocks
                .get_mut(&mid)
                .and_then(|v| v.iter_mut().find(|b| !b.finalized && b.kind == kind))
                .map(|b| {
                    b.finalized = true;
                    b.item_id.clone()
                });
            match (kind, streamed) {
                ("text", Some(id)) => self.patch(&id, json!({ "text": block["text"], "streaming": false }), fx),
                ("thinking", Some(id)) => {
                    let text = block["thinking"].as_str().unwrap_or("");
                    self.patch(&id, json!({ "text": text, "streaming": false }), fx)
                }
                ("tool", Some(id)) => self.patch(&id, json!({ "input": trim_strings(&block["input"]) }), fx),
                (_, None) => {
                    let n = self.blocks.get(&mid).map_or(0, Vec::len);
                    let item = match kind {
                        "text" => json!({ "kind": "text", "id": format!("{mid}:a{n}"), "text": block["text"], "parent": parent, "streaming": false }),
                        "thinking" => json!({ "kind": "thinking", "id": format!("{mid}:a{n}"), "text": block["thinking"].as_str().unwrap_or(""), "parent": parent, "streaming": false }),
                        _ => json!({
                            "kind": "tool", "id": block["id"], "name": block["name"], "input": trim_strings(&block["input"]),
                            "status": "running", "parent": parent, "ts": now_ms(),
                        }),
                    };
                    let item_id = item["id"].as_str().unwrap_or_default().to_string();
                    self.append(item, fx);
                    self.blocks.entry(mid.clone()).or_default().push(Block { index: u64::MAX, item_id, kind, finalized: true });
                }
                _ => {}
            }
        }
    }

    fn on_user(&mut self, f: &Value, fx: &mut Effects) {
        let content = &f["message"]["content"];
        if let Some(text) = content.as_str() {
            if text.contains("<local-command-stdout>") || text.contains("<local-command-stderr>") {
                let clean = strip_tags(text);
                if !clean.trim().is_empty() {
                    self.notice("info", clean, fx);
                }
            }
            return;
        }
        let Some(blocks) = content.as_array() else { return };
        let tur = &f["tool_use_result"];
        for b in blocks.iter().filter(|b| b["type"] == "tool_result") {
            let Some(id) = b["tool_use_id"].as_str() else { continue };
            let is_error = b["is_error"].as_bool().unwrap_or(false);
            let mut result = json!({ "isError": is_error });
            let mut text = tool_result_text(&b["content"]);
            if let Some(stdout) = tur["stdout"].as_str() {
                text = stdout.to_string();
                if let Some(stderr) = tur["stderr"].as_str().filter(|s| !s.is_empty()) {
                    text = format!("{text}\n{stderr}");
                }
            }
            result["text"] = Value::String(truncate(text.trim_end(), MAX_TEXT));
            if let Some(hunks) = tur["structuredPatch"].as_array() {
                let (add, del, patch) = if hunks.is_empty() && tur["type"] == "create" {
                    created_file_patch(tur["content"].as_str().unwrap_or(""))
                } else {
                    summarize_patch(hunks)
                };
                result["add"] = add.into();
                result["del"] = del.into();
                result["patch"] = patch;
                if let Some(path) = tur["filePath"].as_str() {
                    result["filePath"] = path.into();
                    self.touch(path, fx);
                }
            }
            self.patch(id, json!({ "status": if is_error { "error" } else { "ok" }, "result": result }), fx);
        }
    }

    fn touch(&mut self, path: &str, fx: &mut Effects) {
        let rel = relative_slash(&self.meta.cwd, path);
        if !self.meta.touched_files.iter().any(|p| p.eq_ignore_ascii_case(&rel)) {
            self.meta.touched_files.push(rel);
            fx.save = true;
        }
        fx.files_changed = true;
    }

    fn on_result(&mut self, f: &Value, fx: &mut Effects) {
        let interrupted = std::mem::take(&mut self.interrupted);
        let is_error = f["is_error"].as_bool().unwrap_or(false) || f["subtype"] != "success";
        let (mut tokens, mut cost) = (0u64, 0f64);
        if let Some(models) = f["modelUsage"].as_object() {
            for (model, u) in models {
                let cur = Counters {
                    input: u["inputTokens"].as_u64().unwrap_or(0),
                    output: u["outputTokens"].as_u64().unwrap_or(0),
                    cache: u["cacheReadInputTokens"].as_u64().unwrap_or(0) + u["cacheCreationInputTokens"].as_u64().unwrap_or(0),
                    cost: u["costUSD"].as_f64().unwrap_or(0.0),
                };
                let prev = self.last_usage.get(model).cloned().unwrap_or_default();
                let delta = if cur.cost + 1e-12 < prev.cost || cur.output < prev.output {
                    cur.clone()
                } else {
                    Counters {
                        input: cur.input - prev.input,
                        output: cur.output - prev.output,
                        cache: cur.cache.saturating_sub(prev.cache),
                        cost: (cur.cost - prev.cost).max(0.0),
                    }
                };
                self.last_usage.insert(model.clone(), cur);
                let total = delta.input + delta.output + delta.cache;
                if total == 0 && delta.cost == 0.0 {
                    continue;
                }
                tokens += total;
                cost += delta.cost;
                let name = u["canonicalModel"].as_str().unwrap_or(model).to_string();
                fx.turns.push(TurnRow { model: name, input: delta.input, cache: delta.cache, output: delta.output, cost: delta.cost });
            }
        }
        self.meta.tokens += tokens;
        self.meta.cost += cost;
        let error = if is_error && !interrupted {
            f["result"].as_str().map(str::to_string).or_else(|| {
                f["errors"].as_array().map(|e| e.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join("\n"))
            })
        } else {
            None
        };
        let item = json!({
            "kind": "turn", "id": f["uuid"].as_str().map(str::to_string).unwrap_or_else(new_id), "ts": now_ms(),
            "durationMs": f["duration_ms"], "cost": cost, "tokens": tokens,
            "isError": is_error && !interrupted, "interrupted": interrupted, "error": error,
        });
        self.append(item, fx);
        if !self.pending.is_empty() {
            self.clear_pending(fx);
        }
        let had_queue = self.queued > 0;
        if had_queue {
            self.queued = 0;
            let ids = self.conv.ids_where(|v| v["kind"] == "user" && v["queued"] == true);
            for id in ids {
                self.patch(&id, json!({ "queued": false }), fx);
            }
        }
        let failed = is_error && !interrupted;
        self.set_status(if failed { AgentStatus::Error } else { AgentStatus::Done }, fx);
        if !interrupted && !had_queue {
            fx.notify = Some(if failed { NotifyKind::Error } else { NotifyKind::Done });
        }
        fx.agent_changed = true;
        fx.save = true;
    }

    fn on_control_request(&mut self, f: &Value, fx: &mut Effects) {
        let Some(rid) = f["request_id"].as_str() else { return };
        let req = &f["request"];
        match req["subtype"].as_str().unwrap_or("") {
            "can_use_tool" => {
                let tool = req["tool_name"].as_str().unwrap_or("").to_string();
                let input = req["input"].clone();
                let tool_use_id = req["tool_use_id"].as_str().unwrap_or("").to_string();
                let suggestions = req["permission_suggestions"].clone();
                let item = if tool == "AskUserQuestion" {
                    json!({
                        "kind": "question", "id": rid, "toolUseId": tool_use_id,
                        "questions": input["questions"], "answers": null, "ts": now_ms(),
                    })
                } else {
                    let can_always = suggestions.as_array().is_some_and(|a| !a.is_empty())
                        && !req["suppress_always_allow_rule"].as_bool().unwrap_or(false);
                    json!({
                        "kind": "permission", "id": rid, "toolUseId": tool_use_id, "toolName": tool,
                        "title": req["title"], "description": req["description"],
                        "input": trim_strings(&input),
                        "reason": req["decision_reason"].as_str().map(strip_ansi),
                        "canAlways": can_always, "defaultNo": req["default_to_no"].as_bool().unwrap_or(false),
                        "decision": null, "ts": now_ms(),
                    })
                };
                self.append(item, fx);
                self.pending.insert(rid.to_string(), PendingReq { item_id: rid.to_string(), tool_use_id, input, suggestions });
                self.set_status(AgentStatus::Waiting, fx);
                fx.notify = Some(NotifyKind::Question);
                fx.agent_changed = true;
            }
            "elicitation" => {
                if let Some(p) = &self.proc {
                    let _ = p.respond(rid, json!({ "action": "decline" }));
                }
            }
            other => {
                if let Some(p) = &self.proc {
                    let _ = p.respond_error(rid, &format!("unsupported request: {other}"));
                }
            }
        }
    }

    fn on_cancel(&mut self, f: &Value, fx: &mut Effects) {
        let Some(rid) = f["request_id"].as_str() else { return };
        if let Some(p) = self.pending.remove(rid) {
            self.patch(&p.item_id, json!({ "cancelled": true }), fx);
            if self.pending.is_empty() && self.meta.status == AgentStatus::Waiting {
                self.set_status(AgentStatus::Running, fx);
            }
            fx.agent_changed = true;
        }
    }
}

pub fn parse_rate_event(info: &Value) -> (Option<RateWindow>, Option<RateWindow>) {
    let w = &info["unifiedWindows"];
    let parse = |k: &str| {
        w.get(k).filter(|v| v.is_object()).map(|v| RateWindow {
            pct: v["utilization"].as_f64().unwrap_or(0.0) * 100.0,
            resets_at: v["resetsAt"].as_i64().map(|s| s * 1000),
        })
    };
    (parse("five_hour"), parse("seven_day"))
}

fn tool_result_text(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts.iter().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("\n"),
        _ => String::new(),
    }
}

fn summarize_patch(hunks: &[Value]) -> (u32, u32, Value) {
    let (mut add, mut del, mut kept_total) = (0u32, 0u32, 0usize);
    let mut out = Vec::new();
    for h in hunks {
        let lines = h["lines"].as_array().map(Vec::as_slice).unwrap_or(&[]);
        for l in lines {
            match l.as_str().unwrap_or("").chars().next() {
                Some('+') => add += 1,
                Some('-') => del += 1,
                _ => {}
            }
        }
        if kept_total < MAX_PATCH_LINES {
            let kept: Vec<Value> = lines
                .iter()
                .take(MAX_PATCH_LINES - kept_total)
                .map(|l| Value::String(truncate(l.as_str().unwrap_or(""), 400)))
                .collect();
            kept_total += kept.len();
            out.push(json!({ "oldStart": h["oldStart"], "newStart": h["newStart"], "lines": kept }));
        }
    }
    (add, del, Value::Array(out))
}

fn created_file_patch(content: &str) -> (u32, u32, Value) {
    let lines: Vec<&str> = content.lines().collect();
    let kept: Vec<Value> = lines.iter().take(MAX_PATCH_LINES).map(|l| Value::String(format!("+{}", truncate(l, 400)))).collect();
    (lines.len() as u32, 0, json!([{ "oldStart": 0, "newStart": 1, "lines": kept }]))
}

/// Truncates long strings inside tool inputs (file contents, big edits) before they reach the UI.
fn trim_strings(v: &Value) -> Value {
    match v {
        Value::String(s) if s.len() > MAX_INPUT_STR => Value::String(truncate(s, MAX_INPUT_STR)),
        Value::Array(a) => Value::Array(a.iter().map(trim_strings).collect()),
        Value::Object(o) => Value::Object(o.iter().map(|(k, v)| (k.clone(), trim_strings(v))).collect::<Map<_, _>>()),
        other => other.clone(),
    }
}

fn strip_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    strip_ansi(out.trim())
}

pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for n in chars.by_ref() {
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rt() -> AgentRt {
        AgentRt::new(AgentMeta { id: "t".into(), cwd: "C:/p".into(), ..Default::default() })
    }

    #[test]
    fn streaming_text_then_final_message() {
        let mut a = rt();
        let mut fx = Effects::default();
        a.handle_frame(&json!({"type":"stream_event","event":{"type":"message_start","message":{"id":"m1","usage":{}}},"parent_tool_use_id":null}), &mut fx);
        a.handle_frame(&json!({"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}},"parent_tool_use_id":null}), &mut fx);
        a.handle_frame(&json!({"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Bon"}},"parent_tool_use_id":null}), &mut fx);
        a.handle_frame(&json!({"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"jour"}},"parent_tool_use_id":null}), &mut fx);
        assert_eq!(a.conv.get("m1:0").unwrap()["text"], "Bonjour");
        a.handle_frame(&json!({"type":"assistant","message":{"id":"m1","content":[{"type":"text","text":"Bonjour !"}]},"parent_tool_use_id":null}), &mut fx);
        let item = a.conv.get("m1:0").unwrap();
        assert_eq!(item["text"], "Bonjour !");
        assert_eq!(item["streaming"], false);
        assert_eq!(a.meta.status, AgentStatus::Running);
    }

    #[test]
    fn question_then_result_usage_deltas() {
        let mut a = rt();
        let mut fx = Effects::default();
        a.handle_frame(&json!({"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"AskUserQuestion","tool_use_id":"tu1","input":{"questions":[{"question":"Q?","options":[]}]}}}), &mut fx);
        assert_eq!(a.meta.status, AgentStatus::Waiting);
        assert_eq!(fx.notify, Some(NotifyKind::Question));
        assert!(a.has_pending("r1"));

        let usage = |inp: u64, out: u64, cost: f64| json!({"type":"result","subtype":"success","is_error":false,"duration_ms":10,
            "modelUsage":{"claude-sonnet-5":{"inputTokens":inp,"outputTokens":out,"cacheReadInputTokens":100,"cacheCreationInputTokens":0,"costUSD":cost}}});
        let mut fx = Effects::default();
        a.handle_frame(&usage(10, 20, 0.5), &mut fx);
        assert_eq!(fx.turns.len(), 1);
        assert_eq!(fx.turns[0].input, 10);
        assert_eq!(fx.turns[0].cache, 100);
        assert!(!a.has_pending("r1"));
        assert_eq!(a.meta.status, AgentStatus::Done);

        let mut fx = Effects::default();
        a.handle_frame(&usage(15, 50, 0.8), &mut fx);
        assert_eq!(fx.turns[0].input, 5);
        assert_eq!(fx.turns[0].output, 30);
        assert_eq!(fx.turns[0].cache, 0);
        assert!((fx.turns[0].cost - 0.3).abs() < 1e-9);
        assert!((a.meta.cost - 0.8).abs() < 1e-9);
    }

    #[test]
    fn tool_result_counts_patch_and_touches_file() {
        let mut a = rt();
        let mut fx = Effects::default();
        a.handle_frame(&json!({"type":"assistant","message":{"id":"m2","content":[{"type":"tool_use","id":"tu9","name":"Edit","input":{"file_path":"C:/p/src/a.ts"}}]},"parent_tool_use_id":null}), &mut fx);
        a.handle_frame(&json!({"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tu9","content":"ok"}]},
            "tool_use_result":{"filePath":"C:/p/src/a.ts","structuredPatch":[{"oldStart":1,"newStart":1,"lines":[" a","-b","+c","+d"]}]}}), &mut fx);
        let item = a.conv.get("tu9").unwrap();
        assert_eq!(item["status"], "ok");
        assert_eq!(item["result"]["add"], 2);
        assert_eq!(item["result"]["del"], 1);
        assert_eq!(a.meta.touched_files, vec!["src/a.ts".to_string()]);
    }

    #[test]
    fn ansi_and_tags_are_stripped() {
        assert_eq!(strip_ansi("\u{1b}[31mrouge\u{1b}[0m"), "rouge");
        assert_eq!(strip_tags("<local-command-stdout>ok</local-command-stdout>"), "ok");
    }
}
