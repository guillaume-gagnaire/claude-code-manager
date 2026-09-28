use std::path::{Path, PathBuf};

// The app was « Claude Code Manager » until 0.1.3: what it keeps on disk moves to its new names
// on the first launch that finds it under the old ones.

pub const DATA_DIR_NAME: &str = ".escouade";
const OLD_DATA_DIR_NAME: &str = ".claude-code-manager";
/// The app identifier (tauri.conf.json), which names its WebView and window-state folders.
const IDENTIFIER: &str = "dev.gagnaire.escouade";
const OLD_IDENTIFIER: &str = "dev.gagnaire.claude-code-manager";
/// Prefix of the agents' worktree branches (agents made before 0.1.4 keep `ccm/`).
pub const BRANCH_PREFIX: &str = "escouade/";

/// Moves `old` to `new` when only `old` exists, and returns the folder to use: `new`, or `old`
/// when it could not be moved (in use), in which case the next launch tries again.
pub fn migrate_dir(
    old: &Path,
    new: &Path,
    rename: impl Fn(&Path, &Path) -> std::io::Result<()>,
) -> PathBuf {
    if new.exists() || !old.exists() {
        return new.to_path_buf();
    }
    match rename(old, new) {
        Ok(()) => new.to_path_buf(),
        Err(_) => old.to_path_buf(),
    }
}

/// A sandboxed data folder (end-to-end tests, demos): `$ESCOUADE_DATA_DIR`, or the former
/// `$CCM_DATA_DIR`.
pub fn sandbox_dir() -> Option<PathBuf> {
    sandbox_dir_from(|k| std::env::var_os(k))
}

fn sandbox_dir_from(var: impl Fn(&str) -> Option<std::ffi::OsString>) -> Option<PathBuf> {
    ["ESCOUADE_DATA_DIR", "CCM_DATA_DIR"]
        .into_iter()
        .find_map(|k| var(k).filter(|d| !d.is_empty()))
        .map(PathBuf::from)
}

/// `~/.escouade` (moved from `~/.claude-code-manager`), or the sandboxed folder.
pub fn default_data_dir() -> PathBuf {
    if let Some(dir) = sandbox_dir() {
        return dir;
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    migrate_dir(
        &home.join(OLD_DATA_DIR_NAME),
        &home.join(DATA_DIR_NAME),
        |a, b| std::fs::rename(a, b),
    )
}

/// Moves the WebView and window-state folders, named after the app identifier, to the new
/// identifier. Runs before the window is created; sandboxed runs leave them alone.
pub fn migrate_app_folders() {
    if sandbox_dir().is_some() {
        return;
    }
    for base in [dirs::data_local_dir(), dirs::config_dir()]
        .into_iter()
        .flatten()
    {
        migrate_dir(
            &base.join(OLD_IDENTIFIER),
            &base.join(IDENTIFIER),
            |a, b| std::fs::rename(a, b),
        );
    }
}

/// Layout of the app's data folder. Injected so tests run on throwaway folders.
#[derive(Debug, Clone)]
pub struct DataDir(PathBuf);

impl DataDir {
    pub fn new(root: PathBuf) -> Self {
        Self(root)
    }

    pub fn state_file(&self) -> PathBuf {
        self.0.join("state.json")
    }

    pub fn settings_file(&self) -> PathBuf {
        self.0.join("settings.json")
    }

    pub fn conversations(&self) -> PathBuf {
        self.0.join("conversations")
    }

    pub fn stats_db(&self) -> PathBuf {
        self.0.join("stats.db")
    }

    pub fn log_file(&self) -> PathBuf {
        self.0.join("app.log")
    }

    pub fn ensure(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(self.conversations())
    }
}

/// Writes a file atomically (temp file + rename) so a crash never leaves a truncated file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

/// Path relative to `base`, with forward slashes. Falls back to the input when unrelated.
pub fn relative_slash(base: &str, path: &str) -> String {
    let norm = |s: &str| s.replace('\\', "/").trim_end_matches('/').to_string();
    let (b, p) = (norm(base), norm(path));
    let (bl, pl) = (b.to_lowercase(), p.to_lowercase());
    if pl.starts_with(&(bl.clone() + "/")) {
        p[b.len() + 1..].to_string()
    } else {
        p
    }
}

#[cfg(test)]
pub fn test_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("ccm-test-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_paths() {
        assert_eq!(
            relative_slash("C:\\code\\app", "C:\\code\\app\\src\\a.ts"),
            "src/a.ts"
        );
        assert_eq!(
            relative_slash("C:/code/app/", "c:/Code/App/README.md"),
            "README.md"
        );
        assert_eq!(relative_slash("C:/code/app", "D:/other/x"), "D:/other/x");
    }

    #[test]
    fn data_dir_layout() {
        let d = DataDir::new(PathBuf::from("C:/data"));
        assert_eq!(d.state_file(), PathBuf::from("C:/data/state.json"));
        assert_eq!(d.conversations(), PathBuf::from("C:/data/conversations"));
    }

    fn rename(a: &Path, b: &Path) -> std::io::Result<()> {
        std::fs::rename(a, b)
    }

    #[test]
    fn a_folder_under_the_former_name_moves_to_the_new_one() {
        let d = test_dir("migrate-move");
        let (old, new) = (d.join(".claude-code-manager"), d.join(".escouade"));
        std::fs::create_dir_all(old.join("conversations")).unwrap();
        std::fs::write(old.join("state.json"), "{}").unwrap();
        assert_eq!(migrate_dir(&old, &new, rename), new);
        assert!(!old.exists());
        assert_eq!(
            std::fs::read_to_string(new.join("state.json")).unwrap(),
            "{}"
        );
        assert!(new.join("conversations").is_dir());
    }

    #[test]
    fn a_folder_already_under_the_new_name_wins_and_the_former_one_stays() {
        let d = test_dir("migrate-both");
        let (old, new) = (d.join("old"), d.join("new"));
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join("state.json"), "old").unwrap();
        assert_eq!(migrate_dir(&old, &new, rename), new);
        assert_eq!(
            std::fs::read_to_string(old.join("state.json")).unwrap(),
            "old"
        );
        assert!(!new.join("state.json").exists());
    }

    #[test]
    fn nothing_to_move_on_a_first_run() {
        let d = test_dir("migrate-none");
        let (old, new) = (d.join("old"), d.join("new"));
        assert_eq!(migrate_dir(&old, &new, rename), new);
        assert!(!old.exists() && !new.exists());
    }

    #[test]
    fn a_folder_that_cannot_move_keeps_being_used() {
        let d = test_dir("migrate-fail");
        let (old, new) = (d.join("old"), d.join("new"));
        std::fs::create_dir_all(&old).unwrap();
        let locked = |_: &Path, _: &Path| Err(std::io::Error::other("in use"));
        assert_eq!(migrate_dir(&old, &new, locked), old);
        assert!(old.is_dir() && !new.exists());
    }

    #[test]
    fn a_sandboxed_run_takes_the_new_variable_then_the_former_one() {
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            move |k: &str| {
                pairs
                    .iter()
                    .find(|(n, _)| *n == k)
                    .map(|(_, v)| std::ffi::OsString::from(v))
            }
        };
        assert_eq!(
            sandbox_dir_from(env(&[
                ("ESCOUADE_DATA_DIR", "C:/e"),
                ("CCM_DATA_DIR", "C:/c")
            ])),
            Some(PathBuf::from("C:/e"))
        );
        assert_eq!(
            sandbox_dir_from(env(&[("CCM_DATA_DIR", "C:/c")])),
            Some(PathBuf::from("C:/c"))
        );
        assert_eq!(sandbox_dir_from(env(&[("ESCOUADE_DATA_DIR", "")])), None);
        assert_eq!(sandbox_dir_from(env(&[])), None);
    }
}
