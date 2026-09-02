//! Files and directories only this user should be able to read.
//!
//! Two of the things written here are worth no less protection than the files
//! they duplicate: the command history, which a shell keeps at `0600`, and the
//! shell integration, which the user's own shell executes. The runtime
//! directory already grants that, but it is not always where these land -- with
//! no `XDG_RUNTIME_DIR` the fallback is the shared temporary directory, where a
//! predictable path with default permissions is an invitation.

use std::io::Result;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::Path;

/// Creates a directory nobody else may enter.
pub fn create_dir(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
}

/// Writes a file nobody else may read, creating it with those permissions
/// rather than fixing them after the contents are already on disk.
pub fn write(path: &Path, contents: impl AsRef<[u8]>) -> Result<()> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(contents.as_ref())?;
    // An existing file keeps the mode it was created with, so say it again.
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}
