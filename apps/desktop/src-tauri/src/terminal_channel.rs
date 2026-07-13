// A pet owns the window of the session it launched. Binding is by foreground:
// whatever foreign-process window the user brings up next (the launched
// terminal, or a window they click in "connect mode") is the bound window.
// Windows-only.

#[derive(serde::Serialize)]
pub(crate) struct ForeignWindow {
    // HWND carried as i64 so it round-trips through the JS bridge.
    hwnd: i64,
    title: String,
}

/// Default "Start new session" launch line. Mirrors the TS DEFAULT_SESSION_COMMAND.
#[cfg(any(target_os = "windows", test))]
const DEFAULT_SESSION_COMMAND: &str = "cmd /k claude";

/// Split a launch line into program + args, keeping double-quoted segments
/// (e.g. a shell path with spaces, or an inner `-lc "a b"`) together and
/// stripping the surrounding quotes. Backslashes are kept verbatim so Windows
/// paths survive.
#[cfg(any(target_os = "windows", test))]
fn split_command_line(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut has_token = false;

    for ch in line.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                has_token = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has_token {
                    tokens.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            c => {
                current.push(c);
                has_token = true;
            }
        }
    }
    if has_token {
        tokens.push(current);
    }

    tokens
}

/// wt treats `;` as a tab delimiter even when it arrives inside a quoted
/// argument (argv parsing strips the quotes before wt splits commands), so a
/// launch line like `bash -lc "claude; exec bash"` opens a second tab that
/// tries to run ` exec bash` and fails with 0x80070002. Escaping as `\;`
/// (wt's documented escape) makes wt pass the semicolon through to the shell.
/// Only the wt invocation needs this; a directly spawned shell must not see
/// the backslash.
#[cfg(any(target_os = "windows", test))]
fn escape_wt_semicolons(token: &str) -> String {
    token.replace(';', r"\;")
}

/// Build the bindable-window info for `hwnd`, or None when it is not a valid
/// binding target: null, the desktop shell, one of our own windows, invisible,
/// or minimised.
#[cfg(target_os = "windows")]
fn foreign_window_info(hwnd: *mut core::ffi::c_void) -> Option<ForeignWindow> {
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetShellWindow, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    if hwnd.is_null()
        || hwnd == unsafe { GetShellWindow() }
        || unsafe { IsWindowVisible(hwnd) } == 0
        || unsafe { IsIconic(hwnd) } != 0
    {
        return None;
    }

    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == unsafe { GetCurrentProcessId() } {
        return None;
    }

    let mut buffer = [0u16; 256];
    let length = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    Some(ForeignWindow {
        hwnd: hwnd as isize as i64,
        title: String::from_utf16_lossy(&buffer[..length.max(0) as usize]),
    })
}

/// Poll the foreground window until a foreign (not our process), visible,
/// non-minimised window other than `baseline` appears, or we time out. This is
/// the shared primitive for both auto-bind-after-launch and connect-mode.
#[cfg(target_os = "windows")]
fn poll_new_foreground_window(baseline: isize, timeout_ms: u64) -> Option<ForeignWindow> {
    use std::{thread::sleep, time::Duration};
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let step_ms = 120u64;
    let mut waited = 0u64;

    while waited <= timeout_ms {
        let fg = unsafe { GetForegroundWindow() };
        if fg as isize != baseline {
            if let Some(window) = foreign_window_info(fg) {
                return Some(window);
            }
        }
        sleep(Duration::from_millis(step_ms));
        waited += step_ms;
    }
    None
}

/// How long connect-mode waits for the user to pick a window.
#[cfg(target_os = "windows")]
const CONNECT_MODE_TIMEOUT_MS: u64 = 15_000;

/// Swallow the context-menu-dismiss click and the focus revert it causes
/// before arming connect-mode, so entering the mode cannot instantly bind
/// whichever window focus falls back to.
#[cfg(target_os = "windows")]
const CONNECT_MODE_GRACE_MS: u64 = 400;

/// Connect mode: wait for the user to pick an existing window and return it so
/// the caller can bind it as the pet's terminal. A pick is either a left click
/// on the window (works even when it is already foreground) or bringing it to
/// the foreground some other way (Alt-Tab, taskbar). Returns None when the
/// user cancels — Esc, or clicking something unbindable like the desktop or a
/// pets-driven window — or when nothing is picked before the timeout.
#[cfg(target_os = "windows")]
#[tauri::command]
pub(crate) fn connect_window(timeout_ms: Option<u64>) -> Result<Option<ForeignWindow>, String> {
    use std::{thread::sleep, time::Duration};
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_ESCAPE, VK_LBUTTON,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetAncestor, GetCursorPos, GetForegroundWindow, WindowFromPoint, GA_ROOT,
    };

    fn key_down(key: u16) -> bool {
        (unsafe { GetAsyncKeyState(key as i32) } as u16) & 0x8000 != 0
    }

    let timeout_ms = timeout_ms.unwrap_or(CONNECT_MODE_TIMEOUT_MS);
    let step_ms = 40u64;

    sleep(Duration::from_millis(CONNECT_MODE_GRACE_MS));
    let mut baseline = unsafe { GetForegroundWindow() } as isize;
    let mut button_was_down = key_down(VK_LBUTTON);

    let mut waited = 0u64;
    while waited <= timeout_ms {
        if key_down(VK_ESCAPE) {
            return Ok(None);
        }

        // A fresh left press picks the top-level window under the cursor. This
        // also covers the already-foreground window, which the foreground
        // watch below can never see change.
        let button_is_down = key_down(VK_LBUTTON);
        if button_is_down && !button_was_down {
            let mut point = POINT { x: 0, y: 0 };
            if unsafe { GetCursorPos(&mut point) } != 0 {
                let root = unsafe { GetAncestor(WindowFromPoint(point), GA_ROOT) };
                return Ok(foreign_window_info(root));
            }
        }
        button_was_down = button_is_down;

        let fg = unsafe { GetForegroundWindow() };
        if fg as isize != baseline {
            if let Some(window) = foreign_window_info(fg) {
                return Ok(Some(window));
            }
            // Focus moved to a non-bindable window (e.g. one of ours); track
            // it so a later move back out still reads as a fresh pick.
            baseline = fg as isize;
        }

        sleep(Duration::from_millis(step_ms));
        waited += step_ms;
    }
    Ok(None)
}

/// Bring a bound window to the foreground. Returns false when the window no
/// longer exists so the caller can fall back to starting a fresh session.
#[cfg(target_os = "windows")]
#[tauri::command]
pub(crate) fn focus_window(hwnd: i64) -> Result<bool, String> {
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindow,
        SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    let hwnd = hwnd as *mut core::ffi::c_void;
    unsafe {
        if IsWindow(hwnd) == 0 {
            return Ok(false);
        }
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        // AttachThreadInput dance because Windows blocks a bare
        // SetForegroundWindow from a process that is not the active one.
        let foreground = GetForegroundWindow();
        let our_thread = GetCurrentThreadId();
        let foreground_thread = GetWindowThreadProcessId(foreground, core::ptr::null_mut());
        let target_thread = GetWindowThreadProcessId(hwnd, core::ptr::null_mut());
        AttachThreadInput(our_thread, foreground_thread, 1);
        AttachThreadInput(target_thread, foreground_thread, 1);
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);
        AttachThreadInput(target_thread, foreground_thread, 0);
        AttachThreadInput(our_thread, foreground_thread, 0);
    }
    Ok(true)
}

/// Start a fresh Claude session in `cwd` and auto-bind to the window it opens.
/// Opens Windows Terminal when present, otherwise a plain console. Returns the
/// launched window so the caller can bind it (None if it did not surface in time
/// - the terminal still opened, it just is not bound).
#[cfg(target_os = "windows")]
#[tauri::command]
pub(crate) fn start_session(cwd: String, command: String) -> Result<Option<ForeignWindow>, String> {
    use std::process::Command;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let baseline = unsafe { GetForegroundWindow() } as isize;

    let line = match command.trim() {
        "" => DEFAULT_SESSION_COMMAND,
        trimmed => trimmed,
    };
    let mut tokens = split_command_line(line);
    if tokens.is_empty() {
        tokens = split_command_line(DEFAULT_SESSION_COMMAND);
    }
    let (program, rest) = tokens.split_first().expect("default line has a program");

    // Prefer Windows Terminal's tab UI; fall back to spawning the shell directly
    // in the pet folder.
    let wt_tokens: Vec<String> = tokens
        .iter()
        .map(|token| escape_wt_semicolons(token))
        .collect();
    let spawned = Command::new("wt")
        .arg("-d")
        .arg(&cwd)
        .args(&wt_tokens)
        .spawn()
        .is_ok()
        || Command::new(program)
            .args(rest)
            .current_dir(&cwd)
            .spawn()
            .is_ok();

    if !spawned {
        return Err("Could not open a terminal".to_string());
    }

    Ok(poll_new_foreground_window(baseline, 3000))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub(crate) fn focus_window(_hwnd: i64) -> Result<bool, String> {
    Err("Window focus is only implemented on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub(crate) fn start_session(
    _cwd: String,
    _command: String,
) -> Result<Option<ForeignWindow>, String> {
    Err("start_session is only implemented on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub(crate) fn connect_window(
    _timeout_ms: Option<u64>,
) -> Result<Option<ForeignWindow>, String> {
    Err("connect_window is only implemented on Windows".to_string())
}

#[cfg(test)]
mod tests {
    use super::{escape_wt_semicolons, split_command_line};

    #[test]
    fn splits_bare_tokens() {
        assert_eq!(split_command_line("cmd /k claude"), ["cmd", "/k", "claude"]);
    }

    #[test]
    fn keeps_quoted_path_and_inner_command_as_single_tokens() {
        assert_eq!(
            split_command_line(r#""C:\Program Files\Git\bin\bash.exe" -lc "claude; exec bash""#),
            [
                r"C:\Program Files\Git\bin\bash.exe",
                "-lc",
                "claude; exec bash",
            ]
        );
    }

    #[test]
    fn escapes_semicolons_for_wt() {
        assert_eq!(escape_wt_semicolons("claude; exec bash"), r"claude\; exec bash");
        assert_eq!(escape_wt_semicolons("claude"), "claude");
    }

    #[test]
    fn ignores_surrounding_whitespace() {
        assert_eq!(split_command_line("   claude   "), ["claude"]);
        assert!(split_command_line("   ").is_empty());
    }
}
