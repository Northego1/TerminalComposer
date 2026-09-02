//! Events from the agent running inside a terminal.
//!
//! A terminal cannot tell whether the program in it is working, done, or
//! waiting for an answer -- the protocol has no such notion. Claude Code can:
//! it runs hooks on its own lifecycle, which is a documented interface rather
//! than something scraped out of its output.
//!
//! Hooks are separate processes whose output Claude Code keeps, so the event
//! travels through a named pipe instead. A pipe rather than a socket because a
//! hook is a shell script: appending a line to a pipe needs nothing installed.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT: &str = "agent://event";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub session_id: String,
    /// The hook that fired: `UserPromptSubmit`, `Stop`, `Notification`, ...
    pub kind: String,
}

/// The pipe hooks write to. Passed to every shell we start.
pub fn events_pipe() -> PathBuf {
    std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("terminal-composer-shell")
        .join("events.fifo")
}

/// The script hooks are pointed at.
///
/// It lives with the application's configuration rather than in the runtime
/// directory: the entry in Claude Code's settings survives a reboot, and a
/// script that did not would leave it running a file that no longer exists.
pub fn hook_script(app: &AppHandle) -> Option<PathBuf> {
    let directory = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&directory).ok()?;
    let path = directory.join("report-event.sh");
    std::fs::write(&path, include_str!("../shell/agent/report-event.sh")).ok()?;
    set_executable(&path)?;
    Some(path)
}

/// Creates the pipe and starts reading it. One reader for the whole app.
pub fn listen(app: AppHandle) {
    // Kept current, so a script written by an older version is replaced.
    let _ = hook_script(&app);

    let Some(path) = create_pipe() else {
        return;
    };

    std::thread::spawn(move || {
        // Read *and* write, in one handle and in that order. Opening a pipe for
        // writing alone blocks until somebody opens it for reading, which is
        // nobody yet -- this thread. Read-write never blocks, and it also means
        // the reader never sees end-of-file between one hook and the next.
        let Ok(pipe) = std::fs::OpenOptions::new().read(true).write(true).open(&path) else {
            return;
        };

        for line in BufReader::new(pipe).lines().map_while(Result::ok) {
            log(&format!("event {line}"));
            let mut parts = line.split_whitespace();
            let (Some(session_id), Some(kind)) = (parts.next(), parts.next()) else {
                continue;
            };
            let _ = app.emit(
                EVENT,
                AgentEvent {
                    session_id: session_id.to_string(),
                    kind: kind.to_string(),
                },
            );
        }
    });
}

/// A record of what arrived and when.
///
/// Whether an agent reports something at all is outside our control, and
/// without a record the only way to find out is to guess. Kept next to the
/// pipe, in the runtime directory, so it goes away on its own.
pub fn log(line: &str) {
    use std::io::Write;
    let path = events_pipe().with_file_name("events.log");
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{seconds} {line}");
    }
}

fn create_pipe() -> Option<PathBuf> {
    let path = events_pipe();
    let parent = path.parent()?;
    crate::private::create_dir(parent).ok()?;
    // A pipe left over from a previous run is of no use to this one.
    let _ = std::fs::remove_file(&path);

    let name = std::ffi::CString::new(path.to_string_lossy().as_bytes()).ok()?;
    if unsafe { libc::mkfifo(name.as_ptr(), 0o600) } != 0 {
        return None;
    }
    Some(path)
}

fn set_executable(path: &std::path::Path) -> Option<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = std::fs::metadata(path).ok()?.permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions).ok()
}

// ---- installing the hooks into Claude Code's settings ----

/// The lifecycle events worth knowing about, and what each one means here.
const HOOKED_EVENTS: [&str; 4] = [
    "SessionStart",     // it is up and waiting for the first message
    "UserPromptSubmit", // the agent started working
    "Stop",             // it answered; the user's turn
    "Notification",     // it needs the user now
];

/// Whether a hook entry is one of ours.
///
/// Both halves are required: another tool may ship a script by the same name,
/// and ours always sits in this application's own directory.
fn is_ours(entry: &serde_json::Value) -> bool {
    let text = entry.to_string();
    text.contains("report-event.sh") && text.contains("terminal-composer")
}

fn settings_path() -> Option<PathBuf> {
    Some(PathBuf::from(std::env::var_os("HOME")?).join(".claude/settings.json"))
}

/// Whether our hooks are in Claude Code's settings **and point at the script we
/// would install now**.
///
/// Comparing the path rather than just looking for the name matters: an entry
/// left by an older version points somewhere that no longer exists, and treating
/// it as installed would leave it broken forever.
#[tauri::command]
pub fn agent_hooks_installed(app: AppHandle) -> bool {
    let Some(script) = hook_script(&app) else {
        return false;
    };
    let Some(settings) = settings_path().and_then(|p| std::fs::read_to_string(p).ok()) else {
        return false;
    };
    let script = script.to_string_lossy();
    HOOKED_EVENTS
        .iter()
        .all(|event| settings.contains(&format!("{script} {event}")))
}

/// Adds our hooks to Claude Code's settings, keeping a backup of the original.
///
/// This edits a file that belongs to another program, so it happens only when
/// the user asks for it, and never silently.
#[tauri::command]
pub fn agent_hooks_install(app: AppHandle) -> Result<(), String> {
    let path = settings_path().ok_or("no home directory")?;
    let script = hook_script(&app).ok_or("could not write the hook script")?;
    let script = script.to_string_lossy().into_owned();

    let existing = std::fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    let mut settings: serde_json::Value =
        serde_json::from_str(&existing).map_err(|e| format!("{path:?} is not valid JSON: {e}"))?;

    if !existing.trim().is_empty() && path.exists() {
        std::fs::write(path.with_extension("json.backup"), &existing)
            .map_err(|e| format!("failed to write the backup: {e}"))?;
    }

    let hooks = settings
        .as_object_mut()
        .ok_or("settings.json is not an object")?
        .entry("hooks")
        .or_insert_with(|| serde_json::json!({}));

    for event in HOOKED_EVENTS {
        let entry = serde_json::json!({
            "matcher": "",
            "hooks": [{ "type": "command", "command": format!("{script} {event}") }],
        });
        let list = hooks
            .as_object_mut()
            .ok_or("hooks is not an object")?
            .entry(event)
            .or_insert_with(|| serde_json::json!([]));
        let list = list.as_array_mut().ok_or("hook event is not a list")?;
        list.retain(|item| !is_ours(item));
        list.push(entry);
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&settings).unwrap() + "\n")
        .map_err(|e| format!("failed to write {path:?}: {e}"))
}

/// Removes them again, leaving everything else alone.
#[tauri::command]
pub fn agent_hooks_remove() -> Result<(), String> {
    let path = settings_path().ok_or("no home directory")?;
    let Ok(existing) = std::fs::read_to_string(&path) else {
        return Ok(());
    };
    let mut settings: serde_json::Value =
        serde_json::from_str(&existing).map_err(|e| format!("{path:?} is not valid JSON: {e}"))?;

    if let Some(hooks) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        for event in HOOKED_EVENTS {
            if let Some(list) = hooks.get_mut(event).and_then(|l| l.as_array_mut()) {
                list.retain(|item| !is_ours(item));
            }
        }
        hooks.retain(|_, value| !value.as_array().is_some_and(|list| list.is_empty()));
    }
    if settings
        .get("hooks")
        .and_then(|h| h.as_object())
        .is_some_and(|h| h.is_empty())
    {
        settings.as_object_mut().map(|s| s.remove("hooks"));
    }

    std::fs::write(&path, serde_json::to_string_pretty(&settings).unwrap() + "\n")
        .map_err(|e| format!("failed to write {path:?}: {e}"))
}
