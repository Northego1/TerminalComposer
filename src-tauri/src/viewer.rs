//! Reading files for the viewer, and deciding which words in the terminal are
//! worth making clickable.
//!
//! Both answers come from the filesystem rather than from the shape of the
//! text: a word only becomes a link if a file of that name is actually there,
//! resolved against the shell's own working directory. Guessing from the text
//! alone would underline every word with a dot in it.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::pty::PtyRegistry;

/// Enough for a source file or a log worth reading; past this the viewer would
/// be a worse way to read it than the terminal.
const MAX_BYTES: usize = 2 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContents {
    pub path: String,
    pub name: String,
    /// "text", "image" or "binary" -- what the viewer can do with it.
    pub kind: &'static str,
    pub text: Option<String>,
    pub size: u64,
    /// The file was longer than we are willing to read.
    pub truncated: bool,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<FileContents, String> {
    let path = PathBuf::from(shellexpand_home(&path));
    let metadata = std::fs::metadata(&path).map_err(|e| format!("{path:?}: {e}"))?;
    if metadata.is_dir() {
        return Err(format!("{path:?} is a directory"));
    }

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let common = FileContents {
        path: path.to_string_lossy().into_owned(),
        name,
        kind: "binary",
        text: None,
        size: metadata.len(),
        truncated: false,
    };

    if is_image(&path) {
        return Ok(FileContents {
            kind: "image",
            ..common
        });
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("{path:?}: {e}"))?;
    let truncated = bytes.len() > MAX_BYTES;
    let slice = &bytes[..bytes.len().min(MAX_BYTES)];

    // A NUL byte is the usual sign that this is not text at all.
    if slice.contains(&0) {
        return Ok(common);
    }

    Ok(FileContents {
        kind: "text",
        text: Some(String::from_utf8_lossy(slice).into_owned()),
        truncated,
        ..common
    })
}

/// Which of these words name a file that exists, relative to the session's cwd.
///
/// Answered in one call for a whole line: a link provider asks about every
/// candidate on a line at once, and a round trip each would be wasteful.
#[tauri::command]
pub fn resolve_paths(
    registry: State<'_, PtyRegistry>,
    id: String,
    tokens: Vec<String>,
) -> Vec<Option<String>> {
    let cwd = registry.session_cwd(&id).unwrap_or_default();
    let base = Path::new(&cwd);

    tokens
        .iter()
        .map(|token| {
            let expanded = shellexpand_home(token);
            let candidate = Path::new(&expanded);
            let resolved = if candidate.is_absolute() {
                candidate.to_path_buf()
            } else {
                base.join(candidate)
            };
            resolved
                .is_file()
                .then(|| resolved.to_string_lossy().into_owned())
        })
        .collect()
}

/// Enough to fill a dropdown without walking a directory of thousands.
const COMPLETION_LIMIT: usize = 40;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathCompletion {
    /// What to show, and what replaces the typed token.
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// What could finish the path being typed, relative to the session's cwd.
#[tauri::command]
pub fn complete_path(
    registry: State<'_, PtyRegistry>,
    id: String,
    token: String,
) -> Vec<PathCompletion> {
    let cwd = registry.session_cwd(&id).unwrap_or_default();
    let (directory, prefix) = split_token(&cwd, &token);

    let Ok(entries) = std::fs::read_dir(&directory) else {
        return Vec::new();
    };

    let mut matches: Vec<PathCompletion> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.to_lowercase().starts_with(&prefix.to_lowercase()) {
                return None;
            }
            // Hidden entries only when they were asked for by name.
            if name.starts_with('.') && !prefix.starts_with('.') {
                return None;
            }
            Some(PathCompletion {
                is_dir: entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false),
                path: entry.path().to_string_lossy().into_owned(),
                name,
            })
        })
        .collect();

    // Directories first, then alphabetically: a directory is usually a step on
    // the way to what is actually being typed.
    matches.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));
    matches.truncate(COMPLETION_LIMIT);
    matches
}

/// What the session's shell can run, matching a prefix.
///
/// The list is written by the shell itself at its first prompt, because only it
/// knows its aliases and functions -- the part any list assembled elsewhere
/// would be missing.
#[tauri::command]
pub fn complete_command(id: String, prefix: String) -> Vec<String> {
    let Ok(contents) = std::fs::read_to_string(crate::shell::commands_file(&id)) else {
        return Vec::new();
    };

    let lower = prefix.to_lowercase();
    let mut names: Vec<String> = contents
        .lines()
        .filter(|name| !name.is_empty() && name.to_lowercase().starts_with(&lower))
        .map(str::to_string)
        .collect();
    names.sort();
    names.dedup();
    names.truncate(COMPLETION_LIMIT);
    names
}

/// Everything the session's shell can run.
///
/// The whole list at once, not a prefix at a time: highlighting asks about
/// every word as it is typed, and a round trip per keystroke would be absurd
/// for an answer that does not change.
#[tauri::command]
pub fn shell_commands(id: String) -> Vec<String> {
    std::fs::read_to_string(crate::shell::commands_file(&id))
        .map(|contents| {
            contents
                .lines()
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Splits a typed token into the directory to look in and the prefix to match.
fn split_token(cwd: &str, token: &str) -> (PathBuf, String) {
    let expanded = shellexpand_home(token);
    let (head, prefix) = match expanded.rsplit_once('/') {
        Some((head, prefix)) => (format!("{head}/"), prefix.to_string()),
        None => (String::new(), expanded),
    };

    let directory = if head.is_empty() {
        PathBuf::from(cwd)
    } else if head.starts_with('/') {
        PathBuf::from(&head)
    } else {
        Path::new(cwd).join(&head)
    };

    (directory, prefix)
}

fn shellexpand_home(path: &str) -> String {
    match path.strip_prefix("~") {
        Some(rest) => match std::env::var("HOME") {
            Ok(home) => format!("{home}{rest}"),
            Err(_) => path.to_string(),
        },
        None => path.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::split_token;
    use std::path::PathBuf;

    #[test]
    fn resolves_a_bare_prefix_against_the_working_directory() {
        let (directory, prefix) = split_token("/home/me", "pro");
        assert_eq!(directory, PathBuf::from("/home/me"));
        assert_eq!(prefix, "pro");
    }

    #[test]
    fn resolves_a_relative_path() {
        let (directory, prefix) = split_token("/home/me", "src/comp");
        assert_eq!(directory, PathBuf::from("/home/me/src/"));
        assert_eq!(prefix, "comp");
    }

    #[test]
    fn resolves_an_absolute_path() {
        let (directory, prefix) = split_token("/home/me", "/usr/lo");
        assert_eq!(directory, PathBuf::from("/usr/"));
        assert_eq!(prefix, "lo");
    }
}

fn is_image(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" | "avif"
    )
}
