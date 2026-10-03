//! The embedded editor's access to files: a source's file list, reading and writing a file, and
//! the version a file is compared with.

use crate::paths::contained;
use anyhow::{anyhow, bail, Result};
use serde::Serialize;
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU64, Ordering};

/// Validate that `rel` is a normal file path component (not `.`, `sub/.`, or empty).
fn validate_rel(rel: &str) -> Result<()> {
    if rel.is_empty() {
        bail!("chemin invalide : ");
    }
    // The last component must be normal (not current dir, parent, etc).
    // Rust drops trailing `.` from components(), so also check the suffix.
    let path = Path::new(rel);
    match path.components().next_back() {
        Some(Component::Normal(_)) => {}
        _ => bail!("chemin invalide : {rel}"),
    }
    // Additional check: refuse if ends with `.` preceded by separator.
    if rel.ends_with("/.") || rel.ends_with("\\.") || rel == "." {
        bail!("chemin invalide : {rel}");
    }
    Ok(())
}

/// Create a temporary file with a unique name. Only succeeds if the file doesn't exist.
/// This prevents following symlinks/junctions at that name.
fn create_temp(tmp: &Path) -> std::io::Result<std::fs::File> {
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(tmp)
}

/// Larger files are not opened in the editor.
pub const MAX_EDIT_BYTES: u64 = 2 * 1024 * 1024;
/// Errors of `write` when the file is no longer what the editor read.
pub const CHANGED: &str = "changed";
pub const DELETED: &str = "deleted";

// Counter for unique temporary file names to prevent following symlinks.
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// What the editor gets of a file: its text with LF line endings, and how to write it back.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileText {
    /// "text", "binary" or "tooLarge" (no text for the last two).
    pub kind: &'static str,
    pub text: Option<String>,
    pub size: u64,
    /// Of the bytes on disk: tells whether the file changed since it was read.
    pub hash: String,
    /// "crlf" when most lines end so, else "lf".
    pub eol: &'static str,
    pub bom: bool,
}

/// FNV-1a of the bytes, with their length.
pub fn hash(bytes: &[u8]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}-{}", bytes.len())
}

pub fn decode(bytes: &[u8]) -> FileText {
    let (bom, body) = match bytes.strip_prefix(b"\xEF\xBB\xBF") {
        Some(rest) => (true, rest),
        None => (false, bytes),
    };
    let (size, h) = (bytes.len() as u64, hash(bytes));
    let binary = body[..body.len().min(8192)].contains(&0);
    let text = if binary {
        None
    } else {
        std::str::from_utf8(body).ok()
    };
    let Some(text) = text else {
        return FileText {
            kind: "binary",
            text: None,
            size,
            hash: h,
            eol: "lf",
            bom,
        };
    };
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count() - crlf;
    FileText {
        kind: "text",
        text: Some(text.replace("\r\n", "\n")),
        size,
        hash: h,
        eol: if crlf > lf { "crlf" } else { "lf" },
        bom,
    }
}

pub fn encode(text: &str, eol: &str, bom: bool) -> Vec<u8> {
    let mut out = Vec::with_capacity(text.len() + 3);
    if bom {
        out.extend_from_slice(b"\xEF\xBB\xBF");
    }
    if eol == "crlf" {
        out.extend_from_slice(text.replace("\r\n", "\n").replace('\n', "\r\n").as_bytes());
    } else {
        out.extend_from_slice(text.as_bytes());
    }
    out
}

pub fn read(root: &Path, rel: &str) -> Result<FileText> {
    validate_rel(rel)?;
    let path = contained(root, rel)?;
    let meta = match std::fs::metadata(&path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => bail!("{rel} introuvable"),
        Err(e) => return Err(e.into()),
    };
    if meta.is_dir() {
        bail!("{rel} est un dossier");
    }
    if meta.len() > MAX_EDIT_BYTES {
        return Ok(FileText {
            kind: "tooLarge",
            text: None,
            size: meta.len(),
            hash: String::new(),
            eol: "lf",
            bom: false,
        });
    }
    Ok(decode(&std::fs::read(&path)?))
}

/// Writes `text` back with the file's line endings and BOM, through a temporary file renamed
/// over it. With `expected`, refused (`changed` / `deleted`) when the file is no longer the one
/// read; without, written anyway (created if need be, parent folders included).
pub fn write(
    root: &Path,
    rel: &str,
    text: &str,
    eol: &str,
    bom: bool,
    expected: Option<&str>,
) -> Result<String> {
    validate_rel(rel)?;
    let mut path = contained(root, rel)?;

    // Resolve symlinks on all platforms, ensuring target is within root.
    if std::fs::symlink_metadata(&path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        let real = std::fs::canonicalize(&path)?;
        let real_root = std::fs::canonicalize(root)?;
        if !real.starts_with(&real_root) {
            bail!("chemin hors du dossier : {rel}");
        }
        path = real;
    }

    if let Some(exp) = expected {
        match std::fs::read(&path) {
            Ok(bytes) if hash(&bytes) != exp => bail!(CHANGED),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => bail!(DELETED),
            Err(e) => return Err(e.into()),
        }
    }

    // Refuse to write to read-only files.
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.permissions().readonly() {
            bail!("{rel} est en lecture seule");
        }
    }

    let bytes = encode(text, eol, bom);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let name = path
        .file_name()
        .ok_or_else(|| anyhow!("chemin invalide : {rel}"))?
        .to_string_lossy()
        .into_owned();

    // Create unique temp file name with PID and counter to avoid symlink attacks.
    let pid = std::process::id();
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp = path.with_file_name(format!(".{name}.{pid}-{counter}.escouade-tmp"));

    // Create temp file; only clean up if we successfully created it.
    let mut temp_file = create_temp(&tmp)?;

    use std::io::Write;
    if let Err(e) = temp_file.write_all(&bytes) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    drop(temp_file);

    #[cfg(unix)]
    if let Ok(meta) = std::fs::metadata(&path) {
        let _ = std::fs::set_permissions(&tmp, meta.permissions());
    }

    if let Err(e) = std::fs::rename(&tmp, &path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(hash(&bytes))
}

/// Writes bytes to a specific temporary path, handling the atomic rename.
/// Used by both `write()` and tests to allow parameterized temp paths.
fn write_via(path: &Path, tmp: &Path, bytes: &[u8]) -> Result<()> {
    let mut temp_file = create_temp(tmp)?;
    use std::io::Write;
    if let Err(e) = temp_file.write_all(bytes) {
        let _ = std::fs::remove_file(tmp);
        return Err(e.into());
    }
    drop(temp_file);

    #[cfg(unix)]
    if let Ok(meta) = std::fs::metadata(path) {
        let _ = std::fs::set_permissions(tmp, meta.permissions());
    }

    if let Err(e) = std::fs::rename(tmp, path) {
        let _ = std::fs::remove_file(tmp);
        return Err(e.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::test_dir;

    #[test]
    fn decodes_text_line_endings_bom_and_binary() {
        let t = decode(b"\xEF\xBB\xBFa\r\nb\r\nc\n");
        assert_eq!(
            (t.kind, t.text.as_deref(), t.eol, t.bom),
            ("text", Some("a\nb\nc\n"), "crlf", true)
        );
        let t = decode(b"a\nb\n");
        assert_eq!((t.kind, t.eol, t.bom), ("text", "lf", false));
        assert_eq!(decode(b"PNG\0\x01").kind, "binary");
        assert_eq!(decode(&[0xff, 0xfe, 0x41]).kind, "binary");
        assert_eq!(decode(b"").text.as_deref(), Some(""));
        assert_eq!(decode(b"x\r\n").hash, hash(b"x\r\n"));
    }

    #[test]
    fn encodes_back_with_the_line_endings_and_bom_of_the_file() {
        assert_eq!(
            encode("a\nb\n", "crlf", true),
            b"\xEF\xBB\xBFa\r\nb\r\n".to_vec()
        );
        assert_eq!(encode("a\nb", "lf", false), b"a\nb".to_vec());
        // A stray CRLF typed or pasted in does not become CRCRLF.
        assert_eq!(encode("a\r\nb\n", "crlf", false), b"a\r\nb\r\n".to_vec());
    }

    #[test]
    fn reads_a_file_of_its_root_and_leaves_a_big_one_out() {
        let dir = test_dir("fsedit-read");
        std::fs::write(dir.join("a.ts"), "x\r\n").unwrap();
        let t = read(&dir, "a.ts").unwrap();
        assert_eq!((t.text.as_deref(), t.eol), (Some("x\n"), "crlf"));
        assert_eq!(t.hash, hash(b"x\r\n"));
        std::fs::write(
            dir.join("big.txt"),
            vec![b'a'; (MAX_EDIT_BYTES + 1) as usize],
        )
        .unwrap();
        let t = read(&dir, "big.txt").unwrap();
        assert_eq!((t.kind, t.text), ("tooLarge", None));
        assert_eq!(t.size, MAX_EDIT_BYTES + 1);
        let missing = read(&dir, "missing.ts").unwrap_err().to_string();
        assert!(missing.contains("introuvable"), "{missing}");
        assert!(read(&dir, "../x").is_err());
    }

    #[test]
    fn writes_atomically_keeping_crlf_and_refuses_a_file_changed_on_disk() {
        let dir = test_dir("fsedit-write");
        let p = dir.join("a.ts");
        std::fs::write(&p, "a\r\n").unwrap();
        let first = read(&dir, "a.ts").unwrap();
        let h = write(&dir, "a.ts", "a\nb\n", "crlf", false, Some(&first.hash)).unwrap();
        assert_eq!(std::fs::read(&p).unwrap(), b"a\r\nb\r\n");
        assert_eq!(h, hash(b"a\r\nb\r\n"));
        // Changed behind the editor's back: refused, unless forced.
        std::fs::write(&p, "agent\n").unwrap();
        let err = write(&dir, "a.ts", "mine\n", "lf", false, Some(&h)).unwrap_err();
        assert_eq!(err.to_string(), CHANGED);
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "agent\n");
        write(&dir, "a.ts", "mine\n", "lf", false, None).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "mine\n");
        // Deleted behind its back.
        let h = hash(b"mine\n");
        std::fs::remove_file(&p).unwrap();
        let err = write(&dir, "a.ts", "x\n", "lf", false, Some(&h)).unwrap_err();
        assert_eq!(err.to_string(), DELETED);
        // Forced: created again, parent folders included, no temporary file left behind.
        write(&dir, "new/deep/b.ts", "b\n", "lf", false, None).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("new/deep/b.ts")).unwrap(),
            "b\n"
        );
        let left: Vec<_> = std::fs::read_dir(dir.join("new/deep"))
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .collect();
        assert_eq!(left, vec![std::ffi::OsString::from("b.ts")]);
        assert!(write(&dir, "../escape.ts", "x", "lf", false, None).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn keeps_the_permissions_of_the_file() {
        use std::os::unix::fs::PermissionsExt;
        let dir = test_dir("fsedit-perms");
        let p = dir.join("run.sh");
        std::fs::write(&p, "echo a\n").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        write(&dir, "run.sh", "echo b\n", "lf", false, None).unwrap();
        assert_eq!(
            std::fs::metadata(&p).unwrap().permissions().mode() & 0o777,
            0o755
        );
    }

    #[test]
    fn refuses_rel_ending_with_dot() {
        let base = test_dir("fsedit-dot");
        let dir = base.join("root");
        std::fs::create_dir_all(&dir).unwrap();
        let before: std::collections::HashSet<_> = std::fs::read_dir(&base)
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .collect();

        for rel in [".", "./", ".//", "././", "sub/."] {
            let err = write(&dir, rel, "x", "lf", false, None).unwrap_err();
            assert!(err.to_string().contains("chemin invalide"), "{rel}: {err}");
            let err = read(&dir, rel).unwrap_err();
            assert!(err.to_string().contains("chemin invalide"), "{rel}: {err}");
        }

        // Verify nothing was created in base - same set of entries
        let after: std::collections::HashSet<_> = std::fs::read_dir(&base)
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .collect();
        assert_eq!(
            before, after,
            "nothing should be created in base, before {:?}, after {:?}",
            before, after
        );
    }

    #[test]
    fn refuses_read_only_file() {
        let dir = test_dir("fsedit-readonly");
        let p = dir.join("readonly.txt");
        std::fs::write(&p, "original\n").unwrap();
        let original_perms = std::fs::metadata(&p).unwrap().permissions();
        let mut perms = original_perms.clone();
        perms.set_readonly(true);
        std::fs::set_permissions(&p, perms).unwrap();
        let err = write(&dir, "readonly.txt", "new\n", "lf", false, None).unwrap_err();
        assert_eq!(err.to_string(), "readonly.txt est en lecture seule");
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "original\n");
        // Restore original permissions for test dir cleanup
        std::fs::set_permissions(&p, original_perms).unwrap();
    }

    #[test]
    fn saving_through_a_link_writes_its_target_and_keeps_the_link() {
        let dir = test_dir("fsedit-link");
        std::fs::write(dir.join("real.md"), "old\n").unwrap();
        if !crate::paths::make_file_link(&dir.join("real.md"), &dir.join("link.md")) {
            eprintln!("skipped: cannot create file links here");
            return;
        }
        write(&dir, "link.md", "new\n", "lf", false, None).unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("real.md")).unwrap(),
            "new\n"
        );
        assert!(std::fs::symlink_metadata(dir.join("link.md"))
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[test]
    fn saving_through_a_chain_of_links_writes_the_last_target() {
        let dir = test_dir("fsedit-link-chain");
        std::fs::write(dir.join("c.md"), "old\n").unwrap();
        let made = crate::paths::make_file_link(&dir.join("c.md"), &dir.join("b.md"))
            && crate::paths::make_file_link(&dir.join("b.md"), &dir.join("a.md"));
        if !made {
            eprintln!("skipped: cannot create file links here");
            return;
        }
        write(&dir, "a.md", "new\n", "lf", false, None).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("c.md")).unwrap(), "new\n");
        for l in ["a.md", "b.md"] {
            assert!(
                std::fs::symlink_metadata(dir.join(l))
                    .unwrap()
                    .file_type()
                    .is_symlink(),
                "{l}"
            );
        }
    }

    #[test]
    fn a_planted_link_at_the_temporary_name_is_neither_followed_nor_removed() {
        let base = test_dir("fsedit-planted");
        let root = base.join("root");
        let outside = base.join("outside");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let tmp = root.join(".a.txt.planted.escouade-tmp");
        if !crate::paths::make_dir_link(&outside, &tmp) {
            eprintln!("skipped: cannot create a directory link here");
            return;
        }
        assert!(write_via(&root.join("a.txt"), &tmp, b"x").is_err());
        assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 0);
        assert!(std::fs::symlink_metadata(&tmp).is_ok());
        assert!(!root.join("a.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_file_that_cannot_be_read_is_not_overwritten_by_a_guarded_save() {
        use std::os::unix::fs::PermissionsExt;
        if unsafe { libc::geteuid() } == 0 {
            eprintln!("skipped: root reads any file");
            return;
        }
        let dir = test_dir("fsedit-unreadable");
        let p = dir.join("secret.txt");
        std::fs::write(&p, "secret\n").unwrap();
        let h = hash(b"secret\n");
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o200)).unwrap();
        let err = write(&dir, "secret.txt", "mine\n", "lf", false, Some(&h));
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o644)).unwrap();
        let err = err.unwrap_err().to_string();
        assert!(
            err != CHANGED && err != DELETED && !err.contains("lecture seule"),
            "{err}"
        );
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "secret\n");
    }
}
