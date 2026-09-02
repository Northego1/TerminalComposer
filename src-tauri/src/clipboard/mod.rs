//! Reading attachments out of the system clipboard.
//!
//! Risk #1 from the spec: a webview's `clipboardData` never hands out real
//! paths for arbitrary files, so this has to happen natively. What the
//! clipboard actually offers decides what we get:
//!
//!   1. a list of file URIs  -> those files, as they are on disk;
//!   2. image bytes          -> written to a scratch file, so the target gets
//!                              a path like it would for any other attachment.
//!
//! Plain text is left alone -- the webview already pastes it correctly.

mod backend;
mod scratch;
mod uri;

use std::path::Path;

use serde::Serialize;

pub use scratch::clear_scratch;

/// MIME types that carry file paths, in the order we prefer them.
const FILE_LIST_TYPES: [&str; 2] = ["text/uri-list", "x-special/gnome-copied-files"];

/// Image types worth asking for, in the order we prefer them.
const IMAGE_TYPES: [&str; 4] = ["image/png", "image/webp", "image/jpeg", "image/gif"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestedFile {
    /// "image" or "file" -- matches the frontend's `Attachment` union.
    pub kind: &'static str,
    pub path: String,
    pub name: String,
    pub mime_type: Option<String>,
    pub size: Option<u64>,
}

#[tauri::command]
pub fn clipboard_read_attachments() -> Result<Vec<IngestedFile>, String> {
    if let Some((_, bytes)) = backend::read_first(&FILE_LIST_TYPES) {
        let files: Vec<IngestedFile> = uri::parse_uri_list(&bytes)
            .iter()
            .filter(|path| path.exists())
            .map(|path| describe(path))
            .collect();
        if !files.is_empty() {
            return Ok(files);
        }
    }

    if let Some((mime, bytes)) = backend::read_first(&IMAGE_TYPES) {
        let path = scratch::write_image(&bytes, &mime)?;
        return Ok(vec![describe(&path)]);
    }

    Ok(Vec::new())
}

/// Metadata for paths we already know -- used by drag & drop.
#[tauri::command]
pub fn file_info(paths: Vec<String>) -> Vec<IngestedFile> {
    paths
        .iter()
        .map(Path::new)
        .filter(|path| path.exists())
        .map(describe)
        .collect()
}

fn describe(path: &Path) -> IngestedFile {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = mime_for_extension(&extension);

    IngestedFile {
        kind: if mime.is_some_and(|m| m.starts_with("image/")) {
            "image"
        } else {
            "file"
        },
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned()),
        mime_type: mime.map(str::to_string),
        size: std::fs::metadata(path).ok().map(|meta| meta.len()),
    }
}

fn mime_for_extension(extension: &str) -> Option<&'static str> {
    Some(match extension {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => return None,
    })
}

/// Extension for a clipboard image MIME type.
fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_by_extension() {
        assert_eq!(describe(Path::new("/tmp/a.PNG")).kind, "image");
        assert_eq!(describe(Path::new("/tmp/build.log")).kind, "file");
    }
}
