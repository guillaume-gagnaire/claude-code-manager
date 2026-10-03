//! The embedded editor's access to files: a source's file list, reading and writing a file, and
//! the version a file is compared with.

use crate::paths::contained;
use anyhow::{anyhow, bail, Result};
use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

/// Validate that `rel` is a normal file path component (not `.`, `sub/.`, or empty).
fn validate_rel(rel: &str) -> Result<()> {
    if rel.is_empty() {
        bail!("chemin invalide : ");
    }
    if rel.ends_with("/.") || rel.ends_with("\\.") || rel == "." {
        bail!("chemin invalide : {rel}");
    }
    Ok(())
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
    let path = contained(root, rel)?;

    // Resolve symlinks, ensuring target is within root.
    #[cfg(unix)]
    let path = {
        if let Ok(meta) = std::fs::symlink_metadata(&path) {
            if meta.file_type().is_symlink() {
                let target = std::fs::read_link(&path)?;
                let canonical_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
                let resolved = if target.is_absolute() {
                    target
                } else {
                    path.parent()
                        .ok_or_else(|| anyhow!("chemin invalide : {rel}"))?
                        .join(&target)
                };
                let resolved_canonical = resolved.canonicalize()?;
                if !resolved_canonical.starts_with(&canonical_root) {
                    bail!("chemin hors du dossier : {rel}");
                }
                resolved
            } else {
                path
            }
        } else {
            path
        }
    };
    #[cfg(not(unix))]
    let path = path;

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

    // Use create_new to avoid following symlinks/junctions.
    let result = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)
        .and_then(|file| {
            use std::io::Write;
            let mut f = file;
            f.write_all(&bytes)?;
            Ok(())
        });

    match result {
        Ok(()) => {
            #[cfg(unix)]
            if let Ok(meta) = std::fs::metadata(&path) {
                let _ = std::fs::set_permissions(&tmp, meta.permissions());
            }
            if let Err(e) = std::fs::rename(&tmp, &path) {
                let _ = std::fs::remove_file(&tmp);
                return Err(e.into());
            }
        }
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(e.into());
        }
    }
    Ok(hash(&bytes))
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
        let dir = test_dir("fsedit-dot");
        let err = write(&dir, ".", "x", "lf", false, None).unwrap_err();
        assert!(err.to_string().contains("chemin invalide"), "{err}");
        let err = write(&dir, "sub/.", "x", "lf", false, None).unwrap_err();
        assert!(err.to_string().contains("chemin invalide"), "{err}");
        // Verify nothing was created in parent
        let parent = dir.parent().unwrap();
        let entries: Vec<_> = std::fs::read_dir(parent)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(".fsedit-dot"))
            .collect();
        assert!(entries.is_empty(), "nothing should be created in parent");
    }

    #[test]
    fn refuses_read_only_file() {
        let dir = test_dir("fsedit-readonly");
        let p = dir.join("readonly.txt");
        std::fs::write(&p, "original\n").unwrap();
        let mut perms = std::fs::metadata(&p).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&p, perms).unwrap();
        let err = write(&dir, "readonly.txt", "new\n", "lf", false, None).unwrap_err();
        assert_eq!(err.to_string(), "readonly.txt est en lecture seule");
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "original\n");
        // Cleanup: restore write permission for test dir cleanup
        let mut perms = std::fs::metadata(&p).unwrap().permissions();
        perms.set_readonly(false);
        std::fs::set_permissions(&p, perms).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn resolves_symlinked_files_and_keeps_link_intact() {
        use std::os::unix::fs::symlink;
        let dir = test_dir("fsedit-symlink");
        let target = dir.join("target.txt");
        let link = dir.join("link.txt");
        std::fs::write(&target, "target\n").unwrap();
        symlink(&target, &link).unwrap();
        write(&dir, "link.txt", "updated\n", "lf", false, None).unwrap();
        // Target was updated
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "updated\n");
        // Link still exists and is still a symlink
        let meta = std::fs::symlink_metadata(&link).unwrap();
        assert!(meta.file_type().is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlink_pointing_outside_root() {
        use std::os::unix::fs::symlink;
        let dir = test_dir("fsedit-symlink-escape");
        let outside = dir.parent().unwrap().join("outside.txt");
        std::fs::write(&outside, "outside\n").unwrap();
        let link = dir.join("link.txt");
        symlink(&outside, &link).unwrap();
        let err = write(&dir, "link.txt", "new\n", "lf", false, None).unwrap_err();
        assert!(
            err.to_string().contains("chemin hors du dossier"),
            "{}",
            err
        );
        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "outside\n");
    }

    #[test]
    fn temp_file_is_unique_and_not_predictable() {
        let dir = test_dir("fsedit-temp-unique");
        let p = dir.join("a.txt");
        std::fs::write(&p, "a\n").unwrap();
        write(&dir, "a.txt", "b\n", "lf", false, None).unwrap();
        // The old predictable temp file name should not exist
        let old_temp = dir.join(".a.txt.escouade-tmp");
        assert!(
            !old_temp.exists(),
            "old predictable temp name should not be used"
        );
        // Only the actual file should exist
        let entries: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .collect();
        assert_eq!(entries, vec![std::ffi::OsString::from("a.txt")]);
    }

    #[test]
    fn propagates_read_errors_when_expected_hash_provided() {
        let dir = test_dir("fsedit-read-error");
        // Create a file, then make it inaccessible by making parent read-only
        let p = dir.join("secret.txt");
        std::fs::write(&p, "secret\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&dir).unwrap().permissions();
            perms.set_mode(0o000);
            std::fs::set_permissions(&dir, perms).unwrap();
            let err = write(&dir, "secret.txt", "new\n", "lf", false, Some("fakehash"));
            let mut perms = std::fs::metadata(&dir).unwrap().permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&dir, perms).unwrap();
            // Should be a permission error, not DELETED
            assert!(err.is_err());
            assert!(!err.unwrap_err().to_string().contains("deleted"));
        }
    }
}
