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
pub(crate) fn start_session(cwd: String) -> Result<Option<ForeignWindow>, String> {
    use std::process::Command;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let baseline = unsafe { GetForegroundWindow() } as isize;

    let spawned = Command::new("wt")
        .args(["-d", &cwd, "cmd", "/k", "claude"])
        .spawn()
        .is_ok()
        || Command::new("cmd")
            .args([
                "/c",
                "start",
                "cmd",
                "/k",
                &format!("cd /d \"{cwd}\" && claude"),
            ])
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
pub(crate) fn start_session(_cwd: String) -> Result<Option<ForeignWindow>, String> {
    Err("start_session is only implemented on Windows".to_string())
}
