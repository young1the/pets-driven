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

/// A terminal this machine has, offered as a starting point for the launch
/// template. `launch` is that template with the detected path already in it, so
/// picking one from the dropdown fills the field rather than selecting a mode.
#[derive(Clone, serde::Serialize)]
pub(crate) struct TerminalPreset {
    label: String,
    launch: String,
}

/// The placeholder a launch template puts the pet's folder in.
#[cfg(any(target_os = "windows", test))]
const CWD_PLACEHOLDER: &str = "{cwd}";

/// The placeholder a launch template puts the shell-and-agent line in. It
/// stands for several arguments (`cmd /k claude`), not one.
#[cfg(any(target_os = "windows", test))]
const COMMAND_PLACEHOLDER: &str = "{command}";

/// Resolve a launch template into the program to spawn and its arguments.
///
/// The template is the user's, not ours: this knows only the two placeholders,
/// so a terminal nobody here has heard of works by being typed into the
/// settings field. `{cwd}` becomes the folder, `{command}` expands to the
/// launch line's own tokens in place.
///
/// Returns `None` for a template that names no program, which is how "no
/// terminal configured" arrives.
#[cfg(any(target_os = "windows", test))]
fn resolve_launch_template(
    template: &str,
    cwd: &str,
    command: &[String],
) -> Option<(String, Vec<String>)> {
    let mut resolved: Vec<String> = Vec::new();

    for token in split_command_line(template) {
        if token == COMMAND_PLACEHOLDER {
            resolved.extend(command.iter().cloned());
            continue;
        }

        // Inside a larger token (`--cwd={cwd}`) the folder is substituted in
        // place; a bare `{cwd}` is the same substitution on the whole token.
        resolved.push(token.replace(CWD_PLACEHOLDER, cwd));
    }

    let (program, rest) = resolved.split_first()?;

    Some((program.clone(), rest.to_vec()))
}

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

/// Start a fresh agent session in `cwd` and auto-bind to the window it opens.
///
/// `launch` is the terminal launch template from settings, or empty for the
/// default: Windows Terminal when it is installed, otherwise the shell in a
/// console of its own — the behavior this app had before terminals were a
/// choice. Returns the launched window so the caller can bind it (None if it
/// did not surface in time — the terminal still opened, it just is not bound).
#[cfg(target_os = "windows")]
#[tauri::command]
pub(crate) fn start_session(
    cwd: String,
    command: String,
    launch: Option<String>,
) -> Result<Option<ForeignWindow>, String> {
    let line = match command.trim() {
        "" => DEFAULT_SESSION_COMMAND,
        trimmed => trimmed,
    };
    let mut tokens = split_command_line(line);
    if tokens.is_empty() {
        tokens = split_command_line(DEFAULT_SESSION_COMMAND);
    }

    let template = launch.as_deref().map(str::trim).unwrap_or_default();

    if template.is_empty() {
        return start_session_by_default(&cwd, &tokens);
    }

    // A template the user chose is not second-guessed: if it will not start,
    // that is the answer, because silently opening a bare console instead is a
    // session in the wrong terminal that looks like success.
    let (program, args) = resolve_launch_template(template, &cwd, &tokens)
        .ok_or_else(|| format!("The terminal command is empty: {template}"))?;

    spawn_and_bind(&program, &args, &cwd)
        .ok_or_else(|| format!("Could not start the terminal: {program}"))
}

/// With no terminal configured: Windows Terminal if it answers, otherwise the
/// shell itself in a console of its own.
#[cfg(target_os = "windows")]
fn start_session_by_default(cwd: &str, tokens: &[String]) -> Result<Option<ForeignWindow>, String> {
    let windows_terminal = format!("wt -d {CWD_PLACEHOLDER} {COMMAND_PLACEHOLDER}");

    if let Some((program, args)) = resolve_launch_template(&windows_terminal, cwd, tokens) {
        // wt splits on `;` even inside a quoted argument, so a launch line like
        // `bash -lc "claude; exec bash"` would open a second tab running
        // ` exec bash`. Escaping is wt's own quirk and stays with wt.
        let escaped: Vec<String> = args.iter().map(|arg| escape_wt_semicolons(arg)).collect();
        if let Some(window) = spawn_and_bind(&program, &escaped, cwd) {
            return Ok(window);
        }
    }

    let (program, args) = tokens.split_first().expect("a launch line has a program");

    spawn_and_bind(program, args, cwd).ok_or_else(|| "Could not open a terminal".to_string())
}

/// Spawn one launch line in `cwd`, then watch for the window it brings up.
/// `None` means the program never started; `Some(None)` that it started and no
/// new window surfaced in time.
#[cfg(target_os = "windows")]
fn spawn_and_bind(program: &str, args: &[String], cwd: &str) -> Option<Option<ForeignWindow>> {
    use std::process::Command;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let baseline = unsafe { GetForegroundWindow() } as isize;

    Command::new(program)
        // A terminal takes the folder as an argument, but a bare shell is
        // spawned into it — and setting it costs nothing for the ones that
        // take it as an argument too.
        .current_dir(cwd)
        .args(args)
        .spawn()
        .ok()?;

    Some(poll_new_foreground_window(baseline, 3000))
}

/// The terminals this machine has, as starting points for the launch template.
///
/// This is a convenience, not the feature: the template is an ordinary settings
/// field, so a terminal that is not listed here works by being typed in. That is
/// why each entry carries a whole command line rather than a mode this file
/// would have to understand.
#[tauri::command]
pub(crate) fn list_terminal_presets() -> Vec<TerminalPreset> {
    let mut presets: Vec<TerminalPreset> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let candidates: [(&str, &str, &str, Vec<String>); 2] = [
            (
                "Windows Terminal",
                "wt.exe",
                "{program} -d {cwd} {command}",
                // Installed as an app-execution alias rather than onto PATH for
                // every shell, so the alias folder is checked by name first.
                vec![format!(r"{local}\Microsoft\WindowsApps\wt.exe")],
            ),
            (
                "WezTerm",
                // Not `wezterm.exe`: that one is a console-subsystem CLI, so
                // spawning it from this GUI app opens a console window of its
                // own, which waits on the terminal and takes it down when
                // closed. `wezterm-gui.exe` takes the same `start` arguments
                // with no console.
                "wezterm-gui.exe",
                "{program} start --cwd {cwd} -- {command}",
                vec![
                    r"C:\Program Files\WezTerm\wezterm-gui.exe".to_string(),
                    format!(r"{local}\Programs\WezTerm\wezterm-gui.exe"),
                ],
            ),
        ];

        for (label, program, template, paths) in candidates {
            let found = paths
                .into_iter()
                .find(|path| std::path::Path::new(path).exists())
                // Not where it usually installs: take it off PATH, which is
                // where a scoop/winget/portable copy shows up.
                .or_else(|| find_on_path(program));

            if let Some(path) = found {
                presets.push(TerminalPreset {
                    label: label.to_string(),
                    launch: template.replace("{program}", &quote_if_spaced(&path)),
                });
            }
        }
    }

    presets
}

/// A path with spaces has to reach the template quoted, because the template is
/// split on whitespace like any other command line.
#[cfg(target_os = "windows")]
fn quote_if_spaced(path: &str) -> String {
    if path.contains(' ') {
        format!("\"{path}\"")
    } else {
        path.to_string()
    }
}

/// The first entry of `PATH` that holds `program`, if any.
#[cfg(target_os = "windows")]
fn find_on_path(program: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;

    std::env::split_paths(&path)
        .map(|dir| dir.join(program))
        .find(|candidate| candidate.exists())
        .map(|candidate| candidate.display().to_string())
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
    _launch: Option<String>,
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
    use super::{escape_wt_semicolons, resolve_launch_template, split_command_line};

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

    fn tokens(line: &str) -> Vec<String> {
        split_command_line(line)
    }

    /// The whole point of a template: a terminal this file has never heard of
    /// works because the user typed its command line, not because a match arm
    /// was added for it.
    #[test]
    fn resolves_a_template_for_any_terminal() {
        let line = tokens("cmd /k claude");

        assert_eq!(
            resolve_launch_template("wt -d {cwd} {command}", "D:/proj", &line),
            Some(("wt".to_string(), vec_of(["-d", "D:/proj", "cmd", "/k", "claude"])))
        );
        assert_eq!(
            resolve_launch_template("wezterm-gui start --cwd {cwd} -- {command}", "D:/proj", &line),
            Some((
                "wezterm-gui".to_string(),
                vec_of(["start", "--cwd", "D:/proj", "--", "cmd", "/k", "claude"])
            ))
        );
        assert_eq!(
            resolve_launch_template(
                "alacritty --working-directory {cwd} -e {command}",
                "D:/proj",
                &line
            ),
            Some((
                "alacritty".to_string(),
                vec_of(["--working-directory", "D:/proj", "-e", "cmd", "/k", "claude"])
            ))
        );
    }

    #[test]
    fn substitutes_the_folder_inside_a_longer_argument() {
        let resolved = resolve_launch_template("term --cwd={cwd} -e {command}", "D:/proj", &tokens("claude"));

        assert_eq!(
            resolved,
            Some(("term".to_string(), vec_of(["--cwd=D:/proj", "-e", "claude"])))
        );
    }

    #[test]
    fn keeps_a_quoted_program_path_whole() {
        let resolved = resolve_launch_template(
            r#""C:\Program Files\WezTerm\wezterm-gui.exe" start --cwd {cwd} -- {command}"#,
            "D:/proj",
            &tokens("claude"),
        );
        let (program, args) = resolved.expect("the template names a program");

        assert_eq!(program, r"C:\Program Files\WezTerm\wezterm-gui.exe");
        assert_eq!(args, ["start", "--cwd", "D:/proj", "--", "claude"]);
    }

    /// A template with no `{command}` still opens the terminal — some people
    /// want a plain shell in the folder — and one with no program at all is not
    /// a launch line.
    #[test]
    fn a_template_need_not_name_the_command_but_must_name_a_program() {
        assert_eq!(
            resolve_launch_template("wt -d {cwd}", "D:/proj", &tokens("claude")),
            Some(("wt".to_string(), vec_of(["-d", "D:/proj"])))
        );
        assert_eq!(resolve_launch_template("   ", "D:/proj", &tokens("claude")), None);
    }

    fn vec_of<const N: usize>(items: [&str; N]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }
}
