//! Persisted application state.
//!
//! Two documents, written as JSON next to the app's config: `settings` (what
//! the user chose) and `workspace` (which terminals were open and what was
//! typed into them). The frontend owns their shape entirely -- Rust only knows
//! how to read and write a named document, which keeps the product's data model
//! out of the native layer.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Only these documents exist, which also keeps the key out of path traversal.
const DOCUMENTS: [&str; 2] = ["settings", "workspace"];

#[tauri::command]
pub fn state_read(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let path = document_path(&app, &key)?;
    match std::fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("failed to read {path:?}: {error}")),
    }
}

#[tauri::command]
pub fn state_write(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let path = document_path(&app, &key)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {parent:?}: {error}"))?;
    }
    // Write through a temporary file so a crash mid-write cannot leave a
    // half-written document behind.
    // The workspace holds the command history, which a shell keeps at 0600 --
    // this copy of it is worth the same.
    let temporary = path.with_extension("json.tmp");
    crate::private::write(&temporary, value)
        .map_err(|error| format!("failed to write {temporary:?}: {error}"))?;
    std::fs::rename(&temporary, &path)
        .map_err(|error| format!("failed to replace {path:?}: {error}"))
}

fn document_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if !DOCUMENTS.contains(&key) {
        return Err(format!("unknown state document: {key}"));
    }
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("no config directory: {error}"))?;
    Ok(directory.join(format!("{key}.json")))
}
