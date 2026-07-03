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

/// Poll the foreground window until a foreign (not our process), visible,
/// non-minimised window other than `baseline` appears, or we time out. This is
/// the shared primitive for both auto-bind-after-launch and connect-mode.
#[cfg(target_os = "windows")]
fn poll_new_foreground_window(baseline: isize, timeout_ms: u64) -> Option<ForeignWindow> {
    use std::{thread::sleep, time::Duration};
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    let own_pid = unsafe { GetCurrentProcessId() };
    let step_ms = 120u64;
    let mut waited = 0u64;

    while waited <= timeout_ms {
        let fg = unsafe { GetForegroundWindow() };
        let fg_handle = fg as isize;
        if !fg.is_null()
            && fg_handle != baseline
            && unsafe { IsWindowVisible(fg) } != 0
            && unsafe { IsIconic(fg) } == 0
        {
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(fg, &mut pid) };
            if pid != own_pid {
                let mut buffer = [0u16; 256];
                let length =
                    unsafe { GetWindowTextW(fg, buffer.as_mut_ptr(), buffer.len() as i32) };
                let title = String::from_utf16_lossy(&buffer[..length.max(0) as usize]);
                return Some(ForeignWindow {
                    hwnd: fg_handle as i64,
                    title,
                });
            }
        }
        sleep(Duration::from_millis(step_ms));
        waited += step_ms;
    }
    None
}

/// Toggle a bound window's foreground state. If the window is already the active
/// foreground window it is minimized; otherwise it is restored and brought to the
/// front. Returns false when the window no longer exists so the caller can fall
/// back to starting a fresh session.
#[cfg(target_os = "windows")]
#[tauri::command]
pub(crate) fn focus_window(hwnd: i64) -> Result<bool, String> {
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindow,
        SetForegroundWindow, ShowWindow, SW_FORCEMINIMIZE, SW_RESTORE,
    };

    let hwnd = hwnd as *mut core::ffi::c_void;
    unsafe {
        if IsWindow(hwnd) == 0 {
            return Ok(false);
        }
        let foreground = GetForegroundWindow();
        // Already frontmost: minimize it. SW_FORCEMINIMIZE (not SW_MINIMIZE) is
        // required to minimize a window owned by another process/thread reliably;
        // a plain SW_MINIMIZE is a synchronous cross-thread call the foreign
        // message loop can ignore, which is why minimize appeared not to work.
        if IsIconic(hwnd) == 0 && foreground as isize == hwnd as isize {
            ShowWindow(hwnd, SW_FORCEMINIMIZE);
            return Ok(true);
        }
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        // AttachThreadInput dance because Windows blocks a bare
        // SetForegroundWindow from a process that is not the active one.
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
    // in the pet folder. ponytail: wt treats ';' as a tab delimiter, so a command
    // like `bash -lc "a; b"` may need the caller to escape it (`\;`).
    let spawned = Command::new("wt")
        .arg("-d")
        .arg(&cwd)
        .args(&tokens)
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

#[cfg(test)]
mod tests {
    use super::split_command_line;

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
    fn ignores_surrounding_whitespace() {
        assert_eq!(split_command_line("   claude   "), ["claude"]);
        assert!(split_command_line("   ").is_empty());
    }
}
