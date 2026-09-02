//! PTY sessions: spawn, stream output, write input, resize, terminate.
//!
//! The frontend talks to this module through four commands and two events per
//! session (`pty://output/{id}`, `pty://exit/{id}`). That is the entire PTY
//! surface between TypeScript and Rust.

mod pump;
mod session;
mod terminate;

use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use session::{PtySession, SessionContext};

#[derive(Default)]
pub struct PtyRegistry {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyRegistry {
    fn with<T>(&self, id: &str, f: impl FnOnce(&mut PtySession) -> T) -> Result<T, String> {
        let mut sessions = self.sessions.lock().map_err(|_| "pty registry poisoned")?;
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| format!("unknown pty session: {id}"))?;
        Ok(f(session))
    }

    /// Where a session's shell is now, for resolving relative paths.
    pub fn session_cwd(&self, id: &str) -> Option<String> {
        self.with(id, |session| session.context().cwd).ok()
    }

    pub fn close_all(&self) {
        let Ok(mut sessions) = self.sessions.lock() else {
            return;
        };
        for (_, session) in sessions.drain() {
            session.close();
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnOptions {
    /// Working directory for the shell. Defaults to the user's home directory.
    pub cwd: Option<String>,
    /// Shell to run. Defaults to `$SHELL`.
    pub shell: Option<String>,
    /// Whether to load the shell integration that reports the shell's state.
    #[serde(default)]
    pub shell_integration: bool,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnResult {
    pub id: String,
    pub shell: String,
    pub cwd: String,
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    registry: State<'_, PtyRegistry>,
    options: SpawnOptions,
) -> Result<SpawnResult, String> {
    let session = PtySession::spawn(app, options)?;
    let result = SpawnResult {
        id: session.id.clone(),
        shell: session.shell.clone(),
        cwd: session.cwd.clone(),
    };
    registry
        .sessions
        .lock()
        .map_err(|_| "pty registry poisoned")?
        .insert(result.id.clone(), session);
    Ok(result)
}

#[tauri::command]
pub fn pty_write(registry: State<'_, PtyRegistry>, id: String, data: String) -> Result<(), String> {
    // The registry is let go before the write, which may block for as long as
    // the program on the other end refuses to read.
    let writer = registry.with(&id, |session| session.writer())?;
    let mut writer = writer.lock().map_err(|_| "pty writer poisoned")?;
    writer
        .write_all(data.as_bytes())
        .and_then(|()| writer.flush())
        .map_err(|e| format!("failed to write to pty: {e}"))
}

#[tauri::command]
pub fn pty_resize(
    registry: State<'_, PtyRegistry>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    registry.with(&id, |session| session.resize(cols, rows))?
}

/// Where the shell is and what is checked out there -- what the composer shows
/// next to its prompt.
#[tauri::command]
pub fn pty_context(
    registry: State<'_, PtyRegistry>,
    id: String,
) -> Result<SessionContext, String> {
    registry.with(&id, |session| session.context())
}

#[tauri::command]
pub fn pty_close(registry: State<'_, PtyRegistry>, id: String) -> Result<(), String> {
    let session = registry
        .sessions
        .lock()
        .map_err(|_| "pty registry poisoned")?
        .remove(&id);
    if let Some(session) = session {
        session.close();
    }
    Ok(())
}
