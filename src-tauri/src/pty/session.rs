use std::io::Write;
use std::sync::{Arc, Mutex};

use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use tauri::AppHandle;

use super::{pump, terminate, SpawnOptions};

pub struct PtySession {
    pub id: String,
    pub shell: String,
    pub cwd: String,
    master: Box<dyn MasterPty + Send>,
    /// Behind its own lock, so writing to one session does not hold the
    /// registry that every other session goes through.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Box<dyn Child + Send + Sync>,
    /// PID of the shell. `portable-pty` runs it through `setsid()`, so this PID
    /// is also the id of the PTY session -- which is what we terminate.
    pid: Option<u32>,
}

impl PtySession {
    pub fn spawn(app: AppHandle, options: SpawnOptions) -> Result<Self, String> {
        let shell = options
            .shell
            .clone()
            .filter(|shell| !shell.is_empty())
            .unwrap_or_else(user_shell);
        let cwd = options
            .cwd
            .filter(|c| !c.is_empty())
            .unwrap_or_else(home_dir);

        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(pty_size(options.cols, options.rows))
            .map_err(|e| format!("failed to open pty: {e}"))?;

        let id = uuid::Uuid::new_v4().to_string();
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let integrated = options.shell_integration && crate::shell::is_supported(&shell);
        if integrated {
            if let Some(zdotdir) = crate::shell::prepare_zsh() {
                // The shell reads our startup files, and they load the user's.
                cmd.env(
                    "TERMINAL_COMPOSER_USER_ZDOTDIR",
                    std::env::var("ZDOTDIR").unwrap_or_else(|_| home_dir()),
                );
                cmd.env("ZDOTDIR", zdotdir);
                cmd.env(
                    "TERMINAL_COMPOSER_COMMANDS",
                    crate::shell::commands_file(&id),
                );
            }
        }

        // Everything the shell starts inherits these, which is how an agent's
        // hook finds its way back to the right tab.
        cmd.env("TERMINAL_COMPOSER_SESSION", &id);
        cmd.env("TERMINAL_COMPOSER_EVENTS", crate::agent::events_pipe());

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("failed to spawn {shell}: {e}"))?;
        // The parent must not hold the slave end open, otherwise the reader
        // never sees EOF when the shell exits.
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("failed to read from pty: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("failed to write to pty: {e}"))?;
        let writer = Arc::new(Mutex::new(writer));

        let pid = child.process_id();
        crate::agent::log(&format!("spawn session={id} shell={shell} integration={integrated}"));
        pump::start(app, id.clone(), reader);

        Ok(Self {
            id,
            shell,
            cwd,
            master: pair.master,
            writer,
            child,
            pid,
        })
    }

    /// The end input is written to.
    ///
    /// Handed out rather than written through: a program that has stopped
    /// reading its input fills the pty buffer and the write blocks. Holding the
    /// registry for that long would stop every other terminal as well.
    pub fn writer(&self) -> Arc<Mutex<Box<dyn Write + Send>>> {
        self.writer.clone()
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(pty_size(cols, rows))
            .map_err(|e| format!("failed to resize pty: {e}"))
    }

    /// Where the shell is now and what is checked out there.
    ///
    /// The cwd comes from the shell's own `/proc` symlink, so it follows every
    /// `cd` -- guessing it from terminal output would only ever be a guess.
    pub fn context(&self) -> SessionContext {
        let cwd = self
            .pid
            .and_then(|pid| std::fs::read_link(format!("/proc/{pid}/cwd")).ok())
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_else(|| self.cwd.clone());
        let branch = crate::vcs::branch_at(std::path::Path::new(&cwd));

        SessionContext { cwd, branch }
    }

    pub fn close(mut self) {
        if let Some(pid) = self.pid {
            terminate::terminate_session(pid);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        // Dropping the master closes the fd, which makes the reader thread see
        // EOF and emit the exit event.
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionContext {
    pub cwd: String,
    pub branch: Option<String>,
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn user_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}
