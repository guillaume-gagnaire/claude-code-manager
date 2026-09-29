//! Opens files and folders in the user's editor without going through a shell.

use anyhow::{anyhow, Result};
use serde::Serialize;
use std::ffi::{OsStr, OsString};
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
/// With extensions to try, a name without one is never taken bare: that is the bash script
/// sitting next to `code.cmd`, which Windows cannot start.
pub fn resolve_program(program: &str, path_var: Option<&OsStr>, pathext: &str) -> Option<PathBuf> {
    let p = Path::new(program);
    if p.components().count() > 1 || p.is_absolute() {
        return p.is_file().then(|| p.to_path_buf());
    }
    let bare = pathext.split(';').all(|e| e.is_empty()) || p.extension().is_some();
    let exts: Vec<String> = bare
        .then(String::new)
        .into_iter()
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

/// An editor installed on this machine, offered in the "open in" menus and the settings.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorInfo {
    pub id: String,
    pub label: String,
    /// Its value for the "Éditeur" setting: the bare name when on the PATH, else the quoted path.
    pub command: String,
}

struct Known {
    id: &'static str,
    label: &'static str,
    cli: &'static str,
    /// Launchers, relative to `%LOCALAPPDATA%\Programs` (per-user install) or `%ProgramFiles%`.
    installs: &'static [&'static str],
}

const KNOWN: [Known; 3] = [
    Known {
        id: "vscode",
        label: "VS Code",
        cli: "code",
        installs: &[r"Microsoft VS Code\bin\code.cmd"],
    },
    Known {
        id: "cursor",
        label: "Cursor",
        cli: "cursor",
        installs: &[r"cursor\resources\app\bin\cursor.cmd", r"cursor\Cursor.exe"],
    },
    Known {
        id: "zed",
        label: "Zed",
        cli: "zed",
        installs: &[r"Zed\bin\zed.exe", r"Zed\Zed.exe"],
    },
];

/// Where editors are looked for; from the environment in the app, fake folders in tests.
pub struct EditorRoots {
    pub path: Option<OsString>,
    pub pathext: String,
    pub install_dirs: Vec<PathBuf>,
}

impl EditorRoots {
    fn from_env() -> Self {
        let var = |k: &str| std::env::var_os(k).map(PathBuf::from);
        EditorRoots {
            path: std::env::var_os("PATH"),
            pathext: std::env::var("PATHEXT").unwrap_or_else(|_| DEFAULT_PATHEXT.into()),
            install_dirs: [
                var("LOCALAPPDATA").map(|d| d.join("Programs")),
                var("ProgramFiles"),
            ]
            .into_iter()
            .flatten()
            .collect(),
        }
    }
}

const DEFAULT_PATHEXT: &str = ".COM;.EXE;.BAT;.CMD";

/// VS Code, Cursor and Zed, when installed.
pub fn detect() -> Vec<EditorInfo> {
    detect_in(&EditorRoots::from_env())
}

pub fn detect_in(r: &EditorRoots) -> Vec<EditorInfo> {
    KNOWN
        .iter()
        .filter_map(|k| {
            let on_path = resolve_program(k.cli, r.path.as_deref(), &r.pathext).filter(|p| {
                // Cursor puts a `code` launcher of its own on the PATH.
                k.id != "vscode" || !p.to_string_lossy().to_lowercase().contains("cursor")
            });
            let command = match on_path {
                Some(_) => k.cli.to_string(),
                None => {
                    let found = r
                        .install_dirs
                        .iter()
                        .flat_map(|d| k.installs.iter().map(move |i| d.join(i)))
                        .find(|p| p.is_file())?;
                    format!("\"{}\"", found.display())
                }
            };
            Some(EditorInfo {
                id: k.id.into(),
                label: k.label.into(),
                command,
            })
        })
        .collect()
}

/// The command opening files with `editor` (an id given by `detect`), else the configured one.
pub fn command_for(
    editor: Option<&str>,
    configured: &str,
    detected: &[EditorInfo],
) -> Result<String> {
    let Some(id) = editor else {
        return Ok(if configured.trim().is_empty() {
            "code".into()
        } else {
            configured.to_string()
        });
    };
    detected
        .iter()
        .find(|e| e.id == id)
        .map(|e| e.command.clone())
        .ok_or_else(|| {
            let label = KNOWN.iter().find(|k| k.id == id).map_or(id, |k| k.label);
            anyhow!("{label} est introuvable sur ce poste")
        })
}

/// Opens `target` with the configured editor command.
pub fn open(editor: &str, target: &str) -> Result<()> {
    let (program, mut args) =
        parse_command(editor).ok_or_else(|| anyhow!("aucun éditeur configuré"))?;
    let pathext = std::env::var("PATHEXT").unwrap_or_else(|_| DEFAULT_PATHEXT.into());
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
    fn skips_the_extensionless_shell_scripts_next_to_windows_launchers() {
        // VS Code's and Zed's bin folders hold a bash script `code` / `zed` beside code.cmd / zed.exe.
        let dir = crate::paths::test_dir("editor-resolve-scripts");
        std::fs::write(dir.join("code"), "#!/usr/bin/env sh").unwrap();
        std::fs::write(dir.join("code.cmd"), "@echo off").unwrap();
        let path = std::env::join_paths([dir.clone()]).unwrap();
        assert_eq!(
            resolve_program("code", Some(path.as_os_str()), ".EXE;.CMD"),
            Some(dir.join("code.cmd"))
        );
        // Without PATHEXT (Unix), the bare name is the program.
        assert_eq!(
            resolve_program("code", Some(path.as_os_str()), ""),
            Some(dir.join("code"))
        );
        // A name given with its extension is taken as is.
        assert_eq!(
            resolve_program("code.cmd", Some(path.as_os_str()), ".EXE;.CMD"),
            Some(dir.join("code.cmd"))
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

    fn touch(p: &Path) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, "").unwrap();
    }

    fn roots(path: &[PathBuf], install_dirs: Vec<PathBuf>) -> EditorRoots {
        EditorRoots {
            path: Some(std::env::join_paths(path).unwrap()),
            pathext: ".EXE;.CMD".into(),
            install_dirs,
        }
    }

    #[test]
    fn detects_editors_on_the_path_and_in_their_install_folders() {
        let dir = crate::paths::test_dir("editor-detect");
        let bin = dir.join("bin");
        let programs = dir.join("Programs");
        // VS Code on the PATH (its bash script beside), Zed installed off the PATH, no Cursor.
        touch(&bin.join("code"));
        touch(&bin.join("code.cmd"));
        let zed = programs.join("Zed").join("bin").join("zed.exe");
        touch(&zed);
        assert_eq!(
            detect_in(&roots(&[bin], vec![dir.join("elsewhere"), programs])),
            vec![
                EditorInfo {
                    id: "vscode".into(),
                    label: "VS Code".into(),
                    command: "code".into(),
                },
                EditorInfo {
                    id: "zed".into(),
                    label: "Zed".into(),
                    command: format!("\"{}\"", zed.display()),
                },
            ]
        );
    }

    #[test]
    fn the_code_launcher_of_cursor_is_not_vs_code() {
        let dir = crate::paths::test_dir("editor-detect-cursor");
        let bin = dir.join(r"Programs\cursor\resources\app\bin");
        touch(&bin.join("code.cmd"));
        touch(&bin.join("cursor.cmd"));
        let found = detect_in(&roots(&[bin], vec![]));
        assert_eq!(
            found.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
            vec!["cursor"]
        );
        assert_eq!(found[0].command, "cursor");
    }

    #[test]
    fn opens_with_the_chosen_editor_or_the_configured_command() {
        let detected = vec![EditorInfo {
            id: "zed".into(),
            label: "Zed".into(),
            command: r#""C:\Zed\zed.exe""#.into(),
        }];
        assert_eq!(
            command_for(Some("zed"), "code", &detected).unwrap(),
            r#""C:\Zed\zed.exe""#
        );
        assert_eq!(command_for(None, "subl -n", &detected).unwrap(), "subl -n");
        assert_eq!(command_for(None, "  ", &detected).unwrap(), "code");
        let err = command_for(Some("cursor"), "code", &detected)
            .unwrap_err()
            .to_string();
        assert!(err.contains("Cursor"), "{err}");
    }

    #[test]
    fn reports_an_unknown_editor() {
        let err = open("definitely-not-an-editor-ccm", "C:/x")
            .unwrap_err()
            .to_string();
        assert!(err.contains("definitely-not-an-editor-ccm"), "{err}");
    }
}
