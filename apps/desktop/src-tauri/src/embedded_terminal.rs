// An in-app terminal: a real PTY (ConPTY on Windows) whose bytes are streamed
// to an xterm.js view in the main window, and whose stdin is fed from it. This
// is separate from terminal_channel, which launches and binds *external*
// terminal windows to pets. Here the shell lives entirely inside the app.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// Output bytes read off a session's PTY, tagged with the session id so the
/// frontend can route them to the right xterm instance.
pub(crate) const EMBEDDED_TERMINAL_DATA_EVENT: &str = "embedded-terminal-data";
/// Fired once when a session's shell exits (or its PTY closes).
pub(crate) const EMBEDDED_TERMINAL_EXIT_EVENT: &str = "embedded-terminal-exit";

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const READ_BUFFER_BYTES: usize = 4096;

static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

/// A live PTY. `master` is retained for resize; `writer` feeds stdin; `child`
/// is kept so the session can be killed on close. The reader lives in its own
/// thread and is not stored here.
struct TerminalSession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// Managed Tauri state: every open in-app terminal, keyed by session id.
#[derive(Default)]
pub(crate) struct EmbeddedTerminalSessions(Mutex<HashMap<String, TerminalSession>>);

#[derive(Clone, Serialize)]
struct TerminalDataPayload {
    id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct TerminalExitPayload {
    id: String,
}

/// The shell to spawn when the caller does not name one. Honors COMSPEC/SHELL
/// so it matches whatever the user's environment expects.
fn default_shell() -> String {
    if cfg!(windows) {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn is_blank(value: &Option<String>) -> bool {
    value.as_ref().map(|v| v.trim().is_empty()).unwrap_or(true)
}

/// Spawn a shell in a fresh PTY and start streaming its output. Returns the new
/// session id; the caller wires `terminal_write`/`terminal_resize`/
/// `terminal_close` to it and listens for `embedded-terminal-*` events.
#[tauri::command]
pub(crate) fn terminal_open(
    app: AppHandle,
    sessions: State<'_, EmbeddedTerminalSessions>,
    cwd: Option<String>,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(DEFAULT_ROWS).max(1),
            cols: cols.unwrap_or(DEFAULT_COLS).max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let program = if is_blank(&shell) {
        default_shell()
    } else {
        shell.unwrap()
    };
    let mut command = CommandBuilder::new(program);
    if !is_blank(&cwd) {
        command.cwd(cwd.unwrap());
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    // Drop the slave once the child owns it; otherwise our lingering handle
    // keeps the PTY open and the reader never sees EOF after the shell exits.
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;

    let id = format!("term-{}", NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed));

    let reader_app = app.clone();
    let reader_id = id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0u8; READ_BUFFER_BYTES];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    let _ = reader_app.emit(
                        EMBEDDED_TERMINAL_DATA_EVENT,
                        TerminalDataPayload {
                            id: reader_id.clone(),
                            data: buffer[..count].to_vec(),
                        },
                    );
                }
            }
        }
        let _ = reader_app.emit(
            EMBEDDED_TERMINAL_EXIT_EVENT,
            TerminalExitPayload {
                id: reader_id.clone(),
            },
        );
    });

    sessions
        .0
        .lock()
        .map_err(|_| "terminal session store is poisoned".to_string())?
        .insert(
            id.clone(),
            TerminalSession {
                writer,
                master: pair.master,
                child,
            },
        );

    Ok(id)
}

/// Feed keystrokes (already UTF-8 from xterm) into a session's shell.
#[tauri::command]
pub(crate) fn terminal_write(
    sessions: State<'_, EmbeddedTerminalSessions>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut store = sessions
        .0
        .lock()
        .map_err(|_| "terminal session store is poisoned".to_string())?;
    let session = store
        .get_mut(&id)
        .ok_or_else(|| "unknown terminal session".to_string())?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    session.writer.flush().map_err(|error| error.to_string())?;
    Ok(())
}

/// Resize a session's PTY so the shell reflows to the xterm viewport.
#[tauri::command]
pub(crate) fn terminal_resize(
    sessions: State<'_, EmbeddedTerminalSessions>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let store = sessions
        .0
        .lock()
        .map_err(|_| "terminal session store is poisoned".to_string())?;
    let session = store
        .get(&id)
        .ok_or_else(|| "unknown terminal session".to_string())?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Kill a session's shell and forget it. Idempotent: closing an unknown id is a
/// no-op so the frontend can call it freely on unmount.
#[tauri::command]
pub(crate) fn terminal_close(
    sessions: State<'_, EmbeddedTerminalSessions>,
    id: String,
) -> Result<(), String> {
    let removed = sessions
        .0
        .lock()
        .map_err(|_| "terminal session store is poisoned".to_string())?
        .remove(&id);
    if let Some(mut session) = removed {
        let _ = session.child.kill();
    }
    Ok(())
}
