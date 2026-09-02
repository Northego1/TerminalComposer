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

fn shellexpand_home(path: &str) -> String {
    match path.strip_prefix("~") {
        Some(rest) => match std::env::var("HOME") {
            Ok(home) => format!("{home}{rest}"),
            Err(_) => path.to_string(),
        },
        None => path.to_string(),
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
