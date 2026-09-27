//! Normalized conversation of an agent, persisted as a JSONL log of append/patch operations.

use crate::model::ConvOp;
use crate::paths;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;

pub struct Conv {
    agent_id: String,
    loaded: bool,
    items: Vec<Value>,
    index: HashMap<String, usize>,
    writer: Option<BufWriter<File>>,
}

impl Conv {
    pub fn new(agent_id: &str) -> Self {
        Self { agent_id: agent_id.to_string(), loaded: false, items: Vec::new(), index: HashMap::new(), writer: None }
    }

    fn path(&self) -> PathBuf {
        paths::conversations_dir().join(format!("{}.jsonl", self.agent_id))
    }

    pub fn ensure_loaded(&mut self) {
        if self.loaded {
            return;
        }
        self.loaded = true;
        let Ok(file) = File::open(self.path()) else { return };
        let mut ops = 0usize;
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
            ops += 1;
            match v["op"].as_str() {
                Some("append") => self.apply_append(v["item"].clone()),
                Some("patch") => {
                    if let Some(id) = v["id"].as_str() {
                        self.apply_patch(id, &v["patch"]);
                    }
                }
                _ => {}
            }
        }
        if ops > self.items.len() * 2 + 64 {
            self.compact();
        }
    }

    /// Rewrites the log as one append per item.
    fn compact(&mut self) {
        self.writer = None;
        let mut out = String::new();
        for item in &self.items {
            out.push_str(&json!({ "op": "append", "item": item }).to_string());
            out.push('\n');
        }
        if let Err(e) = paths::write_atomic(&self.path(), out.as_bytes()) {
            log::warn!("conversation compaction failed: {e}");
        }
    }

    fn apply_append(&mut self, item: Value) {
        let Some(id) = item["id"].as_str().map(str::to_string) else { return };
        if let Some(&i) = self.index.get(&id) {
            self.items[i] = item;
        } else {
            self.index.insert(id, self.items.len());
            self.items.push(item);
        }
    }

    fn apply_patch(&mut self, id: &str, patch: &Value) {
        let Some(&i) = self.index.get(id) else { return };
        if let (Some(target), Some(fields)) = (self.items[i].as_object_mut(), patch.as_object()) {
            for (k, v) in fields {
                target.insert(k.clone(), v.clone());
            }
        }
    }

    /// Applies an operation in memory and persists it (streaming deltas are memory-only;
    /// the final text is persisted by a later patch).
    pub fn apply(&mut self, op: &ConvOp) {
        self.ensure_loaded();
        match op {
            ConvOp::Append { item } => self.apply_append(item.clone()),
            ConvOp::Patch { id, patch } => self.apply_patch(id, patch),
            ConvOp::Delta { id, text } => {
                if let Some(&i) = self.index.get(id) {
                    let cur = self.items[i]["text"].as_str().unwrap_or("").to_string();
                    self.items[i]["text"] = Value::String(cur + text);
                }
                return;
            }
        }
        self.persist(op);
    }

    fn persist(&mut self, op: &ConvOp) {
        if self.writer.is_none() {
            let _ = paths::ensure_dirs();
            match OpenOptions::new().create(true).append(true).open(self.path()) {
                Ok(f) => self.writer = Some(BufWriter::new(f)),
                Err(e) => {
                    log::warn!("cannot open conversation log: {e}");
                    return;
                }
            }
        }
        if let (Some(w), Ok(line)) = (self.writer.as_mut(), serde_json::to_string(op)) {
            let _ = w.write_all(line.as_bytes());
            let _ = w.write_all(b"\n");
            let _ = w.flush();
        }
    }

    pub fn items(&mut self) -> Vec<Value> {
        self.ensure_loaded();
        self.items.clone()
    }

    #[cfg(test)]
    pub fn get(&mut self, id: &str) -> Option<&Value> {
        self.ensure_loaded();
        self.index.get(id).map(|&i| &self.items[i])
    }

    pub fn ids_where(&mut self, pred: impl Fn(&Value) -> bool) -> Vec<String> {
        self.ensure_loaded();
        self.items.iter().filter(|v| pred(v)).filter_map(|v| v["id"].as_str().map(str::to_string)).collect()
    }

    pub fn delete_file(&mut self) {
        self.writer = None;
        let _ = std::fs::remove_file(self.path());
    }
}
