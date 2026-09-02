//! Reads PTY output and forwards it to the frontend in batches.
//!
//! Risk #3 from the spec: emitting one Tauri event per `read()` chunk melts the
//! UI on heavy output (`cat` of a big file, verbose build logs). Two threads per
//! session keep that under control: one blocks on `read()`, the other coalesces
//! chunks and flushes at most every `FLUSH_INTERVAL` (or as soon as
//! `FLUSH_BYTES` have piled up).

use std::io::Read;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

const FLUSH_INTERVAL: Duration = Duration::from_millis(8);
const FLUSH_BYTES: usize = 64 * 1024;
const READ_BUF: usize = 32 * 1024;
const IDLE_POLL: Duration = Duration::from_millis(250);

pub fn output_event(id: &str) -> String {
    format!("pty://output/{id}")
}

pub fn exit_event(id: &str) -> String {
    format!("pty://exit/{id}")
}

#[derive(Clone, Serialize)]
struct OutputPayload {
    data: String,
}

#[derive(Clone, Serialize)]
struct ExitPayload {
    code: Option<i32>,
}

enum Msg {
    Data(Vec<u8>),
    Eof,
}

pub fn start(app: AppHandle, id: String, mut reader: Box<dyn Read + Send>) {
    let (tx, rx) = mpsc::channel::<Msg>();

    thread::spawn(move || {
        let mut buf = vec![0u8; READ_BUF];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(Msg::Data(buf[..n].to_vec())).is_err() {
                        break;
                    }
                }
            }
        }
        let _ = tx.send(Msg::Eof);
    });

    thread::spawn(move || pump_loop(app, id, rx));
}

fn pump_loop(app: AppHandle, id: String, rx: Receiver<Msg>) {
    let output_event = output_event(&id);
    let mut pending: Vec<u8> = Vec::new();
    let mut carry: Vec<u8> = Vec::new();
    let mut deadline: Option<Instant> = None;

    loop {
        let timeout = match deadline {
            Some(at) => at.saturating_duration_since(Instant::now()),
            None => IDLE_POLL,
        };

        match rx.recv_timeout(timeout) {
            Ok(Msg::Data(chunk)) => {
                if pending.is_empty() {
                    deadline = Some(Instant::now() + FLUSH_INTERVAL);
                }
                pending.extend_from_slice(&chunk);
                if pending.len() >= FLUSH_BYTES {
                    flush(&app, &output_event, &mut pending, &mut carry);
                    deadline = None;
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if !pending.is_empty() {
                    flush(&app, &output_event, &mut pending, &mut carry);
                    deadline = None;
                }
            }
            Ok(Msg::Eof) | Err(RecvTimeoutError::Disconnected) => {
                flush(&app, &output_event, &mut pending, &mut carry);
                break;
            }
        }
    }

    let _ = app.emit(&exit_event(&id), ExitPayload { code: None });
}

fn flush(app: &AppHandle, event: &str, pending: &mut Vec<u8>, carry: &mut Vec<u8>) {
    if pending.is_empty() {
        return;
    }
    let mut bytes = std::mem::take(carry);
    bytes.append(pending);

    let (text, tail) = split_valid_utf8(&bytes);
    *carry = tail;
    if !text.is_empty() {
        let _ = app.emit(event, OutputPayload { data: text });
    }
}

/// Splits a byte batch into "valid UTF-8 we can send now" and "an incomplete
/// trailing sequence to prepend to the next batch". Without this, a multi-byte
/// character split across two `read()`s turns into mojibake.
fn split_valid_utf8(bytes: &[u8]) -> (String, Vec<u8>) {
    let mut out = String::with_capacity(bytes.len());
    let mut rest = bytes;

    loop {
        match std::str::from_utf8(rest) {
            Ok(text) => {
                out.push_str(text);
                return (out, Vec::new());
            }
            Err(err) => {
                let valid = err.valid_up_to();
                out.push_str(std::str::from_utf8(&rest[..valid]).unwrap_or_default());
                match err.error_len() {
                    // Truncated sequence at the very end: keep it for next time.
                    None => return (out, rest[valid..].to_vec()),
                    // Genuinely invalid bytes (binary output): replace and move on.
                    Some(len) => {
                        out.push('\u{FFFD}');
                        rest = &rest[valid + len..];
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::split_valid_utf8;

    #[test]
    fn keeps_incomplete_trailing_sequence() {
        let bytes = "привет".as_bytes();
        let (text, tail) = split_valid_utf8(&bytes[..bytes.len() - 1]);
        assert_eq!(text, "приве");
        assert_eq!(tail.len(), 1);
    }

    #[test]
    fn joins_a_split_character_across_batches() {
        let bytes = "é".as_bytes();
        let (first, tail) = split_valid_utf8(&bytes[..1]);
        assert_eq!(first, "");
        let mut joined = tail;
        joined.push(bytes[1]);
        let (second, tail) = split_valid_utf8(&joined);
        assert_eq!(second, "é");
        assert!(tail.is_empty());
    }

    #[test]
    fn replaces_invalid_bytes() {
        let (text, tail) = split_valid_utf8(&[b'a', 0xff, b'b']);
        assert_eq!(text, "a\u{FFFD}b");
        assert!(tail.is_empty());
    }
}
