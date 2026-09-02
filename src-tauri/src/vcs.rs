//! Just enough git to name the current branch.
//!
//! Read straight from `.git`, without running `git`: the composer asks for this
//! on a timer, and spawning a process for it would be out of proportion.

use std::path::Path;

/// The branch checked out at `directory` or above it, if any.
pub fn branch_at(directory: &Path) -> Option<String> {
    let git = find_git_dir(directory)?;
    let head = std::fs::read_to_string(git.join("HEAD")).ok()?;
    let head = head.trim();

    if let Some(reference) = head.strip_prefix("ref: refs/heads/") {
        return Some(reference.to_string());
    }
    // Detached HEAD: the commit itself, shortened the way git shows it.
    if head.len() >= 7 && head.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(head[..7].to_string());
    }
    None
}

/// Walks up until a `.git` is found. Handles worktrees, where it is a file.
fn find_git_dir(from: &Path) -> Option<std::path::PathBuf> {
    for directory in from.ancestors() {
        let candidate = directory.join(".git");
        if candidate.is_dir() {
            return Some(candidate);
        }
        if candidate.is_file() {
            let contents = std::fs::read_to_string(&candidate).ok()?;
            let path = contents.trim().strip_prefix("gitdir: ")?;
            return Some(directory.join(path));
        }
    }
    None
}
