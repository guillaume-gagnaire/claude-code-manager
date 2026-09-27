use std::path::{Path, PathBuf};

pub fn data_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude-code-manager")
}

pub fn state_file() -> PathBuf {
    data_dir().join("state.json")
}

pub fn settings_file() -> PathBuf {
    data_dir().join("settings.json")
}

pub fn conversations_dir() -> PathBuf {
    data_dir().join("conversations")
}

pub fn stats_db() -> PathBuf {
    data_dir().join("stats.db")
}

pub fn ensure_dirs() -> std::io::Result<()> {
    std::fs::create_dir_all(conversations_dir())
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
mod tests {
    use super::*;

    #[test]
    fn relative_paths() {
        assert_eq!(relative_slash("C:\\code\\app", "C:\\code\\app\\src\\a.ts"), "src/a.ts");
        assert_eq!(relative_slash("C:/code/app/", "c:/Code/App/README.md"), "README.md");
        assert_eq!(relative_slash("C:/code/app", "D:/other/x"), "D:/other/x");
    }
}
