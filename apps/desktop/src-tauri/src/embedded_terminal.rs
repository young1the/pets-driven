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

/// A selectable shell for the in-app terminal. `path` is the executable the PTY
/// spawns; `label` is a friendly name for the dropdown.
#[derive(Clone, Serialize)]
pub(crate) struct TerminalShellOption {
    label: String,
    path: String,
}

/// De-duplicated push helper: keeps the first label seen for a given path.
fn push_shell(
    options: &mut Vec<TerminalShellOption>,
    seen: &mut std::collections::HashSet<String>,
    label: &str,
    path: String,
) {
    if path.trim().is_empty() {
        return;
    }
    if seen.insert(path.to_lowercase()) {
        options.push(TerminalShellOption {
            label: label.to_string(),
            path,
        });
    }
}

/// A friendly label for a shell path, falling back to its file name.
#[cfg(not(windows))]
fn shell_label(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// Enumerate the shells the user can pick for the in-app terminal. On Unix this
/// reads the system's `/etc/shells` (plus the current `$SHELL`); on Windows
/// there is no single system registry of terminals, so we probe well-known
/// install locations for the shells that are actually present.
#[tauri::command]
pub(crate) fn list_terminal_shells() -> Vec<TerminalShellOption> {
    let mut options: Vec<TerminalShellOption> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    #[cfg(windows)]
    {
        let comspec = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
        push_shell(&mut options, &mut seen, "Command Prompt", comspec);

        let system_root =
            std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());

        let powershell = format!(
            "{}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
            system_root
        );
        if std::path::Path::new(&powershell).exists() {
            push_shell(&mut options, &mut seen, "Windows PowerShell", powershell);
        }

        for pwsh in [
            "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
            "C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe",
        ] {
            if std::path::Path::new(pwsh).exists() {
                push_shell(&mut options, &mut seen, "PowerShell 7", pwsh.to_string());
            }
        }

        for bash in [
            "C:\\Program Files\\Git\\bin\\bash.exe",
            "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        ] {
            if std::path::Path::new(bash).exists() {
                push_shell(&mut options, &mut seen, "Git Bash", bash.to_string());
            }
        }

        let wsl = format!("{}\\System32\\wsl.exe", system_root);
        if std::path::Path::new(&wsl).exists() {
            push_shell(&mut options, &mut seen, "WSL", wsl);
        }
    }

    #[cfg(not(windows))]
    {
        if let Ok(contents) = std::fs::read_to_string("/etc/shells") {
            for line in contents.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if std::path::Path::new(trimmed).exists() {
                    let label = shell_label(trimmed);
                    push_shell(&mut options, &mut seen, &label, trimmed.to_string());
                }
            }
        }

        // Offer the user's current $SHELL even if it is not listed in /etc/shells.
        if let Ok(shell) = std::env::var("SHELL") {
            if std::path::Path::new(&shell).exists() {
                let label = shell_label(&shell);
                push_shell(&mut options, &mut seen, &label, shell);
            }
        }
    }

    options
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

/// Whether the shell is running something rather than sitting at its prompt.
///
/// Only the OS can answer this: the shell prints its prompt with the same bytes
/// it prints everything else, so watching the output stream is guesswork. On
/// Unix the tty knows which process group holds the foreground; Windows has no
/// such notion, so we look for a live child of the shell instead.
///
/// A "no" is the safe direction to be wrong in — it costs a confirmation the
/// user did not need, never a killed install — so an unknown session, a shell
/// without a pid, and a failed snapshot all report idle.
#[cfg(unix)]
fn shell_is_busy(session: &TerminalSession, shell_pid: u32) -> bool {
    match session.master.process_group_leader() {
        Some(leader) => leader as u32 != shell_pid,
        None => false,
    }
}

#[cfg(windows)]
fn shell_is_busy(_session: &TerminalSession, shell_pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
    };

    // ConPTY's own host process is parented to us, not to the shell, so it does
    // not show up here — anything that does is something the shell started.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return false;
        }

        let mut entry: PROCESSENTRY32 = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;
        let mut busy = false;
        let mut more = Process32First(snapshot, &mut entry);
        while more != 0 {
            if entry.th32ParentProcessID == shell_pid {
                busy = true;
                break;
            }
            more = Process32Next(snapshot, &mut entry);
        }

        CloseHandle(snapshot);
        busy
    }
}

/// Report whether a session's shell is busy, so the frontend can tell a close
/// that costs nothing from one that interrupts a running command.
#[tauri::command]
pub(crate) fn terminal_is_busy(
    sessions: State<'_, EmbeddedTerminalSessions>,
    id: String,
) -> Result<bool, String> {
    let store = sessions
        .0
        .lock()
        .map_err(|_| "terminal session store is poisoned".to_string())?;
    let Some(session) = store.get(&id) else {
        return Ok(false);
    };
    let Some(shell_pid) = session.child.process_id() else {
        return Ok(false);
    };
    Ok(shell_is_busy(session, shell_pid))
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
