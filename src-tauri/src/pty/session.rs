use std::io::Write;

use portable_pty::{Child, CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use tauri::AppHandle;

use super::{pump, terminate, SpawnOptions};

pub struct PtySession {
    pub id: String,
    pub shell: String,
    pub cwd: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
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

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

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

        let id = uuid::Uuid::new_v4().to_string();
        let pid = child.process_id();
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

    pub fn write(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.writer
            .write_all(bytes)
            .and_then(|_| self.writer.flush())
            .map_err(|e| format!("failed to write to pty: {e}"))
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(pty_size(cols, rows))
            .map_err(|e| format!("failed to resize pty: {e}"))
    }

    /// Where the shell is now, what is checked out there, and whether something
    /// is currently reading a secret.
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

        SessionContext {
            cwd,
            branch,
            secret_input: self.reads_secret(),
        }
    }

    /// Whether a program other than the shell has switched terminal echo off.
    ///
    /// That is what `sudo`, `ssh` and `git` do to read a password, and the
    /// kernel knows it because the program asked for it -- no guessing and no
    /// list of known programs. The shell's own line editor keeps echo off too,
    /// which is why this only counts when the terminal's foreground group is
    /// something the shell launched.
    fn reads_secret(&self) -> bool {
        let Some(shell) = self.pid else {
            return false;
        };
        let Some(foreground) = self.master.process_group_leader() else {
            return false;
        };
        if foreground as u32 == shell {
            return false;
        }
        self.master.as_raw_fd().is_some_and(|fd| echo_off(fd))
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
    /// A program is reading something it does not want echoed -- a password.
    pub secret_input: bool,
}

#[cfg(unix)]
fn echo_off(fd: std::os::fd::RawFd) -> bool {
    let mut termios: libc::termios = unsafe { std::mem::zeroed() };
    if unsafe { libc::tcgetattr(fd, &mut termios) } != 0 {
        return false;
    }
    termios.c_lflag & libc::ECHO == 0
}

#[cfg(not(unix))]
fn echo_off(_fd: std::os::fd::RawFd) -> bool {
    false
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
