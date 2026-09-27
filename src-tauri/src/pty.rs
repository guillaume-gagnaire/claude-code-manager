//! Integrated terminals: real pseudo-consoles (ConPTY) streamed to xterm.js.

use crate::model::Settings;
use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub id: String,
    pub label: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TermInfo {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub shell: String,
}

struct Term {
    info: TermInfo,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default, Clone)]
pub struct PtyManager {
    terms: Arc<Mutex<HashMap<String, Term>>>,
}

fn find_on_path(exe: &str) -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|d| d.join(exe))
        .find(|p| p.is_file())
}

fn first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|p| p.is_file()).cloned()
}

pub fn detect_shells(s: &Settings) -> Vec<ShellInfo> {
    let mut out = Vec::new();
    let pwsh = if !s.pwsh_path.is_empty() {
        Some(PathBuf::from(&s.pwsh_path))
    } else {
        find_on_path("pwsh.exe")
            .or_else(|| first_existing(&[PathBuf::from(r"C:\Program Files\PowerShell\7\pwsh.exe")]))
    };
    if let Some(p) = pwsh.filter(|p| p.is_file()) {
        out.push(ShellInfo {
            id: "pwsh".into(),
            label: "PowerShell".into(),
            path: p.to_string_lossy().into(),
        });
    }
    let bash = if !s.bash_path.is_empty() {
        Some(PathBuf::from(&s.bash_path))
    } else {
        let from_git = find_on_path("git.exe").and_then(|g| {
            let root = g.parent()?.parent()?.to_path_buf();
            first_existing(&[
                root.join("bin").join("bash.exe"),
                root.join("usr").join("bin").join("bash.exe"),
            ])
        });
        from_git.or_else(|| first_existing(&[PathBuf::from(r"C:\Program Files\Git\bin\bash.exe")]))
    };
    if let Some(p) = bash.filter(|p| p.is_file()) {
        out.push(ShellInfo {
            id: "bash".into(),
            label: "Git Bash".into(),
            path: p.to_string_lossy().into(),
        });
    }
    let wsl = PathBuf::from(r"C:\Windows\System32\wsl.exe");
    if wsl.is_file() {
        let label = if s.wsl_distro.is_empty() {
            "WSL".to_string()
        } else {
            format!("WSL ({})", s.wsl_distro)
        };
        out.push(ShellInfo {
            id: "wsl".into(),
            label,
            path: wsl.to_string_lossy().into(),
        });
    }
    out
}

impl PtyManager {
    #[allow(clippy::too_many_arguments)]
    pub fn spawn(
        &self,
        info: TermInfo,
        shell: &ShellInfo,
        wsl_distro: &str,
        cwd: &str,
        size: (u16, u16),
        env: Vec<(String, String)>,
        on_data: impl Fn(Vec<u8>) + Send + 'static,
        on_exit: impl FnOnce(Option<u32>) + Send + 'static,
    ) -> Result<()> {
        let pty = native_pty_system();
        let pair = pty
            .openpty(PtySize {
                rows: size.1.max(2),
                cols: size.0.max(10),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("{e}"))?;

        let mut cmd = CommandBuilder::new(&shell.path);
        match shell.id.as_str() {
            "pwsh" => cmd.arg("-NoLogo"),
            "bash" => {
                cmd.args(["--login", "-i"]);
                cmd.env("CHERE_INVOKING", "1");
            }
            "wsl" => {
                if !wsl_distro.is_empty() {
                    cmd.args(["-d", wsl_distro]);
                }
                cmd.args(["--cd", cwd]);
            }
            _ => {}
        }
        if Path::new(cwd).is_dir() {
            cmd.cwd(cwd);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        for (k, v) in env {
            cmd.env(k, v);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| anyhow!("{e}"))
            .context("lancement du shell")?;
        drop(pair.slave);
        let killer = child.clone_killer();
        let mut reader = pair.master.try_clone_reader().map_err(|e| anyhow!("{e}"))?;
        let writer = pair.master.take_writer().map_err(|e| anyhow!("{e}"))?;
        let id = info.id.clone();
        self.terms.lock().insert(
            id.clone(),
            Term {
                info,
                master: pair.master,
                writer,
                killer,
            },
        );

        std::thread::spawn(move || {
            let mut buf = vec![0u8; 32 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => on_data(buf[..n].to_vec()),
                }
            }
        });

        let terms = self.terms.clone();
        std::thread::spawn(move || {
            let code = child.wait().ok().map(|s| s.exit_code());
            // Dropping the master closes the pseudo-console, which ends the reader thread.
            terms.lock().remove(&id);
            on_exit(code);
        });
        Ok(())
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<()> {
        let mut terms = self.terms.lock();
        let t = terms.get_mut(id).ok_or_else(|| anyhow!("terminal fermé"))?;
        t.writer.write_all(data)?;
        t.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        let terms = self.terms.lock();
        let t = terms.get(id).ok_or_else(|| anyhow!("terminal fermé"))?;
        t.master
            .resize(PtySize {
                rows: rows.max(2),
                cols: cols.max(10),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("{e}"))
    }

    pub fn kill(&self, id: &str) {
        if let Some(mut t) = self.terms.lock().remove(id) {
            let _ = t.killer.kill();
        }
    }

    pub fn list(&self) -> Vec<TermInfo> {
        self.terms.lock().values().map(|t| t.info.clone()).collect()
    }

    pub fn kill_project(&self, project_id: &str) {
        let ids: Vec<String> = self
            .terms
            .lock()
            .values()
            .filter(|t| t.info.project_id == project_id)
            .map(|t| t.info.id.clone())
            .collect();
        for id in ids {
            self.kill(&id);
        }
    }

    pub fn kill_all(&self) {
        let ids: Vec<String> = self.terms.lock().keys().cloned().collect();
        for id in ids {
            self.kill(&id);
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    /// PIDs of running ping.exe processes.
    fn pings() -> Vec<u32> {
        let out = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq PING.EXE", "/FO", "CSV", "/NH"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter_map(|l| l.split("\",\"").nth(1)?.parse().ok())
            .collect()
    }

    fn alive(pid: u32) -> bool {
        let out = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
    }

    #[test]
    fn closing_a_terminal_kills_the_programs_it_started() {
        let pty = PtyManager::default();
        let out = Arc::new(Mutex::new(String::new()));
        let sink = out.clone();
        let Some(shell) = detect_shells(&Settings::default())
            .into_iter()
            .find(|s| s.id == "pwsh")
        else {
            eprintln!("PowerShell 7 not installed: skipped");
            return;
        };
        let info = TermInfo {
            id: "t1".into(),
            project_id: "p".into(),
            name: "pwsh-1".into(),
            shell: "pwsh".into(),
        };
        let cwd = std::env::temp_dir().to_string_lossy().to_string();
        // Behave like a terminal: answer every cursor position query (xterm.js does it in the app).
        let answer = pty.clone();
        let on_data = move |b: Vec<u8>| {
            let chunk = String::from_utf8_lossy(&b).to_string();
            if chunk.contains("\x1b[6n") {
                let _ = answer.write("t1", b"\x1b[1;1R");
            }
            sink.lock().push_str(&chunk);
        };
        pty.spawn(info, &shell, "", &cwd, (120, 30), vec![], on_data, |_| {})
            .unwrap();
        let start = Instant::now();
        while !out.lock().contains("PS ") {
            assert!(
                start.elapsed() < Duration::from_secs(20),
                "no prompt: {}",
                out.lock()
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        std::thread::sleep(Duration::from_millis(1500));
        let before = pings();
        pty.write("t1", b"ping -n 60 127.0.0.1\r").unwrap();
        let pid = loop {
            if let Some(p) = pings().into_iter().find(|p| !before.contains(p)) {
                break p;
            }
            assert!(
                start.elapsed() < Duration::from_secs(40),
                "ping did not start: {}",
                out.lock()
            );
            std::thread::sleep(Duration::from_millis(50));
        };
        assert!(alive(pid));
        pty.kill("t1");
        let start = Instant::now();
        while alive(pid) {
            assert!(
                start.elapsed() < Duration::from_secs(5),
                "node {pid} survived its terminal"
            );
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}
