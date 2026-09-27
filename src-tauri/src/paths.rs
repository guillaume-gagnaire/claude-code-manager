use std::path::{Path, PathBuf};

/// `~/.claude-code-manager`, or `$CCM_DATA_DIR` (used by sandboxed runs and end-to-end tests).
pub fn default_data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("CCM_DATA_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude-code-manager")
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
}
