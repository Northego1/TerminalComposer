//! Scratch files for clipboard images.
//!
//! An image on the clipboard has no path, but every attachment must have one --
//! that is the whole contract with the target. So the bytes are written out
//! once and the path travels on from there.

use std::path::PathBuf;

use super::extension_for_mime;

pub fn write_image(bytes: &[u8], mime: &str) -> Result<PathBuf, String> {
    let dir = scratch_dir();
    // A pasted screenshot is the user's, and the fallback location is shared.
    crate::private::create_dir(&dir).map_err(|e| format!("failed to create {dir:?}: {e}"))?;

    let path = dir.join(format!(
        "paste-{}.{}",
        uuid::Uuid::new_v4(),
        extension_for_mime(mime)
    ));
    std::fs::write(&path, bytes).map_err(|e| format!("failed to write {path:?}: {e}"))?;
    Ok(path)
}

/// Drops last run's pasted images. Called once at startup.
pub fn clear_scratch() {
    let dir = scratch_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let _ = std::fs::remove_file(entry.path());
    }
}

fn scratch_dir() -> PathBuf {
    let base = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("terminal-composer")
}
