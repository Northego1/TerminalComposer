//! Shell integration: getting the shell to report its own state.
//!
//! The terminal cannot tell whether a shell is waiting for a command or running
//! one -- the protocol has no such notion, and every attempt to infer it from
//! output is a guess. So we ask the shell instead: a few hooks make it emit
//! OSC 133 markers, which is an existing standard rather than an invention of
//! ours.
//!
//! The files are shipped inside the binary and written out at startup, and the
//! shell is pointed at them with `ZDOTDIR`. The user's own files are loaded from
//! there, so nothing in their home directory is touched.

use std::path::PathBuf;

const ZSHENV: &str = include_str!("../shell/zsh/.zshenv");
const ZPROFILE: &str = include_str!("../shell/zsh/.zprofile");
const ZSHRC: &str = include_str!("../shell/zsh/.zshrc");

/// Writes the integration out and returns the directory to use as `ZDOTDIR`.
pub fn prepare_zsh() -> Option<PathBuf> {
    let directory = integration_dir().join("zsh");
    std::fs::create_dir_all(&directory).ok()?;
    for (name, contents) in [
        (".zshenv", ZSHENV),
        (".zprofile", ZPROFILE),
        (".zshrc", ZSHRC),
    ] {
        std::fs::write(directory.join(name), contents).ok()?;
    }
    Some(directory)
}

/// The shells we know how to instrument.
pub fn is_supported(shell: &str) -> bool {
    matches!(shell_name(shell).as_deref(), Some("zsh"))
}

pub fn shell_name(shell: &str) -> Option<String> {
    std::path::Path::new(shell)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

fn integration_dir() -> PathBuf {
    std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("terminal-composer-shell")
}
