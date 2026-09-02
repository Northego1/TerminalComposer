//! Native layer of Terminal Composer.
//!
//! Everything in this crate is system plumbing: PTYs, processes, the filesystem
//! and native OS events. There is deliberately no UI or product logic here --
//! that all lives in the TypeScript frontend (see `src/` in the repository root).

mod agent;
mod clipboard;
mod pty;
mod shell;
mod state;
mod vcs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    clipboard::clear_scratch();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(pty::PtyRegistry::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            pty::pty_context,
            clipboard::clipboard_read_attachments,
            clipboard::file_info,
            state::state_read,
            state::state_write,
            agent::agent_hooks_installed,
            agent::agent_hooks_install,
            agent::agent_hooks_remove,
        ])
        .setup(|app| {
            // One reader for the whole app; sessions are told apart by the id
            // each hook reports.
            agent::listen(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Risk #6: never leave orphaned shells (or the interactive agents they
            // are running) behind when the app goes away.
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;
                app.state::<pty::PtyRegistry>().close_all();
            }
        });
}
