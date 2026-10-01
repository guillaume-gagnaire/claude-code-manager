//! macOS starts apps from the Finder or the Dock with a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin):
//! `claude`, `git` from Homebrew, `node`, editors' command-line launchers… would not be found.
//! The app takes the PATH of the user's login shell instead, as a terminal would give it (the same
//! goes for Linux desktop launchers).

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const MARKER: &str = "__ESCOUADE_PATH__";

/// Merges the login shell's PATH into the process environment, before anything is spawned.
pub fn adopt_login_path() {
    let current = std::env::var_os("PATH").unwrap_or_default();
    let shell = std::env::var_os("SHELL")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/bin/zsh".into());
    let login = login_shell_path(Path::new(&shell));
    let home = dirs::home_dir();
    let merged = merge_paths(login.as_deref(), &current, home.as_deref());
    // Called first thing in `run`, before any other thread exists.
    std::env::set_var("PATH", merged);
}

/// The PATH an interactive login shell ends up with, or None if it fails or hangs.
fn login_shell_path(shell: &Path) -> Option<String> {
    let mut child = std::process::Command::new(shell)
        .args([
            "-ilc",
            &format!("printf '%s%s%s' {MARKER} \"$PATH\" {MARKER}"),
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    // A profile waiting for input or doing network calls must not block the launch.
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let out = child.wait_with_output().ok()?;
    extract(&String::from_utf8_lossy(&out.stdout))
}

/// The PATH between the markers: profiles may print anything around it.
fn extract(out: &str) -> Option<String> {
    let start = out.find(MARKER)? + MARKER.len();
    let len = out[start..].find(MARKER)?;
    Some(out[start..start + len].to_string()).filter(|p| !p.is_empty())
}

/// The login shell's entries, then the current ones, then the usual install folders, each once.
fn merge_paths(login: Option<&str>, current: &std::ffi::OsStr, home: Option<&Path>) -> OsString {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut push = |p: PathBuf| {
        if !p.as_os_str().is_empty() && !out.contains(&p) {
            out.push(p);
        }
    };
    if let Some(l) = login {
        std::env::split_paths(l).for_each(&mut push);
    }
    std::env::split_paths(current).for_each(&mut push);
    let usual = ["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from);
    usual.into_iter().for_each(&mut push);
    if let Some(h) = home {
        push(h.join(".local").join("bin"));
    }
    std::env::join_paths(out).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_path_among_what_the_profile_prints() {
        let out = format!("Welcome!\n{MARKER}/opt/homebrew/bin:/usr/bin{MARKER}");
        assert_eq!(extract(&out).as_deref(), Some("/opt/homebrew/bin:/usr/bin"));
        assert_eq!(extract("no marker"), None);
        assert_eq!(extract(&format!("{MARKER}{MARKER}")), None);
    }

    #[test]
    fn puts_the_login_path_first_without_duplicates() {
        let merged = merge_paths(
            Some("/opt/homebrew/bin:/usr/bin"),
            std::ffi::OsStr::new("/usr/bin:/bin"),
            Some(Path::new("/Users/me")),
        );
        assert_eq!(
            merged,
            OsString::from("/opt/homebrew/bin:/usr/bin:/bin:/usr/local/bin:/Users/me/.local/bin")
        );
    }

    #[test]
    fn reads_the_path_of_a_real_login_shell() {
        let path = login_shell_path(Path::new("/bin/sh")).expect("sh prints its PATH");
        assert!(path.contains("/bin"), "{path}");
    }
}
