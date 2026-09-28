//! Integration tests of the application core: real git repositories, the fake `claude` CLI
//! (tests/fixtures/fake-claude.cmd) and Tauri's mock runtime.

use crate::core::Core;
use crate::model::*;
use crate::paths::{test_dir, DataDir};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::test::{mock_app, MockRuntime};

struct Harness {
    core: Arc<Core<MockRuntime>>,
    events: Arc<parking_lot::Mutex<Vec<Value>>>,
    dir: PathBuf,
    _app: tauri::App<MockRuntime>,
}

fn fake_cli() -> String {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("tests")
        .join("fixtures")
        .join("fake-claude.cmd")
        .to_string_lossy()
        .to_string()
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .expect("git");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A git repository with one commit.
fn repo(dir: &Path) -> PathBuf {
    let r = dir.join("repo");
    std::fs::create_dir_all(r.join("src")).unwrap();
    git(&r, &["init", "-q", "-b", "main"]);
    git(&r, &["config", "user.email", "t@t"]);
    git(&r, &["config", "user.name", "t"]);
    git(&r, &["config", "core.autocrlf", "false"]);
    std::fs::write(r.join("src").join("app.ts"), "const a = 1;\n").unwrap();
    git(&r, &["add", "-A"]);
    git(&r, &["commit", "-qm", "init"]);
    r
}

fn harness(name: &str) -> Harness {
    let dir = test_dir(name);
    let data = DataDir::new(dir.join("data"));
    data.ensure().unwrap();
    let settings = Settings {
        claude_path: fake_cli(),
        sound: false,
        os_notifications: false,
        idle_stop_minutes: 1,
        ..Default::default()
    };
    std::fs::write(data.settings_file(), serde_json::to_vec(&settings).unwrap()).unwrap();
    let app = mock_app();
    let (core, _rx) = Core::load(app.handle().clone(), data);
    let events = Arc::new(parking_lot::Mutex::new(Vec::new()));
    let sink = events.clone();
    core.hub.set_channel(Channel::new(move |body| {
        if let InvokeResponseBody::Json(s) = body {
            sink.lock().push(serde_json::from_str(&s).unwrap());
        }
        Ok(())
    }));
    Harness {
        core,
        events,
        dir,
        _app: app,
    }
}

impl Harness {
    async fn project(&self, worktrees: bool) -> (Project, PathBuf) {
        let r = repo(&self.dir);
        let p = self
            .core
            .create_project(
                &r.to_string_lossy(),
                "demo",
                "oklch(0.72 0.12 48)",
                worktrees,
                None,
            )
            .await
            .unwrap();
        (p, r)
    }

    fn agent(&self, id: &str) -> AgentMeta {
        self.core.agent(id).unwrap().lock().meta.clone()
    }

    fn items(&self, id: &str) -> Vec<Value> {
        self.core.agent(id).unwrap().lock().conv.items()
    }

    fn alive(&self, id: &str) -> bool {
        self.core.agent(id).unwrap().lock().proc.is_some()
    }

    async fn wait(&self, what: &str, pred: impl Fn(&Self) -> bool) {
        for _ in 0..750 {
            if pred(self) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("timed out waiting for {what}");
    }

    async fn turn(&self, id: &str, text: &str) {
        let before = self
            .items(id)
            .iter()
            .filter(|i| i["kind"] == "turn")
            .count();
        self.core
            .send_message(id, text.to_string(), vec![])
            .await
            .unwrap();
        self.wait("turn end", |h| {
            h.items(id).iter().filter(|i| i["kind"] == "turn").count() > before
                && !h.agent(id).status.is_active()
        })
        .await;
    }

    fn error_notices(&self, id: &str) -> Vec<String> {
        self.items(id)
            .iter()
            .filter(|i| i["kind"] == "notice" && i["level"] == "error")
            .map(|i| i["text"].as_str().unwrap().to_string())
            .collect()
    }

    fn launches(&self, cwd: &Path) -> Vec<Vec<String>> {
        let key: String = cwd
            .to_string_lossy()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect();
        let file = std::env::temp_dir().join(format!("fake-claude-{key}.jsonl"));
        std::fs::read_to_string(file)
            .unwrap_or_default()
            .lines()
            .map(|l| {
                serde_json::from_str::<Value>(l).unwrap()["argv"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|a| a.as_str().unwrap().to_string())
                    .collect()
            })
            .collect()
    }

    /// Remote Control requests received by the fake CLI started in `cwd`.
    fn remote_requests(&self, cwd: &Path) -> Vec<Value> {
        let key: String = cwd
            .to_string_lossy()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect();
        let file = std::env::temp_dir().join(format!("fake-claude-{key}.control.jsonl"));
        std::fs::read_to_string(file)
            .unwrap_or_default()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }

    fn removed_events(&self, id: &str) -> usize {
        self.events
            .lock()
            .iter()
            .filter(|e| e["type"] == "agentRemoved" && e["id"] == id)
            .count()
    }
}

#[tokio::test]
async fn a_message_runs_a_turn_and_records_the_cost() {
    let h = harness("turn");
    let (p, _) = h.project(false).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    h.turn(&a.meta.id, "Bonjour").await;
    assert_eq!(h.agent(&a.meta.id).status, AgentStatus::Done);
    assert!(h.core.stats.today_cost() > 0.0);
    assert!(h
        .items(&a.meta.id)
        .iter()
        .any(|i| i["text"] == "Bonjour, tu as dit : Bonjour"));
}

#[tokio::test]
async fn idle_stop_is_silent_and_the_next_message_resumes_the_session() {
    let h = harness("idle");
    let (p, r) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.turn(&id, "Premier").await;
    let session = h.agent(&id).session_id.unwrap();

    h.core.agent(&id).unwrap().lock().meta.last_activity = 0;
    h.core.stop_idle_processes();
    h.wait("idle stop", |h| !h.alive(&id)).await;
    tokio::time::sleep(Duration::from_millis(400)).await;
    assert_eq!(h.agent(&id).status, AgentStatus::Done);
    assert!(
        h.error_notices(&id).is_empty(),
        "{:?}",
        h.error_notices(&id)
    );

    h.turn(&id, "Second").await;
    assert_eq!(h.agent(&id).status, AgentStatus::Done);
    assert!(h
        .launches(&r)
        .last()
        .unwrap()
        .contains(&format!("--resume={session}")));
}

#[tokio::test]
async fn stopping_a_warmed_agent_that_never_ran_a_turn_is_silent() {
    let h = harness("warm");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.wait("warm-up", |h| h.alive(&id)).await;
    h.core.agent(&id).unwrap().lock().meta.last_activity = 0;
    h.core.stop_idle_processes();
    h.wait("idle stop", |h| !h.alive(&id)).await;
    tokio::time::sleep(Duration::from_millis(400)).await;
    assert_eq!(h.agent(&id).status, AgentStatus::Idle);
    assert!(
        h.error_notices(&id).is_empty(),
        "{:?}",
        h.error_notices(&id)
    );
}

#[tokio::test]
async fn a_freshly_started_process_is_not_idle_stopped() {
    let h = harness("fresh");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.core.agent(&id).unwrap().lock().meta.last_activity = 0;
    h.core.ensure_process(&id).await.unwrap();
    h.core.stop_idle_processes();
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(h.alive(&id));
}

#[tokio::test]
async fn archiving_is_silent_and_a_restored_agent_resumes() {
    let h = harness("archive");
    let (p, r) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.turn(&id, "Premier").await;
    let session = h.agent(&id).session_id.unwrap();
    h.core.archive_agent(&id, true).await.unwrap();
    h.wait("archived", |h| !h.alive(&id)).await;
    tokio::time::sleep(Duration::from_millis(400)).await;
    assert!(h.error_notices(&id).is_empty());
    h.core.archive_agent(&id, false).await.unwrap();
    h.turn(&id, "Retour").await;
    assert!(h
        .launches(&r)
        .last()
        .unwrap()
        .contains(&format!("--resume={session}")));
}

#[tokio::test]
async fn a_message_after_a_crash_restarts_claude() {
    let h = harness("crash");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.core
        .send_message(&id, "crash".into(), vec![])
        .await
        .unwrap();
    h.wait("crash", |h| h.agent(&id).status == AgentStatus::Error)
        .await;
    h.turn(&id, "Bonjour").await;
    assert_eq!(h.agent(&id).status, AgentStatus::Done);
}

#[tokio::test]
async fn an_unknown_session_is_replaced_and_the_message_still_delivered() {
    let h = harness("stale");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.wait("warm-up", |h| h.alive(&id)).await;
    {
        let a = h.core.agent(&id).unwrap();
        let mut rt = a.lock();
        if let Some(p) = rt.detach() {
            p.kill();
        }
        rt.meta.session_id = Some("missing-123".into());
    }
    h.turn(&id, "Bonjour").await;
    assert_eq!(h.agent(&id).status, AgentStatus::Done);
    assert!(h
        .items(&id)
        .iter()
        .any(|i| i["text"] == "Bonjour, tu as dit : Bonjour"));
    assert_ne!(h.agent(&id).session_id.as_deref(), Some("missing-123"));
}

#[tokio::test]
async fn interrupting_an_idle_agent_does_not_swallow_the_next_notification() {
    let h = harness("interrupt");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.core.ensure_process(&id).await.unwrap();
    h.core.interrupt(&id).await.unwrap();
    assert!(!h.core.agent(&id).unwrap().lock().interrupted);
}

#[tokio::test]
async fn killing_an_agent_kills_its_whole_process_tree() {
    let h = harness("tree");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.turn(&id, "grandchild").await;
    let text = h
        .items(&id)
        .iter()
        .rev()
        .find(|i| i["kind"] == "text")
        .unwrap()["text"]
        .as_str()
        .unwrap()
        .to_string();
    let pid: u32 = text.trim_start_matches("pid:").parse().unwrap();
    assert!(process_exists(pid));
    h.core.delete_agent(&id, false).await.unwrap();
    for _ in 0..100 {
        if !process_exists(pid) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("grandchild {pid} survived the agent");
}

fn process_exists(pid: u32) -> bool {
    let out = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
}

#[tokio::test]
async fn deleting_an_agent_removes_its_worktree_and_branch() {
    let h = harness("delete-wt");
    let (p, r) = h.project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let wt = a.meta.worktree.clone().expect("worktree created");
    assert!(Path::new(&wt.path).is_dir());
    h.core.delete_agent(&a.meta.id, true).await.unwrap();
    assert!(!Path::new(&wt.path).exists());
    assert_eq!(git(&r, &["branch", "--list", &wt.branch]), "");
    assert_eq!(h.removed_events(&a.meta.id), 1);
}

#[tokio::test]
async fn deleting_an_agent_whose_worktree_vanished_still_removes_it() {
    let h = harness("delete-gone");
    let (p, _) = h.project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let wt = a.meta.worktree.clone().unwrap();
    h.wait("warm-up", |h| h.alive(&a.meta.id)).await;
    if let Some(proc) = h.core.agent(&a.meta.id).unwrap().lock().detach() {
        proc.kill();
    }
    tokio::time::sleep(Duration::from_millis(300)).await;
    std::fs::remove_dir_all(&wt.path).unwrap();
    h.core.delete_agent(&a.meta.id, true).await.unwrap();
    assert!(h.core.agent(&a.meta.id).is_err());
    assert_eq!(h.removed_events(&a.meta.id), 1);
}

/// Commits `content` into src/app.ts of `dir`.
fn commit_change(dir: &Path, content: &str, msg: &str) {
    std::fs::write(dir.join("src").join("app.ts"), content).unwrap();
    git(
        dir,
        &[
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-qam",
            msg,
        ],
    );
}

#[tokio::test]
async fn merging_refuses_a_dirty_main_checkout() {
    let h = harness("merge-dirty");
    let (p, r) = h.project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    commit_change(
        Path::new(&a.meta.worktree.as_ref().unwrap().path),
        "const a = 2;\n",
        "agent change",
    );
    std::fs::write(r.join("src").join("app.ts"), "const a = 99; // wip\n").unwrap();
    let err = h
        .core
        .merge_agent(&a.meta.id, true)
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("non commit"), "{err}");
    assert_eq!(
        std::fs::read_to_string(r.join("src").join("app.ts")).unwrap(),
        "const a = 99; // wip\n"
    );
}

#[tokio::test]
async fn a_conflicting_squash_merge_leaves_the_main_checkout_clean() {
    let h = harness("merge-conflict");
    let (p, r) = h.project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    commit_change(
        Path::new(&a.meta.worktree.as_ref().unwrap().path),
        "const a = 2;\n",
        "agent change",
    );
    commit_change(&r, "const a = 3;\n", "main change");
    assert!(h.core.merge_agent(&a.meta.id, true).await.is_err());
    assert_eq!(git(&r, &["status", "--porcelain"]), "");
    assert_eq!(
        std::fs::read_to_string(r.join("src").join("app.ts")).unwrap(),
        "const a = 3;\n"
    );
}

#[tokio::test]
async fn a_clean_squash_merge_lands_one_commit() {
    let h = harness("merge-ok");
    let (p, r) = h.project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    commit_change(
        Path::new(&a.meta.worktree.as_ref().unwrap().path),
        "const a = 2;\n",
        "agent change",
    );
    h.core.merge_agent(&a.meta.id, true).await.unwrap();
    assert_eq!(
        std::fs::read_to_string(r.join("src").join("app.ts")).unwrap(),
        "const a = 2;\n"
    );
    assert_eq!(git(&r, &["rev-list", "--count", "HEAD"]), "2");
}

#[tokio::test]
async fn the_git_log_shows_every_agent_branch_and_which_one_is_the_agents() {
    let h = harness("git-log");
    let (p, _r) = h.project(true).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let wt = a.meta.worktree.clone().unwrap();
    commit_change(Path::new(&wt.path), "const a = 2;\n", "agent change");

    let log = h
        .core
        .git_log(&p.id, Some(a.meta.id.clone()))
        .await
        .unwrap();
    assert_eq!(log.head.as_deref(), Some(wt.branch.as_str()));
    let c = log
        .commits
        .iter()
        .find(|c| c.subject == "agent change")
        .expect("agent commit listed");
    assert!(c.refs.contains(&wt.branch), "{:?}", c.refs);
    assert_eq!(
        h.core.git_log(&p.id, None).await.unwrap().head.as_deref(),
        Some("main")
    );

    let patch = h.core.git_show(&p.id, &c.hash).await.unwrap();
    assert!(patch.contains("+const a = 2;"), "{patch}");
}

#[tokio::test]
async fn git_counts_attribute_files_to_the_agent_that_edited_them() {
    let h = harness("git-counts");
    let (p, r) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.turn(&id, "edit").await; // the fake edits src/app.ts (reported only; write it for git)
    std::fs::write(r.join("src").join("app.ts"), "const a = 2;\nconst b = 3;\n").unwrap();
    std::fs::write(r.join("notes.md"), "x\n").unwrap();
    h.core.compute_git(&p.id).await;
    let info = h.core.git_cache.read().get(&p.id).cloned().unwrap();
    assert_eq!((info.modified, info.added, info.total), (1, 1, 2));
    assert_eq!(info.agents.get(&id), Some(&1));
    let files = h.core.git_files(&p.id, Some(id.clone())).await.unwrap();
    assert_eq!(
        files
            .iter()
            .map(|f| (f.path.as_str(), f.add, f.del))
            .collect::<Vec<_>>(),
        vec![("src/app.ts", 2, 1)]
    );
}

#[tokio::test]
async fn streaming_deltas_reach_the_ui_batched_and_in_order() {
    let h = harness("batch");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.turn(&id, "Bonjour").await;
    h.core.flush_conv();
    let ops: Vec<Value> = h
        .events
        .lock()
        .iter()
        .filter(|e| e["type"] == "conv" && e["agentId"] == id.as_str())
        .flat_map(|e| e["ops"].as_array().unwrap().clone())
        .collect();
    let text_id = ops
        .iter()
        .find(|o| o["op"] == "append" && o["item"]["kind"] == "text")
        .unwrap()["item"]["id"]
        .clone();
    let for_text: Vec<&Value> = ops
        .iter()
        .filter(|o| o["id"] == text_id || o["item"]["id"] == text_id)
        .collect();
    let kinds: Vec<&str> = for_text.iter().map(|o| o["op"].as_str().unwrap()).collect();
    assert_eq!(
        kinds,
        vec!["append", "delta", "patch"],
        "the fake streams several chunks, merged into one delta"
    );
    assert_eq!(for_text[1]["text"], "Bonjour, tu as dit : Bonjour");
}

#[tokio::test]
async fn agents_created_at_the_same_time_get_distinct_names() {
    let h = harness("names");
    let (p, _) = h.project(true).await;
    let (a, b) = tokio::join!(
        h.core.create_agent(&p.id, None),
        h.core.create_agent(&p.id, None)
    );
    let (a, b) = (a.unwrap(), b.unwrap());
    assert_ne!(a.meta.name, b.meta.name);
    assert_ne!(a.meta.worktree.unwrap().path, b.meta.worktree.unwrap().path);
}

#[tokio::test]
async fn state_is_saved_and_reloaded_with_the_session() {
    let h = harness("persist");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.turn(&id, "Bonjour").await;
    h.core.save_now();
    let app = mock_app();
    let (reloaded, _rx) = Core::load(app.handle().clone(), h.core.data.clone());
    let meta = reloaded.agent(&id).unwrap().lock().meta.clone();
    assert_eq!(meta.session_id, h.agent(&id).session_id);
    assert_eq!(meta.status, AgentStatus::Done);
    assert_eq!(
        reloaded.agent(&id).unwrap().lock().conv.items().len(),
        h.items(&id).len()
    );
}

#[tokio::test]
async fn remote_control_links_the_agent_to_claude_ai() {
    let h = harness("remote-on");
    let (p, r) = h.project(false).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let id = a.meta.id.clone();
    h.core.set_remote_control(&id, true).await.unwrap();
    let m = h.agent(&id);
    assert!(m.remote_control);
    let session = m.remote_session.clone().expect("remote session kept");
    assert_eq!(
        m.remote_url.as_deref(),
        Some(format!("https://claude.ai/code/session_{}", &session[4..]).as_str())
    );
    let req = h.remote_requests(&r).pop().unwrap();
    assert_eq!(req["enabled"], true);
    assert_eq!(req["keep_session_on_exit"], true);
    assert_eq!(req["name"], format!("demo · {}", m.name));
    h.wait("link connected", |h| {
        h.core
            .agent(&id)
            .unwrap()
            .lock()
            .view()
            .remote_state
            .as_deref()
            == Some("connected")
    })
    .await;
    // Messages sent from claude.ai are re-emitted to the app.
    assert!(h
        .launches(&r)
        .last()
        .unwrap()
        .contains(&"--replay-user-messages".to_string()));
}

#[tokio::test]
async fn a_remote_agent_gets_its_remote_session_back_after_a_restart() {
    let h = harness("remote-reattach");
    let (p, r) = h.project(false).await;
    let a = h.core.create_agent(&p.id, None).await.unwrap();
    let id = a.meta.id.clone();
    h.core.set_remote_control(&id, true).await.unwrap();
    let session = h.agent(&id).remote_session.unwrap();
    let old = h.core.agent(&id).unwrap().lock().detach().unwrap();
    old.close_input();
    h.core.ensure_process(&id).await.unwrap();
    let req = h.remote_requests(&r).pop().unwrap();
    assert_eq!(req["reattach_session_id"], session.as_str());
    assert_eq!(
        h.agent(&id).remote_session.as_deref(),
        Some(session.as_str())
    );
}

#[tokio::test]
async fn remote_agents_stay_reachable_instead_of_being_idle_stopped() {
    let h = harness("remote-idle");
    let (p, _) = h.project(false).await;
    let remote = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    let local = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.core.set_remote_control(&remote, true).await.unwrap();
    h.core.ensure_process(&local).await.unwrap();
    for id in [&remote, &local] {
        h.core.agent(id).unwrap().lock().meta.last_activity = 0;
    }
    h.core.stop_idle_processes();
    assert!(h.alive(&remote));
    assert!(!h.alive(&local));
}

#[tokio::test]
async fn turning_remote_control_off_ends_the_remote_session() {
    let h = harness("remote-off");
    let (p, r) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    h.core.set_remote_control(&id, true).await.unwrap();
    h.core.set_remote_control(&id, false).await.unwrap();
    let m = h.agent(&id);
    assert!(!m.remote_control);
    assert_eq!((m.remote_session, m.remote_url), (None, None));
    assert_eq!(h.remote_requests(&r).pop().unwrap()["enabled"], false);
}

#[tokio::test]
async fn remote_agents_are_started_with_the_app() {
    let h = harness("remote-startup");
    let (p, _) = h.project(false).await;
    let id = h.core.create_agent(&p.id, None).await.unwrap().meta.id;
    // Creating an agent warms its process up: let it start, then stop it, so that only
    // start_remote_agents can start (and link) the next one.
    h.core.ensure_process(&id).await.unwrap();
    // The warm-up task only runs when the test yields (single-threaded runtime): let it finish.
    tokio::time::sleep(Duration::from_millis(300)).await;
    h.core
        .agent(&id)
        .unwrap()
        .lock()
        .detach()
        .unwrap()
        .close_input();
    h.core.agent(&id).unwrap().lock().meta.remote_control = true;
    assert!(!h.alive(&id));
    h.core.start_remote_agents();
    h.wait("remote agent started", |h| {
        h.agent(&id).remote_url.is_some()
    })
    .await;
}
