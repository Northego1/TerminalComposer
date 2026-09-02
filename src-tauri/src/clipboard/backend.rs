//! Where clipboard bytes actually come from.
//!
//! Risk #2 from the spec: Wayland and X11 behave differently, and on Wayland it
//! also depends on the compositor. `wl-clipboard-rs` needs the data-control
//! protocol, which wlroots compositors implement but GNOME/Mutter (as shipped
//! in Ubuntu 24.04) does not. Under GNOME the X11 path still works, because
//! XWayland is running and the session bridges both clipboards -- so we try
//! Wayland first and fall back rather than picking one by session type.

use std::io::Read;
use std::time::Duration;

const X11_TIMEOUT: Duration = Duration::from_millis(500);

/// Reads the first of `mimes` the clipboard is willing to provide.
pub fn read_first(mimes: &[&str]) -> Option<(String, Vec<u8>)> {
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        if let Some(found) = read_first_wayland(mimes) {
            return Some(found);
        }
    }
    read_first_x11(mimes)
}

fn read_first_wayland(mimes: &[&str]) -> Option<(String, Vec<u8>)> {
    use wl_clipboard_rs::paste::{get_contents, ClipboardType, MimeType, Seat};

    for mime in mimes {
        let Ok((mut reader, _)) = get_contents(
            ClipboardType::Regular,
            Seat::Unspecified,
            MimeType::Specific(mime),
        ) else {
            continue;
        };
        let mut bytes = Vec::new();
        if reader.read_to_end(&mut bytes).is_ok() && !bytes.is_empty() {
            return Some(((*mime).to_string(), bytes));
        }
    }
    None
}

fn read_first_x11(mimes: &[&str]) -> Option<(String, Vec<u8>)> {
    let clipboard = x11_clipboard::Clipboard::new().ok()?;
    let atoms = &clipboard.getter.atoms;

    for mime in mimes {
        let Ok(target) = clipboard.getter.get_atom(mime) else {
            continue;
        };
        let Ok(bytes) = clipboard.load(atoms.clipboard, target, atoms.property, X11_TIMEOUT)
        else {
            continue;
        };
        if !bytes.is_empty() {
            return Some(((*mime).to_string(), bytes));
        }
    }
    None
}
