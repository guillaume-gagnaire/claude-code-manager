//! Opens files and folders in the user's editor without going through a shell.

use anyhow::{anyhow, Result};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

/// Splits an editor setting into program and arguments, honouring double quotes:
/// `"C:\Program Files\Zed\zed.exe" --new` → (`C:\Program Files\Zed\zed.exe`, [`--new`]).
pub fn parse_command(s: &str) -> Option<(String, Vec<String>)> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    let (mut quoted, mut has_token) = (false, false);
    for c in s.chars() {
        match c {
            '"' => {
                quoted = !quoted;
                has_token = true;
            }
            c if c.is_whitespace() && !quoted => {
                if has_token {
                    parts.push(std::mem::take(&mut cur));
                    has_token = false;
                }
            }
            c => {
                cur.push(c);
                has_token = true;
            }
        }
    }
    if has_token {
        parts.push(cur);
    }
    let mut it = parts.into_iter();
    let program = it.next()?;
    Some((program, it.collect()))
}

/// Resolves a bare program name through `path_var` and the `pathext` extensions
/// (`code` → `…\Microsoft VS Code\bin\code.cmd`). Paths are returned as is when they exist.
pub fn resolve_program(program: &str, path_var: Option<&OsStr>, pathext: &str) -> Option<PathBuf> {
    let p = Path::new(program);
    if p.components().count() > 1 || p.is_absolute() {
        return p.is_file().then(|| p.to_path_buf());
    }
    let exts: Vec<String> = std::iter::once(String::new())
        .chain(
            pathext
                .split(';')
                .filter(|e| !e.is_empty())
                .map(|e| e.to_lowercase()),
        )
        .collect();
    for dir in std::env::split_paths(path_var?) {
        for ext in &exts {
            let candidate = dir.join(format!("{program}{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Opens `target` with the configured editor command.
pub fn open(editor: &str, target: &str) -> Result<()> {
    let (program, mut args) =
        parse_command(editor).ok_or_else(|| anyhow!("aucun éditeur configuré"))?;
    let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let exe = resolve_program(&program, std::env::var_os("PATH").as_deref(), &pathext).ok_or_else(
        || anyhow!("éditeur « {program} » introuvable (vérifie le réglage « Éditeur »)"),
    )?;
    args.push(target.to_string());
    let mut cmd = std::process::Command::new(&exe);
    cmd.args(&args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(crate::claude::CREATE_NO_WINDOW);
    }
    // Spawned directly: std escapes the arguments (including for .cmd scripts), no shell parses them.
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| anyhow!("impossible de lancer {} : {e}", exe.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_programs_arguments_and_quotes() {
        assert_eq!(parse_command("code"), Some(("code".into(), vec![])));
        assert_eq!(
            parse_command("  code -n  "),
            Some(("code".into(), vec!["-n".into()]))
        );
        assert_eq!(
            parse_command(r#""C:\Program Files\Zed\zed.exe" --new "a b""#),
            Some((
                r"C:\Program Files\Zed\zed.exe".into(),
                vec!["--new".into(), "a b".into()]
            ))
        );
        assert_eq!(parse_command("   "), None);
    }

    #[test]
    fn resolves_through_path_and_pathext() {
        let dir = crate::paths::test_dir("editor-resolve");
        std::fs::write(dir.join("code.cmd"), "@echo off").unwrap();
        let path = std::env::join_paths([PathBuf::from(r"C:\nowhere"), dir.clone()]).unwrap();
        let found = resolve_program("code", Some(path.as_os_str()), ".COM;.EXE;.BAT;.CMD").unwrap();
        assert_eq!(found, dir.join("code.cmd"));
        assert_eq!(
            resolve_program("missing-editor", Some(path.as_os_str()), ".EXE;.CMD"),
            None
        );
        let explicit = dir.join("code.cmd");
        assert_eq!(
            resolve_program(&explicit.to_string_lossy(), None, ""),
            Some(explicit)
        );
    }

    #[test]
    fn passes_the_target_verbatim_without_a_shell() {
        let dir = crate::paths::test_dir("editor-open");
        let out = dir.join("argv.json");
        let script = dir.join("record.cjs");
        std::fs::write(
            &script,
            format!(
                "require('fs').writeFileSync({:?}, JSON.stringify(process.argv.slice(2)))",
                out.to_string_lossy()
            ),
        )
        .unwrap();
        let target = r"C:\dev\R&D\app & echo pwned %PATH%";
        open(&format!("node \"{}\"", script.display()), target).unwrap();
        for _ in 0..100 {
            if out.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let argv: Vec<String> =
            serde_json::from_str(&std::fs::read_to_string(&out).unwrap()).unwrap();
        assert_eq!(argv, vec![target.to_string()]);
    }

    #[test]
    fn reports_an_unknown_editor() {
        let err = open("definitely-not-an-editor-ccm", "C:/x")
            .unwrap_err()
            .to_string();
        assert!(err.contains("definitely-not-an-editor-ccm"), "{err}");
    }
}
