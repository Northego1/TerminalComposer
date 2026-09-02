//! Risk #6 from the spec: closing a terminal must take down the whole process
//! tree, not just the shell. Killing the shell's process group is not enough --
//! an interactive job like `claude` runs in its own foreground process group.
//! On Linux we instead sweep every process that belongs to the PTY *session*.

#[cfg(unix)]
pub fn terminate_session(leader_pid: u32) {
    signal_session(leader_pid, libc::SIGHUP);

    // Give well-behaved programs a moment to shut down, then insist.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        signal_session(leader_pid, libc::SIGKILL);
    });
}

#[cfg(not(unix))]
pub fn terminate_session(_leader_pid: u32) {}

#[cfg(unix)]
fn signal_session(sid: u32, signal: i32) {
    for pid in session_members(sid) {
        unsafe { libc::kill(pid as i32, signal) };
    }
    // Belt and braces: the leader's own process group.
    unsafe { libc::kill(-(sid as i32), signal) };
}

/// Every PID whose session id equals `sid`, read from `/proc`.
#[cfg(unix)]
fn session_members(sid: u32) -> Vec<u32> {
    let mut members = Vec::new();
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return members;
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(pid) = name.to_str().and_then(|n| n.parse::<u32>().ok()) else {
            continue;
        };
        let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
            continue;
        };
        // `comm` can contain spaces and parentheses, so the fields we want start
        // after the last ')': state, ppid, pgrp, session, ...
        let Some((_, after_comm)) = stat.rsplit_once(')') else {
            continue;
        };
        let session = after_comm
            .split_whitespace()
            .nth(3)
            .and_then(|f| f.parse::<u32>().ok());
        if session == Some(sid) {
            members.push(pid);
        }
    }

    members
}
